// ============================================================
// test-screenplay-render-structure.js — 剧本视图 HTML 结构回归
//
//   为什么要有这个测试：v0.22.85 用户报「选中剧本后，最后一个场景外面套了很多层」。
//   根因 = 场景块模板里的一个 </div>（首帧图标题行 flex 容器的闭合）被误删 →
//   浏览器把后续兄弟节点塞进未闭合的 div → 场景 1 装场景 2、场景 2 装场景 3 …
//   这类 bug 语法检查/单测全绿（字符串照样拼得出来），只有在浏览器里才看得见 → 必须靠结构断言拦。
//
//   跑法：node server/__tests__/test-screenplay-render-structure.js
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

const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sandbox = { console: { log: () => {}, warn: () => {}, error: console.error }, escHtml, document: { getElementById: () => null }, window: {} };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'client', 'js', 'views', 'assists', 'ip-dict.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'client', 'js', 'views', 'assists', 'screenplay-core.js'), 'utf8'), sandbox);
const card = sandbox.window.ACMSScreenplayCard;

function mkData(nScenes, withFrames) {
  const scenes = Array.from({ length: nScenes }, (_, i) => ({
    time: `${i * 8}-${i * 8 + 8}s`, shot: i % 3 === 0 ? '全景' : i % 3 === 1 ? '中景' : '特写',
    action: `动作${i}`, dialogue: i === 1 ? '对白' : '——', characters: ['小明'], scene_location: '河边',
  }));
  const frames = {};
  if (withFrames) for (let i = 0; i < nScenes; i++) {
    frames[String(i)] = {
      asset_path: `assets/f${i}.png`, prompt: `p${i}`, refs: [{ kind: 'scene', name: '场景基准图（全景）' }],
      l6_check: i === 0 ? { ok: true, violations: [] } : { ok: false, violations: ['多出人物'] },
      scene_view: i % 3 === 0 ? '0#wide' : (i % 3 === 1 ? '0#medium' : '0#close'),
      polished: i === 2, prev: i === 2 ? 'assets/old.png' : null,
    };
  }
  return {
    project_id: 'agent-buddy-actions', status: 'done', picked: 0, target_seconds: 60, art_style: '3d-render',
    idea: '测试创意',
    screenplays: [{
      title: '测试剧本', logline: 'L', setting: '春日河畔', continuity_props: [{ label: '花篮' }],
      characters: [{ name: '小明', desc: '白衣少年' }], scenes,
    }],
    assets: {
      characters: { '小明': { asset_path: 'assets/c.png', options: [{ asset_path: 'assets/c.png' }], prompt_override: '' } },
      scenes: { '0': { asset_path: 'assets/s.png' }, '0#close': { asset_path: 'assets/sc.png' } },
    },
    scene_frames: frames, scene_videos: {}, video_opts: {},
    warnings: [{ sp_idx: 0, warnings: [{ code: 'phantom_prop', scene_idx: 1, prop: '花篮', message: '凭空出现' }] }],
  };
}

// ── 通用：标签配平 + 场景块嵌套检测 ──
function tagBalances(html) {
  const out = {};
  for (const t of ['div', 'details', 'summary', 'textarea', 'span', 'button']) {
    const open = (html.match(new RegExp(`<${t}\\b`, 'gi')) || []).length;
    const close = (html.match(new RegExp(`</${t}>`, 'gi')) || []).length;
    out[t] = { open, close, ok: open === close };
  }
  return out;
}
function sceneBlockNesting(html) {
  const re = /<(\/?)div\b[^>]*?(\/)?>/gi;
  const stack = [];        // 每层：'scene' | 'other'
  const sceneDepths = [];  // 每个场景块出现时的嵌套深度（兄弟 = 深度相同）
  let m;
  while ((m = re.exec(html))) {
    const closing = m[1] === '/';
    if (m[2]) continue;                       // 自闭合标签跳过
    if (!closing) {
      const isScene = /class="screenplay-scene-block"/.test(m[0]);
      if (isScene) sceneDepths.push(stack.length + 1);
      stack.push(isScene ? 'scene' : 'other');
    } else {
      stack.pop();                            // 同名 div 收拢（DOM 语义下多余闭合会吞外层，这里靠 depth 断言兜住）
    }
  }
  const uniq = Array.from(new Set(sceneDepths));
  return { sceneDepths, allSiblings: uniq.length <= 1, unbalanced: stack.length };
}

console.log('\n[1] 已选剧本 + 3 场 + 有首帧图（用户报的场景）');
let html = card.renderDetail('REQ-X', mkData(3, true));
const b = tagBalances(html);
for (const t of Object.keys(b)) ok(b[t].ok, `<${t}> 配平（开 ${b[t].open} / 闭 ${b[t].close}）`);
const nest = sceneBlockNesting(html);
ok(nest.unbalanced === 0, 'div 栈结束时为空（无未闭合容器）');
ok(nest.allSiblings, `3 个场景块深度一致 = 兄弟关系（实际 [${nest.sceneDepths.join(', ')}]）`);
ok((html.match(/class="screenplay-scene-block"/g) || []).length === 3, '3 个场景块都渲染出来了');

console.log('\n[2] 7 场 + 无首帧图（空态分支）');
html = card.renderDetail('REQ-X', mkData(7, false));
const b2 = tagBalances(html);
ok(b2.div.ok, `<div> 配平（开 ${b2.div.open} / 闭 ${b2.div.close}）`);
const nest2 = sceneBlockNesting(html);
ok(nest2.allSiblings && nest2.unbalanced === 0, `空态下 7 个场景块也是兄弟关系、不留未闭合（实际 [${nest2.sceneDepths.join(', ')}]）`);
ok((html.match(/class="screenplay-scene-block"/g) || []).length === 7, '7 个场景块都渲染出来了');

console.log('\n[3] 未选剧本分支（3 张卡）');
const unpicked = mkData(3, false);
unpicked.picked = null;
html = card.renderDetail('REQ-X', unpicked);
const b3 = tagBalances(html);
ok(b3.div.ok, `<div> 配平（开 ${b3.div.open} / 闭 ${b3.div.close}）`);

console.log(`\n=== 汇总: ${passed} pass · ${failed} fail ===`);
process.exit(failed ? 1 : 0);
