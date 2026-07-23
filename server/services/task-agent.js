// ACMS AI 工具层 — Agent 自主执行（v0.23 核心，LLM 探索工作区 + 修改文件 + 自动提交）
const modelStore = require('../stores/model-store');
const taskStore = require('../stores/task-store');
const { runToolLoop } = require('./llm-adapter');
const { execute: runtimeExec } = require('./agent-runtime');
const skillLoader = require('./skill-loader');
const { registerTool } = require('./tool-registry');
const { runHook } = require('./hook-registry');
const eventBus = require('./event-bus');

// v0.46 TodoWrite — Workflow Phases 5 段进度（PM 看板可见）
//   顺序：explore → design → write → test → fix
//   LLM 在合适时机调 agent_set_phase 切换 phase，task.doc.phase 实时更新
const PHASES = ['explore', 'design', 'write', 'test', 'fix'];
const PHASE_META = {
  explore: { icon: '🔍', label: '探索', color: '#94a3b8' },
  design:  { icon: '📝', label: '设计', color: '#8b5cf6' },
  write:   { icon: '✏️', label: '写代码', color: '#3b82f6' },
  test:    { icon: '🧪', label: '测试', color: '#10b981' },
  fix:     { icon: '🔧', label: '修复', color: '#f59e0b' },
};

// v0.46 TodoWrite — agent_set_phase 工具（让 LLM 主动声明 phase 切换）
registerTool({
  name: 'agent_set_phase',
  description: 'Update the current workflow phase. Phases: explore (workspace recon), design (planning approach), write (creating/modifying files), test (running tests/verifying), fix (debugging failures). Call this when transitioning between phases so the PM can see real-time progress.',
  parameters: {
    type: 'object',
    properties: {
      phase: { type: 'string', enum: PHASES, description: 'New phase to enter' },
      note: { type: 'string', description: 'Optional one-line note describing what you did in the previous phase or plan for the next' },
    },
    required: ['phase'],
  },
  async handler(args, ctx = {}) {
    const { phase, note } = args;
    const { taskId } = ctx;
    if (!taskId) return { error: 'NO_TASK_ID', ok: false };
    if (!PHASES.includes(phase)) return { error: `INVALID_PHASE: ${phase}. Valid: ${PHASES.join(', ')}`, ok: false };

    // 读取历史 phase
    const task = taskStore.getById(taskId);
    if (!task) return { error: 'TASK_NOT_FOUND', ok: false };

    const history = JSON.parse(task.phase_history || '[]');

    // v0.X: phase 防抖 — 同一 phase 连续 ≥3 次切换时警告（治 R83 那种反复切 phase 的循环）
    const recentSame = history.slice(-3).filter(h => h.phase === phase).length;
    if (recentSame >= 3) {
      return {
        ok: false,
        phase,
        warning: `LOOP_DETECTED: 已连续 ${recentSame + 1} 次切到 phase "${phase}"。你可能在循环。应该停止 phase 切换并产生最终总结，而不是反复切 phase。`,
        hint: 'review Anti-Loop Rules (system prompt §A) and synthesize your final answer now.',
      };
    }

    history.push({ phase, note: note || '', at: new Date().toISOString() });
    // 只保留最近 20 条切换
    if (history.length > 20) history.splice(0, history.length - 20);

    taskStore.update(taskId, {
      phase,
      phase_history: JSON.stringify(history),
    });

    return {
      ok: true,
      phase,
      icon: PHASE_META[phase].icon,
      label: PHASE_META[phase].label,
      message: `Phase → ${PHASE_META[phase].icon} ${PHASE_META[phase].label}${note ? ` (${note})` : ''}`,
    };
  },
});

const AGENT_SYSTEM_PROMPT = `You are an ACMS autonomous agent. You complete tasks in a project workspace using tools.

## Environment
- Windows sandbox: \`cmd.exe\`, \`cd\`, \`powershell\` are blocked. Use \`node\`/\`npm\`/\`git\` with absolute or relative paths from workspace root.
- \`agent_list_files\` filters out \`_*\`/\`.git\`/\`node_modules\` by default — ignore those.

## Rules
1. **Write code, don't describe it.** Saying a tool call in summary is not writing. Only calling agent_write_file or agent_patch_file creates files. If you return a summary without writing, the system rejects it.
2. **STOP when done.** After all fixes written and verified, produce your final summary and end. Do NOT re-read files you just wrote, re-run tests that passed, or re-check git status.
3. **Explore systematically: map first, then read.** Start with agent_list_files or agent_read_dir_summary on the project root to see the layout, then read specific files. Do NOT read files before you know the structure.
4. **Search once, then read batch.** Use one agent_search_files with a broad pattern (e.g. the CSS property name or function name) to find all relevant locations, then use agent_read_files to batch-read matched files. Avoid narrow searches that need repeats.
5. **Call agent_set_phase** at phase transitions (explore to design to write to test to fix) so the PM sees progress.
6. **Patch failure recovery:** If agent_patch_file returns 0 lines patched, call agent_read_file to see current content, then derive the correct old string. Do NOT retry the same anchor.
7. **Git: one shot, trust the response.** agent_git_commit returns a commit hash - that IS confirmation. Do NOT re-verify. Do NOT call git tools before making any code changes.`;

async function executeTaskAgent(taskId, options = {}) {
  const task = taskStore.getById(taskId);
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 });

  const projectId = task.project_id;
  const modelId = options.modelId || (modelStore.getDefaultGenModel() || {}).id;
  if (!modelId) throw Object.assign(new Error('No active model available'), { status: 500 });

  const model = modelStore.getById(modelId);
  if (!model) throw Object.assign(new Error('Model not found: ' + modelId), { status: 404 });

  // P0 v0.X: lang 控制 agent 输出语言
  //   优先级：options.lang > task.doc.preferred_lang > 'zh'（多多场景默认）
  const lang = options.lang || task.preferred_lang || 'zh';

  // P1: 多角色模式 — 默认启用，可通过 options.multiRole = false 关闭
  //   把单 agent 90 轮拆成 Planner → Coder → Tester → Reviewer 流水线
  if (options.multiRole !== false) {
    return await runMultiRoleSequence(task, options);
  }

  // v0.30 fix: 接受 options.steerMessage — 多多可以手动 steer（等价 Hermes /steer slash command）
  //   当 PM 通过 POST /api/agents/steer/:taskId 注入消息，把它作为额外 user message prepend 到 messages
  const steerMessages = [];
  if (options.steerMessage) {
    steerMessages.push({
      role: 'user',
      content: `# Manual Steer from PM\n\n${options.steerMessage}\n\nPlease incorporate this direction into your current work. Continue executing the goal in your system prompt above.`,
    });
  }

