// ACMS 内部操作工具集（v0.61）
// 让「小吉」能帮用户在 ACMS 内做 CRUD：建需求、审批、看板操作、看统计等
//
// 设计要点：
//   - 所有 handler 通过 ctx.user 拿登录用户身份（由 routes/agent-buddy 注入）
//   - 重要操作（审批需求、认领任务）有权限校验
//   - 副作用类操作（create/approve/claim）必须 user 确认后才调（LLM 在 reply 时先确认）
//   - 系统类操作（open_view / highlight）依赖 LLM 在 final answer 加【action:】标记
//   - meta 工具（_expand_tools / _recall_buddy_memory）走特殊流程
//
// 依赖：tool-registry（注册）、requirement-store / task-store / agent-store / user-service

const { registerTool } = require('../services/tool-registry');

// ── helpers ──

function getCtxUser(ctx) {
  return (ctx && ctx.user) || {};
}

function checkPermission(ctx, allowedWorkspaceRoles = null, allowedAuthRoles = null) {
  const u = getCtxUser(ctx);
  if (!u.id) return { ok: false, error: 'NO_USER', message: '未登录用户不能执行此操作' };
  // 优先校验 workspaceRole（pm/tech/design — 业务角色），其次 auth role（user/admin/guest — 系统角色）
  if (allowedWorkspaceRoles && !allowedWorkspaceRoles.includes(u.workspaceRole)) {
    return { ok: false, error: 'FORBIDDEN', message: `此操作需要 ${allowedWorkspaceRoles.join('/')} 角色，你是 ${u.workspaceRole || 'guest'}` };
  }
  if (allowedAuthRoles && !allowedAuthRoles.includes(u.role)) {
    return { ok: false, error: 'FORBIDDEN', message: `此操作需要 ${allowedAuthRoles.join('/')} 权限，你是 ${u.role || 'guest'}` };
  }
  return { ok: true, user: u };
}

function safeStr(v, def = '') { return (v == null ? def : String(v)); }

// 精简 req 用于 list 输出
function simplifyReq(r) {
  return {
    id: r.id, title: r.title, status: r.status, priority: r.priority,
    owner: r.owner, project_id: r.project_id, created_at: r.created_at
  };
}

function simplifyTask(t) {
  return {
    id: t.id, title: t.title, status: t.status, priority: t.priority,
    assigned_to: t.assigned_to, progress: t.progress, project_id: t.project_id
  };
}

// ════════════════════════════════════════════════
// 查询类（无副作用，权限低）
// ════════════════════════════════════════════════

registerTool({
  name: 'list_my_work',
  description: '列出我（当前登录用户）负责的所有工作项：未完成的任务 + 进行中的需求 + 最近 7 天活动数。返回字段：tasks[]/requirements[]/summary。',
  parameters: {
    type: 'object',
    properties: { limit: { type: 'number', description: '限制每个分类返回数量，默认 20' } }
  },
  async handler(args, ctx) {
    const u = getCtxUser(ctx);
    if (!u.id) return { ok: false, error: 'NO_USER', message: '未登录' };
    try {
      const { collection } = require('../db/connection');
      const limit = args.limit || 20;
      const tasks = collection('tasks').find(t => t.assigned_to === u.id && t.status !== 'done' && t.status !== 'archived').slice(0, limit);
      const reqs = collection('requirements').find(r => r.owner === u.id && ['idea', 'clarifying', 'approved', 'in_execution'].includes(r.status)).slice(0, limit);
      return {
        ok: true,
        tasks: tasks.map(simplifyTask),
        requirements: reqs.map(simplifyReq),
        summary: `你有 ${tasks.length} 个任务、${reqs.length} 个需求待处理`
      };
    } catch (e) { return { ok: false, error: 'INTERNAL', message: e.message }; }
  }
});

registerTool({
  name: 'list_my_tasks',
  description: '列出我认领的任务（按状态过滤）。返回字段：tasks[]/summary。',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', description: '过滤状态：backlog/in_progress/review/done，多个用 ; 分隔；空=全部' },
      limit: { type: 'number', description: '返回数量，默认 20' }
    }
  },
  async handler(args, ctx) {
    const u = getCtxUser(ctx);
    if (!u.id) return { ok: false, error: 'NO_USER' };
    try {
      const { collection } = require('../db/connection');
      const statusFilter = (safeStr(args.status)).split(';').filter(Boolean);
      const tasks = collection('tasks').find(t => {
        if (t.assigned_to !== u.id) return false;
        if (statusFilter.length > 0 && !statusFilter.includes(t.status)) return false;
        return true;
      }).slice(0, args.limit || 20);
      return { ok: true, tasks: tasks.map(simplifyTask), summary: `找到 ${tasks.length} 个任务` };
    } catch (e) { return { ok: false, error: 'INTERNAL', message: e.message }; }
  }
});

