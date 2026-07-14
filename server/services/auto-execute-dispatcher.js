// ACMS 自动执行调度器（v0.24 — 任务被分配 → 自动 agent-execute）
//
// 当 task 被 claim 给某个 agent（例 agent-acms-self），如果该 agent 标记
//   auto_execute=true，则调度器在 claim 后立即触发 agent-execute，
//   让「分配任务 = 自动执行」零摩擦闭环。
//
// 设计要点：
//   - 单例，挂在 eventBus 上
//   - 监听 task.claimed 事件（已有，由 routes/tasks.js:58 触发）
//   - 任务 status 必须是 in_progress（避免双触发 review 等终态）
//   - 重复 claim 同 task 用 processedClaims Set 去重
//   - 失败时入库 console，下次手动 claim 不再盲触
//
// 调用关系：
//   PM PATCH /api/tasks/:id/assign { agentId: 'agent-acms-self' }
//       ↓
//   taskStore.claim()  →  eventBus.emit('task.claimed', { target: { id: taskId }, actor: { id: 'agent-acms-self' } })
//       ↓
//   onTaskClaimed(event)  →  AUTO_EXECUTE_AGENTS has 'agent-acms-self'?
//       ↓ yes
//   POST /ai-tools/agent-execute { taskId }
//       ↓
//   audit + submit (status → review)

const eventBus = require('./event-bus');
const agentStore = require('../stores/agent-store');
const taskStore = require('../stores/task-store');

// v0.24: auto-execute agent 白名单；agent.acms_self 在 agents 表注册
// 可后续扩展为 agent.auto_execute 字段默认从配置读
const DEFAULT_AUTO_EXECUTE_AGENTS = new Set(['agent-acms-self', 'agent-xiaoji']);

// v0.34: 驳回后自动重跑的最大次数（防无限循环）
//   多多驳回 → 自动重跑 → 仍 fail → 再驳回 → 再重跑 → ... 没限制会死循环
//   3 次后停自动重跑，留给 PM 手工 steer 或重新分配
//   P0 v0.X: 计数从 in-memory Map 改成 task.doc.re_execute_count（持久化），重启不丢
const MAX_RE_EXECUTE = 3;

// v0.X: 执行中任务锁 — 由 /agent-execute 路由统一管（之前 dispatcher 自己管锁，
//   但路由层访问不到 dispatcher 的 _executingTasks，导致 curl /agent-execute
//   绕过锁可以跟 dispatcher 自动恢复并发触发同一任务）
const _executingTasks = new Set();
// v0.X: 暴露给路由层用的锁 API（替代之前 dispatcher 内部用的 _executingTasks 直接操作）
function isTaskLocked(taskId) {
  return _executingTasks.has(taskId);
}
function tryAcquireTaskLock(taskId) {
  if (_executingTasks.has(taskId)) return false;
  _executingTasks.add(taskId);
  return true;
}
function releaseTaskLock(taskId) {
  _executingTasks.delete(taskId);
}

// 工具函数：从 task.doc 读 / 写 持久化的 re_execute_count
//   之前用 this.reExecuteCount Map 计数，server 重启就清零 → 熔断失效
//   现在每次读写都走 taskStore，DB 持久，重启后计数还在
function getReExecuteCount(taskStore, taskId) {
  const task = taskStore.getById(taskId);
  return (task && task.re_execute_count) ? parseInt(task.re_execute_count, 10) : 0;
}
function setReExecuteCount(taskStore, taskId, count) {
  taskStore.update(taskId, { re_execute_count: count, updated_at: new Date().toISOString() });
}

