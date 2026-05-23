// 文档导出路由 — 将 Markdown 内容导出为 docx
const express = require('express');
const router = express.Router();
const { collection } = require('../db/connection');
const { mdToDocx } = require('../services/export-service');
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

module.exports = router;
