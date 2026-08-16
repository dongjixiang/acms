console.log('starting...');
try {
  console.log('1. require db');
  require('./server/db/connection');
  console.log('2. DB loaded');
  
  console.log('3. require agent-store');
  const agentStore = require('./server/stores/agent-store');
  console.log('4. agent-store OK');
  
  console.log('5. require tool-store');
  const toolStore = require('./server/stores/tool-store');
  console.log('6. tool-store OK');
  
  console.log('7. require registry');
  const registry = require('./server/agents/registry');
  console.log('8. registry OK');
  
  console.log('9. require caller');
  const caller = require('./server/agents/caller');
  console.log('10. caller OK');
  
  console.log('11. require routes/agents');
  const router = require('./server/routes/agents');
  console.log('12. routes/agents OK');
  
  console.log('ALL OK');
} catch(e) {
  console.error('ERR:', e.message);
  console.error(e.stack);
}
