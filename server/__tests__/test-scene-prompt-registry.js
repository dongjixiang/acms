// buildScenePrompt v0.22.80 冒烟：确认「场景基准图纪律」真的进了 prompt
//   client 的 screenplay-core.js 是浏览器 IIFE（依赖 window），这里用假 window 兜住
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'js', 'views', 'assists', 'screenplay-core.js'), 'utf8');

const styleTpl = {
  stylePrefix: '严格写实摄影风格', styleSuffix: '电影感写实人像，单反画质',
  negativePrefix: '严格禁止卡通。',
  descriptors: { scene: '电影感建立镜头，写实', sceneQuality: '细节丰富，4K' },
};
const sandbox = {
  console,
  window: {
    ACMSScreenplayIPDict: { getStyleTemplate: () => styleTpl, lookup: () => null, listArtStyles: () => [] },
    ACMSScreenplayRender: {},
  },
};
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const card = sandbox.window.ACMSScreenplayCard;
if (!card || typeof card.buildScenePrompt !== 'function') {
  console.error('✗ 拿不到 ACMSScreenplayCard.buildScenePrompt'); process.exit(1);
}

const out = card.buildScenePrompt({
  setting: '春日河畔，波光粼粼，荇菜丰盛',
  continuity_props: [{ key: '雎鸠', label: '雎鸠鸟' }, { key: '花篮', label: '花篮' }],
}, 60, '3d-render');

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.error('  ✗', n); } };

ok(/场景基准图纪律/.test(out), '含「场景基准图纪律」段');
ok(out.includes('本图将作为全剧所有分镜的参考基准'), '点明「参考基准 → 未登记元素会被逐场复制」');
ok(out.includes('春日河畔，波光粼粼，荇菜丰盛'), '带 setting 原文');
ok(out.includes('雎鸠鸟') && out.includes('花篮'), '带登记道具（continuity_props）');
ok(out.includes('楼阁') && out.includes('樱花'), '禁止清单含建筑 + 开花乔木');
ok(/负面：/.test(out) && out.indexOf('设定未登记的建筑') > out.indexOf('负面：'), '负面行含「设定未登记的建筑…」');
ok(/画面中不出现人物/.test(out), '空镜约束未被破坏（原行为保留）');

// 无 props / 无 setting 边界
const out2 = card.buildScenePrompt({ setting: '', continuity_props: [] }, 30, 'photorealistic');
ok(/未填写，本图只画氛围空镜/.test(out2), '无 setting → 提示「未填写，只画氛围空镜」（不崩）');
ok(!/登记道具：/.test(out2), '无 props → 不出现悬空的「登记道具：」标签');

console.log(`\n=== buildScenePrompt 冒烟: ${pass} 通过 / ${fail} 失败 ===`);
console.log('\n--- 实际输出（前 420 字）---\n' + out.slice(0, 420));
process.exit(fail ? 1 : 0);
