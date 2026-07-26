// ACMS Image Editor AI API 测试 (v0.66 PR2)
// 验证 imageEditorAPI.aiGenerate / aiEdit / saveCanvasSnapshot / restoreCanvasSnapshot
// + agentTools schema 注册（image_ai_generate / image_ai_edit）
//
// 用法：node server/__tests__/image-editor-ai-api.test.js

const fs = require('fs');
const vm = require('vm');
const path = require('path');

// ── mock fetch（IIFE 内的 aiGenerate/aiEdit 用 fetch）──
let __mockFetchQueue = [];
function mockFetch(url, opts) {
  var item = __mockFetchQueue.shift() || { ok: false, status: 500, json: { error: 'no mock' } };
  return Promise.resolve({
    ok: item.ok !== false && (item.status || 200) < 400,
    status: item.status || 200,
    text: function () { return Promise.resolve(JSON.stringify(item.json)); },
    json: function () { return Promise.resolve(item.json); },
  });
}

// ── mock 浏览器全局（在 vm sandbox 内）──
const sandbox = {
  // 裸标识符（IIFE 内找不到会走全局）必须挂到 sandbox 顶层
  Image: function () {
    return {
      set src(v) {
        // 同步触发 onload（sandbox 没事件循环）
        if (this.onload) this.onload();
      },
      get src() { return ''; },
      onload: null, onerror: null,
      naturalWidth: 100, naturalHeight: 100,
    };
  },
  FileReader: function () { this.readAsDataURL = function () {}; this.onload = null; this.onerror = null; },
  Blob: function () {},
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  console: console,
  URL: URL,
  Promise: Promise,
  fetch: mockFetch,
  localStorage: {
    _store: {},
    getItem: function (k) { return this._store[k] || null; },
    setItem: function (k, v) { this._store[k] = v; },
  },
  document: {
    createElement: function (tag) {
      if (tag === 'canvas') {
        return {
          width: 0, height: 0,
          getContext: function () { return { drawImage: function () {}, clearRect: function () {}, fillRect: function () {}, fillStyle: '' }; },
          toDataURL: function () { return 'data:image/png;base64,TESTCANVASDATA'; },
        };
      }
      return { style: {}, appendChild: function () {}, click: function () {} };
    },
    head: { appendChild: function () {} },
    body: { appendChild: function () {} },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {},
    getElementById: function () { return null; },
  },
};

// window 单独挂（IIFE 内的 root = window）
sandbox.window = {
  AK: 'dev-key-001',
  document: sandbox.document,
  Image: sandbox.Image,
  FileReader: sandbox.FileReader,
  Blob: sandbox.Blob,
  localStorage: sandbox.localStorage,
  fetch: mockFetch,
};

vm.createContext(sandbox);
const code = fs.readFileSync(path.resolve(__dirname, '../../client/js/views/image-editor.js'), 'utf-8');
vm.runInContext(code, sandbox);

const api = sandbox.window.imageEditorAPI;
if (!api) { console.error('imageEditorAPI 未挂载'); process.exit(1); }

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}

