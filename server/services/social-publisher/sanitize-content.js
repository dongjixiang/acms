// ACMS social-publisher — sanitize-content.js
// ============================================
// v0.119.7: buildGoal 净化 base64 → 临时文件 + [IMAGE:n] 占位符
//
// 背景：用户从 Word/HTML 复制文章到发布表单时，图片被 inline 成 base64 直接进
//   params.content。go-publisher.js:buildGoal 整段塞进 goal → LLM 每次收到 16K
//   tokens 的垃圾 + 触发 DeepSeek V4-Flash 报 9.2M tokens 超限（实测 600x gap）。
//   LLM 完全不需要看图（不调图，只看文本）→ 必须净化。
//
// 设计：
//   sanitizeContent(content, sessionId) → { text, paths }
//     - text:    净化后正文（base64 → [IMAGE:n] 占位符）
//     - paths:   临时文件路径数组（顺序 = 用户编辑时的图片顺序）
//   临时文件: data/social-publisher-uploads/<sessionId>/<idx>.<ext>
//   清理:     session 终态 done/error 后调 cleanupSession；LRU 兜底 cleanupStale
//   校验:
//     - content.length > 500KB → 抛 size_too_large
//     - 内嵌 base64 图 > 18 张 → 抛 too_many_images（小红书最大限制）
//
// 调用方：go-publisher.js:buildGoal（第 91 行之前插入）

'use strict';

const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.resolve(__dirname, '../../../data/social-publisher-uploads');
// 净化后 text 阈值（抽完 base64 还超这个 = 真文本太大，要拒）
const MAX_CONTENT_BYTES = 500 * 1024;        // 500KB 净化后文本 ≈ 12.5 万中文字
// 原始 input 硬上限（防恶意/粘贴意外塞 100MB 把 ACMS 撑爆；净化前的预检）
const MAX_RAW_INPUT_BYTES = 20 * 1024 * 1024; // 20MB（极端情况：万张图也不该超过这个）
const MAX_INLINE_IMAGES = 18;            // 小红书最大 18 张图 → 拒更多

function ensureUploadsRoot() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  return UPLOADS_DIR;
}

