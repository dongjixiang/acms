// ============================================================
// vision-service.js — ACMS 视觉描述服务（v1 抽出，2026-08-24）
// ============================================================
//   把 chat-upload.js 里的 describeImage + 路径白名单 + mime 过滤
//   抽出来作为可复用 service 模块，供：
//     - chat-upload.js 上传文件时复用
//     - acms-mcp-server.js `acms_describe_image` 工具复用
//     - 未来 vision 任务 / assist 流程复用
//
// 设计原则：
//   - 单张 vision 描述（不批量，批量由 Agent 用 ls + 本工具组合实现 —
//     避免凝固场景到独立工具，ACMS vision 工具包只暴露通用原子）
//   - 路径白名单：cwd + 项目 workspace + Qwen task sandbox；
//     拒 .git/.ssh/.env/Win 敏感路径（防读任意盘 / 防泄露 secret）
//   - mime 过滤：png/jpg/jpeg/gif/webp（对齐 Qwen `SESSION_ATTACHMENT_MAX_ITEM_BYTES = 8MB`）
//   - 文件大小 8MB 上限（前端先拦截，后端二次保险）
//
// 返回：纯文本 vision 描述字符串（不出 base64 —— 多多要求"不是 chat 传图"）
// ============================================================
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// ---------- 常量 ----------
const SUPPORTED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp',
]);
const EXT_TO_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp',
};
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;     // 8MB — 对齐 Qwen SESSION_ATTACHMENT_MAX_ITEM_BYTES
const VISION_TIMEOUT_MS = 30_000;            // vision 调用兜底（与原 chat-upload 一致）

// 路径黑名单（防泄露 secret / 防读到 OS 关键目录）
//   v0.118 改进:.env 之前只匹配文件结尾，新增匹配 .env 目录（用户 .env/* 配置）
const FORBIDDEN_PATH_PATTERNS = [
  /(^|[\\/])\.git([\\/]|$)/i,
  /(^|[\\/])\.ssh([\\/]|$)/i,
  /(^|[\\/])\.env([\\/]|$)/i,         // 匹配 .env 文件 + .env 目录
  /[\\/]Windows([\\/]|$)/i,           // Win 系统目录
  /[\\/]System32([\\/]|$)/i,
  /[\\/]ProgramData([\\/]|$)/i,
];

// 路径政策 (v0.118.2 多多拍板 2026-08-25)：放开目录白名单限制
//   之前三态：黑名单直接拒 / 白名单自动 ok / 中间地带 requires_approval 让用户决定
//   现在：黑名单仍直接拒（敏感凭据+系统目录），其余**任意路径一律 AUTO_ALLOWED**
//   —— 用户明确"describe_image 不要有目录白名单限制，都放开"。vision 只读图片文件，
//   正常用户路径都能看了；.git/.ssh/.env/Windows 系统目录保留为最后一道安全闸。
//
// 返回:
//   { ok:true, requiresApproval:false, policy:'AUTO_ALLOWED', source }
//   { ok:false, requiresApproval:false, reason:'FORBIDDEN'|'EMPTY_PATH' }
function checkPathPolicy(absolutePath, context = {}) {
  if (!absolutePath) return { ok: false, requiresApproval: false, reason: 'EMPTY_PATH' };
  const abs = path.resolve(absolutePath);

  // 1. 黑名单（敏感路径 / 系统目录，直接拒）
  for (const re of FORBIDDEN_PATH_PATTERNS) {
    if (re.test(abs)) {
      return { ok: false, requiresApproval: false, reason: 'FORBIDDEN', pattern: re.toString() };
    }
  }

  // 2. v0.118.2：不再检查白名单根 —— 任意路径放行（黑名单之外的都 AUTO_ALLOWED）
  return { ok: true, requiresApproval: false, policy: 'AUTO_ALLOWED', source: abs };
}

// 向后兼容：旧 API isPathAllowed — 简化为 ok 二态，
//   内部转调 checkPathPolicy。第三方代码仍能用（不会跑到 requiresApproval 路径）
function isPathAllowed(absolutePath, context = {}) {
  const r = checkPathPolicy(absolutePath, context);
  return { ok: r.ok, reason: r.reason, requiresApproval: r.requiresApproval };
}