(async () => {
  // ── Test 1: aiGenerate 基础 ──
  console.log('\n[test] aiGenerate 基础调用');
  __mockFetchQueue = [
    { ok: true, status: 200, json: { ok: true, options: [{ image_url_output: 'http://x/1.png' }, { image_url_output: 'http://x/2.png' }] } }
  ];
  var r1 = await api.aiGenerate('一只橘猫', 2);
  assert(r1.ok === true, 'returns ok:true');
  assert(r1.options.length === 2, 'options.length = 2');

  // ── Test 2: aiGenerate 缺 prompt ──
  console.log('\n[test] aiGenerate INVALID_ARGS');
  var r2 = await api.aiGenerate('', 4);
  assert(r2.ok === false && r2.error === 'INVALID_ARGS', '空 prompt → INVALID_ARGS');
  var r3 = await api.aiGenerate(null, 4);
  assert(r3.ok === false && r3.error === 'INVALID_ARGS', 'null prompt → INVALID_ARGS');

  // ── Test 3: aiEdit 基础 ──
  console.log('\n[test] aiEdit 基础调用');
  __mockFetchQueue = [
    { ok: true, status: 200, json: { ok: true, options: [{ image_url_output: 'http://x/edit1.png' }] } }
  ];
  var dataUrl = 'data:image/png;base64,XXX';
  var r4 = await api.aiEdit('改成夜景', dataUrl, 1);
  assert(r4.ok === true, 'returns ok:true');
  assert(r4.options.length === 1, 'options.length = 1');

  // ── Test 4: aiEdit 缺 referenceImage ──
  console.log('\n[test] aiEdit 缺 referenceImage');
  var r5 = await api.aiEdit('改成夜景', '', 4);
  assert(r5.ok === false && r5.error === 'INVALID_ARGS', '空 ref → INVALID_ARGS');
  var r6 = await api.aiEdit('改成夜景', null, 4);
  assert(r6.ok === false && r6.error === 'INVALID_ARGS', 'null ref → INVALID_ARGS');

  // ── Test 5: aiGenerate fetch 失败 ──
  console.log('\n[test] aiGenerate 网络/服务端错误');
  __mockFetchQueue = [
    { ok: false, status: 500, json: { message: 'server error' } }
  ];
  var r7 = await api.aiGenerate('cat', 1);
  assert(r7.ok === false, 'returns ok:false');
  assert(r7.error === 'AI_GENERATE_FAILED', 'error = AI_GENERATE_FAILED');

  // ── Test 6: n 参数 clamp ──
  console.log('\n[test] n 参数 clamp 到 [1,6]');
  __mockFetchQueue = new Array(10).fill(null).map(function () {
    return { ok: true, status: 200, json: { ok: true, options: [] } };
  });
  var r8 = await api.aiGenerate('cat', 100);  // clamp 到 6
  assert(r8.ok === true, 'n=100 clamp to 6 succeeded (不 throw)');
  var r9 = await api.aiGenerate('cat', 0);  // 0 falsy → || 4 → 4
  assert(r9.ok === true, 'n=0 fallback to default (4)');

  // ── Test 7: saveCanvasSnapshot TOAST UI 实例 ──
  console.log('\n[test] saveCanvasSnapshot 接受 TOAST UI ImageEditor 实例');
  var mockTuiInstance = {
    getCanvas: function () {
      return { toDataURL: function () { return 'data:image/png;base64,FROMTOASTUI'; } };
    }
  };
  var d7 = api.saveCanvasSnapshot(mockTuiInstance);
  assert(d7 === 'data:image/png;base64,FROMTOASTUI', 'snapshot from tui instance');

  // ── Test 8: saveCanvasSnapshot 接受原生 canvas ──
  console.log('\n[test] saveCanvasSnapshot 接受原生 canvas');
  var mockCanvas = { toDataURL: function () { return 'data:image/jpeg;base64,RAWCANVAS'; } };
  var d8 = api.saveCanvasSnapshot(mockCanvas);
  assert(d8 === 'data:image/jpeg;base64,RAWCANVAS', 'snapshot from raw canvas');

  // ── Test 9: saveCanvasSnapshot null 保护 ──
  console.log('\n[test] saveCanvasSnapshot null 保护');
  assert(api.saveCanvasSnapshot(null) === null, 'null → null');
  assert(api.saveCanvasSnapshot(undefined) === null, 'undefined → null');
  assert(api.saveCanvasSnapshot({}) === null, 'no getCanvas/toDataURL → null');

  // ── Test 10: restoreCanvasSnapshot 接受 TOAST UI 实例 ──
  console.log('\n[test] restoreCanvasSnapshot 接受 TOAST UI 实例');
  var drawImageCalled = 0;
  var mockTui2 = {
    getCanvas: function () {
      return {
        width: 100, height: 100,
        getContext: function () {
          return {
            clearRect: function () {},
            drawImage: function () { drawImageCalled++; },
          };
        }
      };
    }
  };
  var restored = await api.restoreCanvasSnapshot(mockTui2, 'data:image/png;base64,XXX');
  assert(restored === true, 'returns true');
  assert(drawImageCalled === 1, 'drawImage called once');

  // ── Test 11: restoreCanvasSnapshot null 保护 ──
  console.log('\n[test] restoreCanvasSnapshot null 保护');
  var r11 = await api.restoreCanvasSnapshot(null, 'data:image/png;base64,X');
  assert(r11 === false, 'null canvas → false');
  var r12 = await api.restoreCanvasSnapshot({}, null);
  assert(r12 === false, 'null dataUrl → false');

  // ── Test 12: agentTools schema 注册（小吉/chat 流能发现）──
  console.log('\n[test] agentTools schema 注册');
  var tools = [
    {
      name: 'image_ai_generate',
      appId: 'image-editor',
      description: 'USE WHEN: 文生图',
      parameters: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] },
    },
    {
      name: 'image_ai_edit',
      appId: 'image-editor',
      description: 'USE WHEN: 图生图',
      parameters: {
        type: 'object',
        properties: { prompt: { type: 'string' }, referenceImage: { type: 'string' } },
        required: ['prompt', 'referenceImage'],
      },
    },
  ];
  const atr = require('../services/app-tools-registry');
  atr.setWsSender(function () { return { ok: true }; });
  var regResult = atr.registerClientAppTools('image-editor', tools);
  assert(regResult.ok === true, '注册 image-editor AI tools');
  assert(atr.getAppToolSchema('image_ai_generate') !== null, 'image_ai_generate schema 已注册');
  assert(atr.getAppToolSchema('image_ai_edit') !== null, 'image_ai_edit schema 已注册');
  assert(atr.listAppToolNames().indexOf('image_ai_generate') >= 0, 'image_ai_generate 在 list');
  assert(atr.listAppToolNames().indexOf('image_ai_edit') >= 0, 'image_ai_edit 在 list');

  // ── Test 13: 端到端 LLM 视角（toProviderFormat）──
  console.log('\n[test] 端到端 LLM 视角');
  const tr = require('../services/tool-registry');
  var formatted = tr.toProviderFormat('anthropic-messages', ['image_ai_generate', 'image_ai_edit']);
  assert(formatted.length === 2, 'toProviderFormat 返回 2 个工具');
  assert(formatted[0].input_schema.properties.prompt !== undefined, 'input_schema.prompt 保留');

  // ── 清理 ──
  atr.unregisterClientAppTools('image-editor');

  console.log(`\n[结果] ${passed} 通过, ${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (e) { console.error('test threw:', e); process.exit(1); });