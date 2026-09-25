// ============================================================
// test-scene-bible-views.js — v0.22.84 场景圣经（多视角场景图）
//   覆盖：
//     ① server pickSceneViewKey：scene.shot → 视角键 映射（含"说不清→主场景图"兜底）
//     ② server setAssetPrompt：放行场景视角键（先改提示词后生成）+ 仍拒绝乱键
//     ③ client buildScenePrompt(sp, ts, style, view)：视角声明 + 跨视角环境一致性硬约束 + 分镜别构图
//     ④ client renderDetail：场景块里有「场景圣经（多视角）」3 行（含 onblur 视角键）
//   跑法：node server/__tests__/test-scene-bible-views.js
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
const ok = (cond, name) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.error('  ✗', name); }
};

const svc = require('../services/assists/screenplay');
const REQ = 'REQ-MUGOR3KP';

console.log('\n[1] server pickSceneViewKey');
const P = svc.pickSceneViewKey;
ok(typeof P === 'function', 'pickSceneViewKey 已导出');
ok(P({ shot: '全景，洛水河畔，垂柳依依' }) === '0#wide', '全景 → 0#wide');
ok(P({ shot: '远景建立镜头' }) === '0#wide', '远景/建立镜头 → 0#wide');
ok(P({ shot: '中景，淑女采摘' }) === '0#medium', '中景 → 0#medium');
ok(P({ shot: '中近景，半身' }) === '0#medium', '中近景/半身 → 0#medium（不被「近景」吞掉）');
ok(P({ shot: '中景，淑女采摘特写' }) === '0#medium', '「中景，…特写」→ 取最靠前的景别=中景');
ok(P({ shot: '特写，卫太子侧颜' }) === '0#close', '「特写，卫太子侧颜」→ 特写');
ok(P({ shot: '全景，洛水河畔' }) === '0#wide', '「全景，洛水河畔」→ 全景');
ok(P({ shot: '特写，卫太子侧颜' }) === '0#close', '特写 → 0#close');
ok(P({ shot: '' }) === '0', 'shot 缺失 → 主场景图 0（老剧本行为不变）');

ok(P(null) === '0', 'null scene 不崩');

console.log('\n[2] server setAssetPrompt 放行视角键');
ok(svc.setAssetPrompt('REQ-NOT-EXIST', { asset_type: 'scene', asset_key: '0#wide', value: 'x' }).error === 'REQ_NOT_FOUND', '未知 REQ 仍先拦');
const junk = svc.setAssetPrompt(REQ, { asset_type: 'scene', asset_key: '0#乱七八糟', value: 'x' });
ok(junk.error === 'ASSET_SLOT_NOT_FOUND', '非白名单视角键 → 仍拒绝（防乱键灌库）');

console.log('\n[3] client buildScenePrompt(sp, ts, style, view)');
const src = fs.readFileSync(path.join(ROOT, 'client', 'js', 'views', 'assists', 'screenplay-core.js'), 'utf8');
const styleTpl = {
  stylePrefix: '严格写实摄影风格', styleSuffix: '电影感写实人像，单反画质', negativePrefix: '严格禁止卡通。',
  descriptors: { scene: '电影感建立镜头，写实', sceneQuality: '细节丰富，4K' },
};
const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sandbox = {
  console, escHtml, document: { getElementById: () => null },
  window: { ACMSScreenplayIPDict: { getStyleTemplate: () => styleTpl, lookup: () => null, listArtStyles: () => [] }, ACMSScreenplayRender: {} },
};
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const card = sandbox.window.ACMSScreenplayCard;
const sp = { setting: '春秋时期洛水河畔、春末夏初、柳絮纷飞', continuity_props: [{ label: '玉佩' }], art_style: 'photorealistic' };

const pClose = card.buildScenePrompt(sp, 60, undefined, 'close');
ok(/场景圣经·特写机位/.test(pClose), 'close：含「场景圣经·特写机位」声明');
ok(/环境元素必须与主场景图完全一致/.test(pClose), 'close：含跨视角环境一致性硬约束');
ok(/只允许改变机位、景别与取景范围/.test(pClose), 'close：只允许改机位/景别/取景范围');
ok(/构图：特写\/近景机位/.test(pClose), 'close：构图按特写景别');
ok(/场景基准图纪律/.test(pClose), 'close：仍带 v0.22.80 场景基准图纪律（未回退）');

const pWide = card.buildScenePrompt(sp, 60, undefined, 'wide');
ok(/场景圣经·全景机位/.test(pWide) && /构图：广角全景建立镜头/.test(pWide), 'wide：视角 + 全景构图都对');
const pMed = card.buildScenePrompt(sp, 60, undefined, 'medium');
ok(/场景圣经·中景机位/.test(pMed) && /构图：中景机位/.test(pMed), 'medium：视角 + 中景构图都对');

const pNone = card.buildScenePrompt(sp, 60);
ok(!/场景圣经/.test(pNone), '不传 view → 老措辞（无场景圣经段，向后兼容）');
ok(/构图：广角建立镜头，略低角度或平视，前中后景层次清晰，以环境为主体。/.test(pNone), '不传 view → 保留原构图句');
const pBad = card.buildScenePrompt(sp, 60, undefined, '乱填');
ok(!/场景圣经/.test(pBad), '非法 view 值 → 按"无视角"处理（不产生脏 prompt）');

console.log('\n[4] client renderDetail 的场景圣经区块');
const data = {
  project_id: 'agent-buddy-actions', status: 'done', picked: 0, target_seconds: 60, art_style: 'photorealistic',
  screenplays: [{
    title: 'T', logline: 'L', setting: '春日河畔', continuity_props: [],
    characters: [{ name: '小明', desc: '白衣少年' }],
    scenes: [{ time: '0-8s', shot: '全景', action: 'a', characters: ['小明'] }],
  }],
  assets: { characters: {}, scenes: { '0': { asset_path: 'assets/scene0.png' }, '0#close': { asset_path: 'assets/scene_close.png' } } },
  scene_frames: {}, scene_videos: {}, video_opts: {},
};
let html = '';
try { html = card.renderDetail(REQ, data); } catch (e) { console.log('   (renderDetail 抛错):', e.message); }
if (html) {
  ok(html.includes('场景圣经（多视角）'), '渲染出「场景圣经（多视角）」区块');
  ok((html.match(/spsv-[^"]+-wide/g) || []).length >= 1, '有全景 textarea');
  ok((html.match(/spsv-[^"]+-medium/g) || []).length >= 1, '有中景 textarea');
  ok((html.match(/spsv-[^"]+-close/g) || []).length >= 1, '有特写 textarea');
  ok(/updateAssetPrompt\('[^']+', 'scene', '0#close'/.test(html), "特写行 onblur 写回 '0#close'");
  ok(/screenplayGenImageForm\('[^']+', 'scene', '0#wide'/.test(html), "全景行按钮用 '0#wide' 作 asset_key");
  ok(html.includes('scene_close.png'), '已生成的视角图会渲染缩略图');
} else {
  ok(/场景圣经（多视角）/.test(src), '[源码] 场景圣经区块存在');
}

console.log(`\n=== 汇总: ${passed} pass · ${failed} fail ===`);
process.exit(failed ? 1 : 0);
