// 风险预警辅助手段（v0.4）
// AI 分析需求描述，扫描潜在风险
// 字段：requirement.assist_risks

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

const RISKS_PROMPT = `你是 ACMS 系统的「风险预警」助手。分析需求描述，扫描潜在风险。

每条风险包含：
- title (≤15字): 名称
- category: 'tech'(技术可行性) / 'dependency'(外部依赖) / 'timeline'(时间估算) / 'compliance'(合规) / 'resource'(资源)
- description (≤60字): 风险描述
- likelihood: 'high' / 'medium' / 'low'
- impact: 'high' / 'medium' / 'low'
- severity: 'high' / 'medium' / 'low'
- mitigation (≤50字): 缓解建议

额外整体字段：summary (≤60字): 一句话概述

输出 JSON: {"summary":"...","items":[{...}]}
最多6条。只列真实风险，不编造。

注意输出必须是纯 JSON，不要 markdown 包裹。`;

async function runAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  reqStore.update(requirementId, {
    assist_risks: JSON.stringify({
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
  console.log(`[assist:risks] ${requirementId} 开始生成`);

  try {
    const model = opts.modelId ? modelStore.getById(opts.modelId) : pickDefaultLlm();
    if (!model) throw new Error('NO_LLM_AVAILABLE');

    const messages = [
      { role: 'system', content: RISKS_PROMPT },
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
      temperature: 0.3, maxTokens: 1200, jsonMode: true, serviceName: 'assist:risks',
    });
    if (!parsed) throw new Error('LLM 返回无法解析为 JSON（已重试 1 次）');
    const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 6) : [];
    const summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 60) : '';

    reqStore.update(requirementId, {
      assist_risks: JSON.stringify({
        status: 'done',
        items,
        summary,
        generated_at: new Date().toISOString(),
        generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
        model: model.id,
        error: null,
        used: false,
      }),
    });
    console.log(`[assist:risks] ${requirementId} 完成, ${items.length} 条风险`);
  } catch (e) {
    console.error(`[assist:risks] ${requirementId} 失败:`, e.message);
    reqStore.update(requirementId, {
      assist_risks: JSON.stringify({
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
  try { assist = JSON.parse(req.assist_risks || 'null'); } catch { assist = null; }
  if (!assist) return null;
  assist.used = true;
  assist.used_at = new Date().toISOString();
  reqStore.update(requirementId, { assist_risks: JSON.stringify(assist) });
  return assist;
}

function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try { return JSON.parse(req.assist_risks || 'null'); } catch { return null; }
}

module.exports = {
  name: '风险预警（扫描潜在风险）',
  field: 'assist_risks',
  runAssistJob,
  markUsed,
  getAssist,
};
