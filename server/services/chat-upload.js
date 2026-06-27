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

// ── 图片 vision 描述（复用 knowledge-scanner 的 LLM 调用） ──
async function describeImage(imagePath, maxTokens = 800) {
  try {
    const { analyzeFileWithLLM } = require('./knowledge-scanner');
    // 提示词：让模型描述图片，输出简洁中文（避免长篇大论挤爆 token）
    const prompt = `请用简洁的中文（不超过 400 字）描述这张图片的内容，重点说明：\n1. 图的类型（截图/照片/图表/界面等）\n2. 关键信息（文字、布局、UI 元素、数据趋势等）\n3. 如果是界面截图，说明页面名称和主要功能模块\n\n只输出描述，不要前缀或解释。`;
    const result = await Promise.race([
      analyzeFileWithLLM(prompt, imagePath, maxTokens),
      new Promise((_, rej) => setTimeout(() => rej(new Error('VISION_TIMEOUT')), VISION_TIMEOUT_MS)),
    ]);
    return (result && typeof result === 'string') ? result.trim() : null;
  } catch (e) {
    console.warn('[chat-upload] 图片 vision 描述失败:', e.message);
    return null;
  }
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

module.exports = { saveAndParse, getFilePath, readImageAsDataURI, UPLOAD_DIR };
