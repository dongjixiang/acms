// 文档导出路由 — 将 Markdown 内容导出为 docx / 项目打包下载
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { collection } = require('../db/connection');
const { mdToDocx } = require('../services/export-service');
const { createWorkspaceBundle } = require('../services/bundle-service');
const workspace = require('../services/workspace-service');
const projectStore = require('../stores/project-store');

/**
 * 导出需求文档为 Word (.docx)
 * GET /api/exports/requirement/:id
 */
router.get('/requirement/:id', async (req, res, next) => {
  try {
    const requirement = collection('requirements').findOne(r => r.id === req.params.id);
    if (!requirement) return res.status(404).json({ error: 'REQ_NOT_FOUND' });

    const srs = JSON.parse(requirement.srs || '{}');
    const md = srs.description || requirement.structured_description || requirement.description || '';

    if (!md.trim()) {
      return res.status(400).json({ error: 'NO_CONTENT', message: '该需求暂无可导出的文档内容' });
    }

    const buf = await mdToDocx(md, { title: requirement.title || requirement.id });

    const rawName = `${requirement.id}_${(requirement.title || 'requirement').replace(/[\\/:*?"<>|]/g, '_')}`;

    // 保存副本到工作区
    try {
      const project = projectStore.getById(requirement.project_id);
      if (project) workspace.saveExport(project.slug || project.name, `${rawName}.docx`, buf);
    } catch (e) { /* 非关键 */ }

    const encodedName = encodeURIComponent(rawName);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}.docx`);
    res.setHeader('Content-Length', buf.length);
    res.send(buf);
  } catch (e) { next(e); }
});

/**
 * 导出任务描述为 Word (.docx)
 * GET /api/exports/task/:id
 */
router.get('/task/:id', async (req, res, next) => {
  try {
    const task = collection('tasks').findOne(t => t.id === req.params.id);
    if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });

    const md = task.description || task.title || '';
    if (!md.trim()) {
      return res.status(400).json({ error: 'NO_CONTENT', message: '该任务暂无可导出的描述内容' });
    }

    const buf = await mdToDocx(md, { title: task.title || task.id });

    const rawName = `${task.id}_${(task.title || 'task').replace(/[\\/:*?"<>|]/g, '_')}`;

    // 保存副本到工作区
    try {
      const project = projectStore.getById(task.project_id);
      if (project) workspace.saveExport(project.slug || project.name, `${rawName}.docx`, buf);
    } catch (e) { /* 非关键 */ }

    const encodedName = encodeURIComponent(rawName);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}.docx`);
    res.setHeader('Content-Length', buf.length);
    res.send(buf);
  } catch (e) { next(e); }
});

/**
 * 打包下载整个项目工作区
 * GET /api/exports/project/:projectId/bundle
 */
router.get('/project/:projectId/bundle', async (req, res, next) => {
  try {
    const project = projectStore.getById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });

    const slug = project.slug || project.name;
    const wsPath = path.join(__dirname, '..', '..', 'workspaces', slug);

    if (!fs.existsSync(wsPath)) {
      return res.status(404).json({ error: 'WORKSPACE_EMPTY', message: '工作区尚未初始化' });
    }

    // 检查是否有文件（排除空目录）
    try {
      const files = workspace.listFiles(slug);
      if (!files.length) {
        return res.status(404).json({ error: 'WORKSPACE_EMPTY', message: '工作区暂无文件' });
      }
    } catch (e) { /* 继续 */ }

    const archive = createWorkspaceBundle(wsPath);

    const safeName = (project.name || slug).replace(/[\\/:*?"<>|]/g, '_');
    const date = new Date().toISOString().split('T')[0];
    const filename = safeName + '-workspace-' + date + '.zip';

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename*=UTF-8\'\'' + encodeURIComponent(filename));

    archive.pipe(res);
  } catch (e) {
    if (!res.headersSent) next(e);
  }
});

module.exports = router;
