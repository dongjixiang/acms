// ACMS Email Rule Parser — v0.39（直接调 LLM，不走 Agent 框架）
// 路径：server/services/email-rule-parser.js
//
// v0.39 变更：改用 callLLM 直接调用大模型，不再通过 agent-runtime.execute()。
// 原因：规则解析是单次 prompt→JSON 任务，不需要 tool calling / 多轮推理 / agent 循环。
//       直接调用 LLM 更快、更轻量、无 agent 框架开销。

const modelStore = require('../stores/model-store');
const { callLLM } = require('./llm-adapter');
const { DEFAULT_CATEGORIES } = require('./email-classifier');

// === 预定义动作集合（防 LLM 幻觉：只允许这些动作） ===
const ALLOWED_ACTIONS = {
  archive: '归档（移动到已处理文件夹）',
  label: '设置标签',
  auto_reply: '自动回复（必须同时提供 reply_template，默认关闭）',
  draft_only: '只生成草稿（不发送）',
  notify: '通知用户',
  reply_template: '回复模板（字符串，配合 auto_reply 或 draft_only 使用）',
};

function makeRuleId() {
  return 'er_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function buildSystemPrompt() {
  return `你是一个邮件规则解析助手。将用户的自然语言规则描述解析为 JSON 结构。

规则由两部分组成：
- conditions（条件）：哪些邮件匹配。字段：categories（类别名称列表）、senders（发件人邮箱/关键词列表）、keywords（主题/正文关键词列表）。
- actions（动作）：匹配后执行什么。可选字段：archive（布尔）、label（字符串）、auto_reply（布尔，必须同时有 reply_template 才有效）、draft_only（布尔）、notify（布尔）、reply_template（字符串，回复模板内容）。

重要纪律（借鉴 Inbox-Zero rules 解析）：
- 只从提供的 categories 列表中选择类别（防类目扩散），不创造新类别。
- 如果描述不明确，actions 应尽量保守（auto_reply 默认 false）。
- reply_template 只在用户明确提到"回复""草稿""模板"时才设置。
- 只返回 JSON，不要 markdown 代码块，不要额外解释。`;
}

function buildUserPrompt(description, availableCategories) {
  const cats = availableCategories || DEFAULT_CATEGORIES;
  const catNames = cats.map(c => c.name).join('、');
  return `解析以下自然语言规则描述：

"""${String(description || '').trim()}"""

可用类别（只选这些）：${catNames}

解析为：
{"description":"原描述","conditions":{"categories":[],"senders":[],"keywords":[]},"actions":{"archive":false,"label":"","auto_reply":false,"draft_only":false,"notify":false,"reply_template":""},"confidence":"high|medium|low"}`;
}

function parseLlmOutput(raw, availableCategories) {
  if (!raw) return null;
  let text = String(raw).trim();
  // v0.39: 剥离 reasoning/thinking 标签（agnes-2.5-flash 等思考型模型会包裹 JSON）
  text = text.replace(/<reasoning[\s\S]*?<\/reasoning>/gi, '').replace(/<think[\s\S]*?<\/think>/gi, '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    console.warn('[email-rule-parser] parseLlmOutput: no JSON found, text preview:', text.slice(0, 200));
    return null;
  }
  text = text.slice(start, end + 1);
  try {
    const parsed = JSON.parse(text);
    // 验证结构完整性
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (!parsed.conditions) parsed.conditions = { categories: [], senders: [], keywords: [] };
    if (!parsed.actions) parsed.actions = {};
    // 确保 actions 字段存在
    const a = parsed.actions;
    if (typeof a.archive !== 'boolean') a.archive = Boolean(a.archive);
    if (typeof a.auto_reply !== 'boolean') a.auto_reply = Boolean(a.auto_reply);
    if (typeof a.draft_only !== 'boolean') a.draft_only = Boolean(a.draft_only);
    if (typeof a.notify !== 'boolean') a.notify = Boolean(a.notify);
    if (!a.reply_template) a.reply_template = '';
    if (!a.label) a.label = '';
    // 验证类别（防扩散）
    const validCatNames = new Set((availableCategories || DEFAULT_CATEGORIES).map(c => c.name));
    const categories = (parsed.conditions.categories || []).filter(c => validCatNames.has(String(c).trim()));
    parsed.conditions.categories = categories;
    // 如果解析后没有匹配任何有效类别且没有关键词，则降低 confidence
    if (categories.length === 0 && (parsed.conditions.keywords || []).length === 0 && (parsed.conditions.senders || []).length === 0) {
      parsed.confidence = 'low';
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

async function parseRule(description, mailbox = 'INBOX', modelId = null) {
  try {
    // v0.39: 直接获取模型（不走 agent-runtime）
    let model;
    if (modelId) {
      model = modelStore.getById(modelId);
    }
    if (!model) {
      model = modelStore.getDefaultGenModel();
    }
    if (!model) {
      return { ok: false, error: 'No model available', parsed: null, confidence: 'low' };
    }
    console.log('[email-rule-parser] parsing:', description.slice(0, 80));

    // v0.39: 直接调用 LLM（单次 prompt，无 tool calling，无 agent 循环）
    const result = await callLLM(model.id, [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(description, DEFAULT_CATEGORIES) },
    ], { maxTokens: 400, temperature: 0.2 });

    console.log('[email-rule-parser] LLM result:', JSON.stringify({
      hasContent: !!result.content,
      contentLen: result.content?.length || 0,
      contentPreview: (result.content || '').slice(0, 200),
      error: result.error,
    }));

    if (result.error || !result.content) {
      return { ok: false, error: result.error || 'LLM 无内容', parsed: null, confidence: 'low' };
    }
    const parsed = parseLlmOutput(result.content, DEFAULT_CATEGORIES);
    console.log('[email-rule-parser] parsed:', JSON.stringify(parsed)?.slice(0, 300));
    if (!parsed) {
      return { ok: false, error: 'LLM 输出无法解析为规则 JSON', parsed: null, confidence: 'low' };
    }
    return {
      ok: true,
      parsed,
      confidence: parsed.confidence || 'medium',
      mailbox,
    };
  } catch (e) {
    console.error('[email-rule-parser] exception:', e.message);
    return { ok: false, error: e.message, parsed: null, confidence: 'low' };
  }
}

module.exports = {
  parseRule,
  ALLOWED_ACTIONS,
  DEFAULT_CATEGORIES,
  makeRuleId,
};
