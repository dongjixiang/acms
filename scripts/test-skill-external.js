// 冒烟测试：v0.109 外部技能引入（data/skills 即插即用 + 消息匹配注入）
// 用法: node scripts/test-skill-external.js
const path = require('path');
const skillLoader = require(path.join(__dirname, '..', 'server', 'services', 'skill-loader'));
const buddySkill = require(path.join(__dirname, '..', 'server', 'services', 'agent-buddy-skill'));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

(async () => {
  console.log('== 1. 双目录扫描 ==');
  const skills = skillLoader.getSkills();
  const external = skills.filter(s => s.source === 'external');
  const builtin = skills.filter(s => s.source === 'builtin');
  console.log('  总技能数:', skills.length, '| 内置:', builtin.length, '| 外部:', external.length);
  check('外部技能被扫到（会议纪要）', external.some(s => s.name.includes('会议纪要')), JSON.stringify(external.map(s => s.name)));
  check('外部技能来源标记', external.every(s => s.source === 'external'));
  check('内置技能仍有', builtin.length >= 1);
  check('frontmatter 解析正常', external[0] && external[0].description.includes('会议纪要'), external[0] && external[0].description);

  console.log('== 2. 消息匹配注入（buildChatPrompt） ==');
  // 会议纪要消息 → 应出现【外部技能】段
  const ctx1 = { currentView: '_default', expandedCategories: [], userName: '伙伴', message: '帮我记一下会议纪要' };
  const prompt1 = buddySkill.buildChatPrompt(ctx1);
  check('会议消息触发外部技能注入', prompt1.includes('外部技能') && prompt1.includes('会议纪要'), prompt1.slice(-400));
  check('注入含步骤', prompt1.includes('步骤：'));
  // 无关消息 → 不注入外部技能段
  const ctx2 = { currentView: '_default', expandedCategories: [], userName: '伙伴', message: '帮我查一下深圳油价' };
  const prompt2 = buddySkill.buildChatPrompt(ctx2);
  check('无关消息不注入外部技能', !prompt2.includes('外部技能'), '(无外部技能段)');

  console.log('== 3. 视图匹配仍工作（内置 skill） ==');
  const ctx3 = { currentView: '_default', expandedCategories: [], userName: '伙伴', message: '你好' };
  const prompt3 = buddySkill.buildChatPrompt(ctx3);
  check('仍有【相关技能参考】段', prompt3.includes('相关技能参考'));

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('异常:', e); process.exit(1); });
