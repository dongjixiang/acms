// LLM 路由器（v0.3.3 Phase 2 + v0.3.3 B+++ 视觉辅助）
// 输入：当前 clarity + chat_round + 已用 methods + AI 理解
// 输出：建议下一轮用哪种辅助手段 + reason（≤40 字）
//
// 设计原则：
//   - 不重复：used_methods 里出现过的 method 不会被再选
//   - 不强推 visual：visual 是高消耗手段，仅在 focus 明确指向"具象化方向对比"时由路由器推荐
//   - clarity 优先：low 时优先 diagnosis（诊断模糊），high 时优先 tradeoff（细化取舍）

const { callLLM } = require('../llm-adapter');
const { safeParseJSON } = require('../json-extractor');
const modelStore = require('../../stores/model-store');
const { ASSIST_METHODS } = require('./index');
const elicitorAdapter = require('../elicitor-adapter');  // v0.4 Phase 0：软开关 + 健康检查

function pickDefaultLlm() {
  // v0.3.6：优先使用系统配置的「默认思路模型」
  const defaultGen = modelStore.getDefaultGenModel();
  if (defaultGen) return defaultGen;
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0]
      || null;
}

const ROUTER_SYSTEM_PROMPT = `你是 ACMS 系统的「辅助手段路由器」。你的工作是基于当前对话状态，推荐下一步用什么**一种**辅助手段帮用户澄清需求。

## 可选手段
- **scenarios** （场景剧本）：用 3 个典型用户场景让用户挑"我最像哪一个"。适合：用户说不清面向谁 / 场景模糊时。
- **diagnosis** （需求体检）：指出描述里的模糊表达 / 缺的关键维度。适合：描述看起来不少但其实是空话时。
- **tradeoff** （取舍清单）：列出该需求里"必然会取舍"的维度对，让用户表态倾向。适合：用户开始问"我应该怎么选"时。
- **arch** （信息架构图）：列出核心页面/模块的卡片布局，让用户圈出"我要这些"。适合：用户开始想"系统长什么样"时。
- **decision_tree** （决策树）：3 个互不重叠的实现形态/方向，让用户挑一个。适合：用户明确要落地、但不知道走哪条路时。
- **visual** （视觉预览）：生成 3 张方向图，让用户选一个最像的方向。适合：用户已经定了 1 个方向、但想看视觉具象化时（如选了决策树的某个分支，或挑了场景后想预览）。**注意：消耗 3 张图的 token，仅在用户已经收窄到 1-2 个具体方向时才推荐。**

## 输入
- 当前明确度 clarity: high / medium / low / null
- 对话轮次 chat_round: 数字（1 表示首轮）
- 已用手段 used_methods: 用户已经表态过（勾选/挑场景/表态）的 method 列表 — 这些**永远不再选**
- 本轮已用 round_used_methods: 当前 chat_round 这次对话里已经被推荐/生成过的 method — 这些**本轮不再选**（用户表态后 chat_round 增加，会自动解锁）
- AI 理解 ai_understanding: 当前 AI 对需求核心意图的提炼
- **当前焦点 followup_question**: AI 在对话流里当前最想知道的开放问题（≤40 字）—— **这是用户当下最关心的取舍点**，method 选择 + 生成内容都要围绕它

## 选择规则（v0.3.3 B 方案补丁：焦点驱动）
1. **不重复**：used_methods 和 round_used_methods 里的 method 不要再选
2. **首轮豁免（系统级）**：chat_round === 1 时**系统已经跳过推荐**，LLM 不会收到这种调用——若收到说明是 force=true，主动忽略本规则。chat_round >= 2 时正常推荐
3. **焦点驱动选 method**（**核心规则**）：先读 followup_question，识别用户在问什么类型的取舍：
   - 焦点是**面向谁/典型用户**（谁会用？/ 用户画像 / 什么场景）→ 选 **scenarios**（3 个典型用户场景帮用户定位）
   - 焦点是**X 还是 Y 的取舍**（轻 vs 重 / 自动 vs 手动 / 简单 vs 强大）→ 选 **tradeoff**（把这个取舍摆出来让用户表态）
   - 焦点是**系统长什么样/模块划分**（怎么组织 / 页面/模块 / 信息架构）→ 选 **arch**（列核心模块让用户圈）
   - 焦点是**走哪条路/选哪个方向**（先做哪 / 主攻哪个 / 怎么落地）→ 选 **decision_tree**（3 个互斥方向让用户挑）
   - 焦点是**描述里缺什么/哪里没说清楚** → 选 **diagnosis**（扫模糊表达）
   - 焦点是**已定方向但想看视觉**（想要 1 张图看看长啥样 / 视觉化预览 / 选好了方向想具象化）→ 选 **visual**（3 张方向图）
   - **没有明确焦点**（followup_question 为空）→ 按 priority: scenarios > tradeoff > arch > decision_tree > diagnosis（visual 仅在 chat_round >= 3 且前 2 种已用过后兜底）
4. **慎用 diagnosis**：diagnosis 是挑刺型，只有当焦点真的指向描述里缺什么时才用
5. **慎用 visual**：visual 是高消耗手段（3 张图），仅在 chat_round >= 2 且用户已经表过态（usedMethods 不为空）、想看具象化时才推荐；其他时候不主动选
6. **一次只选一种**：不要同时推多种 — 候选里挑一个最合适的就行

## 输出（严格 JSON）
{
  "method": "scenarios|diagnosis|tradeoff|arch|decision_tree",
  "reason": "≤40 字。告诉用户为什么选这个（用第二人称，比如「你的需求模糊，先体检一下哪里没说清楚」）"
}

不要任何额外文字、markdown 代码块、解释。`;

