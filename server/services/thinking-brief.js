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
//     diagnosis: { type: 'vague'|'conflicted'|'blank'|null, label: string, guide: string, confidence: number } | null,
//     model, generated_at, error
//   }
// 决策树字段（兼容旧 brief 渲染）：
//   requirement.assist_decision_tree: { status, tree, ... }  ← 由 assists/decision-tree.js 写
const { callLLM } = require('./llm-adapter');
const { safeParseJSON } = require('./json-extractor');
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
  "followup_question": "≤40 字。当前最关键的一个开放追问（用户回答后会刷新）。如本轮不需追问则填空串。",
  "diagnosis": {
    "type": "vague | conflicted | blank | null",
    "label": "≤10 字。给用户看的简短标签（如『已有一个大致方向，想具体化』）。如果描述为空或无法判断则填空串。",
    "guide": "≤30 字。给用户的引导语，说明接下来要做什么（如『我们先做一些具象化的练习』）。如果 type 为 null 则填空串。",
    "confidence": 0.0~1.0
  }
}

## diagnosis 字段判断规则

如果需求描述为空或仅有一两句话的抽象描述（< 20 字），则：
- diagnosis.type = null
- diagnosis.label = ""
- diagnosis.guide = ""
- diagnosis.confidence = 0

否则根据描述判断：

- **vague**（已有一个大致方向，想具体化）：能描述"是什么"但说不清"具体怎么做"
- **conflicted**（有好几个想法在犹豫）：提到两种以上可能性或自相矛盾
- **blank**（完全开放，没头绪）：只有模糊的领域，没有具体方向

confidence < 0.6 时默认走 vague（宁松勿严）。

## 重要原则（多轮对话时）
如果用户输入中包含「上一轮决策树」字段：
- 你这次的输出必须**和上一轮有明显不同**——可以是更细分的场景、不同的用户角色切入、用户没考虑过的层面、或者基于已勾选/补充的延伸
- 不要换汤不换药（同样的方向换名字、稍微改 desc 算无效输出）
- 如果发现「确实想不到新角度」，就诚实地回到原方向但深化它（更具体的场景、更细的分类）

## 重要原则（用户已补充时）—— v0.3.7 修复「所答非所问」
如果用户输入中包含【用户已补充的内容】字段（按时间顺序的历次补充）：
- **ai_understanding 必须包含补充里提出的具体关键词、痛点、场景**（不是泛泛"用户要做某事"）
- **opening 的 1 句理解必须直接回应补充里的核心痛点**（如"你说 FAE 痛点是 XX，我接下来会从 YY 切入"）
- **followup_question 必须是补充之后的下一个真正开放问题**——**绝对不要**重复追问用户已经说过的话题（如不要问"你最在意哪个场景"，因为补充里已经列了）
- 检验标准：你的 followup_question 能不能从补充里直接推断出来？如果能，说明你问错了——应该问补充里**没回答**的真正空白点
- 反例：补充里说"FAE 痛点是 XX，销售痛点是 YY"，但 followup 问"销售和 FAE 第一屏看什么"——这是错的，因为"第一屏"在补充里还没提，可以问；"FAE 痛点"已经提了，不能问

输出严格 JSON，格式：
{
  "ai_understanding": "...",
  "opening": "...",
  "followup_question": "...",
  "diagnosis": { "type": "...", "label": "...", "guide": "...", "confidence": 0.0 }
}

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
 * 同步：生成思路简报
 * @param {string} title
 * @param {string} description
 * @param {string} clarity
 * @param {Array} [oldDecisionTree] - 上一轮的决策树（如有）—— 用于差异化
 * @param {string} [role] - 用户角色（PM/技术/...）
 * @param {string} [modelId]
 * @param {Array} [supplementHistory] - 用户历次补充（v0.3.5 修复：让 AI 看到补充后再生成 brief）
 * @returns {Promise<{decision_tree, questions, references, modelId}>}
 */