registerTool({
  name: 'list_board_tasks',
  description: '列出某个项目的看板任务（按 status 分组：backlog/in_progress/review/done）。适合用户在 kanban 视图时用。',
  parameters: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: '项目 ID（必填）' },
      parentId: { type: 'string', description: '父需求 ID（可选）' }
    },
    required: ['projectId']
  },
  async handler(args, ctx) {
    try {
      const { collection } = require('../db/connection');
      const tasks = collection('tasks').find(t => {
        if (args.projectId && t.project_id !== args.projectId) return false;
        if (args.parentId && t.parent_id !== args.parentId) return false;
        return true;
      });
      const board = { backlog: [], in_progress: [], review: [], done: [] };
      tasks.forEach(t => { if (board[t.status]) board[t.status].push(t); });
      const summary = `看板共 ${tasks.length} 个任务（待办 ${board.backlog.length}/进行中 ${board.in_progress.length}/审核 ${board.review.length}/完成 ${board.done.length}）`;
      return { ok: true, board, summary };
    } catch (e) { return { ok: false, error: 'INTERNAL', message: e.message }; }
  }
});

registerTool({
  name: 'search_tasks',
  description: '按关键词搜索任务（标题/描述匹配）。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词（必填）' },
      limit: { type: 'number', description: '默认 10' }
    },
    required: ['query']
  },
  async handler(args, ctx) {
    try {
      const { collection } = require('../db/connection');
      const q = safeStr(args.query).toLowerCase();
      const tasks = collection('tasks').find(t =>
        (t.title || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)
      ).slice(0, args.limit || 10);
      return { ok: true, tasks: tasks.map(simplifyTask), summary: `找到 ${tasks.length} 个匹配任务` };
    } catch (e) { return { ok: false, error: 'INTERNAL', message: e.message }; }
  }
});

registerTool({
  name: 'list_requirements',
  description: '列出需求（按 status / priority 过滤）。返回精简字段（不含 srs/structured_description 大字段）。',
  parameters: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: '项目 ID（必填）' },
      status: { type: 'string', description: 'idea/clarifying/approved/in_execution/done/rejected' },
      limit: { type: 'number', description: '默认 20' }
    },
    required: ['projectId']
  },
  async handler(args, ctx) {
    try {
      const reqStore = require('../stores/requirement-store');
      const reqs = reqStore.list({
        projectId: args.projectId,
        status: args.status,
        limit: args.limit || 20,
        lite: true
      });
      return { ok: true, requirements: reqs.map(simplifyReq), summary: `找到 ${reqs.length} 个需求` };
    } catch (e) { return { ok: false, error: 'INTERNAL', message: e.message }; }
  }
});

registerTool({
  name: 'search_requirements',
  description: '按关键词搜索需求（标题/描述匹配）。返回精简字段。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词（必填）' },
      projectId: { type: 'string', description: '限定项目（可选）' },
      limit: { type: 'number', description: '默认 10' }
    },
    required: ['query']
  },
  async handler(args, ctx) {
    try {
      const { collection } = require('../db/connection');
      const q = safeStr(args.query).toLowerCase();
      const reqs = collection('requirements').find(r => {
        if (args.projectId && r.project_id !== args.projectId) return false;
        return (r.title || '').toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q);
      }).slice(0, args.limit || 10);
      return { ok: true, requirements: reqs.map(simplifyReq), summary: `找到 ${reqs.length} 个匹配需求` };
    } catch (e) { return { ok: false, error: 'INTERNAL', message: e.message }; }
  }
});

registerTool({
  name: 'get_requirement_detail',
  description: '获取需求的完整详情（含 srs、clarifications、description、brief 等）。',
  parameters: {
    type: 'object',
    properties: { reqId: { type: 'string', description: '需求 ID（必填）' } },
    required: ['reqId']
  },
  async handler(args, ctx) {
    try {
      const reqStore = require('../stores/requirement-store');
      const req = reqStore.getById(args.reqId);
      if (!req) return { ok: false, error: 'NOT_FOUND', message: '需求不存在' };
      const clarifications = reqStore.getClarifications(args.reqId) || [];
      return { ok: true, requirement: req, clarifications, summary: `${req.title} (${req.status})` };
    } catch (e) { return { ok: false, error: 'INTERNAL', message: e.message }; }
  }
});

