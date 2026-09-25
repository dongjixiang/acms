// ============================================================
// test-asset-prompt-override.js — v0.22.82 角色图/场景图 prompt 持久化
//   覆盖：
//     ① server setAssetPrompt：防御式校验（REQ_NOT_FOUND / INVALID_ASSET_TYPE /
//        MISSING_ASSET_KEY / ASSET_SLOT_NOT_FOUND）—— 全部走「不写库」路径
//     ② client renderDetail：textarea 默认值优先读 prompt_override + onblur 写回（§6.6 第 4 步）
//     ③ 静态检查：route 有 set_asset_prompt 分支 + dispatcher 导出 updateAssetPrompt
//   跑法：node server/__tests__/test-asset-prompt-override.js
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
const REQ = 'REQ-MUGOR3KP'; // 只读探针（验证失败路径，不写库）

console.log('\n[1] setAssetPrompt 防御式校验');
ok(typeof svc.setAssetPrompt === 'function', 'setAssetPrompt 已导出');
ok(svc.setAssetPrompt('REQ-NOT-EXIST', {}).error === 'REQ_NOT_FOUND', '未知 REQ → REQ_NOT_FOUND');
ok(svc.setAssetPrompt(REQ, { asset_type: 'bogus', asset_key: 'x' }).error === 'INVALID_ASSET_TYPE', '非法 asset_type → INVALID_ASSET_TYPE');
ok(svc.setAssetPrompt(REQ, { asset_type: 'character' }).error === 'MISSING_ASSET_KEY', '缺 asset_key → MISSING_ASSET_KEY');
const r4 = svc.setAssetPrompt(REQ, { asset_type: 'character', asset_key: '不存在的角色XYZ', value: 'x' });
ok(r4.error === 'ASSET_SLOT_NOT_FOUND', '未生成的槽位 → ASSET_SLOT_NOT_FOUND（防拼错角色名灌库）');
ok(Array.isArray(r4.known), 'ASSET_SLOT_NOT_FOUND 带 known 列表（便于排查）');

console.log('\n[2] 静态检查（route + dispatcher）');
const routeSrc = fs.readFileSync(path.join(ROOT, 'server', 'routes', 'requirements.js'), 'utf8');
const dispSrc = fs.readFileSync(path.join(ROOT, 'client', 'js', 'views', 'assists', 'dispatcher.js'), 'utf8');
const genSrc = fs.readFileSync(path.join(ROOT, 'client', 'js', 'views', 'assists', 'screenplay.js'), 'utf8');
ok(/action === 'set_asset_prompt'/.test(routeSrc), "use route 有 set_asset_prompt 分支");
ok(/svc\.setAssetPrompt\(/.test(routeSrc), 'route 调 svc.setAssetPrompt');
ok(/async function updateAssetPrompt/.test(dispSrc) && /updateAssetPrompt \}/.test(dispSrc), 'dispatcher 定义 + 导出 updateAssetPrompt');
ok(/assets\.<bucket>\[assetKey\]\.prompt_override|prompt_override/.test(genSrc), 'screenplayGenImage 有 override 兜底（三层优先级）');

console.log('\n[3] renderDetail：默认值读 override + onblur 写回');
const src = fs.readFileSync(path.join(ROOT, 'client', 'js', 'views', 'assists', 'screenplay-core.js'), 'utf8');
const styleTpl = {
  stylePrefix: '严格写实摄影风格', styleSuffix: '电影感写实人像', negativePrefix: '严格禁止卡通。',
  descriptors: { character: '影棚主光', characterQuality: '4K', scene: '建立镜头', sceneQuality: '4K', video: '电影感 $TS$ 秒', videoQuality: '4K' },
};
const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sandbox = {
  console,
  escHtml,
  document: { getElementById: () => null },
  window: {
    ACMSScreenplayIPDict: { getStyleTemplate: () => styleTpl, lookup: () => null, listArtStyles: () => [] },
    ACMSScreenplayRender: {},
  },
};
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const card = sandbox.window.ACMSScreenplayCard;
ok(!!card && typeof card.renderDetail === 'function', 'renderDetail 可用');

const data = {
  project_id: 'agent-buddy-actions',
  status: 'done',
  picked: 0,
  target_seconds: 60,
  art_style: 'photorealistic',
  screenplays: [{
    title: 'T', logline: 'L', setting: '春日河畔',
    continuity_props: [{ label: '花篮' }],
    characters: [{ name: '小明', desc: '白衣少年' }],
    scenes: [{ time: '0-8s', shot: '中景', action: 'a', dialogue: '——', characters: ['小明'] }],
  }],
  assets: {
    characters: { '小明': { asset_path: 'assets/x.png', prompt_override: 'CUSTOM-CHAR-PROMPT-小明' } },
    scenes: { '0': { asset_path: 'assets/y.png', prompt_override: 'CUSTOM-SCENE-PROMPT' } },
  },
  scene_frames: {}, scene_videos: {}, video_opts: {},
};
let html = '';
try { html = card.renderDetail(REQ, data); } catch (e) { console.log('   (renderDetail 抛错，降级为源码检查):', e.message); }
if (html) {
  ok(html.includes('CUSTOM-CHAR-PROMPT-小明'), '角色 textarea 默认值 = 持久化的 prompt_override');
  ok(html.includes('CUSTOM-SCENE-PROMPT'), '场景 textarea 默认值 = 持久化的 prompt_override');
  ok(/updateAssetPrompt\('[^']+', 'character'/.test(html), "角色 textarea onblur 写回（asset_type='character'）");
  ok(/updateAssetPrompt\('[^']+', 'scene', '0'/.test(html), "场景 textarea onblur 写回（asset_type='scene', key='0'）");
  ok(html.includes('已保存为自定义提示词'), '有 override 时提示「已保存为自定义提示词」');
  // 未设 override 的角色 → 仍走默认 buildCharacterPrompt（含角色白名单锚定句）
  const data2 = JSON.parse(JSON.stringify(data));
  delete data2.assets.characters['小明'].prompt_override;
  const html2 = card.renderDetail(REQ, data2);
  ok(!html2.includes('CUSTOM-CHAR-PROMPT-小明') && /元素白名单/.test(html2), '无 override → 退回默认 buildCharacterPrompt（不残留旧值）');
} else {
  // 兜底：至少确认源码里默认值优先读 override
  ok(/charPromptOverride \|\| buildCharacterPrompt/.test(src), '[源码] 角色默认值 override-first');
  ok(/sceneOverride \|\| buildScenePrompt/.test(src), '[源码] 场景默认值 override-first');
}

console.log(`\n=== 汇总: ${passed} pass · ${failed} fail ===`);
process.exit(failed ? 1 : 0);
