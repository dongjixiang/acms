// ACMS GEO Snapshot Cronjob（v0.1 — Phase 1 Week 3）
// 用途：周期性调度 GEO Tracker Agent + 自动生成 cite-ability snapshot
// 路径：server/jobs/geo-snapshot-cron.js
//
// 设计（ACMS 现有惯例：裸 setInterval，无 node-cron 依赖）：
//   - 默认：每周六 02:00 (UTC) 跑一次全品牌 tracker + snapshot
//   - 测试：可通过 GEO_CRON_INTERVAL_MS 环境变量覆盖（毫秒）
//   - 调用：server/index.js 启动时 startCron()
//
// 状态：
//   - isRunning: 防止重叠执行（前一任务未完成不启动下一任务）
//   - lastRun: 上次执行时间
//   - nextRun: 下次执行时间

const tracker = require('../services/geo-tracker-agent');
const monthlyReporter = require('../services/geo-monthly-report');
const eventBus = require('../services/event-bus');

// 默认：每周六 02:00 UTC
const DEFAULT_CRON_DAY = 6; // Saturday (0=Sunday)
const DEFAULT_CRON_HOUR = 2; // 02:00
const DEFAULT_CRON_MINUTE = 0;
const INTERVAL_MS = parseInt(process.env.GEO_CRON_INTERVAL_MS || (7 * 24 * 60 * 60 * 1000), 10); // 默认 7 天

let timer = null;
let isRunning = false;
let lastRun = null;
let nextRun = null;
let lastResult = null;

function isSaturdayAt2am() {
  const now = new Date();
  return now.getUTCDay() === DEFAULT_CRON_DAY &&
         now.getUTCHours() === DEFAULT_CRON_HOUR &&
         now.getUTCMinutes() === DEFAULT_CRON_MINUTE;
}

// 滚动到下一个 Saturday 02:00 UTC
function computeNextRun() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(DEFAULT_CRON_HOUR, DEFAULT_CRON_MINUTE, 0, 0);
  // 如果当前已过本周六 02:00，滚到下周
  const daysUntilSat = (DEFAULT_CRON_DAY - now.getUTCDay() + 7) % 7;
  if (daysUntilSat === 0 && now >= next) {
    next.setUTCDate(next.getUTCDate() + 7);
  } else {
    next.setUTCDate(next.getUTCDate() + daysUntilSat);
  }
  return next.toISOString();
}

async function runScheduled() {
  if (isRunning) {
    console.log('[geo-cron] 上一任务仍在运行，跳过本次调度');
    return { skipped: true, reason: 'previous_still_running' };
  }
  isRunning = true;
  lastRun = new Date().toISOString();
  console.log(`[geo-cron] ⏰ Scheduled run starting at ${lastRun}`);

  try {
    const result = await tracker.runTrackerAll({});
    lastResult = { ...result, completed_at: new Date().toISOString() };

    // v0.2: 每月最后一周额外生成月报
    const now = new Date();
    const lastDayOfMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate();
    const isMonthEndWeek = now.getUTCDate() >= lastDayOfMonth - 6;
    if (isMonthEndWeek) {
      console.log('[geo-cron] 📅 月末 — 生成月报');
      const brands = require('../services/geo-store').listBrands().filter(b => b.status === 'active');
      for (const brand of brands) {
        try {
          await monthlyReporter.saveMonthlyReport(brand.id);
          console.log(`[geo-cron] 📊 月报已生成: ${brand.name}`);
        } catch (e) {
          console.error(`[geo-cron] 月报生成失败 (${brand.name}):`, e.message);
        }
      }
      lastResult.monthly_reports_generated = brands.length;
    }

    // v0.3 (Phase 4): 完成后推 WS 事件 → 前端通知中心（geo.* 事件经 app.js 广播）
    await eventBus.emit('geo.cron.done', {
      payload: {
        title: `🌐 GEO 定时追踪完成（${result.total_brands} 品牌）`,
        desc: lastResult.monthly_reports_generated
          ? `月末：${lastResult.monthly_reports_generated} 份月报已生成`
          : '快照与评分已更新',
        type: 'success',
      },
    });

    console.log(`[geo-cron] ✅ Run completed: ${result.total_brands} brands`);
    return lastResult;
  } catch (e) {
    lastResult = { ok: false, error: e.message, completed_at: new Date().toISOString() };
    console.error(`[geo-cron] ❌ Run failed:`, e.message);
    await eventBus.emit('geo.cron.done', {
      payload: {
        title: '🌐 GEO 定时追踪失败',
        desc: e.message || '未知错误',
        type: 'error',
      },
    });
    return lastResult;
  } finally {
    isRunning = false;
    nextRun = computeNextRun();
  }
}

function startCron(options = {}) {
  if (timer) {
    console.warn('[geo-cron] Already started, skipping');
    return;
  }

  const intervalMs = options.intervalMs || INTERVAL_MS;
  const isTestMode = process.env.GEO_CRON_INTERVAL_MS && process.env.GEO_CRON_INTERVAL_MS !== (7 * 24 * 60 * 60 * 1000).toString();

  console.log(`[geo-cron] Starting cronjob (interval=${intervalMs}ms${isTestMode ? ', TEST MODE' : ''})`);

  nextRun = computeNextRun();
  console.log(`[geo-cron] Next scheduled run: ${nextRun}`);

  // 立即跑一次（开发模式方便测试）
  if (options.runImmediately || process.env.GEO_CRON_RUN_IMMEDIATELY === 'true') {
    setImmediate(() => runScheduled());
  }

  // 周期性调度
  timer = setInterval(() => {
    if (isTestMode) {
      // 测试模式：每个 intervalMs 跑一次
      runScheduled();
    } else {
      // 生产模式：每周六 02:00 UTC 才跑
      if (isSaturdayAt2am()) {
        runScheduled();
      }
    }
  }, intervalMs);

  console.log('[geo-cron] Cronjob started');
}

function stopCron() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('[geo-cron] Stopped');
  }
}

function getStatus() {
  return {
    running: !!timer,
    is_running_now: isRunning,
    last_run: lastRun,
    next_run: nextRun,
    last_result: lastResult,
    interval_ms: INTERVAL_MS,
    schedule: `${DEFAULT_CRON_DAY === 6 ? 'Saturday' : 'Day ' + DEFAULT_CRON_DAY} ${DEFAULT_CRON_HOUR}:${DEFAULT_CRON_MINUTE} UTC`,
  };
}

module.exports = {
  startCron,
  stopCron,
  runScheduled, // 手动触发（测试用）
  getStatus,
  computeNextRun,
  DEFAULT_CRON_DAY,
  DEFAULT_CRON_HOUR,
  DEFAULT_CRON_MINUTE,
};