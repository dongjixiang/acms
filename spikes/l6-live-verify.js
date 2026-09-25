// 一次性验证：L6 自检在「相对 asset_path」vs「绝对路径」下的真实行为
//   run: node spikes/l6-live-verify.js
const path = require('path');
const fs = require('fs');
const reqStore = require('../server/stores/requirement-store');
const svc = require('../server/services/assists/screenplay');
const compose = require('../server/services/video-compose');

const REQ = process.argv[2] || 'REQ-MUGOR3KP';

function normAssetPath(p) {
  if (!p) return '';
  const s = String(p);
  const i = s.indexOf('assets/');
  return i > 0 ? s.slice(i) : s;
}

(async () => {
  const req = reqStore.getById(REQ);
  if (!req) { console.log('REQ_NOT_FOUND', REQ); process.exit(1); }
  const assist = JSON.parse(req.assist_screenplay || '{}');
  const spIdx = Number.isInteger(assist.picked) ? assist.picked : 0;
  const sp = assist.screenplays[spIdx];
  const slug = require('../server/services/assists/video').getProjectDirForReq(req);
  console.log('slug(getProjectDirForReq):', slug);
  console.log('setting:', (sp.setting || '').slice(0, 60));
  console.log('continuity_props:', JSON.stringify((sp.continuity_props || []).map(p => p.label)));
  console.log('scene_frames keys:', Object.keys(assist.scene_frames || {}));

  for (const key of Object.keys(assist.scene_frames || {})) {
    const f = assist.scene_frames[key];
    const rel = normAssetPath(f.asset_path);
    const abs = await svc.resolveFrameAbsPath(slug, rel, req);
    console.log(`\n--- 场 ${key} ---`);
    console.log('  asset_path(原始):', f.asset_path);
    console.log('  normAssetPath  :', rel);
    console.log('  绝对路径        :', abs, fs.existsSync(abs) ? '✅存在' : '❌不存在');
    console.log('  l6_check(已存)  :', JSON.stringify(f.l6_check || null).slice(0, 200));
    if (!fs.existsSync(abs)) continue;

    const scene = sp.scenes[Number(key)] || {};
    const castNames = (Array.isArray(scene.characters) && scene.characters.length)
      ? scene.characters
      : (sp.characters || []).map(c => c.name).filter(Boolean).slice(0, 2);

    // ① 现状：传相对路径（代码当前做法）
    const r1 = await svc.runL6FrameCheck(REQ, sp, scene, Number(key), castNames, rel, slug);
    console.log('  [①相对路径] →', JSON.stringify(r1).slice(0, 220));

    // ② 固定后（本次修复）：同一 asset_path + slug → 应能真的读到图并出真实判定
    const r2 = await svc.runL6FrameCheck(REQ, sp, scene, Number(key), castNames, f.asset_path, slug);
    console.log('  [②绝对路径] →', JSON.stringify(r2).slice(0, 400));
  }
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
setTimeout(() => { console.error('FORCE_TIMEOUT'); process.exit(3); }, 110000);
