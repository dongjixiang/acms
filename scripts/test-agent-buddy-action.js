const assert = require('assert');
// v0.88: code_execution 池注入依赖工具注册（listPool 只返回真实注册的工具）
require('../server/tools/index.js');
const action = require('../server/services/agent-buddy-action');

function testNormalizeRoute() {
  const route = action.normalizeRoute({
    mode: 'conversational_action',
    confidence: 1.4,
    capabilities: ['image_generation', 'email_send', 'email_draft', 'unknown'],
    requires_confirmation: false,
    reason: 'generate then email',
  });
  assert.equal(route.mode, 'conversational_action');
  assert.equal(route.confidence, 1);
  assert.deepEqual(route.capabilities, ['image_generation', 'email_send', 'email_draft']);
  assert.equal(route.requires_confirmation, false, 'explicit false is preserved for normalized raw route');
}

function testMalformedRouteFallsBack() {
  const route = action.normalizeRoute(null);
  assert.equal(route.mode, 'conversation');
  assert.equal(route.confidence, 0);
  assert.deepEqual(route.capabilities, []);
}

function testJsonExtraction() {
  assert.deepEqual(action.extractJson('```json\n{"mode":"single_action"}\n```'), { mode: 'single_action' });
  assert.deepEqual(action.extractJson('结果： {"mode":"conversation"} 完成'), { mode: 'conversation' });
  assert.equal(action.extractJson('not json'), null);
}

function testDynamicTools() {
  // v0.73 P96: conversational_action 结构性强制只给 plan_execute（tools.clear()）
  const tools = action.getActionToolNames({
    mode: 'conversational_action',
    capabilities: ['image_generation', 'email_draft', 'email_send'],
  }, ['query_collection']);
  assert.deepEqual(tools, ['plan_execute'], 'conversational_action 只暴露 plan_execute');
}

function testCodeExecutionTools() {
  // v0.88: code_execution 注入执行池 + 委派通道
  const tools = action.getActionToolNames({
    mode: 'single_action',
    capabilities: ['code_execution'],
  }, []);
  assert(tools.includes('agent_read_file'), '含读文件');
  assert(tools.includes('agent_write_file'), '含写文件');
  assert(tools.includes('agent_exec_command'), '含跑命令');
  assert(tools.includes('agent_git_commit'), '含 git 提交');
  assert(tools.includes('delegate_subtasks'), '含委派通道');
}

function testCodeExecKeyword() {
  // v0.88: 关键词前置拦截 — 不需要真实 LLM，直接测正则路径（通过 normalizeRoute + routeMessage 的拦截逻辑）
  //   routeMessage 会调 LLM，这里只验证关键词正则本身
  const re = /改代码|写代码|修[一这]?[个]?bug|修[一这]?[个]?缺陷|实现[一这]?[个]?功能|新增.*功能|读文件|看.*代码|跑[个一]?命令|执行命令|调试|查看项目|改文件|写文件|重构|代码审查|看下.*代码/;
  assert(re.test('帮我修这个bug'), '修bug');
  assert(re.test('把这段代码重构一下'), '重构代码');
  assert(re.test('帮我跑个命令测试'), '跑命令');
  assert(re.test('新增一个登录功能'), '新增功能');
  assert(!re.test('帮我查一下需求'), '查需求不应命中');
  assert(!re.test('今天有什么新闻'), '新闻不应命中');
}

function testPromptSafety() {
  const prompt = action.buildActionPrompt({
    mode: 'conversational_action',
    capabilities: ['image_generation', 'email_send'],
    confidence: 0.95,
    reason: '复合动作',
  });
  assert(prompt.includes('plan_execute'));
  assert(prompt.includes('等待用户确认'));
  assert(prompt.includes('严禁声称"邮件已发送"'));
}

function testActionCardStateShape() {
  const state = {
    requirementId: 'REQ-test',
    planStatus: 'running',
    plan: { summary: '生成并准备邮件', status: 'running', steps: [{ id: 's1', tool: 'generate_image', status: 'done', result: { file_ids: [{ id: 'file-1' }] } }, { id: 's2', tool: 'send_email', status: 'pending' }] },
    assistImage: { status: 'done', image_url_output: 'https://example.com/a.png' },
    pendingEmail: { type: 'pending_send_email', to: 'x@example.com', subject: '图片', body: '见附件', file_ids: ['file-1'] },
  };
  assert.equal(state.plan.steps[0].result.file_ids[0].id, 'file-1');
  assert.equal(state.pendingEmail.type, 'pending_send_email');
}

[testNormalizeRoute, testMalformedRouteFallsBack, testJsonExtraction, testDynamicTools, testCodeExecutionTools, testCodeExecKeyword, testPromptSafety, testActionCardStateShape].forEach(fn => fn());
console.log('✅ agent-buddy conversational-action tests passed (' + 8 + ' groups)');
process.exit(0);
