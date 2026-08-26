#!/usr/bin/env node
// continue-spike.js — v0.119 continue_last_turn 协议端到端 spike
// 启动 → 中断 → continue → 验证续转 turn 跑起来
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const CLI = path.join(__dirname, '..', 'node_modules', '@qwen-code', 'qwen-code', 'cli.js');
const SCRATCH = path.join(__dirname, 'spike-scratch-continue');
fs.mkdirSync(SCRATCH, { recursive: true });

const ANTHROPIC_KEY = '687c601bdb57dfced89aeb90522ac949:a1755d1238db2aaa05fcbf05ba2663f8:63636771f0b6b19f63235c3b77110a63303c9d7a6ff3f5c81985c58c59378e99462dfe4877cbddc9153b20ba2fcdc027015e35190f24f504e641dcdeed15a6c8ec6e5c6dfa8cc13eef2d0e5cc2bb260e61d43f7497adb91704ea653b1f096e6348773110857ed48437b8a927f';

const child = spawn('node', [
  CLI,
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--channel', 'SDK',
  '--include-partial-messages',
  '--auth-type', 'anthropic',
  '--model', 'MiniMax-M3.0',
], { cwd: SCRATCH, stdio: ['pipe', 'pipe', 'pipe'], env: Object.assign({}, process.env, {
  ANTHROPIC_BASE_URL: 'https://api.minimaxi.com/anthropic',
  ANTHROPIC_API_KEY: ANTHROPIC_KEY,
}) });

let buf = '';
let sessionId = null;
let handshakeDone = false;
let events = [];
let interruptedSeen = false;
let continueAck = false;

const sendControl = (req) => {
  child.stdin.write(JSON.stringify({
    type: 'control_request',
    request_id: 'req-' + crypto.randomUUID(),
    request: req,
  }) + '\n');
};

child.stderr.on('data', (d) => process.stderr.write('[CLI stderr] ' + d));
child.stdout.on('data', (chunk) => {
  buf += chunk;
  const lines = buf.split('\n');
  buf = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    events.push(msg);
    if (msg.type === 'control_response' && msg.response?.subtype === 'success' && msg.response.response?.subtype === 'initialize') {
      handshakeDone = true;
      console.log('[spike] ✅ initialize ACK');
      const userMsg = {
        type: 'user',
        message: {
          role: 'user',
          content: '请用 ls 工具列出当前目录所有文件，对每个 .md 文件 read_file 读取前 30 行，最后给一个总结。这是一个长任务，请认真完成。',
        },
        session_id: sessionId || 'unknown',
        parent_tool_use_id: null,
      };
      child.stdin.write(JSON.stringify(userMsg) + '\n');
      console.log('[spike] 📤 长任务已发');
      // 1 秒后 interrupt
      setTimeout(() => {
        console.log('[spike] ⏹ 发 interrupt');
        sendControl({ subtype: 'interrupt' });
      }, 1500);
    }
    if (msg.type === 'control_response' && msg.response?.subtype === 'success' && msg.response.response?.subtype === 'continue_last_turn') {
      continueAck = true;
      console.log('[spike] ↻ continue_last_turn ACK 收到:', JSON.stringify(msg.response.response).slice(0, 200));
    }
    if (msg.type === 'system' && msg.subtype === 'init') {
      sessionId = msg.session_id;
      console.log('[spike] system init, session_id:', String(sessionId).slice(0, 8));
    }
    if (msg.type === 'result') {
      const errMsg = (typeof msg.error === 'object') ? (msg.error.message || '') : (msg.error || '');
      console.log('[spike] 📥 result 事件:', 'subtype=' + msg.subtype, 'is_error=' + (msg.is_error || false), 'err=' + errMsg.slice(0, 80));
      if (errMsg.includes('Operation cancelled')) {
        interruptedSeen = true;
        // 1 秒后发 continue_last_turn
        setTimeout(() => {
          console.log('[spike] ↻ 发 continue_last_turn');
          sendControl({ subtype: 'continue_last_turn' });
          // 8 秒后检查续转结果
          setTimeout(() => {
            console.log('\n[spike] ===== 续转验证 =====');
            console.log('[spike] interrupt 收到:', interruptedSeen ? '✅' : '❌');
            console.log('[spike] continue ACK:', continueAck ? '✅' : '❌');
            // 找续转后的新 result 事件（interrupted 之后）
            const interruptedIdx = events.findIndex(e => 
              e.type === 'result' && e.is_error && 
              ((typeof e.error === 'object' && (e.error.message || '').includes('Operation cancelled')) ||
               (typeof e.error === 'string' && e.error.includes('Operation cancelled')))
            );
            const afterInterrupted = interruptedIdx >= 0 ? events.slice(interruptedIdx + 1) : [];
            console.log('[spike] interrupt 后事件数:', afterInterrupted.length);
            console.log('[spike] 后事件类型分布:', afterInterrupted.map(e => e.type).join(','));
            const newResult = afterInterrupted.find(e => e.type === 'result');
            console.log('[spike] 续转新 result:', newResult ? ('subtype=' + newResult.subtype + ' is_error=' + (newResult.is_error || false)) : '❌ 没收到');
            const pass = interruptedSeen && continueAck && newResult;
            console.log('\n[spike] ' + (pass ? '✅ PASS — interrupt + continue 链路工作' : '❌ FAIL'));
            child.kill('SIGTERM');
            process.exit(pass ? 0 : 1);
          }, 8000);
        }, 1500);
      }
    }
  }
});

// 1. 握手
sendControl({
  subtype: 'initialize',
  hooks: null,
  mcpServers: null,
  sdkMcpServers: null,
  agents: null,
  timeout: { canUseTool: 600000 },
});
console.log('[spike] 📤 initialize 已发');

// 30 秒兜底
setTimeout(() => {
  console.log('[spike] ⏱ 超时退出');
  child.kill('SIGTERM');
  process.exit(2);
}, 30000);