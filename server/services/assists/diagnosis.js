// 需求体检辅助手段（v0.3.3 Phase 2）
// AI 扫描需求描述里的模糊表达 / 缺的关键维度，给出 3-5 条诊断 + 改进方向
// 字段：requirement.assist_diagnosis

const { callLLM } = require('../llm-adapter');
const modelStore = require('../../stores/model-store');
const reqStore = require('../../stores/requirement-store');

function pickDefaultLlm() {
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0]
      || null;
}

const DIAGNOSIS_PROMPT = `你是 ACMS 系统的「需求体检助手」。给定一个需求，扫描描述里**具体**的模糊表达 / 缺的关键维度，给出 3-5 条诊断。

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
        ].join('\n'),
      },
    ];

    const result = await callLLM(model.id, messages, {
      temperature: 0.3,
      maxTokens: 800,
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
    const issues = Array.isArray(parsed.issues) ? parsed.issues.slice(0, 6) : [];

    reqStore.update(requirementId, {
      assist_diagnosis: JSON.stringify({
        status: 'done',
        issues,
        generated_at: new Date().toISOString(),
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
