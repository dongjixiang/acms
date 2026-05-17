// AI 澄清服务 — 连接大模型进行需求澄清
const modelStore = require('../stores/model-store');
const reqStore = require('../stores/requirement-store');
const { getDecryptedKey } = require('../stores/model-store');

const CLARIFY_SYSTEM_PROMPT = `你是一个专业的需求分析师。用户提交了一个需求，你需要通过选择题的方式帮助澄清需求细节。

**核心原则：**
1. 尽量用选择题让用户选择，降低用户负担——不要问开放式问题
2. 每次回复后，根据讨论结果更新需求规格说明（SRS）
3. 当需求足够清晰时，生成完整的 SRS 并告知用户可以提交审核

**回复格式（严格JSON）：**
{
  "message": "你的分析和对用户说的话（友好、简洁）",
  "choices": [
    { "id": "A", "question": "关于XX方面", "options": ["选项1", "选项2", "选项3"], "allowCustom": true }
  ],
  "srs": {
    "scopeIn": ["已确认的功能1", "功能2"],
    "scopeOut": ["明确排除的"],
    "acceptanceCriteria": ["验收标准1", "验收标准2"],
    "summary": "300字以内的需求摘要",
    "status": "clarifying"
  },
  "readyForReview": false
}

**何时设置 readyForReview=true：**
- 所有关键决策点已确认（功能范围、技术方案、验收标准）
- 没有明显的模糊点
- 用户表达了满意或想提交的意思

当前需求信息会以 JSON 格式提供。请始终保持 JSON 输出格式。`;

async function clarify(reqId, modelId, userMessage, conversationHistory) {
  const model = modelStore.getById(modelId);
  if (!model) throw Object.assign(new Error('模型不存在'), { status: 404 });

  const apiKey = getDecryptedKey(modelId);
  if (!apiKey) throw Object.assign(new Error('模型未配置 API Key'), { status: 400 });

  const requirement = reqStore.getById(reqId);
  if (!requirement) throw Object.assign(new Error('需求不存在'), { status: 404 });

  // 构建消息
  const srs = JSON.parse(requirement.srs || '{}');
  const context = {
    title: requirement.title,
    description: requirement.description || '',
    priority: requirement.priority,
    currentSRS: srs,
  };

  const messages = [
    { role: 'system', content: model.systemPrompt || CLARIFY_SYSTEM_PROMPT },
    { role: 'system', content: `当前需求上下文:\n${JSON.stringify(context, null, 2)}` },
    ...(conversationHistory || []).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.role === 'user' ? m.content : (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)),
    })),
  ];

  if (userMessage) {
    messages.push({ role: 'user', content: userMessage });
  } else if (!conversationHistory || conversationHistory.length === 0) {
    messages.push({ role: 'user', content: '请开始分析这个需求，用选择题帮助我澄清细节。' });
  }

  // 调用 LLM
  const baseUrl = model.baseUrl || 'https://api.deepseek.com/v1';
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model.model,
      messages,
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw Object.assign(new Error(`LLM 调用失败: ${resp.status} ${err}`), { status: 502 });
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    // 不是严格 JSON，尝试提取
    parsed = { message: content, choices: [], srs: srs, readyForReview: false };
  }

  // 更新 SRS
  if (parsed.srs && Object.keys(parsed.srs).length > 0) {
    const updatedSrs = { ...srs, ...parsed.srs };
    reqStore.updateSrs(reqId, updatedSrs);
  }

  return {
    message: parsed.message || '',
    choices: parsed.choices || [],
    srs: parsed.srs || srs,
    readyForReview: parsed.readyForReview || false,
    modelUsed: `${model.name} (${model.model})`,
  };
}

module.exports = { clarify, CLARIFY_SYSTEM_PROMPT };
