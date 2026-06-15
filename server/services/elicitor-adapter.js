// Elicitor SKILL 适配器（v0.4 Phase 0 安全网）
// 封装 SKILL 注册状态 + prompt 加载 + 健康检查 + 软开关
// router.js 在 pickNext 入口处调 isElicitorEnabled() 决定走 SKILL 路径还是 fallback
//
// 核心约束：
//   - 默认关闭（ELICITOR_ENABLED=false）→ 走 fallback，旧行为完全不变
//   - SKILL 注册 + 5 个 prompt 文件可读 → 才算"启用"
//   - 任一 prompt 缺失 → 降级为 disabled，console.warn 提示

const skillStore = require('../stores/skill-store');
const { collection } = require('../db/connection');

const ELICITOR_SKILL_ID = 'skill-requirement-elicitor';
// SKILL id 跟磁盘目录名不同（id 走 API 命名空间，目录名走文件系统命名空间）
const ELICITOR_DIR = 'elicitor';
const REQUIRED_STEPS = ['diagnose', 'toolbox-vague', 'toolbox-conflicted', 'toolbox-blank', 'solidify'];
const SYSTEM_CONFIG_KEY = 'elicitor_enabled';

/**
 * 软开关读取
 * 优先级：DB system_configs > 环境变量 ELICITOR_ENABLED > 默认 false
 * DB 值在 admin UI 切换；环境变量作为部署期默认值（start.bat / start.sh 里 set 的）
 */
function isElicitorEnabled() {
  const dbVal = readFromDb();
  if (dbVal !== null) return dbVal;
  const env = process.env.ELICITOR_ENABLED;
  if (env === undefined || env === null) return false;
  return String(env).toLowerCase() === 'true' || env === '1';
}

function readFromDb() {
  try {
    const cfg = collection('system_configs').findOne(c => c.key === SYSTEM_CONFIG_KEY);
    if (!cfg) return null;
    const v = cfg.value;
    return v === true || v === 'true' || v === 1 || v === '1';
  } catch (e) {
    return null;
  }
}

/**
 * 设置 DB 中的 elicitor 软开关（被 admin UI 路由调用）
 * 写后立即生效：下一次 canRun() 读到新值
 */
function setElicitorEnabled(enabled) {
  const sysConfigs = collection('system_configs');
  const now = new Date().toISOString();
  const boolVal = !!enabled;
  const existing = sysConfigs.findOne(c => c.key === SYSTEM_CONFIG_KEY);
  if (existing) {
    sysConfigs.update(c => c.key === SYSTEM_CONFIG_KEY, { ...existing, value: boolVal, updated_at: now });
  } else {
    sysConfigs.insert({ key: SYSTEM_CONFIG_KEY, value: boolVal, created_at: now, updated_at: now });
  }
  return boolVal;
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
    console.log('[elicitor] 软开关关闭（DB 未配置 + 环境变量 !=true），走 fallback');
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
  setElicitorEnabled,
  readFromDb,
  checkHealth,
  canRun,
  loadStepPrompt,
  startupHealthCheck,
};