// v0.28 fix: task context 改 markdown 段落（Hermes-style），LLM 在 markdown 段落下表现明显优于 key-value 标签
  //   根因：ACMS 之前用 "Task ID: X\nTitle: Y\nDescription: Z..." 格式，LLM 把它当"标签数据"理解而非任务目标；
  //   改成 markdown 段落后 LLM 把整段当 goal，理解深度提升（Hermes 同模型 7 轮收敛 vs ACMS 20 轮装睡）
  // v0.X: 不再拼进 system prompt — 改为独立 user message（LLM 当用户意图理解）
  const taskContext = `# Task ${task.id}: ${task.title}

${task.description || '(no description)'}

**Type**: ${task.type || 'general'} | **Estimated**: ${task.estimated_hours || 'N/A'}h
**Acceptance Criteria**: ${task.acceptance_criteria || task.acceptanceCriteria || '(not specified — derive from the task description above)'}
**Required Skills**: ${task.required_skills || '{}'}`;

  // P0 v0.X: 收集历史 submissions + reviews 摘要 — 防 agent 重复猜根因
  //   独立 user message，不拼 taskContext（user role 优先级高于 system role）
  let historySummary;
  try { historySummary = buildHistorySummary(task); } catch (e) { historySummary = null; }

  // P0 v0.X: 跨任务 workspace 记忆 — 独立 user message
  let workspaceMemoryMsg = null;
  try {
    const workspaceMeta = require('./workspace-meta');
    const projectStore = require('../stores/project-store');
    const project = projectStore.getById(projectId);
    if (project) {
      const slug = project.slug || project.name;
      workspaceMemoryMsg = workspaceMeta.getSummaryForPrompt(slug, task.id);
    }
  } catch (e) { /* workspace-meta 不可用时不阻塞 */ }

  // v0.X: 任务记忆 — 结构化的跨轮工作摘要，防 context attrition
  //   PostToolUse hook 自动跟踪：读文件、写文件、阶段变更
  //   每次 LLM 调用前注入压缩摘要，让 agent 知道已做了什么
  let taskMemoryMsg = null;
  try {
    const memSummary = require('./task-memory').compressToPrompt(taskId);
    if (memSummary) taskMemoryMsg = { role: 'user', content: memSummary };
  } catch (e) { /* 不阻塞 */ }

  const systemPrompt = buildSystemPrompt(task, lang);
  const userMessages = [];
  // 背景上下文排在前（workspace 记忆 + 执行历史），任务是最终的"命令"
  if (workspaceMemoryMsg) userMessages.push({ role: 'user', content: workspaceMemoryMsg });
  // v0.X: TaskMemory 在 workspace 记忆后、历史摘要前 — 让 LLM 先看已知背景再看历史
  if (taskMemoryMsg) userMessages.push(taskMemoryMsg);
  if (historySummary) userMessages.push({ role: 'user', content: historySummary + '\n\n注意：你之前的尝试记录如上。请不要再重走老路，仔细阅读驳回原因再动手。' });
  userMessages.push({ role: 'user', content: taskContext });

  const messages = [
    { role: 'system', content: systemPrompt },
    // steer message 紧跟 system prompt（LLM 第一时间看到 PM 意图）
    ...steerMessages,
    // 上下文 + 任务描述作为 user messages
    ...userMessages,
  ];

  console.log(`[agent-execute] Task ${taskId} | model=${model.id} | project=${projectId}`);

  // v0.X: 按任务类型裁剪工具列表 — 治 T-MRGDBST1 多余工具加重空转
// v0.46: 工具筛选 — 不再按 task.type 一刀切, 改按 description 内容智能判断
  //   历史 bug (T-MRKP19DR 2026-07-14): bug 类型任务被一刀切过滤掉 browser_* 工具,
  //   导致含 URL 的 bug 任务 (比如 "通过交付管理预览 http://.../dist/ 404")
  //   agent 没法用 browser_snapshot 自检, 只能猜, 然后提交 "DONE" 但实际未验证.
  //
  //   新策略 (智能 4 维检测):
  //   1. description 含 http(s):// URL  → 需要 browser_* (本地/外网预览页)
  //   2. description 含浏览器关键字    → 需要 browser_* (404/500/preview/页面/网页)
  //   3. description 含 DB/SSH/HTTP 关键字 → 需要对应工具
  //   4. bug/fix 类型 且无以上特征      → 保持原过滤 (省 token)
  const taskType = (task.type || '').toLowerCase();
  const taskDesc = (task.description || task.actual_behavior || '').toLowerCase();
  const taskTitle = (task.title || '').toLowerCase();
  const fullText = `${taskTitle} ${taskDesc}`;

  // 4 维检测
  const hasUrl = /https?:\/\/[^\s]+/.test(fullText);
  const hasBrowserKw = /浏览器|browser|网页|页面|preview|dist|404|500|403|网络请求|http request|渲染|dom/i.test(fullText);
  const hasDbKw = /\bsql\b|\bquery\b|数据库|database|select\s|insert\s|update\s/i.test(fullText);
  const hasSshKw = /\bssh\b|远程|remote|服务器|server\s+(login|shell|exec)/i.test(fullText);
  const hasHttpKw = /\bapi\s+(call|request)|fetch\s+url|http\s+request|curl\s+/i.test(fullText);

  // 决定要不要保留哪些工具
  const EXTRA_TOOLS = ['browser_snapshot', 'browser_console', 'browser_click', 'browser_type', 'browser_screenshot',
    'agent_db_query', 'agent_ssh_execute', 'agent_ssh_check', 'agent_http_request'];
  const toolsToKeep = new Set();
  if (hasUrl || hasBrowserKw) {
    ['browser_snapshot','browser_console','browser_click','browser_type','browser_screenshot']
      .forEach(t => toolsToKeep.add(t));
  }
  if (hasDbKw) toolsToKeep.add('agent_db_query');
  if (hasSshKw) { toolsToKeep.add('agent_ssh_execute'); toolsToKeep.add('agent_ssh_check'); }
  if (hasHttpKw) toolsToKeep.add('agent_http_request');

  const ALL_TOOLS = ['agent_read_file', 'agent_read_dir_summary', 'agent_search_files', 'agent_exec_command', 'agent_write_file', 'agent_patch_file', 'agent_multi_patch', 'browser_snapshot', 'browser_console', 'browser_click', 'browser_type', 'browser_screenshot', 'agent_git_status', 'agent_git_diff', 'agent_git_commit', 'agent_git_log', 'agent_git_branch', 'agent_db_query', 'agent_ssh_execute', 'agent_ssh_check', 'agent_http_request', 'agent_set_phase', 'agent_typescheck', 'agent_plan'];
  // 原简单任务过滤: bug/fix/documentation/refactor/test 类不分配 EXTRA_TOOLS
  // 新逻辑: 如果 description 触发 4 维检测之一, 保留对应工具; 否则走原过滤
  const isSimpleTask = ['bug', 'fix', 'documentation', 'refactor', 'test'].includes(taskType);
  const toolNames = isSimpleTask && toolsToKeep.size === 0
    ? ALL_TOOLS.filter(t => !EXTRA_TOOLS.includes(t))   // 简单任务无浏览器/DB 需求, 走原过滤
    : isSimpleTask
      ? ALL_TOOLS.filter(t => !EXTRA_TOOLS.includes(t) || toolsToKeep.has(t))  // 简单任务但有特殊需求, 保留对应工具
      : ALL_TOOLS;                                       // 复杂任务全部工具

  // v0.46 日志: 记录为什么 agent 拿到/没拿到 browser 工具 (PM 调试友好)
  const triggerReasons = [];
  if (hasUrl) triggerReasons.push('URL');
  if (hasBrowserKw) triggerReasons.push('browser_kw');
  if (hasDbKw) triggerReasons.push('db_kw');
  if (hasSshKw) triggerReasons.push('ssh_kw');
  if (hasHttpKw) triggerReasons.push('http_kw');
  console.log(`[task-agent v0.46] task=${task.id} type=${taskType} → ${toolNames.length} tools (kept browser/extra: ${Array.from(toolsToKeep).join(',') || 'none'}; triggers: ${triggerReasons.join(',') || 'isSimpleTask'})`);

  let analysis;
  try {
    // v0.35: 进度回调 — 每轮写 execution_log + progress
    const taskForProgress = { ...task };
    const saveProgress = (round, maxRounds, message, tools) => {
      const now = new Date().toISOString();
      // v0.46 TodoWrite: 检测 LLM 在 message 里声明 phase（兼容兜底，agent_set_phase 是主要途径）
      let phaseNote = '';
      const phaseMatch = (message || '').match(/\[phase:\s*(\w+)\]/i);
      if (phaseMatch) phaseNote = phaseMatch[1];
      const logEntry = {
        time: now,
        action: `round_${round}/${maxRounds}`,
        note: message + (tools?.length ? ` [${tools.join(', ')}]` : '') + (phaseNote ? ` [phase:${phaseNote}]` : ''),
      };
      // 追加到 execution_log
      try {
        const log = JSON.parse(taskForProgress.execution_log || '[]');
        log.push(logEntry);
        // 只保留最近 50 条，防 DB 膨胀
        if (log.length > 50) log.splice(0, log.length - 50);
        taskForProgress.execution_log = JSON.stringify(log);
        taskForProgress.progress = Math.min(100, Math.round((round / maxRounds) * 100));
        taskForProgress.progress_note = message;
        taskForProgress.last_progress_update = now;
        // 写回 DB
        const { collection } = require('../db/connection');
        collection('tasks').update(t => t.id === taskId, {
          execution_log: taskForProgress.execution_log,
          progress: taskForProgress.progress,
          progress_note: taskForProgress.progress_note,
          last_progress_update: taskForProgress.last_progress_update,
        });
      } catch (e) { /* silent */ }
    };

    const runtimeResult = await runtimeExec({
      modelId: model.id,
      messages,
      toolNames,
      maxRounds: 90,
      maxTokens: options.maxTokens ?? 32000,
      context: { projectId, taskId },
      onProgress: saveProgress,
      caller: 'task-agent',
    });
    analysis = runtimeResult.content;
  } catch (e) {
    console.error(`[agent-execute] runToolLoop failed: ${e.message}`);
    analysis = `[Agent execution failed: ${e.message}]\n\nTask context:\n${taskContext}`;
  }

  console.log(`[agent-execute] Task ${taskId} completed. Analysis length: ${(analysis || '').length} chars`);

  // P0 v0.X: flush workspace meta 到磁盘 — agent-execute 结束时避免数据丢失
  try { require('./workspace-meta').flushAll(); } catch (e) { /* 不阻塞 */ }

  // P2: 通过 event-bus 通知系统（单 agent 模式）
  try {
    eventBus.emit('task.completed', {
      projectId,
      actor: { id: 'agent-acms-self', type: 'agent', name: 'ACMS Agent' },
      target: { type: 'task', id: taskId },
      payload: { summary: (analysis || '').slice(0, 300), multiRole: false },
    });
  } catch (e) { /* 不阻塞 */ }

  return {
    taskId,
    modelUsed: model.id,
    analysis: analysis || '(empty response)',
    completedAt: new Date().toISOString(),
  };
}

