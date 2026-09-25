// 临时核查：L6 + 实体 ID 是否真的落进 DB
const screenplay = require('../server/services/assists/screenplay');
const reqStore = require('../server/stores/requirement-store');
const req = reqStore.getById('REQ-MUGOR3KP');
const assist = JSON.parse(req.assist_screenplay);
const sp = assist.screenplays[assist.picked || 0];
const f1 = assist.scene_frames && assist.scene_frames['1'];
console.log('=== 场2(scene_idx=1) 首帧记录 ===');
if (!f1) { console.log('  (无)'); } else {
  console.log('  asset_path:', f1.asset_path);
  console.log('  created:', f1.created_at || f1.updated_at || '(无时间字段)');
  console.log('  l6_check:', JSON.stringify(f1.l6_check));
  console.log('  prompt 前 400 字:",');
  console.log('   ', String(f1.prompt || '').slice(0, 400).replace(/\n/g, ' '));
  const p = String(f1.prompt || '');
  for (const k of ['[PR_', '元素白名单', '风格延续', '环境继承', '楼阁', '不得出现']) {
    console.log(`  含 "${k}":`, p.includes(k));
  }
}
console.log('=== 场景 2 定义 ===');
const sc = sp.scenes[1];
console.log('  scene_location:', sc && sc.scene_location);
console.log('  characters:', JSON.stringify(sc && sc.characters));
console.log('  video_prompt_override 前 200:', String((sc && sc.video_prompt_override) || '').slice(0, 200));
console.log('=== continuity_props ===');
console.log(' ', JSON.stringify(sp.continuity_props || []).slice(0, 600));
process.exit(0);