registerTool({
  name: 'list_bugs',
  description: '列出缺陷（按 status / severity 过滤）。',
  parameters: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: '项目 ID' },
      status: { type: 'string', description: 'open/in_progress/fixed/closed' },
      severity: { type: 'string', description: 'low/medium/high/critical' },
      limit: { type: 'number', description: '默认 20' }
    }
  },
  async handler(args, ctx) {
    try {
      const { collection } = require('../db/connection');
      const bugs = collection('bugs').find(b => {
        if (args.projectId && b.project_id !== args.projectId) return false;
        if (args.status && b.status !== args.status) return false;
        if (args.severity && b.severity !== args.severity) return false;
        return true;
      }).slice(0, args.limit || 20);
      return { ok: true, bugs, summary: `找到 ${bugs.length} 个缺陷` };
    } catch (e) { return { ok: false, error: 'INTERNAL', message: e.message }; }
  }
});

registerTool({
  name: 'list_agents',
  description: '列出已注册的智能体（agent）。返回 id/name/type/roles/status。',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', description: '空闲/工作中等状态过滤' },
      type: { type: 'string', description: '类型过滤' }
    }
  },
  async handler(args, ctx) {
    try {
      const { collection } = require('../db/connection');
      const agents = collection('agents').find(a => {
        if (args.status && a.status !== args.status) return false;
        if (args.type && a.type !== args.type) return false;
        return true;
      });
      return {
        ok: true,
        agents: agents.map(a => ({ id: a.id, name: a.name, type: a.type, roles: a.roles, status: a.status })),
        summary: `共 ${agents.length} 个 agent`
      };
    } catch (e) { return { ok: false, error: 'INTERNAL', message: e.message }; }
  }
});

registerTool({
  name: 'get_dashboard_stats',
  description: '获取项目 dashboard 4 张卡数据：本周健康度（完成/失败/进行中）+ 效率指标（平均轮次/耗时）+ 成本统计（token + 金额）+ 异常 Top 3。返回完整 stats 对象。',
  parameters: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: '项目 ID（必填）' },
      weeksAgo: { type: 'number', description: '看 N 周前数据，默认 0（本周）' }
    },
    required: ['projectId']
  },
  async handler(args, ctx) {
    if (!args.projectId) return { ok: false, error: 'MISSING_PROJECT_ID' };
    // 走内部 HTTP（避免重复 dashboard.js 的 DB 查询逻辑）
    return new Promise((resolve) => {
      try {
        const http = require('http');
        const port = process.env.PORT || 3301;
        const url = `/api/dashboard/stats?projectId=${encodeURIComponent(args.projectId)}&weeksAgo=${args.weeksAgo || 0}`;
        const headers = {};
        // 透传调用方 authorization（如果 routes/agent-buddy 把它放进 ctx）
        if (ctx.userToken) headers['Authorization'] = `Bearer ${ctx.userToken}`;
        else if (ctx.apiKey) headers['X-API-Key'] = ctx.apiKey;
        const req = http.get({ host: '127.0.0.1', port, path: url, headers, timeout: 5000 }, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              resolve({ ok: true, stats: json, summary: 'dashboard 数据已拉取' });
            } catch (e) {
              resolve({ ok: false, error: 'PARSE_FAIL', message: `dashboard 响应解析失败: ${e.message}, data=${data.slice(0, 200)}` });
            }
          });
        });
        req.on('error', e => resolve({ ok: false, error: 'HTTP_FAIL', message: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'TIMEOUT', message: 'dashboard 超时 5s' }); });
      } catch (e) { resolve({ ok: false, error: 'INTERNAL', message: e.message }); }
    });
  }
});

registerTool({
  name: 'list_recent_events',
  description: '列出最近 N 条系统事件（user/agent 行为记录）。',
  parameters: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: '项目 ID（可选，不传=全平台）' },
      limit: { type: 'number', description: '默认 20' }
    }
  },
  async handler(args, ctx) {
    try {
      const { collection } = require('../db/connection');
      let events = collection('events').find(() => true);
      if (args.projectId) events = events.filter(e => e.project_id === args.projectId);
      events = events.slice(-1 * (args.limit || 20)).reverse();
      return {
        ok: true,
        events: events.map(e => ({ id: e.id, type: e.type, actor: e.actor, target: e.target, ts: e.ts || e.created_at })),
        summary: `最近 ${events.length} 条事件`
      };
    } catch (e) { return { ok: false, error: 'INTERNAL', message: e.message }; }
  }
});

registerTool({
  name: 'list_users',
  description: '列出 ACMS 所有用户（仅 admin 权限可见完整列表，PM 看到仅自己 + 直接协作的）。',
  parameters: {
    type: 'object',
    properties: { limit: { type: 'number', description: '默认 50' } }
  },
  async handler(args, ctx) {
    try {
      const { collection } = require('../db/connection');
      const allUsers = collection('users').find(() => true);
      const isAdmin = getCtxUser(ctx).role === 'admin';
      const visibleUsers = isAdmin ? allUsers : allUsers.filter(u => getCtxUser(ctx).id === u.id || ['pm', 'tech', 'design'].includes(u.workspaceRole));
      return {
        ok: true,
        users: visibleUsers.slice(0, args.limit || 50).map(u => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role, workspaceRole: u.workspaceRole })),
        summary: `${isAdmin ? '管理员视图' : '协作视图'} 共 ${visibleUsers.length} 个用户`
      };
    } catch (e) { return { ok: false, error: 'INTERNAL', message: e.message }; }
  }
});

