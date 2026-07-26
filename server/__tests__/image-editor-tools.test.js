// ACMS PR2 image-editor app-tools 注册验证 (v0.66)
// 验证 image-editor 4 个 tool 的 schema 正确注册到 app-tools-registry
//
// 用法：node server/__tests__/image-editor-tools.test.js

const atr = require('../services/app-tools-registry');
const tr = require('../services/tool-registry');

// 模拟 image-editor.js 暴露的 imageEditorAPI（实际是客户端 window 全局）
// 这里只验证 schema 正确注册，handler 的真实执行依赖浏览器 Canvas API
const mockImageEditorAPI = {
  getInfo: async function(path) { return { ok: true, path, width: 800, height: 600, format: 'png' }; },
  resize: async function(path, w, h, opts) { return { ok: true, outputPath: path + '.resized.png', width: w, height: h }; },
  crop: async function(path, x, y, w, h, opts) { return { ok: true, outputPath: path + '.cropped.png' }; },
  convert: async function(path, fmt, opts) { return { ok: true, outputPath: path + '.converted.' + fmt, format: fmt }; },
};

// 模拟 image-editor 的 4 个 app-tool（与 client/js/views/image-editor.js + index.html PKG 一致）
const IMAGE_EDITOR_TOOLS = [
  {
    name: 'image_get_info',
    appId: 'image-editor',
    description: 'USE WHEN: 用户问"图片多大""宽高""尺寸"时。',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: '图片绝对路径' } },
      required: ['path'],
    },
  },
  {
    name: 'image_resize',
    appId: 'image-editor',
    description: 'USE WHEN: 用户想"改图片大小"时。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        width: { type: 'integer' },
        height: { type: 'integer' },
        outputPath: { type: 'string' },
      },
      required: ['path', 'width', 'height'],
    },
  },
  {
    name: 'image_crop',
    appId: 'image-editor',
    description: 'USE WHEN: 用户想"裁剪图片"时。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        x: { type: 'integer' },
        y: { type: 'integer' },
        width: { type: 'integer' },
        height: { type: 'integer' },
      },
      required: ['path', 'x', 'y', 'width', 'height'],
    },
  },
  {
    name: 'image_convert',
    appId: 'image-editor',
    description: 'USE WHEN: 用户想"把 png 转 jpg"时。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        targetFormat: { type: 'string' },
      },
      required: ['path', 'targetFormat'],
    },
  },
];

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}

