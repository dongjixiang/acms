// ACMS Plan Executor (v0.48, 2026-07-16)
// 配合 plan_execute tool 使用：执行多步骤 plan，按拓扑序串行跑
// 设计原则（极简 UI）：
//   - 用户不弹审批卡，默认自动跑
//   - 每个 step 完成/失败实时写 system entry → 前端增量更新
//   - 失败时只影响下游依赖步骤，不终止整个 plan
//   - 状态持久化到 requirement.plan，重启可恢复（v0.48 简化：内存版，进程挂需重跑）
//
// 历史：v0.47.5 多多 REQ-MRHNP0PR 案例 — chat 流说"生成图片+发邮件"只调了 generate_image
//   根因：LLM 一次性 tool_loop 决策，复合意图漏调
//   治法：复合意图走 plan_execute tool → 此处按拓扑序保证所有步骤执行

const { getTool } = require('./tool-registry');
const reqStore = require('../stores/requirement-store');
const { appendChatEntry } = require('../routes/chat-intent');

/**
 * 启动一个 plan 的执行（fire-and-forget — handler 立即返回）
 * @param {string} reqId
 * @param {object} plan - { summary, steps: [{id, tool, args, depends_on?}] }
 * @returns {Promise<{ok, plan_id?, error?}>}
 */