/**
 * LLM 选一种辅助手段
 * @param {object} ctx { clarity, chatRound, usedMethods, roundUsedMethods, aiUnderstanding, followupQuestion, force }
 *   - usedMethods: 用户已表态过的 method（永远锁）
 *   - roundUsedMethods: 当前 chat_round 这次对话已生成的 method（本轮锁，下一轮解锁）
 *   - followupQuestion: brief 当前焦点（≤40 字），决定 method 选择 + 生成内容
 *   - force: true 跳过"首轮不推"豁免（用户主动调用 /assist/run 时用）
 * @param {string} [modelId]
 * @returns {Promise<{method, reason, modelId}>}
 */
async function pickNext(ctx, modelId) {
  // v0.4 Phase 0 安全网：检查 elicitor SKILL 是否启用
  //   - 未启用 / 健康检查失败 → 直接走 fallback，不调 LLM（行为与原 fallbackPick 一致）
  //   - Phase 1+ 才会在此处真正接入 elicit 路径（产出 diagnosis.type）
  //   - 当前实现：禁用 elicitor 等同于绕开任何 elicit 影响，旧行为完全不变
  const elicitCheck = elicitorAdapter.canRun();
  if (!elicitCheck.ok && process.env.ELICITOR_FALLBACK_SHORT_CIRCUIT === 'true') {
    return { ...fallbackPick(ctx), modelId: null, elicitorSkipped: true, elicitReason: elicitCheck.reason };
  }

  // v0.4 Phase 2a：diagnosis.type 作为第一优先级权重
  //   - blank 类型：当前不推卡片，返回 null 让 Phase 2b 接管（走 toolbox 对话）
  //   - vague / conflicted：把 type 信息注入 LLM prompt，让 LLM 偏向对应 method
  //   - null：完全走原逻辑（diagnosis 没产出 → 行为不变）
  const diagnosisType = ctx.diagnosis?.type || null;
  if (diagnosisType === 'blank') {
    return {
      method: null,
      reason: 'diagnosis=blank：当前阶段应走 toolbox 对话路径（Phase 2b 接入），暂不推卡片',
      modelId: null,
      elicitSkipped: true,
      elicitReason: 'diagnosis=blank',
    };
  }

  const model = modelId ? modelStore.getById(modelId) : pickDefaultLlm();
  if (!model) {
    // 退化：按 clarity 阶梯给个默认值
    return { ...fallbackPick(ctx), modelId: null };
  }

  // 候选列表（去掉 用户用过 + 本轮已生成；visual 保留在候选里，由 LLM 决定是否选）
  const used = ctx.usedMethods || [];
  const roundUsed = ctx.roundUsedMethods || [];
  const locked = new Set([...used, ...roundUsed]);
  // v0.3.3 B+++：visual 不再硬过滤；保留在候选里，让 LLM 焦点驱动决定
  const candidates = ASSIST_METHODS.filter(m => !locked.has(m));

  // v0.3.3 B 方案补丁（2026-06-13）：首轮豁免（让用户先自己思考）
  //   多多原话："第一轮不先要出辅助手段，让用户有机会自我思考。后面等用户思维疲惫了，就可以多出辅助手段"
  //   实现：chat_round === 1（首轮）且用户未主动召唤 → 跳过推荐
  //   chat_round >= 2 即可推辅助手段（用户已独立思考过 1 轮，AI 该登场救场了）
  //   手动 force=true 可豁免（如 /assist/run 用户主动触发）
  const round = ctx.chatRound || 1;
  const force = ctx.force === true;
  if (!force && round === 1) {
    return {
      method: null,
      reason: '首轮让用户先自己思考，暂不推辅助手段',
      modelId: model.id,
    };
  }

  if (candidates.length === 0) {
    return { method: null, reason: roundUsed.length > 0 ? '本轮已推荐一种，等用户表态后再推荐下一个' : '所有辅助手段已用过，等用户输入', modelId: model.id };
  }

  const messages = [
    { role: 'system', content: ROUTER_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        `clarity: ${ctx.clarity || 'null'}`,
        `chat_round: ${ctx.chatRound || 1}`,
        `used_methods: ${JSON.stringify(used)}`,
        `round_used_methods: ${JSON.stringify(roundUsed)}`,
        `ai_understanding: ${ctx.aiUnderstanding || ''}`,
        `followup_question: ${ctx.followupQuestion || ''}`,
        // v0.4 Phase 2a：diagnosis 注入 LLM，让 LLM 感知 type 调优先级
        //   vague → 优先 tradeoff/decision_tree；conflicted → 优先 scenarios/decision_tree
        diagnosisType ? `diagnosis_type: ${diagnosisType}（vague=具象化优先/conflicted=场景定位优先）` : '',
        `candidates: ${JSON.stringify(candidates)}`,
      ].filter(Boolean).join('\n'),
    },
  ];

  try {
    const result = await callLLM(model.id, messages, {
      temperature: 0.3,
      maxTokens: 200,
      jsonMode: true,
    });
    // v0.3.3 B 方案补丁（2026-06-13）：多层 JSON 提取（兼容 markdown 包裹 / 深度嵌套 / 截断）
    const parsed = safeParseJSON(result.content);
    if (!parsed) throw new Error('LLM 返回无法解析为 JSON');
    const method = candidates.includes(parsed.method) ? parsed.method : candidates[0];
    return {
      method,
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 60) : '',
      modelId: model.id,
    };
  } catch (e) {
    console.warn('[assist-router] LLM pickNext 失败，走 fallback:', e.message);
    return { ...fallbackPick(ctx), modelId: model.id };
  }
}

