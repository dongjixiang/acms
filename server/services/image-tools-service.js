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

// v0.77: Node fetch / undici 跟 platform-outputs.agnes-ai.space 的 CDN TLS 握手不兼容
//   （本地 Windows ECONNRESET "before secure TLS connection was established"）
//   改用 curl 子进程 + --http1.1（Windows Schannel 才能握手成功）
//   v0.22.22 在 image-gen.js 已踩过同坑，v0.66 PR1 抽取时漏传
async function downloadAndSaveOne(apiKey, projectSlug, url, metadata) {
  var execFile = require('child_process').execFile;
  var fs = require('fs');
  return new Promise(function(resolve) {
    // 如果返回的是 base64 data URL，直接解码保存，无需 fetch
    if (url && url.startsWith('data:')) {
      var matches = url.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        var mime = matches[1];
        var buf = Buffer.from(matches[2], 'base64');
        var ext = inferExtFromMime(mime);
        return resolve({ ok: true, url: url, asset_path: saveImageAsset(projectSlug, buf, ext, mime, metadata).relPath, mime: mime, size: buf.length });
      }
    }
    var tmpFile = path.join(require('os').tmpdir(), 'acms-dl-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
    // 与 image-gen.js 保持一致：--http1.1 + connect-timeout 10s + max-time 120s
    execFile('curl', [
      '-sk',
      '--http1.1',
      '--connect-timeout', '10',
      '--max-time', '120',
      '-o', tmpFile,
      url,
    ], function(err, stdout, stderr) {
      if (err) {
        try { fs.unlinkSync(tmpFile); } catch (e) {}
        return resolve({ ok: false, error: 'curl failed: ' + err.message + ' | stderr: ' + (stderr || '').slice(0, 200) });
      }
      try {
        var buffer = fs.readFileSync(tmpFile);
        fs.unlinkSync(tmpFile);
        if (buffer.length === 0) return resolve({ ok: false, error: 'curl returned empty body' });
        // magic bytes 推测 mime（避免依赖服务端 content-type header）
        var ext, mime;
        if (buffer[0] === 0xff && buffer[1] === 0xd8) { ext = '.jpg'; mime = 'image/jpeg'; }
        else if (buffer[0] === 0x89 && buffer[1] === 0x50) { ext = '.png'; mime = 'image/png'; }
        else if (buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') { ext = '.webp'; mime = 'image/webp'; }
        else { ext = '.png'; mime = 'image/png'; }
        var saved = saveImageAsset(projectSlug, buffer, ext, mime, metadata);
        return resolve({
          ok: true, url: url, asset_path: saved.relPath, mime: mime, size: saved.size,
          file_name: saved.fileName, abs_path: saved.absPath,
        });
      } catch (e) {
        try { fs.unlinkSync(tmpFile); } catch (e2) {}
        return resolve({ ok: false, error: e.message });
      }
    });
  });
}

// v0.77: 按 target 宽高自动选 Agnes ratio + size 档位
//   官方文档 ratio 档位: 1:1 / 3:4 / 4:3 / 3:2 / 2:3 / 16:9 / 9:16 / 21:9
//   size 档位: 1K (~1MP) / 2K (~2MP) / 3K (~4MP) / 4K (>4MP)
var AGNES_RATIOS = [
  ['1:1',  1.0    ],
  ['3:4',  0.75   ],
  ['4:3',  1.333  ],
  ['3:2',  1.5    ],
  ['2:3',  0.667  ],
  ['16:9', 1.778  ],
  ['9:16', 0.5625 ],
  ['21:9', 2.333  ],
];
function pickAgnesRatio(w, h) {
  if (!w || !h) return null;
  var target = w / h;
  var best = AGNES_RATIOS[0];
  var bestDiff = Math.abs(target - best[1]);
  for (var i = 1; i < AGNES_RATIOS.length; i++) {
    var d = Math.abs(target - AGNES_RATIOS[i][1]);
    if (d < bestDiff) { best = AGNES_RATIOS[i]; bestDiff = d; }
  }
  return best[0];
}
function pickAgnesSize(w, h) {
  if (!w || !h) return null;
  var pixels = w * h;
  if (pixels <= 1024 * 1024) return '1K';
  if (pixels <= 2 * 1024 * 1024) return '2K';
  if (pixels <= 4 * 1024 * 1024) return '3K';
  return '4K';
}

// ── 主入口：coreGenerate ──
async function coreGenerate(opts) {
  var prompt = (opts.prompt || '').trim();
  var referenceImage = (opts.referenceImage || '').trim(); // data:image/...;base64,...
  var size = opts.size || '1024x1024';
  var n = Math.max(1, Math.min(6, parseInt(opts.n) || 4)); // v0.66 默认 4 候选（PR1 决策）
  var projectSlug = opts.projectSlug || 'image-tools'; // 独立调用时默认目录
  // v0.77: 优先用调用方传的 targetWidth/targetHeight 自动选 ratio + size
  //   1) 都没传 → 走默认 size（向后兼容）
  //   2) 只传了 target* → 按 target 算 ratio + size（实现"尺寸对齐原图"）
  //   3) 同时传了 size 和 target* → size 优先（用户显式指定），但 ratio 仍按 target* 算
  var autoRatio = pickAgnesRatio(opts.targetWidth, opts.targetHeight);
  if (!opts.size && opts.targetWidth && opts.targetHeight) {
    var autoSize = pickAgnesSize(opts.targetWidth, opts.targetHeight);
    if (autoSize) size = autoSize;
  }

  if (!prompt) return { ok: false, error: 'NO_PROMPT', prompt: '' };

  var apiKey = getAgnesApiKey();
  if (!apiKey) return { ok: false, error: 'AGNES_API_KEY_NOT_CONFIGURED', prompt };

  var body = {
  // v0.XX: agnes-image-2.0-flash → agnes-image-2.1-flash（中文站）
    model: 'agnes-image-2.1-flash',
    prompt: prompt,
    size: size,
    extra_body: { response_format: 'url' },
  };
  if (autoRatio) {
    // v0.77: 按 target 宽高自动算 ratio，让输出比例 = 原图比例
    body.ratio = autoRatio;
  }
  if (referenceImage) {
    // Agnes Image 2.1 Flash 图生图：image 必须在 extra_body.image 内（顶层会被忽略 → 退化为 t2i）
    // 官方文档: https://www.agnes-ai.cn/zh-Hans/docs/agnes-image-21-flash
    //   "图生图请求需要在 extra_body.image 中提供输入图像"（"故障排除" 段亦明示）
    // 历史: v0.66 PR1 正确；commit efeaaea(2026-07-27) 误改为顶层，致 7/27 后图生图退化为文生图
    // 验证: image 顶层 → 返回 URL path = t2i（被忽略）；image 在 extra_body → path = i2i（真图生图）
    if (!body.extra_body) body.extra_body = {};
    body.extra_body.image = [referenceImage];
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