// ════════════════════════════════════════════════
// 写操作类（PM / Tech 权限校验）
// ════════════════════════════════════════════════

registerTool({
  name: 'create_requirement',
  description: '创建一个新需求。需要 PM 权限或 admin 权限。创建后会自动跑简报生成（非阻塞）。',
  parameters: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: '项目 ID（必填）' },
      title: { type: 'string', description: '需求标题（必填，简洁明确）' },
      description: { type: 'string', description: '需求详细描述（必填）' },
      priority: { type: 'string', description: 'low/medium/high/urgent，默认 medium' },
      tags: { type: 'array', items: { type: 'string' }, description: '标签数组（可选）' }
    },
    required: ['projectId', 'title', 'description']
  },
  async handler(args, ctx) {
    const perm = checkPermission(ctx, ['pm', 'design'], ['user', 'admin']);
    if (!perm.ok) return perm;
    try {
      const reqStore = require('../stores/requirement-store');
      const req = reqStore.create({
        projectId: args.projectId,
        title: args.title,
        description: args.description,
        priority: args.priority || 'medium',
        tags: JSON.stringify(args.tags || []),
        owner: perm.user.id,
        createdBy: perm.user.id
      });
      return { ok: true, requirement: simplifyReq(req), summary: `需求「${req.title}」已创建（ID: ${req.id}）`, _action: 'open_view:detail', _actionArg: { reqId: req.id } };
    } catch (e) { return { ok: false, error: 'CREATE_FAILED', message: e.message }; }
  }
});

registerTool({
  name: 'approve_requirement',
  description: '审批通过一个需求（status → approved）。需要 PM 权限，且需求当前在 idea/clarifying 状态。',
  parameters: {
    type: 'object',
    properties: { reqId: { type: 'string', description: '需求 ID（必填）' } },
    required: ['reqId']
  },
  async handler(args, ctx) {
    const perm = checkPermission(ctx, ['pm'], ['user', 'admin']);
    if (!perm.ok) return perm;
    try {
      const reqStore = require('../stores/requirement-store');
      const req = reqStore.getById(args.reqId);
      if (!req) return { ok: false, error: 'NOT_FOUND', message: '需求不存在' };
      if (!['idea', 'clarifying'].includes(req.status)) {
        return { ok: false, error: 'INVALID_STATUS', message: `只能审批 idea/clarifying 状态的需求，当前是 ${req.status}` };
      }
      const updated = reqStore.transition(args.reqId, 'approved', { id: perm.user.id, type: 'human' });
      if (updated.error) return { ok: false, error: updated.error, message: updated.message };
      return { ok: true, requirement: simplifyReq(updated), summary: `需求「${updated.title}」已审批通过` };
    } catch (e) { return { ok: false, error: 'APPROVE_FAILED', message: e.message }; }
  }
});

registerTool({
  name: 'reject_requirement',
  description: '驳回一个需求。需要 PM 权限，且 feedback 至少 10 字（明确告诉作者问题）。',
  parameters: {
    type: 'object',
    properties: {
      reqId: { type: 'string', description: '需求 ID（必填）' },
      feedback: { type: 'string', description: '驳回理由（至少 10 字）' }
    },
    required: ['reqId', 'feedback']
  },
  async handler(args, ctx) {
    const perm = checkPermission(ctx, ['pm'], ['user', 'admin']);
    if (!perm.ok) return perm;
    if (!args.feedback || String(args.feedback).trim().length < 10) {
      return { ok: false, error: 'FEEDBACK_TOO_SHORT', message: '驳回理由至少 10 字，请明确告诉作者问题在哪' };
    }
    try {
      const reqStore = require('../stores/requirement-store');
      const updated = reqStore.transition(args.reqId, 'rejected', { id: perm.user.id, type: 'human' });
      if (updated.error) return { ok: false, error: updated.error, message: updated.message };
      // 记录 feedback（v0.X: 简化为写到 supplement_history）
      try {
        const existing = JSON.parse(updated.supplement_history || '[]');
        existing.push({ type: 'pm_feedback', feedback: args.feedback, ts: new Date().toISOString(), actor: perm.user.id });
        reqStore.update(args.reqId, { supplement_history: JSON.stringify(existing) });
      } catch (_) { /* 非关键 */ }
      return { ok: true, requirement: simplifyReq(updated), feedback: args.feedback, summary: `需求「${updated.title}」已驳回` };
    } catch (e) { return { ok: false, error: 'REJECT_FAILED', message: e.message }; }
  }
});

