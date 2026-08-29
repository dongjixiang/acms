// 验证 acms_search_images MCP 工具（v0.119）：
//   1) initialize + tools/list → 确认 acms_search_images 已注册
//   2) tools/call acms_search_images({query:"夏日海滩", maxResults:3, describe:true})
//      → 期望返回 {query, count, images:[{thumb, url, title, description}]}
//
//   跑法：从 acms 根目录 node spikes/mcp-search-images-probe.js
const { spawn } = require('child_process');
const path = require('path');

const mcpPath = path.resolve('server/services/acms-mcp-server.js');
console.log('[probe] MCP server path:', mcpPath);

const child = spawn('node', [mcpPath], { stdio: ['pipe', 'pipe', 'pipe'] });

// stderr 转 log（防止 silent failure）
child.stderr.on('data', (d) => {
  const s = d.toString().trim();
  if (s) console.log('[MCP-stderr]', s.slice(0, 400));
});

const responses = [];
let buffer = '';
child.stdout.on('data', (d) => {
  buffer += d.toString();
  let nl;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      responses.push(obj);
      // 摘要打印
      if (obj.id === 1) console.log('[MCP→] id=1 initialize ACK');
      else if (obj.id === 2) {
        const tools = obj.result?.tools || [];
        const names = tools.map((t) => t.name);
        console.log('[MCP→] id=2 tools/list 工具数=' + tools.length);
        console.log('        含 acms_search_images?', names.includes('acms_search_images'));
        console.log('        全部工具:', names.join(', '));
      } else if (obj.id === 3) {
        const content = obj.result?.content?.[0]?.text;
        console.log('[MCP→] id=3 tools/call acms_search_images 完成');
        if (content) {
          try {
            const parsed = JSON.parse(content);
            console.log('        query:', parsed.query);
            console.log('        count:', parsed.count);
            console.log('        described_count:', parsed.described_count);
            console.log('        hint:', parsed.hint);
            console.log('        --- 前 3 张图 ---');
            for (const img of (parsed.images || []).slice(0, 3)) {
              console.log('        · url:', (img.url || '').slice(0, 80));
              console.log('          title:', img.title);
              if (img.description) {
                console.log('          description:', img.description.slice(0, 200) + (img.description.length > 200 ? '…' : ''));
              } else {
                console.log('          fetch_error:', img.fetch_error, '/ describe_error:', img.describe_error);
              }
            }
          } catch (e) {
            console.log('        raw:', content.slice(0, 600));
          }
        }
        if (obj.result?.isError) console.log('        isError=true（工具内部报错）');
      } else if (obj.error) {
        console.log('[MCP→] error:', JSON.stringify(obj.error));
      } else {
        console.log('[MCP→]', line.slice(0, 200));
      }
    } catch (e) {
      console.log('[MCP→raw]', line.slice(0, 300));
    }
  }
});

// 兜底退出（防止 SQLite handle / 子进程残留）
const forceKill = setTimeout(() => {
  console.error('[probe] FORCE_TIMEOUT — 强制退出');
  try { child.kill(); } catch {}
  process.exit(3);
}, 120_000);

const send = (obj) => {
  console.log('[probe→]', JSON.stringify(obj).slice(0, 200));
  child.stdin.write(JSON.stringify(obj) + '\n');
};

// Step 1: initialize
setTimeout(() => {
  send({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'acms-search-images-probe', version: '0.1' },
    },
  });
}, 200);

// Step 2: initialized notification + tools/list
setTimeout(() => {
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
}, 600);

// Step 3: tools/call acms_search_images
setTimeout(() => {
  send({
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: {
      name: 'acms_search_images',
      arguments: {
        query: '夏日海滩壁纸',
        maxResults: 3,
        describe: true,
      },
    },
  });
}, 1000);

// 收到 call response 后等一下，再优雅退出
let exited = false;
const tryExit = (code) => {
  if (exited) return;
  exited = true;
  clearTimeout(forceKill);
  console.log('');
  console.log('=== 总结 ===');
  const list = responses.find((r) => r.id === 2);
  const call = responses.find((r) => r.id === 3);
  const registered = list && list.result && list.result.tools && list.result.tools.some((t) => t.name === 'acms_search_images');
  const called = call && !call.error && call.result;
  console.log('  tools/list 含 acms_search_images:', registered);
  console.log('  tools/call 成功:', called);
  if (!called && call?.error) console.log('  call error:', JSON.stringify(call.error));
  console.log('  exit code:', code);
  try { child.kill(); } catch {}
  process.exit(code);
};

// 监听 call 完成 → 等 2s 让 stream 收尾 → 退出
let checkCount = 0;
const poll = setInterval(() => {
  checkCount++;
  if (responses.find((r) => r.id === 3)) {
    clearInterval(poll);
    setTimeout(() => tryExit(registered() && called() ? 0 : 2), 2000);
  } else if (checkCount > 60) {  // 60 × 1s = 60s 超时
    clearInterval(poll);
    tryExit(3);
  }
}, 1000);

function registered() {
  const list = responses.find((r) => r.id === 2);
  return list && list.result && list.result.tools && list.result.tools.some((t) => t.name === 'acms_search_images');
}
function called() {
  const call = responses.find((r) => r.id === 3);
  return call && !call.error && call.result;
}
