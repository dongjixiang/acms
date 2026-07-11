// ACMS AI 工具层 — Agent 自主执行（v0.23 核心，LLM 探索工作区 + 修改文件 + 自动提交）
const modelStore = require('../stores/model-store');
const taskStore = require('../stores/task-store');
const { runToolLoop } = require('./llm-adapter');
const skillLoader = require('./skill-loader');

const AGENT_SYSTEM_PROMPT = `You are an ACMS autonomous agent. You have been assigned a task in a project workspace.

Your capabilities:
1. agent_list_files — List all files in the workspace (recursive tree)
2. agent_read_file — Read a specific file's content (up to 100000 chars). Supports offset/limit for large files.
3. agent_read_files — Read multiple files in one call (up to 20 paths per call). Saves N rounds vs N separate reads.
4. agent_read_dir_summary — Get directory summary: list files with first N lines of each. Saves many rounds vs list+read.
5. agent_search_files — Search for text patterns across all files
6. agent_exec_command — Execute a sandboxed command (node, npm, git, ls, cat, etc.)
7. agent_write_file — Write or overwrite a file in the workspace (creates parent dirs)
8. agent_patch_file — Apply a targeted patch to an existing file (find old_string, replace with new_string). Supports indent-aware matching.
9. agent_multi_patch — Apply multiple patches to one or more files in a single call.
10. workspace_isolate — Create an isolated scratch workspace for this agent session (copies project workspace).
11. workspace_merge — Merge changes from scratch workspace back to the main project workspace.
12. browser_snapshot — Get the accessibility tree of the current page. Returns interactive elements with ref IDs (@e1, @e2) for clicking. Use to understand page structure and verify content.
13. browser_console — Get browser console output and JS errors. Optionally evaluate JavaScript expressions in the page context. Use to detect silent errors and read page state.
14. browser_click — Click on an element identified by ref ID from browser_snapshot. Use to interact with buttons and links.
15. browser_type — Type text into an input field identified by ref ID. Clears field first, then types.
16. browser_screenshot — Take a screenshot of the current page. Returns base64 PNG or saves to file. Use for visual verification.
17. agent_git_status — Show working tree status (modified, staged, untracked files).
18. agent_git_diff — Show changes between working tree and last commit.
19. agent_git_commit — Stage files and create a commit with message.
20. agent_git_log — Show commit log (recent changes history).
21. agent_git_branch — List branches or create a new branch.
22. agent_db_query — Execute a SQL SELECT query against the ACMS SQLite database. Use to check task status, submissions, reviews, execution logs.
23. agent_ssh_execute — Execute a command on a remote server via SSH (supports 120, local, custom hosts).
24. agent_ssh_check — Check SSH connectivity to a configured host.
25. agent_http_request — Send HTTP requests (GET/POST/PUT/DELETE) to test APIs or fetch external data.

Your goal:
1. Use read tools to explore the project workspace and understand the current state
2. Analyze what the task requires based on the code and files you find
3. Execute the task: create new files, modify existing files, or run commands as needed
4. Verify your work: read back files you wrote, run syntax checks (node --check), run tests
5. Use browser tools to verify UI changes: snapshot the page, check console for errors, click elements, take screenshots
6. Use git tools to track changes: status, diff, commit, log
7. Use database tools to check ACMS task state: submissions, reviews, execution logs
8. Use HTTP tools to test APIs and external services
9. Use SSH tools to debug on remote servers
10. Produce a summary of what you did: which files were created/modified, what changes were made, and any verification results

Rules:
- Explore briefly (1-2 tool calls), then act. Do not over-explore.
- Prefer agent_read_files (batch) over multiple agent_read_file calls when you need to see 2+ files.
- Prefer agent_read_dir_summary for "what's in this directory" questions.
- After writing a file, read it back to verify the content was written correctly.
- For code files, run "node --check <path>" or equivalent to verify syntax.
- Never delete files. If you need to modify, read first, then write the full updated content.
- Keep file content reasonable: avoid writing files larger than 200KB.
- If the task is analysis-only (e.g. documentation review), do not modify files unless asked.
- Be specific in your summary: reference actual file paths, line numbers, and code snippets.
- Respond in the same language as the task description (Chinese if task is in Chinese).
- Keep your final summary concise but actionable. Maximum 2000 words.

Workspace Environment Hints (v0.26):
- Platform: detect via OS — \`ls\` is NOT available on Windows; use \`node -e "require('fs').readdirSync(...).join('\\\\n')"\` or \`agent_list_files\` instead.
- Shell sandbox: \`cmd.exe\`, \`cd\`, \`powershell\` are blocked for security. Use \`node\` /\`npm\` /\`git\` directly with absolute or relative paths from workspace root.
- \`agent_list_files\` already filters out \`_*\` / \`.git\` / \`node_modules\` by default — these are NOT relevant task files, ignore their content if you find them.
- For \`agent_exec_command\`: \`cmd\` runs in the workspace root; you don't need to \`cd\` into subdirectories.

Workflow Discipline (v0.26):
- Round 1-2: explore workspace structure (one \`agent_list_files\` + targeted \`agent_read_file\`).
- Round ≥ 3: start writing files. Do NOT keep exploring after you have enough context.
- After each \`agent_write_file\`: if it's a \`.js\` file, the tool auto-runs \`node --check\` for you — read the result.
- When writing/overwriting an existing file: read it first to preserve existing methods/imports; do NOT clear and rewrite smaller versions.
- After writing all claimed files: produce final summary and end the loop. Do NOT keep verifying endlessly.

Critical: You MUST actually call tools (v0.27):
- "I will write GameState.js" in your final summary does NOT create the file. Only an actual agent_write_file tool call counts as writing.
- The system will reject your final answer if you never called agent_write_file but the task requires writing files.
- If you intend to write a file, you MUST call agent_write_file — describing intent is not enough.
- After every write_file call, verify by reading the result (response.ok === true means the file was written to disk).`;

