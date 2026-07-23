// 极端测试：在同一进程里发事件和收WS
const WebSocket = require('ws');
const http = require('http');

// 先创建WS客户端
var ws = new WebSocket('ws://127.0.0.1:3301/ws');
ws.on('open', function() {
  console.log('WS已连接');
  // 直接调服务器API触法事件
  setTimeout(function() {
    var req = http.request({
      hostname: '127.0.0.1', port: 3300, path: '/api/tasks',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
    }, function(res) {
      var b = '';
      res.on('data', function(c) { b += c; });
      res.on('end', function() {
        console.log('task.created 响应:', res.statusCode);
      });
    });
    req.write(JSON.stringify({ projectId: 'proj-001', title: 'WS-diagnose-' + Date.now() }));
    req.end();
    
    // 再PATCH模型
    setTimeout(function() {
      var req2 = http.request({
        hostname: '127.0.0.1', port: 3300, path: '/api/models/model_mp9u94rq',
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
      });
      req2.write(JSON.stringify({ name: 'MiniMax-M3.0' }));
      req2.end();
      
      // 再创建另一个任务
      setTimeout(function() {
        var req3 = http.request({
          hostname: '127.0.0.1', port: 3300, path: '/api/tasks',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
        });
        req3.write(JSON.stringify({ projectId: 'proj-001', title: 'WS-diagnose-2-' + Date.now() }));
        req3.end();
      }, 1000);
    }, 1000);
  }, 1000);
});

ws.on('message', function(data) {
  try {
    var m = JSON.parse(data.toString());
    console.log('📩 WS收到:', m.type);
  } catch(e) {
    console.log('📩 WS原始:', data.toString().slice(0, 100));
  }
});

ws.on('error', function(e) { console.log('WS错误:', e.message); });

setTimeout(function() {
  console.log('\n测试结束');
  ws.close();
  process.exit(0);
}, 8000);
