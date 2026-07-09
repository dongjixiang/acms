// ACMS AI 工具层 — Agent 自主执行（v0.23 核心，LLM 探索工作区 + 修改文件 + 自动提交）
// 原 ai-tools-service.js L610-689 提取
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
- Keep your final summary concise but actionable. Maximum 2000 words.`;

async function executeTaskAgent(taskId, options = {}) {
  const task = taskStore.getById(taskId);
  if (!task) throw Object.assign(new Error('Task not found'), { status: 404 });

  const projectId = task.project_id;
  const modelId = options.modelId || (modelStore.getDefaultGenModel() || {}).id;
  if (!modelId) throw Object.assign(new Error('No active model available'), { status: 500 });

  const model = modelStore.getById(modelId);
  if (!model) throw Object.assign(new Error('Model not found: ' + modelId), { status: 404 });

  const taskContext = [
    `Task ID: ${task.id}`,
    `Title: ${task.title}`,
    `Description: ${task.description || '(none)'}`,
    `Type: ${task.type || 'general'}`,
    `Estimated Hours: ${task.estimated_hours || 'N/A'}`,
    `Acceptance Criteria: ${task.acceptance_criteria || task.acceptanceCriteria || '(not specified)'}`,
    `Required Skills: ${task.required_skills || '{}'}`,
  ].join('\n');

  const messages = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    { role: 'user', content: `Please execute the following task. Explore the workspace first, then create or modify files as needed, and verify your work.\n\n${taskContext}\n\nStart by listing the workspace files to understand the project structure, then read relevant files and complete the task.` },
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

module.exports = { executeTaskAgent };
