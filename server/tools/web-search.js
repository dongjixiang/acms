// ACMS 内建工具 — web_search（v0.15，2026-06-21）
// 搜索互联网最新信息
// 后端通过 DuckDuckGo Lite（免费，无需 API Key）

const { searchWeb } = require('../services/web-search');

/**
 * 搜索互联网
 * @param {object} args - { query, maxResults? }
 * @returns {Promise<object>} { results: [{title, url, snippet}], error? }
 */
async function search(args) {
  const query = args?.query;
  if (!query) return { error: '搜索关键词必填' };

  const result = await searchWeb(query, { maxResults: args?.maxResults || 8 });
  if (result.error) return { error: result.error };

  // 格式化返回（简洁版用于 LLM prompt）
  const formatted = result.results.map((r, i) => {
    return `${i + 1}. [${r.title}](${r.url})\n   ${(r.snippet || '').slice(0, 200)}`;
  }).join('\n\n');

  return {
    query,
    count: result.results.length,
    results: result.results,  // 原始结构（供知识库等使用）
    formatted,                // 格式化文本（直接供 LLM 使用）
  };
}

module.exports = { search };
