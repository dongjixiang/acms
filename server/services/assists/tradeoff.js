// 取舍清单辅助手段（v0.3.3 Phase 2）
// AI 列出 3-5 个"这个需求里必然会取舍"的维度对，让用户表态倾向
// 字段：requirement.assist_tradeoff

const { safeParseJSON, callLLMWithRetry } = require('../json-extractor');
const modelStore = require('../../stores/model-store');
const reqStore = require('../../stores/requirement-store');

function pickDefaultLlm() {
  // v0.3.6：优先使用系统配置的「默认思路模型」
  const defaultGen = modelStore.getDefaultGenModel();
  if (defaultGen) return defaultGen;
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0]
      || null;
}

// v0.3.3 B+++ 补丁（2026-06-13）：硬约束输出 token 预算
//   根因：tradeoff 是 5 个 assist 里唯一会反复 JSON 截断的
//   实证（acms.log 06-13）：6 次解析失败 100% 命中 tradeoff，其他 4 个 assist 0 失败
//   结构原因：3-5 维度 × 4 字段（axis+options×2+context+hint）≈ 2000-2500 tok
//            但 maxTokens 一直只给 1500 → LLM 写到第 2-3 个维度就被截断
//   修法：prompt 硬约束 + 给到 2000 tok 留 buffer（attempt 2 再 +400 → 2400）
const TRADEOFF_PROMPT = `你是 ACMS 系统的「取舍清单助手」。给定一个需求，找出**恰好 3 个**（不要 4、不要 5）**必然存在的取舍维度**——不是所有的取舍，而是用户必须做出选择的关键维度。

## 焦点优先（v0.3.3 B 方案补丁）
如果输入里包含「当前对话焦点」（followup_question），**第一个维度必须直接回应这个焦点**——把焦点里隐含的取舍摆出来让用户表态（如焦点是"眼睛 vs 耳朵"，就出"视觉主导 vs 听觉主导"维度）；其他 2 个维度可补充其他关键取舍。**不要凭空从需求整体罗列通用取舍。**

## 硬约束（v0.3.3 B+++：避免 maxTokens 截断）
每个维度**严格 4 字段**，每个字段**严格字数限制**——超出会被强制截断，导致整张清单解析失败：
- axis (≤10 字): 取舍轴的标题（精炼！如"广度 vs 易上手"）
- options: **恰好 2 个选项**，每项 ≤15 字（互斥 + 各自有代表性，不能"功能丰富"vs"功能全面"这种没区分）
- context (≤30 字): 这个取舍对这个需求意味着什么（让用户知道选了之后会发生什么）
- hint (≤20 字): 引导用户表态的话（开放问题，让用户说出自己的倾向）

## 输出 token 自检（生成前自检）
3 个维度 × (~10 + 2×15 + 30 + 20) ≈ 130 字 ≈ 200 tok
加上 JSON 包装符 ≈ 250 tok
所以本任务输出应控制在 300 tok 以内——LLM 默认会"展开解释"要主动克制。

## 输出格式
输出严格 JSON：
{"dimensions":[
  {"axis":"...","options":["...","..."],"context":"...","hint":"..."},
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
          opts.followupQuestion ? `当前对话焦点: ${opts.followupQuestion}` : '',
        ].filter(Boolean).join('\n'),
      },
    ];

    // v0.3.3 B+++ 补丁：tradeoff 单独 maxTokens=2000（其他 assist 800-1200）
    //   根因：tradeoff 字段最密集，1500 不够；实测 1800 仍偶发截断，给到 2000 留 buffer
    //   attempt 2 自动 +300 → 2300 兜极端
    const parsed = await callLLMWithRetry(model, messages, {
      temperature: 0.4, maxTokens: 2000, jsonMode: true, serviceName: 'assist:tradeoff',
    });
    if (!parsed) throw new Error('LLM 返回无法解析为 JSON（已重试 1 次）');
    if (!Array.isArray(parsed.dimensions)) throw new Error('LLM 返回缺少 dimensions 字段');
    const dimensions = parsed.dimensions.slice(0, 5);

    reqStore.update(requirementId, {
      assist_tradeoff: JSON.stringify({
        status: 'done',
        dimensions,
        picks: {},
        generated_at: new Date().toISOString(),
        generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
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