// ===== Agent Claims 验证（v0.35 改版：基于任务需求验证，不 parse LLM summary）=====
// 旧版从 LLM summary 文本 parse 文件路径 → 容易误杀（LLM 随口一提不代表要写）。
// 新版从任务描述/acceptance criteria 中提取文件路径，只验证"需求明确要求"的文件。
// 验证失败 → 任务退回 in_progress 重做（不是直接 FAIL）。

/**
 * 从任务描述/acceptance criteria 中提取文件路径
 */
function extractRequiredFiles(taskDoc) {
  const text = [
    taskDoc.title,
    taskDoc.description,
    taskDoc.acceptance_criteria || taskDoc.acceptanceCriteria,
    taskDoc.notes || '',
  ].filter(Boolean).join('\n');

  if (!text) return [];

  // Map<path, {source, pattern}> — 用 Map 去重同时保留首个匹配来源
  const claimed = new Map();
  const VALID_EXT = /\.(js|ts|jsx|tsx|mjs|cjs|json|md|markdown|py|yml|yaml|toml|sh|bash|html|htm|css|scss|sass|less|vue|svelte|sql|txt|env|gitignore|dockerfile|Dockerfile|lock|csv|xml|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|eot|mp[34]|webm|ogg|wav|pdf)$/i;
  const isValidPath = (p) => {
    if (typeof p !== 'string' || p.length < 4 || p.length > 200) return false;
    if (!p.includes('/')) return false;
    if (!VALID_EXT.test(p)) return false;
    return true;
  };

  // Pattern 1: backtick-wrapped paths  —  `path/to/file`
  const backtickRe = /`([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)`/g;
  let m;
  while ((m = backtickRe.exec(text)) !== null) {
    const p = m[1];
    if (!/^(https?:|\/|~)/.test(p) && isValidPath(p) && !claimed.has(p)) {
      claimed.set(p, { source: `\`${p}\``, pattern: '反引号包裹' });
    }
  }

  // Pattern 3: markdown list items  —  - path/to/file（新建）
  //   支持中文括号标注： （修改）不验证存在，（新建）验证存在，（删除）验证不存在
  //   示例: - src/utils/dagLayout.ts（新建） → 必须存在
  //         - src/pages/Causal/index.tsx（修改） → 不检查（可能本来就有）
  const listRe = /^\s*[-*]\s+[`"']?([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)[`"']?(?:\s*（([^）]*)）)?/gm;
  while ((m = listRe.exec(text)) !== null) {
    const p = m[1];
    if (/^(https?:|\/)/.test(p) || !isValidPath(p) || claimed.has(p)) continue;
    const annotation = (m[2] || '').trim();
    let type = 'create';  // 默认新建
    if (/修改|改动|编辑|更新|modify|edit|update/i.test(annotation)) type = 'modify';
    else if (/删除|移除|删掉|delete|remove/i.test(annotation)) type = 'delete';
    claimed.set(p, { source: m[0].trim().substring(0, 60), pattern: '列表项', type });
  }

  // Pattern 2: 动词 + 路径 — 根据动词推断意图
  //   创建/新建/implement/create/build/add/generate → create（默认）
  //   修改/写入/modify/change/write → modify（不验证存在）
  const verbRe = /\b(?:创建|写入|修改|生成|创建|编写|新建|建立|implement|create|write|modify|change|build|add|generate)\s+[`"']?([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)[`"']?/gi;
  while ((m = verbRe.exec(text)) !== null) {
    const p = m[1];
    if (/^(https?:|\/)/.test(p) || !isValidPath(p) || claimed.has(p)) continue;
    const verb = m[0].toLowerCase();
    const type = /修改|写入|modify|change|write/.test(verb) ? 'modify' : 'create';
    claimed.set(p, { source: m[0].trim().substring(0, 60), pattern: '动词+路径', type });
  }

  // 返回 {path, source, pattern}[]，兼容老调用方（.map(p=>p.path) 或 .join() 会报错，
  // 但引用方都已更新）
  return Array.from(claimed.entries()).map(([path, meta]) => ({
    path,
    source: meta.source,
    pattern: meta.pattern,
    type: meta.type || 'create',
  }));
}

/**
 * 验证文件是否存在（从 workspace 读取）
 */
function verifyFilesExist(projectId, filePaths) {
  const out = { verified: [], missing: [] };
  if (!Array.isArray(filePaths) || filePaths.length === 0) return out;

  const projectStore = require('../stores/project-store');
  const project = projectStore.getById(projectId);
  if (!project) {
    return { verified: [], missing: filePaths.map(p => ({ path: p, reason: 'PROJECT_NOT_FOUND' })) };
  }

  const slug = project.slug || project.name;
  const workspace = require('./workspace-service');

  for (const p of filePaths) {
    try {
      const content = workspace.readFile(slug, p);
      if (content !== null && content !== undefined) {
        out.verified.push(p);
      } else {
        // v0.X: 后缀容错 — Agent 经常创建 .ts 文件但任务描述写 .tsx（或反过来）
        //   T-MRHSD8QA 7/13: deepTrace.test.tsx vs deepTrace.test.ts → 循环 6 小时
        const altExt = p.endsWith('.tsx') ? p.slice(0, -4) + '.ts'
                     : p.endsWith('.ts') ? p.slice(0, -3) + '.tsx'
                     : null;
        if (altExt) {
          try {
            const altContent = workspace.readFile(slug, altExt);
            if (altContent !== null && altContent !== undefined) {
              out.verified.push(p);
              console.log(`[verifyFilesExist] ✅ ${p} 匹配到 ${altExt}`);
              continue;
            }
          } catch (e2) { /* 忽略 */ }
        }
        out.missing.push({ path: p, reason: 'FILE_NOT_FOUND' });
      }
    } catch (e) {
      out.missing.push({ path: p, reason: e.message || 'READ_ERROR' });
    }
  }
  return out;
}

/**
 * 审计任务需求的文件是否存在
 * 返回: { requiredCount, verifiedCount, missingCount, requiredFiles, missingFiles, verifiedFiles, requiredFileDetails }
 *   requiredFileDetails: [{path, source, pattern, type, status:'verified'|'missing'|'skipped', reason}]
 *   type: 'create'=验证存在, 'modify'=跳过验证, 'delete'=验证不存在
 */
function auditTaskRequirements(projectId, taskDoc) {
  const required = extractRequiredFiles(taskDoc);
  // 按类型分组
  const createFiles = required.filter(f => f.type === 'create' || f.type === 'delete');
  const modifyFiles = required.filter(f => f.type === 'modify');
  const deleteFiles = required.filter(f => f.type === 'delete');

  // create: 验证存在（用已有 verifyFilesExist）
  const createResult = createFiles.length
    ? verifyFilesExist(projectId, createFiles.map(f => f.path))
    : { verified: [], missing: [] };
  // delete: 验证不存在（反向检查）
  const deleteVerified = [];
  const deleteFailed = [];
  if (deleteFiles.length) {
    const allExist = verifyFilesExist(projectId, deleteFiles.map(f => f.path));
    // 文件存在→删除失败；文件不存在→删除验证通过
    for (const f of deleteFiles) {
      if (allExist.verified.includes(f.path)) {
        deleteFailed.push({ path: f.path, reason: 'FILE_SHOULD_BE_DELETED' });
      } else {
        deleteVerified.push(f.path);
      }
    }
  }

  const verifiedSet = new Set(createResult.verified);
  const missingMap = new Map(createResult.missing.map(m => [m.path, m.reason]));
  const deleteFailSet = new Set(deleteFailed.map(m => m.path));
  const deleteFailReasons = new Map(deleteFailed.map(m => [m.path, m.reason]));

  const fileDetails = required.map(f => {
    if (f.type === 'modify') {
      return { ...f, status: 'skipped', reason: null };
    }
    if (f.type === 'delete') {
      const failed = deleteFailSet.has(f.path);
      return { ...f, status: failed ? 'missing' : 'verified', reason: failed ? '文件仍存在，应已删除' : null };
    }
    // type === 'create'
    return {
      ...f,
      status: verifiedSet.has(f.path) ? 'verified' : 'missing',
      reason: missingMap.get(f.path) || null,
    };
  });

  // 计算统计 — 只 count create 和 delete（modify 跳过验证不算成功也不算失败）
  const counted = fileDetails.filter(f => f.type !== 'modify');
  const verifiedCount = counted.filter(f => f.status === 'verified').length;
  const missingCount = counted.filter(f => f.status === 'missing').length;

  return {
    requiredCount: counted.length,
    verifiedCount,
    missingCount,
    requiredFiles: required.filter(f => f.type !== 'modify').map(f => f.path),
    missingFiles: [
      ...createResult.missing,
      ...deleteFailed,
    ],
    verifiedFiles: [...createResult.verified, ...deleteVerified],
    requiredFileDetails: fileDetails,
  };
}

// ═══════════════════════════════════════════════════════════
// P1: 多 Agent 角色分工（v0.62）
//   把单 agent 90 轮循环拆成 4 个专业角色：
//   Planner → Coder → Tester → Reviewer
//   每个角色有独立的 system prompt 和 tool 子集
// ═══════════════════════════════════════════════════════════

// 各角色的工具子集
const ROLE_TOOLS = {
  planner: [
    'agent_read_file', 'agent_read_dir_summary',
    'agent_search_files',
    'agent_git_status', 'agent_git_log', 'agent_git_branch',
  ],
  coder: [
    'agent_read_file', 'agent_read_dir_summary',
    'agent_search_files',
    'agent_write_file', 'agent_patch_file', 'agent_multi_patch',
    'agent_typescheck',
    'agent_git_status', 'agent_git_diff', 'agent_git_commit', 'agent_git_log',
    'agent_set_phase',
    'delegate_subtasks',
  ],
  tester: [
    'agent_read_file', 'agent_search_files',
    'agent_exec_command',
    'agent_db_query', 'agent_http_request',
    'browser_snapshot', 'browser_console',
    'agent_git_diff', 'agent_git_log',
    'agent_set_phase',
  ],
  reviewer: [
    'agent_read_file', 'agent_search_files', 'agent_read_dir_summary',
    'agent_git_diff', 'agent_git_log', 'agent_git_status',
  ],
};

// 各角色的 system prompt 附加段（追加到基础 AGENT_SYSTEM_PROMPT 之后）
const ROLE_PROMPTS = {
  planner: `\n\n## Role: Planner\nYour ONLY job is to understand the task and produce a plan. Do NOT write any code.\n\n### What to do:\n1. Explore the workspace structure (read key files to understand the project)\n2. Identify which files need to be created or modified\n3. Plan the implementation approach\n4. Output a detailed plan covering: files to change, approach, order of operations\n\n### Constraints:\n- You CANNOT write files or execute commands\n- Focus on understanding, not doing\n- Keep your plan concrete and actionable for the next agent (Coder)\n- Estimate the number of files and complexity`,

  coder: `\n\n## Role: Coder\nYour ONLY job is to write the code according to the plan. Do NOT run tests or verify.\n\n### What to do:\n1. Read the plan from the previous agent\n2. Create/modify files using agent_write_file and agent_patch_file\n3. Run agent_typescheck to verify TypeScript syntax\n4. Commit changes with agent_git_commit when done\n\n### Constraints:\n- You CANNOT execute arbitrary commands (no agent_exec_command)\n- You CANNOT browse the web or make HTTP requests\n- Focus on producing correct, working code\n- Call agent_set_phase to show progress through explore → design → write`,

  tester: `\n\n## Role: Tester\nYour ONLY job is to verify the code works correctly. Do NOT modify any files.\n\n### What to do:\n1. Read the modified files to understand what was changed\n2. Run tests, build commands, or verification scripts\n3. Check for errors, broken functionality, or edge cases\n4. Report what works and what doesn't\n\n### Constraints:\n- You CANNOT modify any files (no agent_write_file, no agent_patch_file)\n- You CAN run commands and make HTTP requests\n- If you find bugs, describe them clearly for the Reviewer`,

  reviewer: `\n\n## Role: Reviewer\nYour ONLY job is to evaluate the completed work against the task requirements.\n\n### What to do:\n1. Read the original task requirements\n2. Read the plan that was created\n3. Check the actual files that were created/modified\n4. Verify acceptance criteria are met\n5. Produce a final verdict: APPROVED (task done) or REJECTED (explain what's missing)\n\n### Constraints:\n- You CANNOT write files or execute commands\n- Read-only evaluation only\n- Be strict: if the task isn't complete, say so and explain what's missing`,
};

/**
 * 判断测试角色是否应获得 browser 工具（根据任务描述中的 URL/浏览器关键词）
 */
function testerNeedsBrowserTools(task) {
  const fullText = ((task.title || '') + ' ' + (task.description || '') + ' ' + (task.actual_behavior || '')).toLowerCase();
  return /https?:\/\/[^\s]+/.test(fullText) ||
    /浏览器|browser|网页|页面|preview|dist|404|500|403|渲染|dom/i.test(fullText);
}

/**
 * 多角色流水线执行（P1 核心）
 * 按 Planner → Coder → Tester → Reviewer 顺序执行，角色间传递上下文
 */
async function runMultiRoleSequence(task, options = {}) {
  const taskId = task.id;
  const projectId = task.project_id;
  const modelId = options.modelId || (modelStore.getDefaultGenModel() || {}).id;
  if (!modelId) throw Object.assign(new Error('No active model available'), { status: 500 });
  const model = modelStore.getById(modelId);
  if (!model) throw Object.assign(new Error('Model not found: ' + modelId), { status: 404 });
  const lang = options.lang || task.preferred_lang || 'zh';

  const { execute: runtimeExec } = require('./agent-runtime');

  // 构建基础 task context（复用现有逻辑）
  const taskContext = `# Task ${task.id}: ${task.title}\n\n${task.description || '(no description)'}\n\n**Type**: ${task.type || 'general'} | **Estimated**: ${task.estimated_hours || 'N/A'}h\n**Acceptance Criteria**: ${task.acceptance_criteria || task.acceptanceCriteria || '(not specified)'}`;

  // 为 tester 动态添加 browser 工具
  const testerTools = [...ROLE_TOOLS.tester];
  if (testerNeedsBrowserTools(task)) {
    testerTools.push('browser_click', 'browser_type');
  }

  // 共享进度回调（带角色前缀）
  let overallRound = 0;
  const totalRounds = 5 + 25 + 10 + 5; // planner + coder + tester + reviewer
  const saveProgress = (note) => {
    const now = new Date().toISOString();
    try {
      var logEntry = { time: now, action: 'multi_role', note };
      var { collection } = require('../db/connection');
      var t = collection('tasks').findOne(t => t.id === taskId);
      if (t) {
        var log = JSON.parse(t.execution_log || '[]');
        log.push(logEntry);
        if (log.length > 50) log.splice(0, log.length - 50);
        overallRound++;
        collection('tasks').update(t => t.id === taskId, {
          execution_log: JSON.stringify(log),
          progress: Math.min(100, Math.round((overallRound / totalRounds) * 100)),
          progress_note: note,
          last_progress_update: now,
        });
      }
    } catch (e) { /* silent */ }
  };

  // 构建基础 system prompt（复用现有 buildSystemPrompt 的 lang directive + skill loader）
  const baseSystemPrompt = buildSystemPrompt(task, lang);
  const previousAttempts = buildHistorySummary(task);
  // workspace 记忆
  let workspaceMemoryMsg = null;
  try {
    const workspaceMeta = require('./workspace-meta');
    const projectStore = require('../stores/project-store');
    const project = projectStore.getById(projectId);
    if (project) {
      const slug = project.slug || project.name;
      workspaceMemoryMsg = workspaceMeta.getSummaryForPrompt(slug, task.id);
    }
  } catch (e) { /* silent */ }

  // ── 执行流水线 ──
  const pipeline = [
    { name: 'planner', maxRounds: 5, tools: ROLE_TOOLS.planner, label: '📋 规划' },
    { name: 'coder',   maxRounds: 25, tools: ROLE_TOOLS.coder, label: '✏️ 写代码' },
    { name: 'tester',  maxRounds: 10, tools: testerTools, label: '🧪 测试' },
    { name: 'reviewer', maxRounds: 5, tools: ROLE_TOOLS.reviewer, label: '👀 审核' },
  ];

  const roleOutputs = {};
  let rejectVerdict = null;

  for (let idx = 0; idx < pipeline.length; idx++) {
    const phase = pipeline[idx];
    saveProgress(`[${phase.label}] 开始`);

    // 系统提示：基础 + 角色指令
    const roleSystemPrompt = baseSystemPrompt + ROLE_PROMPTS[phase.name];

    // 消息构建
    const msgs = [{ role: 'system', content: roleSystemPrompt }];

    if (idx === 0) {
      // Planner：注入 workspace + 历史 + 任务
      if (workspaceMemoryMsg) msgs.push({ role: 'user', content: workspaceMemoryMsg });
      if (previousAttempts) msgs.push({ role: 'user', content: previousAttempts + '\n\n注意：之前的尝试记录如上。请不要在规划中重复已被驳回过的方法。' });
      msgs.push({ role: 'user', content: taskContext });
    } else {
      // 非首个角色：注入前序角色输出（压缩到 1500 字内）
      for (let pi = 0; pi < idx; pi++) {
        const out = roleOutputs[pipeline[pi].name];
        if (out && out.content) {
          msgs.push({ role: 'user', content: `## ${pipeline[pi].label} 输出\n\n${out.content.slice(0, 1500)}` });
        }
      }
      // 重新加上原始任务
      msgs.push({ role: 'user', content: `---\n\n## 原始任务\n\n${taskContext}` });

      // reviewer 要求结构化输出
      if (phase.name === 'reviewer') {
        msgs.push({ role: 'user', content: '请给出最终审核结论。用以下格式回复：\n\n## 审核结论\n- 状态：APPROVED / REJECTED\n- 说明：...\n- 缺失项（如有）：...' });
      }
    }

    // 执行
    const runtimeResult = await runtimeExec({
      modelId: model.id,
      messages: msgs,
      toolNames: phase.tools,
      maxRounds: phase.maxRounds,
      context: { projectId, taskId },
      caller: 'task-agent-' + phase.name,
    });

    roleOutputs[phase.name] = runtimeResult;
    saveProgress(`[${phase.label}] 完成 (${(runtimeResult.content || '').length} chars)`);
    console.log(`[task-agent] ${phase.label} 完成: ${(runtimeResult.content || '').length} chars`);

    // 如果该角色失败（content 为空），提前退出
    if (!runtimeResult.content || runtimeResult.content.length < 10) {
      const errorMsg = `[${phase.label}] 输出为空，流水线中止`;
      console.error(`[task-agent] ${errorMsg}`);
      saveProgress(errorMsg);
      try {
        eventBus.emit('task.failed', {
          projectId,
          actor: { id: 'agent-acms-self', type: 'agent', name: 'ACMS Agent' },
          target: { type: 'task', id: taskId },
          payload: { error: errorMsg, failedRole: phase.name },
        });
      } catch (e) { /* 不阻塞 */ }
      return {
        taskId,
        modelUsed: model.id,
        analysis: errorMsg,
        completedAt: new Date().toISOString(),
        roles: Object.keys(roleOutputs).reduce((acc, k) => { acc[k] = { ok: !!roleOutputs[k].content }; return acc; }, {}),
      };
    }

    // reviewer 驳回检测
    if (phase.name === 'reviewer') {
      const upper = (runtimeResult.content || '').toUpperCase();
      if (upper.includes('REJECTED') || upper.includes('驳回') || upper.includes('不通过')) {
        rejectVerdict = runtimeResult.content;
      }
    }
  }

  // 汇总
  const finalOutput = roleOutputs['reviewer'] || {};
  const summary = rejectVerdict
    ? `[审核驳回]\n\n${rejectVerdict.slice(0, 2000)}`
    : `✅ 所有角色执行完成。\n\n${(finalOutput.content || '(无审核结论)').slice(0, 3000)}`;

  // P2: 通过 event-bus 通知系统
  const eventType = rejectVerdict ? 'task.review_rejected' : 'task.completed';
  try {
    eventBus.emit(eventType, {
      projectId,
      actor: { id: 'agent-acms-self', type: 'agent', name: 'ACMS Agent' },
      target: { type: 'task', id: taskId },
      payload: { summary: summary.slice(0, 300), multiRole: true, rejected: !!rejectVerdict },
    });
  } catch (e) { /* 不阻塞 */ }

  return {
    taskId,
    modelUsed: model.id,
    analysis: summary,
    completedAt: new Date().toISOString(),
    roles: Object.keys(roleOutputs).reduce((acc, k) => {
      acc[k] = { length: (roleOutputs[k].content || '').length };
      return acc;
    }, {}),
  };
}

module.exports = {
  executeTaskAgent,
  extractRequiredFiles,
  verifyFilesExist,
  auditTaskRequirements,
  generatePlan,
  PHASES,
  PHASE_META,
};

// ===== P0 v0.X: 构建任务历史摘要 — 注入 system prompt 防 agent 重复猜根因 =====
//   取最近 5 次 submission 的 notes（截 200 字）+ 配对的 review feedback
//   输出格式：markdown 段落，LLM 直接当上下文读
//   返回 null 表示没有历史（首次执行）→ 不污染 prompt
function buildHistorySummary(task) {
  const submissions = JSON.parse(task.submissions || '[]');
  const reviews = JSON.parse(task.reviews || '[]');
  if (submissions.length === 0 && reviews.length === 0) return null;

  const MAX_ENTRIES = 5;
  const NOTE_LIMIT = 200;
  const recentSubs = submissions.slice(-MAX_ENTRIES);

  const lines = [];
  lines.push('# 📜 Previous Attempts (DO NOT REPEAT THE SAME HYPOTHESIS)');
  lines.push('');
  if (recentSubs.length === 0) {
    lines.push('_No submissions yet — this is the first attempt._');
  } else {
    lines.push('| # | When | By | What was tried | Why it was rejected |');
    lines.push('|---|------|----|----|----|');
    // 按时间正序展示（最早在最上）
    recentSubs.forEach((s, i) => {
      const when = (s.submittedAt || '').slice(0, 19).replace('T', ' ');
      const by = (s.submittedBy || '').replace('agent-', '');
      const note = (s.notes || '(no notes)').replace(/\n/g, ' ').slice(0, NOTE_LIMIT);
      // 找这次 submit 之后的第一条 review（配对）
      const submitTime = new Date(s.submittedAt).getTime();
      const pairedReview = reviews.find(r => r.reviewedAt && new Date(r.reviewedAt).getTime() > submitTime);
      const verdict = pairedReview ? (pairedReview.verdict === 'approved' ? '✅' : '❌') : '⏳';
      const fb = pairedReview ? (pairedReview.feedback || '').replace(/\n/g, ' ').slice(0, NOTE_LIMIT) : '_pending review_';
      lines.push(`| ${i + 1} | ${when} | ${by} | ${note} | ${verdict} ${fb} |`);
    });
  }
  lines.push('');
  // 显式指引：禁止重蹈覆辙
  const rejectCount = reviews.filter(r => r.verdict === 'rejected').length;
  if (rejectCount > 0) {
    lines.push(`**This task has been rejected ${rejectCount} time(s).** Before writing code, re-read the rejection reasons above and verify your new hypothesis is actually different from what was already tried.`);
    if (task.rejected_count >= 3 || rejectCount >= 3) {
      lines.push('');
      lines.push('⚠️ **This task has been auto-escalated to `escalated` status** — repeated rejected attempts triggered the 3-strike rule. A human PM must manually unblock it before you can proceed further.');
    }
  }
  return lines.join('\n');
}

// ===== v0.X: 精简版 system prompt — 只放身份 + 铁律 =====
//   任务描述移到 user message（LLM 当用户意图理解，优先级高）
//   AGENT_SYSTEM_PROMPT 保持英文（LLM 效率），langDirective 在最前
function buildSystemPrompt(task, lang = 'zh') {
  const langDirective = lang === 'en'
    ? '## Output Language\n\n**You MUST respond in English.** All your analysis, summaries, explanations, error explanations, submit notes, and any free-form text you produce should be in English. (Code, file paths, and tool arguments stay as-is regardless of language.)\n'
    : '## 输出语言\n\n**你必须用中文回复。** 你所有的分析、总结、解释、错误说明、提交说明、任何自然语言输出都必须用中文。写代码前的思考、调工具前的推理步骤、分析问题的过程，**所有自然语言输出都必须是中文**。（代码、文件路径、工具参数保持原样不受语言切换影响。）\n';
  let prompt = langDirective + '\n\n' + AGENT_SYSTEM_PROMPT;

  // 加载匹配的 skill（身份级知识，保持在 system prompt 里）
  const matches = skillLoader.matchForTask(task);
  if (matches.length > 0) {
    const topSkill = matches[0].skill;
    const skillPrompt = skillLoader.buildSkillPrompt(topSkill.id);
    if (skillPrompt) {
      prompt += '\n\n# RELEVANT SKILL: ' + topSkill.name + '\n\n' + skillPrompt;
      console.log(`[agent-execute] Loaded skill "${topSkill.name}" (score=${matches[0].score}) for task ${task.id}`);
    }
  }
  return prompt;
}

// ===== v0.46: agent_typescheck 工具 — tsc --noEmit 包装 =====
const { execFile: _execFileTypescheck } = require('child_process');
const _fsTypescheck = require('fs');
const _pathTypescheck = require('path');

registerTool({
  name: 'agent_typescheck',
  description: 'Run TypeScript type checking on the workspace. Auto-detects tsconfig.json or jsconfig.json. Uses tsc --noEmit (no output files produced). Use after writing TypeScript files to catch type errors before tests.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Optional: specific file or directory to check. Defaults to workspace root.' },
    },
    required: [],
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!projectId) return { ok: false, error: 'NO_PROJECT_ID' };

    const projectStore = require('../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { ok: false, error: 'PROJECT_NOT_FOUND' };

    const slug = project.slug || project.name;
    const workspace = require('./workspace-service');
    const projectRoot = workspace.getProjectRoot(slug);

    // 检测 tsconfig.json 或 jsconfig.json
    const tsconfigPath = _pathTypescheck.join(projectRoot, 'tsconfig.json');
    const jsconfigPath = _pathTypescheck.join(projectRoot, 'jsconfig.json');
    let configFile = null;
    if (_fsTypescheck.existsSync(tsconfigPath)) configFile = 'tsconfig.json';
    else if (_fsTypescheck.existsSync(jsconfigPath)) configFile = 'jsconfig.json';
    else {
      // 没 config 文件 → 尝试直接 tsc 看是否有 TS 文件
      const tsFiles = _fsTypescheck.existsSync(projectRoot)
        ? require('child_process').execSync(`node -e "const fs=require('fs'),p=require('path');function walk(d){let r=[];try{for(const f of fs.readdirSync(d)){const fp=p.join(d,f);const s=fs.statSync(fp);if(s.isDirectory()&&!['node_modules','.git','dist','build'].includes(f))r=r.concat(walk(fp));else if(/\\.(ts|tsx)$/.test(f))r.push(fp);}}catch(e){}return r;}console.log(walk(process.argv[1]).length)" "${projectRoot}"`, { encoding: 'utf-8', timeout: 5000 }).trim()
        : '0';
      if (parseInt(tsFiles) === 0) {
        return {
          ok: false,
          error: 'NO_TYPESCRIPT_PROJECT',
          message: 'No tsconfig.json/jsconfig.json found and no .ts/.tsx files in workspace. Use node --check for syntax checking.',
        };
      }
      configFile = 'tsconfig.json';  // 让 tsc 自己报错说缺 config
    }

    // 跑 tsc --noEmit
    const target = args.path || '';
    const cmd = `npx --no-install tsc --noEmit${configFile ? ` -p ${configFile}` : ''}${target ? ` ${target}` : ''}`.trim();

    return new Promise((resolve) => {
      _execFileTypescheck('npx', ['--no-install', 'tsc', '--noEmit', ...(configFile ? ['-p', configFile] : []), ...(target ? [target] : [])], {
        cwd: projectRoot,
        timeout: 60000,
        maxBuffer: 1024 * 1024,
        shell: true,
      }, (err, stdout, stderr) => {
        const exitCode = err ? err.code || 1 : 0;
        resolve({
          ok: exitCode === 0,
          exitCode,
          configFile,
          target: target || '<workspace>',
          stdout: (stdout || '').slice(0, 5000),
          stderr: (stderr || '').slice(0, 5000),
          message: exitCode === 0
            ? `✅ TypeScript check passed (${configFile})`
            : `❌ TypeScript errors found (exit ${exitCode})`,
        });
      });
    });
  },
});

