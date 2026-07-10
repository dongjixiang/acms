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
router.patch('/:id/auto-review', (req, res) => {
  const { enabled } = req.body;
  const task = taskStore.getById(req.params.id);
  if (!task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
  taskStore.update(req.params.id, { auto_review: enabled ? 1 : 0 });
  res.json({ id: req.params.id, auto_review: enabled ? 1 : 0 });
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
        // ── 旧版：仅执行验收命令 ──
        const commands = extractAcceptanceCommands(task.description);
        if (commands.length > 0) {
          try {
            for (const cmd of commands) {
              try {
                const result = await workspace.exec(slug, { cwd: '.', cmd, timeout: 120000 });
                testLog += `[${cmd}] exit=${result.exitCode}\n${(result.stdout || '').substring(0, 300)}\n`;
                if (result.exitCode !== 0) {
                  autoVerdict = 'rejected';
                  testLog += `FAILED: ${cmd} returned exit code ${result.exitCode}\n`;
                  break;
                }
              } catch (e) {
                testLog += `[${cmd}] ERROR: ${e.message}\n`;
                autoVerdict = 'rejected';
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
    ? `${feedback || ''}\n\n--- 🤖 自动审核报告 ---\n${reviewReport.summary}\n\n${testLog}\n\n报告: ${JSON.stringify(reviewReport.phases, null, 2)}`
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
  const patterns = [
    /npm\s+test\s*(\S*)/g,
    /npm\s+run\s+(\S+)/g,
    /node\s+--check\s+(\S+\.js)/g,
    /npx\s+vitest\s+run\s*(\S*)/g,
    /npx\s+(\S+)\s+(\S+)/g,
  ];

  let matched = new Set();
  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(description)) !== null) {
      const cmd = m[0].trim();
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
