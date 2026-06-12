// 取舍清单辅助手段（v0.3.3 Phase 2）
// AI 列出 3-5 个"这个需求里必然会取舍"的维度对，让用户表态倾向
// 字段：requirement.assist_tradeoff

const { callLLM } = require('../llm-adapter');
const modelStore = require('../../stores/model-store');
const reqStore = require('../../stores/requirement-store');

function pickDefaultLlm() {
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0]
      || null;
}

const TRADEOFF_PROMPT = `你是 ACMS 系统的「取舍清单助手」。给定一个需求，找出 3-5 个**必然存在的取舍维度**——不是所有的取舍，而是用户必须做出选择的关键维度。

每个维度：
- axis (≤15 字): 取舍轴的标题（如"功能广度 vs 易上手"）
- options: 2 个选项 [optionA, optionB]
- context (≤60 字): 这个取舍对这个需求意味着什么（让用户知道选了之后会发生什么）
- hint (≤30 字): 引导用户表态的话（开放问题，让用户说出自己的倾向）

要求：
- 维度要**针对这个具体需求**——不要"质量 vs 速度"这种通用废话
- 2 个选项要互斥 + 各自有代表性（不能"功能丰富"vs"功能全面"这种没区分）
- 输出严格 JSON：
{"dimensions":[
  {"axis":"...","options":["...","..."],"context":"...","hint":"..."},
  {"axis":"...","options":["...","..."],"context":"...","hint":"..."}
]}
不要任何额外文字、markdown 代码块、解释。`;

async function runAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  reqStore.update(requirementId, {
    assist_tradeoff: JSON.stringify({
      status: 'generating',
      dimensions: [],
      picks: {},
      started_at: new Date().toISOString(),
      generated_at: null,
      error: null,
      model: null,
      used: false,
    }),
  });
  console.log(`[assist:tradeoff] ${requirementId} 开始生成`);

  try {
    const model = opts.modelId ? modelStore.getById(opts.modelId) : pickDefaultLlm();
    if (!model) throw new Error('NO_LLM_AVAILABLE');

    const messages = [
      { role: 'system', content: TRADEOFF_PROMPT },
      {
        role: 'user',
        content: [
          `需求标题: ${req.title || '(空)'}`,
          `需求描述: ${req.description || '(空)'}`,
        ].join('\n'),
      },
    ];

    const result = await callLLM(model.id, messages, {
      temperature: 0.4,
      maxTokens: 900,
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
    const dimensions = Array.isArray(parsed.dimensions) ? parsed.dimensions.slice(0, 5) : [];

    reqStore.update(requirementId, {
      assist_tradeoff: JSON.stringify({
        status: 'done',
        dimensions,
        picks: {},
        generated_at: new Date().toISOString(),
        model: model.id,
        error: null,
        used: false,
      }),
    });
    console.log(`[assist:tradeoff] ${requirementId} 完成, ${dimensions.length} 个维度`);
  } catch (e) {
    console.error(`[assist:tradeoff] ${requirementId} 失败:`, e.message);
    reqStore.update(requirementId, {
      assist_tradeoff: JSON.stringify({
        status: 'failed',
        dimensions: [],
        error: e.message,
        generated_at: new Date().toISOString(),
        used: false,
      }),
    });
  }
}

function setPick(requirementId, dimIdx, pick) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  let assist;
  try { assist = JSON.parse(req.assist_tradeoff || 'null'); } catch { assist = null; }
  if (!assist) return null;
  assist.used = true;
  assist.picks = assist.picks || {};
  assist.picks[dimIdx] = pick;
  assist.last_pick_at = new Date().toISOString();
  reqStore.update(requirementId, { assist_tradeoff: JSON.stringify(assist) });
  return assist;
}

function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try { return JSON.parse(req.assist_tradeoff || 'null'); } catch { return null; }
}

module.exports = {
  name: '取舍清单（关键取舍维度，你表态）',
  field: 'assist_tradeoff',
  runAssistJob,
  setPick,
  getAssist,
};
