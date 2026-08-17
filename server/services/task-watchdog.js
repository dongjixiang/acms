// P160: Task Watchdog — 兜底熔断卡死任务
//
// 背景: T-MSX8TTEU 暴露两类 bug:
//   1. 过度验证循环: 22 轮重复 git_status/git_log 验证 (正常 6 轮搞定)
//   2. LLM API 假死: round_32 后一次 LLM call 挂 8h, taskLock 永未释放
//
// 纵深防御三层:
//   层1 (内部): runToolLoop 单轮去重 + maxRounds=90
//   层2 (任务): P159 Promise.race 全局 10min timeout (task-agent.js)
//   层3 (外部): P160 watchdog 定期检查 + force-fail (本文件)
//
// 触发条件:
//   - task.status == 'in_progress'
//   - last_progress_update 超过 STUCK_THRESHOLD_MS (默认 5min)
//   - dispatcher.isTaskLocked(taskId) 仍然为 true (HTTP request 还在 event loop)
//
// 动作:
//   1. 打印 WARN 日志 + 写 task.doc.watchdog_note
//   2. dispatcher.releaseTaskLock(taskId) 释放内存锁
//   3. taskStore.updateStatus(taskId, 'failed', { watchdog_note: ... }) 写 DB
//   4. eventBus.emit('task.failed') 触发后续 (review 队列/看板状态)
//
// 冷却期: STUCK_THRESHOLD_MS 内只报一次 (用 _warnedTasks Set 去重)
// 检查间隔: CHECK_INTERVAL_MS (默认 2min)
// 启用标志: ENABLED=true 环境变量 (默认 false, 谨慎开启)

const taskStore = require('../stores/task-store');
const dispatcher = require('./auto-execute-dispatcher');
const eventBus = require('./event-bus');

// 配置 (可通过环境变量覆盖)
const CHECK_INTERVAL_MS = parseInt(process.env.ACMS_WATCHDOG_CHECK_INTERVAL_MS) || 2 * 60 * 1000;
const STUCK_THRESHOLD_MS = parseInt(process.env.ACMS_WATCHDOG_STUCK_THRESHOLD_MS) || 5 * 60 * 1000; // 5min
const ENABLED = process.env.ACMS_WATCHDOG_ENABLED === 'true';

const _warnedTasks = new Set(); // 冷却: 每个 taskId 只报一次

async function checkStuckTasks() {
  if (!ENABLED) return;

  try {
    const collection = require('../../db/connection').collection;
    const now = Date.now();
    const stuckThreshold = now - STUCK_THRESHOLD_MS;

    // 找所有 in_progress 任务
    const tasks = await collection('tasks').find({
      status: 'in_progress',
    }).toArray();

    if (tasks.length === 0) return;

    let fixed = 0;
    for (const task of tasks) {
      // 跳过已经 warn 过的
      if (_warnedTasks.has(task.id)) continue;

      // 检查 lastProgressUpdate 是否超时
      const lastUpdate = task.lastProgressUpdate ? new Date(task.lastProgressUpdate).getTime() : 0;
      if (lastUpdate > stuckThreshold) continue; // 最近有更新, 不算卡死

      // 检查 dispatcher lock 是否还在 (HTTP request 还在 event loop)
      if (!dispatcher.isTaskLocked(task.id)) {
        // lock 已释放但 DB 仍 in_progress — 可能是 P159 timeout 已触发但 saveProgress 没写完
        // 补一步: 直接标 failed (不 repeat warn)
        _warnedTasks.add(task.id);
        console.warn(`[P160 watchdog] task=${task.id} lock已释放但DB仍in_progress, 补标failed`);
        await taskStore.updateStatus(task.id, 'failed', {
          watchdog_note: `[P160] 补标: lock已释放但status仍in_progress, lastUpdate=${new Date(lastUpdate).toISOString()}`,
        });
        eventBus.emit('task.failed', { task });
        fixed++;
        continue;
      }

      // 真正卡死: lock 还在 + lastUpdate 超时
      _warnedTasks.add(task.id);
      const stalledMs = now - lastUpdate;
      const stalledMin = Math.round(stalledMs / 60000);
      console.warn(
        `[P160 watchdog] 检测到卡死任务: id=${task.id} ` +
        `status=in_progress lastUpdate=${new Date(lastUpdate).toISOString()} ` +
        `stalled=${stalledMin}min lock=${dispatcher.isTaskLocked(task.id)}`
      );

      // 释放 lock
      dispatcher.releaseTaskLock(task.id);

      // 写 DB
      await taskStore.updateStatus(task.id, 'failed', {
        watchdog_note: `[P160 watchdog] 强制熔断: 任务卡死 ${stalledMin} 分钟 (lastUpdate=${new Date(lastUpdate).toISOString()})。根因可能是: ①LLM API hang ②runToolLoop 死循环 ③tool handler 阻塞。P159 全局超时(${process.env.ACMS_TASK_TIMEOUT_MS || '10'}min)应已拦截, 若未触发请检查 timeout 配置。`,
      });

      // 发事件
      eventBus.emit('task.failed', { task: { ...task, status: 'failed' } });
      fixed++;
    }

    if (fixed > 0) {
      console.log(`[P160 watchdog] 本轮修复 ${fixed} 个卡死任务 (enabled=${ENABLED}, interval=${CHECK_INTERVAL_MS}ms, threshold=${STUCK_THRESHOLD_MS}ms)`);
    }
  } catch (e) {
    console.error('[P160 watchdog] 检查失败:', e.message);
  }
}

function init() {
  if (!ENABLED) {
    console.log('[P160 watchdog] 已禁用 (ACMS_WATCHDOG_ENABLED != true)');
    return;
  }
  console.log(
    `[P160 watchdog] 启动: interval=${CHECK_INTERVAL_MS}ms ` +
    `threshold=${STUCK_THRESHOLD_MS}ms ` +
    `(env: ACMS_WATCHDOG_ENABLED=${process.env.ACMS_WATCHDOG_ENABLED}, ` +
    `ACMS_WATCHDOG_CHECK_INTERVAL_MS=${process.env.ACMS_WATCHDOG_CHECK_INTERVAL_MS}, ` +
    `ACMS_WATCHDOG_STUCK_THRESHOLD_MS=${process.env.ACMS_WATCHDOG_STUCK_THRESHOLD_MS})`
  );
  setInterval(checkStuckTasks, CHECK_INTERVAL_MS);
  // 立即跑一次
  checkStuckTasks();
}

module.exports = { init, checkStuckTasks };
