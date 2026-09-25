// ============================================================
// test-screenplay-prompt-builders.js — v0.22.80/81 客户端 prompt 构造函数回归测试
//   （client 的 screenplay-core.js 是浏览器 IIFE，用假 window 在 node 里跑真实代码）
//   覆盖：
//     ① buildScenePrompt：场景基准图纪律（元素登记）+ 负面词 + 空 setting/props 边界
//     ② buildCharacterPrompt：主体类别判定三级规则（人形标记 / 强非人形 / 弱非人形 + 风格词剔除）
//        —— 锁死 v0.22.81 修的误判：「古风」里的 '风' 把古风角色判成非人形
//     ③ buildCharacterPrompt：非人形分支才去掉表情/姿态行 + 负面含「非拟人化主体误加五官」
//   跑法：node server/__tests__/test-screenplay-prompt-builders.js
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(
  path.join(__dirname, '..', '..', 'client', 'js', 'views', 'assists', 'screenplay-core.js'), 'utf8');

const styleTpl = {
  stylePrefix: 'S', styleSuffix: 'S', negativePrefix: 'N',
  descriptors: { character: 'c', characterQuality: 'cq', scene: 's', sceneQuality: 'sq', video: 'v', videoQuality: 'vq' },
};
const logs = [];
const sandbox = {
  console: { log: (...a) => logs.push(a.join(' ')), warn: () => {}, error: () => {} },
  escHtml: s => String(s == null ? '' : s),
  toast: () => {}, previewImage: () => {},
  window: { ACMSScreenplayIPDict: { getStyleTemplate: () => styleTpl, lookup: () => null, listArtStyles: () => [] } },
};
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const card = sandbox.window.ACMSScreenplayCard;

let passed = 0, failed = 0;
function ok(cond, name) { if (cond) { passed++; console.log('  ✓', name); } else { failed++; console.error('  ✗', name); } }

// ---------- ① buildScenePrompt ----------
console.log('\n[1] buildScenePrompt 场景基准图纪律');
const spRich = {
  setting: '春日河畔，波光粼粼',
  continuity_props: [{ label: '雎鸠鸟' }, { label: '花篮' }],
};
let p = card.buildScenePrompt(spRich, 60, '3d-render');
ok(/场景基准图纪律/.test(p), '含「场景基准图纪律」段');
ok(p.includes('春日河畔，波光粼粼'), '带 setting 原文');
ok(p.includes('雎鸠鸟') && p.includes('花篮'), '带登记道具');
ok(p.includes('楼阁') && p.includes('樱花'), '禁止清单覆盖 建筑 + 开花乔木');
ok(p.indexOf('设定未登记的建筑') > p.indexOf('负面：'), '负面行含「设定未登记的建筑…」');
ok(/画面中不出现人物/.test(p), '空镜约束保留（不回归）');

const p2 = card.buildScenePrompt({ setting: '', continuity_props: [] }, 30, 'photorealistic');
ok(/未填写，本图只画氛围空镜/.test(p2), '空 setting → 兜底文案，不崩');
ok(!/登记道具：/.test(p2), '无 props → 不出现悬空「登记道具：」');

// ---------- ② 主体类别判定 ----------
console.log('\n[2] buildCharacterPrompt 主体类别判定（v0.22.81 误判修复）');
function classify(name, desc) {
  const out = card.buildCharacterPrompt({ name, desc }, { art_style: '3d-render', setting: '春日河畔' }, 60);
  return { out, nonHuman: out.includes('非拟人化主体误加五官') };
}
const humanCases = [
  ['淑女', '古风少女、乌黑长发盘髻、淡粉色罗裙'],
  ['窈窕淑女', '古风女子、淡粉色襦裙、手持木桨'],
  ['君子', '古风青年男子、白色宽袖长袍'],
  ['卫太子', '玄色深衣、头戴玉冠的年轻男子'],
  ['采荇女', '古风少女、手持花篮'],           // '花' 弱词 + 人形标记 → 人形
  ['李明', '35岁男性、西装、短发'],
  ['护士小美', '穿白大褂的年轻女性'],
];
for (const [n, d] of humanCases) {
  const r = classify(n, d);
  ok(!r.nonHuman, `人形：${n}（desc: ${d.slice(0, 12)}…）走人形模板`);
}
ok(/表情：/.test(classify('淑女', '古风少女、乌黑长发盘髻、淡粉色罗裙').out), '人形模板保留「表情：」行');

const nonHumanCases = [
  ['老拖车', '棕色重型拖车、黄色警示灯'],
  ['小卡', '白色小型货车、圆润车头大灯'],
  ['雎鸠', '雎鸠鸟一对、黑白羽毛'],
  ['铁塔', '高耸的钢铁塔身'],                 // 弱词 '塔' + 无人形标记 → 非人形
];
for (const [n, d] of nonHumanCases) {
  const r = classify(n, d);
  ok(r.nonHuman, `非人形：${n}（desc: ${d.slice(0, 12)}…）走非人形模板`);
  ok(!/表情：/.test(r.out), `非人形：${n} 去掉「表情：」行`);
}

console.log(`\n=== 汇总: ${passed} pass · ${failed} fail ===`);
process.exit(failed ? 1 : 0);
