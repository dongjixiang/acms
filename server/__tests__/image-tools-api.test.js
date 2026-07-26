// ACMS Image Tools API 回归测试 (v0.66 PR1)
// 验证 image-tools-service.coreGenerate + /api/image-tools 路由
//
// 用法：node server/__tests__/image-tools-api.test.js

const path = require('path');
const http = require('http');

// mock http1-fetch 模块（在 require service 之前）
const mockHttp1Fetch = function mockHttp1Fetch(url, opts) {
  if (!global.__mockHttp1Queue) global.__mockHttp1Queue = [];
  var item = global.__mockHttp1Queue.shift() || { ok: false, error: 'no mock queued' };
  // callAgnesImageOnce 读 resp.json.data[0].url — 需要这个嵌套结构
  if (item.url && !item.json) {
    return Promise.resolve({
      ok: item.ok !== false,
      status: item.status || (item.ok === false ? 500 : 200),
      json: { data: [{ url: item.url }] },
    });
  }
  return Promise.resolve({
    ok: item.ok !== false,
    status: item.status || (item.ok === false ? 500 : 200),
    json: item.json || null,
  });
};

const Module = require('module');
const origResolve = Module._resolveFilename;
// 替换 require('tools/http1-fetch') → mock
require.cache[require.resolve('../tools/http1-fetch')] = {
  id: 'mock-http1-fetch',
  filename: 'mock',
  loaded: true,
  exports: { http1Fetch: mockHttp1Fetch },
};

// mock fetch (Node 18+ global) for download
const realFetch = global.fetch;
global.fetch = function mockFetch(url) {
  if (!global.__mockFetchQueue) global.__mockFetchQueue = [];
  var item = global.__mockFetchQueue.shift() || { ok: false, error: 'no mock fetch queued' };
  return Promise.resolve({
    ok: item.ok !== false,
    status: item.status || (item.ok === false ? 500 : 200),
    headers: { get: function (k) { return item.mime || 'image/png'; } },
    arrayBuffer: function () { return Promise.resolve(item.buffer || Buffer.alloc(0)); },
  });
};

// mock config.agnesApiKey / WORKSPACE_ROOT
const cfg = require('../config');
cfg.agnesApiKey = 'TEST_AGNES_KEY_FOR_UNIT';
const testWorkspace = path.join(__dirname, '__tmp_image_tools_test__');
cfg.workspaceRoot = testWorkspace;

// mock fs.writeFileSync 让保存不进真实磁盘（用 Buffer 模拟）
const realFs = require('fs');
const realWriteFileSync = realFs.writeFileSync;
realFs.writeFileSync = function (p, buf) {
  // 不真写，记录路径即可
  global.__lastWritePath = p;
  global.__lastWriteSize = (buf && buf.length) || 0;
};

const svc = require('../services/image-tools-service');
const route = require('../routes/image-tools');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}

