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

// v0.49: 内容生成类工具自动注入上游数据兜底
//   适用条件（全部满足才动）：
//     - tool ∈ {generate_image, document_gen}（"内容生成"工具，需要上游数据才合理）
//     - step.depends_on 不空（明确在 plan 数据流里）
//     - 上游 step ∈ {web_search, web_research, fetch_url}（数据源）且有 formatted / results
//     - 当前 args.prompt（或 instruction）**不含 ${...} 模板**（LLM 没手动引用）
//   行为：把上游数据源 step 的 formatted 拼到 args.prompt 前面，作为"上游数据"块
//   不覆盖 LLM 已经写的内容（用 prefix 形式叠加）
//   治："LLM 不写 ${...} 模板"症状 —— 不管 LLM 学没学会 syntax，prompt 必有真数据
//   marker：CTX_DIVIDER 隔离 prefix 和原 prompt — handler 可剥 marker 拿原 prompt 做文件名/落库元数据
const CTX_DIVIDER = '__ACMS_AUTO_CONTEXT_END__';

// 所有数据源工具对 plan 暴露同一个“可读正文 + 结果列表”契约。
// web_search: formatted/results；web_research: answer/searchResults；fetch_url: content/text。
function getCanonicalUpstreamPayload(step) {
  const r = step?.result;
  if (!r || typeof r !== 'object') return { text: '', results: [] };
  const textCandidates = [r.formatted, r.answer, r.content, r.text];
  const text = textCandidates.find(v => typeof v === 'string' && v.trim()) || '';
  const results = Array.isArray(r.results) ? r.results
    : Array.isArray(r.searchResults) ? r.searchResults
    : Array.isArray(r.sources) ? r.sources
    : [];
  return { text, results };
}

function autoInjectUpstreamContext(args, step, planDoc) {
  if (!args || typeof args !== 'object') return args;
  const CONTENT_TOOLS = new Set(['generate_image', 'document_gen']);
  const DATA_TOOLS = new Set(['web_search', 'web_research', 'fetch_url']);
  if (!CONTENT_TOOLS.has(step.tool)) return args;
  if (!Array.isArray(step.depends_on) || step.depends_on.length === 0) return args;

  // 检测 prompt / instruction 里是否已经有 ${...} 模板
  const hasTemplate = (s) => typeof s === 'string' && /\$\{[a-zA-Z0-9_]+\.[^}]+\}/.test(s);
  const promptField = typeof args.prompt === 'string' ? 'prompt'
                     : typeof args.instruction === 'string' ? 'instruction'
                     : null;
  if (!promptField) return args;
  const userPrompt = args[promptField];
  if (hasTemplate(userPrompt)) return args;  // 模板仍未解析：交给 validateResolvedArgs 硬阻断
  let groundedInstruction = userPrompt;

  // 收集上游 data-source step 的 canonical text/results
  const blocks = [];
  for (const depId of step.depends_on) {
    const depStep = (planDoc.steps || []).find(s => s.id === depId);
    if (!depStep || !depStep.result) continue;
    if (!DATA_TOOLS.has(depStep.tool)) continue;
    const payload = getCanonicalUpstreamPayload(depStep);
    if (payload.text) {
      blocks.push(`【上游 ${depId} (${depStep.tool}) 数据】\n${payload.text}`);
      // 显式模板已在 resolveStepArgs 中展开时，把正文从原指令移除，避免同一上游数据出现两份。
      if (groundedInstruction.includes(payload.text)) {
        groundedInstruction = groundedInstruction.split(payload.text).join('【使用上游已核验数据】');
      }
    } else if (payload.results.length > 0) {
      const trimmed = payload.results.slice(0, 5).map(x => ({
        title: x.title, url: x.url,
        snippet: (x.snippet || '').slice(0, 200),
      }));
      blocks.push(`【上游 ${depId} (${depStep.tool}) 数据(JSON 摘要)】\n${JSON.stringify(trimmed, null, 2)}`);
    }
  }
  if (blocks.length === 0) return args;

  // 注入到 prompt 前；marker 隔离上游事实与原始生成/整理指令。
  const newArgs = { ...args };
  newArgs[promptField] = `${blocks.join('\n\n')}\n\n${CTX_DIVIDER}\n${groundedInstruction}`;
  return newArgs;
}

/**
 * v0.49: 模板变量注入 — args 里的 "${s1.formatted}" 替换为 step s1 的 result 中对应字段值
 *   支持任意深度路径：${s1.formatted} / ${s2.file_ids.0.id} / ${s1.results.0.title}
 *   语法：${<step_id>.<dot.path>}
 *   找不到对应 step / result 路径时保留原字符串（不报错，让 LLM 看到 raw 提示自己修正）
 * @returns 新的 args 对象（不 mutate 原 step.args）
 */
