// 假设清单辅助手段（v0.4）
// AI 提取需求描述中的隐藏假设，帮助用户提前发现风险假设
// 字段：requirement.assist_assumptions

const { callLLMWithRetry } = require('../json-extractor');
const modelStore = require('../../stores/model-store');
const reqStore = require('../../stores/requirement-store');

function pickDefaultLlm() {
  const defaultGen = modelStore.getDefaultGenModel();
  if (defaultGen) return defaultGen;
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0]
      || null;
}

const ASSUMPTIONS_PROMPT = `你是 ACMS 系统的「假设清单」助手。分析需求描述，提取其中的隐藏假设。

每条假设包含：
- statement (≤50字): 假设陈述
- category: 'user'(用户行为) / 'tech'(技术环境) / 'business'(业务逻辑) / 'external'(外部因素) / 'scale'(规模)
- confidence: 'high' / 'medium' / 'low'（这个假设有多大把握成立）
- risk_if_wrong (≤50字): 如果假设不成立会怎样
- evidence (≤40字): 依据或原文线索

额外整体字段：summary (≤60字): 一句话概述核心假设风险

输出 JSON：
{"summary":"...","items":[{"statement":"...","category":"user","confidence":"medium","risk_if_wrong":"...","evidence":"..."}]}

最多6条。聚焦关键假设——那些如果错了会根本改变方案的假设。
不要编造，只从描述中提取真实存在的隐含假设。
输出严格纯 JSON，不要任何额外文字、markdown 代码块、解释。`;

async function runAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  reqStore.update(requirementId, {
    assist_assumptions: JSON.stringify({
      status: 'generating',
      items: [],
      summary: '',
      started_at: new Date().toISOString(),
      generated_at: null,
      error: null,
      model: null,
      used: false,
    }),
  });

  try {
    const model = opts.modelId ? modelStore.getById(opts.modelId) : pickDefaultLlm();
    if (!model) throw new Error('NO_LLM_AVAILABLE');

    const messages = [
      { role: 'system', content: ASSUMPTIONS_PROMPT },
      {
        role: 'user',
        content: [
          `需求标题: ${req.title || '(空)'}`,
          `需求描述: ${req.description || '(空)'}`,
          opts.followupQuestion ? `当前对话焦点: ${opts.followupQuestion}` : '',
        ].filter(Boolean).join('\n'),
      },
    ];

    const parsed = await callLLMWithRetry(model, messages, {
      temperature: 0.3, maxTokens: 1500, jsonMode: true, serviceName: 'assist:assumptions',
    });

    const items = (Array.isArray(parsed.items) ? parsed.items : []).slice(0, 6);
    reqStore.update(requirementId, {
      assist_assumptions: JSON.stringify({
        status: 'done',
        items,
        summary: parsed.summary || '',
        generated_at: new Date().toISOString(),
        generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
        model: model.id,
        error: null,
        used: false,
      }),
    });
  } catch (e) {
    reqStore.update(requirementId, {
      assist_assumptions: JSON.stringify({
        status: 'failed',
        items: [],
        summary: '',
        error: e.message,
        generated_at: new Date().toISOString(),
        used: false,
      }),
    });
  }
}

function markUsed(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  let assist;
  try { assist = JSON.parse(req.assist_assumptions || 'null'); } catch { assist = null; }
  if (!assist) return null;
  assist.used = true;
  assist.used_at = new Date().toISOString();
  reqStore.update(requirementId, { assist_assumptions: JSON.stringify(assist) });
  return assist;
}

function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try { return JSON.parse(req.assist_assumptions || 'null'); } catch { return null; }
}

module.exports = {
  name: '假设清单（提取隐藏假设）',
  field: 'assist_assumptions',
  runAssistJob,
  markUsed,
  getAssist,
};
