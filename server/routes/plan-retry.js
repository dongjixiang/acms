// ACMS plan-retry 路由 (v0.120, 2026-09-10) — PR5 of excel-multi-step-plan-b
//
// 目的：plan_execute 部分失败后，让用户一键把失败上下文重发一条 user message，
//   触发新一轮 LLM 会话（LLM 看到失败原因自己决定怎么改），而不是整批回滚。
//
// 设计（多多拍板：增量重试 > 整批回滚）：
//   - 不分析依赖图、不自动改参数 —— LLM 拿着失败 error 自己重规划
//   - 复用 chat 流既有 user message 链路（appendMessage）→ 前端无需新渲染逻辑
//   - 无失败 step 时幂等返回（不写消息，避免重复触发 LLM）
//
// 端点：
//   POST /api/requirements/:reqId/plan/:planId/retry

'use strict';

const express = require('express');
const router = express.Router();

// ── 失败上下文构造 ──

/**
 * 从 planDoc 里挑出失败/跳过的步骤
 * @returns {Array<{id,tool,status,error,depends_on}>}
 */
function collectFailedSteps(planDoc) {
  const steps = Array.isArray(planDoc && planDoc.steps) ? planDoc.steps : [];
  return steps
    .filter((s) => s && (s.status === 'failed' || s.status === 'skipped'))
    .map((s) => ({
      id: s.id,
      tool: s.tool,
      status: s.status,
      error: s.error || '',
      depends_on: Array.isArray(s.depends_on) ? s.depends_on : [],
      args: s.args || s.input || null,
    }));
}

/**
 * 构造重试 user message（喂给 LLM 的上下文）
 * 要求：① 明说这是系统提示不是用户原话 ② 列全每个失败 step 的 error
 *       ③ 告诉 LLM 已成功的步骤不要重做 ④ 给出重试约束（op 分类不能混批）
 */
function buildRetryMessage(planDoc, failedSteps) {
  const allSteps = Array.isArray(planDoc && planDoc.steps) ? planDoc.steps : [];
  const doneSteps = allSteps.filter((s) => s && s.status === 'done');

  const lines = [];
  lines.push('[系统提示] 上一次 plan_execute 部分失败，请修正后重新执行。');
  lines.push('');
  lines.push(`原计划摘要：${planDoc && planDoc.summary ? planDoc.summary : '(无)'}`);
  lines.push(`计划 ID：${planDoc && planDoc.planId ? planDoc.planId : '(未知)'}`);
  lines.push('');

  if (doneSteps.length) {
    lines.push('已完成（不要重做）：');
    for (const s of doneSteps) {
      lines.push(`  ✅ ${s.id} · ${s.tool}`);
    }
    lines.push('');
  }

  lines.push('失败/跳过：');
  for (const s of failedSteps) {
    lines.push(`  ❌ ${s.id} · ${s.tool} · status=${s.status}`);
    lines.push(`     错误：${s.error || '(无错误信息)'}`);
    if (s.depends_on.length) lines.push(`     依赖：${s.depends_on.join(', ')}`);
    if (s.args) {
      let argsStr;
      try { argsStr = JSON.stringify(s.args); } catch (e) { argsStr = String(s.args); }
      if (argsStr && argsStr.length > 300) argsStr = argsStr.slice(0, 300) + '...(截断)';
      lines.push(`     原参数：${argsStr}`);
    }
  }

  lines.push('');
  lines.push('请只重新规划失败的部分（已完成的步骤不要重复执行）。注意：');
  lines.push('1. Excel/Word/PPT 的结构类操作（加 sheet/增删行列）不能与内容类操作（写单元格）放在同一个 office_action 调用里，必须拆成独立步骤。');
  lines.push('2. 结构类步骤执行后需要 refreshContext=true 重新读取布局，再做后续内容类步骤。');
  lines.push('3. 如果失败原因是参数错误，请修正参数；如果是前置步骤缺失，请先补前置步骤。');

  return lines.join('\n');
}

// ── 用 source → session 映射 ──

/**
 * 找出这条 reqId 对应的自由对话 session（sess-xxx）。
 * plan 可以在两类 reqId 下跑：
 *   a) sess-xxx —— 自由对话，plan 存在 hidden requirement 上
 *   b) 真实 REQ id —— 需求对话（这里同时含 hidden container 和真需求）
 * 映射来源：buddy_memory 的 `session_req:<sessionId> = <reqId>`
 *   （由 chat-session-service.getOrCreateSessionRequirement 写入）
 */
function resolveSessionForRetry(reqId) {
  const sessionSvc = require('../services/chat-session-service');

  // 情况 a：reqId 本身就是 sess-xxx
  if (typeof reqId === 'string' && reqId.startsWith('sess-')) {
    const sess = sessionSvc.getSession(reqId);
    if (sess) return { sessionId: reqId, hiddenReqId: null };
  }

  // 情况 b：反查 buddy_memory 映射（hidden requirement id → session id）
  try {
    const { collection } = require('../db/connection');
    const mem = collection('buddy_memory').findOne((m) => m.value === reqId
      && typeof m.key === 'string' && m.key.startsWith('session_req:'));
    if (mem) {
      const sid = mem.key.slice('session_req:'.length);
      if (sessionSvc.getSession(sid)) return { sessionId: sid, hiddenReqId: reqId };
    }
  } catch (e) { /* 静默降级 */ }

  return { sessionId: null, hiddenReqId: null };
}

// ── 端点 ──

router.post('/:reqId/plan/:planId/retry', async (req, res, next) => {
  try {
    const { reqId, planId } = req.params;
    const reqStore = require('../stores/requirement-store');

    // 1. 读 requirement（含 plan doc）
    const rec = reqStore.getById(reqId);
    if (!rec) return res.status(404).json({ error: 'REQ_NOT_FOUND' });

    let planDoc = null;
    try { planDoc = JSON.parse(rec.plan || 'null'); } catch (e) { planDoc = null; }
    if (!planDoc || !planDoc.planId) {
      return res.status(404).json({ error: 'PLAN_NOT_FOUND' });
    }
    if (planId && planDoc.planId !== planId) {
      return res.status(404).json({ error: 'PLAN_ID_MISMATCH', current: planDoc.planId });
    }

    // 2. 挑失败步骤
    const failedSteps = collectFailedSteps(planDoc);
    if (failedSteps.length === 0) {
      return res.json({
        ok: true,
        retried: false,
        reason: 'NO_FAILED_STEPS',
        plan_id: planDoc.planId,
        message: '该计划没有失败步骤，无需重试。',
      });
    }

    // 3. 找 session（自由对话场景）
    const { sessionId } = resolveSessionForRetry(reqId);

    const retryMessage = buildRetryMessage(planDoc, failedSteps);
    const retryPayload = {
      ok: true,
      retried: true,
      plan_id: planDoc.planId,
      session_id: sessionId,
      failed_steps: failedSteps.map((s) => s.id),
      retry_message: retryMessage,
    };

    // 4. 不写 message —— 交回前端调 /api/chat/detect-and-respond(reqId, retry_message)
    //    理由：服务端 detect-and-respond 会自己 appendMessage(user)，这里再写会重复。
    //    前端拿着 retry_message 当用户输入发出去 = 完全等价用户手打（含 SSE 流式/轮询）。
    console.log(`[plan-retry] ${reqId} plan=${planDoc.planId} 构造重试消息（${failedSteps.length} 个失败步骤，session=${sessionId || 'n/a'}）`);

    res.json(retryPayload);
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.__test = { collectFailedSteps, buildRetryMessage, resolveSessionForRetry };
