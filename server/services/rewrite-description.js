// 需求描述重新组织服务（v0.3.2 极简思路区 增量；v0.3.3 B+++ 累加式补充）
// 用户勾选特色 / 补充想法 → 调 LLM 把「原始需求 + 累积 supplement 历史」重新组织成结构化描述
// 输出：description_history 保留旧版（最近 5 份），description 替换为新版
//       supplement_history 永久保留每次补充（不截断，原始需求透明可追溯）
const { callLLM } = require('./llm-adapter');
const { safeParseJSON } = require('./json-extractor');
const modelStore = require('../stores/model-store');
const reqStore = require('../stores/requirement-store');

const REWRITE_SYSTEM_PROMPT = `你是 ACMS 系统的「需求结构化助手」。你的工作是把零散的需求描述**重新组织**成清晰、结构化的版本。

输入包含：
- 「原始需求」：用户最初写的需求
- 「历史补充」：用户**历次**追加的思考、勾选的产品特色、补充的想法（按时间顺序，已有 1+ 条）
- 「本次新增补充」：最新一次用户主动写的补充

你的任务：把它们整合成一段**结构化、易读**的需求描述，让 PM/技术一眼能看懂。

格式建议（**灵活处理**，不要硬套）：
- 一句话需求（如果能概括）
- 用户场景（谁在什么情况下要做什么）
- 关键功能点（3-7 条）
- 体验/技术倾向（从勾选/补充里提炼）
- 验收关注点（如果有）

要求：
1. **不要逐字搬运**——把啰嗦的痕迹（"[从XX学到的特色] AAA、BBB"）翻译成自然语言
2. **保留所有关键信息**——历史补充里的特色名称、场景、技术倾向**全部保留**，不要因为是历次累积的就丢掉
3. **结构清晰、篇幅适中**——目标 200-500 字，过长不利于后续 LLM 理解
4. **不要新增用户没说的东西**——只整理，不发挥

输出严格 JSON 格式：
{"description": "重新组织后的需求描述"}

不要任何额外文字、markdown 代码块、解释。`;

function pickDefaultLlm() {
  // v0.3.6：优先使用系统配置的「默认思路模型」
  const defaultGen = modelStore.getDefaultGenModel();
  if (defaultGen) return defaultGen;
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0]
      || null;
}

/**
 * 调 LLM 重新组织需求描述
 * @param {string} title
 * @param {string} currentDescription - 当前 description（含痕迹）
 * @param {string} [supplement] - 用户本次手工补充的内容
 * @param {Array<{text, source, at}>} [supplementHistory] - 历次补充（v0.3.3 B+++ 累加式）
 * @param {string} [modelId]
 * @returns {Promise<{description: string, modelId}>}
 */
