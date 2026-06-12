// 场景剧本辅助手段（v0.3.3 Phase 2）
// AI 给出 3 个典型用户场景，让用户挑"我最像哪一个" → 帮用户具象化目标用户
// 字段：requirement.assist_scenarios

const { callLLM } = require('../llm-adapter');
const modelStore = require('../../stores/model-store');
const reqStore = require('../../stores/requirement-store');

function pickDefaultLlm() {
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0]
      || null;
}

const SCENARIOS_PROMPT = `你是 ACMS 系统的「场景剧本助手」。给定一个需求，给出 3 个**真实可信**的典型用户场景。

每个场景的结构：
- title (≤15 字): 场景的一句话标题（如"市场经理的周五下午"）
- persona (≤20 字): 角色（如"市场经理 / 28 岁 / SaaS 公司"）
- context (≤40 字): 这个角色在什么背景下遇到这个场景
- pain (≤40 字): 现在的痛点（不用这个产品时怎么难受）
- goal (≤40 字): 用上这个产品后希望达成什么
- quote (≤30 字): 这个角色可能会说的话（让场景更真实）

要求：
- 3 个场景**互不重叠**（不同角色 / 不同情境 / 不同优先级）
- 场景要**具体**——不要"用户想要提高效率"这种空话，要"市场经理每周五下午要汇总 5 个平台的投放数据"
- persona 要有名字（如"小王 28 岁"），不要只写"用户"
- 输出严格 JSON：
{"scenarios":[
  {"title":"...","persona":"...","context":"...","pain":"...","goal":"...","quote":"..."},
  {"title":"...","persona":"...","context":"...","pain":"...","goal":"...","quote":"..."},
  {"title":"...","persona":"...","context":"...","pain":"...","goal":"...","quote":"..."}
]}
不要任何额外文字、markdown 代码块、解释。`;

async function runAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  reqStore.update(requirementId, {
    assist_scenarios: JSON.stringify({
      status: 'generating',
      scenarios: [],
      picked: null,
      started_at: new Date().toISOString(),
      generated_at: null,
      error: null,
      model: null,
      used: false,
    }),
  });
  console.log(`[assist:scenarios] ${requirementId} 开始生成`);

  try {
    const model = opts.modelId ? modelStore.getById(opts.modelId) : pickDefaultLlm();
    if (!model) throw new Error('NO_LLM_AVAILABLE');

    const messages = [
      { role: 'system', content: SCENARIOS_PROMPT },
      {
        role: 'user',
        content: [
          `需求标题: ${req.title || '(空)'}`,
          `需求描述: ${req.description || '(空)'}`,
          opts.role ? `用户角色: ${opts.role}` : '',
        ].filter(Boolean).join('\n'),
      },
    ];

    const result = await callLLM(model.id, messages, {
      temperature: 0.7,
      maxTokens: 1200,
      jsonMode: true,
    });

    let content = (result.content || '').trim();
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    }
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      content = content.substring(jsonStart, jsonEnd + 1);
    }
    const parsed = JSON.parse(content);
    const scenarios = Array.isArray(parsed.scenarios) ? parsed.scenarios.slice(0, 3) : [];

    reqStore.update(requirementId, {
      assist_scenarios: JSON.stringify({
        status: 'done',
        scenarios,
        picked: null,
        generated_at: new Date().toISOString(),
        model: model.id,
        error: null,
        used: false,
      }),
    });
    console.log(`[assist:scenarios] ${requirementId} 完成, ${scenarios.length} 个场景`);
  } catch (e) {
    console.error(`[assist:scenarios] ${requirementId} 失败:`, e.message);
    reqStore.update(requirementId, {
      assist_scenarios: JSON.stringify({
        status: 'failed',
        scenarios: [],
        error: e.message,
        generated_at: new Date().toISOString(),
        used: false,
      }),
    });
  }
}

function markPicked(requirementId, idx) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  let assist;
  try { assist = JSON.parse(req.assist_scenarios || 'null'); } catch { assist = null; }
  if (!assist) return null;
  assist.used = true;
  assist.picked = idx;
  assist.picked_at = new Date().toISOString();
  reqStore.update(requirementId, { assist_scenarios: JSON.stringify(assist) });
  return assist;
}

function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try { return JSON.parse(req.assist_scenarios || 'null'); } catch { return null; }
}

module.exports = {
  name: '场景剧本（3 个典型用户场景，挑一个最像你的）',
  field: 'assist_scenarios',
  runAssistJob,
  markPicked,
  getAssist,
};
