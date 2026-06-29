// ACMS · 图片生成辅助（v0.22.8，2026-06-28）
//   用户输入 prompt + 可选参考图 → 调用 Agnes Image 2.0 Flash
//   v0.22.8: 支持 N 候选（并行调 N 次 API，因为 agnes-image-2.0-flash 不支持 n>1）
//   支持：文生图 / 图生图（多图输入）
//   直接调 API（不依赖 gen-adapter 生成器注册）
//
// 字段：requirement.assist_image
//   status / prompt / image_url / asset_path / options[N] / picked_idx / size / error
//   options[i] = { image_url_output, asset_path, mime, size }
//   picked_idx = 用户选中的索引（默认 0）

const reqStore = require('../../stores/requirement-store');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../../config');
// v0.22.16: HTTP/1.1 fetch 替代
const { http1Fetch } = require('../../tools/http1-fetch');

// v0.22.20: 改用 config.workspaceRoot（之前 2 层 `..` 错位到 server/workspaces/，与 gen.js 读取路径不一致 → 404）
const WORKSPACE_ROOT = config.workspaceRoot;

/**
 * 读取 Agnes API Key
 */
function getAgnesApiKey() {
  const config = require('../../config');
  if (config.agnesApiKey) return config.agnesApiKey;
  if (process.env.AGNES_API_KEY) return process.env.AGNES_API_KEY;
  try {
    const { collection } = require('../../db/connection');
    const cfg = collection('system_configs').findOne(c => c.key === 'agnes_api_key');
    if (cfg && cfg.value) return cfg.value;
  } catch (e) { /* ignore */ }
  return '';
}

/**
 * 找项目目录名（与 video.js 一致，用 project.slug 拼路径）
 */
function getProjectDirForReq(reqRec) {
  if (!reqRec?.project_id) return 'default';
  try {
    const projectStore = require('../../stores/project-store');
    const proj = projectStore.getById(reqRec.project_id);
    if (proj?.slug) return proj.slug;
    return reqRec.project_id;
  } catch (e) { return reqRec.project_id || 'default'; }
}

/**
 * 保存图片到 workspace assets
 */
function saveImageAsset(projectSlug, buffer, ext, mime, metadata) {
  const dateStr = new Date().toISOString().split('T')[0];
  const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 8);
  const assetsDir = path.join(WORKSPACE_ROOT, projectSlug, 'assets', dateStr);
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
  const safePrompt = (metadata.prompt || 'img').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').substring(0, 40);
  const fileName = `${safePrompt}_${hash}${ext}`;
  const filePath = path.join(assetsDir, fileName);
  fs.writeFileSync(filePath, buffer);
  const assetPath = `assets/${dateStr}/${fileName}`;
  return { assetPath, mime, size: buffer.length };
}

/**
 * v0.22.8: 单次调 Agnes Image API（带 1 次重试）
 *   返回 { ok: true, url, mime } 或 { ok: false, error }
 */
async function callAgnesImageOnce(apiKey, body) {
  let lastErr = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await http1Fetch('https://apihub.agnes-ai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        timeout: 120000,
      });
      if (!resp.ok) {
        lastErr = resp.error || 'fetch_failed';
        continue;
      }
      if (resp.status < 200 || resp.status >= 300) {
        lastErr = `HTTP ${resp.status}: ${(resp.body || '').slice(0, 100)}`;
        continue;
      }
      let data;
      try { data = JSON.parse(resp.body); } catch { data = null; }
      const url = data?.data?.[0]?.url;
      if (!url) {
        lastErr = 'no url in response';
        continue;
      }
      return { ok: true, url };
    } catch (e) {
      lastErr = e.message;
      // 连接错误重试 1 次
      const isConnError = /ECONNRESET|UND_ERR|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/.test(e.message || '');
      if (attempt === 1 && isConnError) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
    }
  }
  return { ok: false, error: lastErr };
}