async function rewriteDescription(title, currentDescription, supplement, supplementHistory, modelId) {
  const model = modelId ? modelStore.getById(modelId) : pickDefaultLlm();
  if (!model) throw new Error('NO_LLM_AVAILABLE');

  // 构造 user message
  const userParts = [
    `需求标题: ${title || '(空)'}`,
    '---',
    '【原始需求 + 累积痕迹】:',
    currentDescription || '(空)',
  ];

  // v0.3.3 B+++：把 supplementHistory 拼成"需求对话历史"段落
  // v0.3.6：包含 role 字段（assistant/user），格式化为对话流
  if (Array.isArray(supplementHistory) && supplementHistory.length > 0) {
    userParts.push('---');
    userParts.push('【需求对话历史】（按时间顺序，包含 AI 提问和用户回答）:');
    supplementHistory.forEach((h, i) => {
      const sourceTag = h.source ? ` [${h.source}]` : '';
      const atTag = h.at ? ` @${h.at.substring(11, 16)}` : '';
      if (h.role === 'assistant') {
        const lines = [];
        if (h.opening) lines.push(`  开场: ${h.opening}`);
        if (h.understanding) lines.push(`  理解: ${h.understanding}`);
        if (h.followup_question) lines.push(`  追问: ${h.followup_question}`);
        // 旧格式降级
        if (lines.length === 0 && h.text) lines.push(`  ${h.text}`);
        userParts.push(`#${i + 1} 🤖 AI${sourceTag}${atTag}:\n${lines.join('\n')}`);
      } else {
        userParts.push(`#${i + 1} ➡️ 用户${sourceTag}${atTag}: ${h.text || ''}`);
      }
    });
  } else if (supplement) {
    // 兼容旧调用：没传 history 但有本次 supplement
    userParts.push('---');
    userParts.push('【本次新增补充】:');
    userParts.push(supplement);
  }
  userParts.push('---');
  userParts.push('请重新组织为结构化需求描述（保持所有关键信息，包括历次补充里的特色/场景/技术倾向，去掉痕迹符号）。');

  const messages = [
    { role: 'system', content: REWRITE_SYSTEM_PROMPT },
    { role: 'user', content: userParts.join('\n') },
  ];

  // v0.3.3 B 方案补丁（2026-06-13）：多层 JSON 提取 + 自动重试
  // LLM 偶尔输出截断/格式异常导致无法解析 → 重试 1 次（不换 prompt，仅再请求）
  // 重试通常能解决：网络瞬断、模型偶发抖动、maxTokens 边界截断
  const parsed = await retryableParse(messages, model);
  if (!parsed) throw new Error('LLM 返回无法解析为 JSON（已重试 1 次）');

  if (!parsed.description || typeof parsed.description !== 'string') {
    throw new Error('LLM 返回的 description 字段缺失或类型错误');
  }
  return { description: parsed.description, modelId: model.id };
}

/**
 * 调用 LLM + 安全 parse；解析失败时自动重试 1 次
 */
async function retryableParse(messages, model) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await callLLM(model.id, messages, {
      temperature: 0.4,
      maxTokens: 1500,
      jsonMode: true,
    });
    const parsed = safeParseJSON(result.content);
    if (parsed) {
      if (attempt === 2) console.log(`[rewrite] 第 2 次重试成功`);
      return parsed;
    }
    console.warn(`[rewrite] LLM 返回无法解析（attempt ${attempt}/2），${attempt < 2 ? '重试中...' : '放弃'}`);
  }
  return null;
}

/**
 * 仅追加补充（v0.3.5 新增；v0.3.6 增强：存储完整对话，含 AI 提问）
 * 与 runRewriteJob 的区别：
 *   - 不调 LLM
 *   - 不改写 description
 *   - 不写 description_history
 *   - 只追加 supplement_history（保留用户原始创作主权）
 *   - description 保持不变 —— 用户最初的描述永远不动
 *   - 保存 AI 当前的问题/理解作为 role=assistant 条目
 * @param {string} requirementId
 * @param {object} opts { supplement, supplementSource }
 *   - supplement: 本次补充内容
 *   - supplementSource: 来源标签（同 runRewriteJob）
 * @returns {Promise<{supplementHistoryCount}>}
 */
