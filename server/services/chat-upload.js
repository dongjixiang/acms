// ACMS · 聊天附件上传服务（v0.9）
//   - 接收 multipart/form-data 单文件
//   - 按 mime + 后缀分类（image / pdf / docx / text / code）
//   - 保存到 data/chat-uploads/<uuid>.<ext>
//   - 解析文本：docx (adm-zip + XML) / pdf (pdf-parse) / text·code (UTF-8)
//   - 图片：复用 knowledge-scanner.analyzeFileWithLLM 调 vision 模型描述
//   - 返回 { id, name, size, mime, category, url, extractedText?, savedAt }
//   - 零新依赖（图片解析走现有 LLM 适配器）
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'data', 'chat-uploads');
const MAX_TEXT_LEN = 60_000;  // 文本/MD/code/pdf 截断阈值
const VISION_TIMEOUT_MS = 30_000;  // vision 调用兜底 30 秒

// ── 类型分类（mime → category） ──
function classify(file) {
  const mime = (file.mimetype || '').toLowerCase();
  const ext = path.extname(file.originalname || '').toLowerCase();
  // 图片
  if (mime.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
    return { category: 'image', icon: '🖼', parse: 'vision' };
  }
  // PDF
  if (mime === 'application/pdf' || ext === '.pdf') {
    return { category: 'pdf', icon: '📕', parse: 'pdf' };
  }
  // Word (docx)
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx'
  ) {
    return { category: 'docx', icon: '📘', parse: true };
  }
  // 纯文本 / MD
  if (
    mime.startsWith('text/') ||
    ['.md', '.markdown', '.txt', '.log'].includes(ext)
  ) {
    return { category: 'text', icon: '📄', parse: true };
  }
  // 代码 / 配置
  if (
    ['.json', '.yaml', '.yml', '.toml', '.ini', '.env',
     '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rs',
     '.rb', '.php', '.cs', '.cpp', '.c', '.h', '.hpp',
     '.sh', '.bash', '.zsh', '.ps1',
     '.html', '.css', '.scss', '.sass', '.less',
     '.xml', '.sql', '.graphql'].includes(ext)
  ) {
    return { category: 'code', icon: '💻', parse: true };
  }
  return { category: 'unknown', icon: '📎', parse: false };
}

// ── docx 解析（adm-zip + XML strip） ──
function parseDocx(buffer) {
  try {
    const zip = new AdmZip(buffer);
    const entry = zip.getEntry('word/document.xml');
    if (!entry) return null;
    const xml = entry.getData().toString('utf-8');
    const withBreaks = xml
      .replace(/<w:p[\s>]/g, '\n<w:p ')
      .replace(/<w:br\s*\/?>/g, '\n')
      .replace(/<w:tab\s*\/?>/g, '\t')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return withBreaks;
  } catch (e) {
    console.warn('[chat-upload] docx 解析失败:', e.message);
    return null;
  }
}

// ── pdf 解析（pdf-parse） ──
function parsePdf(buffer) {
  try {
    // pdf-parse 是异步函数（CJS），支持 callback 和 promise
    // 这里用 promise 包装
    const pdfParse = require('pdf-parse');
    return pdfParse(buffer).then(data => {
      // data.text 是合并后的纯文本；data.numpages 页数
      if (!data || !data.text) return null;
      return data.text.replace(/\r\n/g, '\n').replace(/ /g, ' ').replace(/\f/g, '\n\n---\n\n').replace(/[ \t]+\n/g, '\n').trim();
    });
  } catch (e) {
    console.warn('[chat-upload] pdf 解析失败:', e.message);
    return Promise.resolve(null);
  }
}

// ── 文本/代码类解析（直接读 UTF-8） ──
function parseText(buffer) {
  for (let i = 0; i < Math.min(buffer.length, 1024); i++) {
    if (buffer[i] === 0) return null;  // 二进制
  }
  try {
    return buffer.toString('utf-8');
  } catch (e) {
    return null;
  }
}

// ── 图片 vision 描述（v0.118 重构：调 vision-service） ──
//   v1.0 抽出到 vision-service.js 让 acms-mcp-server 等其它模块复用
//   chat-upload.js 这里只做"上传-解析-落盘"业务流，描述能力来自 vision-service
const visionService = require('./vision-service');

async function describeImage(imagePath) {
  const r = await visionService.describeImage(imagePath, { cwd: process.cwd() });
  return r.ok ? r.description : null;
}

