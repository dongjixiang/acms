// 思路简报服务（v0.3.3「多轮对话式澄清」改造）
// 思路面板只管「对话流」：AI 开场 + 用户回答 + 重新理解 + 新问题
// 决策树 / 追问 / 类比参考 → 已迁出到 server/services/assists/*（独立服务，独立字段，独立组件）
// 字段：
//   requirement.thinking_brief: {
//     status: 'pending' | 'generating' | 'done' | 'failed',
//     opening: string,
//     ai_understanding: string,
//     followup_question: string,
//     chat_round: number,
//     model, generated_at, error
//   }
// 决策树字段（兼容旧 brief 渲染）：
//   requirement.assist_decision_tree: { status, tree, ... }  ← 由 assists/decision-tree.js 写
const { callLLM } = require('./llm-adapter');
const modelStore = require('../stores/model-store');
const reqStore = require('../stores/requirement-store');

// ===== Prompt =====
// v0.3.3: brief 只管对话流；决策树完全迁出
const THINKING_SYSTEM_PROMPT = `你是 ACMS 系统的「需求澄清助手」。你的工作是用**对话**的方式帮用户打开思路——而不是直接给方案。

## 态度原则
- **友好积极**：像有经验的同事在白板前和你聊这个需求。不要冷淡、不要机械、不要"作为AI我将…"。
- **展示理解**：先说你对需求的理解（不是复述，而是提炼核心意图 + 你看到的最关键的取舍）。
- **不给选项**：用**开放问题**引导用户说出自己的取舍、场景、顾虑。最多 1-2 个问题，问题是用户能用一两句话答得出来的。

## 输出格式（严格 JSON）
{
  "ai_understanding": "≤60 字。AI 对需求核心意图的理解（不是复述，是提炼）。",
  "opening": "≤120 字。开场白：先 1 句致意 + 1 句理解 + 1-2 个开放问题。整体语气像聊天，不要分点列。",
  "followup_question": "≤40 字。当前最关键的一个开放追问（用户回答后会刷新）。如本轮不需追问则填空串。"
}

## 重要原则（多轮对话时）
如果用户输入中包含「上一轮决策树」字段：
- 你这次的输出必须**和上一轮有明显不同**——可以是更细分的场景、不同的用户角色切入、用户没考虑过的层面、或者基于已勾选/补充的延伸
- 不要换汤不换药（同样的方向换名字、稍微改 desc 算无效输出）
- 如果发现「确实想不到新角度」，就诚实地回到原方向但深化它（更具体的场景、更细的分类）

输出严格 JSON，格式：
{
  "ai_understanding": "...",
  "opening": "...",
  "followup_question": "..."
}

不要任何额外文字、markdown 代码块、解释。`;

function pickDefaultLlm() {
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0]
      || null;
}

/**
 * 同步：生成思路简报
 * @param {string} title
 * @param {string} description
 * @param {string} clarity
 * @param {Array} [oldDecisionTree] - 上一轮的决策树（如有）—— 用于差异化
 * @param {string} [role] - 用户角色（PM/技术/...）
 * @param {string} [modelId]
 * @returns {Promise<{decision_tree, questions, references, modelId}>}
 */