// P0 v0.X: 解析任务的首选语言（agent 输出语言）
//   优先级：task.doc.preferred_lang > 全局 PM 设置 > 'zh'
//   task.doc.preferred_lang 由前端主动操作（generatePlan/approve 等）时存进去
function getPreferredLang(task) {
  if (task && task.preferred_lang) return task.preferred_lang;
  // 全局 PM 默认语言（如果 settings 表里有的话）
  try {
    const settings = require('./settings-store');
    if (settings && settings.get && settings.get('default_lang')) return settings.get('default_lang');
  } catch (e) { /* settings-store 不存在也无所谓 */ }
  return 'zh';
}

class AutoExecuteDispatcher {
  constructor() {
    this.processedClaims = new Set();  // taskId 去重（短期，restart 会清，符合预期）
    // P0 v0.X: 删掉 this.reExecuteCount Map — 改用 task.doc.re_execute_count 持久化
    this.autoAgents = new Set(DEFAULT_AUTO_EXECUTE_AGENTS);
    this.stats = { triggered: 0, skipped: 0, errors: 0, lastTriggeredAt: null };
  }

  init() {
    // 监听现有 task.claimed 事件，无需新增事件类型
    eventBus.on('task.claimed', (event) => this.handleTaskClaimed(event));
    // v0.34: 驳回也自动重跑
    eventBus.on('task.review_rejected', (event) => this.handleTaskRejected(event));

    // v0.X: 启动时扫描已有 in_progress 任务 — 防重启后 pending 任务不被触发
    //   根因：claim 在重启前发生，重启后 dispatcher 全新启动，不会自动触发已分配的任务
    setImmediate(() => this._resumeStaleTasks());

    console.log(`[AutoExecuteDispatcher] 启动完成 · 自动执行 agents: ${[...this.autoAgents].join(', ')}`);
  }

  /** v0.X: 扫描已有 in_progress 任务并重新触发 */
  async _resumeStaleTasks() {
    try {
      const { collection } = require('../db/connection');
      const all = collection('tasks').all().filter(t =>
        t.status === 'in_progress' && this.autoAgents.has(t.assigned_to)
      );
      for (const task of all) {
        // v0.X: 拓宽恢复条件 — 不只是 progress=0 的新任务
        //   progress=0 + 无日志: 刚 claim 但被重启中断 → 恢复
        //   progress>0 + 日志超过 5 分钟未更新: 执行中被重启中断 → 恢复
        //   之前只有第一个条件，导致 T-MRHSD8PV 7/13 场景：
        //   progress=3 的半截任务跳过恢复，永远卡 in_progress
        let shouldResume = false;
        const logs = typeof task.execution_log === 'string'
          ? JSON.parse(task.execution_log)
          : (task.execution_log || []);
        if (task.progress === 0 && logs.length === 0) {
          shouldResume = true;
        } else if (task.progress > 0 && logs.length > 0) {
          const lastEntry = logs[logs.length - 1];
          const lastTime = new Date(lastEntry.time || lastEntry.timestamp || 0).getTime();
          const elapsed = Date.now() - lastTime;
          if (elapsed > 5 * 60 * 1000) {
            shouldResume = true;
          }
        }
        if (shouldResume) {
          console.log(`[AutoExecuteDispatcher] 🔄 启动恢复: ${task.id} (assigned=${task.assigned_to}, status=${task.status}, progress=${task.progress})`);
          // 走 handleTaskClaimed 逻辑（复用锁 + fetch）
          await this.handleTaskClaimed({
            target_id: task.id,
            actor_id: task.assigned_to,
          });
        }
      }
      if (all.length > 0) console.log(`[AutoExecuteDispatcher] ✅ 启动恢复完成: 处理 ${all.length} 个遗留任务`);
    } catch (e) {
      console.error(`[AutoExecuteDispatcher] ❌ 启动恢复失败: ${e.message}`);
    }
  }

  reload(agents) {
    this.autoAgents = new Set(agents);
  }

  addAutoAgent(agentId) { this.autoAgents.add(agentId); }

  removeAutoAgent(agentId) { this.autoAgents.delete(agentId); }

