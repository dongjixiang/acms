// 任务 API 路由
const express = require('express');
const router = express.Router();
const taskStore = require('../stores/task-store');
const eventBus = require('../services/event-bus');

// 创建任务
router.post('/', (req, res) => {
  const { projectId, parentId, title, description, type, priority, requiredSkills, estimatedHours, dependsOn, dependsContract, wikiContext, linkedWiki } = req.body;
  if (!projectId || !title) return res.status(400).json({ error: 'MISSING_FIELDS' });

  // 依赖环检测
  if (dependsOn && dependsOn.length > 0) {
    const cycle = taskStore.detectCycle(null, dependsOn);
    if (cycle) return res.status(400).json({ error: 'CIRCULAR_DEPENDENCY', message: '检测到依赖环' });
  }

  const task = taskStore.create({ projectId, parentId, title, description, type, priority, requiredSkills, estimatedHours, dependsOn, dependsContract, wikiContext, linkedWiki });

  eventBus.emit('task.created', {
    projectId, actor: { id: req.agentId || 'system', type: 'agent' },
    target: { type: 'task', id: task.id }, payload: { task },
  });

  res.status(201).json(task);
});

// 任务列表/看板
router.get('/', (req, res) => {
  const { projectId, parentId, status, assignedTo, board, limit, offset } = req.query;
  if (board === 'true') {
    return res.json(taskStore.getBoard(projectId, parentId));
  }
  res.json(taskStore.list({ projectId, parentId, status, assignedTo, limit: parseInt(limit) || 100, offset: parseInt(offset) || 0 }));
});

// 任务详情
router.get('/:id', (req, res) => {
  const task = taskStore.getById(req.params.id);
  if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
  res.json(task);
});

// 认领任务
router.post('/:id/claim', (req, res) => {
  const { agentId } = req.body;
  const claimId = agentId || req.agentId;
  if (!claimId) return res.status(400).json({ error: 'MISSING_AGENT_ID' });

  // 检查依赖
  if (!taskStore.areDependenciesMet(req.params.id)) {
    return res.status(400).json({ error: 'TASK_BLOCKED', message: '前置依赖未完成' });
  }

  const result = taskStore.claim(req.params.id, claimId);
  if (result.error) return res.status(409).json(result);

  eventBus.emit('task.claimed', {
    projectId: result.project_id, actor: { id: claimId, type: 'agent' },
    target: { type: 'task', id: result.id }, payload: { task: result },
  });

  res.json(result);
});

// 更新进度
router.post('/:id/progress', (req, res) => {
  const { progress, note } = req.body;
  if (progress === undefined) return res.status(400).json({ error: 'MISSING_PROGRESS' });
  const task = taskStore.updateProgress(req.params.id, { progress, note });
  if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
  res.json(task);
});

// 切换自动审核开关
router.patch('/:id/auto-review', async (req, res, next) => {
  const { enabled } = req.body;
  const task = taskStore.getById(req.params.id);
  if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
  taskStore.update(req.params.id, { auto_review: enabled ? 1 : 0 });
  res.json({ id: req.params.id, auto_review: enabled ? 1 : 0 });
});

// P0 v0.X: 切换 execution_mode — 'auto' / 'plan_first' / 'manual'
router.patch('/:id/execution-mode', async (req, res, next) => {
  const { mode } = req.body;
  if (!['auto', 'plan_first', 'manual'].includes(mode)) {
    return res.status(400).json({ error: 'INVALID_MODE', message: 'mode 必须是 auto / plan_first / manual 之一' });
  }
  const task = taskStore.getById(req.params.id);
  if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
  taskStore.update(req.params.id, { execution_mode: mode, updated_at: new Date().toISOString() });
  res.json({ id: req.params.id, execution_mode: mode });
});

// 提交成果 — 如果 auto_review=1，自动触发 Reviewer Agent 审核
router.post('/:id/submit', async (req, res, next) => {
  const { agentId, files, diff, testResult, notes } = req.body;
  const result = taskStore.submit(req.params.id, { agentId: agentId || req.agentId, files, diff, testResult, notes });
  if (result.error) return res.status(400).json(result);

  eventBus.emit('task.submitted', {
    projectId: result.project_id, actor: { id: agentId || req.agentId, type: 'agent' },
    target: { type: 'task', id: result.id }, payload: { task: result },
  });

  res.json(result);
});

