#!/usr/bin/env node
'use strict';

// ACMS 邮件 v2.3 — 数据隔离验证测试
// 用法：node scripts/test-email-isolation.js
// 流程：创建 2 个 profile + 账户 + 数据 → 验证隔离 → 清理
// 注意：需要 ACMS 服务在 3300 端口运行，且 API_KEY 默认 dev-key-001

const http = require('http');

const BASE = 'http://localhost:3300';
const KEY = process.env.API_KEY || 'dev-key-001';

function request(method, path, body) {
  return new Promise(function (resolve, reject) {
    var data = body ? JSON.stringify(body) : null;
    var url = new URL(BASE + path);
    var opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'x-api-key': KEY,
        'Content-Type': 'application/json',
        'Content-Length': data ? Buffer.byteLength(data) : 0,
      },
    };
    var req = http.request(opts, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var text = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode, body: JSON.parse(text) });
        } catch (e) {
          resolve({ status: res.statusCode, body: text });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const results = [];
function record(name, ok, detail) {
  results.push({ name: name, ok: ok, detail: detail });
  var icon = ok ? '✅' : '❌';
  console.log('  ' + icon + ' ' + name + (detail ? ' — ' + detail : ''));
}

async function main() {
  console.log('[v2.3] 数据隔离验证测试');
  console.log('[v2.3] BASE=' + BASE + ' KEY=' + KEY.slice(0, 8) + '...');

  // 1. 健康检查
  var health = await request('GET', '/health');
  record('ACMS 服务在线', health.status === 200, 'status=' + health.status);

  // 2. 准备：清理之前的测试 profile（如果存在）
  console.log('\n[v2.3] 步骤 1：清理历史测试 profile');
  var proResp = await request('GET', '/api/email-profiles');
  var existingProfiles = (proResp.body && proResp.body.profiles) || [];
  for (var p of existingProfiles) {
    if (p.name && (p.name.startsWith('TEST_A_') || p.name.startsWith('TEST_B_'))) {
      await request('DELETE', '/api/email-profiles/' + p.id);
      console.log('  清理旧 profile: ' + p.name);
    }
  }

  // 3. 创建 2 个测试 profile
  console.log('\n[v2.3] 步骤 2：创建 2 个测试 profile');
  var pAResp = await request('POST', '/api/email-profiles', {
    name: 'TEST_A_阿尔法',
    avatar: '🅰️',
    color: '#4ecdc4',
    type: 'personal',
    pin: '1111',
  });
  record('创建 profile A', pAResp.status === 200, 'id=' + (pAResp.body.profile && pAResp.body.profile.id));
  var profileAId = pAResp.body.profile && pAResp.body.profile.id;

  var pBResp = await request('POST', '/api/email-profiles', {
    name: 'TEST_B_贝塔',
    avatar: '🅱️',
    color: '#ff6b6b',
    type: 'work',
    pin: '2222',
  });
  record('创建 profile B', pBResp.status === 200, 'id=' + (pBResp.body.profile && pBResp.body.profile.id));
  var profileBId = pBResp.body.profile && pBResp.body.profile.id;

  if (!profileAId || !profileBId) {
    console.log('[v2.3] ❌ 无法创建测试 profile，中止');
    return;
  }

  // 4. 每个 profile 加一个测试账户
  console.log('\n[v2.3] 步骤 3：为每个 profile 创建账户');
  var accAResp = await request('POST', '/api/email-accounts', {
    profile_id: profileAId,
    name: 'TEST_A 邮箱',
    email: 'test_a@x.com',
    imap: { host: 'imap.x.com', port: 993, user: 'test_a@x.com', pass: 'dummy', tls: true },
    smtp: { host: 'smtp.x.com', port: 465, user: 'test_a@x.com', pass: 'dummy', secure: true },
  });
  record('创建账户 A', accAResp.status === 200, 'id=' + (accAResp.body.account && accAResp.body.account.id));
  var accountAId = accAResp.body.account && accAResp.body.account.id;

  var accBResp = await request('POST', '/api/email-accounts', {
    profile_id: profileBId,
    name: 'TEST_B 邮箱',
    email: 'test_b@x.com',
    imap: { host: 'imap.x.com', port: 993, user: 'test_b@x.com', pass: 'dummy', tls: true },
    smtp: { host: 'smtp.x.com', port: 465, user: 'test_b@x.com', pass: 'dummy', secure: true },
  });
  record('创建账户 B', accBResp.status === 200, 'id=' + (accBResp.body.account && accBResp.body.account.id));
  var accountBId = accBResp.body.account && accBResp.body.account.id;

  // 5. 为每个 profile 创建分类
  console.log('\n[v2.3] 步骤 4：每个 profile 创建独立分类');
  var catAResp = await request('POST', '/api/email-categories?profile_id=' + profileAId, {
    mailbox: 'INBOX', name: 'A_专属分类', color: '#4ecdc4', priority: 5,
  });
  var catAId = catAResp.body && catAResp.body.id;
  record('A 创建分类 A_专属', catAResp.status === 200, 'id=' + catAId);

  var catBResp = await request('POST', '/api/email-categories?profile_id=' + profileBId, {
    mailbox: 'INBOX', name: 'B_专属分类', color: '#ff6b6b', priority: 5,
  });
  var catBId = catBResp.body && catBResp.body.id;
  record('B 创建分类 B_专属', catBResp.status === 200, 'id=' + catBId);

  // 6. 验证隔离 — profile A 的 GET 应该只看 A 的数据
  console.log('\n[v2.3] 步骤 5：验证 GET 隔离');
  var catFromA = await request('GET', '/api/email-categories?profile_id=' + profileAId + '&mailbox=INBOX');
  var catsFromA = (catFromA.body && catFromA.body.categories) || [];
  var aSeesB = catsFromA.some(function (c) { return c.name === 'B_专属分类'; });
  record('profile A GET 分类 不包含 B_专属', !aSeesB, '共 ' + catsFromA.length + ' 条');

  var catFromB = await request('GET', '/api/email-categories?profile_id=' + profileBId + '&mailbox=INBOX');
  var catsFromB = (catFromB.body && catFromB.body.categories) || [];
  var bSeesA = catsFromB.some(function (c) { return c.name === 'A_专属分类'; });
  record('profile B GET 分类 不包含 A_专属', !bSeesA, '共 ' + catsFromB.length + ' 条');

  // 7. 不带 profile_id 调 — 应该全返（兼容旧调用）or 隔离（看实现）
  console.log('\n[v2.3] 步骤 6：不带 profile_id 的 GET（兼容性测试）');
  var catNoFilter = await request('GET', '/api/email-categories?mailbox=INBOX');
  var catsNoFilter = (catNoFilter.body && catNoFilter.body.categories) || [];
  var noFilterCount = catsNoFilter.length;
  record('不带 profile_id GET 分类 返回数', noFilterCount >= 2, '共 ' + noFilterCount + ' 条（应至少包含 A+B）');

  // 8. 模板隔离
  console.log('\n[v2.3] 步骤 7：模板隔离');
  var tplAResp = await request('POST', '/api/email-templates?profile_id=' + profileAId, {
    mailbox: 'INBOX', name: 'A_专属模板', content: 'A 模板内容', description: 'A 专属',
  });
  record('A 创建模板', tplAResp.status === 200);

  var tplBResp = await request('POST', '/api/email-templates?profile_id=' + profileBId, {
    mailbox: 'INBOX', name: 'B_专属模板', content: 'B 模板内容', description: 'B 专属',
  });
  record('B 创建模板', tplBResp.status === 200);

  var tplFromA = await request('GET', '/api/email-templates?profile_id=' + profileAId + '&mailbox=INBOX');
  var tplsFromA = (tplFromA.body && tplFromA.body.templates) || [];
  var tplsANames = tplsFromA.map(function (t) { return t.name; });
  var tAHasB = tplsANames.indexOf('B_专属模板') >= 0;
  record('profile A 看不到 B_专属模板', !tAHasB, 'A 看到: ' + JSON.stringify(tplsANames));

  // 9. 草稿隔离
  console.log('\n[v2.3] 步骤 8：草稿隔离');
  var draftAResp = await request('POST', '/api/email-drafts?profile_id=' + profileAId, {
    mailbox: 'drafts', to: 'a@x.com', subject: 'A 草稿', body: 'A 内容', is_html: false,
  });
  record('A 创建草稿', draftAResp.status === 200);

  var draftFromA = await request('GET', '/api/email-drafts?profile_id=' + profileAId + '&mailbox=drafts');
  var draftsFromA = (draftFromA.body && draftFromA.body.drafts) || [];
  record('profile A GET 草稿', draftsFromA.length >= 1, '共 ' + draftsFromA.length + ' 条');

  // 10. 规则隔离
  console.log('\n[v2.3] 步骤 9：规则隔离');
  var ruleAResp = await request('POST', '/api/email-rules?profile_id=' + profileAId, {
    description: 'A 专属规则',
    mailbox: 'INBOX',
    parsed: {
      conditions: { categories: ['客户咨询'] },
      actions: [{ type: 'archive' }],
    },
  });
  record('A 创建规则', ruleAResp.status === 200);

  var ruleFromA = await request('GET', '/api/email-rules?profile_id=' + profileAId + '&mailbox=INBOX');
  var rulesFromA = (ruleFromA.body && ruleFromA.body.rules) || [];
  record('profile A GET 规则', rulesFromA.length >= 1, '共 ' + rulesFromA.length + ' 条');

  // 11. 清理
  console.log('\n[v2.3] 步骤 10：清理测试数据');
  await request('DELETE', '/api/email-profiles/' + profileAId);
  await request('DELETE', '/api/email-profiles/' + profileBId);
  console.log('  ✅ 测试 profile 已删除');

  // 总结
  console.log('\n[v2.3] 测试总结');
  var passed = results.filter(function (r) { return r.ok; }).length;
  var failed = results.filter(function (r) { return !r.ok; }).length;
  console.log('  ' + passed + ' 通过 / ' + (passed + failed) + ' 总数');
  if (failed > 0) {
    console.log('  ❌ 失败的项：');
    results.filter(function (r) { return !r.ok; }).forEach(function (r) {
      console.log('    - ' + r.name + (r.detail ? ' — ' + r.detail : ''));
    });
    process.exit(1);
  } else {
    console.log('  ✅ 全部通过');
  }
}

main().catch(function (err) {
  console.error('[v2.3] 测试运行错误：', err.message);
  console.error(err.stack);
  process.exit(2);
});
