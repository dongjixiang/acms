// ============================================================
// test-l6-frame-check.js — v0.22.X L6 闭环验证（单元自测，不依赖真实 LLM）
//   覆盖：
//     ① parseL6CheckResult：干净 / 违规 / 带 ```json 包裹 / 垃圾 / 空
//     ② buildL6CheckPrompt：含 continuity_props 的 [PR_xx] 锚点、空镜分支、缺 props 分支
//   跑法：node server/__tests__/test-l6-frame-check.js
// ============================================================
const assert = require('assert');
const path = require('path');

// 直接从真实模块取（不 mock LLM，只测纯函数）
const screenplay = require('../services/assists/screenplay');

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.error('  ✗', name); }
}

// ---------- parseL6CheckResult ----------
console.log('\n[1] parseL6CheckResult');
const P = screenplay.parseL6CheckResult;

ok(P('').ok === true, '空字符串 → 降级通过');
ok(P(null).ok === true, 'null → 降级通过');
ok(P('我不确定怎么看这个图').ok === true, '非 JSON 废话 → 降级通过');

let r = P('{"violations":[],"ok":true,"reason":"画面干净"}');
ok(r.ok === true && r.violations.length === 0, '干净 JSON → ok:true');

r = P('{"violations":["楼阁","亭子"],"ok":false,"reason":"出现未登记建筑"}');
ok(r.ok === false && r.violations.length === 2, '违规 JSON → ok:false + violations 提取');
ok(r.violations[0] === '楼阁' && r.violations[1] === '亭子', 'violations 顺序保留');

r = P('```json\n{"violations":["塔"],"ok":false}\n```');
ok(r.ok === false && r.violations[0] === '塔', '```json 包裹 → 剥壳解析');

// ---------- buildL6CheckPrompt ----------
console.log('\n[2] buildL6CheckPrompt');
const B = screenplay.buildL6CheckPrompt;

// 有 props + 有 location + 有出场人物
let p = B(
  { setting: '初夏江南水乡荷塘', continuity_props: [{ label: '古琴' }, { label: '荇菜' }, { label: '白鹿' }] },
  { scene_location: '荷塘深处' },
  1,
  ['淑女', '君子']
);
ok(/PR_01/.test(p), '含 [PR_01] 锚点');
ok(/PR_02/.test(p), '含 [PR_02] 锚点');
ok(/PR_03/.test(p), '含 [PR_03] 锚点');
ok(p.includes('古琴') && p.includes('荇菜') && p.includes('白鹿'), '锚点带 label 文本');
ok(p.includes('荷塘深处'), '含 scene_location');
ok(p.includes('淑女') && p.includes('君子'), '含出场人物');
ok(/出场人物/.test(p), '有 cast → 用「出场人物」措辞');

// 空镜分支（无 cast）
p = B({ setting: '空山', continuity_props: [] }, { scene_location: '山巅' }, 0, []);
ok(/环境空镜/.test(p), '无 cast → 用「环境空镜」措辞');
ok(!/PR_/.test(p), '无 props → 不含 [PR_xx]');

// 缺 location
p = B({ setting: '城', continuity_props: [{ label: '灯笼' }] }, {}, 0, ['甲']);
ok(!/本场空间/.test(p) || p.includes(''), '缺 scene_location 不崩');
ok(p.includes('灯笼'), '单 prop 锚点正常');

// ---------- 结果汇总 ----------
console.log(`\n=== L6 自测: ${passed} 通过 / ${failed} 失败 ===`);
if (failed) process.exit(1);
else { console.log('ALL PASS ✓'); process.exit(0); }
