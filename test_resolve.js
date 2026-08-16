
require('./server/db/connection');
const registry = require('./server/agents/registry');
const agentStore = require('./server/stores/agent-store');

console.log('Handlers:', [...registry.handlers.keys()]);

// 手动注册一个 agent
registry.register({
  id: 'agent-word-expert',
  name: 'Word专家',
  domain: 'word',
  handler: async () => ({ ok: true, result: 'test' })
});

console.log('After register:', [...registry.handlers.keys()]);

const resolved = registry.resolve('word');
console.log('Resolved word:', resolved ? resolved.id : 'NOT FOUND');

const resolved2 = registry.resolve('agent-word-expert');
console.log('Resolved agent-word-expert:', resolved2 ? resolved2.id : 'NOT FOUND');
