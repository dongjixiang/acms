// ACMS AI 工具层 — Agent 自主执行（v0.23 核心，LLM 探索工作区 + 修改文件 + 自动提交）
const modelStore = require('../stores/model-store');
const taskStore = require('../stores/task-store');
const { runToolLoop } = require('./llm-adapter');

const AGENT_SYSTEM_PROMPT = `You are an ACMS autonomous agent. You have been assigned a task in a project workspace.

Your capabilities:
1. agent_list_files — List all files in the workspace (recursive tree)
2. agent_read_file — Read a specific file's content (max 8000 chars)
3. agent_search_files — Search for text patterns across all files
4. agent_exec_command — Execute a sandboxed command (node, npm, git, ls, cat, etc.)
5. agent_write_file — Write or overwrite a file in the workspace (creates parent dirs)

Your goal:
1. Use read tools to explore the project workspace and understand the current state
2. Analyze what the task requires based on the code and files you find
3. Execute the task: create new files, modify existing files, or run commands as needed
4. Verify your work: read back files you wrote, run syntax checks (node --check), run tests
5. Produce a summary of what you did: which files were created/modified, what changes were made, and any verification results

Rules:
- Explore briefly (1-2 tool calls), then act. Do not over-explore.
- After writing a file, read it back to verify the content was written correctly.
- For code files, run "node --check <path>" or equivalent to verify syntax.
- Never delete files. If you need to modify, read first, then write the full updated content.
- Keep file content reasonable: avoid writing files larger than 50KB.
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
    { role: 'system', content: AGENT_SYSTEM_PROMPT + '\n\n# YOUR SPECIFIC GOAL FOR THIS TASK\n\n' + taskContext + '\n\n# DO NOT STOP UNTIL:\n1. Called `agent_write_file` for every file mentioned in the task description (and any tests required by acceptance criteria)\n2. Verified each file via `agent_read_file` (response.ok === true) or by listing it back\n3. Run `node --check` for any `.js` files you wrote\n\nReturning a summary without writing the files = task failure. The system will detect this and force you to retry.' },
    // v0.30 fix: 如果多多手动 steer，把 user steerMessage 放在 messages[1]（紧跟 system prompt 后）
    ...steerMessages,
    { role: 'user', content: 'Start by listing the workspace files to understand the project structure, then read relevant files and complete the task.' },
  ];

  console.log(`[agent-execute] Task ${taskId} | model=${model.id} | project=${projectId}`);

  const toolNames = ['agent_read_file', 'agent_list_files', 'agent_search_files', 'agent_exec_command', 'agent_write_file'];

  let analysis;
  try {
    analysis = await runToolLoop(model.id, messages, {
      toolNames,
      context: { projectId, taskId },
      maxRounds: 20,
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

// ===== Agent Claims 验证（v0.23 防「agent 撒谎说成功」核心防御）=====
// Agent 完成 LLM loop 后，可能在 summary 中声称"wrote README.md"但实际未真写
// 此函数提取声称路径 → 对每个 file 在 workspace 里 readFile 验证
// 任何缺失 → 由 route 调用方强制任务进 failed

function extractClaimedFiles(analysis) {
  if (!analysis || typeof analysis !== 'string') return [];
  const claimed = new Set();

  // Pattern 1: backtick-wrapped paths（最可靠，agent 通常这样标记文件）
  const backtickRe = /`([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)`/g;
  let m;
  while ((m = backtickRe.exec(analysis)) !== null) {
    const p = m[1];
    if (!/^(https?:|\/|[.~])/.test(p) && p.length >= 4 && p.length <= 200) {
      claimed.add(p);
    }
  }

  // Pattern 2: 动词 + 路径
  const verbRe = /\b(?:wrote|created|added|saved|modified|updated|generated|implemented|built)\s+[`"\']?([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)[`"\']?/gi;
  while ((m = verbRe.exec(analysis)) !== null) {
    const p = m[1];
    if (!/^(https?:|\/)/.test(p) && p.length >= 4) {
      claimed.add(p);
    }
  }

  // Pattern 3: markdown 列表项里的路径 (- `file` / * file)
  const listRe = /^\s*[-*]\s+[`"\']?([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)[`"\']?/gm;
  while ((m = listRe.exec(analysis)) !== null) {
    const p = m[1];
    if (!/^(https?:|\/)/.test(p) && p.length >= 4) {
      claimed.add(p);
    }
  }

  return [...claimed];
}

function verifyClaimsExist(projectId, claimedPaths) {
  const out = { verified: [], missing: [] };
  if (!Array.isArray(claimedPaths) || claimedPaths.length === 0) return out;
  const projectStore = require('../stores/project-store');
  const project = projectStore.getById(projectId);
  if (!project) {
    return { verified: [], missing: claimedPaths.map(p => ({ path: p, reason: 'PROJECT_NOT_FOUND' })) };
  }
  const slug = project.slug || project.name;
  const workspace = require('./workspace-service');
  for (const p of claimedPaths) {
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

function auditAgentClaims(projectId, analysis) {
  const claimed = extractClaimedFiles(analysis);
  const result = verifyClaimsExist(projectId, claimed);
  return {
    claimedCount: claimed.length,
    verifiedCount: result.verified.length,
    missingCount: result.missing.length,
    claimedFiles: claimed,
    missingFiles: result.missing,
    verifiedFiles: result.verified,
  };
}

module.exports = {
  executeTaskAgent,
  extractClaimedFiles,
  verifyClaimsExist,
  auditAgentClaims,
};