async function executePlan(reqId, plan) {
  const planId = `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  // 1. 校验 + 拓扑排序
  const validation = validatePlan(plan);
  if (!validation.ok) {
    writeSystemEntry(reqId, {
      role: 'system',
      source: 'plan_validation_error',
      text: JSON.stringify({
        type: 'plan_validation_error',
        plan_id: planId,
        summary: plan.summary || '',
        error: validation.error,
      }),
      at: new Date().toISOString(),
    });
    return { ok: false, error: validation.error };
  }
  const orderedSteps = validation.steps;

  // 2. 持久化 plan（每个 step 默认 pending）
  const planDoc = {
    planId,
    summary: plan.summary || '',
    steps: orderedSteps.map((s) => ({
      id: s.id,
      tool: s.tool,
      args: s.args,
      depends_on: s.depends_on,
      status: 'pending',
      result: null,
      error: null,
      started_at: null,
      finished_at: null,
    })),
    status: 'running',
    created_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    finished_at: null,
  };
  reqStore.update(reqId, {
    plan: JSON.stringify(planDoc),
    plan_status: 'running',
  });

  // 3. 写 plan_loading system entry → 前端显示 ⏳ 卡
  writeSystemEntry(reqId, {
    role: 'system',
    source: 'plan_loading',
    text: JSON.stringify({
      type: 'plan_loading',
      plan_id: planId,
      summary: planDoc.summary,
      total_steps: planDoc.steps.length,
    }),
    at: new Date().toISOString(),
  });

  // 4. 异步跑（fire-and-forget，handler 立即返回让 LLM 继续）
  setImmediate(() => {
    runPlan(reqId, planDoc).catch((e) => {
      console.error(`[plan-executor] ${planId} runPlan crashed:`, e.message);
      writeSystemEntry(reqId, {
        role: 'system',
        source: 'plan_failed',
        text: JSON.stringify({
          type: 'plan_failed',
          plan_id: planId,
          error: e.message,
        }),
        at: new Date().toISOString(),
      });
    });
  });

  return { ok: true, plan_id: planId, summary: planDoc.summary, total_steps: planDoc.steps.length };
}

/**
 * 校验 plan 数据结构
 * @returns {{ok: true, steps: Array} | {ok: false, error: string}}
 */
function validatePlan(plan) {
  if (!plan || !Array.isArray(plan.steps)) {
    return { ok: false, error: 'INVALID_PLAN: steps must be array' };
  }
  if (plan.steps.length === 0) {
    return { ok: false, error: 'INVALID_PLAN: steps is empty' };
  }
  // 给每步补默认 id
  const steps = plan.steps.map((s, i) => ({
    id: s.id || `s${i + 1}`,
    tool: s.tool,
    args: s.args || {},
    depends_on: Array.isArray(s.depends_on) ? s.depends_on : [],
  }));
  // 校验 tool 都注册
  for (const s of steps) {
    if (!s.tool) return { ok: false, error: `INVALID_PLAN: step ${s.id} missing tool` };
    if (!getTool(s.tool)) return { ok: false, error: `UNKNOWN_TOOL: ${s.tool} (step ${s.id})` };
  }
  // 校验 depends_on 引用合法
  const ids = new Set(steps.map((s) => s.id));
  for (const s of steps) {
    for (const dep of s.depends_on) {
      if (!ids.has(dep)) return { ok: false, error: `UNKNOWN_DEP: ${s.id} depends on ${dep}` };
      if (dep === s.id) return { ok: false, error: `SELF_DEP: ${s.id}` };
    }
  }
  return { ok: true, steps };
}

/**
 * 按 depends_on 做拓扑排序（L1 简化：保证每个 step 排在其依赖之后，串行执行）
 * 检测循环依赖
 */
function topologicalSort(steps) {
  const result = [];
  const done = new Set();
  const remaining = [...steps];

  while (remaining.length > 0) {
    let progressed = false;
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i];
      const allDepsDone = s.depends_on.every((d) => done.has(d));
      if (allDepsDone) {
        result.push(s);
        done.add(s.id);
        remaining.splice(i, 1);
        progressed = true;
        break; // 一次只排一个（保持 LLM 给的顺序）
      }
    }
    if (!progressed) {
      const unresolved = remaining.map((s) => `${s.id}(deps:${s.depends_on.join(',')})`).join('; ');
      throw new Error(`CYCLE_DEP: ${unresolved}`);
    }
  }
  return result;
}

/**
 * 实际跑 plan（异步）
 */
async function runPlan(reqId, planDoc) {
  const startTime = Date.now();
  let anyFailed = false;

  for (const step of planDoc.steps) {
    // 跳过已经标 skipped 的（前置失败导致）
    if (step.status === 'skipped') continue;

    // 标记 running
    step.status = 'running';
    step.started_at = new Date().toISOString();
    updatePlanStepEntry(reqId, planDoc, step.id, 'running', null);

    try {
      // L1 简化：直接传 args，不自动注入上游结果（L2 可加 depends_on 变量替换）
      const tool = getTool(step.tool);
      const result = await tool.handler(step.args, { reqId });

      const isOk = result && result.ok !== false;
      step.status = isOk ? 'done' : 'failed';
      step.result = result;
      step.finished_at = new Date().toISOString();
      if (!isOk) {
        step.error = (result && (result.error || result.message)) || 'tool returned ok=false';
        anyFailed = true;
      }
      updatePlanStepEntry(reqId, planDoc, step.id, step.status, result);

      // 失败 → 下游依赖标 skipped
      if (!isOk) {
        markDownstreamSkipped(reqId, planDoc, step.id);
      }
    } catch (e) {
      step.status = 'failed';
      step.error = e.message;
      step.result = { ok: false, error: e.message };
      step.finished_at = new Date().toISOString();
      anyFailed = true;
      updatePlanStepEntry(reqId, planDoc, step.id, 'failed', step.result);
      markDownstreamSkipped(reqId, planDoc.steps, step.id);
    }
  }

  // 全部跑完，更新 plan 终态
  planDoc.status = anyFailed ? 'partial_failed' : 'done';
  planDoc.finished_at = new Date().toISOString();
  reqStore.update(reqId, {
    plan: JSON.stringify(planDoc),
    plan_status: planDoc.status,
  });

  // 写 plan_done entry
  writeSystemEntry(reqId, {
    role: 'system',
    source: 'plan_done',
    text: JSON.stringify({
      type: 'plan_done',
      plan_id: planDoc.planId,
      status: planDoc.status,
      duration_ms: Date.now() - startTime,
      summary: planDoc.summary,
      steps: planDoc.steps.map((s) => ({
        id: s.id,
        tool: s.tool,
        status: s.status,
        error: s.error,
      })),
    }),
    at: new Date().toISOString(),
  });
}

/**
 * 失败的下游依赖步骤标 skipped（BFS，需要 reqId 写 entry）
 * 含完整 plan 快照（前端按 plan_id 找最新 entry 直接渲染）
 */
function markDownstreamSkipped(reqId, planDoc, failedStepId) {
  const skipIds = new Set([failedStepId]);
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const s of planDoc.steps) {
      if (skipIds.has(s.id)) continue;
      if (s.status !== 'pending') continue;
      if (s.depends_on.some((d) => skipIds.has(d))) {
        s.status = 'skipped';
        s.finished_at = new Date().toISOString();
        s.error = `上游步骤 ${s.depends_on.filter((d) => skipIds.has(d)).join(',')} 失败，已跳过`;
        skipIds.add(s.id);
        writeSystemEntry(reqId, {
          role: 'system',
          source: 'plan_step_update',
          text: JSON.stringify({
            type: 'plan_step_update',
            plan_id: planDoc.planId,
            step_id: s.id,
            status: 'skipped',
            result: null,
            error: s.error,
            summary: planDoc.summary,
            total_steps: planDoc.steps.length,
            steps: planDoc.steps.map((x) => ({ id: x.id, tool: x.tool, status: x.status, error: x.error })),
          }),
          at: new Date().toISOString(),
        });
        progressed = true;
      }
    }
  }
}

/**
 * 写 step 状态更新 system entry
 * 含完整 plan 快照（前端按 plan_id 找最新 entry 直接渲染，无需聚合）
 */
function updatePlanStepEntry(reqId, planDoc, stepId, status, result) {
  writeSystemEntry(reqId, {
    role: 'system',
    source: 'plan_step_update',
    text: JSON.stringify({
      type: 'plan_step_update',
      plan_id: planDoc.planId,
      step_id: stepId,
      status,
      result: result || null,
      // 全量快照（前端按 plan_id 找最新 entry 直接渲染）
      summary: planDoc.summary,
      total_steps: planDoc.steps.length,
      steps: planDoc.steps.map((s) => ({
        id: s.id,
        tool: s.tool,
        status: s.status,
        error: s.error,
      })),
    }),
    at: new Date().toISOString(),
  });
}

/**
 * 写 system entry 到聊天流（统一入口 + 错误暴露）
 * v0.48: 去掉 try/catch 静默吞错——appendChatEntry 失败必须暴露（之前 TypeError 被吞了，
 *   导致 plan_* entries 实际从未写入，需求"看不到 ⏳ 卡"症状的根因）
 */
function writeSystemEntry(reqId, entry) {
  appendChatEntry(reqId, entry);
}

module.exports = { executePlan, validatePlan, topologicalSort };