// ACMS GEO Task Executor（v0.1 — Phase 2 #10 Kanban 自动执行）
// 用途：监听 task.claimed 事件，GEO 类型任务（geo-*) 自动执行对应 GEO agent
// 路径：server/services/geo-task-executor.js
//
// 流程：
//   Kanban 任务拖到 in_progress（claim）→ eventBus 'task.claimed'
//   → 检测 type.startsWith('geo-') → setImmediate 异步执行（不阻塞 claim 响应）
//   → 按类型调对应 agent → 写回 task.artifacts.geo_result + 状态推进
//
// 设计：
//   - GEO 任务用 execution_mode='manual'（geo-kanban-helper 默认），避免 task-agent 通用 loop 抢跑
//   - fire-and-forget：claim 响应立即返回，执行在后台
//   - 状态机：in_progress (progress 10) → review (progress 100 + geo_result)
//   - 失败：status='failed' + progress_note 写错误
//   - 幂等：task.status !== 'in_progress' 时不重复执行

const eventBus = require('./event-bus');
const taskStore = require('../stores/task-store');
const GEO_STORE = require('./geo-store');

let started = false;

function startGeoTaskExecutor() {
  if (started) return;
  started = true;

  eventBus.on('task.claimed', (event) => {
    // event.payload 是 JSON 字符串（EventBus.emit 序列化了 payload）
    let payload = {};
    try { payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : (event.payload || {}); } catch { /* 忽略 */ }
    const task = payload.task;
    if (!task || !task.type || !task.type.startsWith('geo-')) return;

    console.log(`[geo-task-executor] 🎯 Detected GEO task: ${task.type} (${task.id})`);
    // 异步执行，不阻塞 claim 响应
    setImmediate(() => {
      executeGeoTask(task).catch(e => {
        console.error(`[geo-task-executor] ❌ ${task.id} failed:`, e.message);
      });
    });
  });

  console.log('[geo-task-executor] Started — listening for geo-* task claims');
}

async function executeGeoTask(task) {
  // 幂等检查
  const current = taskStore.getById(task.id);
  if (!current) return { ok: false, error: 'TASK_NOT_FOUND' };
  if (current.status !== 'in_progress') {
    console.log(`[geo-task-executor] Skip ${task.id}: status=${current.status}`);
    return { ok: false, skipped: true, reason: `status=${current.status}` };
  }

  // 解析 brand_id
  let arts = {};
  try { arts = JSON.parse(current.artifacts || '{}'); } catch { /* 忽略 */ }
  const brandId = arts.geo?.brand_id;
  if (!brandId) {
    taskStore.update(task.id, {
      progress_note: 'GEO 任务缺少 brand_id（artifacts.geo.brand_id）',
      status: 'failed',
    });
    return { ok: false, error: 'NO_BRAND_ID' };
  }

  console.log(`[geo-task-executor] ▶ ${task.type} for brand=${brandId}`);
  taskStore.update(task.id, {
    progress: 10,
    progress_note: `GEO ${task.type} 开始执行...`,
    last_progress_update: new Date().toISOString(),
  });

  let result;
  const startTs = Date.now();

  if (task.type === 'geo-track') {
    const tracker = require('./geo-tracker-agent');
    result = await tracker.runTracker(brandId);
  } else if (task.type === 'geo-audit') {
    const audit = require('./geo-audit-agent');
    result = await audit.runAudit(brandId, { runTracker: true });
  } else if (task.type === 'geo-report') {
    const monthly = require('./geo-monthly-report');
    result = await monthly.saveMonthlyReport(brandId);
  } else if (task.type === 'geo-optimize') {
    const optimizer = require('./geo-optimizer-agent');
    result = await optimizer.runOptimization(brandId);
  } else {
    taskStore.update(task.id, {
      progress_note: `未知 GEO 任务类型: ${task.type}`,
      status: 'failed',
    });
    return { ok: false, error: `UNKNOWN_TYPE: ${task.type}` };
  }

  const durationMs = Date.now() - startTs;
  const ok = result?.ok !== false;

  // 写回结果
  const newArts = {
    ...arts,
    geo_result: {
      type: task.type,
      ok,
      summary: summarizeResult(result),
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
    },
  };

  taskStore.update(task.id, {
    progress: ok ? 100 : Math.min(100, (result?.progress || 0)),
    progress_note: ok
      ? `✅ GEO ${task.type} 完成（${durationMs}ms）`
      : `❌ GEO ${task.type} 失败: ${result?.error || result?.message || '未知错误'}`,
    artifacts: JSON.stringify(newArts),
    status: ok ? 'review' : 'failed',
    last_progress_update: new Date().toISOString(),
  });

  console.log(`[geo-task-executor] ✅ ${task.id} done (${durationMs}ms, ok=${ok})`);
  return { ok, ...result };
}

function summarizeResult(result) {
  if (!result) return null;
  if (result.ok === false) return { error: result.error, message: result.message };
  if (result.score != null) {
    return {
      score: result.score,
      grade: result.grade,
      components: result.components,
      sample_size: result.sample_size,
      engines: result.engines_used || result.engines,
    };
  }
  if (result.saved_path) return { saved_path: result.saved_path, bytes: result.bytes };
  if (result.responses_written != null) {
    return {
      tasks_run: result.tasks_run,
      success_count: result.success_count,
      responses_written: result.responses_written,
      score: result.score?.score,
    };
  }
  // fallback：挑几个关键字段
  const keys = Object.keys(result).filter(k => ['ok', 'count', 'total', 'success_count', 'error_count', 'recommendations', 'analysis'].includes(k));
  const summary = {};
  for (const k of keys) {
    const v = result[k];
    if (typeof v === 'string') summary[k] = v.slice(0, 200);
    else if (Array.isArray(v)) summary[k] = v.length;
    else summary[k] = v;
  }
  return summary;
}

module.exports = {
  startGeoTaskExecutor,
  executeGeoTask,
  summarizeResult,
};