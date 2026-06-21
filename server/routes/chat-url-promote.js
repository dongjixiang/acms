// 聊天 URL 抓取结果沉淀到知识库（v0.14，2026-06-21）
// POST /api/chat/url-promote
// body { reqId, url, title }
// 复用 fetch_url tool 缓存（24h）+ v0.9 promote 模式（ensureKnowledgeBase + 扫描）

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const reqStore = require('../stores/requirement-store');
const projectStore = require('../stores/project-store');
const toolRegistry = require('../services/tool-registry');
const knowledgeService = require('../services/knowledge-service');
const knowledgeScanner = require('../services/knowledge-scanner');
const { fetchUrlCore } = require('../tools/url-fetch');

router.post('/url-promote', async (req, res, next) => {
  try {
    const { reqId, url, title } = req.body;
    if (!reqId || !url) {
      return res.status(400).json({ error: 'MISSING_FIELDS' });
    }

    // 1. 拿 req → project_id
    const reqRec = reqStore.getById(reqId);
    if (!reqRec) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
    const projectId = reqRec.project_id || reqRec.projectId;
    if (!projectId) return res.status(400).json({ error: 'REQ_NO_PROJECT' });

    // 2. 拿 project → wiki_vault_path
    const project = projectStore.getById(projectId);
    if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });
    const wikiVaultPath = project.wiki_vault_path;
    if (!wikiVaultPath) return res.status(400).json({ error: 'PROJECT_NO_WIKI_VAULT' });

    // 3. 调 fetch_url tool（24h 缓存 hit 秒返，否则现抓）
    const result = await toolRegistry.execute('fetch_url', { url });
    if (result.error) {
      return res.status(400).json({ error: 'FETCH_FAILED', detail: result.error });
    }

    // 4. 复用 v0.9 ensureKnowledgeBase 拿正确 kbPath
    const kbPath = knowledgeService.ensureKnowledgeBase(projectId, wikiVaultPath);
    const urlFetchDir = path.join(kbPath, 'raw', 'url-fetch');
    fs.mkdirSync(urlFetchDir, { recursive: true });

    // 5. 写 markdown 文件（文件名用 url hash，避免重复 + 特殊字符）
    const urlHash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
    const safeTitle = (result.title || title || 'untitled').replace(/[\\/:*?"<>|\n\r\t]/g, '_').slice(0, 80);
    const fileName = `${urlHash}_${safeTitle}.md`;
    const destPath = path.join(urlFetchDir, fileName);

    const mdContent = buildMarkdown(url, result);
    fs.writeFileSync(destPath, mdContent, 'utf-8');

    // 6. 走 knowledge pipeline（ensureKnowledgeBase 已 init 目录；addFileRecord 写 DB）
    const relativePath = path.relative(wikiVaultPath, destPath);
    const record = knowledgeService.addFileRecord({
      projectId,
      filename: fileName,
      originalName: fileName,
      size: Buffer.byteLength(mdContent, 'utf-8'),
      mimeType: 'text/markdown',
      notes: `[url-fetch] ${url} (req: ${reqId})`.slice(0, 200),
    });

    // 7. 异步触发扫描（fire-and-forget，不阻塞响应）
    setImmediate(() => {
      knowledgeScanner.scanFile(projectId, wikiVaultPath, record.id)
        .catch(e => console.error(`[url-promote] scan failed:`, e.message));
    });

    res.json({
      ok: true,
      fileId: record.id,
      fileName,
      relativePath,
      url,
      title: result.title,
      size: record.size,
      cached: !!result.cached,
      scanned: false,  // 异步中
    });
  } catch (e) {
    next(e);
  }
});

// 拼 markdown 文件内容
function buildMarkdown(url, result) {
  const lines = [];
  lines.push(`# ${result.title || 'Untitled'}`);
  lines.push('');
  lines.push(`> 来源：[${url}](${url})`);
  lines.push(`> 抓取时间：${result.fetchedAt || new Date().toISOString()}`);
  lines.push(`> 字数：${result.length}${result.truncated ? '（已截断）' : ''}`);
  if (result.cached) lines.push('> 来自缓存');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(result.content || '');
  return lines.join('\n');
}

module.exports = router;
