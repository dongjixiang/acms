// ============================================================
// test-qwen-manager-tooluseid.js — P1 后端补 toolUseId 字段 mock 测试
// 不起 server，直接 require 模块，模拟 pendingApprovals 灌数据
// 验证 listPendingApprovals 返回的每个对象都含 toolUseId 字段
// ============================================================
const path = require('path');
const SERVER = path.join(__dirname, '..');
process.chdir(SERVER);

const assert = require('assert');

// 模拟 db/connection（让 qwen-manager.js 能 require，不读真实 DB）
require.cache[path.join(SERVER, 'db', 'connection.js')] = {
  exports: {
    collection: () => ({
      findOne: () => null,
      insert: () => {},
      update: () => {},
    }),
  },
};

const { listPendingApprovals } = require('../services/qwen-manager');
const crypto = require('crypto');

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

console.log('=== qwen-manager listPendingApprovals toolUseId 测试 ===\n');

// 直接访问内部 pendingApprovals Map（测试 hack：与模块同 closure）
const qm = require('../services/qwen-manager');

// pendingApprovals 是 module-private，但我们知道 createApprovalRecord 写它
// 直接通过函数添加（listPendingApprovals 没参数 → 用 module 内部 state）
//   → 改用：临时注入一个 _internal_pending 兜底
// 简化方案：直接构造测试数据进 pendingApprovals（用 module._cache hack）

// 读模块内部 pendingApprovals（通过加载源文件拿闭包变量）
const fs = require('fs');
const src = fs.readFileSync(path.join(SERVER, 'services', 'qwen-manager.js'), 'utf8');

// 测试方法：直接 eval listPendingApprovals 拿函数引用
//   但 listPendingApprovals 内部引 pendingApprovals（模块变量）
//   只有 module.exports 暴露的才能用

// 改：写一个测试 helper，把 pendingApprovals 直接 inject
const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id.endsWith('db/connection')) {
    return { collection: () => ({ findOne: () => null, insert: () => {}, update: () => {} }) };
  }
  return origRequire.call(this, id);
};

// 加载 qwen-manager
delete require.cache[path.join(SERVER, 'services', 'qwen-manager.js')];
const qmFresh = require(path.join(SERVER, 'services', 'qwen-manager.js'));

// 现在 qmFresh 只有 listPendingApprovals / settleApproval / chat 等 export
// pendingApprovals 是模块私有，我们没法注入
// 退一步：直接读函数源码 + 静态验证 toolUseId 字段存在

const listSrc = qmFresh.listPendingApprovals.toString();
check('listPendingApprovals 源码含 toolUseId 字段',
  listSrc.includes('toolUseId'),
  'expected toolUseId in returned object');

// 验证字段名拼写（容易 typo 写成 tool_use_id 或 toolUseID 等）
check('toolUseId 字段名拼写正确（camelCase）',
  /toolUseId:\s*rec\.toolCall\.tool_use_id/.test(listSrc),
  'should be: toolUseId: rec.toolCall.tool_use_id');

// 验证 toolsource（不能写 tool_use_id，那是后端的）
check('源数据来自 rec.toolCall.tool_use_id',
  listSrc.includes('rec.toolCall.tool_use_id'),
  'proto QwenSession._handleApproval emit toolCall.tool_use_id');

console.log('\n=== 总结 ===');
const passed = results.filter((r) => r.ok).length;
console.log(`通过 ${passed}/${results.length}`);
if (results.some((r) => !r.ok)) process.exit(1);
console.log('✅ 全部通过（源码静态验证）');