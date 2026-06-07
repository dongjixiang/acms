// 生成器管理 + 多模态生成 API
const express = require('express');
const router = express.Router();
const genStore = require('../stores/gen-store');
const genAdapter = require('../services/gen-adapter');
const projectStore = require('../stores/project-store');

// ===== 生成器管理 CRUD =====

// 列表
router.get('/', (req, res) => {
  const { type } = req.query;
  res.json(genStore.list(type));
});

// 详情
router.get('/:id', (req, res) => {
  const gen = genStore.getById(req.params.id);
  if (!gen) return res.status(404).json({ error: 'GENERATOR_NOT_FOUND' });
  res.json(gen);
});

// 注册
router.post('/', (req, res, next) => {
  try {
    const { id, type, provider, name, config, modelRef } = req.body;
    if (!id || !type || !provider || !name) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: '缺少必填字段: id, type, provider, name' });
    }
    if (!['image', 'audio'].includes(type)) {
      return res.status(400).json({ error: 'INVALID_TYPE', message: 'type 必须是 image 或 audio' });
    }
    const result = genStore.create({ id, type, provider, name, config, modelRef });
    res.status(201).json(result);
  } catch (e) { next(e); }
});

// 更新
router.patch('/:id', (req, res, next) => {
  try {
    const existing = genStore.getById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'GENERATOR_NOT_FOUND' });
    genStore.update(req.params.id, req.body);
    res.json(genStore.getById(req.params.id));
  } catch (e) { next(e); }
});

// 删除
router.delete('/:id', (req, res) => {
  const existing = genStore.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'GENERATOR_NOT_FOUND' });
  genStore.remove(req.params.id);
  res.json({ success: true });
});

// ===== 图片生成 =====
router.post('/image/:projectId', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { providerId, prompt, params } = req.body;
    if (!prompt) return res.status(400).json({ error: 'MISSING_PROMPT', message: '需要 prompt 字段' });

    const project = projectStore.getById(projectId);
    if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });
    const slug = project.slug || projectId;

    const result = await genAdapter.generateImage(slug, providerId, prompt, params || {});
    res.json(result);
  } catch (e) { next(e); }
});

// ===== 音频生成 =====
router.post('/audio/:projectId', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { providerId, text, params } = req.body;
    if (!text) return res.status(400).json({ error: 'MISSING_TEXT', message: '需要 text 字段' });

    const project = projectStore.getById(projectId);
    if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });
    const slug = project.slug || projectId;

    const result = await genAdapter.generateAudio(slug, providerId, text, params || {});
    res.json(result);
  } catch (e) { next(e); }
});

// ===== Assets 文件服务 =====
router.get('/assets/:projectId/*', (req, res) => {
  const project = projectStore.getById(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });

  const slug = project.slug || req.params.projectId;
  const filePath = req.params[0];  // 通配符捕获的路径
  const fullPath = require('path').join(__dirname, '..', '..', 'workspaces', slug, filePath);

  if (!require('fs').existsSync(fullPath)) {
    return res.status(404).json({ error: 'ASSET_NOT_FOUND' });
  }

  // MIME 推断
  const ext = require('path').extname(fullPath).toLowerCase();
  const mimeMap = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.mp4': 'video/mp4',
  };
  const mime = mimeMap[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(fullPath);
});

// ===== 知识库扫描端点（在多模态生成闭环中使用）=====
router.post('/:projectId/scan-asset', async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { assetPath, requirementId, taskId, prompt, metadata } = req.body;
    if (!assetPath) return res.status(400).json({ error: 'MISSING_ASSET_PATH' });

    const projectStore = require('../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });

    const wikiVaultPath = project.wiki_vault_path;
    if (!wikiVaultPath) return res.status(400).json({ error: 'NO_WIKI', message: '项目未配置 Wiki 路径' });

    const scanner = require('../services/knowledge-scanner');
    const result = await scanner.scanGeneratedAsset(projectId, wikiVaultPath, assetPath, {
      requirementId: requirementId || null,
      taskId: taskId || null,
      prompt: prompt || '',
      metadata: metadata || null,
    });

    res.json(result);
  } catch (e) { next(e); }
});

module.exports = router;