 async handleTaskClaimed(event) {
    // v0.24 fix: eventBus.emit() 会把 actor/target 拆成平铺字段 (actor_id / target_id)
    //   不保留嵌套对象。读 event.actor?.id 永远 undefined — handler 静默 return。
    // v0.X: 锁语义改了 — 路由 /agent-execute 自己管锁（tryAcquireTaskLock/releaseTaskLock），
    //   dispatcher 不再加锁（避免重复 trigger 时锁冲突），重复触发由路由返回 409 + dispatcher 的 scheduleRetry 处理
    const taskId = event.target_id || event.target?.id;
    const assignee = event.actor_id || event.actor?.id;

    // v0.24 diagnostic: 进入即打日志，避免再来一次「看着没反应」找根因
    console.log(`[AutoExecuteDispatcher] 📬 收到 task.claimed event: task=${taskId} assignee=${assignee}`);

    if (!taskId || !assignee) {
      console.warn(`[AutoExecuteDispatcher] ⚠️ 跳过：taskId 或 assignee 缺失`);
      this.stats.skipped++;
      return;
    }

    // 跳过已处理的（避免 race + 防双触发）
    if (this.processedClaims.has(taskId)) {
      console.log(`[AutoExecuteDispatcher] ⏭️ 跳过 ${taskId}: 已处理过`);
      this.stats.skipped++;
      return;
    }

    // 跳过非自动执行 agents
    if (!this.autoAgents.has(assignee)) {
      console.log(`[AutoExecuteDispatcher] ⏭️ 跳过 ${taskId}: ${assignee} 不在白名单 ${[...this.autoAgents]}`);
      this.stats.skipped++;
      return;
    }

    // 任务必须还在 in_progress（避免重复触发 review/done 状态）
    const task = taskStore.getById(taskId);
    if (!task || task.status !== 'in_progress') {
      console.log(`[AutoExecuteDispatcher] ⏭️ 跳过 ${taskId}: task 不存在或 status=${task?.status}`);
      this.stats.skipped++;
      return;
    }

    // P0 v0.X: execution_mode 控制是否自动执行
    //   'auto' (默认) = claim 后立即 execute
    //   'plan_first' = claim 后等 plan approved 才 execute（plan approve 时会主动调 agent-execute）
    //   'manual' = claim 后永不自动执行，PM 手动点"开始执行"按钮
    const mode = task.execution_mode || 'auto';
    if (mode === 'manual') {
      console.log(`[AutoExecuteDispatcher] ⏭️ 跳过 ${taskId}: execution_mode=manual，需要 PM 手动开始`);
      this.stats.skipped++;
      return;
    }
    if (mode === 'plan_first') {
      // plan 不存在 或 plan 未 approved → 跳过自动执行
      if (!task.plan) {
        console.log(`[AutoExecuteDispatcher] ⏭️ 跳过 ${taskId}: execution_mode=plan_first 且无 plan`);
        this.stats.skipped++;
        return;
      }
      if (!task.plan.approved) {
        console.log(`[AutoExecuteDispatcher] ⏭️ 跳过 ${taskId}: execution_mode=plan_first 但 plan 未 approved`);
        this.stats.skipped++;
        return;
      }
    }

    // 任务依赖必须满足（虽然在 in_progress 但可能被回退到 backlog 检查依赖？）
    // claim() 自身会校验依赖，这里再次安全检查
    if (taskStore.areDependenciesMet && !taskStore.areDependenciesMet(taskId)) {
      console.warn(`[AutoExecuteDispatcher] 跳过 ${taskId} — 依赖未满足`);
      this.stats.skipped++;
      return;
    }

    this.processedClaims.add(taskId);

    // 清理 processedClaims 防膨胀（>500 时清半）
    if (this.processedClaims.size > 500) {
      const arr = [...this.processedClaims];
      this.processedClaims.clear();
      arr.slice(-200).forEach(id => this.processedClaims.add(id));
    }

    console.log(`[AutoExecuteDispatcher] 🚀 ${taskId} 分派给 ${assignee} → 自动触发 agent-execute`);
    this.stats.lastTriggeredAt = new Date().toISOString();

    try {
      // 调 agent-execute（同样的 API，agent-execute 内部已经做 audit + submit）
      // 不 await——fire-and-forget 模式，跟 handleExecuteSkill 一致
      // 但为了让 caller 等结果，这里 await
      // P0 v0.X: AbortSignal.timeout(600_000) — 防止长跑（>5min）keep-alive socket reset 后 fetch 永远挂起 (Pattern U)
      //   之前没 timeout：dispatcher fetch 拿不到响应也不抛错，audit/submit 阶段结果永远丢，任务卡 in_progress 17% (T-MRHSD8OQ 7/13 实战)
      const httpReq = await fetch(`http://127.0.0.1:${process.env.PORT || 3300}/api/ai-tools/agent-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.ACMS_API_KEY || 'dev-key-001' },
        // P0 v0.X: 带 lang — 优先用 task.doc.preferred_lang（用户之前主动操作时存的），
        //   否则读全局 PM 配置，最后 fallback 'zh'
        body: JSON.stringify({ taskId, agentId: assignee, lang: getPreferredLang(task) }),
        signal: AbortSignal.timeout(600_000),
      }).catch(err => ({ error: err.message, aborted: err.name === 'AbortError' }));

      const result = httpReq && typeof httpReq.json === 'function' ? await httpReq.json() : httpReq;
      if (result && result.success) {
        console.log(`[AutoExecuteDispatcher] ✅ ${taskId} 完成 (analysis=${result.analysisLength || '?'} chars, submitted=${result.submitted})`);
        this.stats.triggered++;
        // v0.X: 路由 /agent-execute 自己管锁（try/finally releaseTaskLock），dispatcher 不再 unlock
      } else {
        console.warn(`[AutoExecuteDispatcher] ⚠️ ${taskId} 失败: ${(result && result.error) || (result && result.message) || 'unknown'}`);
        if (result && result.missingCount) console.warn(`[AutoExecuteDispatcher]   缺失文件: ${JSON.stringify(result.missingFiles)}`);
        this.stats.errors++;
        // v0.X: 同上，路由管锁
        // v0.45: 失败任务自动重试一次（避免单次网络/装睡导致任务永远失败）
        await this.scheduleRetry(taskId, task, 'initial-failure');
      }
    } catch (e) {
      console.error(`[AutoExecuteDispatcher] ❌ ${taskId} 异常: ${e.message}`);
      this.stats.errors++;
      // v0.X: 同上，路由管锁
      await this.scheduleRetry(taskId, task, 'exception');
    }
  }

  /**
   * v0.45: 失败任务自动重试 — 用 steerMessage 让 agent 知道上一次失败原因
   * v0.X fix: 强制从 DB 重新读最新 task — 之前用 caller 传入的 stale snapshot，
   *   task.execution_log 停留在 5+ 分钟前，导致 elapsedSec 检查（line 261）算出
   *   巨大值，错误地跳过了"agent 仍在跑"的拦截，每次 fetch failed 都会无谓重跑。
   *   根因（fetch failed 罕见边界）：dispatcher 的 await fetch 没有 timeout，
   *   长跑 agent-execute（5 分钟）的 HTTP connection 偶尔被 server keep-alive 主动 close。
   */
  async scheduleRetry(taskId, task, reason) {
    // v0.X fix: 强制刷最新 task snapshot，不要用 caller 传入的 stale 对象
    task = taskStore.getById(taskId);
    if (!task) return;

    // v0.X: 重试前检查是否已有活动中的执行 — 防 fetch 超时后重复触发
    //   根因：agent-execute HTTP fetch 超时（~5min）但 server 端 runToolLoop 仍在跑，
    //   scheduleRetry 不检查就启动第二个执行
    const recentLog = JSON.parse(task.execution_log || '[]');
    const lastEntry = recentLog[recentLog.length - 1];
    if (lastEntry && lastEntry.time) {
      const lastTime = new Date(lastEntry.time).getTime();
      const now = Date.now();
      const elapsedSec = (now - lastTime) / 1000;
      if (elapsedSec < 120) {
        console.log(`[AutoExecuteDispatcher] ⏭️ ${taskId} 跳过重试: execution_log 在 ${elapsedSec.toFixed(0)} 秒前有更新，agent 仍在运行中`);
        this.stats.skipped++;
        return;
      }
    }

    // P0 v0.X: 计数从持久化字段读（之前 in-memory Map 重启清零）
    const retryCount = getReExecuteCount(taskStore, taskId);
    if (retryCount >= MAX_RE_EXECUTE) {
      console.warn(`[AutoExecuteDispatcher] ⛔ ${taskId} 已自动重试 ${retryCount} 次，停止重试`);
      return;
    }
    setReExecuteCount(taskStore, taskId, retryCount + 1);

    // 等 5 秒后重试（让网络/服务恢复）
    setTimeout(async () => {
      console.log(`[AutoExecuteDispatcher] 🔁 ${taskId} 第 ${retryCount + 1}/${MAX_RE_EXECUTE} 次自动重试 (reason=${reason})`);
      try {
        const port = process.env.PORT || 3300;
        const apiKey = process.env.ACMS_API_KEY || 'dev-key-001';
        const retryMsg = `Auto-retry attempt ${retryCount + 1}: previous attempt failed (reason=${reason}). ` +
          `Strategies: (1) Use agent_read_files (batch) to read multiple files in one call. ` +
          `(2) Use agent_patch_file with anchor instead of node -e sed. ` +
          `(3) Do not loop on the same exploration — act decisively with agent_write_file.`;
        // P0 v0.X: AbortSignal.timeout(600_000) — 同 handleTaskClaimed 修复
        const httpReq = await fetch(`http://127.0.0.1:${port}/api/ai-tools/agent-execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
          // P0 v0.X: 带 lang — 跟初始触发的 lang 一致
          body: JSON.stringify({ taskId, agentId: task.assigned_to, steerMessage: retryMsg, lang: getPreferredLang(task) }),
          signal: AbortSignal.timeout(600_000),
        }).catch(err => ({ error: err.message, aborted: err.name === 'AbortError' }));
        const result = httpReq && typeof httpReq.json === 'function' ? await httpReq.json() : httpReq;
        if (result && result.success) {
          console.log(`[AutoExecuteDispatcher] ✅ ${taskId} 自动重试成功`);
        } else {
          console.warn(`[AutoExecuteDispatcher] ⚠️ ${taskId} 自动重试仍失败: ${(result && result.error) || 'unknown'}`);
        }
      } catch (e) {
        console.error(`[AutoExecuteDispatcher] ❌ ${taskId} 自动重试异常: ${e.message}`);
      }
    }, 5000);
  }

  getStats() {
    // P0 v0.X: reExecuteCount 不再来自 this.reExecuteCount Map（已删）
    return {
      ...this.stats,
      autoAgents: [...this.autoAgents],
    };
  }
}