// 把 Buffer / 文件路径 / 外部 URL 转成 vision 调用所需的参数
//   返回：{ kind: 'path'|'buffer'|'unsupported', mime, source, size, error? }
async function resolveImageSource(input, context = {}) {
  // 形态 1: 文件路径
  if (typeof input === 'string' && /^([a-zA-Z]:[\\/]|\/|\\\\)/.test(input)) {
    const abs = path.resolve(input);
    // v0.118：使用三态 checkPathPolicy（替代单一 isPathAllowed）
    //   FORBIDDEN       → ok:false, requiresApproval:false 直接拒
    //   AUTO_ALLOWED    → ok:true, requiresApproval:false 自动放行
    //   NOT_IN_AUTO_ALLOWLIST → ok:false, requiresApproval:true 让 Agent 请示用户
    const policy = checkPathPolicy(abs, context);
    if (!policy.ok && !policy.requiresApproval) {
      return { kind: 'unsupported', error: policy.reason, reason: policy.reason,
               requiresApproval: false, policy: 'FORBIDDEN', source: abs };
    }
    if (!policy.ok && policy.requiresApproval) {
      return { kind: 'unsupported', error: policy.reason, reason: policy.reason,
               requiresApproval: true, policy: 'REQUIRES_APPROVAL', source: abs,
               allowRoots: policy.allowRoots };
    }
    // ok:true — 继续做文件存在性 + 大小 + mime 校验

    if (!fs.existsSync(abs)) return { kind: 'unsupported', error: 'FILE_NOT_FOUND', source: abs };
    const stat = fs.statSync(abs);
    if (!stat.isFile()) return { kind: 'unsupported', error: 'NOT_A_FILE', source: abs };
    if (stat.size > MAX_IMAGE_BYTES) {
      return { kind: 'unsupported', error: 'FILE_TOO_LARGE', size: stat.size, maxBytes: MAX_IMAGE_BYTES, source: abs };
    }
    const ext = path.extname(abs).toLowerCase();
    const mime = EXT_TO_MIME[ext];
    if (!mime || !SUPPORTED_MIME.has(mime)) {
      return { kind: 'unsupported', error: 'UNSUPPORTED_MIME', ext, source: abs };
    }
    return { kind: 'path', mime, source: abs, size: stat.size };
  }

  // 形态 2: Buffer（前端已 base64 解码后传过来的，或其他来源）
  if (Buffer.isBuffer(input)) {
    if (input.length > MAX_IMAGE_BYTES) {
      return { kind: 'unsupported', error: 'BUFFER_TOO_LARGE', size: input.length, maxBytes: MAX_IMAGE_BYTES };
    }
    const mime = sniffMimeFromBuffer(input);
    if (!mime || !SUPPORTED_MIME.has(mime)) {
      return { kind: 'unsupported', error: 'UNSUPPORTED_MIME', size: input.length };
    }
    return { kind: 'buffer', mime, source: input, size: input.length };
  }

  // 形态 3: URL —— 不直接走文件读，留给调用方自己 fetch 后传 Buffer 进来
  if (typeof input === 'string' && /^https?:\/\//i.test(input)) {
    return { kind: 'unsupported', error: 'URL_NEEDS_FETCH', hint: '调用方需自己 fetch + 转 Buffer', source: input };
  }

  return { kind: 'unsupported', error: 'UNSUPPORTED_INPUT', inputType: typeof input };
}

// 用 magic-bytes 检测 Buffer mime（不依赖文件名）
function sniffMimeFromBuffer(buf) {
  if (!buf || buf.length < 12) return null;
  // PNG: 89 50 4E 47
  if (buf[0]===0x89 && buf[1]===0x50 && buf[2]===0x4E && buf[3]===0x47) return 'image/png';
  // JPEG: FF D8 FF
  if (buf[0]===0xFF && buf[1]===0xD8 && buf[2]===0xFF) return 'image/jpeg';
  // GIF: 47 49 46 38
  if (buf[0]===0x47 && buf[1]===0x49 && buf[2]===0x46 && buf[3]===0x38) return 'image/gif';
  // WebP: RIFF....WEBP
  if (buf.slice(0,4).toString() === 'RIFF' && buf.slice(8,12).toString() === 'WEBP') return 'image/webp';
  return null;
}

// 核心：单张图 vision 描述
//   input: string (path) | Buffer
//   context: { cwd, workspacePath, sandboxPath } 用于路径白名单
//   opts: { prompt?: string, maxTokens?: number }
//   returns: { ok, description?, mime, size, error?, reason? }
async function describeImage(input, context = {}, opts = {}) {
  const defaultPrompt = '请用简洁的中文（不超过 400 字）描述这张图片的内容，重点说明：\n1. 图的类型（截图/照片/图表/界面等）\n2. 关键信息（文字、布局、UI 元素、数据趋势等）\n3. 如果是界面截图，说明页面名称和主要功能模块\n\n只输出描述，不要前缀或解释。';
  const prompt = opts.prompt || defaultPrompt;
  const maxTokens = opts.maxTokens || 800;

  const resolved = await resolveImageSource(input, context);
  if (resolved.kind === 'unsupported') {
    // v0.118：透传三态给 MCP server — requires_approval 让 Agent 提示用户
    return {
      ok: false,
      error: resolved.error,
      requires_approval: !!resolved.requiresApproval,
      policy: resolved.policy,
      ...resolved,
    };
  }

  // 真正调 vision LLM
  try {
    const { analyzeFileWithLLM } = require('./knowledge-scanner');
    // knowledge-scanner.analyzeFileWithLLM 的签名: (promptText, imagePath, maxTokens)
    // 它要求必须是文件路径（用 fs.readFileSync 读本地），所以 buffer 类型需先落临时盘
    let imagePathForLLM = resolved.source;
    let tmpPath = null;
    try {
      if (resolved.kind === 'buffer') {
        tmpPath = path.join(os.tmpdir(), `acms-vision-${crypto.randomUUID()}${extFromMime(resolved.mime)}`);
        fs.writeFileSync(tmpPath, resolved.source);
        imagePathForLLM = tmpPath;
      }
      const result = await Promise.race([
        analyzeFileWithLLM(prompt, imagePathForLLM, maxTokens),
        new Promise((_, rej) => setTimeout(() => rej(new Error('VISION_TIMEOUT')), VISION_TIMEOUT_MS)),
      ]);
      const description = (result && typeof result === 'string') ? result.trim() : null;
      if (!description) return { ok: false, error: 'VISION_EMPTY_RESPONSE', mime: resolved.mime, size: resolved.size };
      return { ok: true, description, mime: resolved.mime, size: resolved.size };
    } finally {
      if (tmpPath) { try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ } }
    }
  } catch (e) {
    console.warn('[vision-service] describe image fail:', e.message);
    return { ok: false, error: e.message || 'VISION_FAIL', mime: resolved.mime, size: resolved.size };
  }
}

