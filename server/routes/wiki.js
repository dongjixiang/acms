// Wiki API 路由
const express = require('express');
const router = express.Router();
const wikiService = require('../services/wiki-service');
const projectStore = require('../stores/project-store');
const reqStore = require('../stores/requirement-store');

// 读取 Wiki 页
router.get('/:projectId/page', (req, res) => {
  const project = projectStore.getById(req.params.projectId);
  if (!project || !project.wiki_vault_path) return res.status(404).json({ error: 'WIKI_NOT_CONFIGURED' });

  const pagePath = req.query.path;
  if (!pagePath) return res.status(400).json({ error: 'MISSING_PATH' });

  const content = wikiService.readPage(project.wiki_vault_path, pagePath);
  if (content === null) return res.status(404).json({ error: 'PAGE_NOT_FOUND' });
  res.json({ path: pagePath, content });
});

// 列出 Wiki 目录
router.get('/:projectId/tree', (req, res) => {
  const project = projectStore.getById(req.params.projectId);
  if (!project || !project.wiki_vault_path) return res.status(404).json({ error: 'WIKI_NOT_CONFIGURED' });

  const fs = require('fs');
  const path = require('path');
  const basePath = req.query.path ? path.join(project.wiki_vault_path, req.query.path) : project.wiki_vault_path;

  try {
    const entries = fs.readdirSync(basePath, { withFileTypes: true });
    const tree = entries
      .filter(e => !e.name.startsWith('.') && !e.name.startsWith('_'))
      .map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file', path: req.query.path ? `${req.query.path}/${e.name}` : e.name }));
    res.json(tree);
  } catch (e) { res.status(404).json({ error: 'PATH_NOT_FOUND' }); }
});

// 搜索 Wiki
router.get('/:projectId/search', (req, res) => {
  const project = projectStore.getById(req.params.projectId);
  if (!project || !project.wiki_vault_path) return res.status(404).json({ error: 'WIKI_NOT_CONFIGURED' });

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'MISSING_QUERY' });

  // 简单全文搜索（遍历 .md 文件）
  const fs = require('fs');
  const path = require('path');
  const results = [];

  function searchDir(dir, basePath = '') {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(dir, entry.name);
        const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          searchDir(fullPath, relPath);
        } else if (entry.name.endsWith('.md')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(q.toLowerCase())) {
              results.push({ path: relPath, line: i + 1, snippet: lines[i].trim().substring(0, 200) });
              if (results.length >= 20) return;
            }
          }
        }
      }
    } catch (e) { /* skip */ }
  }

  searchDir(project.wiki_vault_path);
  res.json(results.slice(0, 20));
});

// 手动触发同步
router.post('/:projectId/sync', (req, res) => {
  const project = projectStore.getById(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'PROJ_NOT_FOUND' });

  // 同步所有需求到 Wiki
  const requirements = reqStore.list({ projectId: req.params.projectId, status: 'approved' })
    .concat(reqStore.list({ projectId: req.params.projectId, status: 'in_execution' }))
    .concat(reqStore.list({ projectId: req.params.projectId, status: 'done' }));

  let synced = 0;
  for (const req of requirements) {
    try {
      const content = wikiService.generateRequirementPage(req);
      const pagePath = req.wiki_path || `docs/需求/${req.id}-${req.title.replace(/[/\\?%*:|"<>]/g, '-')}.md`;
      wikiService.writePage(project.wiki_vault_path, pagePath, content);
      reqStore.update(req.id, { wiki_path: pagePath, wiki_synced: 1, last_wiki_sync: new Date().toISOString() });
      synced++;
    } catch (e) { console.error(`[Wiki] Sync failed for ${req.id}:`, e.message); }
  }

  res.json({ synced, total: requirements.length });
});

module.exports = router;