function resolveStepArgs(args, planDoc) {
  if (!args || typeof args !== 'object' || !planDoc) return args;
  const idx = new Map();
  for (const s of planDoc.steps) idx.set(s.id, s);
  const walk = (val) => {
    if (typeof val === 'string') {
      return val.replace(/\$\{([a-zA-Z0-9_]+)\.([^\}]+)\}/g, (m, sid, path) => {
        const s = idx.get(sid);
        if (!s || !s.result) return m;
        const pathParts = path.split('.');
        let cur = s.result;
        for (const p of pathParts) {
          if (cur == null) return m;
          // plan 模板使用 canonical aliases：不同数据工具不再要求 LLM 记住 answer/formatted 等内部字段差异。
          if (cur === s.result && p === 'formatted' && !Object.prototype.hasOwnProperty.call(cur, p)) {
            cur = getCanonicalUpstreamPayload(s).text;
          } else if (cur === s.result && p === 'results' && !Object.prototype.hasOwnProperty.call(cur, p)) {
            cur = getCanonicalUpstreamPayload(s).results;
          } else if (Array.isArray(cur) && /^\d+$/.test(p)) {
            cur = cur[Number(p)];
          } else if (typeof cur === 'object' && p in cur) {
            cur = cur[p];
          } else {
            return m;
          }
        }
        if (cur == null) return m;
        if (typeof cur === 'object') return JSON.stringify(cur);
        return String(cur);
      });
    }
    if (Array.isArray(val)) return val.map(walk);
    if (typeof val === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(val)) out[k] = walk(v);
      return out;
    }
    return val;
  };
  return walk(args);
}

/**
 * 下游工具绝不能收到未解析的 ${step.path} 占位符。
 * 过去这里 fail-open，导致邮件把占位符原样发出、plan 仍显示 done。
 */
