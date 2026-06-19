// ACMS · 聊天附件上传路由（v0.9）
//   - POST /api/chat/upload                  （multer 接收，返回附件元数据 + 解析文本）
//   - GET  /api/chat/upload/:id/raw          （返回文件原始内容，给前端 <img> 预览用）
//   - POST /api/chat/upload/:id/promote      （把聊天附件沉淀到项目知识库，body 带 reqId）
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const svc = require('../services/chat-upload');
const knowledgeService = require('../services/knowledge-service');
const projectStore = require('../stores/project-store');
const reqStore = require('../stores/requirement-store');

// 内存存储（不写临时目录，文件直接进我们的 saveAndParse）
// v0.12：支持多文件同时上传（maxCount=10），单文件仍 20MB 上限
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,  // 单文件 20MB 上限
    files: 10,                     // 最多 10 个文件（multer.array 的二次保护）
  },
  // v0.11 修复：中文文件名乱码（multer 2.x 默认 latin1，会把 UTF-8 字节当 latin1 解码）
  defParamCharset: 'utf8',
});

const ALLOWED_CATEGORIES = new Set(['image', 'pdf', 'docx', 'text', 'code', 'unknown']);

// ── 上传 ──
router.post('/upload', upload.array('file', 10), async (req, res, next) => {
  try {
    // v0.12 多文件上传：req.files 是数组（multer.array），每个元素是单文件
    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ error: 'NO_FILE' });

// 串行处理每个文件（避免服务器瞬时压力，vision 解析慢）
      const results = [];
      for (const file of files) {
        // 大小校验（multer 已经限制，再二次确认）
        if (file.size > 20 * 1024 * 1024) {
          return res.status(413).json({ error: 'FILE_TOO_LARGE', maxMB: 20, name: file.originalname });
        }
        // v0.13 B5 fix: 中文文件名兜底（multer defParamCharset 偶尔失效或不兼容）
        //   策略：总是尝试 latin1→utf8 重新解码，对比哪个版本更像中文
        //   启发式：原 string 的 UTF-8 bytes 如果包含 invalid sequence，说明已被错误解码
        const origName = file.originalname;
        if (origName) {
          const origBuf = Buffer.from(origName, 'utf8');
          // 检查是否含 UTF-8 replacement char (0xEF 0xBF 0xBD)
          const hasReplacementChar = origBuf.includes(Buffer.from([0xEF, 0xBF, 0xBD]));
          // 检查是否含典型 latin1 误解码的高位字符 (Â/Ã/Ä/Å)
          const hasLatin1Artifacts = /[\u00C2\u00C3\u00C4\u00C5]/.test(origName);
          if (hasReplacementChar || hasLatin1Artifacts) {
            try {
              const buf = Buffer.from(origName, 'latin1');
              const decoded = buf.toString('utf8');
              if (!/\uFFFD/.test(decoded) && decoded.length > 0) {
                file.originalname = decoded;
                console.log(`[chat-upload] 🔧 中文文件名兜底修复成功: ${decoded}`);
              }
            } catch (e) { /* 静默 */ }
          }
        }
        const result = await svc.saveAndParse(file);
        if (!ALLOWED_CATEGORIES.has(result.category)) {
          return res.status(415).json({ error: 'UNSUPPORTED_TYPE', mime: result.mime, name: file.originalname });
        }
        results.push(result);
        console.log(`[chat-upload] ✅ ${result.id} | ${result.category} | ${result.name} (${(result.size/1024).toFixed(1)}KB)${result.extractedText ? ' | text=' + result.extractedText.length + 'ch' : ''}`);
      }

    // 单文件保持返回单对象（向后兼容），多文件返回数组
    res.json(files.length === 1 ? results[0] : { files: results, count: results.length });
  } catch (e) {
    next(e);
  }
});

// ── 静态文件读取（用于图片预览 <img src>） ──
router.get('/upload/:id/raw', (req, res) => {
  const found = svc.getFilePath(req.params.id);
  if (!found) return res.status(404).json({ error: 'NOT_FOUND' });
  res.setHeader('Content-Type', found.meta.mime || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(path.resolve(found.filePath));
});

// ── 沉淀聊天附件到知识库（v0.9） ──
//   默认不入库；用户在附件卡上点 "📥 存入知识库" 按钮触发
//   不移动文件，复制一份到项目知识库 raw/user-uploads/
//   源标记写入 notes：[chat-attach] xxx，方便后续追溯
router.post('/upload/:id/promote', async (req, res, next) => {
  try {
    const { reqId, notes } = req.body || {};
    if (!reqId) return res.status(400).json({ error: 'REQ_ID_REQUIRED' });

    // 1. 找附件
    const found = svc.getFilePath(req.params.id);
    if (!found) return res.status(404).json({ error: 'ATTACHMENT_NOT_FOUND' });
    const meta = found.meta;

    // 2. 找项目（req 记录里字段名是 project_id，兼容 projectId 旧字段）
    const reqRec = reqStore.getById(reqId);
    if (!reqRec) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
    const projectId = reqRec.project_id || reqRec.projectId;
    if (!projectId) return res.status(400).json({ error: 'REQ_HAS_NO_PROJECT' });
    const project = projectStore.getById(projectId);
    if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });

    // 3. 复制到知识库 raw/user-uploads/<timestamp>_<safe-name>
    //    路径规则：<wiki_vault_path>/projects/<projectId>/raw/user-uploads/
    //    复用 knowledgeService.ensureKnowledgeBase 拿到正确 kbPath（自动 init 目录）
    const kbPath = knowledgeService.ensureKnowledgeBase(projectId, project.wiki_vault_path);
    const uploadDir = path.join(kbPath, 'raw', 'user-uploads');
    fs.mkdirSync(uploadDir, { recursive: true });

    const timestamp = new Date().toISOString().split('T')[0];
    const safeName = meta.name.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/g, '_');
    const kbFilename = `${timestamp}_${safeName}`;
    const destPath = path.join(uploadDir, kbFilename);
    fs.copyFileSync(found.filePath, destPath);

    // 4. 写 file_records（addFileRecord 签名只接 projectId/filename/originalName/size/mimeType/notes）
    const notesWithSource = `[chat-attach] ${notes || '来自聊天附件'} (req: ${reqId})`;
    const record = knowledgeService.addFileRecord({
      projectId,
      filename: kbFilename,
      originalName: meta.name,
      size: meta.size,
      mimeType: meta.mime,
      notes: notesWithSource,
    });

    // 5. 异步触发扫描（fire-and-forget，不阻塞响应）
    try {
      const knowledgeScanner = require('../services/knowledge-scanner');
      if (typeof knowledgeScanner.scanFile === 'function') {
        knowledgeScanner.scanFile(projectId, project.wiki_vault_path, record.id).catch(err => {
          console.warn(`[chat-upload.promote] 扫描失败（非阻塞）: ${err.message}`);
        });
      }
    } catch (e) {
      console.warn('[chat-upload.promote] 触发扫描失败（非阻塞）:', e.message);
    }

    console.log(`[chat-upload.promote] ✅ ${meta.id} → 知识库 ${projectId}/${kbFilename}`);
    res.json({
      ok: true,
      fileRecordId: record.id,
      kbFilename,
      projectId,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
