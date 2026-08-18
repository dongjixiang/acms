// 冒烟测试：Memory 组装新逻辑（v0.102 架构调整）
// 用法: node scripts/test-buddy-memory-rework.js
const path = require('path');
const buddySkill = require(path.join(__dirname, '..', 'server', 'services', 'agent-buddy-skill'));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

// 模拟 agent-buddy.js 里的组装逻辑（同源码）
function buildUserSummary(context) {
  if (!context) return '';
  const parts = [];
  const loginCount = context.loginCount || 0;
  if (loginCount > 30) parts.push('老用户');
  else if (loginCount > 0) parts.push('见过 ' + loginCount + ' 次');
  const views = context.knownViews || [];
  if (views.length > 0) parts.push('常用 ' + views.slice(0, 6).join('、'));
  if (context.lastView) parts.push('上次在看「' + context.lastView + '」');
  return parts.join('；') || '';
}

function filterActions(savedActions) {
  const deduped = [];
  const seenActs = {};
  for (let i = (savedActions.length - 1); i >= 0; i--) {
    const a = savedActions[i];
    const act = (a && a.action) || '';
    if (act.indexOf('btn:') === 0 || act.indexOf('toast:') === 0) continue;
    if (!seenActs[act]) {
      seenActs[act] = true;
      deduped.push({ action: act, view: a.view });
    }
    if (deduped.length >= 3) break;
  }
  return deduped;
}

console.log('== 1. buildUserSummary 计数降噪 ==');
const s1 = buildUserSummary({ loginCount: 914, totalQuestions: 622, knownViews: ['detail','bugs','task-detail','kanban','file-manager','web-browser','image-editor','admin','chat'], lastView: 'kanban' });
check('914 次 → 老用户', s1.includes('老用户'), s1);
check('不再出现 914', !s1.includes('914'), s1);
check('不再出现 622 话题', !s1.includes('622'), s1);
check('视图限 6 个', !s1.includes('image-editor'), s1);  // 第 7 个被截断
check('含上次在看', s1.includes('上次在看「kanban」'), s1);
const s2 = buildUserSummary({ loginCount: 3, knownViews: ['kanban'], lastView: 'bugs' });
check('小次数保留', s2.includes('见过 3 次'), s2);

console.log('== 2. recent_actions 噪音过滤 ==');
const acts = filterActions([
  { action: 'btn:👥 用户管理', view: 'admin' },
  { action: 'act:close', view: 'admin' },
  { action: 'btn:✦', view: '_default' },
  { action: 'toast:xx', view: 'kanban' },
  { action: 'act:open_view:kanban', view: 'kanban' },
  { action: 'btn:⚙️ 高级', view: 'admin' },
  { action: 'act:open_view:bugs', view: 'bugs' },
]);
const actStrs = acts.map(a => a.action);
check('btn: 被过滤', !actStrs.some(x => x.startsWith('btn:')), JSON.stringify(actStrs));
check('toast: 被过滤', !actStrs.some(x => x.startsWith('toast:')), JSON.stringify(actStrs));
check('保留 act: 语义动作', actStrs.includes('act:close') && actStrs.includes('act:open_view:kanban'), JSON.stringify(actStrs));
check('最多 3 条', acts.length <= 3, String(acts.length));
check('去重', new Set(actStrs).size === actStrs.length);

console.log('== 3. historyHint 兜底 ==');
function historyHint(chatSummary) {
  return (chatSummary && chatSummary.text) ? '；历史摘要：' + String(chatSummary.text).slice(0, 200) : '';
}
check('无 text 不拼 undefined', historyHint({ messageCount: 5 }) === '', historyHint({ messageCount: 5 }));
check('null 不拼', historyHint(null) === '');
check('有 text 正常拼', historyHint({ text: '用户偏好直接执行' }) === '；历史摘要：用户偏好直接执行');
check('超长截断 200', historyHint({ text: 'x'.repeat(500) }).length < 220);

console.log('== 4. 注入预算 500 上限 ==');
const raw = '；'.repeat(300);  // 600 字符
const capped = raw.length > 500 ? raw.slice(0, 500) + '…' : raw;
check('超出截断', capped.length <= 501, String(capped.length));

console.log('== 5. buildPersonalityPrompt 事实画像约束 ==');
const p = buddySkill.buildPersonalityPrompt({ history: '用户说：直接做不要方案', oldPersonality: '' });
check('包含事实维度', p.includes('事实画像') && p.includes('量化数据'), p.slice(0, 80));
check('禁止情感评价', p.includes('不要情感评价'));
check('禁止第一人称情感', p.includes('不要第一人称情感表达'));

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
