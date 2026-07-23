const assert = require('assert');
const bugService = require('../server/services/bug-service');

const yes = {
  conversationHistory: [
    { role: 'assistant', content: { message: '信息已足够', analysis: { severity: 'major' }, choices: [{ id: 'Q13', question: '是否需要我直接以现有信息创建缺陷单（修复时再细化根因）？', options: ['是，帮我创建缺陷单', '再等一下', '否，我不想创建'] }] } },
    { role: 'user', content: '问题1: 是，帮我创建缺陷单' },
  ],
};

assert.strictEqual(
  typeof bugService.isExplicitCreateConfirmation,
  'function',
  'bug-service must expose deterministic create-confirmation detection'
);
assert.strictEqual(bugService.isExplicitCreateConfirmation(yes.conversationHistory), true);
assert.strictEqual(bugService.isExplicitCreateConfirmation([
  yes.conversationHistory[0],
  { role: 'user', content: '问题1: 再等一下，我先排查 Q10/Q11 再回来' },
]), false);
assert.strictEqual(bugService.isExplicitCreateConfirmation([
  yes.conversationHistory[0],
  { role: 'user', content: '问题1: 否，我不想创建' },
]), false);
assert.strictEqual(bugService.isExplicitCreateConfirmation([
  { role: 'user', content: '是' },
]), false, 'plain yes without a create-confirmation question must not create a bug');

console.log('PASS bug clarification confirmation protocol');
process.exit(0);
