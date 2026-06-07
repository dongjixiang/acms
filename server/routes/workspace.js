// Workspace API 路由
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const workspace = require('../services/workspace-service');
const projectStore = require('../stores/project-store');
const { collection } = require('../db/connection');

function getSlug(projectId) {
  const project = projectStore.getById(projectId);
  return project ? (project.slug || project.name) : null;
}

// 预览令牌存储: token → { projectId, slug, expires }
const previewTokens = new Map();

// 定期清理过期令牌（每 5 分钟）
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of previewTokens) {
    if (now > entry.expires) previewTokens.delete(token);
  }
}, 5 * 60 * 1000);

// 列出工作区文件（支持 showAll 参数跳过过滤）
router.get('/files/:projectId', (req, res) => {
  const slug = getSlug(req.params.projectId);
  if (!slug) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });
  const showAll = req.query.showAll === '1';
  res.json({ projectSlug: slug, workspacePath: workspace.getPath(slug), files: workspace.listFiles(slug, { showAll }) });
});

// 读取文件内容
router.get('/files/:projectId/read', (req, res) => {
  const slug = getSlug(req.params.projectId);
  if (!slug) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'MISSING_PATH' });
  const content = workspace.readFile(slug, filePath);
  if (content === null) return res.status(404).json({ error: 'FILE_NOT_FOUND' });
  // 如果是图片类二进制文件，返回 base64
  const ext = filePath.toLowerCase();
  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp'];
  if (imageExts.some(e => ext.endsWith(e))) {
    const fs = require('fs');
    const path = require('path');
    const fullPath = path.join(workspace.getPath(slug), filePath);
    const buf = fs.readFileSync(fullPath);
    const b64 = buf.toString('base64');
    const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
      '.webp': 'image/webp', '.bmp': 'image/bmp' };
    const mime = mimeMap[ext.substring(ext.lastIndexOf('.'))] || 'application/octet-stream';
    return res.json({ path: filePath, content: 'data:' + mime + ';base64,' + b64, binary: true });
  }
  res.json({ path: filePath, content });
});

// 写入文件
router.post('/files/:projectId/write', (req, res) => {
  const slug = getSlug(req.params.projectId);
  if (!slug) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });
  const { path: filePath, content } = req.body;
  if (!filePath || content === undefined) return res.status(400).json({ error: 'MISSING_FIELDS' });
  try {
    const result = workspace.writeFile(slug, filePath, content);
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'WRITE_FAILED', message: e.message }); }
});

// 删除文件
router.delete('/files/:projectId', (req, res) => {
  const slug = getSlug(req.params.projectId);
  if (!slug) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'MISSING_PATH' });
  const result = workspace.deleteFile(slug, filePath);
  res.json(result);
});

// 执行命令（沙箱）
router.post('/files/:projectId/exec', async (req, res) => {
  const slug = getSlug(req.params.projectId);
  if (!slug) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });
  const { cwd = '', cmd = '', timeout = 30000 } = req.body;
  if (!cmd) return res.status(400).json({ error: 'MISSING_CMD' });
  try {
    const result = await workspace.exec(slug, { cwd, cmd, timeout });
    res.json(result);
  } catch (e) { res.status(500).json({ error: 'EXEC_FAILED', message: e.message }); }
});

// 初始化工作区（幂等）
router.post('/init/:projectId', (req, res) => {
  const slug = getSlug(req.params.projectId);
  if (!slug) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });
  const wsPath = workspace.init(slug);
  res.json({ workspacePath: wsPath, message: '工作区已就绪' });
});

/**
 * 交付概览 — 统计已交付/缺失的需求
 * GET /api/workspace/overview/:projectId
 */
router.get('/overview/:projectId', (req, res) => {
  const slug = getSlug(req.params.projectId);
  if (!slug) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });

  // 获取所有已完成需求
  const doneReqs = collection('requirements').find(
    r => r.project_id === req.params.projectId && r.status === 'done'
  );

  // 获取工作区文件列表
  const files = workspace.listFiles(slug);
  const codeFiles = files.filter(f => f.path.startsWith('code/'));

  // 收集所有 HTML 文件（用于一键体验选择器）
  const htmlFiles = files
    .filter(f => f.type === '.html')
    .map(f => ({ name: f.name, path: f.path, size: f.size }));

  // 检查项目配置中的自定义预览入口
  let previewEntry = null;
  try {
    const configs = require('./projects');
    // 直接从 collection 查
    const cfgEntry = collection('project_configs').findOne(
      c => c.project_id === req.params.projectId && c.key === 'preview_entry'
    );
    if (cfgEntry && cfgEntry.value) previewEntry = cfgEntry.value;
  } catch (e) { /* */ }

  // 默认入口：配置指定 > index.html > 第一个 HTML 文件
  const hasWebPreview = htmlFiles.length > 0;
  const defaultPreviewFile = previewEntry || (htmlFiles.find(f => f.name === 'index.html') || htmlFiles[0])?.path || null;

  // 按需求统计交付物
  const reqDetails = doneReqs.map(r => {
    const reqFiles = files.filter(f => {
      const name = f.name.toLowerCase();
      return name.includes(r.id.toLowerCase()) ||
             (r.title && name.includes(r.title.replace(/[\\/:*?"<>|]/g, '_').toLowerCase().substring(0, 20)));
    });
    return {
      id: r.id,
      title: r.title || '',
      hasDeliverable: reqFiles.length > 0,
      fileCount: reqFiles.length,
      files: reqFiles.map(f => ({ name: f.name, path: f.path, size: f.size }))
    };
  });

  const withDeliverables = reqDetails.filter(r => r.hasDeliverable).length;
  const missingDeliverables = reqDetails.filter(r => !r.hasDeliverable).length;

  // 总大小
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  // 最近交付时间
  let lastDelivery = null;
  if (files.length > 0) {
    lastDelivery = files.reduce((latest, f) =>
      f.modified > latest ? f.modified : latest, files[0].modified
    );
  }

  res.json({
    totalReqs: doneReqs.length,
    withDeliverables,
    missingDeliverables,
    totalFiles: files.length,
    totalSize,
    lastDelivery,
    hasWebPreview,
    htmlFiles,
    defaultPreviewFile,
    previewEntry,
    reqDetails
  });
});

/**
 * 生成预览令牌（用于 Web 交付物在线体验）
 * POST /api/workspace/preview-token/:projectId
 * 返回 30 分钟有效的临时令牌
 */
router.post('/preview-token/:projectId', (req, res) => {
  const slug = getSlug(req.params.projectId);
  if (!slug) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });

  const token = crypto.randomUUID();
  previewTokens.set(token, {
    projectId: req.params.projectId,
    slug,
    expires: Date.now() + 30 * 60 * 1000  // 30 分钟
  });

  res.json({ token, expiresIn: 1800, url: '/preview/' + token + '/' });
});

// 导出令牌映射供 app.js preview 路由使用
router._previewTokens = previewTokens;

module.exports = router;
