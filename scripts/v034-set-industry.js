// ACMS GEO v0.34 一次性脚本：批量打 brands.industry 字段
// 用法：
//   dry-run（推荐，先看输出）：node scripts/v034-set-industry.js
//   真正写入：node scripts/v034-set-industry.js --apply
//   手动指定品牌：node scripts/v034-set-industry.js --apply --ids brand_xxx,brand_yyy --industry banking
//
// 关键词启发规则（可按需调整）：
//   - 含 "银行" / "bank" → banking
//   - 含 "展览" / "展台" / "会展" → exhibition
//   - 含 "品牌设计" / "品牌咨询" → brand-design
//   - 其他留空（不强行归类，避免误判）
//
// v0.34 优化：直接走 better-sqlite3 读 geo_brands 表（绕过 collection API 首次加载慢的问题）

const path = require('node:path');
const Database = require('better-sqlite3');

const RULES = [
  { industry: 'banking', keywords: ['银行', 'bank'] },
  { industry: 'exhibition', keywords: ['展览', '展台', '会展'] },
  { industry: 'brand-design', keywords: ['品牌设计', '品牌咨询'] },
];

function classify(name) {
  const lower = String(name || '').toLowerCase();
  for (const r of RULES) {
    if (r.keywords.some(k => lower.includes(k.toLowerCase()))) return r.industry;
  }
  return '';
}

function main() {
  const apply = process.argv.includes('--apply');
  const idsIdx = process.argv.findIndex(a => a === '--ids');
  const industryIdx = process.argv.findIndex(a => a === '--industry');
  const manualIds = idsIdx > 0 ? process.argv[idsIdx + 1].split(',') : null;
  const manualIndustry = industryIdx > 0 ? process.argv[industryIdx + 1] : null;

  if (manualIds && !manualIndustry) {
    console.error('ERR: --ids 必须配合 --industry');
    process.exit(1);
  }

  const dbPath = path.join(__dirname, '..', 'data', 'acms.db');
  const db = new Database(dbPath, { readonly: !apply, fileMustExist: true });

  // 直接读 doc 列（doc 是 JSON，含 name + industry + aliases 等）
  let brands;
  try {
    brands = db.prepare('SELECT id, doc FROM geo_brands').all().map(r => ({
      id: r.id,
      ...JSON.parse(r.doc || '{}'),
    }));
  } catch (e) {
    console.error('ERR: 读取 geo_brands 失败:', e.message);
    process.exit(1);
  }

  console.log(`total brands: ${brands.length}`);
  console.log(`mode: ${apply ? 'APPLY (写库)' : 'DRY-RUN (只看不动)'}`);

  let updated = 0;
  let skipped = 0;
  const updates = [];
  for (const b of brands) {
    let targetIndustry;
    if (manualIds) {
      if (!manualIds.includes(b.id)) continue;
      targetIndustry = manualIndustry;
    } else {
      targetIndustry = classify(b.name);
    }
    if (!targetIndustry) {
      skipped++;
      continue;
    }
    if (b.industry === targetIndustry) continue;
    updates.push({ id: b.id, name: b.name, old: b.industry || '', next: targetIndustry });
  }

  if (apply && updates.length > 0) {
    const upd = db.prepare("UPDATE geo_brands SET doc = json_set(doc, '$.industry', ?, '$.updated_at', ?) WHERE id = ?");
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      for (const u of updates) {
        upd.run(u.next, now, u.id);
      }
    });
    tx();
    updated = updates.length;
    console.log(`\n[APPLIED] ${updated} brands updated:`);
    for (const u of updates) {
      console.log(`  [${u.id}] ${u.name}: industry '' → '${u.next}'`);
    }
  } else {
    console.log(`\n[DRY-RUN] would update ${updates.length} brands, skip ${skipped} (no rule match):`);
    for (const u of updates) {
      console.log(`  [${u.id}] ${u.name}: industry '${u.old}' → '${u.next}'`);
    }
    if (skipped > 0) console.log(`(${skipped} brands did not match any rule — left unchanged)`);
  }

  console.log(`\nsummary: ${apply ? `updated=${updated}` : `would-update=${updates.length}`} skipped=${skipped}`);
  if (!apply) console.log('run with --apply to actually write');

  db.close();
}

main();