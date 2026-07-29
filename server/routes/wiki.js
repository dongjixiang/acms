// Wiki API 路由
const express = require('express');
const router = express.Router();
const wikiService = require('../services/wiki-service');
const projectStore = require('../stores/project-store');
const reqStore = require('../stores/requirement-store');
const MiniSearch = require('minisearch');
const fs = require('fs');
const path = require('path');

// ── Wiki 全文索引（v0.76 替换线性扫描，minisearch 内存索引）──
const _wikiIndexes = new Map(); // projectId → { index: MiniSearch, vaultPath: string, builtAt: number }

function buildWikiIndex(projectId, vaultPath) {
  const ALLOWED_EXT = ['.md', '.txt', '.json', '.yaml', '.yml', '.csv', '.xml', '.html'];

  const docs = [];
  function walkDir(dir, basePath = '') {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walkDir(fullPath, relPath);
      } else if (ALLOWED_EXT.includes(path.extname(entry.name).toLowerCase())) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          docs.push({
            id: relPath,
            path: relPath,
            name: entry.name,
            content: content,
            ext: path.extname(entry.name).toLowerCase(),
          });
        } catch { /* skip unreadable files */ }
      }
    }
  }

  walkDir(vaultPath);

  const index = new MiniSearch({
    fields: ['name', 'content'],
    storeFields: ['path', 'name'],
    searchOptions: {
      boost: { name: 3, content: 1 },
      fuzzy: 0.15,
      prefix: true,
    },
  });

  if (docs.length > 0) {
    index.addAll(docs);
    console.log(`[wiki-index] ${projectId}: ${docs.length} 文档已索引`);
  }

  _wikiIndexes.set(projectId, { index, vaultPath, docCount: docs.length, builtAt: Date.now() });
  return index;
}

function getOrBuildWikiIndex(projectId, vaultPath) {
  const cached = _wikiIndexes.get(projectId);
  // 索引有效（12h TTL）且 vault 路径一致
  if (cached && cached.vaultPath === vaultPath && Date.now() - cached.builtAt < 12 * 60 * 60 * 1000) {
    return cached.index;
  }
  return buildWikiIndex(projectId, vaultPath);
}

// 读取 Wiki 页
router.get('/:projectId/page', (req, res) => {
  const project = projectStore.getById(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'PROJ_NOT_FOUND' });

  const pagePath = req.query.path;
  if (!pagePath) return res.status(400).json({ error: 'MISSING_PATH' });

  const content = wikiService.readPage(project.wiki_vault_path, pagePath);
  if (content === null) return res.status(404).json({ error: 'PAGE_NOT_FOUND' });
  res.json({ path: pagePath, content });
});

// 列出 Wiki 目录
router.get('/:projectId/tree', (req, res) => {
  const project = projectStore.getById(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'PROJ_NOT_FOUND' });

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

// 搜索 Wiki（v0.76: 使用 minisearch 全文索引）
router.get('/:projectId/search', (req, res) => {
  const project = projectStore.getById(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'PROJ_NOT_FOUND' });

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'MISSING_QUERY' });

  try {
    const index = getOrBuildWikiIndex(req.params.projectId, project.wiki_vault_path);
    const results = index.search(q, { prefix: true, fuzzy: 0.15 });

    const formatted = results.slice(0, 20).map(r => ({
      path: r.path,
      name: r.name,
      score: r.score,
      snippet: '',
    }));

    // 给结果提取 snippet（取匹配段落的前后几行）
    for (const r of formatted) {
      try {
        const fullPath = path.join(project.wiki_vault_path, r.path);
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        const qLower = q.toLowerCase();
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(qLower)) {
            const start = Math.max(0, i - 1);
            const end = Math.min(lines.length, i + 2);
            r.snippet = lines.slice(start, end).map(l => l.trim()).join(' ').substring(0, 200);
            r.line = i + 1;
            break;
          }
        }
      } catch { /* skip */ }
    }

    console.log(`[wiki-search] ${req.params.projectId}: \"${q}\" → ${formatted.length} 条 (索引)`);
    res.json(formatted);
  } catch (e) {
    console.error(`[wiki-search] 索引搜索失败: ${e.message}`);
    // 降级：原始线性扫描
    const results = [];
    function searchDirFallback(dir, basePath = '') {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const fullPath = path.join(dir, entry.name);
          const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            searchDirFallback(fullPath, relPath);
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
      } catch { /* skip */ }
    }
    searchDirFallback(project.wiki_vault_path);
    res.json(results.slice(0, 20));
  }
});

// 手动触发同步
router.post('/:projectId/sync', (req, res) => {
  const project = projectStore.getById(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'PROJ_NOT_FOUND' });

  const requirements = reqStore.list({ projectId: req.params.projectId, status: 'approved' })
    .concat(reqStore.list({ projectId: req.params.projectId, status: 'in_execution' }))
    .concat(reqStore.list({ projectId: req.params.projectId, status: 'done' }));

  let synced = 0;
  for (const req of requirements) {
    try {
      const content = wikiService.generateRequirementPage(req);
      const pagePath = req.wiki_path || `docs/需求/${req.id}-${req.title.replace(/[/\\?%*:|\"<>]/g, '-')}.md`;
      wikiService.writePage(project.wiki_vault_path, pagePath, content);
      reqStore.update(req.id, { wiki_path: pagePath, wiki_synced: 1, last_wiki_sync: new Date().toISOString() });
      synced++;
    } catch (e) { console.error(`[Wiki] Sync failed for ${req.id}:`, e.message); }
  }

  res.json({ synced, total: requirements.length });
});

module.exports = router;
