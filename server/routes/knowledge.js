// 项目知识库 API 路由
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const projectStore = require('../stores/project-store');
const knowledgeService = require('../services/knowledge-service');
const scanner = require('../services/knowledge-scanner');
const knowledgeMatcher = require('../services/knowledge-matcher');

// multer 配置：使用系统临时目录
const upload = multer({
  dest: path.join(__dirname, '..', '..', 'data', 'upload-tmp'),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
});

// 确保临时目录存在
const tmpDir = path.join(__dirname, '..', '..', 'data', 'upload-tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

// ── 上传文件 ──

router.post('/:projectId/upload', upload.single('file'), (req, res) => {
  try {
    const { projectId } = req.params;
    const project = projectStore.getById(projectId);
    if (!project) return res.status(404).json({ error: 'PROJ_NOT_FOUND' });

    if (!req.file) return res.status(400).json({ error: 'NO_FILE' });

    const file = req.file;
    const notes = req.body.notes || '';

    // 保存文件到知识库
    const saved = knowledgeService.saveUploadedFile(projectId, project.wiki_vault_path, file);

    // 记录元数据
    const record = knowledgeService.addFileRecord({
      projectId,
      filename: saved.filename,
      originalName: file.originalname,
      size: saved.size,
      mimeType: file.mimetype,
      notes,
    });

    // 更新 log.md
    knowledgeService.appendLog(
      projectId, project.wiki_vault_path,
      `upload | ${file.originalname} (${(saved.size / 1024).toFixed(1)}KB)`
    );

    // 异步触发扫描（不阻塞响应）
    scanner.scanFile(projectId, project.wiki_vault_path, record.id).catch(err => {
      console.error(`[Scanner] ${record.filename}: ${err.message}`);
    });

    res.status(201).json({
      id: record.id,
      filename: record.filename,
      original_name: record.original_name,
      size: saved.size,
      status: record.status,
      uploaded_at: record.uploaded_at,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 文件列表 ──

router.get('/:projectId/files', (req, res) => {
  try {
    const { projectId } = req.params;
    const files = knowledgeService.listFileRecords(projectId);
    res.json(files);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 删除文件 ──

router.delete('/:projectId/files/:fileId', (req, res) => {
  try {
    const { projectId, fileId } = req.params;
    const project = projectStore.getById(projectId);
    if (!project) return res.status(404).json({ error: 'PROJ_NOT_FOUND' });

    const record = knowledgeService.getFileRecord(fileId);
    if (!record) return res.status(404).json({ error: 'FILE_NOT_FOUND' });

    // 删除存储的文件
    knowledgeService.deleteStoredFile(projectId, project.wiki_vault_path, record.filename);

    // 删除元数据
    knowledgeService.deleteFileRecord(fileId);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 知识库目录树 ──

router.get('/:projectId/tree', (req, res) => {
  try {
    const { projectId } = req.params;
    const project = projectStore.getById(projectId);
    if (!project) return res.status(404).json({ error: 'PROJ_NOT_FOUND' });

    const tree = knowledgeService.listKnowledgeTree(projectId, project.wiki_vault_path);
    res.json(tree);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 读取知识页面 ──

router.get('/:projectId/page', (req, res) => {
  try {
    const { projectId } = req.params;
    const pagePath = req.query.path;
    if (!pagePath) return res.status(400).json({ error: 'MISSING_PATH' });

    const project = projectStore.getById(projectId);
    if (!project) return res.status(404).json({ error: 'PROJ_NOT_FOUND' });

    const content = knowledgeService.readPage(projectId, project.wiki_vault_path, pagePath);
    if (content === null) return res.status(404).json({ error: 'PAGE_NOT_FOUND' });

    res.json({ path: pagePath, content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 知识库统计 ──

router.get('/:projectId/stats', (req, res) => {
  try {
    const { projectId } = req.params;
    const project = projectStore.getById(projectId);
    if (!project) return res.status(404).json({ error: 'PROJ_NOT_FOUND' });

    const stats = knowledgeService.getStats(projectId, project.wiki_vault_path);
    stats.uploadCount = knowledgeService.listFileRecords(projectId).length;
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 重新扫描文件 ──

router.post('/:projectId/rescan/:fileId', async (req, res) => {
  try {
    const { projectId, fileId } = req.params;
    const project = projectStore.getById(projectId);
    if (!project) return res.status(404).json({ error: 'PROJ_NOT_FOUND' });

    const record = knowledgeService.getFileRecord(fileId);
    if (!record) return res.status(404).json({ error: 'FILE_NOT_FOUND' });

    // 异步扫描
    const result = await scanner.scanFile(projectId, project.wiki_vault_path, fileId);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 知识匹配（需求文本 → 相关知识页面） ──

router.get('/:projectId/match', (req, res) => {
  try {
    const { projectId } = req.params;
    const { title, description } = req.query;
    if (!title) return res.status(400).json({ error: 'MISSING_TITLE' });

    const project = projectStore.getById(projectId);
    if (!project) return res.status(404).json({ error: 'PROJ_NOT_FOUND' });

    const matches = knowledgeMatcher.matchRequirement(
      projectId, project.wiki_vault_path, title, description || ''
    );
    res.json(matches);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 关联需求与知识页面 ──

router.post('/:projectId/link', (req, res) => {
  try {
    const { projectId } = req.params;
    const { reqId, pagePath, relevance } = req.body;
    if (!reqId || !pagePath) return res.status(400).json({ error: 'MISSING_REQID_OR_PAGE' });

    const link = knowledgeMatcher.linkRequirement(projectId, reqId, pagePath, relevance || 'manual');
    res.status(201).json(link);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 取消关联 ──

router.delete('/:projectId/unlink', (req, res) => {
  try {
    const { reqId, pagePath } = req.body;
    if (!reqId || !pagePath) return res.status(400).json({ error: 'MISSING_REQID_OR_PAGE' });

    knowledgeMatcher.unlinkRequirement(reqId, pagePath);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 获取需求的关联知识 ──

router.get('/:projectId/links/:reqId', (req, res) => {
  try {
    const { projectId, reqId } = req.params;
    const project = projectStore.getById(projectId);
    if (!project) return res.status(404).json({ error: 'PROJ_NOT_FOUND' });

    const links = knowledgeMatcher.getRequirementLinksWithContent(
      projectId, project.wiki_vault_path, reqId
    );
    res.json(links);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 删除知识页面 ──

router.delete('/:projectId/page', (req, res) => {
  try {
    const { projectId } = req.params;
    const pagePath = req.query.path;
    if (!pagePath) return res.status(400).json({ error: 'MISSING_PATH' });

    const project = projectStore.getById(projectId);
    if (!project) return res.status(404).json({ error: 'PROJ_NOT_FOUND' });

    // 不允许删除核心导航文件
    const protectedPages = ['index.md', 'log.md', 'SCHEMA.md'];
    if (protectedPages.includes(pagePath)) {
      return res.status(403).json({ error: 'PROTECTED_PAGE' });
    }

    const deleted = knowledgeService.deletePage(projectId, project.wiki_vault_path, pagePath);
    if (!deleted) return res.status(404).json({ error: 'PAGE_NOT_FOUND' });

    // 更新索引
    const scanner = require('../services/knowledge-scanner');
    scanner.updateIndexAfterScan(projectId, project.wiki_vault_path);

    // 写 log
    knowledgeService.appendLog(projectId, project.wiki_vault_path,
      `delete | 删除页面 ${pagePath}`
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
