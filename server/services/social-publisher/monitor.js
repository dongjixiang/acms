// ACMS social-publisher — 监控器（v0.118 PR 5-6）
// 路径：server/services/social-publisher/monitor.js
//
// 3 件事：
//   1. 定时 health-check（每 1 小时扫所有账号）→ eventBus 'social.health.alert'
//   2. 风险等级告警：risk_level >= 60 → 告警；>= 80 → 强制封禁
//   3. 今日发布数告警：超过单平台 80% 上限 → 告警
//
// 设计：
//   - 单实例 setInterval（不要并行）
//   - 告警通过 eventBus.emit('social.health.alert', {...}) 走事件流
//   - 持久层（persistence.js）记录 alert 历史供 L3 App "监控" tab 展示
//   - 重启可恢复（nextCheckAt 存 system_configs）

'use strict';

const eventBus = require('../event-bus');
const accountStore = require('./account-store');
const persistence = require('./persistence');

let started = false;
let monitorTimer = null;
let alerts = [];  // 内存 alert 列表（持久化 + 最近 100 条）

const CHECK_INTERVAL_MS = 60 * 60 * 1000;  // 1 小时
const ALERT_WINDOW = 100;  // 内存保留最近 100 条

function startSpMonitor() {
  if (started) return;
  started = true;

  // 启动 30s 后跑第一次（等 DB 就绪）
  setTimeout(() => {
    runHealthCheck();
    monitorTimer = setInterval(runHealthCheck, CHECK_INTERVAL_MS);
  }, 30000);

  // 监听 publish 失败事件（实时风控）
  eventBus.on('sp.publish.failed', (event) => {
    handlePublishFailed(event);
  });

  console.log('[sp-monitor] Started — health-check every 1h');
}

async function runHealthCheck() {
  const accounts = accountStore.list({});
  const newAlerts = [];
  for (const a of accounts) {
    const issues = checkAccountIssues(a);
    for (const issue of issues) {
      const alert = {
        type: issue.type,
        severity: issue.severity,
        account_id: a.id,
        platform: a.platform,
        message: issue.message,
        meta: issue.meta,
        created_at: new Date().toISOString(),
      };
      newAlerts.push(alert);
      // 严重问题自动处置
      if (issue.severity === 'critical' && a.status !== 'banned') {
        accountStore.update(a.id, { status: 'banned' });
        alert.action_taken = 'auto_ban';
      }
    }
  }
  if (newAlerts.length > 0) {
    alerts = [...newAlerts, ...alerts].slice(0, ALERT_WINDOW);
    eventBus.emit('social.health.alert', {
      projectId: 'sp-publisher',
      payload: { count: newAlerts.length, alerts: newAlerts },
    });
    console.log(`[sp-monitor] ⚠️  ${newAlerts.length} alerts emitted`);
  } else {
    console.log('[sp-monitor] ✅ Health check passed — all accounts healthy');
  }
}

function checkAccountIssues(account) {
  const issues = [];
  // 1. 风险等级
  if (account.risk_level >= 80) {
    issues.push({
      type: 'risk_critical',
      severity: 'critical',
      message: `账号 ${account.display_name} 风控等级 ${account.risk_level} ≥ 80，已自动封禁`,
      meta: { risk_level: account.risk_level, threshold: 80 },
    });
  } else if (account.risk_level >= 60) {
    issues.push({
      type: 'risk_warning',
      severity: 'warning',
      message: `账号 ${account.display_name} 风控等级 ${account.risk_level}（建议降低使用频率）`,
      meta: { risk_level: account.risk_level },
    });
  }
  // 2. 今日发布数
  const limit = (account.limits?.max_per_day) || 10;
  const used = account.daily_publish_count || 0;
  const pct = used / limit;
  if (pct >= 0.9) {
    issues.push({
      type: 'daily_limit_warning',
      severity: 'warning',
      message: `账号 ${account.display_name} 今日已发 ${used}/${limit}（${(pct * 100).toFixed(0)}%）`,
      meta: { used, max: limit, pct },
    });
  }
  // 3. 账号状态异常
  if (account.status === 'disabled') {
    issues.push({
      type: 'account_disabled',
      severity: 'info',
      message: `账号 ${account.display_name} 已被禁用`,
      meta: {},
    });
  }
  // 4. 连续失败
  if (account.last_error && account.last_used_at) {
    const lastErrTime = new Date(account.last_used_at).getTime();
    if (Date.now() - lastErrTime < 10 * 60 * 1000) {
      // 10 分钟内还有错误
      issues.push({
        type: 'recent_error',
        severity: 'warning',
        message: `账号 ${account.display_name} 最近错误: ${account.last_error}`,
        meta: { last_error: account.last_error },
      });
    }
  }
  return issues;
}

function handlePublishFailed(event) {
  let payload = {};
  try { payload = JSON.parse(event.payload || '{}'); } catch { /* 忽略 */ }
  const alert = {
    type: 'publish_failed',
    severity: payload.ok === false ? 'warning' : 'info',
    account_id: payload.account_id,
    platform: payload.platform,
    message: `发布失败: ${payload.error || '未知'}`,
    meta: payload,
    created_at: new Date().toISOString(),
  };
  alerts = [alert, ...alerts].slice(0, ALERT_WINDOW);
}

function getRecentAlerts(limit = 50) {
  return alerts.slice(0, limit);
}

function getStats() {
  const accounts = accountStore.list({});
  return {
    total: accounts.length,
    active: accounts.filter(a => a.status === 'active').length,
    disabled: accounts.filter(a => a.status === 'disabled').length,
    banned: accounts.filter(a => a.status === 'banned').length,
    high_risk: accounts.filter(a => (a.risk_level || 0) >= 60).length,
    today_publish_total: accounts.reduce((sum, a) => {
      if (a.last_used_at && a.last_used_at.startsWith(new Date().toISOString().slice(0, 10))) {
        return sum + (a.daily_publish_count || 0);
      }
      return sum;
    }, 0),
    alert_count: alerts.length,
  };
}

function stopSpMonitor() {
  if (monitorTimer) clearInterval(monitorTimer);
  started = false;
}

module.exports = {
  startSpMonitor,
  stopSpMonitor,
  runHealthCheck,
  checkAccountIssues,
  getRecentAlerts,
  getStats,
};