// 审核（包含自动验收）
router.post('/:id/review', async (req, res, next) => {
  const { verdict, feedback, reviewedBy } = req.body;
  if (!verdict || !['approved', 'rejected'].includes(verdict)) return res.status(400).json({ error: 'INVALID_VERDICT' });

  // P0 v0.X: 驳回必填理由（min 10 字）— 给 agent 明确信号，防"空 feedback 死循环"
  //   通过不要求 feedback；驳回强制最少 10 字，后端兜底防前端绕过
  //   MCP agent 调 review tool 也走这条路由，agent 失败时会被拦在 server 层
  //   例外：system 内部自动审核（autoReview=true 走 reviewService 流水线）这条不卡，因为 autoVerdict 会被 reviewReport 覆盖
  if (verdict === 'rejected' && (!feedback || String(feedback).trim().length < 10)) {
    return res.status(400).json({
      error: 'REJECT_FEEDBACK_REQUIRED',
      message: '驳回时必须填写反馈理由（至少 10 字），给 agent 明确方向',
      minLength: 10,
    });
  }

  // 禁止执行者审核自己提交的任务
  const task = taskStore.getById(req.params.id);
  if (task && task.assigned_to && task.assigned_to === (reviewedBy || 'user')) {
    return res.status(403).json({ error: 'SELF_REVIEW_FORBIDDEN', message: '不能审核自己执行的任务，需要他人审核' });
  }

  // 自动验收 + 审核流水线
  // autoReview=true 时启动完整 4-phase 审核（契约核查→质量扫描→验收执行→报告）
  let autoVerdict = verdict;
  let testLog = '';
  let reviewReport = null;
  const autoReview = req.body.autoReview === true;

  if (verdict === 'approved' && task && task.description) {
    const workspace = require('../services/workspace-service');
    const projectStore = require('../stores/project-store');
    const project = projectStore.getById(task.project_id);
    const slug = project ? (project.slug || project.name) : null;

    if (slug) {
      if (autoReview) {
        // ── 完整 4-phase 审核流水线 ──
        const reviewService = require('../services/review-service');
        const reviewerId = reviewedBy || 'agent-reviewer-001';
        const commands = extractAcceptanceCommands(task.description);

        try {
          const contractResult = await reviewService.verifyContracts(task, workspace, slug);
          const qualityResult = await reviewService.scanCodeQuality(workspace, slug, task.description);
          const acceptanceResult = await reviewService.runAcceptance(workspace, slug, commands);

          reviewReport = reviewService.generateReport(
            { contract: contractResult, quality: qualityResult, acceptance: acceptanceResult },
            reviewerId
          );

          autoVerdict = reviewReport.verdict;
          testLog = reviewReport.details;
        } catch (e) {
          testLog = `审核流水线异常: ${e.message}`;
          autoVerdict = 'rejected';
        }
      } else {
        // ── 旧版：仅执行验收命令（PM 手动 review 路径）──
        // v0.38 fix: 不再覆盖 PM 选择的 verdict
        //   之前这里会把 exit≠0 时 autoVerdict 改成 rejected，导致 PM 点"通过"被自动改"驳回"，
        //   任务循环跑回 in_progress（AutoExecuteDispatcher 监听 review_rejected 触发重跑）
        //   现在 acceptance 只 append 到 testLog 作为参考信息，verdict 尊重 PM 在 UI 上明确的选择
        //   如果 PM 看到 testLog 有 FAILED，可以自行点"驳回"——自动覆盖违背 PM 意图
        const commands = extractAcceptanceCommands(task.description);
        if (commands.length > 0) {
          try {
            for (const cmd of commands) {
              try {
                const result = await workspace.exec(slug, { cwd: '.', cmd, timeout: 120000 });
                testLog += `[${cmd}] exit=${result.exitCode}\n${(result.stdout || '').substring(0, 300)}\n`;
                if (result.exitCode !== 0) {
                  testLog += `FAILED: ${cmd} returned exit code ${result.exitCode}\n`;
                  break;
                }
              } catch (e) {
                testLog += `[${cmd}] ERROR: ${e.message}\n`;
                break;
              }
            }
          } catch (e) {
            testLog += `Auto-verify skipped: ${e.message}\n`;
          }
        }
      }
    }
  }

  const effectiveFeedback = reviewReport
    ? `${feedback || ''}\n\n--- 🤖 自动审核报告 ---\n${reviewReport.summary}\n\n${typeof testLog === 'string' ? testLog : JSON.stringify(testLog, null, 2)}\n\n报告: ${JSON.stringify(reviewReport.phases, null, 2)}`
    : testLog
      ? `${feedback || ''}\n\n--- 自动验收日志 ---\n${testLog}`
      : feedback;

  const result = taskStore.review(req.params.id, { verdict: autoVerdict, feedback: effectiveFeedback, reviewedBy: reviewedBy || (autoReview ? 'agent-reviewer-001' : 'user') });
  if (result.error) return res.status(400).json(result);

  // 附带审核报告到返回结果
  const responsePayload = { ...result };
  if (reviewReport) responsePayload.reviewReport = reviewReport;

  eventBus.emit(autoVerdict === 'approved' ? 'task.completed' : 'task.review_rejected', {
    projectId: result.project_id, actor: { id: reviewedBy || (autoReview ? 'agent-reviewer-001' : 'user'), type: autoReview ? 'agent' : 'human' },
    target: { type: 'task', id: result.id }, payload: { task: result, verdict: autoVerdict, feedback: effectiveFeedback, reviewReport },
  });

  // 严重缺陷解决后触发自我改进
  if (autoVerdict === 'approved' && result && result.type === 'bug') {
    const bugSeverity = result.bug_severity || '';
    if (bugSeverity === 'critical' || bugSeverity === 'major') {
      // fire-and-forget，不阻塞响应
      setImmediate(async () => {
        try {
          const bugImprovement = require('../services/bug-improvement-service');
          const report = await bugImprovement.analyzeBugImprovement(result);
          console.log(`[BugImprovement] ${result.id}: ${report.summary.substring(0, 100)}`);
        } catch (e) {
          console.error(`[BugImprovement] 触发失败: ${e.message}`);
        }
      });
    }
  }

  res.json(responsePayload);
});

