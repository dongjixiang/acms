// 思路简报服务（30 文档 v0.3「思路先于画面」改造）
// 思路面板：需求刚创建时，AI 生成三块结构性内容
//   1. 决策树: 3 种不同的实现形态/方向（互不重叠）
//   2. 追问清单: 5 个未定义的关键维度（用户可点选聊）
//   3. 类比参考: 3 个最接近的真实产品（带说明）
// 与 insight-previews 的区别：
//   - 文本，不调图片生成
//   - token 成本 ~1/4（~1500 vs ~6000）
//   - 创建需求时自动生成（同步 + 缓存）
// 字段：
//   requirement.thinking_brief: {
//     status: 'pending' | 'generating' | 'done' | 'failed',
//     decision_tree: [{label, desc, pros, cons, examples}],
//     questions: [string],
//     references: [{name, desc}],
//     model, generated_at, error
//   }
const { callLLM } = require('./llm-adapter');
const modelStore = require('../stores/model-store');
const reqStore = require('../stores/requirement-store');

// ===== Prompt =====
const THINKING_SYSTEM_PROMPT = `你是 ACMS 系统的「需求解读助手」。面对一个需求，你的工作是帮用户打开思路——而不是直接给方案。

【重要原则】如果用户输入中包含「上一轮决策树」字段：
- 你这次的输出必须**和上一轮有明显不同**——可以是更细分的场景、不同的用户角色切入、用户没考虑过的层面、或者基于已勾选/补充的延伸
- 不要换汤不换药（同样的方向换名字、稍微改 desc 算无效输出）
- 如果发现「确实想不到新角度」，就诚实地回到原方向但深化它（更具体的场景、更细的分类）

请输出三块内容：

1. **决策树** (decision_tree): 列出 3 种互不重叠的实现形态/方向。
   - 每个方向是一个完整的、有代表性的设计哲学
   - 不只是 UI 风格区别，而是产品形态区别
   - 每个方向给: label (≤10 字) / desc (≤40 字说是什么) / pros (≤20 字) / cons (≤20 字) / examples (典型产品名 1-2 个)

2. **追问清单** (questions): 5 个未定义的关键维度。
   - 这些是该需求落地时必须先回答的问题
   - 不重复决策树已经暗示的维度
   - 简短、具体（≤15 字/条）

3. **类比参考** (references): 3 个最接近的真实产品。
   - 名称 + 一句话说明它和当前需求的相似之处
   - 优先选用户可能听过的产品
   - 不要编造产品名，拿不准就别写

输出严格 JSON，格式：
{
  "decision_tree": [
    {"label":"...","desc":"...","pros":"...","cons":"...","examples":"..."},
    {"label":"...","desc":"...","pros":"...","cons":"...","examples":"..."},
    {"label":"...","desc":"...","pros":"...","cons":"...","examples":"..."}
  ],
  "questions": ["...","...","...","...","..."],
  "references": [
    {"name":"...","desc":"..."},
    {"name":"...","desc":"..."},
    {"name":"...","desc":"..."}
  ]
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
    decision_tree: Array.isArray(parsed.decision_tree) ? parsed.decision_tree : [],
    questions: Array.isArray(parsed.questions) ? parsed.questions : [],
    references: Array.isArray(parsed.references) ? parsed.references : [],
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
      decision_tree: [],
      questions: [],
      references: [],
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
    reqStore.update(requirementId, {
      thinking_brief: JSON.stringify({
        status: 'done',
        decision_tree: brief.decision_tree,
        questions: brief.questions,
        references: brief.references,
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
        decision_tree: [],
        questions: [],
        references: [],
        // 不保留 branch_details — 新决策树没生成前，旧特色无意义
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