/**
 * v0.118：从 URL 下载图（同源处理）并落盘为 chat-upload 文件
 *   - 仅 http/https（防 SSRF）
 *   - 拒绝内网 IP（防打到 ACMS 后端 / 120 / 内网资源）
 *   - 8MB 上限（Qwen `SESSION_ATTACHMENT_MAX_ITEM_BYTES`）
 *   - mime 嗅探（magic-bytes，不依赖 content-type 头）
 *   - 调 vision-service 描述
 *
 * @param {string} url
 * @param {object} [opts] { name?, context?: { cwd, workspacePath, sandboxPath } }
 * @returns {object} saveAndParse 同形态（含 extractedText / id / url）
 */
async function importFromUrl(url, opts = {}) {
  if (!url || typeof url !== 'string') throw new Error('URL_REQUIRED');
  let parsed;
  try { parsed = new URL(url); } catch (e) { throw new Error('INVALID_URL'); }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('NON_HTTP_URL');

  // SSRF 防护：拒绝内网 IP（loopback / 私网 / link-local / multicast）
  const hostnames = [parsed.hostname];
  if (parsed.hostname.includes('.')) {
    // 已经是 IP 或域名；解一遍避免 127.0.0.1 / localhost 的变相
  }
  const FORBIDDEN_HOSTNAME = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|::1$|fe80:|0\.)/i;
  if (FORBIDDEN_HOSTNAME.test(parsed.hostname)) throw new Error('INTERNAL_HOST_BLOCKED');

  let resp;
  try {
    const { http1Fetch } = require('../tools/http1-fetch');
    resp = await http1Fetch(url, { method: 'GET', timeout: 15000, binary: true });
  } catch (e) {
    throw new Error('FETCH_FAIL: ' + (e.message || 'unknown'));
  }
  if (!resp || !resp.ok) {
    throw new Error('HTTP_' + (resp?.status || 0) + ': ' + (resp?.error || 'fetch failed'));
  }
  // 二进制 body 已在 base64；反解 Buffer
  const buffer = Buffer.from(resp.body, 'base64');
  if (buffer.length > visionService.MAX_IMAGE_BYTES) {
    throw new Error('FILE_TOO_LARGE: ' + buffer.length + ' > ' + visionService.MAX_IMAGE_BYTES);
  }

  // mime 嗅探（不依赖 content-type，可被人伪造）
  const mime = visionService.sniffMimeFromBuffer(buffer);
  if (!mime || !visionService.SUPPORTED_MIME.has(mime)) {
    throw new Error('UNSUPPORTED_MIME_OR_NOT_IMAGE');
  }

  // 写盘到 UPLOAD_DIR
  try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) { /* ignore */ }
  const id = crypto.randomUUID();
  const ext = (mime === 'image/jpeg' ? '.jpg' : '.' + (mime.split('/')[1] || 'img'));
  const safeName = `${id}${ext}`;
  const filePath = path.join(UPLOAD_DIR, safeName);
  fs.writeFileSync(filePath, buffer);

  // vision 描述（直接传 buffer，vision-service 内部会落 tmp）
  const ctx = opts.context || { cwd: process.cwd() };
  const vis = await visionService.describeImage(buffer, ctx);

  // 写 meta（与 saveAndParse 兼容）
  const meta = {
    id, name: opts.name || parsed.pathname.split('/').pop() || 'from-url',
    size: buffer.length, mime,
    category: 'image', icon: '🖼',
    savedAt: new Date().toISOString(),
    filePath: safeName, source: 'url_import',
    sourceUrl: url,
  };
  try {
    fs.writeFileSync(path.join(UPLOAD_DIR, `${id}.meta.json`), JSON.stringify(meta, null, 2));
  } catch (e) { /* ignore */ }

  const result = {
    id, name: meta.name, size: meta.size, mime,
    category: 'image', icon: '🖼',
    url: `/api/chat/upload/${id}/raw`,
    extractedText: vis.ok ? vis.description : null,
    savedAt: meta.savedAt,
  };
  if (!vis.ok) {
    result.parseNote = 'AI 视觉识别不可用或失败（' + (vis.error || '') + '）';
  }
  console.log(`[chat-upload] ✅ (URL) ${id} | image | ${meta.name} (${(buffer.length/1024).toFixed(1)}KB)${vis.ok ? ' | text=' + result.extractedText.length + 'ch' : ' | parse=FAIL'}`);
  return result;
}

/**
 * v0.47：从已有文件路径导入为 chat-upload 文件（用于 workspace 资产 → 邮件附件）
 *   - 不重新解析（避免 vision/pdf 解析耗时）
 *   - 复制到 UPLOAD_DIR + 写 meta.json
 *   - 返回与 saveAndParse 兼容的 { id, name, size, mime, ... }
 *
 * @param {string} srcPath - 源文件绝对路径（workspace 资产）
 * @param {object} meta - { name, mime, size?, category? }
 * @returns {object} - { id, name, size, mime, category, savedAt, filePath, ... }
 */
