// 需求体检辅助手段（v0.3.3 Phase 2）
// AI 扫描需求描述里的模糊表达 / 缺的关键维度，给出 3-5 条诊断 + 改进方向
// 字段：requirement.assist_diagnosis

const { callLLMWithRetry } = require('../json-extractor');
const modelStore = require('../../stores/model-store');
const reqStore = require('../../stores/requirement-store');

function pickDefaultLlm() {
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0]
      || null;
}

const DIAGNOSIS_PROMPT = `你是 ACMS 系统的「需求体检助手」。给定一个需求，扫描描述里**具体**的模糊表达 / 缺的关键维度，给出 3-5 条诊断。

## 焦点优先（v0.3.3 B 方案补丁）
如果输入里包含「当前对话焦点」（followup_question），**诊断要围绕这个焦点展开**——比如焦点是"眼睛 vs 耳朵"，就扫描述里关于视听表达的具体词；焦点是"面向谁"，就扫描述里关于用户群体的具体词。**不要凭空扫整个描述里所有可能的模糊点。**

每条诊断：
- quote (≤50 字): 引用原描述里的具体一段（让用户知道是哪一句）
- issue (≤30 字): 这句话/这段缺什么（如"没说清楚面向谁"/"用了空泛形容词"）
- category: 'vague' | 'missing' | 'conflict' | 'scope'
  - vague: 用了空泛形容词（友好/简单/快/高效/智能/灵活）
  - missing: 关键维度没说（用户/场景/边界/验收）
  - conflict: 描述里互相矛盾
  - scope: 范围不清（一句话想做太多事）
- suggestion (≤50 字): 怎么改更具体（给一个示例问句）

要求：
- **只列真实存在的**问题；如果描述已经很清晰就少列（不要为了凑数硬挑）
- quote 必须能从原描述里找到（不要编造）
- 输出严格 JSON：
{"issues":[
  {"quote":"...","issue":"...","category":"vague","suggestion":"..."},
  {"quote":"...","issue":"...","category":"missing","suggestion":"..."}
]}
不要任何额外文字、markdown 代码块、解释。`;

async function runAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  reqStore.update(requirementId, {
    assist_diagnosis: JSON.stringify({
      status: 'generating',
      issues: [],
      started_at: new Date().toISOString(),
      generated_at: null,
      error: null,
      model: null,
      used: false,
    }),
  });
  console.log(`[assist:diagnosis] ${requirementId} 开始生成`);

  try {
    const model = opts.modelId ? modelStore.getById(opts.modelId) : pickDefaultLlm();
    if (!model) throw new Error('NO_LLM_AVAILABLE');

    const messages = [
      { role: 'system', content: DIAGNOSIS_PROMPT },
      {
        role: 'user',
        content: [
          `需求标题: ${req.title || '(空)'}`,
          `需求描述: ${req.description || '(空)'}`,
          opts.followupQuestion ? `当前对话焦点: ${opts.followupQuestion}` : '',
        ].filter(Boolean).join('\n'),
      },
    ];

    // v0.3.3 B++ 补丁：用 callLLMWithRetry（公共重试工具）替代直接 callLLM
    const parsed = await callLLMWithRetry(model, messages, {
      temperature: 0.3, maxTokens: 800, jsonMode: true, serviceName: 'assist:diagnosis',
    });
    if (!parsed) throw new Error('LLM 返回无法解析为 JSON（已重试 1 次）');
    if (!Array.isArray(parsed.issues)) throw new Error('LLM 返回缺少 issues 字段');
    const issues = parsed.issues.slice(0, 6);

    reqStore.update(requirementId, {
      assist_diagnosis: JSON.stringify({
        status: 'done',
        issues,
        generated_at: new Date().toISOString(),
        generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
        model: model.id,
        error: null,
        used: false,
      }),
    });
    console.log(`[assist:diagnosis] ${requirementId} 完成, ${issues.length} 条诊断`);
  } catch (e) {
    console.error(`[assist:diagnosis] ${requirementId} 失败:`, e.message);
    reqStore.update(requirementId, {
      assist_diagnosis: JSON.stringify({
        status: 'failed',
        issues: [],
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
  try { assist = JSON.parse(req.assist_diagnosis || 'null'); } catch { assist = null; }
  if (!assist) return null;
  assist.used = true;
  assist.used_at = new Date().toISOString();
  reqStore.update(requirementId, { assist_diagnosis: JSON.stringify(assist) });
  return assist;
}

function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try { return JSON.parse(req.assist_diagnosis || 'null'); } catch { return null; }
}

module.exports = {
  name: '需求体检（扫描模糊表达 + 缺的关键维度）',
  field: 'assist_diagnosis',
  runAssistJob,
  markUsed,
  getAssist,
};
