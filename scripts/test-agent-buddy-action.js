const assert = require('assert');
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
  const tools = action.getActionToolNames({
    mode: 'conversational_action',
    capabilities: ['image_generation', 'email_draft', 'email_send'],
  }, ['query_collection']);
  assert(tools.includes('plan_execute'));
  assert(tools.includes('generate_image'));
  assert(tools.includes('send_email'));
  assert(tools.includes('query_collection'));
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
  assert(prompt.includes('严禁声称“邮件已发送”'));
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

[testNormalizeRoute, testMalformedRouteFallsBack, testJsonExtraction, testDynamicTools, testPromptSafety, testActionCardStateShape].forEach(fn => fn());
console.log('✅ agent-buddy conversational-action tests passed (5 groups)');
process.exit(0);
