// Elicitor 对话生成服务（v0.4 Phase 2b）
// brief 完成后调用：根据 diagnosis.type 选对应 toolbox prompt，产出引导问题
//
// 输入：requirement.thinking_brief（含 diagnosis）+ 用户原始描述
// 输出：{ guide_question, chosen_method, expected_schema }
//
//   - chosen_method: 选了哪个 toolbox 方法（场景压缩 / 极端对比 / ...）
//   - guide_question: 准备递 给用户的引导问题（≤50 字）
//   - expected_schema: 期望用户回答的格式提示（用于前端回答框 placeholder）
//
// 关键约束：
//   - 不做完整对话循环（用户回答 → 重新生成 brief）—— 这留给 Phase 2b+ 后续
//   - 只产出"引导问题"展示给用户，作为脚手架
//   - diagnosis.type === null 时返回 null（不调 LLM）

const { callLLM } = require('./llm-adapter');
const { safeParseJSON } = require('./json-extractor');
const modelStore = require('../stores/model-store');
const elicitorAdapter = require('./elicitor-adapter');

const TOOLBOX_PROMPT_FILES = {
  vague: 'toolbox-vague',
  conflicted: 'toolbox-conflicted',
  blank: 'toolbox-blank',
};

const DIALOG_SYSTEM_PROMPT = `你是 ACMS 系统的「需求启发师」。你刚刚完成了一轮诊断（diagnosis），现在要从对应工具箱（toolbox）里选一个最合适的方法，产出一个引导问题递给用户。

## 输入
- diagnosis.type: vague | conflicted | blank
- diagnosis.label + diagnosis.guide（已展示给用户的诊断标签）
- 用户原始需求描述
- AI 当前对需求的理解
- 上一轮的 followup_question（如有）

## 输出（严格 JSON）
{
  "chosen_method": "你选的工具箱方法（如『场景压缩』『极端对比』『反向清单』『失败预演』『倒计时失效』『荒谬方案法』）",
  "guide_question": "≤50 字。准备递给用户的引导问题（语气自然、像聊天）。",
  "expected_schema": "≤30 字。期望用户回答的格式（如『一句话回答』『2-3 个取舍表态』『3 个特点清单』）。"
}

## 原则
- 选 1 个方法，不要选多个
- 引导问题要让用户能用一两句话答得出来
- 不要重复诊断已经问过的内容
- 不要任何额外文字、markdown 代码块、解释`;

/**
 * 选默认 LLM
 */
function pickDefaultLlm() {
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0]
      || null;
}

/**
 * 生成引导问题
 * @param {object} brief - requirement.thinking_brief（含 diagnosis）
 * @param {object} req - requirement 完整记录（含 title + description）
 * @param {string} [modelId]
 * @returns {Promise<{chosen_method, guide_question, expected_schema, modelId} | null>}
 *   null 表示不该生成（diagnosis 为空 / 软开关关闭）
 */
async function generateDialog(brief, req, modelId) {
  // 检查 elicitor 启用 + health（沿用 Phase 0 安全网）
  const canRun = elicitorAdapter.canRun();
  if (!canRun.ok) {
    console.log(`[elicitor-dialog] 跳过：${canRun.reason}`);
    return null;
  }

  const diagnosis = brief?.diagnosis;
  if (!diagnosis || !diagnosis.type) {
    console.log('[elicitor-dialog] 跳过：diagnosis 为空');
    return null;
  }

  // 加载对应 toolbox prompt
  const stepFile = TOOLBOX_PROMPT_FILES[diagnosis.type];
  if (!stepFile) {
    console.warn(`[elicitor-dialog] 未知 diagnosis.type=${diagnosis.type}，跳过`);
    return null;
  }
  const toolboxContext = elicitorAdapter.loadStepPrompt(stepFile) || '';

  const model = modelId ? modelStore.getById(modelId) : pickDefaultLlm();
  if (!model) throw new Error('NO_LLM_AVAILABLE');

  // 拼接对话上下文
  const userMessage = [
    `diagnosis_type: ${diagnosis.type}`,
    `diagnosis_label: ${diagnosis.label || ''}`,
    `diagnosis_guide: ${diagnosis.guide || ''}`,
    `用户原始描述: ${req.description || req.title || '(空)'}`,
    `AI 理解: ${brief.ai_understanding || ''}`,
    `上一轮追问: ${brief.followup_question || ''}`,
    '',
    '【当前工具箱方法清单】',
    toolboxContext,
  ].join('\n');

  const messages = [
    { role: 'system', content: DIALOG_SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];

  try {
    const result = await callLLM(model.id, messages, {
      temperature: 0.7,
      maxTokens: 400,
      jsonMode: true,
    });
    const parsed = safeParseJSON(result.content);
    if (!parsed) throw new Error('LLM 返回无法解析为 JSON');
    return {
      chosen_method: typeof parsed.chosen_method === 'string' ? parsed.chosen_method.slice(0, 30) : '',
      guide_question: typeof parsed.guide_question === 'string' ? parsed.guide_question.slice(0, 50) : '',
      expected_schema: typeof parsed.expected_schema === 'string' ? parsed.expected_schema.slice(0, 30) : '',
      modelId: model.id,
    };
  } catch (e) {
    console.warn('[elicitor-dialog] LLM 生成失败:', e.message);
    return null;
  }
}

module.exports = { generateDialog };
