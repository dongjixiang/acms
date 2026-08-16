const express = require('express');
const app = express();
app.use(express.json());

// 测试路由
const router = require('./server/routes/agents');
app.use('/api', router);

const server = app.listen(3399, () => {
  console.log('Test server on 3399');
  
  // 模拟请求
  const http = require('http');
  const opts = {
    hostname: '127.0.0.1', port: 3399,
    path: '/api/agents/agent-word-expert',
    method: 'GET'
  };
  
  const req = http.request(opts, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('Response:', res.statusCode, data.slice(0, 200));
      server.close();
    });
  });
  req.on('error', e => console.error('Error:', e.message));
  req.end();
});
