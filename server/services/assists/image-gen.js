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
 * v0.22.8: 单次调 Agnes Image API
 *   v0.53 (2026-07-18): 重试升级 — 最多 3 次，指数退避 500ms / 1s / 2s
 *     - 连接错误 (ECONNRESET/UND_ERR/ETIMEDOUT/ENOTFOUND/EAI_AGAIN): 重试
 *     - HTTP 5xx + 429: 重试 (provider 瞬时过载)
 *     - HTTP 4xx (除 429): 不重试 (401/400/1026 敏感词 = 配置或 prompt 问题，再试也是同样错)
 *     - 200 但响应里没 url: 重试 (provider 偶发返回空)
 *   返回 { ok: true, url } 或 { ok: false, error }
 */
async function callAgnesImageOnce(apiKey, body) {
  const MAX_ATTEMPTS = 3;
  const RETRY_HTTP_STATUSES = [429, 502, 503, 504];
  const CONN_ERR_RE = /ECONNRESET|UND_ERR|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/;
  const backoff = (n) => new Promise(r => setTimeout(r, 500 * Math.pow(2, n - 1)));  // 500ms, 1s, 2s
  let lastErr = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await http1Fetch('https://apihub.agnes-ai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        timeout: 120000,
      });
      if (!resp.ok) {
        lastErr = resp.error || 'fetch_failed';
        if (attempt < MAX_ATTEMPTS) await backoff(attempt);
        continue;
      }
      // 2xx → 校验响应里有 url
      if (resp.status >= 200 && resp.status < 300) {
        let data;
        try { data = JSON.parse(resp.body); } catch { data = null; }
        const url = data?.data?.[0]?.url;
        if (url) return { ok: true, url };
        lastErr = 'no url in response';
        if (attempt < MAX_ATTEMPTS) await backoff(attempt);
        continue;
      }
      // 非 2xx：4xx 直接失败，5xx/429 重试
      lastErr = `HTTP ${resp.status}: ${(resp.body || '').slice(0, 100)}`;
      if (!RETRY_HTTP_STATUSES.includes(resp.status)) break;
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`[assist:image] HTTP ${resp.status}（${attempt}/${MAX_ATTEMPTS}），${500 * Math.pow(2, attempt - 1)}ms 后重试...`);
        await backoff(attempt);
      }
    } catch (e) {
      lastErr = e.message || String(e);
      if (!CONN_ERR_RE.test(lastErr)) break;
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`[assist:image] 连接错误 ${lastErr}（${attempt}/${MAX_ATTEMPTS}），${500 * Math.pow(2, attempt - 1)}ms 后重试...`);
        await backoff(attempt);
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

/**
 * v0.22.23: 隐式图片生成完成后，把结果写进聊天流。
 *
 * 显式点击 🖼️ / 内联表单的路径已有 loading 卡 + SSE done → renderLeisureResult，
 * 不能重复写 history；只有 tool-loop / 关键词预检这种“后端 fire-and-forget”路径
 * 传 opts.writeChatResult=true 时才写。
 */
