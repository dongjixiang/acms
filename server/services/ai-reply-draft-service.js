// AI 代答服务 — 让 AI 模拟用户角色起草回复（v0.13 B5）
// 与 ai-clarify-service 区分：前者是"AI 提问"，这里是"AI 代用户答"
const reqStore = require('../stores/requirement-store');
const modelStore = require('../stores/model-store');
const { callLLM } = require('./llm-adapter');
const { safeParseJSON } = require('./json-extractor');

/**
 * 基于上下文生成 AI 代答草稿（纯文本，不写库）
 * @param {string} reqId 需求 ID
 * @param {string} [modelId] LLM 模型 ID（缺省时 server 自动选默认）
 * @param {Array} chatHistory [{role:'user'|'assistant', content:'...'}, ...] 最近 chat 流
 * @returns {Promise<{ok:boolean, draft?:string, error?:string, modelUsed?:string}>}
 */
async function generateDraft(reqId, modelId, chatHistory = []) {
  const requirement = reqStore.getById(reqId);
  if (!requirement) return { ok: false, error: 'REQ_NOT_FOUND' };

  // v0.13 B5 fix: modelId 缺省时用 admin 设置的默认思路模型（与 chatSendSupplement 一致）
  let effectiveModelId = modelId;
  if (!effectiveModelId) {
    const def = modelStore.getDefaultGenModel();
    effectiveModelId = def?.id || null;
  }
  if (!effectiveModelId) return { ok: false, error: 'NO_MODEL_AVAILABLE', message: '管理界面尚未设置默认大模型' };

  const model = modelStore.getById(effectiveModelId);
  if (!model) return { ok: false, error: 'MODEL_NOT_FOUND' };

  // 上下文：原始需求 + chat 流最近 6 轮（避免 prompt 过长）
  const recentHistory = (chatHistory || []).slice(-6);
  const historyText = recentHistory.map((h, i) => {
    const role = h.role === 'user' ? '用户' : 'AI';
    return `[${i + 1}] ${role}: ${(h.content || '').slice(0, 400)}`;
  }).join('\n');

  const systemPrompt = `你是「AI 代答助手」。当前用户正在和一个 AI 助手对话澄清需求。

# 任务
基于上下文（用户原始需求 + 最近对话），替用户起草一段回复内容。
- 模拟用户角度，用用户可能的语气和思路回答 AI 的最后一个问题
- 自然、简洁、1-3 句话（不要超过 80 字）
- 如果 AI 的问题用户还没想清楚，给出一个"可能方向"让用户后续修改
- 不需要完美 — 用户拿到后可以改

# 输出格式（严格 JSON）
{"draft": "草拟的回复文本"}

不要输出 markdown，不要解释，不要前缀后缀。`;

  const userPrompt = `需求标题：${requirement.title || '(无)'}

需求描述：
${(requirement.description || '(无描述)').slice(0, 800)}

最近对话：
${historyText || '(无对话记录)'}

请基于以上上下文，替用户起草回复：`;

  try {
    const result = await callLLM(effectiveModelId, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], {
      temperature: 0.7,
      maxTokens: 4000,
      jsonMode: true,
      projectId: requirement.project_id,
      caller: 'ai-reply-draft',
    });

    const parsed = safeParseJSON(result.content);
    if (!parsed || typeof parsed.draft !== 'string') {
      return { ok: false, error: 'LLM_OUTPUT_INVALID', raw: (result.content || '').slice(0, 200) };
    }

    return {
      ok: true,
      draft: parsed.draft.trim(),
      modelUsed: effectiveModelId,
    };
  } catch (e) {
    return { ok: false, error: 'LLM_CALL_FAILED', message: e.message };
  }
}

module.exports = { generateDraft };