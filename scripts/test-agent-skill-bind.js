// 冒烟测试：Agent-Skill 绑定（v0.110，B 方案）
// 运行: node scripts/test-agent-skill-bind.js
// 预期: 结果: N 通过 / 0 失败
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
process.env.ACMS_DATA_DIR = path.join(ROOT, 'data'); // 确保用真实 data 目录

const agentStore = require(path.join(ROOT, 'server/stores/agent-store'));
const skillLoader = require(path.join(ROOT, 'server/services/skill-loader'));

let passed = 0, failed = 0;
function assert(name, cond, extra) {
  if (cond) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

// 临时测试 agent（用 _test_ 前缀，测完清理）
const TEST_AGENT = '_test_skill_agent';
const EXISTING = agentStore.getById(TEST_AGENT);
if (!EXISTING) agentStore.register({ id: TEST_AGENT, name: '技能测试', role: 'worker', domain: 'test' });

// 临时测试技能（带 agents 声明的专属技能，测完删除）
const DATA_SKILLS = path.join(ROOT, 'data/skills');
const TMP_SKILL = path.join(DATA_SKILLS, '_test_exclusive_skill.md');
fs.writeFileSync(TMP_SKILL, `---
name: 专属测试技能
description: 仅 agent-word-expert 可见的测试技能
agents: [agent-word-expert]
---

# 专属测试技能

步骤：只给 word 专家用。
`, 'utf8');

try {
  console.log('\n=== 1. agent-store bound_skills 读写 ===');
  agentStore.update(TEST_AGENT, { boundSkills: [] });
  let a = agentStore.getById(TEST_AGENT);
  assert('bound_skills 字段存在且默认空数组', JSON.stringify(JSON.parse(a.bound_skills || '[]')) === '[]');

  agentStore.addSkill(TEST_AGENT, '会议纪要');
  a = agentStore.getById(TEST_AGENT);
  assert('addSkill 绑定成功', (JSON.parse(a.bound_skills)).includes('会议纪要'));

  agentStore.addSkill(TEST_AGENT, '会议纪要'); // 重复绑定幂等
  a = agentStore.getById(TEST_AGENT);
  assert('重复绑定幂等', (JSON.parse(a.bound_skills)).filter(s => s === '会议纪要').length === 1);

  agentStore.removeSkill(TEST_AGENT, '会议纪要');
  a = agentStore.getById(TEST_AGENT);
  assert('removeSkill 解绑成功', !(JSON.parse(a.bound_skills)).includes('会议纪要'));

  console.log('\n=== 2. skillLoader.getSkillsForAgent 可见性 ===');
  // 先绑定一个真实技能（会议纪要 在 data/skills）
  const bound = ['会议纪要'];
  const visibleBound = skillLoader.getSkillsForAgent(TEST_AGENT, bound);
  assert('绑定技能对 agent 可见', visibleBound.some(s => s.name === '会议纪要'));

  const visibleGlobal = skillLoader.getSkillsForAgent(TEST_AGENT, []);
  assert('未绑定任何技能时全局技能仍可见', visibleGlobal.some(s => s.name === '会议纪要'));

  // 专属技能：只有声明 agent 可见
  skillLoader.refreshCache();
  const visibleForWord = skillLoader.getSkillsForAgent('agent-word-expert', []);
  assert('agents 声明的技能对声明 agent 可见', visibleForWord.some(s => s.name === '专属测试技能'));
  const visibleForOther = skillLoader.getSkillsForAgent('agent-image-expert', []);
  assert('agents 声明的技能对其他 agent 不可见', !visibleForOther.some(s => s.name === '专属测试技能'));
  const visibleForTest = skillLoader.getSkillsForAgent(TEST_AGENT, []);
  assert('agents 声明的技能对未声明 agent 不可见', !visibleForTest.some(s => s.name === '专属测试技能'));

  console.log('\n=== 3. buildAgentSkillHint ===');
  const hint = skillLoader.buildAgentSkillHint('agent-word-expert', []);
  assert('专属 agent 拿到技能提示段', hint.includes('专属测试技能'));
  const hintOther = skillLoader.buildAgentSkillHint('agent-image-expert', []);
  assert('非专属 agent 提示段不含专属技能', !hintOther.includes('专属测试技能'));
  assert('无 agentId 返回空串', skillLoader.buildAgentSkillHint(null, []) === '');

  console.log('\n=== 4. matchForTask 按 agent 过滤 ===');
  const task = { type: 'general', title: '生成一份专属测试技能文档', description: '测试', required_skills: '{}' };
  const mWord = skillLoader.matchForTask(task, { agentId: 'agent-word-expert' });
  assert('word 专家任务匹配到专属技能', mWord.some(m => m.skill.name === '专属测试技能'));
  const mOther = skillLoader.matchForTask(task, { agentId: 'agent-image-expert' });
  assert('image 专家任务不匹配专属技能', !mOther.some(m => m.skill.name === '专属测试技能'));
  const mNoAgent = skillLoader.matchForTask(task);
  assert('无 agentId 时匹配全量（含专属）', mNoAgent.some(m => m.skill.name === '专属测试技能'));

} finally {
  // 清理
  if (fs.existsSync(TMP_SKILL)) fs.unlinkSync(TMP_SKILL);
  skillLoader.refreshCache();
  if (EXISTING) {
    agentStore.update(TEST_AGENT, { boundSkills: [] });
  } else {
    agentStore.remove(TEST_AGENT);
  }
}

console.log(`\n结果: ${passed} 通过 / ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