async function generateBrief(title, description, clarity, oldDecisionTree, role, modelId) {
  const model = modelId ? modelStore.getById(modelId) : pickDefaultLlm();
  if (!model) throw new Error('NO_LLM_AVAILABLE');
  const messages = [
    { role: 'system', content: THINKING_SYSTEM_PROMPT },
    { role: 'user', content: [
      `需求标题: ${title || '(空)'}`,
      `需求描述: ${description || '(空)'}`,
      `明确度: ${clarity || 'unknown'}`,
      role ? `用户角色: ${role}` : '',
    ].filter(Boolean).join('\n') },
  ];

  // 如果有上一轮决策树，作为独立的 system message 注入（避免和 user 段混在一起）
  if (Array.isArray(oldDecisionTree) && oldDecisionTree.length > 0) {
    const oldLabels = oldDecisionTree.map(t => t.label || '').filter(Boolean);
    messages.push({
      role: 'system',
      content: `【上一轮决策树】用户已经看过这些方向了：\n${oldLabels.map((l, i) => `${String.fromCharCode(65 + i)}. ${l}`).join('\n')}\n\n请这次给出**明显不同**的方向——更细分的场景、不同的用户视角、或基于用户已勾选/补充的延伸。如果实在想不到新角度，至少在 desc 里给更具体的落地场景。`,
    });
  }
  const result = await callLLM(model.id, messages, {
    temperature: 0.7,
    maxTokens: 1200,
    jsonMode: true,
  });
  let content = (result.content || '').trim();
  // 多层 JSON 提取（兼容 markdown 包裹 / 深度嵌套）
  if (content.startsWith('```')) {
    content = content.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  }
  const jsonStart = content.indexOf('{');
  if (jsonStart >= 0) content = content.substring(jsonStart);
  // 找最外层 {...}
  const jsonEnd = content.lastIndexOf('}');
  if (jsonEnd > jsonStart) content = content.substring(0, jsonEnd + 1);
  const parsed = JSON.parse(content);
  return {
    ai_understanding: typeof parsed.ai_understanding === 'string' ? parsed.ai_understanding : '',
    opening: typeof parsed.opening === 'string' ? parsed.opening : '',
    followup_question: typeof parsed.followup_question === 'string' ? parsed.followup_question : '',
    modelId: model.id,
  };
}

/**
 * 异步：完整生成流程（fire-and-forget）
 * @param {string} requirementId
 * @param {object} opts { modelId, role }
 */
async function runBriefJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  // 标记 generating
  reqStore.update(requirementId, {
    thinking_brief: JSON.stringify({
      status: 'generating',
      opening: '',
      ai_understanding: '',
      followup_question: '',
      chat_round: 0,
      started_at: new Date().toISOString(),
      generated_at: null,
      error: null,
      model: null,
    }),
  });
  console.log(`[brief] ${requirementId} 开始生成思路简报`);

  try {
    // 读取旧决策树（用于差异化）—— 启动前读，避免被本次 update 清空后取不到
    let oldDecisionTree = [];
    try {
      const oldBrief = JSON.parse(req.thinking_brief || 'null');
      if (oldBrief && Array.isArray(oldBrief.decision_tree)) {
        oldDecisionTree = oldBrief.decision_tree;
      }
    } catch (e) { /* 静默降级 */ }

    const brief = await generateBrief(
      req.title, req.description, req.input_clarity, oldDecisionTree, opts.role, opts.modelId
    );
    // 计算对话轮次：旧 chat_round + 1（如无则 =1）
    const oldRound = (() => { try { return JSON.parse(req.thinking_brief || 'null')?.chat_round || 0; } catch { return 0; } })();
    reqStore.update(requirementId, {
      thinking_brief: JSON.stringify({
        status: 'done',
        opening: brief.opening,
        ai_understanding: brief.ai_understanding,
        followup_question: brief.followup_question,
        chat_round: oldRound + 1,
        generated_at: new Date().toISOString(),
        model: brief.modelId,
        error: null,
      }),
    });
    console.log(`[brief] ${requirementId} 思路简报完成`);
  } catch (e) {
    console.error(`[brief] ${requirementId} 思路简报生成失败:`, e.message);
    reqStore.update(requirementId, {
      thinking_brief: JSON.stringify({
        status: 'failed',
        opening: '',
        ai_understanding: '',
        followup_question: '',
        chat_round: 0,
        error: e.message,
        generated_at: new Date().toISOString(),
      }),
    });
  }
}

/**
 * 读取缓存（前端 GET 用）
 */
function getBrief(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try {
    return JSON.parse(req.thinking_brief || 'null');
  } catch {
    return null;
  }
}

module.exports = { generateBrief, runBriefJob, getBrief };
