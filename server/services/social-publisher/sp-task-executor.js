// ACMS social-publisher Task Executor（v0.118 PR 4-2 + 4-3 + 4-4）
// 路径：server/services/social-publisher/sp-task-executor.js
//
// 复用 geo-task-executor 模式：
//   - 监听 eventBus 'task.claimed' 事件
//   - 检测 type.startsWith('social-') → 异步执行
//   - execution_mode='manual'（kanban-helper 默认）
//   - 状态机：in_progress (progress 10) → review (100) / failed
//
// PR 4-5 多轮任务：
//   - type='social-publish-all' → 拆成 N 个 social-publish 子任务，依次 claim
//   - 子任务 created_via='sp-publish-all-fanout'

'use strict';

const eventBus = require('../event-bus');
const taskStore = require('../../stores/task-store');
// 关键：sp 必须在 executeSocialTask 函数体内 require，不能在模块顶部
// 原因：sp-task-executor 本身被 index.js (line 131 `require('./sp-task-executor')`) 加载，
//       而 index.js 加载 sp-task-executor 时，module.exports 还没执行到 `module.exports = {...}` 赋值。
//       顶部 require('./index') 拿到的是空对象 {} → sp.publishTo is not a function。
//       延迟到函数体内 require 时，index.js 已返回，require 缓存返回完整 module.exports。
const accountStore = require('./account-store');
const { getPublishParams } = require('./kanban-helper');

let started = false;

function startSpTaskExecutor() {
  if (started) return;
  started = true;

  eventBus.on('task.claimed', (event) => {
    let payload = {};
    try {
      payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : (event.payload || {});
    } catch { /* 忽略 */ }
    const task = payload.task;
    if (!task || !task.type || !task.type.startsWith('social-')) return;

    console.log(`[sp-task-executor] 🎯 Detected social task: ${task.type} (${task.id})`);
    setImmediate(() => {
      executeSocialTask(task).catch(e => {
        console.error(`[sp-task-executor] ❌ ${task.id} failed:`, e.message);
      });
    });
  });

  console.log('[sp-task-executor] Started — listening for social-* task claims');
}

async function executeSocialTask(task) {
  // 关键：函数体内 lazy require index.js，避开 sp-task-executor ↔ index.js 循环引用
  // （见模块顶部注释）
  const sp = require('./index');

  // 幂等检查
  const current = taskStore.getById(task.id);
  if (!current) return { ok: false, error: 'TASK_NOT_FOUND' };
  if (current.status !== 'in_progress') {
    console.log(`[sp-task-executor] Skip ${task.id}: status=${current.status}`);
    return { ok: false, skipped: true, reason: `status=${current.status}` };
  }

  const params = getPublishParams(task.id);
  if (!params) {
    taskStore.update(task.id, {
      progress_note: 'social 任务缺少 artifacts.social 参数',
      status: 'failed',
    });
    return { ok: false, error: 'NO_PARAMS' };
  }

  console.log(`[sp-task-executor] ▶ ${task.type} → platform=${params.platform} account=${params.account_id}`);
  taskStore.update(task.id, {
    progress: 10,
    progress_note: `开始发布到 ${params.platform}...`,
    last_progress_update: new Date().toISOString(),
  });

  let result;
  const startTs = Date.now();

  try {
    if (task.type === 'social-rewrite') {
      // 纯改写（不发）
      result = await sp.rewriteForPlatform({
        content: params.content,
        platform: params.platform || 'toutiao',
        tone: params.tone,
        length: params.length,
      });
    } else if (task.type === 'social-publish-all') {
      // 多平台：逐个发
      const subResults = await publishToAllPlatforms(params, task);
      result = {
        ok: subResults.every(r => r.ok),
        sub_results: subResults,
      };
    } else {
      // 单平台发布
      result = await sp.publishTo(params.platform, {
        title: params.post_title,
        content: params.content,
        images: params.images,
        tags: params.tags,
        account_id: params.account_id,
        options: params.options,
      });
    }
  } catch (e) {
    result = { ok: false, error: e.message };
  }

  const durationMs = Date.now() - startTs;
  const ok = result?.ok !== false;

  // 写回结果
  let arts = {};
  try { arts = JSON.parse(current.artifacts || '{}'); } catch { /* 忽略 */ }

  const newArts = {
    ...arts,
    social_result: {
      type: task.type,
      ok,
      platform: params.platform,
      post_url: result?.post_url || null,
      post_id: result?.post_id || null,
      media_id: result?.media_id || null,
      steps: result?.steps || [],
      total_elapsed_ms: result?.total_elapsed_ms || durationMs,
      error: result?.error || null,
      sub_results: result?.sub_results || null,
      completed_at: new Date().toISOString(),
    },
  };

  taskStore.update(task.id, {
    progress: ok ? 100 : 0,
    progress_note: ok
      ? `✅ ${task.type} 完成（${durationMs}ms）${result?.post_url ? ` → ${result.post_url}` : ''}`
      : `❌ ${task.type} 失败: ${result?.error || '未知错误'}`,
    artifacts: JSON.stringify(newArts),
    status: ok ? 'review' : 'failed',
    last_progress_update: new Date().toISOString(),
  });

  // v0.118 PR 5-5: 持久化到 SQLite（不依赖 Kanban artifacts，重启可查）
  try {
    const persistence = require('./persistence');
    persistence.recordTaskHistory({
      task_id: task.id,
      platform: params.platform,
      account_id: params.account_id,
      title: task.title,
      content: params.content,
      result: { ...result, ok },
    });
  } catch (e) {
    console.warn(`[sp-task-executor] 持久化失败: ${e.message}`);
  }

  console.log(`[sp-task-executor] ✅ ${task.id} done (${durationMs}ms, ok=${ok})`);
  return { ok, ...result };
}

// PR 4-5: 一个选题自动发到所有平台
async function publishToAllPlatforms(params, parentTask) {
  const subTasks = params.sub_tasks || [];
  const platforms = subTasks.length > 0
    ? subTasks
    : ['toutiao', 'xiaohongshu', 'wechat_oa', 'zhihu'];  // 默认 4 平台（douyin 视频场景独立）

  const results = [];
  for (let i = 0; i < platforms.length; i++) {
    const p = typeof platforms[i] === 'string'
      ? { platform: platforms[i] }
      : platforms[i];

    // 平台限额检查（风控前置）
    if (p.account_id) {
      const health = accountStore.checkHealth({ account_id: p.account_id, platform: p.platform });
      if (!health.ok) {
        results.push({
          platform: p.platform,
          ok: false,
          error: `account_unhealthy: ${health.status} - ${health.error}`,
          skipped: true,
        });
        continue;
      }
    }

    console.log(`[sp-task-executor] ▶▶ ${parentTask.id} → ${p.platform} (${i + 1}/${platforms.length})`);
    try {
      const r = await sp.publishTo(p.platform, {
        title: params.post_title,
        content: params.content,
        images: params.images,
        tags: params.tags,
        account_id: p.account_id || params.account_id,
        options: { ...params.options, require_approval: false },  // 多平台下内部已审批
      });
      results.push({ platform: p.platform, ...r });
    } catch (e) {
      results.push({ platform: p.platform, ok: false, error: e.message });
    }

    // 平台间间隔（避风控）
    if (i < platforms.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  return results;
}

module.exports = {
  startSpTaskExecutor,
  executeSocialTask,
};