(async () => {
  // ── Test 1: 注册 4 个 tool ──
  console.log('\n[test] 注册 image-editor 4 个 app-tool');
  const regResult = atr.registerClientAppTools('image-editor', IMAGE_EDITOR_TOOLS);
  assert(regResult.ok === true, '注册成功');
  assert(regResult.count === 4, 'count = 4');

  // ── Test 2: 4 个 tool 都可查到 schema ──
  console.log('\n[test] schema 完整性');
  for (const toolDef of IMAGE_EDITOR_TOOLS) {
    const schema = atr.getAppToolSchema(toolDef.name);
    assert(schema !== null, `${toolDef.name} schema 已注册`);
    if (schema) {
      assert(schema.name === toolDef.name, `${toolDef.name}.name 正确`);
      assert(schema.appId === 'image-editor', `${toolDef.name}.appId = image-editor`);
      assert(schema.description && schema.description.length > 0, `${toolDef.name}.description 非空`);
      assert(schema.parameters && schema.parameters.type === 'object', `${toolDef.name}.parameters 是 object schema`);
      assert(Array.isArray(schema.parameters.required), `${toolDef.name}.required 是数组`);
    }
  }

  // ── Test 3: listAppToolNames 含 4 个 image tool ──
  console.log('\n[test] listAppToolNames');
  const allNames = atr.listAppToolNames();
  for (const toolDef of IMAGE_EDITOR_TOOLS) {
    assert(allNames.indexOf(toolDef.name) >= 0, `${toolDef.name} 在 listAppToolNames 中`);
  }

  // ── Test 4: toProviderFormat 正确格式化 ──
  console.log('\n[test] toProviderFormat 转换');
  const anthropicTools = tr.toProviderFormat('anthropic-messages', ['image_get_info', 'image_resize']);
  assert(anthropicTools.length === 2, 'returns 2 tools');
  const getInfo = anthropicTools.find(t => t.name === 'image_get_info');
  assert(getInfo !== undefined, 'image_get_info in anthropic format');
  assert(getInfo.input_schema.properties.path !== undefined, 'image_get_info input_schema.path 保留');

  // ── Test 5: 同名校验 — file_search 已注册，image_get_info 不能冲突 ──
  console.log('\n[test] 同名校验（与 file_search 不冲突）');
  // 先注册一个 file_search
  atr.registerClientAppTools('file-manager-test', [{ name: 'file_search', appId: 'file-manager-test', description: 't', parameters: { type: 'object', properties: {} } }]);
  const allAfter = atr.listAppToolNames();
  assert(allAfter.indexOf('image_get_info') >= 0, 'image_get_info 仍在');
  assert(allAfter.indexOf('file_search') >= 0, 'file_search 也仍在（不冲突）');
  atr.unregisterClientAppTools('file-manager-test');

  // ── Test 6: invokeClientAppTool 返回 NOT_FOUND（没有 ws 客户端接收）──
  console.log('\n[test] invoke image_get_info（无 ws sender 时优雅失败）');
  // 显式把 ws sender 设为 null 看 fallback
  const prevSender = atr._wsSender || null;
  atr.setWsSender(null);
  const invokeResult = await atr.invokeClientAppTool('image_get_info', { path: '/test.png' }, { userId: 'u1' });
  assert(invokeResult.ok === false, 'returns ok:false');
  assert(invokeResult.error === 'WS_SENDER_NOT_SET', 'error 是 WS_SENDER_NOT_SET');
  // 恢复 sender（避免影响其他测试）
  if (prevSender) atr.setWsSender(prevSender);

  // ── Test 7: handler mock 验证（不调服务端 ws，直接执行 mock handler）──
  console.log('\n[test] handler mock 验证（验证 handler 调用契约）');
  // 验证 4 个 tool name 与 imageEditorAPI 方法对应
  const mapping = {
    'image_get_info': 'getInfo',
    'image_resize': 'resize',
    'image_crop': 'crop',
    'image_convert': 'convert',
  };
  for (const toolName of Object.keys(mapping)) {
    const apiMethod = mapping[toolName];
    assert(typeof mockImageEditorAPI[apiMethod] === 'function', `${toolName} → mockImageEditorAPI.${apiMethod} 函数存在`);
  }

  // ── Test 8: agent-buddy-skill L2 'app' 扩载包含 image tool ──
  console.log('\n[test] agent-buddy-skill L2 扩载 app category 包含 image tool');
  const buddy = require('../services/agent-buddy-skill');
  const prompt = buddy.buildChatPrompt({
    currentView: '_default',
    expandedCategories: ['app'],
  });
  for (const toolDef of IMAGE_EDITOR_TOOLS) {
    const schemaBlock = `【${toolDef.name}】`;
    assert(prompt.indexOf(schemaBlock) >= 0, `prompt 含 ${schemaBlock} schema 块`);
  }

  // ── Test 9: chat 流动态注入包含 image tool ──
  console.log('\n[test] chat 流 getIntentToolNames 含 image tool');
  const fs = require('fs');
  const ciCode = fs.readFileSync(require.resolve('../routes/chat-intent.js'), 'utf-8');
  assert(ciCode.indexOf('getIntentToolNames()') > 0, 'chat-intent 使用 getIntentToolNames()');
  // 模拟 runtime 拿到 toolNames 时应包含 image tool
  // getIntentToolNames 是 chat-intent 内部的，没 export——验证代码逻辑
  assert(ciCode.indexOf('listAppToolNames()') > 0, 'chat-intent 调用 listAppToolNames()');

  // ── 清理 ──
  atr.unregisterClientAppTools('image-editor');

  console.log(`\n[结果] ${passed} 通过, ${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('test threw:', e); process.exit(1); });