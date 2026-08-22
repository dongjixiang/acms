// ============================================================
// services/qwen-task.js — task-agent 的 Qwen Code 内核封装（v0.114）
// ============================================================
// 用途：把 kanban 编码任务（task-agent 单角色路径）交给 Qwen Code CLI
//       内核执行，而不是通用 LLM + runToolLoop。
//
// 设计（与聊天场景的差异）：
//   - 独立会话池：key = task:<taskId>（不与聊天 userId 会话混用）
//   - 沙箱自动放行：approvalMode='auto' + onApproval 策略回调
//     （跟随 Qwen CLI 自己的 permission_suggestions，建议 deny 则拒绝）
//   - cwd = 项目 workspace（Qwen CLI 在项目目录内读写文件，天然隔离）
//   - 一次 ask 完成整个任务（Qwen 内部自己 loop 探索→写码→测试→提交）
//   - 失败可回退：调用方（task-agent）catch 后走旧引擎 runToolLoop
// ============================================================
const path = require('path');
const fs = require('fs');

const modelStore = require('../stores/model-store');
const workspace = require('./workspace-service');

const SYSTEM_CFG_TASK_ENABLED = 'qwen_task_enabled';

let taskManager = null;
let activeTaskId = null;   // 当前正在执行的任务（maxSessions=1 串行）
let activeOnProgress = null;

// ---------- 配置 ----------
function taskEnabled() {
  try {
    const { collection } = require('../db/connection');
    const cfg = collection('system_configs').findOne((c) => c.key === SYSTEM_CFG_TASK_ENABLED);
    if (cfg && typeof cfg.value === 'boolean') return cfg.value;
  } catch (e) { /* ignore */ }
  return false; // 默认关闭，需显式开启
}

