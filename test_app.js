
console.log('1. start');
const express = require('express');
const app = express();
console.log('2. express ok');

try {
  console.log('3. require agents route');
  const agentsRouter = require('./server/routes/agents');
  console.log('4. agents router OK, stack:', agentsRouter.stack.length);
  
  app.use('/api/agents', agentsRouter);
  console.log('5. route registered');
  
  // Test request
  const server = app.listen(3399, () => {
    console.log('6. server listening');
    const http = require('http');
    const req = http.get('http://127.0.0.1:3399/api/agents/agent-word-expert', (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        console.log('7. response:', res.statusCode, data.slice(0, 200));
        server.close();
        process.exit(0);
      });
    });
    req.on('error', e => { console.error('8. error:', e.message); process.exit(1); });
  });
} catch(e) {
  console.error('ERR:', e.message);
  console.error(e.stack);
  process.exit(1);
}
