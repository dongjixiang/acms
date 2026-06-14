// 决策树辅助手段（v0.3.3 Phase 2）
// 从原 thinking-brief.js 拆出，作为独立 assist 服务
// 字段：requirement.assist_decision_tree

const { callLLMWithRetry } = require('../json-extractor');
const modelStore = require('../../stores/model-store');
const reqStore = require('../../stores/requirement-store');
const branchDetail = require('../branch-detail');

function pickDefaultLlm() {
  // v0.3.6：优先使用系统配置的「默认思路模型」
  const defaultGen = modelStore.getDefaultGenModel();
  if (defaultGen) return defaultGen;
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0]
      || null;
}

const DECISION_TREE_PROMPT = `你是 ACMS 系统的「决策树助手」。给定一个需求，给出 3 个互不重叠的实现形态/方向。每个方向是一个完整的、有代表性的设计哲学。

## 焦点优先（v0.3.3 B 方案补丁）
如果输入里包含「当前对话焦点」（followup_question），**3 个方向必须围绕这个焦点展开**——把焦点里隐含的方向选择具象化成 3 条互斥路径（如焦点问"先做哪个"，方向就要把"先做 X / 先做 Y / 先做 Z"展开）。**不要凭空从需求整体再列通用方向。**

每个方向给:
- label (≤10 字): 方向名称
- desc (≤40 字): 描述这个方向是什么
- pros (≤20 字): 优势
- cons (≤20 字): 劣势
- examples (≤30 字): 1-2 个真实产品名

要求:
- 3 个方向**互不重叠**（不是 UI 风格区别，而是产品形态区别）
- 输出严格 JSON:
{"tree":[
  {"label":"...","desc":"...","pros":"...","cons":"...","examples":"..."},
  {"label":"...","desc":"...","pros":"...","cons":"...","examples":"..."},
  {"label":"...","desc":"...","pros":"...","cons":"...","examples":"..."}
]}
不要任何额外文字、markdown 代码块、解释。`;

/**
 * 异步生成决策树 → 写回 requirement.assist_decision_tree
 */
async function runAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  // v0.3.6：forceRegenerate 时把已换过的旧分支喂给 LLM，让它避免重复
  let previousTree = [];
  if (opts.forceRegenerate) {
    try {
      const existing = JSON.parse(req.assist_decision_tree || 'null');
      if (existing && Array.isArray(existing.tree)) {
        previousTree = existing.tree;
      }
    } catch { /* 静默降级 */ }
  }

  // 标记 generating
  reqStore.update(requirementId, {
    assist_decision_tree: JSON.stringify({
      status: 'generating',
      tree: [],
      started_at: new Date().toISOString(),
      generated_at: null,
      error: null,
      model: null,
      used: false,
      regenerate_count: opts.forceRegenerate ? ((JSON.parse(req.assist_decision_tree || '{}').regenerate_count || 0) + 1) : 0,
    }),
  });
  console.log(`[assist:decision_tree] ${requirementId} 开始生成${opts.forceRegenerate ? '（换一批）' : ''}`);

  try {
    const model = opts.modelId ? modelStore.getById(opts.modelId) : pickDefaultLlm();
    if (!model) throw new Error('NO_LLM_AVAILABLE');

    const userParts = [
      `需求标题: ${req.title || '(空)'}`,
      `需求描述: ${req.description || '(空)'}`,
      opts.role ? `用户角色: ${opts.role}` : '',
      opts.followupQuestion ? `当前对话焦点: ${opts.followupQuestion}` : '',
    ];
    if (previousTree.length > 0) {
      userParts.push('---');
      userParts.push('【已换过的决策树分支】（用户觉得都不符合，请给出明显不同的）：');
      previousTree.forEach((t, i) => {
        userParts.push(`#${i + 1}: ${t.label || ''}（${t.desc || ''}）`);
      });
      userParts.push('请确保新分支在 label / desc / 实现路径上与已换过的有明显差异。');
    }
    const messages = [
      { role: 'system', content: DECISION_TREE_PROMPT },
      { role: 'user', content: userParts.filter(Boolean).join('\n') },
    ];

    // v0.3.3 B++ 补丁：用 callLLMWithRetry（公共重试工具）替代直接 callLLM
    const parsed = await callLLMWithRetry(model, messages, {
      temperature: 0.7, maxTokens: 900, jsonMode: true, serviceName: 'assist:decision_tree',
    });
    if (!parsed) throw new Error('LLM 返回无法解析为 JSON（已重试 1 次）');
    if (!Array.isArray(parsed.tree)) throw new Error('LLM 返回缺少 tree 字段');
    const tree = parsed.tree.slice(0, 3);

    reqStore.update(requirementId, {
      assist_decision_tree: JSON.stringify({
        status: 'done',
        tree,
        generated_at: new Date().toISOString(),
        generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
        model: model.id,
        error: null,
        used: false,
      }),
    });
    console.log(`[assist:decision_tree] ${requirementId} 完成, ${tree.length} 个方向`);
  } catch (e) {
    console.error(`[assist:decision_tree] ${requirementId} 失败:`, e.message);
    reqStore.update(requirementId, {
      assist_decision_tree: JSON.stringify({
        status: 'failed',
        tree: [],
        error: e.message,
        generated_at: new Date().toISOString(),
        used: false,
      }),
    });
  }
}

/**
 * 标记用户"使用"了该辅助手段（选了某个 branch）
 */
function markUsed(requirementId, branchIdx) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  let assist;
  try { assist = JSON.parse(req.assist_decision_tree || 'null'); } catch { assist = null; }
  if (!assist) return null;
  assist.used = true;
  assist.used_branch_idx = branchIdx;
  assist.used_at = new Date().toISOString();
  reqStore.update(requirementId, { assist_decision_tree: JSON.stringify(assist) });
  // 复用旧 branch-detail.js 启动该 branch 的设计特色生成
  setImmediate(() => branchDetail.runBranchDetailJob(requirementId, branchIdx)
    .catch(e => console.error('[assist:decision_tree] branch-detail 异常:', e.message)));
  return assist;
}

function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try { return JSON.parse(req.assist_decision_tree || 'null'); } catch { return null; }
}

module.exports = {
  name: '决策树（3 方向 + 类比徽章 → 设计特色）',
  field: 'assist_decision_tree',
  runAssistJob,
  markUsed,
  getAssist,
};