async function generateBrief(title, description, clarity, oldDecisionTree, role, modelId, supplementHistory = []) {
  const model = modelId ? modelStore.getById(modelId) : pickDefaultLlm();
  if (!model) throw new Error('NO_LLM_AVAILABLE');
  // v0.3.5 修复：把 supplement_history 拼进 user message，让 AI 看到补充后再生成 brief
  const userParts = [
    `需求标题: ${title || '(空)'}`,
    `需求描述: ${description || '(空)'}`,
    `明确度: ${clarity || 'unknown'}`,
    role ? `用户角色: ${role}` : '',
  ];
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
    userParts.push('---');
    userParts.push('请把「原始需求描述 + 以上全部对话历史」视为完整输入。用户已经在对话里回答过的内容，请不要再追问 —— 你的 followup_question 应该是对话之后的下一个真正开放问题。');
  }
  const messages = [
    { role: 'system', content: THINKING_SYSTEM_PROMPT },
    { role: 'user', content: userParts.filter(Boolean).join('\n') },
  ];

  // 如果有上一轮决策树，作为独立的 system message 注入（避免和 user 段混在一起）
  if (Array.isArray(oldDecisionTree) && oldDecisionTree.length > 0) {
    const oldLabels = oldDecisionTree.map(t => t.label || '').filter(Boolean);
    messages.push({
      role: 'system',
      content: `【上一轮决策树】用户已经看过这些方向了：\n${oldLabels.map((l, i) => `${String.fromCharCode(65 + i)}. ${l}`).join('\n')}\n\n请这次给出**明显不同**的方向——更细分的场景、不同的用户视角、或基于用户已勾选/补充的延伸。如果实在想不到新角度，至少在 desc 里给更具体的落地场景。`,
    });
  }
  // v0.3.7 调试日志：一次性 dump LLM 实际看到的 messages（验证修复效果后删除）
  console.log(`[brief.debug] ${title?.substring(0, 30) || '(空)'}: system=${THINKING_SYSTEM_PROMPT.length}字, user=${userParts.filter(Boolean).join('\n').length}字, supplement_count=${supplementHistory.length}, has_old_decision_tree=${oldDecisionTree?.length || 0}`);
  const result = await callLLM(model.id, messages, {
    temperature: 0.7,
    maxTokens: 1200,
    jsonMode: true,
  });
  // v0.3.7 调试日志：dump LLM 实际返回的 followup_question（验证修复效果后删除）
  const _debugParsed = safeParseJSON(result.content);
  console.log(`[brief.debug] ${title?.substring(0, 30) || '(空)'}: followup_question="${(_debugParsed?.followup_question || '').substring(0, 60)}"`);
  // v0.3.3 B 方案补丁（2026-06-13）：多层 JSON 提取（兼容 markdown / 截断 / 嵌套）
  const parsed = safeParseJSON(result.content);
  if (!parsed) throw new Error('LLM 返回无法解析为 JSON');

  // v0.4 Phase 1.1：防御 diagnosis 字段缺失或格式异常
  // 截断 / 解析失败时降级为 null，前端不渲染诊断标签
  const VALID_TYPES = ['vague', 'conflicted', 'blank', null];
  let diagnosis = null;
  const rawDiag = parsed.diagnosis;
  if (rawDiag && typeof rawDiag === 'object' && VALID_TYPES.includes(rawDiag.type)) {
    diagnosis = {
      type: rawDiag.type,
      label: typeof rawDiag.label === 'string' ? rawDiag.label.slice(0, 10) : '',
      guide: typeof rawDiag.guide === 'string' ? rawDiag.guide.slice(0, 30) : '',
      confidence: typeof rawDiag.confidence === 'number' ? Math.max(0, Math.min(1, rawDiag.confidence)) : 0,
    };
  }

  return {
    ai_understanding: typeof parsed.ai_understanding === 'string' ? parsed.ai_understanding : '',
    opening: typeof parsed.opening === 'string' ? parsed.opening : '',
    followup_question: typeof parsed.followup_question === 'string' ? parsed.followup_question : '',
    diagnosis,
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

  // v0.4 Phase 2c：纠偏触发的重生 → 保留 diagnosis.type
  //   opts.skipDiagnosisRegen = true 时：LLM 只重生 opening/followup，diagnosis.type 沿用旧值
  //   opts.preserveDiagnosisType = 旧 type（从 correct-diagnosis 路由传入）
  const skipDiagRegen = opts.skipDiagnosisRegen === true;

  // 标记 generating
  reqStore.update(requirementId, {
    thinking_brief: JSON.stringify({
      status: 'generating',
      opening: '',
      ai_understanding: '',
      followup_question: '',
      diagnosis: skipDiagRegen && opts.preserveDiagnosisType ? { type: opts.preserveDiagnosisType } : null,
      dialog: null,
      chat_round: 0,
      started_at: new Date().toISOString(),
      generated_at: null,
      error: null,
      model: null,
    }),
  });
  console.log(`[brief] ${requirementId} 开始生成思路简报${skipDiagRegen ? '（纠偏后重生，保留 diagnosis.type=' + opts.preserveDiagnosisType + '）' : ''}`);

  try {
    // 读取旧决策树（用于差异化）—— 启动前读，避免被本次 update 清空后取不到
    let oldDecisionTree = [];
    try {
      const oldBrief = JSON.parse(req.thinking_brief || 'null');
      if (oldBrief && Array.isArray(oldBrief.decision_tree)) {
        oldDecisionTree = oldBrief.decision_tree;
      }
    } catch (e) { /* 静默降级 */ }

    // v0.3.5 修复：读 supplement_history，让 generateBrief 看到用户的历次补充
    let supplementHistory = [];
    try {
      supplementHistory = JSON.parse(req.supplement_history || '[]');
      if (!Array.isArray(supplementHistory)) supplementHistory = [];
    } catch (e) { /* 静默降级 */ }

    const brief = await generateBrief(
      req.title, req.description, req.input_clarity, oldDecisionTree, opts.role, opts.modelId,
      supplementHistory  // v0.3.5 新增
    );
    // 计算对话轮次：旧 chat_round + 1（如无则 =1）
    const oldRound = (() => { try { return JSON.parse(req.thinking_brief || 'null')?.chat_round || 0; } catch { return 0; } })();
    const newRound = oldRound + 1;

    // v0.4 Phase 2c：纠偏触发的重生 → 保留 diagnosis.type，只重生 label/guide
    //   LLM 仍会产出新 diagnosis，但我们用 opts.preserveDiagnosisType 强制覆盖 type
    //   label/guide/confidence 沿用 LLM 新产出（让用户看到基于新 type 的解读）
    let finalDiagnosis = brief.diagnosis;
    if (skipDiagRegen && opts.preserveDiagnosisType && brief.diagnosis) {
      finalDiagnosis = {
        ...brief.diagnosis,
        type: opts.preserveDiagnosisType,  // 强制保留用户纠正的 type
        label: brief.diagnosis.label || '',  // label 沿用 LLM 新产出
        guide: brief.diagnosis.guide || '',
        confidence: brief.diagnosis.confidence || 0,
        corrected_at: new Date().toISOString(),
        previous_type: opts.previousType || null,
      };
    }

    reqStore.update(requirementId, {
      thinking_brief: JSON.stringify({
        status: 'done',
        opening: brief.opening,
        ai_understanding: brief.ai_understanding,
        followup_question: brief.followup_question,
        diagnosis: finalDiagnosis,
        dialog: null,  // v0.4 Phase 2b：诊断对话引导问题（异步生成，下面填）
        chat_round: newRound,
        generated_at: new Date().toISOString(),
        model: brief.modelId,
        error: null,
      }),
    });
    console.log(`[brief] ${requirementId} 思路简报完成（chat_round=${newRound}）`);

    // v0.4 Phase 2b：brief 完成后异步生成诊断对话引导问题
    //   - fire-and-forget，不阻塞 brief job
    //   - 写入 thinking_brief.dialog
    //   - diagnosis.type === null 时 dialog 保持 null（不生成）
    setImmediate(async () => {
      try {
        const { generateDialog } = require('./elicitor-dialog');
        const freshAfterBrief = reqStore.getById(requirementId);
        if (!freshAfterBrief || freshAfterBrief.status !== 'idea') return;
        const currentBrief = JSON.parse(freshAfterBrief.thinking_brief || 'null');
        if (!currentBrief || currentBrief.status !== 'done') return;

        const dialog = await generateDialog(currentBrief, freshAfterBrief, opts.modelId);
        if (dialog) {
          const updated = JSON.parse(freshAfterBrief.thinking_brief || '{}');
          updated.dialog = dialog;
          reqStore.update(requirementId, { thinking_brief: JSON.stringify(updated) });
          console.log(`[brief.dialog] ${requirementId} 引导问题已生成（${dialog.chosen_method}）`);
        }
      } catch (e) {
        console.error(`[brief.dialog] ${requirementId} 生成失败（非阻塞）:`, e.message);
      }
    });

    // v0.3.3 B 方案：brief 完成后自动调路由器选 1 种辅助手段
    //   不论是首轮 brief 还是后续 regen，每次 brief 完成都会自动推一种
    //   路由器内部用 roundUsedMethods 锁本轮，确保同一 chat_round 不重复推
    try {
      const { pickNext } = require('./assists/router');
      const assists = require('./assists');
      const fresh = reqStore.getById(requirementId);
      if (fresh && fresh.status === 'idea') {
        // 收集 usedMethods（用户用过 = 永远锁）+ roundUsedMethods（本轮已生成 = 本轮锁）
        const usedMethods = [];
        const roundUsedMethods = [];
        for (const method of ['decision_tree', 'scenarios', 'diagnosis', 'tradeoff', 'arch']) {
          const svc = assists.getAssist(method);
          const data = svc && svc.getAssist ? svc.getAssist(requirementId) : null;
          if (!data) continue;
          if (data.used) usedMethods.push(method);
          if (data.status === 'done' && typeof data.generated_at_round === 'number' && data.generated_at_round === newRound) {
            roundUsedMethods.push(method);
          }
        }
        const aiUnderstanding = brief.ai_understanding || '';
        const followupQuestion = brief.followup_question || '';
        const pick = await pickNext({
          clarity: fresh.input_clarity,
          chatRound: newRound,
          usedMethods,
          roundUsedMethods,
          aiUnderstanding,
          followupQuestion,
          diagnosis: brief.diagnosis,  // v0.4 Phase 2a：传 diagnosis 让路由器感知
        }, opts.modelId);
        if (pick.method) {
          const svc = assists.getAssist(pick.method);
          if (svc && svc.runAssistJob) {
            // fire-and-forget：不阻塞 brief job；透传焦点让生成内容围绕它
            setImmediate(() => svc.runAssistJob(requirementId, { modelId: opts.modelId, role: opts.role, chatRound: newRound, followupQuestion })
              .catch(e => console.error(`[brief.assist] ${requirementId} ${pick.method} 异常:`, e.message)));
            console.log(`[brief.assist] ${requirementId} 自动选了 ${pick.method}（round=${newRound}, focus="${followupQuestion.slice(0, 30)}"）`);
          }
        } else if (newRound <= 2) {
          // v0.3.3 B 方案补丁：首轮/第二轮豁免（让用户先自己思考）
          console.log(`[brief.assist] ${requirementId} chat_round=${newRound} 触发首轮豁免，暂不推辅助手段`);
        } else {
          console.log(`[brief.assist] ${requirementId} 本轮不推荐辅助: ${pick.reason}`);
        }
      }
    } catch (e) { console.error('[brief.assist] 自动选辅助失败（非阻塞）:', e.message); }
  } catch (e) {
    console.error(`[brief] ${requirementId} 思路简报生成失败:`, e.message);
    reqStore.update(requirementId, {
      thinking_brief: JSON.stringify({
        status: 'failed',
        opening: '',
        ai_understanding: '',
        followup_question: '',
        diagnosis: null,
        chat_round: 0,
        error: e.message,
        generated_at: new Date().toISOString(),
      }),
    });
  }
}

