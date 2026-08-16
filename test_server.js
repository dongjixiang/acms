// 测试 server 是否能正常启动
console.log('=== Starting test ===');
try {
  const app = require('./server/app');
  console.log('app loaded OK');
  
  const http = require('http');
  const server = http.createServer(app);
  
  server.listen(3399, () => {
    console.log('Server listening on 3399');
    
    // 测试 API
    const http = require('http');
    const req = http.get('http://127.0.0.1:3399/api/auth/guest', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('auth response:', data.slice(0, 100));
        const token = JSON.parse(data).token;
        
        // 测试 agents
        const opts = {
          hostname: '127.0.0.1', port: 3399,
          path: '/api/agents',
          headers: { 'Authorization': `Bearer ${token}` }
        };
        http.get(opts, (res2) => {
          let data2 = '';
          res2.on('data', chunk => data2 += chunk);
          res2.on('end', () => {
            console.log('agents response:', data2.slice(0, 300));
            
            // 测试 tools
            const opts3 = {
              hostname: '127.0.0.1', port: 3399,
              path: '/api/tools',
              headers: { 'Authorization': `Bearer ${token}` }
            };
            http.get(opts3, (res3) => {
              let data3 = '';
              res3.on('data', chunk => data3 += chunk);
              res3.on('end', () => {
                console.log('tools response:', data3.slice(0, 200));
                server.close();
                process.exit(0);
              });
            });
          });
        });
      });
    });
    
    req.on('error', e => console.error('req error:', e.message));
  });
  
  server.on('error', e => console.error('server error:', e.message));
} catch(e) {
  console.error('FATAL ERROR:', e.message);
  console.error(e.stack);
  process.exit(1);
}
