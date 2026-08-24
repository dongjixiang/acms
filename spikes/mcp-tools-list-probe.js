// 模拟 Qwen CLI 作为 MCP client：
//   spawn acms-mcp-server.js (stdin/stdout JSON-RPC)
//   发 initialize → tools/list
//   看返回里有没有 acms_describe_image
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

const mcpPath = path.resolve('server/services/acms-mcp-server.js');
console.log('[probe] MCP server path:', mcpPath);

const child = spawn('node', [mcpPath], { stdio: ['pipe','pipe','pipe'] });

const rl = readline.createInterface({ input: child.stdout });
const responses = [];
rl.on('line', line => {
  console.log('[MCP→]', line.slice(0, 500));
  try { responses.push(JSON.parse(line)); } catch (e) {}
});

// Step 1: initialize
setTimeout(() => {
  const initReq = {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'probe-cli', version: '0.1' }
    }
  };
  console.log('[probe→] initialize');
  child.stdin.write(JSON.stringify(initReq) + '\n');
  // send initialized notification (some servers require it)
  setTimeout(() => {
    const notify = { jsonrpc: '2.0', method: 'notifications/initialized' };
    child.stdin.write(JSON.stringify(notify) + '\n');
    // Step 2: list tools
    setTimeout(() => {
      const listReq = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };
      console.log('[probe→] tools/list');
      child.stdin.write(JSON.stringify(listReq) + '\n');
      // collect
      setTimeout(() => {
        // 看响应
        const init = responses.find(r => r.id === 1);
        const list = responses.find(r => r.id === 2);
        console.log('');
        console.log('=== 总结 ===');
        if (init) console.log('initialize serverInfo:', JSON.stringify(init.result?.serverInfo || init));
        if (list) {
          const tools = list.result?.tools || [];
          console.log('total tools:', tools.length);
          const has = tools.find(t => t.name === 'acms_describe_image');
          console.log('has acms_describe_image?', !!has);
          if (has) {
            console.log('  name:', has.name);
            console.log('  description (first 200):', (has.description || '').slice(0, 200));
          }
          console.log('  all tool names:', tools.map(t => t.name).join(', '));
        }
        child.kill();
        process.exit(0);
      }, 1500);
    }, 600);
  }, 300);
}, 800);
