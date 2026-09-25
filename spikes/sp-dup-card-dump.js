// 从库里导出「复现用的真数据」：REQ 100924 的 assist_screenplay + 望庐山瀑布那张卡的 history entry
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const Database = require('better-sqlite3');
const db = new Database(path.join(ROOT, 'data', 'acms.db'), { readonly: true });

const row = db.prepare('SELECT id, doc FROM requirements WHERE id = ?').get('100924');
const d = JSON.parse(row.doc || '{}');
const sp = typeof d.assist_screenplay === 'string' ? JSON.parse(d.assist_screenplay) : d.assist_screenplay;
let h = typeof d.supplement_history === 'string' ? JSON.parse(d.supplement_history) : d.supplement_history;
const card = h.filter(e => e.source === 'screenplay_result').pop();
const entry = card.text ? (typeof card.text === 'string' ? JSON.parse(card.text) : card.text) : null;

const out = {
  sp,
  entry: { at: card.at, role: card.role, source: card.source, text: typeof card.text === 'string' ? card.text : JSON.stringify(card.text) },
};
fs.writeFileSync(path.join(__dirname, 'dup-repro-data.json'), JSON.stringify(out));
console.log('已导出 spikes/dup-repro-data.json');
console.log('sp.picked =', sp.picked, '| screenplays =', sp.screenplays.map(s => s.title).join(' | '));
console.log('entry.at =', out.entry.at, '| source =', out.entry.source, '| text len =', out.entry.text.length);
console.log('entry.card.type =', entry.type, '| idea =', entry.idea, '| sp.title =', entry.screenplay && entry.screenplay.title);
db.close();
