// Elicitor SKILL 适配器（v0.4 Phase 0 安全网）
// 封装 SKILL 注册状态 + prompt 加载 + 健康检查 + 软开关
// router.js 在 pickNext 入口处调 isElicitorEnabled() 决定走 SKILL 路径还是 fallback
//
// 核心约束：
//   - 默认关闭（ELICITOR_ENABLED=false）→ 走 fallback，旧行为完全不变
//   - SKILL 注册 + 5 个 prompt 文件可读 → 才算"启用"
//   - 任一 prompt 缺失 → 降级为 disabled，console.warn 提示

const skillStore = require('../stores/skill-store');

const ELICITOR_SKILL_ID = 'skill-requirement-elicitor';
// SKILL id 跟磁盘目录名不同（id 走 API 命名空间，目录名走文件系统命名空间）
const ELICITOR_DIR = 'elicitor';
const REQUIRED_STEPS = ['diagnose', 'toolbox-vague', 'toolbox-conflicted', 'toolbox-blank', 'solidify'];

/**
 * 软开关读取（Phase 0.1）
 * 优先级：环境变量 > 默认 false
 * 后续 Phase 1+ 可以从 db / 项目配置覆盖
 */
function isElicitorEnabled() {
  const env = process.env.ELICITOR_ENABLED;
  if (env === undefined || env === null) return false;
  return String(env).toLowerCase() === 'true' || env === '1';
}

/**
 * 健康检查（Phase 0.4）
 * 验证 SKILL 已注册 + 5 个 prompt 文件全部可读
 * 返回 { healthy: bool, missing: [], reason: string }
 */
function checkHealth() {
  const skill = skillStore.getById(ELICITOR_SKILL_ID);
  if (!skill) {
    return { healthy: false, missing: REQUIRED_STEPS, reason: 'SKILL 未注册' };
  }
  const registeredSteps = skillStore.listPromptSteps(ELICITOR_SKILL_ID, ELICITOR_DIR);
  const missing = REQUIRED_STEPS.filter(s => !registeredSteps.includes(s));
  if (missing.length > 0) {
    return { healthy: false, missing, reason: `缺少 prompt 文件: ${missing.join(', ')}` };
  }
  return { healthy: true, missing: [], reason: 'all good' };
}

/**
 * 是否真的可以走 elicit 路径
 * = 软开关 on AND 健康检查通过
 */
function canRun() {
  if (!isElicitorEnabled()) return { ok: false, reason: '软开关关闭' };
  const health = checkHealth();
  if (!health.healthy) return { ok: false, reason: health.reason };
  return { ok: true, reason: 'enabled + healthy' };
}

/**
 * 加载某个 step 的 prompt
 */
function loadStepPrompt(stepName) {
  return skillStore.loadPromptStep(ELICITOR_SKILL_ID, stepName, ELICITOR_DIR);
}

/**
 * 启动时健康检查（被 app.js 在 init 阶段调一次）
 * 不健康只 warn 不 throw——保证服务能起来
 */
function startupHealthCheck() {
  if (!isElicitorEnabled()) {
    console.log('[elicitor] 软开关关闭（ELICITOR_ENABLED!=true），走 fallback');
    return;
  }
  const health = checkHealth();
  if (health.healthy) {
    console.log('[elicitor] 启用 + 健康检查通过');
  } else {
    console.warn(`[elicitor] 启用但健康检查失败：${health.reason}（降级为 disabled）`);
  }
}

module.exports = {
  ELICITOR_SKILL_ID,
  REQUIRED_STEPS,
  isElicitorEnabled,
  checkHealth,
  canRun,
  loadStepPrompt,
  startupHealthCheck,
};
