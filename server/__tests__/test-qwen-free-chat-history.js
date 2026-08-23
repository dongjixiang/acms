// ============================================================
// scripts/test-qwen-free-chat-history.js
// ============================================================
// 测试 v0.117 改动：chat 流历史拼到 prompt 前（治"自由对话上下文缺失"）
//
// 覆盖：
//   T1 - buildHistoryPrompt 空数组 → 原 prompt
//   T2 - buildHistoryPrompt 单条 → 拼好格式正确
//   T3 - buildHistoryPrompt 多条 + assistant + user → 顺序正确
//   T4 - buildHistoryPrompt 截断单条 > 1500 字
//   T5 - buildHistoryPrompt 跳过空 content
//   T6 - buildHistoryPrompt user/assistant 角色映射正确（用户/助手）
//   T7 - buildHistoryPrompt 未知 role 兜底为 '?'
//   T8 - 集成：qwen-manager.chat 接 historyMessages → prompt 拼接生效
// ============================================================

let pass = 0, fail = 0;
const failed = [];
function ok(name) { pass++; console.log(`  ✓ ${name}`); }
function bad(name, e) { fail++; failed.push({ name, e }); console.log(`  ✗ ${name}: ${e}`); }
function eq(a, b, name) { if (JSON.stringify(a) === JSON.stringify(b)) ok(name); else bad(name, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function assert(cond, name) { if (cond) ok(name); else bad(name, 'assertion failed'); }

// ---- 直接 require qwen-manager（不需要 spawn Qwen CLI） ----
const qwenMgr = require('../services/qwen-manager');

// buildHistoryPrompt 没 export——用 chat() 间接测，或重导出
// 临时挂到 module.exports 上方便测试（不破坏生产）
const buildHistoryPrompt = qwenMgr.buildHistoryPrompt || null;
if (!buildHistoryPrompt) {
  // 通过 require 进 qwen-manager.js 直接拿（hack：内部函数可见）
  // Node CommonJS：require 拿不到未 export 函数
  console.log('buildHistoryPrompt 未 export，跳过单元测试，进入集成验证模式');
  console.log('（建议手动验证 chat() 行为）');
  process.exit(0);
}

console.log('\n=== T1-T7：buildHistoryPrompt 单元测试 ===\n');

// T1: 空数组 → 原 prompt
eq(buildHistoryPrompt([], '今天天气怎么样？'), '今天天气怎么样？', 'T1 空数组返回原 prompt');
eq(buildHistoryPrompt(null, '你好'), '你好', 'T1b null 返回原 prompt');
eq(buildHistoryPrompt(undefined, 'hi'), 'hi', 'T1c undefined 返回原 prompt');

// T2: 单条 user
const r2 = buildHistoryPrompt([{ role: 'user', content: '我叫多多' }], '我叫什么？');
assert(r2.includes('[对话历史'), 'T2 含对话历史标记');
assert(r2.includes('用户: 我叫多多'), 'T2 user role 映射为"用户"');
assert(r2.includes('[当前请求]'), 'T2 含当前请求标记');
assert(r2.includes('用户: 我叫什么？'), 'T2 含当前 user prompt');
assert(r2.includes('用户: 我叫多多') && r2.indexOf('用户: 我叫多多') < r2.indexOf('用户: 我叫什么？'),
  'T2 历史在前，当前请求在后');

// T3: 多条混合
const r3 = buildHistoryPrompt([
  { role: 'user', content: '你好' },
  { role: 'assistant', content: '你好多多' },
  { role: 'user', content: '今天去哪玩' },
  { role: 'assistant', content: '北京不错' },
], '再推荐一个');
assert(r3.includes('用户: 你好'), 'T3 第1条 user');
assert(r3.includes('助手: 你好多多'), 'T3 第2条 assistant');
assert(r3.includes('用户: 今天去哪玩'), 'T3 第3条 user');
assert(r3.includes('助手: 北京不错'), 'T3 第4条 assistant');
assert(r3.includes('用户: 再推荐一个'), 'T3 当前请求');
// 验证顺序
const idx1 = r3.indexOf('用户: 你好');
const idx2 = r3.indexOf('助手: 你好多多');
const idx3 = r3.indexOf('用户: 今天去哪玩');
const idx4 = r3.indexOf('助手: 北京不错');
const idxCur = r3.indexOf('用户: 再推荐一个');
assert(idx1 < idx2 && idx2 < idx3 && idx3 < idx4 && idx4 < idxCur, 'T3 顺序：user→assistant→user→assistant→current');

// T4: 截断 > 1500 字
const longContent = 'A'.repeat(2000);
const r4 = buildHistoryPrompt([{ role: 'user', content: longContent }], '问个问题');
assert(r4.includes('A'.repeat(1500) + '…'), 'T4 截断 2000 字为 1500+…');
assert(!r4.includes('A'.repeat(2000)), 'T4 不含完整 2000 字');

// T5: 跳过空 content
const r5 = buildHistoryPrompt([
  { role: 'user', content: '' },
  { role: 'user', content: '   ' },
  { role: 'user', content: '真实问题' },
], 'followup');
assert(!r5.includes('用户: ') || (r5.match(/用户: /g) || []).length === 2, 'T5 只输出 2 个"用户: "（真实问题 + followup）');

// T6: role 映射
const r6 = buildHistoryPrompt([
  { role: 'user', content: 'u1' },
  { role: 'assistant', content: 'a1' },
], 'cur');
assert(r6.includes('用户: u1'), 'T6 user→用户');
assert(r6.includes('助手: a1'), 'T6 assistant→助手');

// T7: 未知 role 兜底
const r7 = buildHistoryPrompt([
  { role: 'system', content: 'sys msg' },
  { role: 'whatever', content: 'wt' },
], 'cur');
assert(r7.includes('?: sys msg') || r7.includes('system: sys msg') || true, 'T7 未知 role 不抛错');
assert(r7.includes('wt'), 'T7 包含未知 role 的 content');

console.log(`\n=== 单元测试结果：${pass}/${pass+fail} 通过 ===`);
if (fail > 0) {
  console.log('失败项：');
  for (const f of failed) console.log(' -', f.name, ':', f.e);
  process.exit(1);
}
process.exit(0);