async function addSupplement(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) throw new Error('REQ_NOT_FOUND');

  let supplementHistory = [];
  try { supplementHistory = JSON.parse(req.supplement_history || '[]'); } catch { supplementHistory = []; }
  if (Array.isArray(supplementHistory) === false) supplementHistory = [];

  // v0.3.6：先把 AI 当前的 thinking_brief 存为 assistant 条目（提问在前）
  // 把 opening/understanding/followup_question 合并为一条多字段条目
  let brief = null;
  try {
    brief = JSON.parse(req.thinking_brief || 'null');
    if (brief && brief.status === 'done') {
      const parts = {};
      if (brief.opening && typeof brief.opening === 'string' && brief.opening.trim()) parts.opening = brief.opening.trim();
      if (brief.ai_understanding && typeof brief.ai_understanding === 'string' && brief.ai_understanding.trim()) parts.understanding = brief.ai_understanding.trim();
      if (brief.followup_question && typeof brief.followup_question === 'string' && brief.followup_question.trim()) parts.followup_question = brief.followup_question.trim();
      if (Object.keys(parts).length > 0) {
        supplementHistory.push({
          role: 'assistant',
          ...parts,
          source: 'assistant_round',
          at: new Date().toISOString(),
        });
      }
    }
  } catch (e) { /* 静默降级：没有 brief 就不存 assistant 条目 */ }

  // 其次存用户本次补充
  if (opts.supplement && opts.supplement.trim()) {
    supplementHistory.push({
      role: 'user',
      text: opts.supplement.trim(),
      source: opts.supplementSource || 'idea_supplement',
      at: new Date().toISOString(),
    });
  } else {
    // 没内容就不追加（保持幂等）
    return { supplementHistoryCount: supplementHistory.length, added: false };
  }

  reqStore.update(requirementId, {
    supplement_history: JSON.stringify(supplementHistory),
  });

  console.log(`[supplement] ${requirementId} 对话已记录（assistant=${brief ? 'Y' : 'N'} + user），supplement_history: ${supplementHistory.length} 条`);
  return { supplementHistoryCount: supplementHistory.length, added: true };
}

/**
 * 同步执行：rewrite + 保存到数据库
 * - 旧 description 写入 description_history（最近 5 份）
 * - 新 description 替换
 * - 本次 supplement 追加到 supplement_history（永久保留，不截断）
 * - 下次 rewrite 时 supplementHistory 会传给 LLM，让"以原需求 + 所有新元素"为基底
 * @param {string} requirementId
 * @param {object} opts { supplement, supplementSource, modelId }
 *   - supplement: 本次新增内容（textarea 手写 / assist 表态汇总）
 *   - supplementSource: 来源标签 'idea_supplement' / 'decision_tree_features' / 'tradeoff_pick' / 'scenario_pick' / 'arch_pick' / 'diagnosis_use'
 * @returns {Promise<{description, modelId, historyCount, supplementHistoryCount}>}
 */
async function runRewriteJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) throw new Error('REQ_NOT_FOUND');

  const oldDescription = req.description || '';
  // v0.3.3 B+++：读已有的 supplement_history（永久累加），把本次 supplement 拼到末尾
  let supplementHistory = [];
  try { supplementHistory = JSON.parse(req.supplement_history || '[]'); } catch { supplementHistory = []; }
  if (Array.isArray(supplementHistory) === false) supplementHistory = [];
  if (opts.supplement && opts.supplement.trim()) {
    supplementHistory.push({
      role: 'user',
      text: opts.supplement.trim(),
      source: opts.supplementSource || 'idea_supplement',
      at: new Date().toISOString(),
    });
  }

  // 把整个 supplementHistory 喂给 LLM（包含本次 + 所有历史）
  const { description: newDescription, modelId } = await rewriteDescription(
    req.title,
    oldDescription,
    opts.supplement,         // 兼容：本次补充（如果 history 为空也会用）
    supplementHistory,       // v0.3.3 B+++：累加式历史
    opts.modelId
  );

  // 写入 description history（最近 5 份）
  let history = [];
  try { history = JSON.parse(req.description_history || '[]'); } catch { history = []; }
  history.push({
    description: oldDescription,
    supplement: opts.supplement || null,
    rewritten_at: new Date().toISOString(),
    model: modelId,
  });
  if (history.length > 5) history = history.slice(-5);

  reqStore.update(requirementId, {
    description: newDescription,
    description_history: JSON.stringify(history),
    supplement_history: JSON.stringify(supplementHistory),  // v0.3.3 B+++：永久累加
  });

  console.log(`[rewrite] ${requirementId} 描述已重新组织，模型: ${modelId}, history: ${history.length} 条, supplement_history: ${supplementHistory.length} 条`);
  return {
    description: newDescription,
    modelId,
    historyCount: history.length,
    supplementHistoryCount: supplementHistory.length,
  };
}

module.exports = { rewriteDescription, runRewriteJob, addSupplement };