registerTool({
  name: 'add_clarification',
  description: '给需求添加一个澄清问题。',
  parameters: {
    type: 'object',
    properties: {
      reqId: { type: 'string', description: '需求 ID（必填）' },
      question: { type: 'string', description: '澄清问题（必填）' }
    },
    required: ['reqId', 'question']
  },
  async handler(args, ctx) {
    const perm = checkPermission(ctx);
    if (!perm.ok) return perm;
    try {
      const reqStore = require('../stores/requirement-store');
      reqStore.addClarificationQuestion(args.reqId, { question: args.question, askedBy: perm.user.id });
      reqStore.addClarification(args.reqId, { role: 'agent', agentId: perm.user.id, content: args.question });
      return { ok: true, summary: `已为需求添加澄清问题: ${args.question}` };
    } catch (e) { return { ok: false, error: 'INTERNAL', message: e.message }; }
  }
});

registerTool({
  name: 'claim_task',
  description: '认领一个任务（assigned_to = 当前用户）。需要任务处于 backlog 状态。',
  parameters: {
    type: 'object',
    properties: { taskId: { type: 'string', description: '任务 ID（必填）' } },
    required: ['taskId']
  },
  async handler(args, ctx) {
    const perm = checkPermission(ctx, null, ['user', 'admin']);
    if (!perm.ok) return perm;
    try {
      const taskStore = require('../stores/task-store');
      const result = taskStore.claim(args.taskId, perm.user.id);
      if (result.error) return { ok: false, error: result.error, message: result.message || '认领失败' };
      return { ok: true, task: simplifyTask(result), summary: `已认领任务「${result.title}」` };
    } catch (e) { return { ok: false, error: 'CLAIM_FAILED', message: e.message }; }
  }
});

registerTool({
  name: 'update_task_progress',
  description: '更新任务的进度（0-100）和备注。仅认领人可以更新。',
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: '任务 ID（必填）' },
      progress: { type: 'number', description: '新进度（0-100，必填）' },
      note: { type: 'string', description: '进度备注（可选）' }
    },
    required: ['taskId', 'progress']
  },
  async handler(args, ctx) {
    const perm = checkPermission(ctx);
    if (!perm.ok) return perm;
    if (typeof args.progress !== 'number' || args.progress < 0 || args.progress > 100) {
      return { ok: false, error: 'INVALID_PROGRESS', message: 'progress 必须是 0-100 的数字' };
    }
    try {
      const taskStore = require('../stores/task-store');
      const task = taskStore.updateProgress(args.taskId, { progress: args.progress, note: args.note });
      if (!task) return { ok: false, error: 'NOT_FOUND', message: '任务不存在' };
      return { ok: true, task: simplifyTask(task), summary: `任务「${task.title}」进度已更新为 ${args.progress}%` };
    } catch (e) { return { ok: false, error: 'UPDATE_FAILED', message: e.message }; }
  }
});

registerTool({
  name: 'update_task_status',
  description: '更新任务状态。流转规则：backlog→in_progress→review→done；backlog→review；任意→rejected。',
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: '任务 ID（必填）' },
      status: { type: 'string', description: '新状态（必填）：backlog/in_progress/review/done/rejected' },
      note: { type: 'string', description: '状态变更备注（可选）' }
    },
    required: ['taskId', 'status']
  },
  async handler(args, ctx) {
    const perm = checkPermission(ctx);
    if (!perm.ok) return perm;
    const valid = ['backlog', 'in_progress', 'review', 'done', 'rejected'];
    if (!valid.includes(args.status)) {
      return { ok: false, error: 'INVALID_STATUS', message: `status 必须是 ${valid.join('/')} 之一` };
    }
    try {
      const taskStore = require('../stores/task-store');
      const task = taskStore.update(args.taskId, { status: args.status });
      if (!task) return { ok: false, error: 'NOT_FOUND', message: '任务不存在' };
      return { ok: true, task: simplifyTask(task), summary: `任务「${task.title}」状态已改为 ${args.status}` };
    } catch (e) { return { ok: false, error: 'UPDATE_FAILED', message: e.message }; }
  }
});

registerTool({
  name: 'submit_task',
  description: '提交任务成果（标记为 review 状态，进入审核流程）。',
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: '任务 ID（必填）' },
      notes: { type: 'string', description: '提交说明（可选）' }
    },
    required: ['taskId']
  },
  async handler(args, ctx) {
    const perm = checkPermission(ctx);
    if (!perm.ok) return perm;
    try {
      const taskStore = require('../stores/task-store');
      const result = taskStore.submit(args.taskId, { agentId: perm.user.id, notes: args.notes });
      if (result.error) return { ok: false, error: result.error, message: result.message };
      return { ok: true, task: simplifyTask(result), summary: `任务「${result.title}」已提交审核` };
    } catch (e) { return { ok: false, error: 'SUBMIT_FAILED', message: e.message }; }
  }
});

