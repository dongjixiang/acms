// ACMS Image Tools Service (v0.66 PR1)
// 文生图 / 图生图核心逻辑（不依赖 requirement，可独立调用）
//
// 之前 image-gen.js 的 runAssistJobCore 强绑 requirementId（必须在 chat 流里用）。
// 本模块把"调 Agnes API → 并行 N 候选 → 下载 → 保存到 workspace/assets"抽出来，
// 让 image-editor 等前端工具能直接 POST 调。
//
// 调用：
//   coreGenerate({
//     prompt: '改成夜景',
//     referenceImage: 'data:image/png;base64,...',  // 可选；图生图时传
//     n: 4,           // 1-6 默认 4
//     size: '1024x1024',  // 或 '1024x1792' / '1792x1024'
//     projectSlug: 'acms', // workspace 子目录
//     grounding: null,     // 预留：grounded overlay（目前不实现）
//   })
//
// 返回：
//   { ok, prompt, options: [{image_url_output, asset_path, mime, size}], picked_idx, file_ids }
//
// 错误：
//   { ok: false, error: 'NO_PROMPT' | 'AGNES_API_KEY_NOT_CONFIGURED' | 'all_n_calls_failed: ...' | ... }

const path = require('path');
const fs = require('fs');
// v0.XX: 代理 Phase 1 — 统一出站 fetch
const { proxyFetch: fetch } = require('./proxy-fetch');
const crypto = require('crypto');
const config = require('../config');

const WORKSPACE_ROOT = config.workspaceRoot;

// ── 内部 helper（与 image-gen.js 同源，独立副本以解耦 requirement 依赖）──

function getAgnesApiKey() {
  if (config.agnesApiKey) return config.agnesApiKey;
  if (process.env.AGNES_API_KEY) return process.env.AGNES_API_KEY;
  try {
    const { collection } = require('../db/connection');
    const cfg = collection('system_configs').findOne(c => c.key === 'agnes_api_key');
    if (cfg && cfg.value) return cfg.value;
  } catch (e) { /* ignore */ }
  return '';
}

function inferExtFromMime(mime) {
  var m = (mime || 'image/png').toLowerCase();
  if (m.indexOf('jpeg') >= 0 || m.indexOf('jpg') >= 0) return '.jpg';
  if (m.indexOf('webp') >= 0) return '.webp';
  return '.png';
}

function safeFileNamePart(s) {
  return (s || 'img').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').substring(0, 40);
}

function saveImageAsset(projectSlug, buffer, ext, mime, metadata) {
  var dateStr = new Date().toISOString().split('T')[0];
  var hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 8);
  var assetsDir = path.join(WORKSPACE_ROOT, projectSlug, 'assets', dateStr);
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
  var fileName = safeFileNamePart(metadata.prompt) + '_' + hash + ext;
  var absPath = path.join(assetsDir, fileName);
  fs.writeFileSync(absPath, buffer);
  // 路径用正斜杠存（与现有 image-gen.js 行为一致）
  return {
    absPath: absPath,
    relPath: path.posix.join(projectSlug, 'assets', dateStr, fileName),
    fileName: fileName,
    mime: mime,
    size: buffer.length,
  };
}

async function callAgnesImageOnce(apiKey, body, timeoutMs, attempt) {
  attempt = attempt || 1;
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 60000);
  try {
    var resp = await fetch('https://api.agnes-ai.cn/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      var errBody = '';
      try { errBody = await resp.text(); } catch(e) {}
      var parsed;
      try { parsed = JSON.parse(errBody); } catch(e) {}
      var detail = (parsed && (parsed.error && parsed.error.message)) || (parsed && parsed.error) || errBody;
      // 5xx 或队列满：重试最多 2 次
      if (resp.status >= 500 && attempt < 3) {
        await new Promise(function(r) { setTimeout(r, 1000 * attempt); });
        return callAgnesImageOnce(apiKey, body, timeoutMs, attempt + 1);
      }
      return { ok: false, error: 'HTTP_' + resp.status + ': ' + String(detail).slice(0, 200) };
    }
    var data = await resp.json();
    var url = data && data.data && data.data[0] && (data.data[0].url || data.data[0].b64_json);
    if (!url) return { ok: false, error: 'NO_URL_IN_RESPONSE' };
    return { ok: true, url: url };
  } catch (e) {
    clearTimeout(timer);
    // 超时或网络错误：重试最多 2 次
    if (attempt < 3) {
      await new Promise(function(r) { setTimeout(r, 1000 * attempt); });
      return callAgnesImageOnce(apiKey, body, timeoutMs, attempt + 1);
    }
    return { ok: false, error: e.name === 'AbortError' ? 'TIMEOUT' : e.message };
  }
}

