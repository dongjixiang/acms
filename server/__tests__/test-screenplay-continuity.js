// 测试: ACMS 剧本连续性校验（v0.X continuity_bible）
//   bug 背景: 剧本生成存在 3 类问题——
//     ① 场景图 vs 首帧图物体漂移（场景里的道具在首帧图里凭空消失/多出）
//     ② 未来场景没有预测（伏笔埋了没收，跨场道具断裂）
//     ③ 科学性缺失（凭空多出一个东西，没登记就用）
//   修法: 增 SCREENPLAY_PROMPT 输出 continuity_props/continuity_state + scene 4 个 props_* 字段
//          + 静态校验函数 validateScreenplayContinuity（warn-only 不阻塞）
//
// 测试目标:
//   - 老剧本（无新字段）→ 返回 []（不刷屏）
//   - 正常剧本（登记齐全 + 跨场一致）→ 返回 []
//   - phantom_prop（凭空出现）→ 命中
//   - unresolved_setup（未回收伏笔）→ 命中
//   - unregistered_setup（未登记伏笔）→ 命中
//   - substring 匹配（"长剑" 命中 "长剑（林风持）"，不命中 "剑鞘"）→ 验证
//   - 防御式：null/undefined 输入 → 返回 []
//
// 用法: node server/__tests__/test-screenplay-continuity.js

const { validateScreenplayContinuity } = require('../services/assists/screenplay-continuity');