/**
 * 流式生成思路简报（v0.3.6 SSE 实时输出）
 * 与 runBriefJob 逻辑相同，但通过 async generator 逐 token 产出
 * @yields {type: 'token', text: string}
 * @yields {type: 'done', brief: object}
 * @yields {type: 'error', message: string}
 */
async function* runBriefJobStream(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) { yield { type: 'error', message: 'REQ_NOT_FOUND' }; return; }

  reqStore.update(requirementId, {
    thinking_brief: JSON.stringify({
      status: 'generating', opening: '', ai_understanding: '',
      followup_question: '', diagnosis: null, dialog: null,
      chat_round: 0, started_at: new Date().toISOString(),
      generated_at: null, error: null, model: null,
    }),
  });

  let oldDecisionTree = [];
  try {
    const oldBrief = JSON.parse(req.thinking_brief || 'null');
    if (oldBrief && Array.isArray(oldBrief.decision_tree)) oldDecisionTree = oldBrief.decision_tree;
  } catch {}

  let supplementHistory = [];
  try {
    supplementHistory = JSON.parse(req.supplement_history || '[]');
    if (!Array.isArray(supplementHistory)) supplementHistory = [];
  } catch {}

  const model = opts.modelId ? modelStore.getById(opts.modelId) : pickDefaultLlm();
  if (!model) { yield { type: 'error', message: 'NO_LLM_AVAILABLE' }; return; }

  const userParts = [
    `需求标题: ${req.title || '(空)'}`,
    `需求描述: ${req.description || '(空)'}`,
    `明确度: ${req.input_clarity || 'unknown'}`,
    opts.role ? `用户角色: ${opts.role}` : '',
  ];

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
        if (lines.length === 0 && h.text) lines.push(`  ${h.text}`);
        userParts.push(`#${i + 1} 🤖 AI${sourceTag}${atTag}:\n${lines.join('\n')}`);
      } else {
        userParts.push(`#${i + 1} ➡️ 用户${sourceTag}${atTag}: ${h.text || ''}`);
      }
    });
    userParts.push('---');
    userParts.push('请把「原始需求描述 + 以上全部对话历史」视为完整输入。用户已经在对话里回答过的内容，请不要再追问 —— 你的 followup_question 应该是对话之后的下一个真正开放问题。');
  }

  const messages = [
    { role: 'system', content: THINKING_SYSTEM_PROMPT },
    { role: 'user', content: userParts.filter(Boolean).join('\n') },
  ];

  if (Array.isArray(oldDecisionTree) && oldDecisionTree.length > 0) {
    const oldLabels = oldDecisionTree.map(t => t.label || '').filter(Boolean);
    messages.push({
      role: 'system',
      content: `【上一轮决策树】用户已经看过这些方向了：\n${oldLabels.map((l, i) => `${String.fromCharCode(65 + i)}. ${l}`).join('\n')}\n\n请这次给出**明显不同**的方向。`,
    });
  }

  const { callLLMStream } = require('./llm-adapter');
  let fullContent = '';
  try {
    for await (const event of callLLMStream(model.id, messages, { temperature: 0.7, maxTokens: 1200 })) {
      if (event.type === 'token') {
        fullContent += event.text;
        yield { type: 'token', text: event.text };
      } else if (event.type === 'done') {
        const parsed = safeParseJSON(fullContent);
        if (!parsed) { yield { type: 'error', message: 'LLM 返回无法解析为 JSON' }; return; }

        const oldRound = (() => { try { return JSON.parse(req.thinking_brief || 'null')?.chat_round || 0; } catch { return 0; } })();
        const newRound = oldRound + 1;
        const VALID_TYPES = ['vague', 'conflicted', 'blank', null];
        let diagnosis = null;
        const rawDiag = parsed.diagnosis;
        if (rawDiag && typeof rawDiag === 'object' && VALID_TYPES.includes(rawDiag.type)) {
          diagnosis = { type: rawDiag.type, label: typeof rawDiag.label === 'string' ? rawDiag.label.slice(0, 10) : '', guide: typeof rawDiag.guide === 'string' ? rawDiag.guide.slice(0, 30) : '', confidence: typeof rawDiag.confidence === 'number' ? Math.max(0, Math.min(1, rawDiag.confidence)) : 0 };
        }
        const brief = {
          status: 'done', opening: typeof parsed.opening === 'string' ? parsed.opening : '',
          ai_understanding: typeof parsed.ai_understanding === 'string' ? parsed.ai_understanding : '',
          followup_question: typeof parsed.followup_question === 'string' ? parsed.followup_question : '',
          diagnosis, dialog: null, chat_round: newRound,
          generated_at: new Date().toISOString(), model: model.id, error: null,
        };
        reqStore.update(requirementId, { thinking_brief: JSON.stringify(brief) });
        console.log(`[brief.stream] ${requirementId} 流式生成完成（chat_round=${newRound}）`);

        // v0.3.6 流式完成后的后处理：路由器 + clarity 评估（跟 runBriefJob 一致）
        setImmediate(async () => {
          try {
            const { pickNext } = require('./assists/router');
            const assists = require('./assists');
            const fresh = reqStore.getById(requirementId);
            if (fresh && fresh.status === 'idea') {
              const usedMethods = [];
              const roundUsedMethods = [];
              for (const method of ['decision_tree', 'scenarios', 'diagnosis', 'tradeoff', 'arch']) {
                const svc = assists.getAssist(method);
                const data = svc && svc.getAssist ? svc.getAssist(requirementId) : null;
                if (!data) continue;
                if (data.used) usedMethods.push(method);
                if (data.status === 'done' && typeof data.generated_at_round === 'number' && data.generated_at_round === newRound) roundUsedMethods.push(method);
              }
              pickNext(fresh, { usedMethods, roundUsedMethods, chatRound: newRound }, opts.modelId).catch(e => console.error('[brief.stream.router] 异常:', e.message));
            }
          } catch (e) { console.error('[brief.stream.router] 异常:', e.message); }
        });
        setImmediate(async () => {
          try {
            const { generateDialog } = require('./elicitor-dialog');
            const fresh = reqStore.getById(requirementId);
            if (fresh && fresh.status === 'idea') {
              const currentBrief = JSON.parse(fresh.thinking_brief || 'null');
              if (currentBrief && currentBrief.status === 'done') {
                const dialog = await generateDialog(currentBrief, fresh, opts.modelId);
                if (dialog) {
                  const updated = JSON.parse(fresh.thinking_brief || '{}');
                  updated.dialog = dialog;
                  reqStore.update(requirementId, { thinking_brief: JSON.stringify(updated) });
                }
              }
            }
          } catch (e) { console.error('[brief.stream.dialog] 异常:', e.message); }
        });
        setImmediate(async () => {
          try {
            const { assessClarity } = require('./insight-previews');
            const fresh = reqStore.getById(requirementId);
            if (fresh) {
              let sh = [];
              try { sh = JSON.parse(fresh.supplement_history || '[]'); if (!Array.isArray(sh)) sh = []; } catch {}
              const result = await assessClarity(fresh.title, fresh.description, null, sh);
              if (result?.clarity) reqStore.update(requirementId, { input_clarity: result.clarity, clarity_reason: result.reason || '', clarity_model: result.modelId });
            }
          } catch (e) { console.error('[brief.stream.clarity] 异常:', e.message); }
        });

        yield { type: 'done', brief };
        return;
      } else if (event.type === 'error') { yield event; return; }
    }
  } catch (e) {
    console.error(`[brief.stream] ${requirementId} 异常:`, e.message);
    yield { type: 'error', message: e.message };
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

module.exports = { generateBrief, runBriefJob, getBrief, runBriefJobStream };