// ===== v0.46: generatePlan() — 单独生成实施计划，不执行 =====
//   Plan mode: PM 分派任务 → 调此函数生成 plan → 写 task.doc.plan → PM 在前端 modal 看 → approve/reject
//   approve 后再调 executeTaskAgent 真正执行
async function generatePlan(taskId, options = {}) {
  const task = taskStore.getById(taskId);
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 });

  const projectId = task.project_id;
  const modelId = options.modelId || (modelStore.getDefaultGenModel() || {}).id;
  if (!modelId) throw Object.assign(new Error('No active model available'), { status: 500 });

  const model = modelStore.getById(modelId);
  if (!model) throw Object.assign(new Error('Model not found: ' + modelId), { status: 404 });

  // P0 v0.X: lang 控制 plan summary / steps 字段的语言
  const lang = options.lang || task.preferred_lang || 'zh';

  const { callLLM } = require('./llm-adapter');

  // 让 LLM 读 workspace 后输出 JSON plan
  const taskContext = `# Task ${task.id}: ${task.title}

${task.description || '(no description)'}

**Type**: ${task.type || 'general'} | **Estimated**: ${task.estimated_hours || 'N/A'}h
**Acceptance Criteria**: ${task.acceptance_criteria || task.acceptanceCriteria || '(not specified)'}`;

  // P0 v0.X: 语言指令 — 控制 summary / steps / risks 字段文本
  const langNote = lang === 'en'
    ? '\n\nIMPORTANT: Write the "summary", "steps", and "risks" fields in English. (JSON keys stay in English, file paths in code stay as-is.)'
    : '\n\n重要：所有 "summary"、"steps"、"risks" 字段都用中文写。（JSON 的 key 名保持英文，代码里的文件路径保持原样。）';

  const planPrompt = `You are planning the implementation of a coding task. Based on the task description below, output a structured JSON plan ONLY (no markdown, no commentary, no tool calls).

The plan must include:
- summary: one-line approach
- files: array of {path, purpose, estimatedLines}
- steps: ordered execution steps as strings
- risks: array of known risks/assumptions

Use your knowledge of common project structures to infer likely files. Be specific about file paths (e.g. "src/core/GameState.js" not "the main file").${langNote}

Task:
${taskContext}

Respond with ONLY valid JSON in this exact shape:
{"summary": "...", "files": [{"path": "...", "purpose": "...", "estimatedLines": 100}], "steps": ["1. ...", "2. ..."], "risks": ["..."]}`;

  console.log(`[agent-plan] Task ${taskId} | model=${model.id}`);

  let planJson;
  try {
    const result = await callLLM(modelId, [
      { role: 'system', content: 'You are a planning assistant. Output ONLY valid JSON, no markdown fences, no commentary.' },
      { role: 'user', content: planPrompt },
    ], {
      temperature: 0.3,
      maxTokens: 2000,
      jsonMode: true,
      projectId,
      caller: 'plan',
    });

    // 容错 parse JSON
    const content = (result.content || '').trim();
    try {
      planJson = JSON.parse(content);
    } catch (e) {
      // 尝试从 markdown fence 里抠
      const fenceMatch = content.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
      if (fenceMatch) planJson = JSON.parse(fenceMatch[1]);
      else throw new Error('LLM 返回的不是 JSON: ' + content.slice(0, 200));
    }
  } catch (e) {
    console.error(`[agent-plan] LLM call failed: ${e.message}`);
    throw Object.assign(new Error('Plan generation failed: ' + e.message), { status: 500 });
  }

  // 校验 + 兜底
  const plan = {
    summary: planJson.summary || task.title,
    files: Array.isArray(planJson.files) ? planJson.files.map(f => ({
      path: f.path || '',
      purpose: f.purpose || '',
      estimatedLines: f.estimatedLines || 0,
    })).filter(f => f.path) : [],
    steps: Array.isArray(planJson.steps) ? planJson.steps.filter(s => typeof s === 'string') : [],
    risks: Array.isArray(planJson.risks) ? planJson.risks.filter(r => typeof r === 'string') : [],
    createdAt: new Date().toISOString(),
    model: model.id,
    approved: false,
    rejectedReason: '',
  };

  taskStore.update(taskId, {
    plan,
    plan_status: 'pending',
  });

  console.log(`[agent-plan] Task ${taskId} | ${plan.files.length} files | ${plan.steps.length} steps`);

  return { taskId, plan };
}

