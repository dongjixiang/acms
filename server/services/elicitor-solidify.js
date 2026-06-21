// Elicitor 固化服务（v0.4 Phase 4.1）
// 在 idea → clarifying 转换时调用：调 solidify.md prompt 产出"我们讨论了什么"摘要
//
// 输入：requirement.thinking_brief（含 diagnosis + dialog + 各轮 brief）+ requirement 完整记录
// 输出：{ summary, boundaries[], tradeoff_points[], next_step } | null
//
// 约束：
//   - elicitor 必须 enabled 且 health 通过
//   - brief.status === 'done' 才调（避免在生成中跑）
//   - 失败返回 null（路由层会兜底走 raw brief 内容）

const { callLLM } = require('./llm-adapter');
const { safeParseJSON } = require('./json-extractor');
const modelStore = require('../stores/model-store');
const elicitorAdapter = require('./elicitor-adapter');

const SOLIDIFY_STEP_FILE = 'solidify';

const SOLIDIFY_SYSTEM_PROMPT = `你是 ACMS 系统的「需求固化助手」。你刚刚完成了诊断对话（diagnosis → toolbox），现在要把所有产出收拢成一份"我们对需求的共识摘要"。

## 输入
- 原始需求描述
- diagnosis（type/label/guide/confidence）
- 各轮 brief（ai_understanding / opening / followup_question）
- dialog（chosen_method / guide_question / expected_schema）

## 输出（严格 JSON）
{
  "summary": "≤120 字。自然语言写给用户看的'我们讨论了什么'（不是 JSON）。例：你真正在意的是 XX 和 YY，ZZ 可以接受妥协。",
  "boundaries": [
    { "dimension": "...", "value": "...", "confidence": "high|medium|low", "source": "极端对比|反向清单|..." }
  ],
  "tradeoff_points": [
    { "dimension": "速度 vs 安全", "user_stance": "倾向安全但犹豫" }
  ],
  "next_step": "固化 | 进澄清"
}

## 原则
- summary 用自然语言写，不是 JSON
- 只写用户自己表达过的，不要 AI 脑补
- tradeoff_point 比 boundary 更值钱——用户犹豫的地方是真正的设计决策点
- boundaries 留空数组也行（如果用户没明确表态任何边界）
- 不要任何额外文字、markdown 代码块、解释`;

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
 * 生成固化摘要
 * @param {object} brief - requirement.thinking_brief（含 diagnosis + dialog + 各轮 brief）
 * @param {object} req - requirement 完整记录（含 title + description）
 * @param {string} [modelId]
 * @returns {Promise<{summary, boundaries, tradeoff_points, next_step} | null>}
 */
async function generateSummary(brief, req, modelId) {
  // elicitor 必须启用（沿用 Phase 0 安全网）
  const canRun = elicitorAdapter.canRun();
  if (!canRun.ok) {
    console.log(`[elicitor-solidify] 跳过：${canRun.reason}`);
    return null;
  }

  if (!brief || brief.status !== 'done') {
    console.log('[elicitor-solidify] 跳过：brief 不为 done');
    return null;
  }

  // 加载 solidify prompt
  const systemContext = elicitorAdapter.loadStepPrompt(SOLIDIFY_STEP_FILE) || '';

  const model = modelId ? modelStore.getById(modelId) : pickDefaultLlm();
  if (!model) throw new Error('NO_LLM_AVAILABLE');

  // 拼接所有对话上下文
  const userMessage = [
    `原始需求: ${req.description || req.title || '(空)'}`,
    `diagnosis: ${JSON.stringify(brief.diagnosis || {})}`,
    `ai_understanding: ${brief.ai_understanding || ''}`,
    `opening: ${brief.opening || ''}`,
    `followup_question: ${brief.followup_question || ''}`,
    brief.dialog ? `dialog: ${JSON.stringify(brief.dialog)}` : '',
    '',
    '【当前固化方法论】',
    systemContext,
  ].filter(Boolean).join('\n');

  const messages = [
    { role: 'system', content: SOLIDIFY_SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];

  try {
    const result = await callLLM(model.id, messages, {
      temperature: 0.5,
      maxTokens: 800,
      jsonMode: true,
    });
    const parsed = safeParseJSON(result.content);
    if (!parsed) throw new Error('LLM 返回无法解析为 JSON');
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 200) : '',
      boundaries: Array.isArray(parsed.boundaries) ? parsed.boundaries.slice(0, 20) : [],
      tradeoff_points: Array.isArray(parsed.tradeoff_points) ? parsed.tradeoff_points.slice(0, 10) : [],
      next_step: typeof parsed.next_step === 'string' ? parsed.next_step : '进澄清',
      modelId: model.id,
      generated_at: new Date().toISOString(),
    };
  } catch (e) {
    console.warn('[elicitor-solidify] LLM 生成失败:', e.message);
    return null;
  }
}

module.exports = { generateSummary };
