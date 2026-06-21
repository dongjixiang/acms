// 聊天 URL 抓取结果沉淀到知识库（v0.14，2026-06-21）
// POST /api/chat/url-promote
// body { reqId, url, title, summary? }
//
// 目录分配（按用户要求 2026-06-21）：
//   - MD 摘要 → concepts/（提炼后的知识，非 raw）
//   - 原始 HTML → raw/user-uploads/（原始素材）
//   - PNG 截图 → 不存

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const reqStore = require('../stores/requirement-store');
const projectStore = require('../stores/project-store');
const toolRegistry = require('../services/tool-registry');
const knowledgeService = require('../services/knowledge-service');
const { fetchUrlCore } = require('../tools/url-fetch');

router.post('/url-promote', async (req, res, next) => {
  try {
    const { reqId, url, title, summary } = req.body;
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

    // 4. 准备路径
    const kbPath = knowledgeService.ensureKnowledgeBase(projectId, wikiVaultPath);
    const urlHash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
    const safeTitle = (title || result.title || 'untitled').replace(/[\\/:*?"<>|\n\r\t]/g, '_').slice(0, 80);
    const fileNameBase = `${urlHash}_${safeTitle}`;

    // 5. MD 摘要 → concepts/（非 raw，作为知识沉淀）
    const conceptDir = path.join(kbPath, 'concepts');
    fs.mkdirSync(conceptDir, { recursive: true });
    const mdFileName = `${fileNameBase}.md`;
    const mdPath = path.join(conceptDir, mdFileName);
    const mdContent = buildMarkdown(result, summary);
    fs.writeFileSync(mdPath, mdContent, 'utf-8');

    // 6. 原始 HTML → raw/user-uploads/
    let htmlPath = null;
    if (result.rawHtml) {
      const rawDir = path.join(kbPath, 'raw', 'user-uploads');
      fs.mkdirSync(rawDir, { recursive: true });
      const htmlFileName = `${fileNameBase}.html`;
      htmlPath = path.join(rawDir, htmlFileName);
      // 移除噪声后存 .html
      const cheerio = require('cheerio');
      const $ = cheerio.load(result.rawHtml);
      $('script, style, nav, header, footer, aside, iframe, noscript, ' +
        '.ad, .ads, .advertisement, .sidebar, .menu, .navigation, ' +
        '.comment, .social, .share, .banner, .promo, .recommend, .search, ' +
        '.copyright, .footer-bar, .breadcrumb, .pagination')
        .remove();
      const cleanHtml = $.html();
      fs.writeFileSync(htmlPath, cleanHtml, 'utf-8');
    }

    // 7. PNG 截图 → 不存（用户要求只存提炼的MD + 原始HTML）

    // 8. 注册到 knowledge_files（MD 文件）
    //    注意：不用 scanFile 扫描，concepts/ 下的文件通过 index.md 重建自动纳入
    const relativePath = path.relative(wikiVaultPath, mdPath);
    const record = knowledgeService.addFileRecord({
      projectId,
      filename: mdFileName,
      originalName: mdFileName,
      size: Buffer.byteLength(mdContent, 'utf-8'),
      mimeType: 'text/markdown',
      notes: `[url-fetch] ${url} (req: ${reqId})${htmlPath ? ' +html' : ''}`.slice(0, 200),
    });

    res.json({
      ok: true,
      fileId: record.id,
      fileName: mdFileName,
      relativePath,
      url,
      title: result.title,
      size: record.size,
      cached: !!result.cached,
      hasHtml: !!htmlPath,
    });
  } catch (e) {
    next(e);
  }
});

// 拼 markdown 文件内容（前端传入的 AI 摘要 + 原始元数据）
function buildMarkdown(result, summary) {
  const lines = [];
  lines.push('---');
  lines.push(`title: ${result.title || 'Untitled'}`);
  lines.push('type: reference');
  lines.push(`source: ${result.finalUrl || result.url || ''}`);
  lines.push(`fetched: ${result.fetchedAt || new Date().toISOString()}`);
  lines.push('tags: [url-fetch, reference]');
  lines.push('---');
  lines.push('');
  lines.push(`# ${result.title || 'Untitled'}`);
  lines.push('');
  lines.push(`> 来源：[${result.finalUrl || result.url || ''}](${result.finalUrl || result.url || ''})`);
  lines.push(`> 抓取时间：${result.fetchedAt || new Date().toISOString()}`);
  lines.push(`> 字数：${result.length}${result.truncated ? '（已截断）' : ''}`);
  if (result.cached) lines.push('> 来自缓存');
  lines.push('');
  lines.push(summary || result.content || '(无内容)');
  return lines.join('\n');
}

module.exports = router;
