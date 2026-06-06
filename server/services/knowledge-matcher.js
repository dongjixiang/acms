// 知识匹配引擎 — 需求与知识库的匹配、关联管理
const { collection } = require('../db/connection');
const knowledgeService = require('./knowledge-service');

// ── 关键词匹配 ──

function matchRequirement(projectId, wikiVaultPath, title, description) {
  const tree = knowledgeService.listKnowledgeTree(projectId, wikiVaultPath);
  const pageFiles = tree.filter(t => t.type === 'file' && !['index.md', 'log.md', 'SCHEMA.md'].includes(t.name));
  if (pageFiles.length === 0) return [];

  // 提取关键词
  const keywords = extractKeywords(title + ' ' + (description || ''));
  if (keywords.length === 0) return [];

  const matches = [];

  for (const page of pageFiles) {
    const content = knowledgeService.readPage(projectId, wikiVaultPath, page.path);
    if (!content) continue;

    const pageTitle = page.name.replace('.md', '');
    let score = 0;
    let matchedKeywords = [];

    // 1. 标题匹配（权重 3）
    for (const kw of keywords) {
      if (pageTitle.toLowerCase().includes(kw) || kw.includes(pageTitle.toLowerCase())) {
        score += 3;
        matchedKeywords.push(kw);
      }
    }

    // 2. 内容匹配（权重 1）
    const contentLower = content.toLowerCase();
    for (const kw of keywords) {
      if (contentLower.includes(kw)) {
        score += 1;
        if (!matchedKeywords.includes(kw)) matchedKeywords.push(kw);
      }
    }

    if (score > 0) {
      // 提取摘要
      const titleMatch = content.match(/^title:\s*(.+)$/m);
      const displayTitle = titleMatch ? titleMatch[1].trim() : pageTitle;

      matches.push({
        pagePath: page.path,
        title: displayTitle,
        score,
        matchedKeywords,
        relevance: score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low',
      });
    }
  }

  // 按分数降序排列
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 8); // 最多返回 8 个
}

// ── 提取关键词 ──

function extractKeywords(text) {
  if (!text) return [];

  // 去标点、分割
  const cleaned = text
    .replace(/[^\w\u4e00-\u9fff\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const words = cleaned.split(/\s+/).filter(w => w.length >= 2);

  // 中文分词（按字/词提取有意义的单元）
  const chineseChars = text.match(/[\u4e00-\u9fff]+/g) || [];
  const chineseWords = [];
  for (const chunk of chineseChars) {
    // 2-4 字组合
    for (let i = 0; i < chunk.length; i++) {
      for (let len = 2; len <= 4 && i + len <= chunk.length; len++) {
        chineseWords.push(chunk.slice(i, len));
      }
    }
  }

  // 去重合并
  const allWords = [...new Set([...words, ...chineseWords])];

  // 过滤掉常见停用词
  const stopWords = ['的', '了', '是', '在', '有', '和', '就', '不', '人', '都', '一', '一个',
    '可以', '这个', '那个', '需要', '进行', '通过', '使用', '我们', '他们', '你们',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'must',
    'this', 'that', 'these', 'those', 'it', 'its', 'and', 'or', 'but',
    'for', 'with', 'without', 'from', 'to', 'in', 'on', 'at', 'by'];

  return allWords.filter(w => !stopWords.includes(w) && w.length >= 2);
}

// ── 构建知识上下文（用于 AI 澄清注入） ──

function buildKnowledgeContext(matches, projectId, wikiVaultPath) {
  if (matches.length === 0) return null;

  const lines = [
    '## 📚 项目知识库相关信息',
    '',
    '以下知识库页面与当前需求相关，请参考：',
    '',
    '| 相关度 | 页面 | 匹配关键词 |',
    '|--------|------|-----------|',
  ];

  for (const m of matches.slice(0, 5)) {
    const icon = m.relevance === 'high' ? '🔴' : m.relevance === 'medium' ? '🟡' : '🟢';
    lines.push(`| ${icon} ${m.relevance} | ${m.title} ([[${m.pagePath}]]) | ${m.matchedKeywords.join(', ')} |`);

    // 为高相关度页面附带内容摘要
    if (m.relevance === 'high') {
      const content = knowledgeService.readPage(projectId, wikiVaultPath, m.pagePath);
      if (content) {
        // 提取 frontmatter 后的正文（前 300 字）
        const body = content.replace(/^---[\s\S]*?---\n*/, '').trim().slice(0, 300);
        if (body) {
          lines.push('');
          lines.push(`> **${m.title}** 摘要:`);
          lines.push(`> ${body.replace(/\n/g, '\n> ')}`);
        }
      }
    }
  }

  lines.push('');
  lines.push('**请参考以上信息：**');
  lines.push('- 如果需求与已有功能重复，请提醒用户');
  lines.push('- 如果需求涉及修改已有模块，引用相关知识作为基准');
  lines.push('- 提出选择题时，可以引用知识库中的信息作为选项背景');

  return lines.join('\n');
}

// ── 需求-知识关联管理 ──

function linkRequirement(projectId, reqId, pagePath, relevance = 'manual') {
  // 检查是否存在
  const existing = collection('requirement_knowledge').findOne(
    r => r.req_id === reqId && r.page_path === pagePath
  );
  if (existing) return existing;

  const link = {
    req_id: reqId,
    project_id: projectId,
    page_path: pagePath,
    relevance,
    created_at: new Date().toISOString(),
  };
  collection('requirement_knowledge').insert(link);

  // 更新 log
  const project = require('../stores/project-store').getById(projectId);
  if (project) {
    knowledgeService.appendLog(projectId, project.wiki_vault_path,
      `link | 需求 ${reqId} ↔ ${pagePath} (${relevance})`
    );
  }

  return link;
}

function unlinkRequirement(reqId, pagePath) {
  return collection('requirement_knowledge').remove(
    r => r.req_id === reqId && r.page_path === pagePath
  );
}

function getRequirementLinks(reqId) {
  return collection('requirement_knowledge').find(r => r.req_id === reqId);
}

function getRequirementLinksWithContent(projectId, wikiVaultPath, reqId) {
  const links = getRequirementLinks(reqId);
  return links.map(l => {
    const content = knowledgeService.readPage(projectId, wikiVaultPath, l.page_path);
    let title = l.page_path.replace('.md', '').split('/').pop();
    if (content) {
      const titleMatch = content.match(/^title:\s*(.+)$/m);
      if (titleMatch) title = titleMatch[1].trim();
    }
    return { ...l, title, hasContent: !!content };
  });
}

function getProjectRequirementLinks(projectId) {
  return collection('requirement_knowledge').find(r => r.project_id === projectId);
}

module.exports = {
  matchRequirement,
  extractKeywords,
  buildKnowledgeContext,
  linkRequirement,
  unlinkRequirement,
  getRequirementLinks,
  getRequirementLinksWithContent,
  getProjectRequirementLinks,
};
