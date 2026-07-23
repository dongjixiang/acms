const WebSocket = require('ws');
const http = require('http');

var ws = new WebSocket('ws://127.0.0.1:3301/ws');
var events = [];

ws.on('open', function() {
  setTimeout(function() {
    var data = JSON.stringify({ name: 'MiniMax-M3.0' });
    var req = http.request({
      hostname: '127.0.0.1', port: 3300, path: '/api/models/model_mp9u94rq',
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001', 'Content-Length': Buffer.byteLength(data) },
    });
    req.write(data);
    req.end();
  }, 500);
});

ws.on('message', function(data) {
  try {
    var msg = JSON.parse(data.toString());
    events.push(msg.type);
    console.log('📩 WS:', msg.type);
  } catch(e) {}
});

setTimeout(function() {
  console.log('\nmodel.updated 到达:', events.includes('model.updated') ? '✅' : '❌');
  ws.close();
  process.exit(0);
}, 3000);
