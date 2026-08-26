// 探针 v2：只抓 init 的 tools 列表，完整输出到文件
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const ACMS = 'C:/Users/swede/acms';
const cliPath = path.join(ACMS, 'node_modules/@qwen-code/qwen-code/cli.js');
const modelStore = require(path.join(ACMS, 'server/stores/model-store.js'));
const model = modelStore.getById('model_msvevxme');
const apiKey = modelStore.getDecryptedKey(model.id);

const mcpServerPath = path.join(ACMS, 'server/services/acms-mcp-server.js');
const mcpConfig = JSON.stringify({
  mcpServers: {
    acms: { command: process.execPath, args: ['--max-old-space-size=128', mcpServerPath] },
  },
});

const sessionId = crypto.randomUUID();
const args = [
  cliPath, '--input-format', 'stream-json', '--output-format', 'stream-json',
  '--channel=SDK', '--auth-type', 'openai', '--model', model.model,
  '--approval-mode', 'default', '--session-id', sessionId,
  '--include-partial-messages', '--mcp-config', mcpConfig,
];
const env = { ...process.env, OPENAI_BASE_URL: model.baseUrl, OPENAI_API_KEY: apiKey, NODE_OPTIONS: '--max-old-space-size=256' };
const child = spawn('node', args, { env, cwd: ACMS + '/data/qwen-workspace/probe', stdio: ['pipe', 'pipe', 'pipe'] });
const rl = readline.createInterface({ input: child.stdout });

rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type === 'system' && msg.subtype === 'init') {
    const tools = msg.tools || [];
    const acms = tools.filter(t => /acms/i.test(t));
    const mcp = tools.filter(t => /mcp/i.test(t));
    console.log('TOTAL:', tools.length);
    console.log('ACMS-prefix:', JSON.stringify(acms));
    console.log('MCP-named:', JSON.stringify(mcp));
    console.log('has_describe_image:', tools.some(t => /describe_image/i.test(t)));
    const native = tools.filter(t => !/computer_use|acms|mcp/i.test(t));
    console.log('native count:', native.length, '| sample:', native.slice(0, 40).join(','));
    child.kill();
    process.exit(0);
  }
});
child.stderr.on("data", (d) => console.log("[stderr]", d.toString().slice(0,300)));
child.stdin.write(JSON.stringify({ type: 'control_request', request_id: 'req-' + crypto.randomUUID(), request: { subtype: 'initialize', hooks: null, mcpServers: null, sdkMcpServers: null, agents: null, timeout: { canUseTool: 60000 } } }) + '\n');
setTimeout(() => { console.log('[TIMEOUT]'); child.kill(); process.exit(1); }, 90000);
