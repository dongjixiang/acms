// LLM 路由器（v0.3.3 Phase 2）
// 输入：当前 clarity + chat_round + 已用 methods + AI 理解
// 输出：建议下一轮用哪种辅助手段 + reason（≤40 字）
//
// 设计原则：
//   - 不重复：used_methods 里出现过的 method 不会被再选
//   - 不强推 visual：visual 留给用户手动触发（避免一上来就烧 3 张图）
//   - clarity 优先：low 时优先 diagnosis（诊断模糊），high 时优先 tradeoff（细化取舍）

const { callLLM } = require('../llm-adapter');
const modelStore = require('../../stores/model-store');
const { ASSIST_METHODS } = require('./index');

function pickDefaultLlm() {
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

## 输入
- 当前明确度 clarity: high / medium / low / null
- 对话轮次 chat_round: 数字（1 表示首轮）
- 已用手段 used_methods: 之前用过的 method 列表
- AI 理解 ai_understanding: 当前 AI 对需求核心意图的提炼

## 选择规则
1. **不重复**：used_methods 里的 method 不要再选
2. **low + 首轮/第二轮**：优先 **diagnosis**（先诊断模糊再选方向）
3. **medium + 中间轮次**：优先 **scenarios** 或 **tradeoff**（具体化）
4. **high + 后段**：优先 **arch** 或 **decision_tree**（落地化）
5. **不选 visual**：视觉预览是用户主动触发的，不在自动路由范围内

## 输出（严格 JSON）
{
  "method": "scenarios|diagnosis|tradeoff|arch|decision_tree",
  "reason": "≤40 字。告诉用户为什么选这个（用第二人称，比如"你的需求模糊，先体检一下哪里没说清楚"）"
}

不要任何额外文字、markdown 代码块、解释。`;

/**
 * LLM 选一种辅助手段
 * @param {object} ctx { clarity, chatRound, usedMethods, aiUnderstanding }
 * @param {string} [modelId]
 * @returns {Promise<{method, reason, modelId}>}
 */
async function pickNext(ctx, modelId) {
  const model = modelId ? modelStore.getById(modelId) : pickDefaultLlm();
  if (!model) {
    // 退化：按 clarity 阶梯给个默认值
    return { ...fallbackPick(ctx), modelId: null };
  }

  // 候选列表（去掉已用 + 不选 visual）
  const candidates = ASSIST_METHODS.filter(m => m !== 'visual' && !(ctx.usedMethods || []).includes(m));
  if (candidates.length === 0) {
    return { method: null, reason: '所有辅助手段已用过，等用户输入', modelId: model.id };
  }

  const messages = [
    { role: 'system', content: ROUTER_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        `clarity: ${ctx.clarity || 'null'}`,
        `chat_round: ${ctx.chatRound || 1}`,
        `used_methods: ${JSON.stringify(ctx.usedMethods || [])}`,
        `ai_understanding: ${ctx.aiUnderstanding || ''}`,
        `candidates: ${JSON.stringify(candidates)}`,
      ].join('\n'),
    },
  ];

  try {
    const result = await callLLM(model.id, messages, {
      temperature: 0.3,
      maxTokens: 200,
      jsonMode: true,
    });
    let content = (result.content || '').trim();
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    }
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      content = content.substring(jsonStart, jsonEnd + 1);
    }
    const parsed = JSON.parse(content);
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
 */
function fallbackPick(ctx) {
  const used = new Set(ctx.usedMethods || []);
  const clarity = ctx.clarity || 'low';
  const round = ctx.chatRound || 1;

  const priority = {
    low: ['diagnosis', 'scenarios', 'tradeoff', 'arch', 'decision_tree'],
    medium: ['scenarios', 'tradeoff', 'diagnosis', 'arch', 'decision_tree'],
    high: ['arch', 'decision_tree', 'tradeoff', 'scenarios', 'diagnosis'],
    null: ['diagnosis', 'scenarios', 'tradeoff'],
  }[clarity] || ['diagnosis', 'scenarios'];

  for (const m of priority) {
    if (!used.has(m)) {
      const reason = {
        diagnosis: '先体检一下你描述里没说清楚的地方',
        scenarios: '挑一个最像你的用户场景，我们就能往下走',
        tradeoff: '把这个需求里关键的取舍摆出来，你表态',
        arch: '把核心页面/模块列出来，你圈出想要的',
        decision_tree: '给你 3 条不同的实现方向，你挑一条',
      }[m];
      return { method: m, reason };
    }
  }
  return { method: null, reason: '所有辅助手段已用过' };
}

module.exports = { pickNext, fallbackPick };
