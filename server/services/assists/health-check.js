// ACMS · 需求体检（v0.13 B4）
//   单次 LLM 调用，从 6 个维度评分：完整性 / 模糊词 / 风险 / 干系人 / 假设 / 痛点
//   每条发现可持久化驳回（health_check_dismissed），下次体检不再输出
//   字段：req.assist_health_check（结果）+ req.health_check_dismissed（驳回清单）

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

const HEALTH_CHECK_PROMPT = `你是 ACMS 系统的「需求体检助手」。你的工作是从 6 个维度对需求描述做健康检查，给出评分和改进建议。

你需要在分析过程里引用原文作为证据，让用户能验证你的判断。

## 6 维度评分规则
每个维度满分 10 分，从 10 往下扣分。总分 = 加权平均 × 10。

### ① 完整性（5W1H）
检查需求是否覆盖：Who（谁用） What（做什么） Why（为什么做） How（怎么做） When（什么时候） How many（多少用户/规模）
每缺 1 项扣 2 分。发现缺项时引用原文说明。

### ② 模糊词检测
找出"大概/差不多/灵活/等/各类/方便/适当/可配置"等模糊词。每个词扣 2 分，同一词重复出现只扣 1 次。
列出具体模糊词和出现位置。

### ③ 风险识别
识别技术风险（系统依赖/集成）/ 依赖风险（第三方/API）/ 合规风险（数据隐私/行业法规）/ 资源风险（团队/预算）/ 时间线风险。
每条高风险扣 3 分，中风险扣 1 分。如果有缓解方案则不扣。

### ④ 干系人覆盖
识别需求是否明确了各角色及其职责。缺主要执行角色每条扣 3 分，角色模糊每条扣 1 分。

### ⑤ 假设清晰度
识别隐性假设——需求里没说清但暗含的前提。每条假设扣 2 分。引用原文证明这是假设。

### ⑥ 痛点明确度
检查痛点是否有：具体角色 + 场景描述 + 前后对比/数据支撑。痛点具体不扣分；模糊扣 2 分；完全没痛点扣 5 分。

## 输出格式（严格 JSON）
{
  "dimensions": [
    {
      "name": "完整性",
      "score": 7,
      "findings": [
        {
          "text": "缺少「上线时间」和「用户规模」",
          "evidence": "需求描述未提及时间节点和用户数",
          "impact": "medium"
        }
      ]
    }
  ],
  "overallScore": 63,
  "summary": "一句话概述整体健康状况"
}

不要任何额外文字、markdown 代码块、解释。只输出 JSON。`;

async function runAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  reqStore.update(requirementId, {
    assist_health_check: JSON.stringify({
      status: 'generating',
      overallScore: 0,
      dimensions: [],
      summary: '',
      started_at: new Date().toISOString(),
      generated_at: null,
      error: null,
      model: null,
    }),
  });

  try {
    const model = opts.modelId ? modelStore.getById(opts.modelId) : pickDefaultLlm();
    if (!model) throw new Error('NO_LLM_AVAILABLE');

    // 读已驳回的发现，注入 prompt 避免重复
    let dismissedFindings = [];
    try {
      dismissedFindings = JSON.parse(req.health_check_dismissed || '[]');
      if (!Array.isArray(dismissedFindings)) dismissedFindings = [];
    } catch { dismissedFindings = []; }

    const userParts = [
      `需求描述: ${req.description || '(空)'}`,
    ];

    // 如果有已驳回的发现，告诉 LLM 不要重复
    if (dismissedFindings.length > 0) {
      userParts.push('---');
      userParts.push('## 用户已驳回以下发现（请勿重复输出）');
      dismissedFindings.forEach(f => {
        userParts.push(`- ${f}`);
      });
    }

    const messages = [
      { role: 'system', content: HEALTH_CHECK_PROMPT },
      { role: 'user', content: userParts.join('\n') },
    ];

    const parsed = await callLLMWithRetry(model, messages, {
      temperature: 0.3,
      maxTokens: 32000,
      jsonMode: true,
      serviceName: 'assist:health_check',
    });

    const dimensions = (Array.isArray(parsed.dimensions) ? parsed.dimensions : []).slice(0, 6);
    const overallScore = typeof parsed.overallScore === 'number' ? parsed.overallScore : 50;
    const summary = parsed.summary || '';

    reqStore.update(requirementId, {
      assist_health_check: JSON.stringify({
        status: 'done',
        overallScore,
        dimensions,
        summary,
        generated_at: new Date().toISOString(),
        generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
        model: model.id,
        error: null,
      }),
    });
  } catch (e) {
    console.error(`[assist:health_check] ${requirementId} 失败:`, e.message);
    reqStore.update(requirementId, {
      assist_health_check: JSON.stringify({
        status: 'failed',
        overallScore: 0,
        dimensions: [],
        summary: '',
        error: e.message || '未知错误',
        generated_at: new Date().toISOString(),
      }),
    });
  }
}

function markUsed(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  let assist;
  try { assist = JSON.parse(req.assist_health_check || 'null'); } catch { assist = null; }
  if (!assist) return null;
  assist.used = true;
  assist.used_at = new Date().toISOString();
  reqStore.update(requirementId, { assist_health_check: JSON.stringify(assist) });
  return assist;
}

function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try { return JSON.parse(req.assist_health_check || 'null'); } catch { return null; }
}

/**
 * 持久化驳回：把一条发现文本加入 health_check_dismissed 数组
 * @param {string} requirementId
 * @param {object} payload - { findingText: string }
 * @returns {object} { ok, dismissed }
 */
function dismissFinding(requirementId, payload) {
  const req = reqStore.getById(requirementId);
  if (!req) return { error: 'REQ_NOT_FOUND' };

  const { findingText } = payload || {};
  if (!findingText || typeof findingText !== 'string') return { error: 'INVALID_FINDING_TEXT' };

  let dismissed = [];
  try { dismissed = JSON.parse(req.health_check_dismissed || '[]'); } catch { dismissed = []; }
  if (!Array.isArray(dismissed)) dismissed = [];

  if (!dismissed.includes(findingText)) {
    dismissed.push(findingText);
  }

  reqStore.update(requirementId, { health_check_dismissed: JSON.stringify(dismissed) });
  return { ok: true, dismissed };
}

/**
 * 撤销驳回：从 health_check_dismissed 数组中移除一条
 * @param {string} requirementId
 * @param {object} payload - { findingText: string }
 * @returns {object} { ok, dismissed }
 */
function restoreFinding(requirementId, payload) {
  const req = reqStore.getById(requirementId);
  if (!req) return { error: 'REQ_NOT_FOUND' };

  const { findingText } = payload || {};
  if (!findingText || typeof findingText !== 'string') return { error: 'INVALID_FINDING_TEXT' };

  let dismissed = [];
  try { dismissed = JSON.parse(req.health_check_dismissed || '[]'); } catch { dismissed = []; }
  if (!Array.isArray(dismissed)) dismissed = [];

  dismissed = dismissed.filter(f => f !== findingText);

  reqStore.update(requirementId, { health_check_dismissed: JSON.stringify(dismissed) });
  return { ok: true, dismissed };
}

/**
 * 获取当前驳回清单
 */
function getDismissed(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return [];
  try { return JSON.parse(req.health_check_dismissed || '[]'); } catch { return []; }
}

module.exports = {
  name: '需求体检',
  field: 'assist_health_check',
  runAssistJob,
  markUsed,
  getAssist,
  dismissFinding,
  restoreFinding,
  getDismissed,
};