// ════════════════════════════════════════════════
// 系统类（前端联动，依赖 LLM final answer 加【action:】标记）
// ════════════════════════════════════════════════

registerTool({
  name: 'open_view',
  description: '打开 ACMS 某个视图窗口（如 kanban/requirements/bugs/dashboard/chat）。前端会执行 ACMSWin.open(targetView)。LLM 收到 tool result 后应在 final answer 加【action:open_view:xxx】标记。',
  parameters: {
    type: 'object',
    properties: {
      view: { type: 'string', description: '视图名（必填）：kanban/requirements/bugs/dashboard/chat/admin/agents/...，对应 ACMSWin.registerViewLoader 的 name' }
    },
    required: ['view']
  },
  async handler(args, ctx) {
    if (!args.view) return { ok: false, error: 'MISSING_VIEW' };
    // tool 不直接打开窗口（前端才有 ACMSWin）；返回 hint 让 LLM 在 final answer 加 action 标记
    return {
      ok: true,
      _viewHint: args.view,
      summary: `请在 final answer 末尾加【action:open_view:${args.view}】，前端会打开对应窗口`,
      hintForLLM: `你调用了 open_view(${args.view})。请在你的回复末尾加一行：\\n\\n【action:open_view:${args.view}】\\n\\n前端会识别这个标记并打开「${args.view}」窗口给用户看。`
    };
  }
});

registerTool({
  name: 'highlight_element',
  description: '在某个 DOM 元素上做 3 秒高亮（前端执行）。',
  parameters: {
    type: 'object',
    properties: { elementId: { type: 'string', description: 'DOM 元素 ID（必填）' } },
    required: ['elementId']
  },
  async handler(args, ctx) {
    if (!args.elementId) return { ok: false, error: 'MISSING_ELEMENT_ID' };
    return {
      ok: true,
      hintForLLM: `请在 final answer 末尾加【action:highlight:${args.elementId}】，前端会高亮该元素 3 秒`
    };
  }
});

// ════════════════════════════════════════════════
// Meta 工具（LLM 自调用，不做事，只调整 prompt）
// ════════════════════════════════════════════════

registerTool({
  name: '_expand_tools',
  description: '【meta 工具】让下一轮 chat 加载更多类别的工具。当用户要做的事不在当前注入的 5-10 个 tool 范围内时调用。返回 ok=true 后，下一轮 prompt 会包含该 category 的所有 tool。',
  parameters: {
    type: 'object',
    properties: {
      category: { type: 'string', description: '要扩载的 category：requirement/task/bug/agent/window/system/dashboard' }
    },
    required: ['category']
  },
  async handler(args, ctx) {
    const validCats = ['requirement', 'task', 'bug', 'agent', 'window', 'system', 'dashboard'];
    if (!validCats.includes(args.category)) {
      return { ok: false, error: 'INVALID_CATEGORY', message: `category 必须是 ${validCats.join('/')} 之一`, validCategories: validCats };
    }
    // 写入 ctx.expandedCategories（route handler 会把它存到 session/记忆）
    if (!ctx.expandedCategories) ctx.expandedCategories = [];
    if (!ctx.expandedCategories.includes(args.category)) ctx.expandedCategories.push(args.category);
    return {
      ok: true,
      expandedCategory: args.category,
      message: `下一轮我会把 ${args.category} 类别的所有工具给你。现在你可以用这些新工具继续帮用户。`,
      hintForLLM: `你调用了 _expand_tools(${args.category})。这些新工具现在可用了，请继续帮用户完成需求。`
    };
  }
});

registerTool({
  name: '_recall_buddy_memory',
  description: '【meta 工具】从后端持久化记忆里回忆某项历史信息（用户的偏好/历史决策/过去对话摘要）。',
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: '要回忆的 key（必填）：personality / user_views / recent_decisions / ...' }
    },
    required: ['key']
  },
  async handler(args, ctx) {
    const u = getCtxUser(ctx);
    if (!u.id) return { ok: false, error: 'NO_USER' };
    try {
      const { collection } = require('../db/connection');
      const mem = collection('buddy_memory').findOne(m => m.user_id === u.id && m.key === args.key);
      if (!mem) return { ok: true, value: null, summary: `记忆 key "${args.key}" 还没有值（首次访问）` };
      return { ok: true, value: typeof mem.value === 'string' ? JSON.parse(mem.value) : mem.value, summary: `已回忆 ${args.key}` };
    } catch (e) { return { ok: false, error: 'INTERNAL', message: e.message }; }
  }
});

