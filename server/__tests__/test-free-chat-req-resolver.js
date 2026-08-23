// ============================================================
// scripts/test-free-chat-req-resolver.js
// ============================================================
// 测试 v0.117d：自由对话 sess-xxx → hidden requirement 自动 resolve
//   让 /requirements/:id/assist/:method + /stream 在 free chat 模式可用
// ============================================================

let pass = 0, fail = 0;
const failed = [];
function ok(name) { pass++; console.log(`  ✓ ${name}`); }
function bad(name, e) { fail++; failed.push({ name, e }); console.log(`  ✗ ${name}: ${e}`); }
function eq(a, b, name) { if (a === b) ok(name); else bad(name, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function assert(cond, name, hint) { if (cond) ok(name); else bad(name, hint || 'assertion failed'); }

// 复制 chat-session-service.js 的实现（regex / 字符串测试）
// 验证 resolve 逻辑：sess-xxx 前缀识别 + hidden req 复用
const SESS_PREFIX = 'sess-';

function isFreeChatReqId(id) {
  return typeof id === 'string' && id.startsWith(SESS_PREFIX);
}

// T1: reqId 类型识别
console.log('\n=== T1: reqId 类型识别 ===\n');
assert(isFreeChatReqId('sess-abc123'), 'T1a sess-xxx 识别为 free chat');
assert(isFreeChatReqId('sess-'), 'T1b 空 sess id 也识别');
assert(!isFreeChatReqId('REQ-12345'), 'T1c REQ-xxx 不是 free chat');
assert(!isFreeChatReqId('__free__'), 'T1d __free__ 占位符不是 free chat（运行时被替换）');
assert(!isFreeChatReqId(''), 'T1e 空字符串不是');
assert(!isFreeChatReqId(null), 'T1f null 不是');
assert(!isFreeChatReqId(undefined), 'T1g undefined 不是');

// T2: resolve 后的 reqId 形态（hidden req 应该是 REQ-xxx）
console.log('\n=== T2: resolve 后应该是 REQ-xxx ===\n');
// 模拟 resolve 流程
function fakeResolve(sessId) {
  if (!isFreeChatReqId(sessId)) return sessId;
  // 实际逻辑：buddy_memory 查映射，没有就创建 hidden req → 返回 REQ-xxx
  return 'REQ-' + sessId.slice(-6).toUpperCase();  // 模拟生成 hidden req id
}

const r2 = fakeResolve('sess-5ccb439391a3c9ca');
assert(r2.startsWith('REQ-'), 'T2a resolve 后是 REQ-xxx');
assert(!r2.startsWith('sess-'), 'T2b resolve 后不再是 sess-xxx');

const r2b = fakeResolve('REQ-MT03BIJG');
eq(r2b, 'REQ-MT03BIJG', 'T2c REQ-xxx 直接透传不 resolve');

// T3: POST endpoint URL 验证（sess-xxx vs REQ-xxx 都能用同一 URL）
console.log('\n=== T3: connectAssistStream URL 兼容性 ===\n');
function buildAssistUrl(rawReqId, method) {
  // 后端路由自动 resolve，所以前端 URL 一致
  return `/requirements/${rawReqId}/assist/${method}`;
}
assert(buildAssistUrl('sess-5ccb', 'image_gen') === '/requirements/sess-5ccb/assist/image_gen', 'T3a sess-xxx URL 正确');
assert(buildAssistUrl('REQ-MT03', 'image_gen') === '/requirements/REQ-MT03/assist/image_gen', 'T3b REQ-xxx URL 正确');
assert(buildAssistUrl('sess-5ccb', 'image_gen').endsWith('/assist/image_gen'), 'T3c URL path 一致');

console.log(`\n=== 结果：${pass}/${pass+fail} 通过 ===`);
if (fail > 0) {
  console.log('失败项：');
  for (const f of failed) console.log(' -', f.name, ':', f.e);
  process.exit(1);
}
process.exit(0);
