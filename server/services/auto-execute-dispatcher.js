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
    // v0.34: 驳回也自动重跑 — routes/tasks.js:186 在 verdict=rejected 时 emit task.review_rejected
    //   之前只监听 claim 事件，驳回后 dispatcher 不会重新 trigger，PM 只能手工 curl /agent-execute
    //   现在 PM 驳回 → dispatcher 收到 task.review_rejected → 重新触发 agent-execute
    eventBus.on('task.review_rejected', (event) => this.handleTaskRejected(event));
    console.log(`[AutoExecuteDispatcher] 启动完成 · 自动执行 agents: ${[...this.autoAgents].join(', ')}`);
  }

  reload(agents) {
    this.autoAgents = new Set(agents);
  }

  addAutoAgent(agentId) { this.autoAgents.add(agentId); }

  removeAutoAgent(agentId) { this.autoAgents.delete(agentId); }

  async handleTaskClaimed(event) {
    // v0.24 fix: eventBus.emit() 会把 actor/target 拆成平铺字段 (actor_id / target_id)
    // 不保留嵌套对象。读 event.actor?.id 永远 undefined — handler 静默 return。
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
      const httpReq = await fetch(`http://127.0.0.1:${process.env.PORT || 3300}/api/ai-tools/agent-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.ACMS_API_KEY || 'dev-key-001' },
        body: JSON.stringify({ taskId, agentId: assignee }),
      }).catch(err => ({ error: err.message }));

      const result = httpReq && typeof httpReq.json === 'function' ? await httpReq.json() : httpReq;
      if (result && result.success) {
        console.log(`[AutoExecuteDispatcher] ✅ ${taskId} 完成 (analysis=${result.analysisLength || '?'} chars, submitted=${result.submitted})`);
        this.stats.triggered++;
      } else {
        console.warn(`[AutoExecuteDispatcher] ⚠️ ${taskId} 失败: ${(result && result.error) || (result && result.message) || 'unknown'}`);
        if (result && result.missingCount) console.warn(`[AutoExecuteDispatcher]   缺失文件: ${JSON.stringify(result.missingFiles)}`);
        this.stats.errors++;
        // v0.45: 失败任务自动重试一次（避免单次网络/装睡导致任务永远失败）
        await this.scheduleRetry(taskId, task, 'initial-failure');
      }
    } catch (e) {
      console.error(`[AutoExecuteDispatcher] ❌ ${taskId} 异常: ${e.message}`);
      this.stats.errors++;
      await this.scheduleRetry(taskId, task, 'exception');
    }
  }

  /**
   * v0.45: 失败任务自动重试 — 用 steerMessage 让 agent 知道上一次失败原因
   */
  async scheduleRetry(taskId, task, reason) {
    if (!task) task = taskStore.getById(taskId);
    if (!task) return;

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
        const httpReq = await fetch(`http://127.0.0.1:${port}/api/ai-tools/agent-execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
          body: JSON.stringify({ taskId, agentId: task.assigned_to, steerMessage: retryMsg }),
        }).catch(err => ({ error: err.message }));
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
      const httpReq = await fetch(`http://127.0.0.1:${port}/api/ai-tools/agent-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ taskId, agentId: task.assigned_to }),
      }).catch(err => ({ error: err.message }));
      const result = httpReq && typeof httpReq.json === 'function' ? await httpReq.json() : httpReq;
      if (result && result.success) {
        console.log(`[AutoExecuteDispatcher] ✅ ${taskId} 自动重跑完成 (analysis=${result.analysisLength || '?'} chars)`);
        this.stats.triggered += 1;
      } else {
        console.warn(`[AutoExecuteDispatcher] ⚠️ ${taskId} 自动重跑失败: ${(result && result.error) || (result && result.message) || 'unknown'}`);
        this.stats.errors += 1;
      }
    } catch (e) {
      console.error(`[AutoExecuteDispatcher] ❌ ${taskId} 自动重跑异常: ${e.message}`);
      this.stats.errors += 1;
    }
  });
};

const dispatcher = new AutoExecuteDispatcher();
module.exports = dispatcher;