let pass = 0, fail = 0;
function eq(actual, expected, name) {
  const ok = actual === expected;
  console.log((ok ? '  ✓' : '  ✗') + ' ' + name + (ok ? '' : ` : expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`));
  if (ok) pass++; else fail++;
}
function ok(cond, name) {
  console.log((cond ? '  ✓' : '  ✗') + ' ' + name);
  if (cond) pass++; else fail++;
}
function deepEqualArr(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// === T1: 老剧本（无 continuity_bible 字段）→ 返回 [] ===
console.log('\n=== T1: 老剧本/未启用 continuity_bible 不刷屏 ===');
const legacySp = {
  title: '老剧本',
  logline: '老格式',
  characters: [{ name: '君子', desc: '古代书生' }],
  setting: '古代山林',
  scenes: [
    { characters: ['君子'], time: '0-5s', shot: '中景', dialogue: '——', action: '君子独行' },
    { characters: ['君子'], time: '5-15s', shot: '近景', dialogue: '——', action: '君子遇玉兰' },
  ],
  shot_tips: '古典风',
};
eq(validateScreenplayContinuity(legacySp).length, 0, '老剧本（无 continuity_props / props_*）返回空数组');
eq(validateScreenplayContinuity(null).length, 0, 'null 输入返回空数组');
eq(validateScreenplayContinuity(undefined).length, 0, 'undefined 输入返回空数组');
eq(validateScreenplayContinuity({}).length, 0, '空对象输入返回空数组');

// === T2: 正常剧本（登记齐全 + 跨场一致）→ 返回 [] ===
console.log('\n=== T2: 正常剧本——登记齐全且跨场一致无告警 ===');
const goodSp = {
  title: '正常',
  characters: [{ name: '林风', desc: '持剑侠客' }],
  setting: '古代山道',
  continuity_props: [
    { key: 'sword', label: '长剑', first_intro: 1, status_in_end: 'carry', note: '林风持剑贯穿全剧' },
    { key: 'letter', label: '密信', first_intro: 2, status_in_end: 'lost', note: '第 2 场引入，第 4 场丢失' },
  ],
  continuity_state: { world_time: '黄昏→夜晚', weather: '晴', character_states: {} },
  scenes: [
    { characters: ['林风'], time: '0-5s', shot: '中景', dialogue: '——', action: '林风持剑而行',
      scene_location: '山道入口', props_present: ['长剑（林风持）'], props_setup: [], props_resolve: [] },
    { characters: ['林风'], time: '5-15s', shot: '近景', dialogue: '——', action: '林风拾到密信',
      scene_location: '破庙内殿', props_present: ['长剑', '密信'], props_setup: [], props_resolve: [] },
    { characters: ['林风'], time: '15-25s', shot: '特写', dialogue: '——', action: '林风藏信于树洞',
      scene_location: '古树旁', props_present: ['长剑'], props_setup: ['密信'], props_resolve: [] },
    { characters: ['林风'], time: '25-30s', shot: '中景', dialogue: '——', action: '密信被风吹走',
      scene_location: '山道尽头', props_present: ['长剑'], props_setup: [], props_resolve: ['密信（被风吹走）'] },
  ],
  shot_tips: '',
};
eq(validateScreenplayContinuity(goodSp).length, 0, '正常剧本（道具登记 + 跨场一致 + 伏笔回收）返回空数组');

// === T3: phantom_prop（凭空出现）→ 命中 ===
console.log('\n=== T3: 凭空出现检测 ===');
const phantomSp = {
  ...goodSp,
  scenes: goodSp.scenes.map((sc, i) => i === 1
    ? { ...sc, props_present: ['长剑', '望远镜'] }  // ← 望远镜未登记
    : sc),
};
const phantomWarnings = validateScreenplayContinuity(phantomSp);
ok(phantomWarnings.some(w => w.code === 'phantom_prop' && w.prop === '望远镜'), '检测到「望远镜」凭空出现');
ok(phantomWarnings.find(w => w.code === 'phantom_prop')?.scene_idx === 1, 'scene_idx 指向正确场次（第 2 场）');

// === T4: unresolved_setup（未回收伏笔）→ 命中 ===
console.log('\n=== T4: 未回收伏笔检测 ===');
const unresolvedSp = {
  ...goodSp,
  scenes: goodSp.scenes.map((sc, i) => i === 2
    ? { ...sc, props_setup: ['暗器'] }   // ← 埋伏笔但不进登记，第 3 场埋伏笔未回收
    : i === 3
      ? { ...sc, props_present: ['长剑'] }   // 第 4 场没引用暗器
      : sc),
};
const unresolvedWarnings = validateScreenplayContinuity(unresolvedSp);
// "暗器" 既未在 continuity_props 登记 → 走 unregistered_setup；也未在 1~3 场后引用 → unresolved_setup
ok(unresolvedWarnings.some(w => w.code === 'unresolved_setup' && w.prop === '暗器'), '检测到「暗器」未回收伏笔');

// === T5: unregistered_setup（未登记伏笔）→ 命中 ===
console.log('\n=== T5: 未登记伏笔检测 ===');
const unregisteredSetupSp = {
  ...goodSp,
  scenes: goodSp.scenes.map((sc, i) => i === 0
    ? { ...sc, props_setup: ['飞镖'] }   // ← 飞镖未在 continuity_props 登记
    : sc),
};
const unregisteredWarnings = validateScreenplayContinuity(unregisteredSetupSp);
ok(unregisteredWarnings.some(w => w.code === 'unregistered_setup' && w.prop === '飞镖'), '检测到「飞镖」未登记就埋伏笔');

// === T6: substring 匹配（中文标点 + 长串包含） ===
console.log('\n=== T6: substring 匹配（中文去标点 + 包含关系）===');
const subStrSp = {
  ...goodSp,
  scenes: goodSp.scenes.map((sc, i) => i === 1
    ? { ...sc, props_present: ['那把长剑（沾血）'] }   // 含「长剑」子串 → 应识别为已登记
    : sc),
};
eq(validateScreenplayContinuity(subStrSp).length, 0, '「那把长剑（沾血）」含「长剑」子串 → 不报警（避免同物不同名）');

// === T7: 区分相近但不同的道具 ===
console.log('\n=== T7: 区分相近但不同的道具（"剑鞘" ≠ "长剑"）===');
const distinctPropSp = {
  ...goodSp,
  scenes: goodSp.scenes.map((sc, i) => i === 1
    ? { ...sc, props_present: ['长剑', '剑鞘'] }  // ← "剑鞘" 跟 "长剑" 不重叠 → 报警
    : sc),
};
const distinctWarnings = validateScreenplayContinuity(distinctPropSp);
ok(distinctWarnings.some(w => w.code === 'phantom_prop' && w.prop === '剑鞘'), '「剑鞘」与「长剑」非子串 → 报警为凭空出现');

// === T8: 伏笔在 N+2 场被引用 → 不报警 ===
console.log('\n=== T8: 伏笔在合理窗口内被引用 → 不报警 ===');
const resolvedFarSp = {
  ...goodSp,
  scenes: [
    goodSp.scenes[0],
    { ...goodSp.scenes[1], props_setup: ['玉佩'] },   // 第 2 场埋伏笔
    { ...goodSp.scenes[2] },                            // 第 3 场不引用
    { ...goodSp.scenes[3] },                            // 第 4 场不引用
    { characters: ['林风'], time: '30-50s', shot: '中景', dialogue: '——', action: '林风掏玉佩',
      scene_location: '山道', props_present: ['长剑', '玉佩'], props_setup: [], props_resolve: [] },
  ],
};
// 但玉佩未在 continuity_props 登记 → 会被 unregistered_setup 报警
// 这里测的是伏笔回收，所以需要先把玉佩加进 continuity_props
resolvedFarSp.continuity_props = [
  ...goodSp.continuity_props,
  { key: 'jade', label: '玉佩', first_intro: 2, status_in_end: 'carry', note: '剧情信物' },
];
const resolvedFarWarnings = validateScreenplayContinuity(resolvedFarSp);
ok(!resolvedFarWarnings.some(w => w.code === 'unresolved_setup' && w.prop === '玉佩'),
  '「玉佩」伏笔在第 5 场（N+3）被引用 → 不报警为未回收');

// === T9: 多剧本批量（runAssistJob 调用模式）===
console.log('\n=== T9: 多剧本批量（验证 sp_idx 链路） ===');
const sps = [goodSp, phantomSp];
const batchResult = sps.map((sp, idx) => ({ sp_idx: idx, warnings: validateScreenplayContinuity(sp) }));
eq(batchResult[0].warnings.length, 0, '第 1 个好剧本无告警');
ok(batchResult[1].warnings.length > 0, '第 2 个 phantom 剧本有告警');

// === 汇总 ===
console.log(`\n=== 汇总: ${pass} pass · ${fail} fail ===`);
if (fail > 0) process.exit(1);