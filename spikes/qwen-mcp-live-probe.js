// ============================================================
// qwen-mcp-live-probe.js — 验证 Qwen CLI 侧是否真正注入了 ACMS MCP 工具
// ============================================================
// 触发场景：Agent（小吉）不调 acms_describe_image / 报"找不到工具" /
//           MCP server 端 probe（tools/list）OK 但 CLI 侧疑似没装配。
//
// 用法（在 ACMS 根目录）：
//   node spikes/qwen-mcp-live-probe.js > /tmp/probe_out.txt 2>&1
//   Windows 上若挂住 terminal，用：
//   cmd //c "start /b node spikes/qwen-mcp-live-probe.js > /tmp/probe_out.txt 2>&1"
//   然后 cat /tmp/probe_out.txt
//
// 判定：
//   - has_describe_image: true  → CLI 侧 MCP 注入 OK，问题在触发条件（persona/description/审批）
//   - has_describe_image: false → CLI 侧 MCP 没装配 → 查 qwen-worker.js _sendControl(initialize)
//     mcpServers 字段是否真的传了（v0.118.4 修复：--mcp-config 在 0.21.15 不存在，
//     必须走 SDK initialize 控制消息 mcpServers 字段）
//
// ⚠️ Windows 注意：
//   - 杀探针进程用 taskkill //F //PID <pid>，绝不要 taskkill //F //IM node.exe
//     （会连 ACMS 服务一起杀，见 acms umbrella「Windows 本地运维」节）
//   - 探针可能因模型限流或 CLI 启动慢而 TIMEOUT，属正常，加大超时重试
// ============================================================
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const crypto = require('crypto');

const ACMS = path.resolve(__dirname, '..', '..'); // 从 spikes/ 上溯到 acms 根
const cliPath = path.join(ACMS, 'node_modules/@qwen-code/qwen-code/cli.js');
const modelStore = require(path.join(ACMS, 'server/stores/model-store.js'));

// 模型选择：优先 vision-capable 活跃模型；调试时可直接写死已知模型 id
function pickModel() {
  const models = modelStore.list().filter((m) => m.status === 'active');
  const vis = models.find((m) => Array.isArray(m.capabilities) && m.capabilities.includes('vision'));
  return vis || models[0] || null;
}
const model = pickModel();
if (!model) { console.error('NO_ACTIVE_MODEL'); process.exit(1); }
const apiKey = modelStore.getDecryptedKey(model.id);
if (!apiKey) { console.error('NO_API_KEY for', model.name); process.exit(1); }
const authType = (model.api || '').toLowerCase().includes('anthropic')
  || ((model.baseUrl || '').toLowerCase().includes('minimax') && (model.baseUrl || '').toLowerCase().includes('anthropic')) ? 'anthropic'
  : (model.api || '').toLowerCase().includes('gemini') ? 'gemini' : 'openai';
console.log('MODEL:', model.model, '| auth:', authType, '| baseUrl:', model.baseUrl);

const mcpServerPath = path.join(ACMS, 'server/services/acms-mcp-server.js');

const sessionId = crypto.randomUUID();
const args = [
  cliPath, '--input-format', 'stream-json', '--output-format', 'stream-json',
  '--channel=SDK', '--auth-type', authType, '--model', model.model,
  '--approval-mode', 'default', '--session-id', sessionId,
  '--include-partial-messages',
];
const env = {
  ...process.env,
  ...(authType === 'anthropic' ? { ANTHROPIC_BASE_URL: model.baseUrl, ANTHROPIC_API_KEY: apiKey }
    : authType === 'gemini' ? { GEMINI_API_KEY: apiKey }
    : { OPENAI_BASE_URL: model.baseUrl, OPENAI_API_KEY: apiKey }),
  NODE_OPTIONS: '--max-old-space-size=256',
};

const cwd = path.join(ACMS, 'data/qwen-workspace/probe');
require('fs').mkdirSync(cwd, { recursive: true });

const child = spawn('node', args, { env, cwd, stdio: ['pipe', 'pipe', 'pipe'] });
child.stderr.on('data', (d) => console.log('[stderr]', d.toString().slice(0, 500)));
const rl = readline.createInterface({ input: child.stdout });

rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  // init system 消息携带 CLI 侧完整工具列表（含 MCP 注入结果）
  if (msg.type === 'system' && msg.subtype === 'init') {
    const tools = msg.tools || [];
    console.log('TOTAL_TOOLS:', tools.length);
    const acms = tools.filter((t) => /acms/i.test(t));
    const mcp = tools.filter((t) => /mcp/i.test(t));
    console.log('ACMS_TOOLS:', JSON.stringify(acms));
    console.log('MCP_NAMED:', JSON.stringify(mcp));
    console.log('has_describe_image:', tools.some((t) => /describe_image/i.test(t)));
    const native = tools.filter((t) => !/computer_use|acms|mcp/i.test(t));
    console.log('NATIVE_SAMPLE:', native.slice(0, 30).join(','));
    child.kill();
    process.exit(0);
  }
});

child.stdin.write(JSON.stringify({
  type: 'control_request',
  request_id: 'req-' + crypto.randomUUID(),
  request: {
    subtype: 'initialize', hooks: null,
    // v0.118.4: 与生产 qwen-worker.js 一致 — mcpServers 字段注入（--mcp-config 在 0.21.15 不存在）
    mcpServers: {
      acms: { command: process.execPath, args: ['--max-old-space-size=128', mcpServerPath], env: {}, trust: true },
    },
    sdkMcpServers: null, agents: null, timeout: { canUseTool: 60000 },
  },
}) + '\n');

setTimeout(() => { console.log('[TIMEOUT] — 加大超时重试或检查模型限流'); child.kill(); process.exit(1); }, 90000);