async function downloadAndSaveOne(apiKey, projectSlug, url, metadata) {
  try {
    // 如果返回的是 base64 data URL，直接解码保存，无需 fetch
    if (url && url.startsWith('data:')) {
      var matches = url.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        var mime = matches[1];
        var buf = Buffer.from(matches[2], 'base64');
        var ext = inferExtFromMime(mime);
        return { ok: true, url: url, asset_path: saveImageAsset(projectSlug, buf, ext, mime, metadata).relPath, mime: mime, size: buf.length };
      }
    }
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 120000);
    var resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) return { ok: false, error: 'download_http_' + resp.status };
    var buf = Buffer.from(await resp.arrayBuffer());
    var mime = resp.headers.get('content-type') || 'image/png';
    var ext = inferExtFromMime(mime);
    var saved = saveImageAsset(projectSlug, buf, ext, mime, metadata);
    return {
      ok: true,
      url: url,
      asset_path: saved.relPath,
      abs_path: saved.absPath,
      mime: mime,
      size: saved.size,
      file_name: saved.fileName,
    };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'DOWNLOAD_TIMEOUT' : e.message };
  }
}

// ── 主入口：coreGenerate ──
async function coreGenerate(opts) {
  var prompt = (opts.prompt || '').trim();
  var referenceImage = (opts.referenceImage || '').trim(); // data:image/...;base64,...
  var size = opts.size || '1024x1024';
  var n = Math.max(1, Math.min(6, parseInt(opts.n) || 4)); // v0.66 默认 4 候选（PR1 决策）
  var projectSlug = opts.projectSlug || 'image-tools'; // 独立调用时默认目录

  if (!prompt) return { ok: false, error: 'NO_PROMPT', prompt: '' };

  var apiKey = getAgnesApiKey();
  if (!apiKey) return { ok: false, error: 'AGNES_API_KEY_NOT_CONFIGURED', prompt };

  var body = {
    model: 'agnes-image-2.0-flash',
    prompt: prompt,
    size: size,
    extra_body: { response_format: 'url' },
  };
  if (referenceImage) {
    // Agnes API: image 是顶层参数（string[]），不在 extra_body 里
    body.image = [referenceImage];
  }

  // 并行调 N 次（agnes-image-2.0-flash 不支持 n>1）
  var callResults = await Promise.all(
    Array.from({ length: n }, function () { return callAgnesImageOnce(apiKey, body, 120000); })
  );
  var successUrls = callResults.filter(function (r) { return r.ok; }).map(function (r) { return r.url; });
  if (successUrls.length === 0) {
    var err = callResults.map(function (r) { return r.error; }).join('; ');
    return { ok: false, error: 'all_n_calls_failed: ' + err.slice(0, 300), prompt };
  }

  // 并行下载 + 保存
  var downloadResults = await Promise.all(
    successUrls.map(function (url) { return downloadAndSaveOne(apiKey, projectSlug, url, { prompt: prompt }); })
  );
  var saved = downloadResults.filter(function (r) { return r.ok; });
  if (saved.length === 0) {
    var err2 = downloadResults.map(function (r) { return r.error; }).join('; ');
    return { ok: false, error: 'download_all_failed: ' + err2.slice(0, 300), prompt };
  }

  // 构造返回值
  var options = saved.map(function (r) {
    return {
      image_url_output: r.url,
      asset_path: r.asset_path,
      workspace_path: r.asset_path,
      mime: r.mime,
      size: r.size,
    };
  });

  return {
    ok: true,
    prompt: prompt,
    size: size,
    n: options.length,
    options: options,
    picked_idx: 0,
    project_slug: projectSlug,
    generated_at: new Date().toISOString(),
    // 兼容现有 image-gen.js 返回（plan_executor 等可能用到 file_ids）
    file_ids: [],
  };
}

module.exports = {
  coreGenerate: coreGenerate,
  // 暴露内部 helper 给测试用
  _saveImageAsset: saveImageAsset,
  _inferExtFromMime: inferExtFromMime,
  _safeFileNamePart: safeFileNamePart,
};