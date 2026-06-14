#!/usr/bin/env node
// 把「借鉴简报」SKILL 注册到 ACMS skill-store（SQLite skills 表）
// 用法：node server/scripts/register-reference-brief-skill.js
// 可重复执行：已存在会 update，不存在会 create。

const path = require('path');
const skillStore = require('../stores/skill-store');

const SKILL = {
  id: 'skill-reference-brief',
  name: '借鉴简报生成',
  description: '用户提到产品名时，生成结构化产品简报：全景描述→可视化图表→核心理念提炼，替代旧版表格选择器式借鉴卡片',
  category: 'research',
  matchOn: {
    taskType: ['analysis', 'research'],
    tags: ['reference', '借鉴', '竞品', '产品分析', 'product'],
    conditions: [
      { intent: ['reference', 'competitive', 'product_analysis'] },
      { keywords: ['参考', '借鉴', '像*一样', '参考*', '类似*'] },
    ],
  },
  execution: {
    mode: 'llm',
    steps: [
      { id: 'profile', prompt: 'prompts/profile.md', output: 'profile_json' },
      { id: 'diagrams', prompt: 'prompts/diagrams.md', output: 'diagrams_json' },
      { id: 'insights', prompt: 'prompts/insights.md', output: 'insights_json' },
    ],
    deliverables: [
      'profile: { 定位, 核心功能, 工作流程, 典型用户 }',
      'diagrams: [ { type: flow|grid|layers, title, nodes|views|layers } ]',
      'insights: [ { number, title, desc } ]',
    ],
    combine_output: true,
  },
  taskTemplate: {
    title: '生成借鉴简报: {product_name}',
    type: 'research',
    estimatedHours: 0.3,
    notes: '三步骤：profile → diagrams → insights，中间结果可缓存用于"换一批核心理念"',
  },
};

function main() {
  const existing = skillStore.getById(SKILL.id);
  if (existing) {
    console.log(`[register-reference-brief] SKILL 已存在（id=${SKILL.id}），更新`);
    skillStore.update(SKILL.id, {
      name: SKILL.name,
      description: SKILL.description,
      category: SKILL.category,
      match_on: JSON.stringify(SKILL.matchOn),
      execution: JSON.stringify(SKILL.execution),
      task_template: JSON.stringify(SKILL.taskTemplate),
    });
    console.log('[register-reference-brief] 更新完成');
  } else {
    console.log(`[register-reference-brief] 创建 SKILL（id=${SKILL.id}）`);
    skillStore.create({
      id: SKILL.id,
      name: SKILL.name,
      description: SKILL.description,
      category: SKILL.category,
      matchOn: SKILL.matchOn,
      execution: SKILL.execution,
      taskTemplate: SKILL.taskTemplate,
    });
    console.log('[register-reference-brief] 创建完成');
  }

  // 验证
  const saved = skillStore.getById(SKILL.id);
  if (saved) {
    console.log(`[register-reference-brief] ✅ 验证成功：name=${saved.name}`);
    const exec = JSON.parse(saved.execution || '{}');
    console.log(`  步骤: ${(exec.steps || []).map(s => s.id).join(' → ')}`);
    console.log(`  匹配条件: ${JSON.stringify(JSON.parse(saved.match_on || '{}').conditions || [])}`);
  } else {
    console.error(`[register-reference-brief] ❌ 注册失败：无法读取`);
    process.exit(1);
  }
}

main();
