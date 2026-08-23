const http = require('http');

// 测试自由对话 SSE 端点
const testData = {
  reqId: 'sess-test-diag',
  text: '帮我写一个 hello.txt 文件',
  userId: 'u_test',
  historyMessages: []
};

const req = http.request({
  hostname: '127.0.0.1',
  port: 3300,
  path: '/api/chat/detect-and-respond',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(JSON.stringify(testData))
  }
}, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Content-Type:', res.headers['content-type']);
  
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('\n=== SSE Response ===');
    console.log(data.slice(0, 2000));
    
    // 解析事件
    const lines = data.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const evt = JSON.parse(line.slice(6));
          console.log('\nEvent:', evt.type, evt.phase ? '(phase:' + evt.phase + ')' : '');
          if (evt.error) console.log('  Error:', evt.error);
          if (evt.result) console.log('  Result:', evt.result.slice(0, 100));
        } catch (e) {
          console.log('  Raw:', line.slice(0, 100));
        }
      }
    }
  });
});

req.on('error', e => console.error('Request error:', e.message));
req.write(JSON.stringify(testData));
req.end();
