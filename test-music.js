const http = require('http');

// Step 1: Send detect-and-respond
function detectAndRespond() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({reqId: 'REQ-MPHQJF0U', text: '我想听 程响 的 可能'});
    const options = {
      hostname: 'localhost', port: 3300, path: '/api/chat/detect-and-respond',
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001', 'Content-Length': Buffer.byteLength(data)},
    };
    const req = http.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Step 2: Read supplement history
function getHistory() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3300/api/requirements/REQ-MPHQJF0U/supplement-history', {headers: {'X-API-Key': 'dev-key-001'}}, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve(JSON.parse(body).history || []));
    }).on('error', reject);
  });
}

async function main() {
  console.log('=== Step 1: detect-and-respond ===');
  const resp = await detectAndRespond();
  console.log('toolCalls:', resp.toolCalls);
  console.log('ok:', resp.ok);

  console.log('\n=== Step 2: Supplement History (last 4) ===');
  const history = await getHistory();
  for (const e of history.slice(-4)) {
    const text = (e.text || '');
    const isJson = text.startsWith('{');
    const preview = isJson ? '[JSON] ' + text.slice(0, 60) : text.slice(0, 60);
    console.log(`[${e.index}] ${e.role} | src=${e.source || ''} | ${preview}`);
  }

  console.log('\n=== Step 3: Wait 15s for music search ===');
  await new Promise(r => setTimeout(r, 15000));

  console.log('\n=== Step 4: History after music search ===');
  const history2 = await getHistory();
  for (const e of history2.slice(-5)) {
    const text = (e.text || '');
    const isJson = text.startsWith('{');
    const preview = isJson ? '[JSON] ' + text.slice(0, 80) : text.slice(0, 60);
    console.log(`[${e.index}] ${e.role} | src=${e.source || ''} | ${preview}`);
  }

  console.log('\n=== DONE ===');
}

main().catch(e => console.error('Error:', e));
