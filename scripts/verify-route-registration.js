#!/usr/bin/env node
// verify-route-registration.js — v0.13 (6/21)
// 扫 server/app.js 的 app.use mount，对比 server/routes/ 实际文件
//
// 检查项：
//   1. MISSING_FILE — app.js mount 引用了不存在的 routes/X.js
//   2. ORPHAN_FILE  — routes/X.js 存在但没在 app.js 被 mount
//   3. DUP_MOUNT    — 同一 mount path 出现多次
//   4. VAR_MOUNT    — 变量 mount（手动 grep 确认，不算错但提示）
//
// 退出码：0 = 干净，1 = 有错误
// 用法：node scripts/verify-route-registration.js
// 接入：npm test 调这个

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP_JS = path.join(ROOT, 'server', 'app.js');
const ROUTES_DIR = path.join(ROOT, 'server', 'routes');

if (!fs.existsSync(APP_JS)) {
  console.error(`❌ app.js 不存在: ${APP_JS}`);
  process.exit(2);
}
if (!fs.existsSync(ROUTES_DIR)) {
  console.error(`❌ routes/ 不存在: ${ROUTES_DIR}`);
  process.exit(2);
}

const content = fs.readFileSync(APP_JS, 'utf-8');

// 1. 提取 app.use('/api/xxx', require('./routes/yyy')) — string + require
const requireMounts = [...content.matchAll(
  /app\.use\(\s*['"]([^'"]+)['"]\s*,\s*require\(\s*['"]([^'"]+)['"]\s*\)/g
)].map(m => ({
  mount: m[1],
  req: m[2],
  line: content.substring(0, m.index).split('\n').length,
}));

// 2. 提取 app.use('/api/xxx', varName) — 变量 mount
//    排除可能误匹配的：app.use('/client', express.static(...)) 里的 express 等
const varMounts = [...content.matchAll(
  /app\.use\(\s*['"]([^'"]+)['"]\s*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\)|,)/g
)].filter(m => {
  // 排除 var 是 app 内部方法或常见 builtin
  if (['express', 'app'].includes(m[2])) return false;
  // 排除 require 形式的（已在 requireMounts 里）
  return true;
}).map(m => ({
  mount: m[1],
  varName: m[2],
  line: content.substring(0, m.index).split('\n').length,
}));

// 3. routes/ 实际文件
const routeFiles = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.js'));
const routeFileSet = new Set(routeFiles);

// 4. 报告
const errors = [];
const warnings = [];

// 4a. MISSING_FILE
for (const m of requireMounts) {
  if (m.req.startsWith('./routes/')) {
    const basename = path.basename(m.req);
    const fileName = basename.endsWith('.js') ? basename : basename + '.js';
    if (!routeFileSet.has(fileName)) {
      errors.push(`MISSING_FILE  ${m.mount} → ${m.req}  (app.js:${m.line})`);
    }
  }
}

// 4b. ORPHAN_FILE — 收集所有被 require mount 的文件，差集 = 孤儿
const mountedFileNames = new Set();
for (const m of requireMounts) {
  if (m.req.startsWith('./routes/')) {
    const basename = path.basename(m.req);
    mountedFileNames.add(basename.endsWith('.js') ? basename : basename + '.js');
  }
}
for (const f of routeFiles) {
  if (!mountedFileNames.has(f)) {
    warnings.push(`ORPHAN_FILE   server/routes/${f}  (created but never mounted)`);
  }
}

// 4c. DUP_MOUNT
const seenMounts = new Map();
for (const m of requireMounts) {
  if (seenMounts.has(m.mount)) {
    errors.push(`DUP_MOUNT     ${m.mount}  (app.js:${seenMounts.get(m.mount)} and app.js:${m.line})`);
  } else {
    seenMounts.set(m.mount, m.line);
  }
}

// 4d. VAR_MOUNT — 提示但不算错
for (const m of varMounts) {
  warnings.push(`VAR_MOUNT     ${m.mount} → ${m.varName}  (app.js:${m.line})  [manual check required]`);
}

// 5. 输出
console.log(`📋 ACMS Route Registration Check`);
console.log(`   app.js:         ${APP_JS}`);
console.log(`   routes/:        ${ROUTES_DIR}`);
console.log(`   require mounts: ${requireMounts.length}`);
console.log(`   var mounts:     ${varMounts.length}`);
console.log(`   route files:    ${routeFiles.length}\n`);

if (warnings.length > 0) {
  console.log(`⚠️  WARNINGS (${warnings.length}):`);
  for (const w of warnings) console.log(`   ${w}`);
  console.log('');
}

if (errors.length > 0) {
  console.log(`❌ ERRORS (${errors.length}):`);
  for (const e of errors) console.log(`   ${e}`);
  console.log('');
  console.log(`💡 修法：app.js 加 app.use(missing path, require('./routes/xxx')) 或 删除孤儿文件`);
  process.exit(1);
}

console.log(`✅ All ${requireMounts.length} mounts reference existing files.`);
process.exit(0);
