// 痛点溯源辅助手段（v0.4）
// AI 分析需求描述，挖掘隐藏痛点并按类别归类
// 字段：requirement.assist_pains

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

const PAINS_PROMPT = `你是 ACMS 系统的「痛点溯源」助手。分析需求描述，挖掘隐藏的痛点，按类别归类。

每条痛点包含：
- title (≤15字): 短名称
- category: 'efficiency'(效率) / 'experience'(体验) / 'cost'(成本) / 'risk'(风险) / 'quality'(质量)
- description (≤60字): 痛点描述
- impact (≤50字): 不解决的后果
- severity: 'high' / 'medium' / 'low'
- evidence (≤50字): 原文引用

输出 JSON: {"items":[{...}]}
最多6条。只列真实存在的痛点。若描述清晰无痛点，返回空数组。

注意输出必须是纯 JSON，不要 markdown 包裹。`;

async function runAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  reqStore.update(requirementId, {
    assist_pains: JSON.stringify({
      status: 'generating',
      items: [],
      started_at: new Date().toISOString(),
      generated_at: null,
      error: null,
      model: null,
      used: false,
    }),
  });
  console.log(`[assist:pains] ${requirementId} 开始生成`);

  try {
    const model = opts.modelId ? modelStore.getById(opts.modelId) : pickDefaultLlm();
    if (!model) throw new Error('NO_LLM_AVAILABLE');

    const messages = [
      { role: 'system', content: PAINS_PROMPT },
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
      temperature: 0.3, maxTokens: 1200, jsonMode: true, serviceName: 'assist:pains',
    });
    if (!parsed) throw new Error('LLM 返回无法解析为 JSON（已重试 1 次）');
    const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 6) : [];

    reqStore.update(requirementId, {
      assist_pains: JSON.stringify({
        status: 'done',
        items,
        generated_at: new Date().toISOString(),
        generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
        model: model.id,
        error: null,
        used: false,
      }),
    });
    console.log(`[assist:pains] ${requirementId} 完成, ${items.length} 条痛点`);
  } catch (e) {
    console.error(`[assist:pains] ${requirementId} 失败:`, e.message);
    reqStore.update(requirementId, {
      assist_pains: JSON.stringify({
        status: 'failed',
        items: [],
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
  try { assist = JSON.parse(req.assist_pains || 'null'); } catch { assist = null; }
  if (!assist) return null;
  assist.used = true;
  assist.used_at = new Date().toISOString();
  reqStore.update(requirementId, { assist_pains: JSON.stringify(assist) });
  return assist;
}

function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try { return JSON.parse(req.assist_pains || 'null'); } catch { return null; }
}

module.exports = {
  name: '痛点溯源（分析需求描述，挖掘隐藏痛点）',
  field: 'assist_pains',
  runAssistJob,
  markUsed,
  getAssist,
};
