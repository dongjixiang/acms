// Qwen Code CLI 多模态 ContentBlock 接收 spike
//   目的：证明 CLI 0.21.15 stdin user message.content 接受 array 而非只 string
//   风险：失败则 Batch 2 要回退到 OCR-style 视觉代理方案
//   用法：node spikes/qwen-content-array-spike.js
//         按 Ctrl+C 退出
//
// 流程：
//   1. spawn Qwen CLI（含 handshake ~30s）
//   2. 发两条 user message：
//      - 纯 string（控制组，验证 spike 链路本身 OK）
//      - content array [{text},{image}] （实验组）
//   3. 读 JSONL stdout，看 CLI 返回事件
//   4. 看 console.log 总结

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// 模型 / endpoint — 复用 acms 系统配置 default_gen_model（MiniMax-M3.0）
const MODEL = 'MiniMax-M3.0';
const ENDPOINT = 'https://api.minimaxi.com/anthropic';
const API_KEY = process.env.MINI_MAX_API_KEY || process.env.ANTHROPIC_API_KEY || '';
if (!API_KEY) { console.error('SPIKE: 缺 API key, 设 MINIMAX_API_KEY 或 ANTHROPIC_API_KEY 环境变量'); process.exit(1); }

// 选一张小图做测试（xjl.png 1MB 太慢，先看有没有小的测试图）
const testImg = process.env.SPIKE_IMG || 'C:\\Users\\swede\\Pictures\\xjl.png';
if (!fs.existsSync(testImg)) {
  console.error('SPIKE_IMG 不存在：', testImg);
  process.exit(1);
}
const imgBuffer = fs.readFileSync(testImg);
const imgBase64 = imgBuffer.toString('base64');
const ext = path.extname(testImg).toLowerCase();
const mimeMap = { '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp' };
const MIME = mimeMap[ext] || 'image/png';

const cliPath = path.join(__dirname, '..', 'node_modules', '@qwen-code', 'qwen-code', 'cli.js');
if (!fs.existsSync(cliPath)) {
  console.error('未找到 cli.js:', cliPath);
  process.exit(1);
}
const sessionId = crypto.randomUUID();

const env = {
  ...process.env,
  NODE_OPTIONS: '--max-old-space-size=256',
  ANTHROPIC_BASE_URL: ENDPOINT,
  ANTHROPIC_API_KEY: API_KEY,
};

const args = [
  cliPath,
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--channel=SDK',
  '--auth-type', 'anthropic',
  '--model', MODEL,
  '--approval-mode', 'default',
  '--session-id', sessionId,
  '--include-partial-messages',
];

console.log('[spike] spawn:', 'node', args.join(' '));
console.log('[spike] img:', testImg, '/', (imgBuffer.length/1024).toFixed(1), 'KB /', MIME);

const child = spawn('node', args, {
  env, cwd: process.cwd(),
  stdio: ['pipe','pipe','pipe'],
});

let stdoutBuf = '';
child.stdout.on('data', (d) => {
  stdoutBuf += d.toString();
  let nl;
  while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
    const line = stdoutBuf.slice(0, nl).trim();
    stdoutBuf = stdoutBuf.slice(nl+1);
    if (!line) continue;
    try {
      const evt = JSON.parse(line);
      console.log('[cli][OUT]', JSON.stringify(evt).slice(0, 500));
    } catch {
      console.log('[cli][OUT(raw)]', line.slice(0, 500));
    }
  }
});
child.stderr.on('data', (d) => {
  console.log('[cli][ERR]', d.toString().trim().slice(0, 300));
});
child.on('exit', (code, sig) => {
  console.log('[cli] exit code=', code, 'signal=', sig);
  process.exit(code || 0);
});

// wait for handshake (control_response ready)
function waitHandshake() {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('handshake timeout 20s')), 20000);
    const onData = (d) => {
      stdoutBuf += d.toString();
      if (stdoutBuf.includes('"subtype":"success"') || stdoutBuf.includes('"type":"system"')) {
        clearTimeout(t);
        child.stdout.removeListener('data', onData);
        setTimeout(resolve, 500);
      }
    };
    child.stdout.on('data', onData);
    // 主动发 initialize
    child.stdin.write(JSON.stringify({
      type: 'control_request',
      request_id: 'init-1',
      request: { subtype: 'initialize', hooks: null, mcpServers: null, sdkMcpServers: null, agents: null, timeout: { canUseTool: 60000 } },
    }) + '\n');
  });
}

(async () => {
  try {
    console.log('[spike] 等待 handshake...');
    await waitHandshake();
    console.log('[spike] handshake OK');

    // 第 1 条：content array（实验组）
    console.log('[spike] 第 1 条：发 content array（text + image）...');
    const contentArray = [
      { type: 'text', text: '请用一句话描述这张图是什么内容（如截图/照片/图表/UI 等），只输出中文描述，不要前缀。' },
      { type: 'image', source: { type: 'base64', media_type: MIME, data: imgBase64 } },
    ];
    child.stdin.write(JSON.stringify({
      type: 'user',
      message: { role: 'user', content: contentArray },
      session_id: sessionId,
      parent_tool_use_id: null,
    }) + '\n');

    // 等 result 事件 or 30s 超时
    await new Promise((r) => {
      const t = setTimeout(() => { console.log('[spike] 等待 result 超时'); r(); }, 30000);
      const onOut = (d) => {
        if (d.toString().includes('"type":"result"')) {
          clearTimeout(t);
          child.stdout.removeListener('data', onOut);
          r();
        }
      };
      child.stdout.on('data', onOut);
    });

    console.log('[spike] 退出');
    child.kill();
  } catch (e) {
    console.error('[spike] FAIL', e.message);
    child.kill();
    process.exit(1);
  }
})();
