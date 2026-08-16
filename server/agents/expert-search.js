// 搜索专家 Agent — 调 web_search / fetch_url
const llmAdapter = require('../services/llm-adapter');
const modelStore = require('../stores/model-store');

const SYSTEM_PROMPT = `你是 ACMS 的搜索专家。根据查询词搜索网络并返回结果摘要。
输出 JSON：{"op":"searchResult","query":"查询词","results":[{"title":"...","url":"...","snippet":"..."}]}`;

async function handle({ instruction, context, modelId, caller, agentId }) {
  // 简化实现：直接返回 instruction 作为 search query
  // 后续可扩展为调 web_search service
  return {
    ok: true,
    action: {
      op: 'searchResult',
      query: instruction,
      results: []  // TODO: 接入真实搜索
    }
  };
}

module.exports = {
  id: 'agent-search-expert',
  name: '搜索专家',
  domain: 'search',
  role: 'worker',
  systemPrompt: SYSTEM_PROMPT,
  handler: handle
};
