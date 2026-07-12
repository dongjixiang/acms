// ACMS Decomposer Agent — 编排者角色（v0.45）
// 只负责把需求拆成可执行的任务，不执行任何代码
// 遵循 Hermes kanban-orchestrator 的"don't do the work yourself"原则

const taskStore = require('../stores/task-store');
const modelStore = require('../stores/model-store');
const { callLLM } = require('./llm-adapter');

const DECOMPOSER_SYSTEM_PROMPT = `You are an ACMS task decomposer. Your ONLY job is to decompose a requirement into executable tasks.

RULES:
1. NEVER write code, NEVER execute commands, NEVER modify files
2. ONLY create tasks and link them with dependencies
3. For each task, define: title, description, type, estimated_hours, required_skills
4. Tasks should be atomic: 2-5 minutes of focused work each
5. Identify integration/entry-point tasks that connect all subsystems
6. Output ONLY a JSON array of tasks

Task decomposition playbook:
- Step 1: Understand the requirement's end-to-end flow
- Step 2: Extract independent workstreams (parallel lanes)
- Step 3: Identify dependencies between workstreams
- Step 4: Create tasks with parent links for dependency gating
- Step 5: Include integration tasks (entry point, navigation, glue code)

Output format (JSON array):
[
  {
    "title": "Brief task title",
    "description": "Detailed task description with acceptance criteria",
    "type": "coding|testing|documentation|review",
    "estimated_hours": 2,
    "required_skills": {"coding": 1},
    "depends_on": ["T-PARENT1", "T-PARENT2"] // task IDs this depends on
  }
]`;

/**
 * 分解需求为可执行任务
 * @param {string} requirementText - 需求文本（SRS 或需求描述）
 * @param {string} projectId - 项目 ID
 * @param {string} parentId - 父需求 ID
 * @param {object} options - { modelId, maxTasks }
 * @returns {Promise<{tasks: Array, taskGraph: object}>}
 */
async function decomposeRequirement(requirementText, projectId, parentId, options = {}) {
  const modelId = options.modelId || modelStore.getDefaultGenModel()?.id;
  if (!modelId) throw new Error('No active model available');

  const prompt = [
    { role: 'system', content: DECOMPOSER_SYSTEM_PROMPT },
    { role: 'user', content: `Decompose the following requirement into executable tasks:\n\n${requirementText}` },
  ];

  const result = await callLLM(modelId, prompt, { maxTokens: 4000 });
  const content = typeof result.content === 'string' ? result.content : '';

  // 提取 JSON 数组
  let tasks;
  try {
    // 尝试从内容中提取 JSON
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      tasks = JSON.parse(jsonMatch[0]);
    } else {
      tasks = JSON.parse(content);
    }
  } catch (e) {
    throw Object.assign(new Error(`Failed to parse decomposer output: ${e.message}`), { status: 500 });
  }

  // 验证任务格式
  const validated = tasks.map((t, i) => ({
    title: t.title || `Task ${i + 1}`,
    description: t.description || '',
    type: t.type || 'coding',
    estimated_hours: t.estimated_hours || 2,
    required_skills: t.required_skills || {},
    depends_on: t.depends_on || [],
  }));

  return {
    tasks: validated,
    taskGraph: validated.reduce((graph, t, i) => {
      graph[`T-TEMP-${i}`] = t;
      return graph;
    }, {}),
  };
}

module.exports = {
  decomposeRequirement,
  DECOMPOSER_SYSTEM_PROMPT,
};