// v0.34: 驳回后自动重跑（防 PM 手工 curl 痛点）
//   review 路由在 verdict=rejected 时 emit task.review_rejected（routes/tasks.js:186）
//   这里从 task.assigned_to 读出 assignee（不是 event.actor，actor 是 reviewer）
//   然后清掉 processedClaims → 重新触发 /agent-execute（HTTP 调用而不是直接调函数，避免重复 audit/submit）
//   限 MAX_RE_EXECUTE=3 次（防无限循环）
AutoExecuteDispatcher.prototype.handleTaskRejected = async function (event) {
  const taskId = event.target_id || event.target?.id;
  if (!taskId) {
    this.stats.skipped += 1;
    return;
  }

  // v0.X: 锁由路由 /agent-execute 自己管，dispatcher 不再加锁 — 直接调 HTTP 让路由处理并发保护
  const task = taskStore.getById(taskId);
  if (!task) {
    console.warn(`[AutoExecuteDispatcher] ⚠️ review_rejected: ${taskId} task 不存在`);
    this.stats.skipped += 1;
    return;
  }
  // 只对 auto-execute agents 生效
  if (!this.autoAgents.has(task.assigned_to)) {
    console.log(`[AutoExecuteDispatcher] ⏭️ review_rejected: ${taskId} assigned_to=${task.assigned_to || '(空)'} 不在白名单`);
    this.stats.skipped += 1;
    return;
  }
  // 防无限循环：每个 task 最多自动重跑 MAX_RE_EXECUTE 次
  // P0 v0.X: 计数从持久化字段读（之前 in-memory Map 重启清零 → 熔断失效）
  const currentCount = getReExecuteCount(taskStore, taskId);
  if (currentCount >= MAX_RE_EXECUTE) {
    console.warn(`[AutoExecuteDispatcher] ⛔ review_rejected: ${taskId} 已自动重跑 ${currentCount} 次，停止自动重跑（避免无限循环）。PM 需手工处理：curl /agent-execute 或 re-assign`);
    this.stats.skipped += 1;
    return;
  }
  setReExecuteCount(taskStore, taskId, currentCount + 1);
  // 清掉 processedClaims 让重新执行生效
  this.processedClaims.delete(taskId);
  this.stats.lastTriggeredAt = new Date().toISOString();
  console.log(`[AutoExecuteDispatcher] 🔄 review_rejected: ${taskId} 第 ${currentCount + 1}/${MAX_RE_EXECUTE} 次自动重跑 (assigned=${task.assigned_to})`);

  setImmediate(async () => {
    try {
      // 跟 handleTaskClaimed 一致：调 /agent-execute HTTP 端点（不直接调 executeTaskAgent，避免双重 audit/submit）
      const port = process.env.PORT || 3300;
      const apiKey = process.env.ACMS_API_KEY || 'dev-key-001';
      // P0 v0.X: AbortSignal.timeout(600_000) — 同 handleTaskClaimed 修复
      const httpReq = await fetch(`http://127.0.0.1:${port}/api/ai-tools/agent-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ taskId, agentId: task.assigned_to }),
        signal: AbortSignal.timeout(600_000),
      }).catch(err => ({ error: err.message, aborted: err.name === 'AbortError' }));
      const result = httpReq && typeof httpReq.json === 'function' ? await httpReq.json() : httpReq;
      if (result && result.success) {
        console.log(`[AutoExecuteDispatcher] ✅ ${taskId} 自动重跑完成 (analysis=${result.analysisLength || '?'} chars)`);
        this.stats.triggered += 1;
      } else {
        console.warn(`[AutoExecuteDispatcher] ⚠️ ${taskId} 自动重跑失败: ${(result && result.error) || (result && result.message) || 'unknown'}`);
        this.stats.errors += 1;
      }
      // v0.X: 锁由路由管，dispatcher 不再 _executingTasks.delete
    } catch (e) {
      console.error(`[AutoExecuteDispatcher] ❌ ${taskId} 自动重跑异常: ${e.message}`);
      this.stats.errors += 1;
    }
  });
};

const dispatcher = new AutoExecuteDispatcher();
module.exports = dispatcher;
// v0.X: 暴露锁 API 给路由 /agent-execute 用 — 让路由统一管并发触发保护
module.exports.isTaskLocked = isTaskLocked;
module.exports.tryAcquireTaskLock = tryAcquireTaskLock;
module.exports.releaseTaskLock = releaseTaskLock;
