// 验证 acms_search_images 的 describe=false 路径（只返 URL，不下载不描述）
const { spawn } = require('child_process');
const path = require('path');

const mcpPath = path.resolve('server/services/acms-mcp-server.js');
const child = spawn('node', [mcpPath], { stdio: ['pipe', 'pipe', 'pipe'] });
child.stderr.on('data', (d) => { const s = d.toString().trim(); if (s) console.log('[MCP-stderr]', s.slice(0, 300)); });

const responses = [];
let buffer = '';
child.stdout.on('data', (d) => {
  buffer += d.toString();
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1);
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      responses.push(obj);
      if (obj.id === 3) {
        const parsed = JSON.parse(obj.result.content[0].text);
        console.log('describe=false 测试结果:');
        console.log('  query:', parsed.query);
        console.log('  count:', parsed.count);
        console.log('  described_count:', parsed.described_count);  // 应该 undefined
        console.log('  note:', parsed.note);
        console.log('  第一张图 keys:', Object.keys(parsed.images[0] || {}));
        console.log('  有 description?', 'description' in (parsed.images[0] || {}));
      }
    } catch (e) {}
  }
});

const send = (obj) => child.stdin.write(JSON.stringify(obj) + '\n');

setTimeout(() => send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'probe-no-desc', version: '0.1' } } }), 200);
setTimeout(() => { send({ jsonrpc: '2.0', method: 'notifications/initialized' }); send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }); }, 600);
setTimeout(() => send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'acms_search_images', arguments: { query: '可爱猫咪', maxResults: 2, describe: false } } }), 1000);

const forceKill = setTimeout(() => { try { child.kill(); } catch {}; process.exit(3); }, 60_000);
let exited = false;
const exit = (code) => { if (exited) return; exited = true; clearTimeout(forceKill); try { child.kill(); } catch {}; process.exit(code); };

let ticks = 0;
const poll = setInterval(() => {
  ticks++;
  if (responses.find((r) => r.id === 3)) { clearInterval(poll); setTimeout(() => exit(0), 1500); }
  else if (ticks > 40) { clearInterval(poll); exit(3); }
}, 1000);
