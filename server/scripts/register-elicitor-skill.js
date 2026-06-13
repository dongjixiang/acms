#!/usr/bin/env node
// v0.4 Phase 0.2：一次性把 elicitor SKILL 注册到 ACMS json store（实际是 SQLite skills 表）
//
// 用法：
//   node server/scripts/register-elicitor-skill.js
//
// 可重复执行：已存在会 update，不存在会 create。
// 注册后 SKILL 会出现在 GET /api/skills 列表里。

const skillStore = require('../stores/skill-store');

const ELICITOR = {
  id: 'skill-requirement-elicitor',
  name: '需求启发师',
  description: '通过诊断→工具箱→固化的三段式流程，帮用户在想法阶段把隐性偏好变成可执行的边界',
  category: 'analysis',
  matchOn: {
    phase: ['idea'],
    conditions: [
      { clarity: ['low', 'medium'] },
      { chat_round: [1, 2, 3] },
    ],
  },
  execution: {
    mode: 'llm',
    steps: [
      { id: 'diagnose', prompt: 'prompts/diagnose.md', output: 'diagnosis.type + diagnosis.guide' },
      { id: 'toolbox', prompt: 'prompts/toolbox-{diagnosis.type}.md', output: 'elicited_boundaries[]' },
      { id: 'solidify', prompt: 'prompts/solidify.md', output: 'structured_output' },
    ],
    toolboxes: {
      vague:        { methods: ['场景压缩', '极端对比', '视觉锚点'] },
      conflicted:   { methods: ['反向清单', '失败预演', '替身视角'] },
      blank:        { methods: ['原型破坏', '倒计时失效', '荒谬方案'] },
    },
    deliverables: [
      'elicited_boundaries: [{ dimension, value, confidence }]',
      'diagnosis_summary: string',
      'next_step_hint: string',
    ],
  },
  taskTemplate: {
    title: '启发需求: {title}',
    type: 'analysis',
    estimatedHours: 0.5,
    notes: 'idea 阶段专用，不进 agent-worker 任务流（v0.4 Phase 0 安全网阶段）',
  },
};

function main() {
  const existing = skillStore.getById(ELICITOR.id);
  if (existing) {
    console.log(`[register-elicitor] SKILL 已存在（id=${ELICITOR.id}），更新`);
    const result = skillStore.update(ELICITOR.id, {
      name: ELICITOR.name,
      description: ELICITOR.description,
      category: ELICITOR.category,
      match_on: JSON.stringify(ELICITOR.matchOn),
      execution: JSON.stringify(ELICITOR.execution),
      task_template: JSON.stringify(ELICITOR.taskTemplate),
    });
    console.log('[register-elicitor] 更新完成');
  } else {
    console.log(`[register-elicitor] 创建 SKILL（id=${ELICITOR.id}）`);
    skillStore.create({
      id: ELICITOR.id,
      name: ELICITOR.name,
      description: ELICITOR.description,
      category: ELICITOR.category,
      matchOn: ELICITOR.matchOn,
      execution: ELICITOR.execution,
      taskTemplate: ELICITOR.taskTemplate,
    });
    console.log('[register-elicitor] 创建完成');
  }

  // 验证
  const after = skillStore.getById(ELICITOR.id);
  console.log('[register-elicitor] 验证 GET:', after ? `${after.id} (${after.name})` : 'FAIL');

  const steps = skillStore.listPromptSteps(ELICITOR.id, 'elicitor');
  console.log(`[register-elicitor] prompts/ 目录步骤: ${JSON.stringify(steps)}`);

  const required = ['diagnose', 'toolbox-vague', 'toolbox-conflicted', 'toolbox-blank', 'solidify'];
  const missing = required.filter(s => !steps.includes(s));
  if (missing.length > 0) {
    console.error(`[register-elicitor] ❌ 缺少 prompt 文件: ${missing.join(', ')}`);
    process.exit(1);
  } else {
    console.log('[register-elicitor] ✅ 5 个 prompt 文件齐全');
  }
}

try {
  main();
} catch (e) {
  console.error('[register-elicitor] 错误:', e.message);
  process.exit(1);
}
