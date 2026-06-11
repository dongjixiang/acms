// 需求描述重新组织服务（v0.3.2 极简思路区 增量）
// 用户勾选特色 / 补充想法 → 调 LLM 把「原始需求 + 痕迹」重新组织成结构化描述
// 输出：description_history 保留旧版，description 替换为新版
const { callLLM } = require('./llm-adapter');
const modelStore = require('../stores/model-store');
const reqStore = require('../stores/requirement-store');

const REWRITE_SYSTEM_PROMPT = `你是 ACMS 系统的「需求结构化助手」。你的工作是把零散的需求描述**重新组织**成清晰、结构化的版本。

输入包含：
- 「原始需求」：用户最初写的需求
- 「补充内容」：用户后续追加的思考、勾选的产品特色、补充的想法

你的任务：把它们整合成一段**结构化、易读**的需求描述，让 PM/技术一眼能看懂。

格式建议（**灵活处理**，不要硬套）：
- 一句话需求（如果能概括）
- 用户场景（谁在什么情况下要做什么）
- 关键功能点（3-7 条）
- 体验/技术倾向（从勾选/补充里提炼）
- 验收关注点（如果有）

要求：
1. **不要逐字搬运**——把啰嗦的痕迹（"[从XX学到的特色] AAA、BBB"）翻译成自然语言
2. **保留所有关键信息**——不要丢特色名称、场景、技术倾向
3. **结构清晰、篇幅适中**——目标 200-500 字，过长不利于后续 LLM 理解
4. **不要新增用户没说的东西**——只整理，不发挥

输出严格 JSON 格式：
{"description": "重新组织后的需求描述"}

不要任何额外文字、markdown 代码块、解释。`;

function pickDefaultLlm() {
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0]
      || null;
}

/**
 * 调 LLM 重新组织需求描述
 * @param {string} title
 * @param {string} currentDescription - 当前 description（含痕迹）
 * @param {string} [supplement] - 用户手工补充的内容
 * @param {string} [modelId]
 * @returns {Promise<{description: string, modelId}>}
 */
async function rewriteDescription(title, currentDescription, supplement, modelId) {
  const model = modelId ? modelStore.getById(modelId) : pickDefaultLlm();
  if (!model) throw new Error('NO_LLM_AVAILABLE');

  // 构造 user message
  const userParts = [
    `需求标题: ${title || '(空)'}`,
    '---',
    '【原始需求 + 累积痕迹】:',
    currentDescription || '(空)',
  ];
  if (supplement) {
    userParts.push('---');
    userParts.push('【本次新增补充】:');
    userParts.push(supplement);
  }
  userParts.push('---');
  userParts.push('请重新组织为结构化需求描述（保持所有关键信息，去掉痕迹符号）。');

  const messages = [
    { role: 'system', content: REWRITE_SYSTEM_PROMPT },
    { role: 'user', content: userParts.join('\n') },
  ];

  const result = await callLLM(model.id, messages, {
    temperature: 0.4,  // 较低温度，保持忠实于原始信息
    maxTokens: 1500,
    jsonMode: true,
  });

  // 多层 JSON 提取
  let content = (result.content || '').trim();
  if (content.startsWith('```')) {
    content = content.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  }
  const jsonStart = content.indexOf('{');
  if (jsonStart >= 0) content = content.substring(jsonStart);
  const jsonEnd = content.lastIndexOf('}');
  if (jsonEnd > jsonStart) content = content.substring(0, jsonEnd + 1);
  const parsed = JSON.parse(content);

  if (!parsed.description || typeof parsed.description !== 'string') {
    throw new Error('LLM 返回的 description 字段缺失或类型错误');
  }
  return { description: parsed.description, modelId: model.id };
}

/**
 * 同步执行：rewrite + 保存到数据库
 * - 旧 description 写入 description_history
 * - 新 description 替换
 * @param {string} requirementId
 * @param {object} opts { supplement, modelId }
 * @returns {Promise<{description, modelId, historyCount}>}
 */
async function runRewriteJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) throw new Error('REQ_NOT_FOUND');

  const oldDescription = req.description || '';
  const { description: newDescription, modelId } = await rewriteDescription(
    req.title,
    oldDescription,
    opts.supplement,
    opts.modelId
  );

  // 写入 history
  let history = [];
  try { history = JSON.parse(req.description_history || '[]'); } catch { history = []; }
  history.push({
    description: oldDescription,
    supplement: opts.supplement || null,
    rewritten_at: new Date().toISOString(),
    model: modelId,
  });

  // 保留最近 5 份历史
  if (history.length > 5) history = history.slice(-5);

  reqStore.update(requirementId, {
    description: newDescription,
    description_history: JSON.stringify(history),
  });

  console.log(`[rewrite] ${requirementId} 描述已重新组织，模型: ${modelId}, history: ${history.length} 条`);
  return { description: newDescription, modelId, historyCount: history.length };
}

module.exports = { rewriteDescription, runRewriteJob };