// ── Test 1: 缺 prompt ──
console.log('\n[test] NO_PROMPT 错误');
(async () => {
  var r = await svc.coreGenerate({ prompt: '' });
  assert(r.ok === false, 'returns ok:false');
  assert(r.error === 'NO_PROMPT', 'error = NO_PROMPT');

  r = await svc.coreGenerate({ prompt: '   ' });
  assert(r.ok === false && r.error === 'NO_PROMPT', 'whitespace-only 也 NO_PROMPT');

  r = await svc.coreGenerate({});
  assert(r.ok === false && r.error === 'NO_PROMPT', 'undefined prompt 也 NO_PROMPT');

  // ── Test 2: helper 函数 ──
  console.log('\n[test] 内部 helper');
  assert(svc._inferExtFromMime('image/png') === '.png', 'png → .png');
  assert(svc._inferExtFromMime('image/jpeg') === '.jpg', 'jpeg → .jpg');
  assert(svc._inferExtFromMime('image/webp') === '.webp', 'webp → .webp');
  assert(svc._inferExtFromMime('') === '.png', 'empty mime → .png fallback');
  assert(svc._safeFileNamePart('hello world!') === 'hello_world!', 'safe filename');
  assert(svc._safeFileNamePart('a/b\\c:d*e?f"g<h>i|j') === 'a_b_c_d_e_f_g_h_i_j', 'special chars stripped');

  // ── Test 3: AGNES_API_KEY_NOT_CONFIGURED ──
  console.log('\n[test] API key 未配置');
  var savedKey = cfg.agnesApiKey;
  cfg.agnesApiKey = '';
  cfg.agnesApiKey = ''; // 双重保险
  var r2 = await svc.coreGenerate({ prompt: 'cat' });
  assert(r2.ok === false && r2.error === 'AGNES_API_KEY_NOT_CONFIGURED', 'no key → AGNES_API_KEY_NOT_CONFIGURED');
  cfg.agnesApiKey = savedKey;

  // ── Test 4: n 参数边界 ──
  console.log('\n[test] n 参数 clamp 到 [1, 6]');
  global.__mockHttp1Queue = []; // 清队列避免上一次残留
  // mock 4 次成功 + 0 次失败（验证 n=4 时调 4 次）
  for (var i = 0; i < 4; i++) global.__mockHttp1Queue.push({ ok: true, url: 'http://x/' + i });
  global.__mockFetchQueue = [];
  for (var i = 0; i < 4; i++) global.__mockFetchQueue.push({ ok: true, buffer: Buffer.from([0x89, 0x50, 0x4E, 0x47]), mime: 'image/png' });
  var r3 = await svc.coreGenerate({ prompt: 'cat', n: 4 });
  assert(r3.ok === true, 'n=4 succeeds');
  assert(r3.options.length === 4, 'options.length = 4');
  // v0.66: coreGenerate 默认 projectSlug = 'image-tools'（独立调用时）
  assert(r3.options[0].asset_path && r3.options[0].asset_path.indexOf('image-tools/') >= 0, 'asset_path 在默认 image-tools/ 下');
  assert(r3.options[0].image_url_output && r3.options[0].image_url_output.indexOf('http://x/') >= 0, 'image_url_output 是原 URL');

  // ── Test 5: referenceImage 走图生图 ──
  console.log('\n[test] 图生图（referenceImage 走图生图路径）');
  global.__mockHttp1Queue = [];
  for (var i = 0; i < 2; i++) global.__mockHttp1Queue.push({ ok: true, url: 'http://x/img' + i });
  global.__mockFetchQueue = [];
  for (var i = 0; i < 2; i++) global.__mockFetchQueue.push({ ok: true, buffer: Buffer.from([0xFF, 0xD8, 0xFF]), mime: 'image/jpeg' });
  var dataUri = 'data:image/png;base64,iVBORw0KGgoAAAA==';
  var r4 = await svc.coreGenerate({ prompt: '改成夜景', referenceImage: dataUri, n: 2 });
  assert(r4.ok === true, 'referenceImage succeeds');
  assert(r4.options.length === 2, '2 options');
  assert(r4.options[0].mime === 'image/jpeg', 'mime = image/jpeg (从 mock 推断)');

  // ── Test 6: 所有 API 调用失败 ──
  console.log('\n[test] all_n_calls_failed');
  global.__mockHttp1Queue = [];
  for (var i = 0; i < 3; i++) global.__mockHttp1Queue.push({ ok: false, error: 'HTTP_500' });
  var r5 = await svc.coreGenerate({ prompt: 'cat', n: 3 });
  assert(r5.ok === false, 'returns ok:false');
  assert(r5.error.indexOf('all_n_calls_failed') === 0, 'error starts with all_n_calls_failed');

  // ── Test 7: 部分成功（2/3 调用成功）──
  console.log('\n[test] 部分成功（N 候选里有失败的也返回）');
  global.__mockHttp1Queue = [];
  global.__mockHttp1Queue.push({ ok: true, url: 'http://x/0' });
  global.__mockHttp1Queue.push({ ok: false, error: 'HTTP_500' });
  global.__mockHttp1Queue.push({ ok: true, url: 'http://x/2' });
  global.__mockFetchQueue = [];
  global.__mockFetchQueue.push({ ok: true, buffer: Buffer.from([1, 2, 3]), mime: 'image/png' });
  global.__mockFetchQueue.push({ ok: true, buffer: Buffer.from([4, 5, 6]), mime: 'image/png' });
  var r6 = await svc.coreGenerate({ prompt: 'cat', n: 3 });
  assert(r6.ok === true, '部分成功 → ok:true');
  assert(r6.options.length === 2, '只有成功的 2 张进 options');

  // ── Test 8: projectSlug 自定义 ──
  console.log('\n[test] projectSlug 自定义');
  global.__mockHttp1Queue = [];
  global.__mockHttp1Queue.push({ ok: true, url: 'http://x/custom' });
  global.__mockFetchQueue = [];
  global.__mockFetchQueue.push({ ok: true, buffer: Buffer.from([1]), mime: 'image/png' });
  var r7 = await svc.coreGenerate({ prompt: 'cat', n: 1, projectSlug: 'my-project' });
  assert(r7.ok === true, 'custom projectSlug ok');
  assert(r7.options[0].asset_path.indexOf('my-project/') === 0, 'asset_path 以 my-project/ 开头');

  // ── Test 9: 路由 4xx 错误（缺 prompt）──
  console.log('\n[test] 路由 — 缺 prompt');
  var server = await startServer(route);
  try {
    var r8 = await post(server, '/ai-generate', { n: 4 });
    assert(r8.status === 400, 'missing prompt → 400');
    assert(r8.body.error === 'NO_PROMPT', 'error = NO_PROMPT');

    var r9 = await post(server, '/ai-edit', { referenceImage: 'data:image/png;base64,xxx' });
    assert(r9.status === 400, '/ai-edit missing prompt → 400');

    var r10 = await post(server, '/ai-edit', { prompt: 'cat', referenceImage: 'not-a-data-uri' });
    assert(r10.status === 400, 'invalid referenceImage → 400');
    assert(r10.body.error === 'INVALID_REFERENCE_IMAGE', 'error = INVALID_REFERENCE_IMAGE');

    var r11 = await post(server, '/ai-generate', { prompt: 'cat', n: 'not-a-number' });
    // n 字符串不是数字 → NaN → clamp 到 1（不会 throw）
    assert(r11.status === 200, 'n=string 仍 200（被 clamp 到 1）');
  } finally {
    server.close();
  }

  // ── 清理 ──
  console.log('\n[test] 清理临时工作区');
  try {
    realFs.rmSync(testWorkspace, { recursive: true, force: true });
    console.log('  ✓ 临时 workspace 已删');
  } catch (e) {
    console.log('  ⚠ 清理失败:', e.message);
  }

  console.log(`\n[结果] ${passed} 通过, ${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('test threw:', e); process.exit(1); });

// ── helpers ──
function startServer(router) {
  return new Promise(function (resolve) {
    var app = require('express')();
    // 模拟 authMiddleware 注入 req.user
    app.use(function (req, res, next) {
      req.user = { id: 'test-user' };
      req.userId = 'test-user';
      next();
    });
    app.use('/api/image-tools', router);
    var server = app.listen(0, function () { resolve(server); });
  });
}

function post(server, path, body) {
  return new Promise(function (resolve, reject) {
    var port = server.address().port;
    var data = JSON.stringify(body || {});
    var req = http.request({
      hostname: '127.0.0.1', port: port,
      path: '/api/image-tools' + path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var raw = Buffer.concat(chunks).toString();
        var parsed; try { parsed = JSON.parse(raw); } catch (e) { parsed = raw; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}