function extFromMime(mime) {
  const m = { 'image/png':'.png', 'image/jpeg':'.jpg', 'image/gif':'.gif', 'image/webp':'.webp' };
  return m[mime] || '.img';
}

// ---------- v0.119：URL → Buffer 原子（SSRF 防护 + 8MB 上限 + magic-bytes sniff）----------
//   给 acms_search_images MCP 工具调用：搜到图 → 自动下载到 Buffer → 调 describeImage
//   不落 chat-upload 盘（仅做 vision 描述用，无需持久化）；超时 15s

const FETCH_TIMEOUT_MS = 15_000;
const PRIVATE_HOST_RE = /^(localhost|.*\.local|127\.|::1|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.|fe80:|fc..:|fd..:)/i;

/**
 * 从 URL 抓图到 Buffer（带 SSRF 防护 + 大小限制）
 * @returns {Promise<{ok:true, buffer:Buffer, mime:string, size:number} | {ok:false, error:string, hint?:string}>}
 */
async function fetchImageBuffer(url, opts = {}) {
  if (!url || typeof url !== 'string') return { ok: false, error: 'URL_REQUIRED' };
  let parsed;
  try { parsed = new URL(url); } catch (e) { return { ok: false, error: 'INVALID_URL' }; }
  if (!/^https?:$/.test(parsed.protocol)) return { ok: false, error: 'NON_HTTP_URL' };
  if (PRIVATE_HOST_RE.test(parsed.hostname)) {
    return { ok: false, error: 'SSRF_BLOCKED', hint: '拒绝内网 / loopback 地址' };
  }

  let resp;
  try {
    const { http1Fetch } = require('../tools/http1-fetch');
    resp = await http1Fetch(url, { method: 'GET', timeout: FETCH_TIMEOUT_MS, binary: true });
  } catch (e) {
    return { ok: false, error: 'FETCH_FAIL', hint: e.message };
  }
  if (!resp || !resp.ok) {
    return { ok: false, error: 'HTTP_FAIL', hint: `status=${resp?.status} ${resp?.error || ''}`.trim() };
  }

  // http1Fetch binary 模式返回 { ok, status, headers, body: <base64 string>, _binary: true }
  //   兼容老调用方误传 binary=false 的情况（body 是 utf-8 字符串），按 base64 fallback
  let buffer;
  if (resp._binary && typeof resp.body === 'string') {
    buffer = Buffer.from(resp.body, 'base64');
  } else if (Buffer.isBuffer(resp.body)) {
    buffer = resp.body;
  } else if (Buffer.isBuffer(resp)) {
    buffer = resp;
  } else if (resp.body && typeof resp.body === 'string') {
    // 兜底：当成 base64 解
    buffer = Buffer.from(resp.body, 'base64');
  } else {
    return { ok: false, error: 'BAD_RESPONSE', hint: '未拿到二进制内容' };
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'TOO_LARGE', size: buffer.length, maxBytes: MAX_IMAGE_BYTES };
  }
  const mime = sniffMimeFromBuffer(buffer);
  if (!mime || !SUPPORTED_MIME.has(mime)) {
    return { ok: false, error: 'UNSUPPORTED_MIME', size: buffer.length };
  }
  return { ok: true, buffer, mime, size: buffer.length };
}

module.exports = {
  describeImage,
  isPathAllowed,
  checkPathPolicy,        // 🆕 v0.118：三态路径政策 API（替代 isPathAllowed 的二态语义）
  resolveImageSource,
  sniffMimeFromBuffer,
  fetchImageBuffer,       // 🆕 v0.119：URL → Buffer 原子（给搜图工具用）
  SUPPORTED_MIME,
  MAX_IMAGE_BYTES,
};
