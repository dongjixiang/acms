#!/usr/bin/env node
// 把「五层痛点挖掘术」SKILL 注册到 ACMS skill-store（SQLite skills 表）
// 用法：node server/scripts/register-pain-point-mining-skill.js
// 可重复执行：已存在会 update，不存在会 create。

const skillStore = require('../stores/skill-store');

const SKILL = {
  id: 'skill-pain-point-mining',
  name: '五层痛点挖掘术',
  description: '从表层抱怨到情感根源，五层递进式痛点挖掘框架。AI 按 L1→L5 逐层分析需求描述，输出结构化的深度痛点清单。',
  category: 'analysis',
  matchOn: {
    phase: ['idea'],
    conditions: [
      { assist: ['pains'] },
      { tags: ['pain', '痛点', '用户洞察'] },
    ],
  },
  execution: {
    mode: 'llm',
    steps: [
      { id: 'pains', prompt: 'pains-prompt.md', output: 'items[] + summary + evolution + emotional_pains[]' },
    ],
    deliverables: [
      'items: [{ title, category, description, impact, severity, evidence, layer, root_cause? }]',
      'summary: string',
      'evolution: string',
      'emotional_pains: [{ trigger, emotion, quote }]',
    ],
  },
  taskTemplate: {
    title: '痛点挖掘: {title}',
    type: 'analysis',
    estimatedHours: 0.2,
    notes: '五层痛点挖掘 — 用户呼唤痛点溯源时触发',
  },
};

function main() {
  const existing = skillStore.getById(SKILL.id);
  if (existing) {
    console.log(`[register-pain-point-mining] SKILL 已存在（id=${SKILL.id}），更新`);
    skillStore.update(SKILL.id, {
      name: SKILL.name,
      description: SKILL.description,
      category: SKILL.category,
      match_on: JSON.stringify(SKILL.matchOn),
      execution: JSON.stringify(SKILL.execution),
      task_template: JSON.stringify(SKILL.taskTemplate),
    });
    console.log('[register-pain-point-mining] 更新完成');
  } else {
    console.log(`[register-pain-point-mining] 创建 SKILL（id=${SKILL.id}）`);
    skillStore.create({
      id: SKILL.id,
      name: SKILL.name,
      description: SKILL.description,
      category: SKILL.category,
      matchOn: SKILL.matchOn,
      execution: SKILL.execution,
      taskTemplate: SKILL.taskTemplate,
    });
    console.log('[register-pain-point-mining] 创建完成');
  }

  // 验证
  const after = skillStore.getById(SKILL.id);
  console.log('[register-pain-point-mining] 验证 GET:', after ? `${after.id} (${after.name})` : 'FAIL');

  const steps = skillStore.listPromptSteps(SKILL.id, 'pain-point-mining');
  console.log(`[register-pain-point-mining] prompts/ 目录步骤: ${JSON.stringify(steps)}`);

  if (!steps.includes('pains')) {
    console.error('[register-pain-point-mining] ❌ 缺少 prompt 文件: pains');
    process.exit(1);
  } else {
    console.log('[register-pain-point-mining] ✅ prompt 文件齐全');
  }
}

try {
  main();
} catch (e) {
  console.error('[register-pain-point-mining] 错误:', e.message);
  process.exit(1);
}
