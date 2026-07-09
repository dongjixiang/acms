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

class AutoExecuteDispatcher {
  constructor() {
    this.processedClaims = new Set();  // taskId 去重
    this.autoAgents = new Set(DEFAULT_AUTO_EXECUTE_AGENTS);
    this.stats = { triggered: 0, skipped: 0, errors: 0, lastTriggeredAt: null };
  }

  init() {
    // 监听现有 task.claimed 事件，无需新增事件类型
    eventBus.on('task.claimed', (event) => this.handleTaskClaimed(event));
    console.log(`[AutoExecuteDispatcher] 启动完成 · 自动执行 agents: ${[...this.autoAgents].join(', ')}`);
  }

  reload(agents) {
    this.autoAgents = new Set(agents);
  }

  addAutoAgent(agentId) { this.autoAgents.add(agentId); }

  removeAutoAgent(agentId) { this.autoAgents.delete(agentId); }

  async handleTaskClaimed(event) {
    const taskId = event.target?.id || event.target_id;
    const assignee = event.actor?.id;
    if (!taskId || !assignee) return;

    // 跳过已处理的（避免 race + 防双触发）
    if (this.processedClaims.has(taskId)) {
      this.stats.skipped++;
      return;
    }

    // 跳过非自动执行 agents
    if (!this.autoAgents.has(assignee)) {
      this.stats.skipped++;
      return;
    }

    // 任务必须还在 in_progress（避免重复触发 review/done 状态）
    const task = taskStore.getById(taskId);
    if (!task || task.status !== 'in_progress') {
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
        body: JSON.stringify({ taskId, agentId: assignee, modelId: (taskStore.getDefaultModelId && taskStore.getDefaultModelId()) || undefined }),
      }).catch(err => ({ error: err.message }));

      const result = httpReq && typeof httpReq.json === 'function' ? await httpReq.json() : httpReq;
      if (result && result.success) {
        console.log(`[AutoExecuteDispatcher] ✅ ${taskId} 完成 (analysis=${result.analysisLength || '?'} chars, submitted=${result.submitted})`);
        this.stats.triggered++;
      } else {
        console.warn(`[AutoExecuteDispatcher] ⚠️ ${taskId} 失败: ${(result && result.error) || 'unknown'}`);
        this.stats.errors++;
      }
    } catch (e) {
      console.error(`[AutoExecuteDispatcher] ❌ ${taskId} 异常: ${e.message}`);
      this.stats.errors++;
    }
  }

  getStats() {
    return { ...this.stats, autoAgents: [...this.autoAgents] };
  }
}

const dispatcher = new AutoExecuteDispatcher();
module.exports = dispatcher;
