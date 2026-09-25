// 取证：查「诗仙的顿悟」相关的 supplement_history 条目，看到底存了几条 screenplay_result 卡
// requirements 表只有 (id, doc) —— 全部状态都在 doc JSON 里
const path = require('path');
const ROOT = path.join(__dirname, '..');
const Database = require('better-sqlite3');
const db = new Database(path.join(ROOT, 'data', 'acms.db'), { readonly: true });

const rows = db.prepare('SELECT id, doc FROM requirements ORDER BY rowid DESC LIMIT 400').all();
const hits = rows.filter(r => (r.doc || '').includes('诗仙的顿悟') || (r.doc || '').includes('望庐山瀑布'));
console.log('命中需求数:', hits.length, '/ 扫描', rows.length);
for (const r of hits) {
  let d = {};
  try { d = JSON.parse(r.doc || '{}'); } catch { }
  let h = d.supplement_history;
  if (typeof h === 'string') { try { h = JSON.parse(h); } catch { h = []; } }
  h = Array.isArray(h) ? h : [];
  const sp = d.assist_screenplay ? (typeof d.assist_screenplay === 'string' ? JSON.parse(d.assist_screenplay) : d.assist_screenplay) : null;
  console.log('\n=== REQ ' + r.id + ' | ' + (d.title || d.brief || '') + ' | 历史 ' + h.length + ' 条 | picked=' + (sp ? sp.picked : '-') + ' | 剧本数=' + (sp && sp.screenplays ? sp.screenplays.length : 0) + ' ===');
  if (sp) {
    console.log('   assist.idea =', JSON.stringify(String(sp.idea || '').slice(0, 80)));
    console.log('   screenplays =', (sp.screenplays || []).map((s, i) => i + ':' + (s.title || '?')).join(' | '));
  }
  h.forEach((e, i) => {
    let brief = '';
    try {
      const o = JSON.parse(e.text || '{}');
      brief = [o.type, o.idea ? ('idea=' + String(o.idea).slice(0, 40)) : '', o.screenplay && o.screenplay.title ? ('→' + o.screenplay.title) : ''].filter(Boolean).join(' ');
    } catch { brief = String(e.text || '').slice(0, 60); }
    console.log('  [' + i + '] source=' + e.source + ' role=' + e.role + ' at=' + (e.at || '') + ' len=' + String(e.text || '').length + ' :: ' + brief);
  });
}
db.close();
