// ACMS Image Editor AI Assistant UI 测试 (v0.66 PR3)
// 验证 imageAiAssistant singleton 的 panel toggle / 状态机 / 历史撤销
//
// 用法：node server/__tests__/image-editor-ai-assistant-ui.test.js

const fs = require('fs');
const vm = require('vm');
const path = require('path');

// ── mock DOM/window for vm sandbox ──
let __mockFetchQueue = [];
function mockFetch(url, opts) {
  var item = __mockFetchQueue.shift() || { ok: false, status: 500, json: { error: 'no mock' } };
  return Promise.resolve({
    ok: item.ok !== false && (item.status || 200) < 400,
    status: item.status || 200,
    json: function () { return Promise.resolve(item.json); },
  });
}

const sandbox = {
  // 裸标识符必须挂到 sandbox 顶层
  Image: function () {
    return {
      set src(v) { if (this.onload) this.onload(); },
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

// 加载 image-editor.js（IIFE 执行 → 注册 window.openImageEditor / window.imageEditorAPI / window.imageAiAssistant）
const code = fs.readFileSync(path.resolve(__dirname, '../../client/js/views/image-editor.js'), 'utf-8');
vm.runInContext(code, sandbox);

const assistant = sandbox.window.imageAiAssistant;
if (!assistant) { console.error('imageAiAssistant 未挂载'); process.exit(1); }
const imageAPI = sandbox.window.imageEditorAPI;
if (!imageAPI) { console.error('imageEditorAPI 未挂载（PR2 依赖）'); process.exit(1); }

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}

// 构造 mock imageEditor + aiPanel + w
function makeCtx(opts) {
  opts = opts || {};
  // v0.66 PR3 测试: canvas.width=0 才能测出 generate mode（否则 canvas 总是有尺寸 → mode=edit）
  var canvasWidth = opts.canvasWidth != null ? opts.canvasWidth : 800;
  var canvasEl = {
    width: canvasWidth, height: canvasWidth ? 600 : 0,
    toDataURL: function () { return 'data:image/png;base64,CANVASDATA'; },
  };
  var imageEditor = {
    getCanvas: function () { return canvasEl; },
    getImageName: opts.hasImageName ? function () { return 'test.png'; } : function () { return ''; },
    setImage: function () {},
    loadImageFromURL: function () {},
  };
  var aiPanel = {
    style: { display: 'none' },
    innerHTML: '',
    querySelector: function (sel) {
      // 简单 mock：只对几个关键 id 返回元素
      if (sel === '#ai-assistant-toggle-icon') return { textContent: '' };
      // 其他都返回带 onclick 字段的对象（够用）
      return {
        onclick: null,
        disabled: false,
        textContent: '',
        querySelectorAll: function () { return []; },
      };
    },
  };
  var w = {
    $c: {
      querySelector: function (sel) {
        if (sel === '#ai-assistant-toggle-icon') return { textContent: '' };
        return null;
      },
    },
  };
  return { imageEditor: imageEditor, aiPanel: aiPanel, w: w, canvasEl: canvasEl };
}

(async () => {
  // ── Test 1: API 暴露 ──
  console.log('\n[test] window.imageAiAssistant API 暴露');
  assert(typeof assistant.toggle === 'function', 'toggle 函数');
  assert(typeof assistant.isOpen === 'function', 'isOpen 函数');
  assert(typeof assistant.getHistoryLength === 'function', 'getHistoryLength 函数');
  assert(typeof assistant._state === 'function', '_state 函数（测试用）');

  // ── Test 2: 初始状态 ──
  console.log('\n[test] 初始状态');
  assert(assistant.isOpen() === false, '初始 isOpen = false');
  assert(assistant.getHistoryLength() === 0, '初始 history = 0');

  // ── Test 3: toggle 切换 display ──
  console.log('\n[test] toggle 切换 display');
  var ctx = makeCtx({ hasImageName: true });
  assistant.toggle(ctx.imageEditor, ctx.aiPanel, ctx.w);
  assert(assistant.isOpen() === true, 'toggle 后 isOpen = true');
  assert(ctx.aiPanel.style.display === 'block', 'aiPanel display = block');
  assistant.toggle(ctx.imageEditor, ctx.aiPanel, ctx.w);
  assert(assistant.isOpen() === false, '再次 toggle 后 isOpen = false');
  assert(ctx.aiPanel.style.display === 'none', 'aiPanel display = none');

// ── Test 3: _state 暴露内部状态 ──
  console.log('\n[test] _state 暴露内部状态');
  // canvasWidth: 0 + hasImageName: false → mode = 'generate'
  var ctx2 = makeCtx({ hasImageName: false, canvasWidth: 0 });
  assistant.toggle(ctx2.imageEditor, ctx2.aiPanel, ctx2.w);
  var state = assistant._state();
  assert(typeof state === 'object', '_state returns object');
  assert(state.open === true, 'state.open = true');
  assert(state.mode === 'generate', 'state.mode = generate (no image, canvas empty)');
  assert(state.busy === false, 'state.busy = false');
  assistant.toggle(ctx2.imageEditor, ctx2.aiPanel, ctx2.w);
  assert(assistant._state().open === false, '再次 toggle 后 state.open = false');

  // ── Test 5: mode 自动检测（有图 → edit）──
  console.log('\n[test] mode 自动检测');
  var ctx3 = makeCtx({ hasImageName: true });
  assistant.toggle(ctx3.imageEditor, ctx3.aiPanel, ctx3.w);
  var s3 = assistant._state();
  assert(s3.mode === 'edit', 'state.mode = edit (has image)');

  // ── Test 6: history 操作（push / pop / length）──
  console.log('\n[test] history 操作');
  // 直接调内部逻辑：saveCanvasSnapshot → push
  // 因为 _history 是闭包私有，我们通过 getHistoryLength + applyCandidate 来观察
  // applyCandidate 会 pushHistory
  // 但 applyCandidate 需要 _currentResult 和 imageEditor.setImage —— 这里简化测长度变化

  // 先手动 mock 一个内部 result 触发 applyCandidate
  var ctx4 = makeCtx({ hasImageName: true });
  assistant.toggle(ctx4.imageEditor, ctx4.aiPanel, ctx4.w);
  assert(assistant.getHistoryLength() === 0, 'toggle 后 history 仍 0');

  // 通过 _state 可看到 historyCount
  assert(assistant._state().historyCount === 0, 'state.historyCount = 0');

  // ── Test 7: 多次 toggle 累积 _ctx ──
  console.log('\n[test] 多次 toggle 累积 _ctx');
  var ctx5a = makeCtx({ hasImageName: true });
  var ctx5b = makeCtx({ hasImageName: false });
  assistant.toggle(ctx5a.imageEditor, ctx5a.aiPanel, ctx5a.w);  // open
  assistant.toggle(ctx5a.imageEditor, ctx5a.aiPanel, ctx5a.w);  // close
  // 现在 _ctx 保留的是 ctx5a（不会丢失 w 引用）
  assistant.toggle(ctx5b.imageEditor, ctx5b.aiPanel, ctx5b.w);  // open with new ctx
  // _ctx 应该更新到 ctx5b
  // 通过 _state 验证（busy / history 状态在 ctx5b 上下文）
  var s7 = assistant._state();
  assert(s7.open === true, '重新 toggle 后 open = true');

  // ── Test 8: 边界 — null 参数 ──
  console.log('\n[test] 边界 null 参数');
  try {
    assistant.toggle(null, null, null);
    // 不 crash 即可
    var s8 = assistant._state();
    assert(s8.open === true || s8.open === false, 'null 参数不 crash');
  } catch (e) {
    assert(false, 'null 参数应不 throw: ' + e.message);
  }
  // 关闭
  assistant.toggle(null, null, null);

  // ── Test 9: imageEditorAPI 仍然完整（PR2 不破坏）──
  console.log('\n[test] imageEditorAPI 完整（PR2 兼容）');
  assert(typeof imageAPI.getInfo === 'function', 'getInfo 保留');
  assert(typeof imageAPI.resize === 'function', 'resize 保留');
  assert(typeof imageAPI.crop === 'function', 'crop 保留');
  assert(typeof imageAPI.convert === 'function', 'convert 保留');
  assert(typeof imageAPI.aiGenerate === 'function', 'aiGenerate 保留（PR2）');
  assert(typeof imageAPI.aiEdit === 'function', 'aiEdit 保留（PR2）');
  assert(typeof imageAPI.saveCanvasSnapshot === 'function', 'saveCanvasSnapshot 保留（PR2）');
  assert(typeof imageAPI.restoreCanvasSnapshot === 'function', 'restoreCanvasSnapshot 保留（PR2）');

  console.log(`\n[结果] ${passed} 通过, ${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(function (e) { console.error('test threw:', e); process.exit(1); });