function setTaskEnabled(v) {
  try {
    const { collection } = require('../db/connection');
    const coll = collection('system_configs');
    const existing = coll.findOne((c) => c.key === SYSTEM_CFG_TASK_ENABLED);
    if (existing) {
      coll.update((c) => c.key === SYSTEM_CFG_TASK_ENABLED, { ...existing, value: !!v, updated_at: new Date().toISOString() });
    } else {
      coll.insert({ key: SYSTEM_CFG_TASK_ENABLED, value: !!v, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    return true;
  } catch (e) {
    console.warn('[qwen-task] setTaskEnabled 失败:', e.message);
    return false;
  }
}

// ---------- 沙箱自动放行策略 ----------
// 跟随 Qwen CLI 权限分类器的建议：
//   - permission_suggestions 里有 allow=false → 拒绝
//   - 其余放行（Qwen 的 classifier 已对 rm -rf / 等危险操作建议 deny）
function sandboxPolicy(toolCall) {
  // v0.114i: ask_user_question 在 task 场景（无人值守）无法回答 → 显式 deny
  if (toolCall && toolCall._isUserQuestion) {
    console.warn('[qwen-task] 沙箱拒绝 ask_user_question（task 场景无法回答用户问题）');
    return false;
  }
  const suggs = (toolCall && toolCall.permission_suggestions) || [];
  const hasDeny = suggs.some((s) => s && s.allow === false);
  if (hasDeny) {
    console.warn(`[qwen-task] 沙箱拒绝工具 ${toolCall.tool_name}（权限建议 deny）`);
    return false;
  }
  return true;
}

// ---------- 会话池（task 专用，maxSessions=1 串行） ----------
function getTaskManager() {
  if (taskManager) return taskManager;
  const { QwenSessionManager } = require('./qwen-worker');
  taskManager = new QwenSessionManager({
    maxSessions: 1,
    idleTimeoutMs: 10 * 60 * 1000,
    onApproval: sandboxPolicy,
    onEvent: (evt) => {
      try {
        // 工具调用 → 进度上报（task-agent saveProgress 可见）
        if (evt && evt.type === 'approval_request' && activeOnProgress) {
          const name = (evt.toolCall && evt.toolCall.tool_name) || 'tool';
          activeOnProgress(1, 1, `🔧 Qwen 调用 ${name}`, [name]);
        }
      } catch (e) { /* ignore */ }
    },
  });
  return taskManager;
}

// ---------- 任务执行 ----------
/**
 * 用 Qwen Code 内核执行一个 kanban 任务。
 * @param {object} task task-store 任务对象
 * @param {object} opts { project, modelId, onProgress, lang, taskContext }
 * @returns {Promise<{content:string, qwen:boolean, sessionId:string, approvalCount:number}>}
 * @throws 未启用 / CLI 缺失 / 模型不可用 → 调用方回退旧引擎
 */
async function runQwenTask(task, opts = {}) {
  if (!taskEnabled()) {
    throw Object.assign(new Error('Qwen task 未启用（system_configs.qwen_task_enabled=false）'), { code: 'QWEN_TASK_DISABLED' });
  }

  const project = opts.project;
  if (!project) throw Object.assign(new Error('Qwen task: 缺少 project'), { code: 'QWEN_TASK_NO_PROJECT' });

  const slug = project.slug || project.name;
  const wsPath = workspace.getPath(slug);
  if (!fs.existsSync(wsPath)) {
    throw Object.assign(new Error(`Qwen task: workspace 不存在 ${wsPath}`), { code: 'QWEN_TASK_NO_WS' });
  }

  const manager = getTaskManager();
  const sessionKey = `task:${task.id}`;
  activeTaskId = task.id;
  activeOnProgress = opts.onProgress || null;

  try {
    const session = await manager.getSession(sessionKey, {
      cwd: wsPath,
      modelId: opts.modelId || undefined,
      // task 场景人设：工程执行指令（不注入小吉对话人设）
      appendSystemPrompt: TASK_SYSTEM_PROMPT,
    });

    // 组装 user prompt：taskContext（任务描述 markdown）+ workspace 指引
    const prompt = buildTaskPrompt(task, opts.taskContext, wsPath, opts.lang);

    const result = await session.ask(prompt, {
      timeoutMs: opts.timeoutMs || 10 * 60 * 1000, // 默认 10min（外层 task 全局超时兜底）
    });

    if (result.is_error) {
      throw Object.assign(new Error(`Qwen task 执行失败: ${(result.error && result.error.message) || result.subtype}`), {
        code: 'QWEN_TASK_EXEC_FAILED',
        subtype: result.subtype,
      });
    }

    return {
      content: (result.result || '').trim(),
      qwen: true,
      sessionId: session.sessionId,
      approvalCount: session.approvalCount,
      numTurns: result.num_turns || 0,
    };
  } finally {
    activeTaskId = null;
    activeOnProgress = null;
  }
}

// ---------- prompt 组装 ----------
const TASK_SYSTEM_PROMPT = `你是 ACMS 的工程执行 Agent，运行在 Qwen Code 内核上。

工作方式：
- 任务描述会作为 user 消息给出，包含验收标准（Acceptance Criteria）。
- 在当前工作目录（项目 workspace）内完成任务：探索代码 → 修改/新建文件 → 验证。
- 使用中文写最终总结：做了什么、改了哪些文件、如何验证、验收标准是否达成。
- 不要只描述计划而不动手——实际写文件、实际跑命令验证。
- 危险操作（删除重要目录、清空磁盘等）会被权限系统拦截，不要尝试绕过。

重要限制（v0.114c）：
- 本工作区不是 git 仓库（ACMS workspace 的文件不受 git 管理），禁止运行任何 git 命令
  （git status / git add / git commit / git diff 等）——它们无意义且会出错。
- 验证文件是否创建/修改成功：用 ls / cat / read 等文件操作，不要用 git。`;

function buildTaskPrompt(task, taskContext, wsPath, lang) {
  const langHint = lang === 'en' ? 'Write the final summary in English.' : '最终总结用中文。';
  const ctx = taskContext || `任务 ${task.id}: ${task.title}

${task.description || '(no description)'}

验收标准（Acceptance Criteria）: ${task.acceptance_criteria || task.acceptanceCriteria || '(not specified — derive from the task description above)'}`;
  return `${ctx}

---

## 执行环境
- 工作目录（workspace）：${wsPath}
- 你在此目录内完成所有操作（读写文件、运行命令）。
- ${langHint}

现在开始执行任务。`;
}

module.exports = { runQwenTask, taskEnabled, setTaskEnabled, getTaskManager, _internals: { sandboxPolicy, buildTaskPrompt, TASK_SYSTEM_PROMPT } };