// ===== v0.46: agent_plan 工具 — 让 agent 一次性输出实施计划 =====
//   LLM 在第一轮调这个工具，写 plan 到 task.doc.plan，PM 在前端 modal 看 + 决定 approve/reject
registerTool({
  name: 'agent_plan',
  description: 'Generate an implementation plan for the current task. Call this FIRST after exploring the workspace. Writes the plan to task.doc.plan for PM review. The PM will approve or reject the plan; only after approval will the agent proceed to actual execution.',
  parameters: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'One-line summary of the approach (e.g. "Add 3 files: GameState.js, GameTypes.js, GameState.test.js")' },
      files: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            purpose: { type: 'string' },
            estimatedLines: { type: 'number' },
          },
        },
        description: 'List of files to be created/modified with purpose',
      },
      steps: {
        type: 'array',
        items: { type: 'string' },
        description: 'Ordered execution steps (e.g. ["1. Create GameTypes.js with constants", "2. Create GameState.js with state machine", "3. Create GameState.test.js with 5 test cases"])',
      },
      risks: {
        type: 'array',
        items: { type: 'string' },
        description: 'Known risks or assumptions the PM should be aware of',
      },
    },
    required: ['summary', 'files', 'steps'],
  },
  async handler(args, ctx = {}) {
    const { taskId } = ctx;
    if (!taskId) return { ok: false, error: 'NO_TASK_ID' };

    const plan = {
      summary: args.summary,
      files: args.files || [],
      steps: args.steps || [],
      risks: args.risks || [],
      createdAt: new Date().toISOString(),
      approved: false,
      rejectedReason: '',
    };

    taskStore.update(taskId, {
      plan,
      plan_status: 'pending',
    });

    return {
      ok: true,
      plan,
      message: `Plan written (${plan.files.length} files, ${plan.steps.length} steps). Awaiting PM approval.`,
    };
  },
});