// 从任务描述中提取可执行的验收命令
function extractAcceptanceCommands(description) {
  const commands = [];
  // 匹配常见命令模式: npm test, npm run xxx, node --check file.js, npx vitest run
  // v0.36: npm test 后面带文件路径时必须加 -- 分隔符，否则 npm 把路径当自己的参数传给 script
  const patterns = [
    /npm\s+test\s+(--\s*)?(\S+)/g,
    /npm\s+run\s+(\S+)/g,
    /node\s+--check\s+(\S+\.js)/g,
    /npx\s+vitest\s+run\s*(\S*)/g,
    /npx\s+(\S+)\s+(\S+)/g,
  ];

  let matched = new Set();
  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(description)) !== null) {
      let cmd = m[0].trim();
      // v0.36: npm test 后面没 -- 的，自动补上
      if (/^npm\s+test\s+\S+$/.test(cmd)) {
        cmd = cmd.replace(/^npm\s+test\s+(\S+)/, 'npm test -- $1');
      }
      if (!matched.has(cmd)) {
        matched.add(cmd);
        commands.push(cmd);
      }
    }
  }

  return commands.slice(0, 5); // 最多5条，防炸
}

// 通用状态转移路由（v0.X 新增，支持 failed → backlog 重激活 / failed → archived 归档等任意合法转移）
router.post('/:id/transition', (req, res) => {
  const { targetStatus, actor = {} } = req.body;
  if (!targetStatus) return res.status(400).json({ error: 'MISSING_TARGET_STATUS' });
  const result = taskStore.transition(req.params.id, targetStatus, actor);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// 拖拽状态变更（v0.35 新增，Kanban 泳道拖拽专用）
router.post('/:id/drag-drop', (req, res) => {
  const { targetStatus } = req.body;
  if (!targetStatus) return res.status(400).json({ error: 'MISSING_TARGET_STATUS' });
  const result = taskStore.transition(req.params.id, targetStatus, { type: 'drag-drop' });
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// v0.45: 执行中途 steer — PM 可以向 in_progress 任务注入指令
//   用法：POST /api/tasks/:id/steer { message: "..." }
//   效果：steer message 写入 task.progress_note，agent 下一轮 loop 会读到
//   这与 agent-steer（重启整个 agent）不同——这里是"软 steer"，不中断当前执行
router.post('/:id/steer', (req, res) => {
  try {
    const { taskId } = req.params;
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'MISSING_MESSAGE' });

    const task = taskStore.getById(taskId);
    if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
    if (task.status !== 'in_progress') {
      return res.status(400).json({ error: 'TASK_NOT_IN_PROGRESS', message: '只能对 in_progress 任务 steer' });
    }

    // 把 steer message 追加到 progress_note（agent 下一轮会读到）
    const existingNote = task.progress_note || '';
    const newNote = existingNote
      ? `${existingNote}\n\n--- PM Steer ---\n${message}`
      : `--- PM Steer ---\n${message}`;

    const { collection } = require('../db/connection');
    collection('tasks').update(t => t.id === taskId, {
      progress_note: newNote,
      last_progress_update: new Date().toISOString(),
    });

    res.json({
      success: true,
      taskId,
      steered: true,
      note: newNote.slice(0, 200),
    });
  } catch (e) {
    res.status(500).json({ error: 'STEER_FAILED', message: e.message });
  }
});

// v0.35: SSE 进度流式 — 客户端连接后持续推送任务执行进度
router.get('/:id/progress/stream', (req, res) => {
  const taskId = req.params.id;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  
  const send = (type, data) => {
    // v0.43 fix: SSE 协议必须有 event: <type>\n 字段，浏览器 EventSource 才会按 type 分发事件
    //   之前只发 data: {...}，浏览器收到后只触发 'message' 事件，前端 addEventListener('connected'/'progress'/'log') 永远不会被调用
    //   这是 v0.35 引入 SSE 时的根本 bug，v0.37/v0.40/v0.42 都没发现，因为 server 端 curl 看 events 正常
    //   真正要看到 bug 必须用浏览器 puppeteer 拦截 EventSource 看实际事件分发
    try { res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`); } catch {}
  };
  
  const taskStore = require('../stores/task-store');
  let prevProgress = -1;
  let prevLogLen = 0;
  let prevStatus = '';
  let prevLatestLogTime = '';  // v0.39: 用最新 entry 的 time 检测新日志（executionLog.length 会卡在 50 不变）
  
  // 最多监听 15 分钟
  const maxDuration = 15 * 60 * 1000;
  const startTime = Date.now();
  
  const interval = setInterval(() => {
    // 超时断开
    if (Date.now() - startTime > maxDuration) {
      clearInterval(interval);
      send('timeout', {});
      res.end();
      return;
    }
    
    try {
      const task = taskStore.getById(taskId);
      if (!task) {
        send('error', { message: '任务不存在' });
        clearInterval(interval);
        res.end();
        return;
      }
      
      const currentStatus = task.status;
      const currentProgress = task.progress || 0;
      const executionLog = JSON.parse(task.execution_log || '[]');
      const progressNote = task.progress_note || '';
      
      // 状态变化
      if (currentStatus !== prevStatus) {
        prevStatus = currentStatus;
        if (currentStatus === 'done') {
          send('done', { progress: 100, status: 'done' });
          clearInterval(interval);
          res.end();
          return;
        } else if (currentStatus === 'failed') {
          send('failed', { status: 'failed', notes: task.progress_note || '执行失败' });
          clearInterval(interval);
          res.end();
          return;
        }
      }
      
      // 进度变化
      if (currentProgress !== prevProgress && currentProgress > 0) {
        prevProgress = currentProgress;
        // v0.46 TodoWrite: 推送 phase + phase_history 让前端 5 段进度条实时更新
        const phaseHistory = JSON.parse(task.phase_history || '[]');
        send('progress', {
          progress: currentProgress,
          status: currentStatus,
          note: progressNote,
          logLength: executionLog.length,
          phase: task.phase || null,
          phase_history: phaseHistory,
        });
      }
      // v0.44 fix: 用 latest entry.time 检测新日志（executionLog.length 会卡在 50 不变）
      //   之前用 executionLog.length > prevLogLen，但 task-agent.js saveProgress 限制 log ≤ 50
      //   一旦满了 length 永远 50，SSE 永远不推 log event → hover tooltip 看不到新 round
      //   现在用 latest entry.time 检测，每次 agent 新 round time 必变
      const lastEntry = executionLog[executionLog.length - 1];
      const lastTime = lastEntry?.time || '';
      if (lastTime && lastTime !== prevLatestLogTime) {
        prevLatestLogTime = lastTime;
        send('log', { entry: lastEntry, totalLogs: executionLog.length });
      }
      prevLogLen = executionLog.length;
    } catch (e) {
      // 静默忽略 DB 读取错误
    }
  }, 2000);
  
  // 客户端断开连接时清理
  req.on('close', () => {
    clearInterval(interval);
  });
  
  // 发送初始状态
  try {
    const task = taskStore.getById(taskId);
    if (task) {
      send('connected', {
        taskId,
        status: task.status,
        progress: task.progress || 0,
        note: task.progress_note || (task.status === 'in_progress' ? '任务已启动，正在执行...' : ''),
      });
    }
  } catch {}
});

// 释放任务
router.post('/:id/release', (req, res) => {
  const result = taskStore.transition(req.params.id, 'backlog');
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// 删除任务
router.delete('/:id', (req, res) => {
  const task = taskStore.getById(req.params.id);
  if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
  const { collection } = require('../db/connection');
  collection('tasks').remove(t => t.id === req.params.id);
  // 从父需求 task_ids 中移除
  if (task.parent_id) {
    const reqStore = require('../stores/requirement-store');
    const parent = reqStore.getById(task.parent_id);
    if (parent) {
      const taskIds = JSON.parse(parent.task_ids || '[]').filter(tid => tid !== req.params.id);
      reqStore.update(task.parent_id, { task_ids: JSON.stringify(taskIds) });
    }
  }
  res.json({ success: true, message: `任务 ${task.title} 已删除` });
});

module.exports = router;
