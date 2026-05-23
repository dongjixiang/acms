// Workspace API 路由
const express = require('express');
const router = express.Router();
const workspace = require('../services/workspace-service');
const projectStore = require('../stores/project-store');

function getSlug(projectId) {
  const project = projectStore.getById(projectId);
  return project ? (project.slug || project.name) : null;
}

// 列出工作区文件
router.get('/files/:projectId', (req, res) => {
  const slug = getSlug(req.params.projectId);
  if (!slug) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });
  res.json({ projectSlug: slug, workspacePath: workspace.getPath(slug), files: workspace.listFiles(slug) });
});

// 读取文件内容
router.get('/files/:projectId/read', (req, res) => {
  const slug = getSlug(req.params.projectId);
  if (!slug) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'MISSING_PATH' });
  const content = workspace.readFile(slug, filePath);
  if (content === null) return res.status(404).json({ error: 'FILE_NOT_FOUND' });
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

module.exports = router;
