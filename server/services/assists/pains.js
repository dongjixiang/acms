// 五层痛点挖掘术（v0.8）
// 从表层抱怨到情感根源，五层递进式痛点挖掘。
// 加载 SKILL 目录下的 prompt 模板，填充需求上下文后调用 LLM。
// 字段：requirement.assist_pains

const { callLLMWithRetry } = require('../json-extractor');
const modelStore = require('../../stores/model-store');
const reqStore = require('../../stores/requirement-store');
const fs = require('fs');
const path = require('path');

function pickDefaultLlm() {
  const defaultGen = modelStore.getDefaultGenModel();
  if (defaultGen) return defaultGen;
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0]
      || null;
}

// 加载 prompt 文件（从 skill 目录读取）
function loadPrompt(name) {
  try {
    return fs.readFileSync(path.join(__dirname, '../../skills/pain-point-mining/prompts', `${name}.md`), 'utf-8').trim();
  } catch { return null; }
}

async function runAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  reqStore.update(requirementId, {
    assist_pains: JSON.stringify({
      status: 'generating',
      items: [],
      summary: '',
      evolution: '',
      emotional_pains: [],
      started_at: new Date().toISOString(),
      generated_at: null,
      error: null,
      model: null,
      used: false,
    }),
  });
  console.log(`[assist:pains] ${requirementId} 开始五层挖掘`);

  try {
    const model = opts.modelId ? modelStore.getById(opts.modelId) : pickDefaultLlm();
    if (!model) throw new Error('NO_LLM_AVAILABLE');

    // 加载 prompt 模板
    const template = loadPrompt('pains');
    if (!template) throw new Error('PROMPT_PAINS_NOT_FOUND');

    // 填充模板变量
    const prompt = template
      .replace('{title}', req.title || '(空)')
      .replace('{description}', req.description || '(空)')
      .replace('{followup_question}', opts.followupQuestion || '无特定焦点');

    const messages = [
      { role: 'system', content: prompt },
      { role: 'user', content: '请根据以上需求信息，使用五层框架进行痛点挖掘。' },
    ];

    const parsed = await callLLMWithRetry(model, messages, {
      temperature: 0.4, maxTokens: 2500, jsonMode: true, serviceName: 'assist:pains',
    });
    if (!parsed) throw new Error('LLM 返回无法解析为 JSON（已重试 1 次）');

    const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 8) : [];
    const emotional_pains = Array.isArray(parsed.emotional_pains) ? parsed.emotional_pains.slice(0, 4) : [];

    reqStore.update(requirementId, {
      assist_pains: JSON.stringify({
        status: 'done',
        items,
        summary: parsed.summary || '',
        evolution: parsed.evolution || '',
        emotional_pains,
        generated_at: new Date().toISOString(),
        generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
        model: model.id,
        error: null,
        used: false,
      }),
    });
    console.log(`[assist:pains] ${requirementId} 完成, ${items.length} 条痛点, ${emotional_pains.length} 条情绪分析`);
  } catch (e) {
    console.error(`[assist:pains] ${requirementId} 失败:`, e.message);
    reqStore.update(requirementId, {
      assist_pains: JSON.stringify({
        status: 'failed',
        items: [],
        summary: '',
        evolution: '',
        emotional_pains: [],
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
  name: '五层痛点挖掘术（从表层到根因+情绪）',
  field: 'assist_pains',
  runAssistJob,
  markUsed,
  getAssist,
};
