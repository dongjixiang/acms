// 原始 https 模块测试 Agnes POST /v1/videos
const https = require('https');
const Database = require('better-sqlite3');

const db = new Database('data/acms.db', { readonly: true });
const cfgs = db.prepare('SELECT doc FROM system_configs').all();
let apiKey = '';
cfgs.forEach(c => {
  const d = JSON.parse(c.doc);
  if (d.key === 'agnes_api_key') apiKey = d.value;
});
db.close();

const postData = JSON.stringify({
  model: 'agnes-video-v2.0',
  prompt: 'a blue circle',
  num_frames: 49,
  frame_rate: 24
});

console.log('Raw HTTPS POST to apihub.agnes-ai.com/v1/videos');
console.log('API Key:', apiKey.slice(0, 10) + '...');
console.log('Body:', postData);

const start = Date.now();

const req = https.request({
  hostname: 'apihub.agnes-ai.com',
  port: 443,
  path: '/v1/videos',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
  },
}, (res) => {
  console.log('\n=== Response received after', Date.now() - start, 'ms ===');
  console.log('Status:', res.statusCode, res.statusMessage);
  console.log('Headers:', res.headers);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Body:', data.slice(0, 1000));
  });
});

req.on('error', (e) => {
  console.log('\n=== Request error after', Date.now() - start, 'ms ===');
  console.log(e.message);
});

req.on('timeout', () => {
  console.log('\n=== Socket timeout after', Date.now() - start, 'ms ===');
  console.log('No data received yet. Destroying...');
  req.destroy();
});

req.setTimeout(10000);
req.write(postData);
req.end();
