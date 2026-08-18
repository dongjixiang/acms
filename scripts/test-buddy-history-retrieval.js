// 冒烟测试：Phase C 历史对话检索式注入（v0.106）
// 用法: node scripts/test-buddy-history-retrieval.js
// 注意：连真实 data/acms.db，用测试用户 _test_hist，跑完自动清理
const path = require('path');
const { collection } = require(path.join(__dirname, '..', 'server', 'db', 'connection'));
const historySvc = require(path.join(__dirname, '..', 'server', 'services', 'buddy-chat-history'));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

const TEST_USER = '_test_hist_' + Date.now().toString(36);
const KEY = 'chat_history:' + TEST_USER;

// 复制的生产逻辑（agent-buddy.js buildHistoryContextHint）
const _STOP_CHARS = new Set('的了吗呢吧啊哦呀是我你他她它们和或就都请帮查搜看看一下什么怎么为什么多少几个这那要有给没不别能会到对于在里后前上中下大小多少高'.split(''));
function extractKeywords(text) {
  if (!text) return [];
  const out = new Set();
  const chunks = String(text).replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').split(/\s+/).filter(Boolean);
  for (const ch of chunks) {
    if (/^[a-zA-Z0-9]+$/.test(ch)) {
      if (ch.length >= 2) out.add(ch.toLowerCase());
      continue;
    }
    for (let i = 0; i < ch.length - 1; i++) {
      const gram = ch.slice(i, i + 2);
      if (_STOP_CHARS.has(gram[0]) && _STOP_CHARS.has(gram[1])) continue;
      out.add(gram);
    }
  }
  return Array.from(out);
}
function buildHistoryContextHint(message, userId) {
  if (!message || !userId) return '';
  try {
    const history = historySvc.getHistory(userId, 50);
    if (!Array.isArray(history) || history.length < 8) return '';
    const msgWords = extractKeywords(message);
    if (!msgWords.length) return '';
    const candidates = history.slice(0, -4);
    const hits = [];
    for (let i = candidates.length - 1; i >= 0 && hits.length < 2; i--) {
      const h = candidates[i];
      const text = String((h && h.text) || '');
      if (text.length < 4) continue;
      const overlap = extractKeywords(text).filter(w => msgWords.includes(w));
      if (overlap.length >= 1) {
        hits.push({ role: h.role, text: text.slice(0, 120), overlap: overlap.slice(0, 3).join('/') });
      }
    }
    if (!hits.length) return '';
    const parts = hits.map(h => (h.role === 'user' ? 'ta说' : '我说') + '「' + h.text + '」');
    return '；相关历史：' + parts.join(' / ');
  } catch (e) { return ''; }
}

function cleanup() {
  try { collection('buddy_memory').remove(m => m.user_id === TEST_USER); console.log('\n测试数据已清理'); }
  catch (e) { console.warn('清理失败:', e.message); }
}

(async () => {
  console.log('== 1. 种历史消息（10 条，含关键词） ==');
  const msgs = [
    ['user', '帮我查一下深圳的油价'], ['buddy', '深圳95号汽油约7.8元/升，数据来自车主之家'],
    ['user', '今天有什么新闻'], ['buddy', '朱镕基同志生平热搜第一'],
    ['user', '看板任务怎么样了'], ['buddy', '任务 T-123 已提交审核'],
    ['user', '帮我生成一个世界杯海报'], ['buddy', '好的，图片已生成'],
    ['user', '以后回复简洁一点直接给结果'], ['buddy', '好的，记住了'],
  ];
  for (const [role, text] of msgs) historySvc.appendMessage(TEST_USER, role, text);
  const stored = historySvc.getHistory(TEST_USER, 50);
  check('存了 10 条', stored.length === 10, String(stored.length));

  console.log('== 2. 检索命中 ==');
  let hint = buildHistoryContextHint('深圳油价现在多少', TEST_USER);
  check('油价相关命中', hint.includes('油价') || hint.includes('深圳'), hint);
  check('格式含 ta说', hint.includes('ta说') || hint.includes('我说'), hint);
  check('最多 2 条', (hint.match(/「/g) || []).length <= 2, hint);

  hint = buildHistoryContextHint('有什么热点新闻', TEST_USER);
  check('新闻相关命中', hint.includes('新闻') || hint.includes('热搜'), hint);

  console.log('== 3. 无关不命中 ==');
  hint = buildHistoryContextHint('帮我写一封邮件给老板', TEST_USER);
  check('无关不命中', hint === '', hint || '(空)');

  console.log('== 4. 边界 ==');
  check('空消息不命中', buildHistoryContextHint('', TEST_USER) === '');
  check('无用户不命中', buildHistoryContextHint('油价', null) === '');
  check('消息太少不检索', buildHistoryContextHint('油价', '_test_hist_nonexist_') === '');

  console.log('== 5. 最近 4 条跳过 ==');
  // 最近 4 条是"生成海报/回复简洁"，查"海报"不应命中它们（被跳过），但更早的也没海报词 → 应为空或只命中旧词
  const hintPoster = buildHistoryContextHint('再生成一张海报', TEST_USER);
  const hitTexts = (hintPoster.match(/「[^」]+/g) || []).join('');
  check('最近海报对话被跳过', !hitTexts.includes('图片已生成'), hintPoster || '(空)');

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  cleanup();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('异常:', e); cleanup(); process.exit(1); });
