// ============================================================
// spikes/l6-prevframe-ab-test.js — 「多出人物」根因 A/B 实验
//
//   假设：本场 refs 里的「上一场首帧」会把上一场的人物带进本场
//        → L6 判 C 类（人数）违规 → 加负向词重画也压不住（因为参考图还在）
//
//   设计（只改一个变量）：
//     Arm A（现场数据，已有）：refs = 角色图 + 场景图 + 上一场首帧 → 实测 3 个人（多 1 铠甲侍卫）
//     Arm B（本脚本）：        refs = 角色图 + 场景图（去掉上一场首帧 + 去掉对应 prompt 行）
//   同一 prompt 其余部分完全一致；生成后用同一个 L6 判官（runL6FrameCheck）判定。
//
//   不改任何生产数据（只生成一个孤儿图 + 两次 vision 判读）
//   run: node spikes/l6-prevframe-ab-test.js
// ============================================================
const path = require('path');
const fs = require('fs');
const reqStore = require('../server/stores/requirement-store');
const svc = require('../server/services/assists/screenplay');
const compose = require('../server/services/video-compose');
const imageSvc = require('../server/services/image-tools-service');

const REQ = process.argv[2] || 'REQ-MT4D51CF';
const SCENE_IDX = Number(process.argv[3] || 1);
const SCENE_NO = SCENE_IDX + 1;

function toDataUri(slug, relPath) {
  try {
    const abs = compose.resolveAssetPath(slug, svc.normAssetPath(relPath));
    if (!abs || !fs.existsSync(abs)) return '';
    const buf = fs.readFileSync(abs);
    const mime = /\.png$/i.test(abs) ? 'image/png' : /\.webp$/i.test(abs) ? 'image/webp' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (e) { return ''; }
}

(async () => {
  const req = reqStore.getById(REQ);
  const assist = JSON.parse(req.assist_screenplay);
  const spIdx = Number.isInteger(assist.picked) ? assist.picked : 0;
  const sp = assist.screenplays[spIdx];
  const scene = sp.scenes[SCENE_IDX];
  const slug = 'agent-buddy-actions';
  const castInfo = svc.castOfScene(sp, scene);
  const castNames = (castInfo && castInfo.cast ? castInfo.cast : []).map(c => c.name).filter(Boolean);
  const frameA = assist.scene_frames[String(SCENE_IDX)];

  console.log(`REQ=${REQ} 场${SCENE_NO} cast=[${castNames.join('、')}]`);
  console.log(`Arm A 现场图: ${(frameA.asset_path || '').slice(-24)}`);

  // ── Arm B refs：角色图 + 场景图（无 prev-frame） ──
  const refs = [];
  for (const name of castNames) {
    const a = assist.assets && assist.assets.characters && assist.assets.characters[name];
    if (!a) continue;
    const u = a.image_url_output || (a.asset_path ? toDataUri(slug, a.asset_path) : '');
    if (u) refs.push({ kind: 'character', name, url: u });
  }
  const sc = assist.assets && assist.assets.scenes && assist.assets.scenes['0'];
  if (sc) {
    const u = sc.image_url_output || (sc.asset_path ? toDataUri(slug, sc.asset_path) : '');
    if (u) refs.push({ kind: 'scene', name: '场景基准图', url: u });
  }
  console.log(`Arm B 参考图 ${refs.length} 张: ${refs.map(r => r.kind + ':' + r.name).join(' | ')}`);

  // ── prompt：与 Arm A 同源，仅剥掉【L6 自检修复】段 + 风格延续行 ──
  let basePrompt = String(frameA.prompt || '');
  const cut = basePrompt.indexOf(' 【L6 自检修复】');
  if (cut > 0) basePrompt = basePrompt.slice(0, cut);
  const before = basePrompt.length;
  basePrompt = basePrompt.replace(/🎨 风格延续：[^]*?(?=🔒 元素白名单)/, '');
  console.log(`prompt: 剥掉 L6 修复段 + 风格延续行（${before} → ${basePrompt.length} 字）`);
  console.log('  prompt 含「风格延续」:', /风格延续/.test(basePrompt), '| 含「元素白名单」:', /元素白名单/.test(basePrompt));

  // ── Arm B 生成 ──
  console.log('\n生成中（1 张）…');
  const t0 = Date.now();
  const genR = await imageSvc.coreGenerate({
    prompt: basePrompt,
    referenceImages: refs.map(r => r.url),
    size: '1K',
    n: 1,
    projectSlug: slug,
    targetWidth: 1920,
    targetHeight: 1080,
  });
  if (!genR || !genR.ok) { console.error('生成失败:', (genR && genR.error) || '未知'); process.exit(2); }
  const opt = (genR.options || [])[0];
  console.log(`Arm B 生成完成 ${((Date.now() - t0) / 1000).toFixed(1)}s → ${opt.asset_path}`);

  // ── 同一个判官，判两张图（A 现场 / B 实验） ──
  console.log('\n=== L6 判官判定 ===');
  for (const [label, assetPath] of [
    ['Arm A（含上一场首帧）', frameA.asset_path],
    ['Arm B（去掉上一场首帧）', opt.asset_path],
  ]) {
    const r = await svc.runL6FrameCheck(REQ, sp, scene, SCENE_IDX, castNames, assetPath, slug);
    console.log(`\n${label}`);
    console.log(`  ok=${r.ok} violations=${JSON.stringify(r.violations)}`);
    console.log(`  reason: ${(r.reason || '').slice(0, 220)}`);
  }
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
setTimeout(() => { console.error('FORCE_TIMEOUT'); process.exit(3); }, 300000);