/**
 * v0.22.8: 下载单张图到 workspace
 *   v0.22.22 fix: 用 curl 子进程替代 Node fetch。
 *     Node fetch / undici / https.request 跟 platform-outputs.agnes-ai.space 的 CDN TLS 握手不兼容
 *     （本地 Windows ECONNRESET，120 阿里云 HTTP/2 挂死），但 curl（Windows Schannel）能通。
 *     跟 120 阿里云 GitHub 不可达 → pscp 子进程的思路一致：换工具链路。
 */
async function downloadAndSaveOne(apiKey, projectSlug, url, metadata) {
  const { execFile } = require('child_process');
  const fs = require('fs');
  return new Promise((resolve) => {
    const tmpFile = path.join(require('os').tmpdir(), `acms-dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    // curl: --http1.1 强制 HTTP/1.1，-s 静默，--connect-timeout 10s, --max-time 60s
    execFile('curl', [
      '-sk',           // silent + 不校验证书
      '--http1.1',     // 强制 HTTP/1.1（避免 HTTP/2 握手挂死）
      '--connect-timeout', '10',
      '--max-time', '60',
      '-o', tmpFile,
      url,
    ], async (err, stdout, stderr) => {
      if (err) {
        try { fs.unlinkSync(tmpFile); } catch {}
        return resolve({ ok: false, error: `curl failed: ${err.message} | stderr: ${(stderr || '').slice(0, 200)}` });
      }
      try {
        const buffer = fs.readFileSync(tmpFile);
        fs.unlinkSync(tmpFile);
        if (buffer.length === 0) {
          return resolve({ ok: false, error: 'curl returned empty body' });
        }
        // 根据文件 magic bytes 推测 mime（避免依赖服务端 content-type header）
        let ext, mime;
        if (buffer[0] === 0xff && buffer[1] === 0xd8) { ext = '.jpg'; mime = 'image/jpeg'; }
        else if (buffer[0] === 0x89 && buffer[1] === 0x50) { ext = '.png'; mime = 'image/png'; }
        else if (buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') { ext = '.webp'; mime = 'image/webp'; }
        else { ext = '.png'; mime = 'image/png'; }
        const saved = saveImageAsset(projectSlug, buffer, ext, mime, metadata);
        return resolve({ ok: true, url, asset_path: saved.assetPath, mime: saved.mime, size: saved.size });
      } catch (e) {
        try { fs.unlinkSync(tmpFile); } catch {}
        return resolve({ ok: false, error: e.message });
      }
    });
  });
}

async function runAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  const prompt = (opts.prompt || '').trim();
  const imageUrl = (opts.image_url || '').trim();
  const imageFileId = (opts.image_file_id || '').trim();
  const size = opts.size || '1024x1024';
  // v0.22.9: N 候选（默认 1，范围 1-6）
  const n = Math.max(1, Math.min(6, parseInt(opts.n) || 1));

  if (!prompt) {
    reqStore.update(requirementId, {
      assist_image: JSON.stringify({
        status: 'failed',
        error: 'NO_PROMPT',
        prompt: '',
        generated_at: new Date().toISOString(),
      }),
    });
    return;
  }

  // v0.22.16: pending 模式 → 只存 prompt，不触发生成，等用户确认
  if (opts.pending) {
    reqStore.update(requirementId, {
      assist_image: JSON.stringify({
        status: 'pending_input',
        prompt,
        n,
        size: opts.size || '1024x1024',
        pending: true,
        started_at: new Date().toISOString(),
      }),
    });
    return;
  }

  // 从上传文件、URL、或无图中选参考图
  let finalImage = imageUrl || null;
  if (imageFileId) {
    try {
      const chatUpload = require('../../services/chat-upload');
      finalImage = chatUpload.readImageAsDataURI(imageFileId);
    } catch (e) {
      console.warn(`[assist:image] ${requirementId} 读取上传文件失败:`, e.message);
    }
  }

  reqStore.update(requirementId, {
    assist_image: JSON.stringify({
      status: 'generating',
      prompt,
      image_url: finalImage || null,
      size,
      n,
      options: [],
      picked_idx: 0,
      started_at: new Date().toISOString(),
    }),
  });

  try {
    const apiKey = getAgnesApiKey();
    if (!apiKey) throw new Error('Agnes API Key 未配置');

    const body = {
      model: 'agnes-image-2.0-flash',
      prompt,
      size,
      extra_body: { response_format: 'url' },
    };
    if (finalImage) body.extra_body.image = [finalImage];

    // v0.22.8: 并行调 N 次 API（agnes-image-2.0-flash 不支持 n>1，只能 N 次单张）
    console.log(`[assist:image] ${requirementId} 开始生成 ${n} 张候选`);
    const callResults = await Promise.all(
      Array.from({ length: n }, () => callAgnesImageOnce(apiKey, body))
    );
    const successUrls = callResults.filter(r => r.ok).map(r => r.url);
    if (successUrls.length === 0) {
      const err = callResults.map(r => r.error).join('; ');
      throw new Error(`所有 ${n} 次 API 调用都失败: ${err.slice(0, 200)}`);
    }
    console.log(`[assist:image] ${requirementId} ${successUrls.length}/${n} 张成功，开始下载保存`);

    // 并行下载 + 保存
    const projectSlug = getProjectDirForReq(req);
    const downloadResults = await Promise.all(
      successUrls.map(url => downloadAndSaveOne(apiKey, projectSlug, url, {
        prompt, size, img2img: !!imageUrl,
      }))
    );
    const options = downloadResults
      .filter(r => r.ok)
      .map(r => ({
        image_url_output: r.url,
        asset_path: r.asset_path,
        mime: r.mime,
        size: r.size,
      }));

    if (options.length === 0) {
      const err = downloadResults.map(r => r.error).join('; ');
      throw new Error(`下载全部失败: ${err.slice(0, 200)}`);
    }

    // 默认选第 0 张
    const picked = options[0];

    reqStore.update(requirementId, {
      assist_image: JSON.stringify({
        status: 'done',
        prompt,
        image_url: finalImage || null,
        size,
        n,
        options,
        picked_idx: 0,
        // 兼容旧字段（image_url_output / asset_path = picked 的）
        image_url_output: picked.image_url_output,
        asset_path: picked.asset_path,
        mime: picked.mime,
        generated_at: new Date().toISOString(),
      }),
    });
    console.log(`[assist:image] ${requirementId} 完成, ${options.length} 张候选`);
  } catch (e) {
    console.error(`[assist:image] ${requirementId} 失败:`, e.message);
    reqStore.update(requirementId, {
      assist_image: JSON.stringify({
        status: 'failed',
        prompt,
        image_url: finalImage || null,
        size,
        n,
        options: [],
        picked_idx: 0,
        error: e.message,
        generated_at: new Date().toISOString(),
      }),
    });
  }
}

/**
 * v0.22.8: 用户选中第 idx 张候选
 *   调 use 路由时传 { idx: N }
 */
function pickOption(requirementId, idx) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  let assist;
  try { assist = JSON.parse(req.assist_image || 'null'); } catch { assist = null; }
  if (!assist || !Array.isArray(assist.options) || idx < 0 || idx >= assist.options.length) return null;
  const picked = assist.options[idx];
  assist.picked_idx = idx;
  assist.used = true;
  assist.picked_at = new Date().toISOString();
  // 同步旧字段（向后兼容）
  assist.image_url_output = picked.image_url_output;
  assist.asset_path = picked.asset_path;
  assist.mime = picked.mime;
  reqStore.update(requirementId, { assist_image: JSON.stringify(assist) });
  return assist;
}

function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try { return JSON.parse(req.assist_image || 'null'); } catch { return null; }
}

module.exports = {
  name: 'AI 图片生成（Agnes Image，N 候选）',
  field: 'assist_image',
  runAssistJob,
  pickOption,
  getAssist,
};