async function executeTaskAgent(taskId, options = {}) {
  const task = taskStore.getById(taskId);
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 });

  const projectId = task.project_id;
  const modelId = options.modelId || (modelStore.getDefaultGenModel() || {}).id;
  if (!modelId) throw Object.assign(new Error('No active model available'), { status: 500 });

  const model = modelStore.getById(modelId);
  if (!model) throw Object.assign(new Error('Model not found: ' + modelId), { status: 404 });

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
  const taskContext = `# Task ${task.id}: ${task.title}

${task.description || '(no description)'}

**Type**: ${task.type || 'general'} | **Estimated**: ${task.estimated_hours || 'N/A'}h
**Acceptance Criteria**: ${task.acceptance_criteria || task.acceptanceCriteria || '(not specified — derive from the task description above)'}
**Required Skills**: ${task.required_skills || '{}'}`;

  const messages = [
    // v0.29 fix: 把 taskContext + goal 移到 system prompt（持久在 attention 里）
    //   根因：ACMS 之前 goal 在 user message，多轮后 messages 累积，goal 被推到 attention 边缘
    //   Hermes 的 delegate_task subagent 把 goal 放 system prompt，每轮 LLM 调用都在 attention
    //   这就是为啥 MiniMax-M3 在 Hermes 不装睡但在 ACMS 装睡
    // v0.45: 加载匹配的 skill 注入 system prompt
    { role: 'system', content: buildSystemPrompt(task, taskContext, steerMessages) },
    // v0.30 fix: 如果多多手动 steer，把 user steerMessage 放在 messages[1]（紧跟 system prompt 后）
    ...steerMessages,
    { role: 'user', content: 'Start by listing the workspace files to understand the project structure, then read relevant files and complete the task.' },
  ];

  console.log(`[agent-execute] Task ${taskId} | model=${model.id} | project=${projectId}`);

  const toolNames = ['agent_read_file', 'agent_read_files', 'agent_read_dir_summary', 'agent_list_files', 'agent_search_files', 'agent_exec_command', 'agent_write_file', 'agent_patch_file', 'agent_multi_patch', 'workspace_isolate', 'workspace_merge', 'browser_snapshot', 'browser_console', 'browser_click', 'browser_type', 'browser_screenshot', 'agent_git_status', 'agent_git_diff', 'agent_git_commit', 'agent_git_log', 'agent_git_branch', 'agent_db_query', 'agent_ssh_execute', 'agent_ssh_check', 'agent_http_request'];

  let analysis;
  try {
    // v0.35: 进度回调 — 每轮写 execution_log + progress
    const taskForProgress = { ...task };
    const saveProgress = (round, maxRounds, message, tools) => {
      const now = new Date().toISOString();
      const logEntry = {
        time: now,
        action: `round_${round}/${maxRounds}`,
        note: message + (tools?.length ? ` [${tools.join(', ')}]` : ''),
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

    analysis = await runToolLoop(model.id, messages, {
      toolNames,
      context: { projectId, taskId },
      maxRounds: 90,
      maxTokens: options.maxTokens ?? 32000,
      onProgress: saveProgress,
    });
  } catch (e) {
    console.error(`[agent-execute] runToolLoop failed: ${e.message}`);
    analysis = `[Agent execution failed: ${e.message}]\n\nTask context:\n${taskContext}`;
  }

  console.log(`[agent-execute] Task ${taskId} completed. Analysis length: ${(analysis || '').length} chars`);

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

  const claimed = new Set();
  const VALID_EXT = /\.(js|ts|jsx|tsx|mjs|cjs|json|md|markdown|py|yml|yaml|toml|sh|bash|html|htm|css|scss|sass|less|vue|svelte|sql|txt|env|gitignore|dockerfile|Dockerfile|lock|csv|xml|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|eot|mp[34]|webm|ogg|wav|pdf)$/i;
  const isValidPath = (p) => {
    if (typeof p !== 'string' || p.length < 4 || p.length > 200) return false;
    if (!p.includes('/')) return false;
    if (!VALID_EXT.test(p)) return false;
    return true;
  };

  // Pattern 1: backtick-wrapped paths
  const backtickRe = /`([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)`/g;
  let m;
  while ((m = backtickRe.exec(text)) !== null) {
    const p = m[1];
    if (!/^(https?:|\/|~)/.test(p) && isValidPath(p)) claimed.add(p);
  }

  // Pattern 2: 动词 + 路径（创建/写入/修改/生成 file）
  const verbRe = /\b(?:创建|写入|修改|生成|创建|编写|新建|建立|implement|create|write|modify|change|build|add|generate)\s+[`"']?([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)[`"']?/gi;
  while ((m = verbRe.exec(text)) !== null) {
    const p = m[1];
    if (!/^(https?:|\/)/.test(p) && isValidPath(p)) claimed.add(p);
  }

  // Pattern 3: markdown list items
  const listRe = /^\s*[-*]\s+[`"']?([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)[`"']?/gm;
  while ((m = listRe.exec(text)) !== null) {
    const p = m[1];
    if (!/^(https?:|\/)/.test(p) && isValidPath(p)) claimed.add(p);
  }

  return [...claimed];
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
 * 返回: { requiredCount, verifiedCount, missingCount, requiredFiles, missingFiles, verifiedFiles }
 */
function auditTaskRequirements(projectId, taskDoc) {
  const required = extractRequiredFiles(taskDoc);
  const result = verifyFilesExist(projectId, required);
  return {
    requiredCount: required.length,
    verifiedCount: result.verified.length,
    missingCount: result.missing.length,
    requiredFiles: required,
    missingFiles: result.missing,
    verifiedFiles: result.verified,
  };
}

module.exports = {
  executeTaskAgent,
  extractRequiredFiles,
  verifyFilesExist,
  auditTaskRequirements,
};

// ===== v0.45: 构建 system prompt（含 skill 注入）=====
function buildSystemPrompt(task, taskContext, steerMessages) {
  // 基础 agent prompt
  let prompt = AGENT_SYSTEM_PROMPT + '\n\n# YOUR SPECIFIC GOAL FOR THIS TASK\n\n' + taskContext + '\n\n# DO NOT STOP UNTIL:\n1. Called `agent_write_file` for every file mentioned in the task description (and any tests required by acceptance criteria)\n2. Verified each file via `agent_read_file` (response.ok === true) or by listing it back\n3. Run `node --check` for any `.js` files you wrote\n\nReturning a summary without writing the files = task failure. The system will detect this and force you to retry.';

  // 加载匹配的 skill
  const matches = skillLoader.matchForTask(task);
  if (matches.length > 0) {
    // 只加载得分最高的 skill（避免 prompt 过长）
    const topSkill = matches[0].skill;
    const skillPrompt = skillLoader.buildSkillPrompt(topSkill.id);
    if (skillPrompt) {
      prompt += '\n\n# RELEVANT SKILL: ' + topSkill.name + '\n\n' + skillPrompt;
      console.log(`[agent-execute] Loaded skill "${topSkill.name}" (score=${matches[0].score}) for task ${task.id}`);
    }
  }

  return prompt;
}