/**
 * Fallback 硬规则（LLM 不可用时）
 * 同时考虑 usedMethods（用户用过）+ roundUsedMethods（本轮跑过）
 * 
 * v0.3.3 B 方案补丁（2026-06-13）：调高"具象化手段"权重 — 多多反馈"开放问题太多"
 *   - 旧：low 优先 diagnosis（挑刺型），medium 优先 scenarios
 *   - 新：scenarios / tradeoff / arch（具象化）放最前，diagnosis 只在末位兜底
 *   - 原因：开放问题本身是 brief 在问（对话流），assist 阶段更适合给"具体方案"让用户挑
 */
function fallbackPick(ctx) {
  const usedMethods = ctx.usedMethods || [];
  const locked = new Set([...usedMethods, ...(ctx.roundUsedMethods || [])]);
  const clarity = ctx.clarity || 'low';
  const round = ctx.chatRound || 1;
  const force = ctx.force === true;

  // v0.4 Phase 2a：diagnosis.type 作为第一优先级权重
  //   - blank → 不走卡片（Phase 2b 实现 toolbox 对话）
  //   - vague / conflicted → 调优先级
  //   - null → 走原逻辑
  const diagnosisType = ctx.diagnosis?.type || null;
  if (diagnosisType === 'blank') {
    return {
      method: null,
      reason: 'diagnosis=blank：当前阶段应走 toolbox 对话路径（Phase 2b 接入），暂不推卡片',
      elicitSkipped: true,
      elicitReason: 'diagnosis=blank',
    };
  }

  // v0.3.3 B 方案补丁（2026-06-13）：首轮豁免（与 pickNext 保持一致）
  //   chat_round === 1 才豁免（让用户先独立思考），>= 2 就推
  if (!force && round === 1) {
    return {
      method: null,
      reason: '首轮让用户先自己思考，暂不推辅助手段',
    };
  }

  // 调整后的 priority：具象化手段（scenarios/tradeoff/arch）优先，diagnosis 兜底
  // v0.3.3 B+++：visual 进 fallback 末位（只在 chat_round >= 3 且前 5 种用过时兜底）
  // chat_round ≥ 3 倾向"先给具体场景让用户选"（scenarios 第一位），避免一上来就挑刺
  const usedCount = usedMethods.length;
  const includeVisual = round >= 3 && usedCount >= 1;  // 用户已表过态且对话 ≥ 3 轮才进 visual fallback

  // v0.4 Phase 2a：diagnosis.type 调权重的 base priority
  //   - vague: tradeoff / decision_tree 优先（具象化）
  //   - conflicted: scenarios / decision_tree 优先（典型场景帮定位 + 互斥方向帮选）
  //   - null: 原 clarity-based priority
  const basePriority = {
    vague: includeVisual ? ['tradeoff', 'decision_tree', 'arch', 'scenarios', 'diagnosis', 'visual']
                        : ['tradeoff', 'decision_tree', 'arch', 'scenarios', 'diagnosis'],
    conflicted: includeVisual ? ['scenarios', 'decision_tree', 'arch', 'tradeoff', 'diagnosis', 'visual']
                              : ['scenarios', 'decision_tree', 'arch', 'tradeoff', 'diagnosis'],
    null: null,  // 占位，下面用原 clarity-based
  }[diagnosisType];

  const priority = basePriority || {
    low:    includeVisual ? ['scenarios', 'tradeoff', 'arch', 'decision_tree', 'diagnosis', 'visual'] : ['scenarios', 'tradeoff', 'arch', 'decision_tree', 'diagnosis'],
    medium: includeVisual ? ['scenarios', 'tradeoff', 'arch', 'decision_tree', 'diagnosis', 'visual'] : ['scenarios', 'tradeoff', 'arch', 'decision_tree', 'diagnosis'],
    high:   includeVisual ? ['arch', 'decision_tree', 'scenarios', 'tradeoff', 'diagnosis', 'visual'] : ['arch', 'decision_tree', 'scenarios', 'tradeoff', 'diagnosis'],
    null:   includeVisual ? ['scenarios', 'tradeoff', 'arch', 'diagnosis', 'visual'] : ['scenarios', 'tradeoff', 'arch', 'diagnosis'],
  }[clarity] || ['scenarios', 'tradeoff'];

  for (const m of priority) {
    if (!locked.has(m)) {
      const reason = {
        diagnosis: '先体检一下你描述里没说清楚的地方',
        scenarios: '挑一个最像你的用户场景，我们就能往下走',
        tradeoff: '把这个需求里关键的取舍摆出来，你表态',
        arch: '把核心页面/模块列出来，你圈出想要的',
        decision_tree: '给你 3 条不同的实现方向，你挑一条',
        visual: '3 张方向图，看下哪个最像你想要的',
      }[m];
      return { method: m, reason };
    }
  }
  const hasRoundUsed = (ctx.roundUsedMethods || []).length > 0;
  return { method: null, reason: hasRoundUsed ? '本轮已推荐一种，等用户表态后再推荐下一个' : '所有辅助手段已用过' };
}

module.exports = { pickNext, fallbackPick };