function sessionUploadsDir(sessionId) {
  // sessionId = go-publisher 生成的 gp-xxx；过滤非法字符防越界
  const safe = String(sessionId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'unknown';
  const dir = path.join(UPLOADS_DIR, safe);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// 净化：抽 base64 → 临时文件 + [IMAGE:n] 占位符
//
// 校验策略（v0.119.7.1 修 bug — 之前 size check 在 replace 之前，导致 2.5MB 总大小
//   （含 base64）直接被挡，根本没机会走净化）：
//   1. 原始 input 硬上限 20MB（防 OOM）— 在 replace 之前预检
//   2. replace（抽 base64）后判断 text.length > 500KB → size_too_large（净化后还大 = 真文本太大）
function sanitizeContent(content, sessionId) {
  const text = String(content || '');

  // 1. 原始 input 硬上限（防恶意/意外塞 100MB 把 ACMS 撑爆）
  if (text.length > MAX_RAW_INPUT_BYTES) {
    const err = new Error(
      `原始输入过大（${(text.length / 1024 / 1024).toFixed(1)}MB > ${MAX_RAW_INPUT_BYTES / 1024 / 1024}MB）。这超出合理发布内容大小上限，请检查是否有大量内嵌图未走图片上传通道。`
    );
    err.code = 'raw_input_too_large';
    throw err;
  }

  ensureUploadsRoot();
  const dir = sessionUploadsDir(sessionId);

  // 匹配 <img src="data:image/<ext>;base64,<b64>" ...>
  // - src 可能在 <img> 标签的任何位置（前面可能还有 width/height/alt 等属性）
  // - <ext> 是 MIME subtype（png/jpeg/gif/webp/svg+xml）
  // - <b64> 不含引号
  const re = /<img\s+[^>]*?src=["']data:image\/([a-zA-Z0-9+.-]+);base64,([^"']+)["'][^>]*>/gi;

  const paths = [];
  let count = 0;
  const replaced = text.replace(re, (_match, ext, b64) => {
    if (count >= MAX_INLINE_IMAGES) {
      const err = new Error(
        `内嵌图片超过 ${MAX_INLINE_IMAGES} 张（小红书最大限制）。请减少内嵌图或改用图片上传通道单独发送。`
      );
      err.code = 'too_many_images';
      throw err;
    }
    const idx = count++;
    const safeExt = String(ext || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const filename = `${idx}.${safeExt}`;
    const filepath = path.join(dir, filename);
    try {
      const buf = Buffer.from(b64, 'base64');
      if (buf.length === 0) return `[IMAGE:${idx}:EMPTY]`;  // 空 base64 → 跳过，留提示
      fs.writeFileSync(filepath, buf);
      paths.push(filepath);
      return `[IMAGE:${idx}]`;
    } catch (e) {
      console.error(`[sanitize-content] 写临时文件失败 idx=${idx} ext=${safeExt}: ${e.message}`);
      return `[IMAGE:${idx}:WRITE_FAIL]`;
    }
  });

  // 2. 净化后 text 阈值（抽完 base64 后还超 500KB = 真文本太大，要拒）
  if (replaced.length > MAX_CONTENT_BYTES) {
    // 注意：临时文件已经写出来了，但既然整体拒就一起清掉
    try { cleanupSession(sessionId); } catch (_) { /* ignore */ }
    const err = new Error(
      `净化后正文仍过大（${(replaced.length / 1024).toFixed(0)}KB > ${MAX_CONTENT_BYTES / 1024}KB）。base64 图已抽取，但纯文本部分超出限制，请精简正文。`
    );
    err.code = 'size_too_large';
    throw err;
  }

  // 3. v0.119.8: 额外写 content.html（**完整原文含 base64 图**）—— 供 web_paste 剪贴板粘贴用
  //   思路：LLM 不读 base64，只是把文件路径给 web_paste 工具 → 工具读文件写剪贴板 → Ctrl+V → 平台自动上传图
  let htmlPath = null;
  try {
    const htmlFile = path.join(dir, 'content.html');
    // 若原文不像 HTML（无标签），包成最基本的分段 HTML
    const html = /<[a-z][a-z0-9]*[\s>]/i.test(text)
      ? text
      : `<p>${text.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
    fs.writeFileSync(htmlFile, html, 'utf8');
    htmlPath = htmlFile;
  } catch (e) {
    console.error(`[sanitize-content] 写 content.html 失败: ${e.message}`);
  }

  return { text: replaced, paths, htmlPath };
}

// 净化 images 数组（每个元素如是 data:image/...;base64,... 也抽到临时文件 + 替换为绝对路径）
//   返回 { paths, sanitized }：paths = 抽出的临时文件路径数组；sanitized = 处理后的 images 数组
//   （data URI → 绝对路径，外链 URL 原样保留）
//   v0.119.7.2: 修 — params.images 数组里 base64 data URI 撑爆 goal（之前只处理 content）
function sanitizeImages(images, sessionId) {
  if (!Array.isArray(images) || !images.length) return { paths: [], sanitized: [] };
  ensureUploadsRoot();
  const dir = sessionUploadsDir(sessionId);
  const paths = [];
  const sanitized = [];
  const re = /^data:image\/([a-zA-Z0-9+.-]+);base64,([\s\S]+)$/;
  let embeddedIdx = 0;  // 嵌入图独立计数（与 content 内 [IMAGE:n] 区分；合并后给 LLM 一份统一清单）
  for (const img of images) {
    const m = String(img || '').match(re);
    if (m) {
      const ext = (m[1] || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      const b64 = m[2];
      const idx = embeddedIdx++;
      const filename = `img-${idx}.${ext}`;
      const filepath = path.join(dir, filename);
      try {
        const buf = Buffer.from(b64, 'base64');
        if (buf.length === 0) {
          sanitized.push(`[IMAGE:${idx}:EMPTY]`);
          continue;
        }
        fs.writeFileSync(filepath, buf);
        paths.push(filepath);
        sanitized.push(filepath);  // 替换为绝对路径（LLM 用 web_upload 上传）
      } catch (e) {
        console.error(`[sanitize-content] images 抽 base64 失败 idx=${idx}: ${e.message}`);
        sanitized.push(`[IMAGE:${idx}:WRITE_FAIL]`);
      }
    } else {
      // 非 base64（外链 URL / 相对路径）— 原样保留
      sanitized.push(img);
    }
  }
  return { paths, sanitized };
}

// 清理某 session 的临时文件（终态 60s 后调）
function cleanupSession(sessionId) {
  const safe = String(sessionId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'unknown';
  const dir = path.join(UPLOADS_DIR, safe);
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (e) {
    console.warn(`[sanitize-content] cleanup ${safe} failed: ${e.message}`);
  }
}

// LRU 兜底：清 maxAgeMs 前的残留 session 目录（崩溃/异常退出没正常 cleanup）
function cleanupStale(maxAgeMs = 24 * 3600 * 1000) {
  ensureUploadsRoot();
  const now = Date.now();
  try {
    for (const name of fs.readdirSync(UPLOADS_DIR)) {
      const dir = path.join(UPLOADS_DIR, name);
      try {
        const stat = fs.statSync(dir);
        if (!stat.isDirectory()) continue;
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      } catch (_) { /* skip one entry */ }
    }
  } catch (e) {
    console.warn(`[sanitize-content] cleanupStale failed: ${e.message}`);
  }
}

module.exports = {
  sanitizeContent,
  sanitizeImages,
  cleanupSession,
  cleanupStale,
  MAX_CONTENT_BYTES,
  MAX_RAW_INPUT_BYTES,
  MAX_INLINE_IMAGES,
  UPLOADS_DIR,
};