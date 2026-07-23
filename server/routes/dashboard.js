// PM Dashboard 4 张卡 - v0.46
// 聚合 tasks/events/token_usage 数据, 给 PM 一眼看到项目健康度
// 设计目标:
//   1. 本周完成度 (数量 + 成功率)
//   2. 效率指标 (平均轮次/任务, 平均 token/任务, 平均耗时/任务)
//   3. 成本统计 (本周 token, 模型分布 Top 3)
//   4. 异常 Top 3 (失败率最高 agent, 最常失败工具, 最常见失败原因)
//
// 数据源: tasks 表 (状态/类型/agent/时间) + events 表 (动作/结果) + token_usage 表

const express = require('express');
const router = express.Router();
const { collection } = require('../db/connection');

// v0.46 工具: 安全从 doc JSON 里取字段 (兼容 string JSON / object)
function jget(doc, path, def = null) {
  try {
    if (!doc) return def;
    const obj = typeof doc === 'string' ? JSON.parse(doc) : doc;
    if (path == null) return obj;  // v0.46 fix: null path → 返回整个对象
    return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj) ?? def;
  } catch { return def; }
}

// v0.46 工具: 时间范围筛选 (ISO 周)
function getWeekRange(offsetWeeks = 0) {
  const now = new Date();
  const day = now.getDay() || 7; // 周日=0 → 7
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - day + 1 - offsetWeeks * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  return { start: monday.toISOString(), end: sunday.toISOString() };
}

// v0.46: 工具 — 直接用 better-sqlite3 (不通过 collection, 性能更好 + 不用共享缓存)
const Database = require('better-sqlite3');
const path = require('path');
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'acms.db');
const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

// 工具: SQLite 查询包装
function queryAll(sql, params = []) {
  try {
    return db.prepare(sql).all(...params);
  } catch (e) {
    console.error('[dashboard] query failed:', e.message, sql);
    return [];
  }
}

// 工具: 数字格式化
function fmtNum(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(Math.round(n));
}

