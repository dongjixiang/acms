// ACMS 内建工具 — Agent 阶段切换
// 让 agent 在工作流阶段（explore/design/write/test/fix）之间切换
const { registerTool } = require('../../services/tool-registry');

const PHASES = ['explore', 'design', 'write', 'test', 'fix'];

const PHASE_META = {
  explore: { icon: '🔍', label: '探索', color: '#94a3b8' },
  design:  { icon: '📝', label: '设计', color: '#8b5cf6' },
  write:   { icon: '✏️', label: '写代码', color: '#3b82f6' },
  test:    { icon: '🧪', label: '测试', color: '#10b981' },
  fix:     { icon: '🔧', label: '修复', color: '#f59e0b' },
};

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

    const taskStore = require('../../stores/task-store');
    const task = taskStore.getById(taskId);
    if (!task) return { error: 'TASK_NOT_FOUND', ok: false };

    const history = JSON.parse(task.phase_history || '[]');

    // phase 防抖 — 同一 phase 连续 ≥3 次切换时警告
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