function writeImageChatEntry(requirementId, card) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  let history = [];
  try { history = JSON.parse(req.supplement_history || '[]'); } catch { history = []; }
  if (!Array.isArray(history)) history = [];

  const sameImage = history.some(e => {
    if (e.source !== 'image_result') return false;
    try {
      const old = JSON.parse(e.text || '{}');
      return (old.asset_path && old.asset_path === card.asset_path)
        || (old.image_url_output && old.image_url_output === card.image_url_output)
        || (old.generated_at && old.generated_at === card.generated_at);
    } catch { return false; }
  });
  if (sameImage) return;

  history.push({
    role: 'system',
    text: JSON.stringify({ type: 'image_card', ...card }),
    at: new Date().toISOString(),
    source: 'image_result',
  });
  reqStore.update(requirementId, { supplement_history: JSON.stringify(history) });
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
        project_id: req.project_id || null,
        generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
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
        project_id: req.project_id || null,
        generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
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
      project_id: req.project_id || null,
      generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
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
    const generatedAt = new Date().toISOString();
    const doneAssist = {
      status: 'done',
      prompt,
      project_id: req.project_id || null,
      generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
      image_url: finalImage || null,
      size,
      n,
      options,
      picked_idx: 0,
      // 兼容旧字段（image_url_output / asset_path = picked 的）
      image_url_output: picked.image_url_output,
      asset_path: picked.asset_path,
      mime: picked.mime,
      generated_at: generatedAt,
    };

    reqStore.update(requirementId, {
      assist_image: JSON.stringify(doneAssist),
    });
    if (opts.writeChatResult) writeImageChatEntry(requirementId, doneAssist);
    console.log(`[assist:image] ${requirementId} 完成, ${options.length} 张候选`);
  } catch (e) {
    console.error(`[assist:image] ${requirementId} 失败:`, e.message);
    const failedAssist = {
      status: 'failed',
      prompt,
      project_id: req.project_id || null,
      generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
      image_url: finalImage || null,
      size,
      n,
      options: [],
      picked_idx: 0,
      error: e.message,
      generated_at: new Date().toISOString(),
    };
    reqStore.update(requirementId, {
      assist_image: JSON.stringify(failedAssist),
    });
    if (opts.writeChatResult) writeImageChatEntry(requirementId, failedAssist);
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

// ════════════════════════════════════════════════════════════════════
// v0.49: 同步版本 — 等图片真正下载+保存+import chat-upload 完成才返回
//   给 plan_executor (ctx.sync=true) 用，避免 fire-and-forget 假完成
//   返回 { ok, prompt, asset_path, mime, options, picked_idx, file_ids[], generated_at, error }
//   v0.49.2: 同步路径也写 chat image_card；AGNES 仍接收完整 prefix 让它理解上下文
// ════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════
// v0.57: grounded poster — AI 只做背景，赛况事实由浏览器确定性渲染到最终 PNG
// ════════════════════════════════════════════════════════════════════
function escapePosterHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanPosterText(value) {
  return String(value || '')
    .replace(/^[-*#\s]+/, '')
    .replace(/[*_`]/g, '')
    .replace(/\[\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 只从 marker 前的上游正文抽取可追溯事实，不让图片模型自己编比分/球队。
 * 当前支持 markdown 表格比分行 + “对阵：A vs B”类明确字段。
 */
function extractGroundedPosterFacts(rawPrompt, maxFacts = 4) {
  const dividerIdx = String(rawPrompt || '').indexOf(CTX_DIVIDER);
  if (dividerIdx < 0) return { title: '', facts: [] };
  const upstream = String(rawPrompt).slice(0, dividerIdx);
  const lines = upstream.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  let title = '';
  let section = '';
  const facts = [];
  const addFact = (text) => {
    const cleaned = cleanPosterText(text).slice(0, 72);
    if (!cleaned || facts.includes(cleaned) || facts.length >= maxFacts) return;
    facts.push(cleaned);
  };

  for (const line of lines) {
    if (/^##\s*参考来源/.test(line)) break;
    if (/^#\s+/.test(line) && !title) {
      title = cleanPosterText(line).slice(0, 48);
      continue;
    }
    if (/^##\s+/.test(line)) {
      section = cleanPosterText(line);
      continue;
    }
    if (/^\|/.test(line)) {
      const cells = line.split('|').slice(1, -1).map(cleanPosterText);
      if (cells.length === 0 || cells.every(c => /^[-:]+$/.test(c))) continue;
      const matchup = cells.find(c => /\bvs\b|对阵/i.test(c));
      const score = cells.find(c => /^\d+\s*[-:]\s*\d+$/.test(c));
      if (matchup && score) addFact(`${matchup}  ${score}`);
      continue;
    }
    const cleaned = cleanPosterText(line);
    const matchupField = cleaned.match(/^(?:对阵|决赛对阵)\s*[：:]\s*(.+\bvs\b.+)$/i);
    if (matchupField) {
      const prefix = /季军|三[、,，]?四名|三四名/.test(section) ? '季军战：'
        : /决赛/.test(section) ? '决赛：'
        : '对阵：';
      addFact(prefix + matchupField[1]);
    } else if (/\b\d+\s*[-:]\s*\d+\b/.test(cleaned) && /\bvs\b/i.test(cleaned)) {
      addFact(cleaned);
    }
  }

  return {
    title: title || '最新赛况',
    facts,
  };
}

function buildGroundedPosterHtml(backgroundDataUri, groundedFacts, opts = {}) {
  const width = Math.max(320, Math.min(2048, parseInt(opts.width) || 1024));
  const height = Math.max(320, Math.min(2048, parseInt(opts.height) || 1024));
  const title = escapePosterHtml(groundedFacts?.title || '最新赛况');
  const facts = (groundedFacts?.facts || []).slice(0, 4)
    .map(f => `<div class="fact"><span class="dot"></span><span>${escapePosterHtml(f)}</span></div>`)
    .join('');
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#06111f}
#poster{position:relative;width:100%;height:100%;overflow:hidden;font-family:"Microsoft YaHei","Noto Sans CJK SC","Arial",sans-serif;color:#fff}
.poster-bg{position:absolute;inset:-2%;width:104%;height:104%;object-fit:cover;filter:blur(4px) brightness(.38) saturate(.82);transform:scale(1.03)}
.tint{position:absolute;inset:0;background:radial-gradient(circle at 70% 18%,rgba(38,173,255,.27),transparent 38%),linear-gradient(155deg,rgba(1,10,25,.15),rgba(1,10,25,.82) 70%)}
.content{position:absolute;left:6%;right:6%;bottom:6%;padding:4.8% 5%;border:1px solid rgba(255,255,255,.24);border-radius:28px;background:linear-gradient(135deg,rgba(3,18,39,.94),rgba(8,43,72,.88));box-shadow:0 26px 80px rgba(0,0,0,.45)}
.kicker{font-size:clamp(14px,1.8vw,24px);letter-spacing:.28em;color:#65d9ff;font-weight:700;margin-bottom:1.6%}
.title{font-size:clamp(34px,5.4vw,72px);font-weight:900;line-height:1.12;margin-bottom:3.2%;text-shadow:0 4px 18px rgba(0,0,0,.5)}
.facts{display:grid;gap:14px}.fact{display:flex;align-items:center;gap:14px;font-size:clamp(20px,3vw,38px);line-height:1.3;font-weight:700}
.dot{width:10px;height:10px;border-radius:50%;background:#42d7ff;box-shadow:0 0 16px #42d7ff;flex:none}
.footer{margin-top:3.4%;font-size:clamp(12px,1.5vw,20px);color:rgba(255,255,255,.62);letter-spacing:.08em}
</style></head><body><div id="poster" data-grounded="true">
<img class="poster-bg" src="${escapePosterHtml(backgroundDataUri)}"><div class="tint"></div>
<div class="content"><div class="kicker">MATCH UPDATE · VERIFIED DATA</div><div class="title">${title}</div><div class="facts">${facts}</div><div class="footer">基于已检索赛况生成 · ACMS</div></div>
</div></body></html>`;
}

async function renderGroundedPosterOverlay(sourcePath, outputPath, groundedFacts, opts = {}) {
  let page;
  try {
    const width = Math.max(320, Math.min(2048, parseInt(opts.width) || 1024));
    const height = Math.max(320, Math.min(2048, parseInt(opts.height) || 1024));
    const source = fs.readFileSync(sourcePath);
    const ext = path.extname(sourcePath).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.webp' ? 'image/webp' : 'image/png';
    const dataUri = `data:${mime};base64,${source.toString('base64')}`;
    const html = buildGroundedPosterHtml(dataUri, groundedFacts, { width, height });
    const { launchBrowser } = require('../browser-fetch');
    const browser = await launchBrowser();
    page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('.poster-bg')?.complete, { timeout: 10000 });
    await page.evaluate(async () => { if (document.fonts) await document.fonts.ready; });
    const png = Buffer.from(await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } }));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, png);
    return { ok: true, size: png.length, mime: 'image/png' };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    if (page) { try { await page.close(); } catch {} }
  }
}