// ────────────────────────────────────────────────────────────
// GET /api/dashboard/stats?projectId=xxx&weeksAgo=0
// 返回 4 张卡所需的所有数据
// ────────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const projectId = req.query.projectId;
  const weeksAgo = Math.max(0, parseInt(req.query.weeksAgo || '0', 10));
  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  try {
    // ── 卡 1: 本周健康度 ────────────────────────────────
    const weekRange = getWeekRange(weeksAgo);

    const tasksThisWeek = queryAll(`
      SELECT id, doc FROM tasks
      WHERE json_extract(doc, '$.project_id') = ?
        AND json_extract(doc, '$.created_at') >= ?
        AND json_extract(doc, '$.created_at') < ?
    `, [projectId, weekRange.start, weekRange.end]);

    let completed = 0, failed = 0, inProgress = 0;
    for (const row of tasksThisWeek) {
      const status = jget(row.doc, 'status', '');
      if (status === 'done') completed++;
      else if (status === 'rejected' || status === 'archived') failed++;
      else if (status === 'in_progress' || status === 'review') inProgress++;
    }
    const totalThisWeek = tasksThisWeek.length;
    const successRate = totalThisWeek > 0 ? Math.round((completed / totalThisWeek) * 100) : null;

    // ── 卡 2: 效率指标 (已完成任务的平均轮次 / token / 耗时) ──
    // execution_log 是 stringified JSON, 长度 ≈ 轮次数 (T-MRKP19DR 14 轮 → execution_log 之前是 [], 现在没数据)
    // 先看 task.doc.execution_log 长度, 兜底用 events 计数
    const doneTasks = queryAll(`
      SELECT id, doc FROM tasks
      WHERE json_extract(doc, '$.project_id') = ?
        AND json_extract(doc, '$.status') = 'done'
        AND json_extract(doc, '$.completed_at') >= ?
        AND json_extract(doc, '$.completed_at') < ?
    `, [projectId, weekRange.start, weekRange.end]);

    let totalRounds = 0, totalDurationMs = 0, durationCount = 0;
    for (const row of doneTasks) {
      const log = jget(row.doc, 'execution_log', []);
      if (Array.isArray(log)) totalRounds += log.length;
      else if (typeof log === 'string' && log.length > 2) totalRounds += 1; // 占位 fallback

      const created = new Date(jget(row.doc, 'created_at')).getTime();
      const completed = new Date(jget(row.doc, 'completed_at')).getTime();
      if (created > 0 && completed > created) {
        totalDurationMs += (completed - created);
        durationCount++;
      }
    }
    const avgRounds = doneTasks.length > 0 ? Math.round(totalRounds / doneTasks.length) : null;
    const avgDurationMin = durationCount > 0 ? Math.round(totalDurationMs / durationCount / 60000) : null;

    // ── 卡 3: 成本统计 (本周 token + 累计 token) ──────────
    // 累计 token: 项目所有时间的总和 (从 token_usage 表, 不限时间)
    const cumulativeTokenRow = queryAll(`
      SELECT COALESCE(SUM(json_extract(doc, '$.total_tokens')), 0) as total
      FROM token_usage WHERE json_extract(doc, '$.project_id') = ?
    `, [projectId]);
    const cumulativeTokens = cumulativeTokenRow[0]?.total || 0;

    const tokensThisWeek = queryAll(`
      SELECT doc FROM token_usage
      WHERE json_extract(doc, '$.project_id') = ?
        AND json_extract(doc, '$.created_at') >= ?
        AND json_extract(doc, '$.created_at') < ?
    `, [projectId, weekRange.start, weekRange.end]);

    let totalTokens = 0, totalCost = 0;
    const modelCounts = {};
    const callerCounts = {};
    for (const row of tokensThisWeek) {
      const total = jget(row.doc, 'total_tokens', 0);
      const model = jget(row.doc, 'model', 'unknown');
      const caller = jget(row.doc, 'caller', 'unknown');
      totalTokens += total;
      // v0.46 简化定价 (per 1M tokens) — 实际生产应读 providers 表
      const pricePerM = (model.includes('70b') || model.includes('opus') || model.includes('sonnet'))
        ? 15 : (model.includes('mini') || model.includes('haiku')) ? 0.25 : 3;
      totalCost += (total / 1000000) * pricePerM;
      modelCounts[model] = (modelCounts[model] || 0) + total;
      callerCounts[caller] = (callerCounts[caller] || 0) + total;
    }
    const topModels = Object.entries(modelCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([model, tokens]) => ({ model, tokens, pct: totalTokens > 0 ? Math.round(tokens / totalTokens * 100) : 0 }));
    const topCallers = Object.entries(callerCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([caller, tokens]) => ({ caller, tokens, pct: totalTokens > 0 ? Math.round(tokens / totalTokens * 100) : 0 }));

    // ── 卡 4: 异常 Top 3 (失败率最高 agent + 失败任务 Top) ──
    const allTasks = queryAll(`
      SELECT id, doc FROM tasks
      WHERE json_extract(doc, '$.project_id') = ?
        AND json_extract(doc, '$.created_at') >= ?
        AND json_extract(doc, '$.created_at') < ?
    `, [projectId, weekRange.start, weekRange.end]);

    const agentStats = {}; // agentId -> { total, failed, completed }
    for (const row of allTasks) {
      const agent = jget(row.doc, 'assigned_to') || '(unassigned)';
      const status = jget(row.doc, 'status', '');
      if (!agentStats[agent]) agentStats[agent] = { total: 0, failed: 0, completed: 0 };
      agentStats[agent].total++;
      if (status === 'done') agentStats[agent].completed++;
      if (status === 'rejected' || status === 'archived') agentStats[agent].failed++;
    }
    const agentRank = Object.entries(agentStats)
      .filter(([_, s]) => s.total >= 2)  // 至少 2 个任务才统计
      .map(([agent, s]) => ({
        agent,
        total: s.total,
        completed: s.completed,
        failed: s.failed,
        successRate: Math.round(s.completed / s.total * 100),
      }))
      .sort((a, b) => a.successRate - b.successRate)  // 失败率高的在前
      .slice(0, 3);

    // 失败原因 Top (从 rejected reviews 里抽)
    const rejectedTasks = queryAll(`
      SELECT id, doc FROM tasks
      WHERE json_extract(doc, '$.project_id') = ?
        AND (json_extract(doc, '$.status') = 'rejected' OR json_extract(doc, '$.status') = 'archived')
        AND json_extract(doc, '$.created_at') >= ?
        AND json_extract(doc, '$.created_at') < ?
    `, [projectId, weekRange.start, weekRange.end]);

    const failReasons = [];
    for (const row of rejectedTasks) {
      const reviews = jget(row.doc, 'reviews', []);
      const submissions = jget(row.doc, 'submissions', []);
      // 取最近一次 rejected review
      if (Array.isArray(reviews)) {
        const lastRej = [...reviews].reverse().find(r => jget(r, 'verdict') === 'rejected');
        if (lastRej) {
          const fb = jget(lastRej, 'feedback', '') || '';
          failReasons.push({
            taskId: row.id,
            title: jget(row.doc, 'title', '')?.slice(0, 50) || row.id,
            reason: fb.slice(0, 200),
            time: jget(lastRej, 'reviewed_at', ''),
          });
        }
      }
    }
    failReasons.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
    const topFailReasons = failReasons.slice(0, 3);

    // ── 汇总 ──
    res.json({
      projectId,
      weeksAgo,
      weekRange: {
        start: weekRange.start,
        end: weekRange.end,
        label: weeksAgo === 0 ? '本周' : `${weeksAgo} 周前`,
      },
      card1_health: {
        total: totalThisWeek,
        completed,
        inProgress,
        failed,
        successRate,
      },
      card2_efficiency: {
        // v0.46: 合并 stat-row 需求/任务卡片, 4 个数据点合一
        doneCount: doneTasks.length,
        avgRounds,
        avgDurationMin,
        // 项目总览 (所有时间, 不限本周)
        reqTotal: queryAll(`SELECT count(*) as c FROM requirements WHERE json_extract(doc, '$.project_id') = ?`, [projectId])[0]?.c || 0,
        reqActive: queryAll(`SELECT count(*) as c FROM requirements WHERE json_extract(doc, '$.project_id') = ? AND json_extract(doc, '$.status') NOT IN ('done', 'abandoned')`, [projectId])[0]?.c || 0,
        taskTotal: queryAll(`SELECT count(*) as c FROM tasks WHERE json_extract(doc, '$.project_id') = ?`, [projectId])[0]?.c || 0,
        taskDone: queryAll(`SELECT count(*) as c FROM tasks WHERE json_extract(doc, '$.project_id') = ? AND json_extract(doc, '$.status') = 'done'`, [projectId])[0]?.c || 0,
      },
      card3_cost: {
        totalTokens,
        cumulativeTokens,  // v0.46: 项目所有时间累计 (对比本周)
        totalCost: Math.round(totalCost * 100) / 100,
        cumulativeCost: Math.round((cumulativeTokens / 1000000) * 3 * 100) / 100,  // 简单估算
        topModels,
        topCallers,
      },
      card4_anomalies: {
        worstAgents: agentRank,
        recentFails: topFailReasons,
      },
    });
  } catch (e) {
    console.error('[dashboard] stats error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────
// GET /api/dashboard/timeseries?projectId=xxx&days=30
// 返回最近 N 天每天的任务完成数 (前端画 sparkline 用)
// ────────────────────────────────────────────────────────────
router.get('/timeseries', (req, res) => {
  const projectId = req.query.projectId;
  const days = Math.min(90, Math.max(1, parseInt(req.query.days || '30', 10)));
  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  try {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
    const tasks = queryAll(`
      SELECT json_extract(doc, '$.created_at') as cat,
             json_extract(doc, '$.completed_at') as compl_at,
             json_extract(doc, '$.status') as status
      FROM tasks
      WHERE json_extract(doc, '$.project_id') = ?
        AND json_extract(doc, '$.created_at') >= ?
    `, [projectId, since]);

    const series = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000);
      const key = d.toISOString().slice(0, 10);
      series[key] = { date: key, created: 0, completed: 0 };
    }
    for (const t of tasks) {
      if (t.cat) {
        const k = t.cat.slice(0, 10);
        if (series[k]) series[k].created++;
      }
      if (t.compl_at) {
        const k = t.compl_at.slice(0, 10);
        if (series[k]) series[k].completed++;
      }
    }

    res.json({
      projectId,
      days,
      series: Object.values(series),
    });
  } catch (e) {
    console.error('[dashboard] timeseries error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ────────────────────────────────────────────────────────────
// GET /api/dashboard/live?projectId=xxx
// v0.46 Live Monitor MVP — 返回项目下所有 in_progress / review 任务的快照
// 数据: task id, title, agent, 当前轮次 (从 execution_log), 最后动作, 耗时, 卡住预警
// ────────────────────────────────────────────────────────────
router.get('/live', (req, res) => {
  const projectId = req.query.projectId;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  try {
    const activeTasks = queryAll(`
      SELECT id, doc FROM tasks
      WHERE json_extract(doc, '$.project_id') = ?
        AND json_extract(doc, '$.status') IN ('in_progress', 'review')
      ORDER BY json_extract(doc, '$.updated_at') DESC
    `, [projectId]);

    const now = Date.now();
    const STUCK_THRESHOLD_MIN = 3; // 超过 3 分钟无动作视为卡住

    const tasks = activeTasks.map(row => {
      // v0.46 fix: tasks.id 是 SQLite PK (int), 真实任务 ID (T-xxx) 在 doc.id 字段
      const doc = jget(row.doc, null, {});
      const realId = jget(doc, 'id', row.id);  // 优先用 doc.id, fallback 到 PK
      const executionLog = jget(doc, 'execution_log', []);
      const progress = jget(doc, 'progress', 0);
      const updatedAt = jget(doc, 'updated_at', '');
      const assignedTo = jget(doc, 'assigned_to', '');
      const createdAt = jget(doc, 'created_at', '');
      const progressNote = jget(doc, 'progress_note', '');
      const status = jget(doc, 'status', '');

      // 取 execution_log 最后一条作为 "last activity"
      let lastAction = '';
      let lastActionTime = updatedAt;
      if (Array.isArray(executionLog) && executionLog.length > 0) {
        const last = executionLog[executionLog.length - 1];
        lastAction = `${last.action || ''} ${last.note ? '— ' + (last.note.slice(0, 80)) : ''}`.trim();
        lastActionTime = last.time || updatedAt;
      } else if (progressNote) {
        lastAction = progressNote.slice(0, 80);
      }

      // 计算空闲分钟数
      const idleMs = lastActionTime ? now - new Date(lastActionTime).getTime() : 0;
      const idleMin = Math.round(idleMs / 60000);
      const elapsedMin = createdAt ? Math.round((now - new Date(createdAt).getTime()) / 60000) : 0;
      const isStuck = idleMin >= STUCK_THRESHOLD_MIN;

      // 估算当前轮次 (execution_log 长度 + 1)
      const estimatedRound = Array.isArray(executionLog) ? executionLog.length + 1 : 1;

      return {
        id: realId,
        title: (jget(doc, 'title', '') || '').slice(0, 60),
        status,
        assignedTo,
        progress,
        estimatedRound,
        elapsedMin,
        idleMin,
        isStuck,
        lastAction: lastAction.slice(0, 120),
        lastActionTime,
      };
    });

    // 健康度评估
    const stuckTasks = tasks.filter(t => t.isStuck);
    const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
    const inReviewCount = tasks.filter(t => t.status === 'review').length;

    res.json({
      projectId,
      ts: new Date().toISOString(),
      summary: {
        totalActive: tasks.length,
        inProgress: inProgressCount,
        inReview: inReviewCount,
        stuck: stuckTasks.length,
        stuckThresholdMin: STUCK_THRESHOLD_MIN,
      },
      tasks,
    });
  } catch (e) {
    console.error('[dashboard] live error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;