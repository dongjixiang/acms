// ACMS 内建工具 — Agent 实施计划
// 让 agent 在 explore 之后一次性输出结构化的实施计划，PM 审批后执行
const { registerTool } = require('../../services/tool-registry');

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

    const taskStore = require('../../stores/task-store');
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