function importFromPath(srcPath, meta = {}) {
  if (!srcPath || !fs.existsSync(srcPath)) throw new Error('SRC_FILE_NOT_FOUND: ' + srcPath);
  try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) { /* ignore */ }

  const id = crypto.randomUUID();
  const ext = path.extname(srcPath) || (meta.name ? path.extname(meta.name) : '') || '';
  const safeName = `${id}${ext}`;
  const destPath = path.join(UPLOAD_DIR, safeName);
  fs.copyFileSync(srcPath, destPath);

  const size = meta.size || fs.statSync(srcPath).size;
  const mime = meta.mime || 'application/octet-stream';
  const name = meta.name || path.basename(srcPath);
  const category = meta.category || 'unknown';

  const fullMeta = {
    id, name, size, mime, category,
    savedAt: new Date().toISOString(),
    filePath: safeName,
    source: 'workspace_import',  // 标记来源,便于追溯
  };
  try {
    fs.writeFileSync(path.join(UPLOAD_DIR, `${id}.meta.json`), JSON.stringify(fullMeta, null, 2));
  } catch (e) { /* ignore */ }

  return fullMeta;
}

// ── 主入口：保存并解析 ──
async function saveAndParse(file) {
  if (!file) throw new Error('NO_FILE');
  try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) { /* ignore */ }

  const { category, icon, parse } = classify(file);
  const id = crypto.randomUUID();
  const ext = path.extname(file.originalname || '') || '';
  const safeName = `${id}${ext}`;
  const filePath = path.join(UPLOAD_DIR, safeName);

  // 1. 写文件（必须先写，否则 vision/pdf 解析无路径）
  fs.writeFileSync(filePath, file.buffer);

  // 2. 解析文本（按类型走不同路径）
  let extractedText = null;
  if (parse === 'pdf') {
    extractedText = await parsePdf(file.buffer);
  } else if (parse === 'vision') {
    extractedText = await describeImage(filePath);
  } else if (parse === true) {
    if (category === 'docx') {
      extractedText = parseDocx(file.buffer);
    } else if (category === 'text' || category === 'code') {
      extractedText = parseText(file.buffer);
    }
  }

  // 截断（避免 LLM 上下文爆掉）
  if (extractedText && extractedText.length > MAX_TEXT_LEN) {
    extractedText = extractedText.slice(0, MAX_TEXT_LEN) + '\n\n...[已截断，原文 ' + extractedText.length + ' 字符]';
  }

  // 3. 写 meta（供未来静态服务用，v1 不暴露）
  const meta = {
    id, name: file.originalname, size: file.size, mime: file.mimetype,
    category, savedAt: new Date().toISOString(), filePath: safeName,
    extractedLen: extractedText ? extractedText.length : 0,
  };
  try {
    fs.writeFileSync(path.join(UPLOAD_DIR, `${id}.meta.json`), JSON.stringify(meta, null, 2));
  } catch (e) { /* ignore */ }

  const result = {
    id, name: file.originalname, size: file.size, mime: file.mimetype,
    category, icon, url: `/api/chat/upload/${id}/raw`,
    extractedText, savedAt: meta.savedAt,
  };
  // 解析失败时给个明确标记（前端透传）
  if (parse && !extractedText) {
    result.parseNote = category === 'image'
      ? 'AI 视觉识别不可用或失败'
      : category === 'pdf'
        ? 'PDF 解析失败（可能是扫描版/加密）'
        : '解析失败';
  }
  console.log(`[chat-upload] ✅ ${id} | ${category} | ${file.originalname} (${(file.size/1024).toFixed(1)}KB)${extractedText ? ' | text=' + extractedText.length + 'ch' : (parse ? ' | parse=FAIL' : '')}`);
  return result;
}

// ── 读取已保存文件（用于静态预览） ──
function getFilePath(id) {
  // 防 path traversal
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const metaPath = path.join(UPLOAD_DIR, `${id}.meta.json`);
  if (!fs.existsSync(metaPath)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const fp = path.join(UPLOAD_DIR, meta.filePath);
    if (!fs.existsSync(fp)) return null;
    return { filePath: fp, meta };
  } catch (e) {
    return null;
  }
}

/**
 * 读取上传的图片文件为 Base64 Data URI
 */
function readImageAsDataURI(id) {
  const info = getFilePath(id);
  if (!info || !info.meta.mime?.startsWith('image/')) return null;
  const buf = fs.readFileSync(info.filePath);
  const b64 = buf.toString('base64');
  return `data:${info.meta.mime};base64,${b64}`;
}

module.exports = {
  saveAndParse,
  getFilePath,
  readImageAsDataURI,
  importFromPath,
  importFromUrl,           // 🆕 v0.118：URL → base64 → save → vision
  UPLOAD_DIR,
};