function parseImageSize(size) {
  const match = String(size || '').match(/^(\d{2,4})x(\d{2,4})$/i);
  return match
    ? { width: Number(match[1]), height: Number(match[2]) }
    : { width: 1024, height: 1024 };
}

async function groundDownloadedImage(projectSlug, downloaded, groundedFacts, size) {
  const sourcePath = path.join(WORKSPACE_ROOT, projectSlug, ...downloaded.asset_path.split('/'));
  const groundedAssetPath = downloaded.asset_path.replace(/\.[^.]+$/, '_grounded.png');
  const outputPath = path.join(WORKSPACE_ROOT, projectSlug, ...groundedAssetPath.split('/'));
  const rendered = await renderGroundedPosterOverlay(sourcePath, outputPath, groundedFacts, parseImageSize(size));
  if (!rendered.ok) return { ok: false, error: `grounded_overlay_failed: ${rendered.error}` };
  try { if (sourcePath !== outputPath) fs.unlinkSync(sourcePath); } catch {}
  return {
    ...downloaded,
    asset_path: groundedAssetPath,
    mime: 'image/png',
    size: rendered.size,
    grounded_overlay: true,
  };
}

const CTX_DIVIDER = '__ACMS_AUTO_CONTEXT_END__';
async function runAssistJobCore(requirementId, opts = {}) {
  // 剥 plan_executor autoInject 注入的 prefix（marker 隔离）— 文件名/落库元数据用干净 prompt
  const rawPrompt = (opts.prompt || '').trim();
  const dividerIdx = rawPrompt.indexOf(CTX_DIVIDER);
  const prompt = dividerIdx >= 0 ? rawPrompt.substring(dividerIdx + CTX_DIVIDER.length).trim() : rawPrompt;
  const groundedFacts = extractGroundedPosterFacts(rawPrompt);
  const hasGrounding = dividerIdx >= 0 && (groundedFacts.title || groundedFacts.facts.length > 0);
  // Grounded plan 场景：Agnes 只生成无字背景；最终可见事实由服务端确定性叠字。
  // 把约束放在 prompt 最前面，覆盖 LLM 原 prompt 中可能存在的 “bold typography” 等冲突要求。
  const agnesPrompt = hasGrounding
    ? [
        'STRICTLY TEXT-FREE SPORTS POSTER BACKGROUND.',
        'MUST NOT render any words, letters, numbers, scores, dates, logos, watermarks, tournament branding, sample text, or historical event branding.',
        'DO NOT show FIFA Qatar 2022 or any other past tournament identity. Ignore typography requests in the original direction.',
        `Visual context only: ${[groundedFacts.title, ...groundedFacts.facts].filter(Boolean).join(' | ')}`,
        `Original visual direction: ${prompt}`,
      ].join('\n')
    : rawPrompt;
  const imageUrl = (opts.image_url || '').trim();
  const imageFileId = (opts.image_file_id || '').trim();
  const size = opts.size || '1024x1024';
  const n = Math.max(1, Math.min(6, parseInt(opts.n) || 1));

  if (!prompt) return { ok: false, error: 'NO_PROMPT', prompt: '', file_ids: [] };

  const req = reqStore.getById(requirementId);
  if (!req) return { ok: false, error: 'REQ_NOT_FOUND', prompt, file_ids: [] };

  let finalImage = imageUrl || null;
  if (imageFileId) {
    try {
      const chatUpload = require('../../services/chat-upload');
      finalImage = chatUpload.readImageAsDataURI(imageFileId);
    } catch (e) {
      console.warn(`[image-gen core] ${requirementId} 读取上传文件失败:`, e.message);
    }
  }

  try {
    const apiKey = getAgnesApiKey();
    if (!apiKey) return { ok: false, error: 'AGNES_API_KEY_NOT_CONFIGURED', prompt, file_ids: [] };

    const body = {
      model: 'agnes-image-2.0-flash',
      prompt: agnesPrompt, size,
      extra_body: { response_format: 'url' },
    };
    if (finalImage) body.extra_body.image = [finalImage];

    const callResults = await Promise.all(
      Array.from({ length: n }, () => callAgnesImageOnce(apiKey, body))
    );
    const successUrls = callResults.filter(r => r.ok).map(r => r.url);
    if (successUrls.length === 0) {
      const err = callResults.map(r => r.error).join('; ');
      return { ok: false, error: `all_n_calls_failed: ${err.slice(0, 200)}`, prompt, file_ids: [] };
    }

    const projectSlug = getProjectDirForReq(req);
    const downloadResults = await Promise.all(
      successUrls.map(url => downloadAndSaveOne(apiKey, projectSlug, url, { prompt, size, img2img: !!imageUrl }))
    );
    let processedDownloads = downloadResults.filter(r => r.ok);
    if (hasGrounding && processedDownloads.length > 0) {
      const groundedResults = await Promise.all(
        processedDownloads.map(r => groundDownloadedImage(projectSlug, r, groundedFacts, size))
      );
      processedDownloads = groundedResults.filter(r => r.ok);
      if (processedDownloads.length === 0) {
        const err = groundedResults.map(r => r.error).join('; ');
        return { ok: false, error: `grounded_overlay_all_failed: ${err.slice(0, 240)}`, prompt, file_ids: [] };
      }
    }
    const options = processedDownloads.map(r => ({
      image_url_output: r.url,
      asset_path: r.asset_path,
      mime: r.mime,
      size: r.size,
      grounded_overlay: Boolean(r.grounded_overlay),
    }));

    if (options.length === 0) {
      const err = downloadResults.map(r => r.error).join('; ');
      return { ok: false, error: `download_all_failed: ${err.slice(0, 200)}`, prompt, file_ids: [] };
    }

    const picked = options[0];
    const generatedAt = new Date().toISOString();

    // v0.49: 落库 + 导入 chat-upload 拿 file_ids（供 send_email 精确依赖）
    const fileIds = [];
    try {
      const chatUpload = require('../../services/chat-upload');
      const absPath = path.join(WORKSPACE_ROOT, projectSlug, picked.asset_path);
      if (fs.existsSync(absPath)) {
        const ext = (picked.mime || 'image/png').split('/')[1] || 'png';
        const imported = chatUpload.importFromPath(absPath, {
          name: `${prompt.slice(0, 30).replace(/[\\/:*?"<>|]/g, '_')}.${ext}`,
          mime: picked.mime || 'image/png',
          size: picked.size || 0,
          category: 'image',
        });
        if (imported?.id) {
          fileIds.push({ id: imported.id, name: imported.name, size: picked.size || 0, mime: picked.mime, kind: 'image' });
        }
      }
    } catch (e) {
      console.warn(`[image-gen core] ${requirementId} chat-upload import 失败 (不影响主流程):`, e.message);
    }

    // 同步写数据库字段 (与 runAssistJob 保持一致：让前端从 assist_image 拿卡片数据)
    // Grounded 场景向用户展示“实际送给 Agnes 的约束 + 事实”，不再只展示误导性的通用原 prompt。
    const displayPrompt = hasGrounding ? agnesPrompt : prompt;
    const doneAssist = {
      status: 'done',
      prompt: displayPrompt,
      original_prompt: prompt,
      grounded_facts: hasGrounding ? groundedFacts : null,
      grounded_overlay: hasGrounding,
      project_id: req.project_id || null,
      image_url: finalImage || null,
      size, n, options, picked_idx: 0,
      image_url_output: picked.image_url_output,
      asset_path: picked.asset_path,
      mime: picked.mime,
      generated_at: generatedAt,
    };
    reqStore.update(requirementId, { assist_image: JSON.stringify(doneAssist) });
    // v0.49.2: 同步路径也写 chat 流 image_card（plan_executor ctx.sync=true 调用）— 让前端能渲染图
    writeImageChatEntry(requirementId, doneAssist);

    return {
      ok: true,
      prompt: displayPrompt,
      original_prompt: prompt,
      grounded_facts: hasGrounding ? groundedFacts : null,
      grounded_overlay: hasGrounding,
      asset_path: picked.asset_path,
      mime: picked.mime,
      options, picked_idx: 0,
      file_ids: fileIds,
      generated_at: generatedAt,
      error: null,
    };
  } catch (e) {
    console.error(`[image-gen core] ${requirementId} 失败:`, e.message);
    return { ok: false, error: e.message, prompt, file_ids: [] };
  }
}

module.exports = {
  name: 'AI 图片生成（Agnes Image，N 候选）',
  field: 'assist_image',
  runAssistJob,
  runAssistJobCore,   // v0.49: 同步版本 for plan_executor
  extractGroundedPosterFacts,
  buildGroundedPosterHtml,
  renderGroundedPosterOverlay,
  pickOption,
  getAssist,
};