// ═══════════════════════════════════════════════════════════
// delegate_subtasks — 并行子任务委派
//   让 agent 把一个大任务拆成多个子任务并行执行
// ═══════════════════════════════════════════════════════════
registerTool({
  name: 'delegate_subtasks',
  description: '把当前任务拆成多个子任务并行执行。每个子任务有独立的目标和工具集。'
    + '适合并行处理多个文件、同时调研多个方案、前后端并行开发等场景。'
    + '返回每个子任务的执行摘要。最多同时 3 个子任务。'
    + '示例: delegate_subtasks({tasks: [{goal: "修复登录页样式", tools: ["read","write"]}, {goal: "添加 API 测试", tools: ["read","exec"]}]})',
  parameters: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        description: '子任务数组，每个子任务包含 goal（目标描述）和 tools（工具集名称列表）',
        items: {
          type: 'object',
          properties: {
            goal: { type: 'string', description: '子任务目标（必填），清晰描述要做什么' },
            tools: { type: 'array', description: '工具集名称列表：read, write, git, exec, browser, db, http', items: { type: 'string' } },
          },
          required: ['goal'],
        },
      },
    },
    required: ['tasks'],
  },
  async handler(args, ctx = {}) {
    var tasks = args.tasks || [];
    if (!Array.isArray(tasks) || tasks.length === 0) return { ok: false, error: 'NO_TASKS' };
    if (tasks.length > 3) return { ok: false, error: 'TOO_MANY_TASKS' };

    const { execute: runtimeExec } = require('./agent-runtime');
    var TOOLSET_MAP = {
      read: ['agent_read_file', 'agent_search_files', 'agent_list_files'],
      write: ['agent_read_file', 'agent_search_files', 'agent_write_file', 'agent_patch_file', 'agent_multi_patch'],
      git: ['agent_git_status', 'agent_git_diff', 'agent_git_commit', 'agent_git_log'],
      exec: ['agent_read_file', 'agent_search_files', 'agent_exec_command'],
      browser: ['browser_snapshot', 'browser_console', 'browser_click', 'browser_type'],
      db: ['agent_db_query'],
      http: ['agent_http_request'],
    };

    var results = await Promise.all(tasks.map(async function(subtask, idx) {
      var toolNames = (subtask.tools || ['read', 'write']).flatMap(function(t) { return TOOLSET_MAP[t] || []; });
      toolNames = [...new Set(toolNames)];
      var msgs = [
        { role: 'system', content: '你是一个专注的子任务 Agent。你的目标明确且范围有限。完成任务后给出简洁总结（3-5 行）。工具可用：' + toolNames.join(', ') },
        { role: 'user', content: subtask.goal },
      ];
      try {
        var start = Date.now();
        var result = await runtimeExec({ messages: msgs, toolNames: toolNames, maxRounds: 10, context: ctx, caller: 'delegate-' + idx });
        return { index: idx, goal: subtask.goal.slice(0, 100), ok: true, summary: (result.content || '').slice(0, 500), elapsed: (Date.now() - start) + 'ms' };
      } catch (e) {
        return { index: idx, goal: subtask.goal.slice(0, 100), ok: false, error: e.message };
      }
    }));

    return { ok: true, total: results.length, successCount: results.filter(function(r) { return r.ok; }).length, failedCount: results.filter(function(r) { return !r.ok; }).length, results: results };
  },
});
