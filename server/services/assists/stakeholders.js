// 干系人地图辅助手段（v0.4）
// AI 分析需求描述，识别所有相关干系人
// 字段：requirement.assist_stakeholders

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

const STAKEHOLDERS_PROMPT = `你是 ACMS 系统的「干系人地图」助手。分析需求描述，识别所有相关干系人。

每条干系人包含：
- role (≤15字): 角色名称
- type: 'decision_maker'(决策者) / 'end_user'(实际用户) / 'operator'(运营维护) / 'dependency'(上下游依赖) / 'observer'(关注方)
- concern (≤50字): 关注什么
- potential_resistance (≤40字): 可能的阻力
- priority: 'high' / 'medium' / 'low'
- influence: 'high' / 'medium' / 'low'

输出 JSON: {"items":[{...}]}
最多6条。只列真实有关系的干系人，不凑数。

注意输出必须是纯 JSON，不要 markdown 包裹。`;

async function runAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  reqStore.update(requirementId, {
    assist_stakeholders: JSON.stringify({
      status: 'generating',
      items: [],
      started_at: new Date().toISOString(),
      generated_at: null,
      error: null,
      model: null,
      used: false,
    }),
  });
  console.log(`[assist:stakeholders] ${requirementId} 开始生成`);

  try {
    const model = opts.modelId ? modelStore.getById(opts.modelId) : pickDefaultLlm();
    if (!model) throw new Error('NO_LLM_AVAILABLE');

    const messages = [
      { role: 'system', content: STAKEHOLDERS_PROMPT },
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
      temperature: 0.3, maxTokens: 1200, jsonMode: true, serviceName: 'assist:stakeholders',
    });
    if (!parsed) throw new Error('LLM 返回无法解析为 JSON（已重试 1 次）');
    const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 6) : [];

    reqStore.update(requirementId, {
      assist_stakeholders: JSON.stringify({
        status: 'done',
        items,
        generated_at: new Date().toISOString(),
        generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
        model: model.id,
        error: null,
        used: false,
      }),
    });
    console.log(`[assist:stakeholders] ${requirementId} 完成, ${items.length} 条干系人`);
  } catch (e) {
    console.error(`[assist:stakeholders] ${requirementId} 失败:`, e.message);
    reqStore.update(requirementId, {
      assist_stakeholders: JSON.stringify({
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
  try { assist = JSON.parse(req.assist_stakeholders || 'null'); } catch { assist = null; }
  if (!assist) return null;
  assist.used = true;
  assist.used_at = new Date().toISOString();
  reqStore.update(requirementId, { assist_stakeholders: JSON.stringify(assist) });
  return assist;
}

function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try { return JSON.parse(req.assist_stakeholders || 'null'); } catch { return null; }
}

module.exports = {
  name: '干系人地图',
  field: 'assist_stakeholders',
  runAssistJob,
  markUsed,
  getAssist,
};
