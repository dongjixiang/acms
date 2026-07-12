// 自我改进 API 路由
const express = require('express');
const router = express.Router();
const reportStore = require('../stores/improvement-report-store');

// 从请求头提取用户身份（轻量实现：透传客户端声明，未来接真实用户系统时替换此处）
function extractUser(req) {
  return {
    userId:   req.header('X-User-Id')   || '',
    userName: req.header('X-User-Name') || 'anonymous',
    role:     req.header('X-User-Role') || 'anonymous',
  };
}

// 获取自我改进项目信息
router.get('/project', (req, res) => {
  const { collection } = require('../db/connection');
  const proj = collection('projects').findOne(p => p.system_project === 1);
  if (!proj) return res.status(404).json({ error: 'SELF_IMPROVEMENT_PROJECT_NOT_FOUND' });
  // 补充项目的任务统计
  const taskStore = require('../stores/task-store');
  const board = taskStore.getBoard(proj.id);
  const totalTasks = Object.values(board).reduce((s, arr) => s + (arr?.length || 0), 0);
  const inProgress = board.in_progress?.length || 0;
  const done = board.done?.length || 0;
  res.json({ ...proj, taskStats: { total: totalTasks, inProgress, done } });
});

// 获取改进报告列表（支持 ?status= 和 ?sourceType=idea/bug/postmortem/clarify 过滤）
router.get('/reports', (req, res) => {
  const { status, sourceType } = req.query;
  const reports = reportStore.list({ status: status || null, sourceType: sourceType || null });
  res.json(reports);
});

// 获取单个报告
router.get('/reports/:id', (req, res) => {
  const report = reportStore.getById(req.params.id);
  if (!report) return res.status(404).json({ error: 'REPORT_NOT_FOUND' });
  // 解析 JSON 字段
  res.json({
    ...report,
    improvements: (() => { try { return JSON.parse(report.improvements || '[]'); } catch { return []; } })(),
    root_cause: (() => { try { return JSON.parse(report.root_cause || '{}'); } catch { return {}; } })(),
  });
});

// 审核改进报告
router.post('/reports/:id/review', (req, res) => {
  const { verdict, feedback } = req.body;
  if (!verdict || !['approved', 'declined'].includes(verdict)) {
    return res.status(400).json({ error: 'INVALID_VERDICT', message: 'verdict 必须为 approved 或 declined' });
  }
  const result = reportStore.review(req.params.id, { verdict, feedback: feedback || '' });
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// 删除改进报告（含 idea 类型）— 不可逆
router.delete('/reports/:id', (req, res) => {
  const deleted = reportStore.delete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'REPORT_NOT_FOUND', message: `报告 ${req.params.id} 不存在` });
  res.json({ ok: true, id: deleted.id, source_type: deleted.source_type, status: deleted.status });
});

// 获取自我改进项目的任务看板
router.get('/board', (req, res) => {
  const board = reportStore.getBoard();
  res.json(board);
});

// === 想法（idea）端点 ===
// 客户端提交流：任何用户/agent 都能提交，自动带上来源身份

// 提交一条想法
router.post('/ideas', (req, res) => {
  const { title, content, summary, sourceContext, improvements, severity, sourceUserId, sourceUserName, sourceRole } = req.body || {};
  if (!title && !content) {
    return res.status(400).json({ error: 'EMPTY_IDEA', message: 'title 和 content 至少要有一个' });
  }

  // 优先用 body 显式传的 sourceUserId/Role，否则从 header 推断
  const headerUser = extractUser(req);
  const idea = reportStore.createIdea({
    title: title || (content || '').substring(0, 40),
    content: content || '',
    summary,
    sourceUserId:   sourceUserId   || headerUser.userId,
    sourceUserName: sourceUserName || headerUser.userName,
    sourceRole:     sourceRole     || headerUser.role,
    sourceContext,
    improvements,
    severity,
  });
  res.status(201).json(idea);
});

// 列出想法
router.get('/ideas', (req, res) => {
  const { status, sourceUserId, sourceRole } = req.query;
  const ideas = reportStore.listIdeas({ status, sourceUserId, sourceRole });
  res.json(ideas);
});

// 合并多条想法
router.post('/ideas/merge', (req, res) => {
  const { sourceIds, ...mergedData } = req.body || {};
  if (!Array.isArray(sourceIds) || sourceIds.length < 2) {
    return res.status(400).json({ error: 'NEED_AT_LEAST_TWO_IDS' });
  }
  const headerUser = extractUser(req);
  const result = reportStore.mergeIdeas(sourceIds, {
    ...mergedData,
    sourceUserId:   mergedData.sourceUserId   || headerUser.userId,
    sourceUserName: mergedData.sourceUserName || headerUser.userName,
    sourceRole:     mergedData.sourceRole     || headerUser.role,
  });
  if (result.error) {
    const statusCode = result.error === 'ONLY_PENDING_CAN_BE_MERGED' ? 409 : 400;
    return res.status(statusCode).json(result);
  }
  res.status(201).json(result);
});

// 想法统计：按来源/状态聚合（给自我改进项目 dashboard 用）
router.get('/ideas/stats', (req, res) => {
  const all = reportStore.listIdeas();
  const byStatus = {};
  const byRole = {};
  const byUser = {};
  for (const r of all) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    const role = r.source_role || 'anonymous';
    byRole[role] = (byRole[role] || 0) + 1;
    if (r.source_user_id) {
      const k = `${r.source_user_name || r.source_user_id} (${r.source_role || '?'})`;
      byUser[k] = (byUser[k] || 0) + 1;
    }
  }
  res.json({ total: all.length, byStatus, byRole, byUser });
});

module.exports = router;
