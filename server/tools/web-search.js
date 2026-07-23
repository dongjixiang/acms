// ACMS 内建工具 — web_search（v0.15，2026-06-21）
// 搜索互联网最新信息
// 后端通过 DuckDuckGo Lite（免费，无需 API Key）

const { searchWeb } = require('../services/web-search');

function normalizeSearchArgs(args = {}) {
  const raw = Number(args.max_results ?? args.maxResults ?? 20);
  if (!Number.isFinite(raw)) return 20;
  return Math.min(20, Math.max(1, Math.trunc(raw)));
}

/**
 * 搜索互联网
 * @param {object} args - { query, maxResults? }
 * @returns {Promise<object>} { results: [{title, url, snippet}], error? }
 */
async function search(args) {
  const query = args?.query;
  if (!query) return { error: '搜索关键词必填' };

  const result = await searchWeb(query, { maxResults: normalizeSearchArgs(args) });
  if (result.error) return { error: result.error };

  // 格式化返回（简洁版用于 LLM prompt + UI 显示）
  // v0.15 fix: 不再用 [title](URL) 格式（自研 markdown 渲染器不支持，会显示成 raw text 加尾巴的 )
  // 改成 title + URL 分行显示：URL 在自己一行，渲染器自动包成 <a> 标签
  const formatted = result.results.map((r, i) => {
    const snip = (r.snippet || '').slice(0, 200);
    return `${i + 1}. **${r.title}**\n   ${r.url}${snip ? '\n   ' + snip : ''}`;
  }).join('\n\n');

  return {
    query,
    count: result.results.length,
    results: result.results,  // 原始结构（供知识库等使用）
    formatted,                // 格式化文本（直接供 LLM 使用）
  };
}

module.exports = { search, normalizeSearchArgs };