// ════════════════════════════════════════════════════════════
// v0.62 新增：管家通用查询 tool（query_collection）
// 设计目标：从「菜单制」→「管家制」——任何数据问题都能直接查
// C2 enrich：自动附 total（全集数）+ recent_7d（7 天新增）+ returned_count
// 安全：白名单 + 敏感字段黑名单强制脱敏（即使 LLM 显式要 password 也剥）
// ════════════════════════════════════════════════════════════

// 管家可读 collection 白名单（业务数据；高敏感系统内部集合明确排除）
const READABLE_COLLECTIONS = [
  'projects', 'project_members', 'project_environments',
  'requirements', 'clarification_threads',
  'tasks', 'agents', 'events',
  'users', 'webhooks', 'knowledge_files', 'requirement_knowledge',
  'llm_models', 'skills', 'generators'
];

// 敏感字段黑名单（无论 LLM 是否指定 fields，强制脱敏）
const SENSITIVE_FIELDS = new Set([
  'password', 'passwd', 'pwd', 'pass',
  'token', 'access_token', 'refresh_token', 'session_token',
  'apiKey', 'api_key', 'apiKeyHash', 'api_key_hash',
  'secret', 'client_secret', 'webhook_secret',
  'authorization', 'private_key', 'credentials'
]);

function stripSensitiveFields(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const cleaned = {};
  for (const [k, v] of Object.entries(doc)) {
    if (SENSITIVE_FIELDS.has(k)) {
      cleaned[k] = '[已脱敏]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      cleaned[k] = stripSensitiveFields(v);
    } else {
      cleaned[k] = v;
    }
  }
  return cleaned;
}

function applyWhereFilter(rows, where) {
  if (!where || typeof where !== 'object' || Object.keys(where).length === 0) return rows;
  return rows.filter(row => {
    for (const [field, expected] of Object.entries(where)) {
      if (row[field] !== expected) return false;
    }
    return true;
  });
}

function applyOrderBy(rows, orderBy) {
  if (!orderBy || typeof orderBy !== 'string') return rows;
  const desc = orderBy.startsWith('-');
  const field = desc ? orderBy.slice(1) : orderBy;
  return [...rows].sort((a, b) => {
    const av = a[field], bv = b[field];
    if (av === bv) return 0;
    if (av === undefined || av === null) return 1;
    if (bv === undefined || bv === null) return -1;
    return desc ? (av < bv ? 1 : -1) : (av < bv ? -1 : 1);
  });
}

function pickFields(rows, fields) {
  if (!Array.isArray(fields) || fields.length === 0) return rows;
  return rows.map(row => {
    const picked = {};
    for (const f of fields) {
      if (f in row) picked[f] = row[f];
    }
    return picked;
  });
}

// C2 enrich：自动附 total + recent_7d
function enrichCollectionSummary(collName) {
  const result = {};
  try {
    const { collection } = require('../db/connection');
    const all = collection(collName).all();
    result.total = all.length;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    result.recent_7d = all.filter(d => {
      const ts = d.created_at || d.createdAt || d.ts || d.created || d.updated_at;
      if (!ts) return false;
      const t = new Date(ts).getTime();
      return !isNaN(t) && t >= sevenDaysAgo;
    }).length;
  } catch (e) {
    result.total = -1;
    result.recent_7d = -1;
  }
  return result;
}

