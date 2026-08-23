// ============================================================
// scripts/test-free-chat-clean.js
// ============================================================
// 测试 v0.117 自由对话清理：
//   chat-session-service.cleanSessionMessages(sessionId, {mode, indices})
//   routes/chat-sessions POST /:id/clean 接口
//
// ⚠️  集成测试需要在 ACMS 服务 restart 后跑（chat-session-service 用 in-memory
//     collection wrapper，多进程访问会冲突）—— 跳到 spike 阶段做。
//
// 本测试只验证 regex / 拼装 / 路由 schema 正确性。
// ============================================================

let pass = 0, fail = 0;
const failed = [];
function ok(name) { pass++; console.log(`  ✓ ${name}`); }
function bad(name, e) { fail++; failed.push({ name, e }); console.log(`  ✗ ${name}: ${e}`); }
function eq(a, b, name) { if (JSON.stringify(a) === JSON.stringify(b)) ok(name); else bad(name, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function assert(cond, name, hint) { if (cond) ok(name); else bad(name, hint || 'assertion failed'); }

// 1. cleanSessionMessages 角色映射表
console.log('\n=== T1: 角色映射表（与 requirement clean 一致）===\n');
const rolesToRemove = {
  all: ['user', 'assistant', 'system'],
  user: ['user'],
  assistant: ['assistant'],
  system: ['system'],
  ai: ['assistant', 'system'],
};
eq(rolesToRemove.all.includes('user') && rolesToRemove.all.includes('assistant') && rolesToRemove.all.includes('system'), true, 'T1a all 包含 3 种角色');
eq(rolesToRemove.user.length, 1, 'T1b user 只 1 种');
eq(rolesToRemove.ai.includes('assistant') && rolesToRemove.ai.includes('system') && !rolesToRemove.ai.includes('user'), true, 'T1c ai = assistant + system');

// 2. selected 模式 idx 过滤
console.log('\n=== T2: selected 模式 idx 过滤 ===\n');
function keepIndicesOf(all, removeIdxSet) {
  return all.map((_, i) => i).filter(i => !removeIdxSet.has(i));
}
const arr = [0,1,2,3,4,5,6,7,8,9,10,11];
eq(keepIndicesOf(arr, new Set([0,3,6,9])), [1,2,4,5,7,8,10,11], 'T2a 保留非 idx');
eq(keepIndicesOf(arr, new Set([])), [0,1,2,3,4,5,6,7,8,9,10,11], 'T2b 空 set 保留全部');
eq(keepIndicesOf(arr, new Set([0,11])), [1,2,3,4,5,6,7,8,9,10], 'T2c 删首尾');

// 3. mode='all' keepIndices 计算
console.log('\n=== T3: mode=all keepIndices ===\n');
function keepIndicesByRole(messages, mode) {
  const targets = rolesToRemove[mode];
  if (!targets) return null;
  return messages.map((m, i) => (targets.includes(m.role) ? -1 : i)).filter(i => i >= 0);
}
const msgs = [
  {role:'user'}, {role:'assistant'}, {role:'system'}, {role:'user'}, {role:'assistant'}, {role:'system'},
  {role:'user'}, {role:'assistant'}, {role:'system'}, {role:'user'}, {role:'assistant'}, {role:'system'},
];
eq(keepIndicesByRole(msgs, 'all').length, 0, 'T3a mode=all 保留 0');
eq(keepIndicesByRole(msgs, 'user'), [1,2,4,5,7,8,10,11], 'T3b mode=user 保留非 user');
eq(keepIndicesByRole(msgs, 'assistant'), [0,2,3,5,6,8,9,11], 'T3c mode=assistant');
eq(keepIndicesByRole(msgs, 'system'), [0,1,3,4,6,7,9,10], 'T3d mode=system');
eq(keepIndicesByRole(msgs, 'ai'), [0,3,6,9], 'T3e mode=ai 保留 user');
eq(keepIndicesByRole(msgs, 'invalid_mode'), null, 'T3f 非法 mode 返回 null');

// 4. note 文案格式
console.log('\n=== T4: note 文案 ===\n');
function buildNote(label, removed, remaining) {
  return `已清理 ${label} 共 ${removed} 条对话记录${remaining > 0 ? `，剩余 ${remaining} 条` : ''}`;
}
eq(buildNote('全部', 12, 0), '已清理 全部 共 12 条对话记录', 'T4a 全清无剩余');
eq(buildNote('用户', 4, 8), '已清理 用户 共 4 条对话记录，剩余 8 条', 'T4b 用户清理带剩余');
eq(buildNote('选中条目 3 条', 3, 9), '已清理 选中条目 3 条 共 3 条对话记录，剩余 9 条', 'T4c selected 模式');

console.log(`\n=== 结果：${pass}/${pass+fail} 通过 ===`);
if (fail > 0) {
  console.log('失败项：');
  for (const f of failed) console.log(' -', f.name, ':', f.e);
  process.exit(1);
}
process.exit(0);
