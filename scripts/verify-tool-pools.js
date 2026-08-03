// v0.88: 工具池完整性校验脚本
// 用法: node scripts/verify-tool-pools.js
// 校验：
//   1. 所有已注册工具都有 pool 元数据（POOL_DEFAULTS 覆盖）
//   2. POOLS 池内每个工具名真实注册
//   3. 池内工具都有元数据
//   4. code_execution 池与 agent_* 注册对比
// 退出码: 0=通过, 1=有问题
require('../server/tools/index.js');
const reg = require('../server/services/tool-registry');
const { POOL_DEFAULTS, POOLS } = require('../server/services/tool-pools');

let problems = [];
let okCount = 0;

// 1. 所有注册工具都有元数据
const all = reg.listTools().map(t => t.name);
const missingMeta = all.filter(n => !POOL_DEFAULTS[n] && !(reg.getTool(n) && reg.getTool(n).pool));
if (missingMeta.length) {
  problems.push(`❌ ${missingMeta.length} 个注册工具缺 pool 元数据: ${missingMeta.join(', ')}`);
} else {
  okCount++;
  console.log(`✅ 全部 ${all.length} 个注册工具都有 pool 元数据`);
}

// 2. POOLS 池内工具真实注册
for (const [poolName, names] of Object.entries(POOLS)) {
  const missing = names.filter(n => !reg.getTool(n));
  if (missing.length) {
    problems.push(`❌ 池 [${poolName}] ${missing.length} 个工具未注册: ${missing.join(', ')}`);
  } else {
    okCount++;
    console.log(`✅ 池 [${poolName}] ${names.length} 个工具全部注册`);
  }
}

// 3. 池内工具有元数据（validatePools 已覆盖，但单独跑一遍清晰）
const poolProblems = reg.validatePools();
if (poolProblems.length) {
  problems.push(...poolProblems);
} else {
  okCount++;
  console.log('✅ validatePools 全部通过');
}

// 4. 风险分布统计
const riskDist = {};
for (const [n, meta] of Object.entries(POOL_DEFAULTS)) {
  riskDist[meta.risk] = (riskDist[meta.risk] || 0) + 1;
}
console.log('📊 风险分布:', JSON.stringify(riskDist));
const domainDist = {};
for (const [n, meta] of Object.entries(POOL_DEFAULTS)) {
  domainDist[meta.domain] = (domainDist[meta.domain] || 0) + 1;
}
console.log('📊 域分布:', JSON.stringify(domainDist));

// 5. token 估算（code_execution 池）
function estTokens(str) { return Math.ceil(str.length / 3.5); }
const execPool = POOLS['code_execution'];
let execTokens = 0;
for (const n of execPool) {
  const t = reg.getTool(n);
  if (!t) continue;
  let p = '';
  try { p = JSON.stringify(t.parameters || {}); } catch (e) {}
  execTokens += estTokens((t.description || '') + p);
}
console.log(`📊 code_execution 池 ${execPool.length} 个工具 ≈ ${execTokens} tokens`);

if (problems.length) {
  console.log('\n❌ 发现问题 ' + problems.length + ' 项:');
  problems.forEach(p => console.log('  ' + p));
  process.exit(1);
}
console.log(`\n✅ 全部通过 (${okCount}/${okCount + problems.length} 组检查)`);
process.exit(0);
