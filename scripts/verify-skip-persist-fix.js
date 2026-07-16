#!/usr/bin/env node
/**
 * v0.47.4 修复验证脚本
 *   用法：node scripts/verify-skip-persist-fix.js
 *   前提：ACMS 服务已用新代码 restart
 *
 * 验证 3 件事：
 *   1. 修复前状态：REQ-MQ25B6PR 的 send_email.used 是否 false
 *   2. 调 use 端点（action=skipped）→ 后端应写 used=true
 *   3. 修复后状态：再拉一次，used 应是 true
 */
const http = require('http');
const API_KEY = 'dev-key-001';
const REQ_ID = 'REQ-MQ25B6PR';  // 上次会话 send_email 测试的 REQ
const HOST = '127.0.0.1';
const PORT = 3300;

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      host: HOST, port: PORT, path: '/api' + path, method,
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, data: buf }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function getUsedStatus() {
  const r = await api('GET', `/requirements/${REQ_ID}/assist`);
  const se = r.data?.assists?.send_email;
  return se ? { status: se.status, used: !!se.used, hasMd: !!se.docx_url || !!se.md_url } : null;
}

async function main() {
  console.log('=== v0.47.4 跳过持久化修复验证 ===\n');

  // 1. 修复前
  const before = await getUsedStatus();
  console.log('1. 修复前状态:');
  console.log(`   ${JSON.stringify(before)}\n`);

  // 2. 调 use 端点
  console.log('2. 调 POST /assist/send_email/use {action:"skipped"}');
  const r = await api('POST', `/requirements/${REQ_ID}/assist/send_email/use`, { action: 'skipped' });
  console.log(`   HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}\n`);

  // 3. 修复后
  const after = await getUsedStatus();
  console.log('3. 修复后状态:');
  console.log(`   ${JSON.stringify(after)}\n`);

  // 结论
  if (before && after && before.used === false && after.used === true) {
    console.log('✅ 修复生效：used 从 false → true');
    console.log('   浏览器重新进入 REQ，卡片不会再出现');
  } else if (before && after && before.used === false && after.used === false) {
    console.log('❌ 修复未生效：used 仍是 false');
    console.log('   可能原因：');
    console.log('   - 服务还没用新代码 restart（检查 git log 服务端的版本）');
    console.log('   - REQ 数据里的 assist_send_email 是空字符串（看 console.log 的 hasMd 字段）');
  } else {
    console.log(`⚠️  状态不符合预期：before=${before?.used} after=${after?.used}`);
    console.log('   多多检查下数据库这条 REQ 的 assist_send_email 字段实际值');
  }
}

main().catch(e => { console.error('脚本异常:', e.message); process.exit(1); });