function validateResolvedArgs(args) {
  const templates = [];
  const seen = new Set();
  const walk = (value) => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(/\$\{[a-zA-Z0-9_]+\.[^}]+\}/g)) {
        if (!seen.has(match[0])) {
          seen.add(match[0]);
          templates.push(match[0]);
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(args);
  return templates.length > 0
    ? { ok: false, error: 'UNRESOLVED_UPSTREAM_TEMPLATE', templates }
    : { ok: true, templates: [] };
}

/**
 * v0.48: send_email 自动串联上游 step 的 file_ids 作附件
 *   触发条件：
 *     - 当前 step tool === 'send_email'
 *     - args.file_ids 是空 / 缺省 / 不是数组
 *   行为：扫 planDoc.steps 找 done 的 + 依赖当前 step 的 + result 含 file_ids 的 step → 合并
 *   不覆盖 LLM 显式传的 file_ids
 * @returns {{ changed: boolean, args: object, added: number }}
 */
function injectUpstreamFileIds(step, planDoc) {
  const llmFileIds = Array.isArray(step.args?.file_ids) ? step.args.file_ids : [];
  if (llmFileIds.length > 0) {
    return { changed: false, args: step.args, added: 0 };
  }
  // 找上游 done step 的 file_ids
  const upstreamFileIds = [];
  for (const upstream of planDoc.steps) {
    if (upstream.id === step.id) continue;
    if (upstream.status !== 'done') continue;
    // 必须当前 step 依赖它（depends_on 里包含）
    if (!Array.isArray(step.depends_on) || !step.depends_on.includes(upstream.id)) continue;
    const r = upstream.result;
    if (!r || !Array.isArray(r.file_ids) || r.file_ids.length === 0) continue;
    for (const f of r.file_ids) {
      // file_ids 元素可能是 {id, name, size, mime, kind} 或只是 id 字符串
      if (typeof f === 'string') {
        upstreamFileIds.push({ id: f, name: '', size: 0, mime: '', kind: 'unknown' });
      } else if (f && f.id) {
        upstreamFileIds.push(f);
      }
    }
  }
  if (upstreamFileIds.length === 0) {
    return { changed: false, args: step.args, added: 0 };
  }
  // 复制 args 避免 mutate planDoc
  const newArgs = { ...(step.args || {}) };
  newArgs.file_ids = upstreamFileIds.map((f) => f.id);
  return { changed: true, args: newArgs, added: upstreamFileIds.length };
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
      // v0.48: send_email 自动串联上游 document_gen / image_gen 等产生 file_ids 的 step
      //   如果 LLM 在 args.file_ids 里没传（或传空数组），扫 planDoc.steps 找依赖里 done 的 step.result.file_ids 合并
      if (step.tool === 'send_email' && step.result !== null) {
        // 此分支永远不会进 — 仅说明意图
      }
      let effectiveArgs = step.args;
      // v0.49: 模板变量注入（${s1.formatted} 引用上游 step result 字段）— 治数据流断层
      effectiveArgs = resolveStepArgs(effectiveArgs, planDoc);
      // v0.49: LLM 没引用 ${...} 也能拿到数据——内容生成 tool 上游数据兜底注入
      effectiveArgs = autoInjectUpstreamContext(effectiveArgs, step, planDoc);
      if (step.tool === 'send_email') {
        const injected = injectUpstreamFileIds(step, planDoc);
        if (injected.changed) {
          // v0.49: 合并而非完全覆盖，保留模板解析后的字段
          effectiveArgs = { ...effectiveArgs, file_ids: injected.args.file_ids };
          console.log(`[plan-executor] ${reqId} send_email 自动注入 ${injected.added} 个 file_ids（来自上游步骤）`);
        }
      }

      // v0.49: 同步工具白名单 — 让 handler 决定"等真完成" vs "fire-and-forget"
      //   generate_image / document_gen 是真完成类（需 await 真实产出，避免假完成）
      const SYNC_TOOLS = new Set(['generate_image', 'document_gen']);
      const resolvedValidation = validateResolvedArgs(effectiveArgs);
      let result;
      if (!resolvedValidation.ok) {
        // fail-closed：不调用有副作用的下游工具，交给统一失败分支写 plan_warning + skip 下游。
        result = {
          ok: false,
          error: resolvedValidation.error,
          message: `上游模板未解析：${resolvedValidation.templates.join(', ')}`,
          unresolved_templates: resolvedValidation.templates,
        };
      } else {
        const tool = getTool(step.tool);
        result = await tool.handler(effectiveArgs, {
          reqId,
          sync: SYNC_TOOLS.has(step.tool),    // 同步工具才传 true
          planDoc,                              // 让 handler 读 plan context (e.g. send_email 据此拒绝全局兜底)
        });
      }

      const isOk = result && result.ok !== false;
      step.status = isOk ? 'done' : 'failed';
      step.result = result;
      step.finished_at = new Date().toISOString();
      if (!isOk) {
        step.error = (result && (result.error || result.message)) || 'tool returned ok=false';
        anyFailed = true;
      }
      updatePlanStepEntry(reqId, planDoc, step.id, step.status, result);

      // 失败 → 下游依赖标 skipped + 立刻写 plan_warning system entry（治"用户焦虑等不到反馈"）
      //   不再让 plan_executor 默默失败 — 失败时显式推到 chat 流让用户/前端立刻看见
      if (!isOk) {
        markDownstreamSkipped(reqId, planDoc, step.id);
        writeSystemEntry(reqId, {
          role: 'system',
          source: 'plan_warning',
          text: JSON.stringify({
            type: 'plan_warning',
            plan_id: planDoc.planId,
            step_id: step.id,
            tool: step.tool,
            error: step.error,
            message: `⚠️ 计划步骤 ${step.id} (${step.tool}) 失败：${(step.error || '').slice(0, 200)}${Array.isArray(step.depends_on) && step.depends_on.length ? ` — 下游 ${step.depends_on.length} 个步骤已被跳过` : ''}。LLM final answer 不再准确, 实际未完成。`,
          }),
          at: new Date().toISOString(),
        });
        console.log(`[plan-executor] ${reqId} step ${step.id} (${step.tool}) failed: ${step.error}`);
      }
    } catch (e) {
      step.status = 'failed';
      step.error = e.message;
      step.result = { ok: false, error: e.message };
      step.finished_at = new Date().toISOString();
      anyFailed = true;
      updatePlanStepEntry(reqId, planDoc, step.id, 'failed', step.result);
      markDownstreamSkipped(reqId, planDoc, step.id);
      // v0.50: 同步路径异常也写 plan_warning（治 catch 块异常被吞）
      writeSystemEntry(reqId, {
        role: 'system',
        source: 'plan_warning',
        text: JSON.stringify({
          type: 'plan_warning',
          plan_id: planDoc.planId,
          step_id: step.id,
          tool: step.tool,
          error: e.message,
          message: `⚠️ 计划步骤 ${step.id} (${step.tool}) 抛异常：${e.message.slice(0, 200)} — 已被 mark failed。`,
        }),
        at: new Date().toISOString(),
      });
      console.log(`[plan-executor] ${reqId} step ${step.id} (${step.tool}) crashed: ${e.message}`);
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

module.exports = {
  executePlan,
  validatePlan,
  topologicalSort,
  injectUpstreamFileIds,
  resolveStepArgs,
  autoInjectUpstreamContext,
  validateResolvedArgs,
  getCanonicalUpstreamPayload,
};
