// 一次性数据修复脚本：给 REQ-MQVQ38FY 补"程响的可能"music_result
// 根因：v0.20d 的去重逻辑只看 source === 'music_result' 就跳过，
//     导致第二首歌（可能）的 music_result 永远写不进 supplement_history。
// 修复：用 v0.21a 的新逻辑（按 song+artist 去重）+ 直接调 writeMusicChatEntry。
//
// 用法：node scripts/fix-req-mqvq38fy-music.js

const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const reqStore = require('../server/stores/requirement-store');
const musicSvc = require('../server/services/assists/music');

const REQ_ID = 'REQ-MQVQ38FY';
const req = reqStore.getById(REQ_ID);
if (!req) {
  console.error(`❌ REQ ${REQ_ID} not found`);
  process.exit(1);
}

const m = JSON.parse(req.assist_music || 'null');
if (!m || m.status !== 'done') {
  console.error(`❌ assist_music status=${m?.status}, expected done`);
  process.exit(1);
}

console.log(`✅ 找到 ${REQ_ID} 的 assist_music:`);
console.log(`   song=${m.song} artist=${m.artist}`);
console.log(`   playable_sources: ${(m.playable_sources || []).length}`);

// 构造 music_card JSON（v0.21a 后的逻辑）
const card = {
  type: 'music_card',
  song: m.song || '',
  artist: m.artist || null,
  error: null,
  playable: (m.playable_sources || []).filter(s => s.url).map(s => ({
    type: s.type || 'audio',
    label: s.label || '源',
    url: s.url,
  })),
  platforms: (m.sources || []).map(s => ({
    name: s.platform || '',
    icon: s.icon || '🔗',
    url: s.url || '',
  })),
};
const text = JSON.stringify(card);

let history = [];
try { history = JSON.parse(req.supplement_history || '[]'); } catch { history = []; }
if (!Array.isArray(history)) history = [];

// 移除之前的 music_precheck loading + 检查是否已有同 song+artist
const songKey = m.song || '';
const artistKey = m.artist || null;
const sameSong = history.some(e => {
  if (e.source !== 'music_result') return false;
  try {
    const old = JSON.parse(e.text || '{}');
    return old.song === songKey && (old.artist || null) === artistKey;
  } catch { return false; }
});
if (sameSong) {
  console.log(`⚠️ ${REQ_ID} 已有同 song+artist 的 music_result，跳过`);
  process.exit(0);
}
history = history.filter(e => e.source !== 'music_precheck');
history.push({
  role: 'system',
  text,
  at: new Date().toISOString(),
  source: 'music_result',
});
reqStore.update(REQ_ID, { supplement_history: JSON.stringify(history) });
console.log(`✅ 已补 music_result: ${m.song} - ${m.artist || '(无歌手)'} (playable=${card.playable.length})`);

// 验证
const req2 = reqStore.getById(REQ_ID);
const h = JSON.parse(req2.supplement_history || '[]');
const musicResults = h.filter(e => e.source === 'music_result');
console.log(`\n📋 supplement_history 现共 ${h.length} 条 entry，${musicResults.length} 条 music_result:`);
musicResults.forEach((e, i) => {
  try {
    const c = JSON.parse(e.text);
    console.log(`  [${i}] ${c.song} - ${c.artist} (playable=${c.playable?.length || 0})`);
  } catch {}
});
console.log('\n🎉 数据修复完成，刷新浏览器即可看到"程响的可能"音乐卡片');