registerTool({
  name: 'query_collection',
  description: '【管家通用查询·L0 常驻】查 ACMS 任意业务 collection 的数据。回答"X 有多少""Y 的列表""Z 的状态"等管家问题时**优先用这个**。返回会自动附 total（集合总数）+ recent_7d（7 天内新增）+ returned_count（本批返回）。',
  parameters: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description: 'collection 名。可读：projects / project_members / project_environments / requirements / clarification_threads / tasks / agents / events / users / webhooks / knowledge_files / requirement_knowledge / llm_models / skills / generators'
      },
      where: {
        type: 'object',
        description: '字段过滤（AND 多条件），例：{"system_project": false, "status": "active"}。空对象=查全部。',
        default: {}
      },
      fields: {
        type: 'array',
        description: '要返回的字段名列表，例：["id","name"]。空=全部（敏感字段已自动脱敏）。',
        default: []
      },
      limit: {
        type: 'number',
        description: '最多返回几条，默认 20，最大 100。',
        default: 20
      },
      order_by: {
        type: 'string',
        description: '排序字段，- 前缀表降序。例：-created_at（最新在前）。',
        default: '-created_at'
      }
    },
    required: ['collection']
  },
  async handler(args, ctx) {
    try {
      // 1. 白名单校验
      if (!READABLE_COLLECTIONS.includes(args.collection)) {
        return {
          ok: false,
          error: 'COLLECTION_NOT_READABLE',
          message: `"${args.collection}" 不在管家可读列表（高敏感内部集合禁止）。可读：${READABLE_COLLECTIONS.join(', ')}`,
          readableCollections: READABLE_COLLECTIONS
        };
      }

      // 2. 查数据 + 过滤/排序/字段裁剪
      const { collection } = require('../db/connection');
      const allRows = collection(args.collection).all();
      let rows = applyWhereFilter(allRows, args.where || {});
      rows = applyOrderBy(rows, args.order_by);
      rows = pickFields(rows, args.fields);

      const limit = Math.min(Math.max(args.limit || 20, 1), 100);
      const sliced = rows.slice(0, limit);

      // 3. 敏感字段脱敏（即便 LLM 显式要 password 也强制剥）
      const sanitized = sliced.map(stripSensitiveFields);

      // 4. C2 enrich
      const enrich = enrichCollectionSummary(args.collection);

      return {
        ok: true,
        collection: args.collection,
        data: sanitized,
        returned_count: sanitized.length,
        total: enrich.total,
        recent_7d: enrich.recent_7d,
        summary: `${args.collection}：共 ${enrich.total} 条，本批返回 ${sanitized.length} 条，7 天内新增 ${enrich.recent_7d} 条`
      };
    } catch (e) {
      return { ok: false, error: 'INTERNAL', message: e.message };
    }
  }
});

// ═══════════════════════════════════════════════════════════
// search_history — 搜索历史任务和事件（跨 session 经验检索）
//   让小吉和 task-agent 能查之前做过的类似任务
// ═══════════════════════════════════════════════════════════
registerTool({
  name: 'search_history',
  description: '搜索历史任务和系统事件。可以通过关键词找到之前做过的类似任务及其结果。'
    + ' 关键词越长越精确。返回最多 10 条匹配记录，包含任务标题、状态、总结。'
    + ' 示例: search_history({q: "shell escape"}) — 搜索跟 shell 转义相关的历史任务。'
    + ' search_history({q: "CSS 缓存", limit: 5}) — 搜 CSS 缓存问题。',
  parameters: {
    type: 'object',
    properties: {
      q: { type: 'string', description: '搜索关键词（必填）。搜任务标题、描述、执行日志。支持空格分隔的多关键词。' },
      limit: { type: 'number', description: '最大返回条数（默认 5，最多 10）', default: 5 },
    },
    required: ['q'],
  },
  async handler(args, ctx = {}) {
    const q = (args.q || '').trim().toLowerCase();
    const limit = Math.min(args.limit || 5, 10);
    if (!q) return { ok: false, error: 'NO_QUERY', message: '请输入搜索关键词' };

    try {
      const { collection } = require('../db/connection');
      const tasks = collection('tasks').all() || [];

      const keywords = q.split(/\s+/).filter(Boolean);
      const matched = tasks
        .map(function(t) {
          const text = ((t.title || '') + ' ' + (t.description || '') + ' ' + (t.execution_log || '') + ' ' + (JSON.stringify(t.submissions || '[]'))).toLowerCase();
          const score = keywords.filter(function(k) { return text.includes(k); }).length;
          return { task: t, score };
        })
        .filter(function(m) { return m.score > 0; })
        .sort(function(a, b) { return b.score - a.score; })
        .slice(0, limit);

      // 也搜 events 表
      let eventResults = [];
      try {
        var events = collection('events').all() || [];
        eventResults = events
          .filter(function(e) {
            var payloadStr = (typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload || '')).toLowerCase();
            return keywords.some(function(k) { return payloadStr.includes(k); });
          })
          .slice(-5)
          .map(function(e) { return { type: e.type, ts: new Date(e.timestamp).toISOString().slice(0, 19), summary: ((e.payload || '') + '').slice(0, 200) }; });
      } catch (e) { /* 非关键 */ }

      return {
        ok: true,
        total: matched.length,
        tasks: matched.map(function(m) {
          var t = m.task;
          var logs = [];
          try { logs = JSON.parse(t.execution_log || '[]').slice(-3).map(function(l) { return l.note; }); } catch (e) {}
          return {
            id: t.id,
            title: t.title || '',
            status: t.status || 'unknown',
            progress: t.progress || 0,
            lastLog: logs[logs.length - 1] || '',
            score: m.score,
          };
        }),
        events: eventResults.length > 0 ? eventResults : undefined,
      };
    } catch (e) {
      return { ok: false, error: 'SEARCH_FAILED', message: e.message };
    }
  },
});

console.log('[tools/acms-internal] 注册完成:', '26 个 ACMS 内部操作工具（查询 12 + 写 8 + 系统 2 + meta 2 + 管家通用 1 + 历史搜索 1）');