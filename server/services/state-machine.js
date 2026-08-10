// 需求状态机
const { collection } = require('../db/connection');

const VALID_TRANSITIONS = {
  idea: ['clarifying', 'abandoned'],
  clarifying: ['review', 'abandoned'],
  review: ['approved', 'clarifying', 'abandoned'],   // approved by user, clarifying on reject
  approved: ['in_execution', 'abandoned'],
  in_execution: ['done', 'change_requested', 'abandoned'],
  change_requested: ['impact_analysis'],
  impact_analysis: ['clarifying', 'in_execution'],    // back to clarifying on confirmed, resume on cancel
  done: [],
  abandoned: [],
};

// 门控条件: 从 clarifying → review 需要满足
const GATE_CONDITIONS = {
  'clarifying→review': (req) => {
    const errors = [];
    if (!req.title || req.title.trim().length === 0) errors.push('标题不能为空');
    if (!req.structured_description || req.structured_description.length < 30) {
      const srsCheck = typeof req.srs === 'string' ? JSON.parse(req.srs) : req.srs;
      const summary = (srsCheck && srsCheck.summary) || '';
      if (!summary || summary.length < 30) {
        errors.push('需求描述不完整(至少30字)');
      }
    }
    const srs = typeof req.srs === 'string' ? JSON.parse(req.srs) : req.srs;
    if (!srs.acceptanceCriteria || srs.acceptanceCriteria.length === 0) errors.push('至少需要1条验收标准');
    // SMART 检查：至少 1 条 AC 包含可衡量的数字指标（兼容字符串和对象格式）
    const hasMeasurableAC = (srs.acceptanceCriteria || []).some(ac => {
      const text = typeof ac === 'string' ? ac : (ac.criterion || ac.description || ac.text || JSON.stringify(ac));
      return /\d+/.test(text);
    });
    if (!hasMeasurableAC) errors.push('验收标准缺少可衡量的数字指标（如时间/数量/百分比），请补充');
    // 截止日期警告（不阻塞）
    if (!req.deadline || req.deadline.trim() === '') {
      console.log(`[Gate] 警告: 需求 ${req.id} 未设置截止日期`);
    }
    const refinement = typeof req.refinement === 'string' ? JSON.parse(req.refinement) : req.refinement;
    const pendingClarifications = (refinement.clarifications || []).filter(c => c.status === 'pending');
    if (pendingClarifications.length > 0) errors.push(`还有 ${pendingClarifications.length} 条澄清问题未回答`);
    return { passed: errors.length === 0, errors };
  },
};

// 年龄检查: N 天未活动的 idea/clarifying 需求自动放弃
//   配置项走 system_configs 表（admin UI 实时切换）：
//     - auto_abandon_enabled  (bool, 默认 true)
//     - auto_abandon_days     (int  1-365, 默认 7)
const DEFAULT_ABANDON_DAYS = 7;
const SYSTEM_CONFIG_KEY_ENABLED = 'auto_abandon_enabled';
const SYSTEM_CONFIG_KEY_DAYS = 'auto_abandon_days';

function getAutoAbandonConfig() {
  try {
    const cfgs = collection('system_configs');
    const enabledCfg = cfgs.findOne(c => c.key === SYSTEM_CONFIG_KEY_ENABLED);
    const daysCfg = cfgs.findOne(c => c.key === SYSTEM_CONFIG_KEY_DAYS);
    // 默认开启 + 7 天（与历史行为一致，向后兼容）
    const enabled = enabledCfg
      ? (enabledCfg.value === true || enabledCfg.value === 'true' || enabledCfg.value === 1 || enabledCfg.value === '1')
      : true;
    const days = daysCfg ? (parseInt(daysCfg.value, 10) || DEFAULT_ABANDON_DAYS) : DEFAULT_ABANDON_DAYS;
    return { enabled, days };
  } catch (e) {
    return { enabled: true, days: DEFAULT_ABANDON_DAYS };
  }
}

function canTransition(currentStatus, targetStatus) {
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  return allowed.includes(targetStatus);
}

function getGateErrors(requirement) {
  const key = `${requirement.status}→review`;
  const gateCheck = GATE_CONDITIONS[key];
  if (gateCheck) return gateCheck(requirement);
  return { passed: true, errors: [] };
}

function getNextStatuses(currentStatus) {
  return VALID_TRANSITIONS[currentStatus] || [];
}

function shouldAutoAbandon(requirement) {
  const cfg = getAutoAbandonConfig();
  if (!cfg.enabled) return false;
  if (requirement.status !== 'clarifying' && requirement.status !== 'idea') return false;
  const updatedAt = new Date(requirement.updated_at).getTime();
  return (Date.now() - updatedAt) > cfg.days * 24 * 60 * 60 * 1000;
}

module.exports = { canTransition, getGateErrors, getNextStatuses, shouldAutoAbandon, getAutoAbandonConfig, VALID_TRANSITIONS };
