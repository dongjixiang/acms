#!/usr/bin/env node
// interrupt-spike.js — v0.119 interrupt 协议端到端 spike
// 启动 Qwen CLI → 初始化握手 → 发长任务 → 中途 interrupt → 验证 result.is_error && error.message 包含 'Turn interrupted'
// 用法：node docs/interrupt-spike.js
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const CLI = path.join(__dirname, '..', 'node_modules', '@qwen-code', 'qwen-code', 'cli.js');
const SCRATCH = path.join(__dirname, 'spike-scratch');
fs.mkdirSync(SCRATCH, { recursive: true });

console.log('[spike] 启动 CLI:', CLI);
console.log('[spike] cwd:', SCRATCH);

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
  ANTHROPIC_API_KEY: '687c601bdb57dfced89aeb90522ac949:a1755d1238db2aaa05fcbf05ba2663f8:63636771f0b6b19f63235c3b77110a63303c9d7a6ff3f5c81985c58c59378e99462dfe4877cbddc9153b20ba2fcdc027015e35190f24f504e641dcdeed15a6c8ec6e5c6dfa8cc13eef2d0e5cc2bb260e61d43f7497adb91704ea653b1f096e6348773110857ed48437b8a927f',
}) });

let buf = '';
let sessionId = null;
let handshakeDone = false;
let events = [];
let resultReceived = false;

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
      // 立刻发一个长任务（让 Qwen 读 SCRATCH 目录下"所有"文件 → 触发多 tool call）
      const userMsg = {
        type: 'user',
        message: {
          role: 'user',
          content: `请你列出当前目录下所有文件（用 ls 或 read 工具），然后对每个 .md 文件读取前 30 行，最后给一个总结。这是个长任务，请认真完成。`,
        },
        session_id: sessionId || 'unknown',
        parent_tool_use_id: null,
      };
      child.stdin.write(JSON.stringify(userMsg) + '\n');
      console.log('[spike] 📤 长任务已发');
      // 3 秒后 interrupt（让 Qwen 有时间启动 + 调至少一个工具）
      setTimeout(() => {
        console.log('[spike] ⏹ 发 interrupt');
        sendControl({ subtype: 'interrupt' });
        // 5 秒后看结果
        setTimeout(() => {
          console.log('\n[spike] ===== 事件汇总 =====');
          console.log('[spike] 总事件数:', events.length);
          // 找 result 事件
          const results = events.filter(e => e.type === 'result');
          console.log('[spike] result 事件数:', results.length);
          results.forEach((r, i) => {
            console.log(`  result[${i}].subtype:`, r.subtype);
            console.log(`  result[${i}].is_error:`, r.is_error);
            console.log(`  result[${i}].error:`, r.error ? (r.error.message || JSON.stringify(r.error).slice(0, 200)) : 'none');
            console.log(`  result[${i}].result:`, r.result ? r.result.slice(0, 100) : 'none');
          });
          // 找 control_response
          const controlResponses = events.filter(e => e.type === 'control_response');
          console.log('[spike] control_response 事件数:', controlResponses.length);
          controlResponses.forEach((r, i) => {
            console.log(`  control_response[${i}].response.subtype:`, r.response?.subtype);
            console.log(`  control_response[${i}].response.response.subtype:`, r.response?.response?.subtype);
          });
          // 找中断专用的 control_response
          const interruptAck = controlResponses.find(r => r.response?.response?.subtype === 'interrupt');
          console.log('\n[spike] interrupt ACK:', interruptAck ? '✅ 收到' : '❌ 没收到');
          const interrupted = results.some(r => {
            const errMsg = (typeof r.error === 'object') ? (r.error.message || JSON.stringify(r.error)) : (r.error || '');
            const r_interrupted = r.is_error && errMsg && errMsg.includes('Operation cancelled');
            console.log(`  [check] result[${r.subtype}] is_error=${r.is_error} error_type=${typeof r.error} errMsg=${(errMsg||'').slice(0,60)} interrupted=${r_interrupted}`);
            return r_interrupted;
          });
          console.log('[spike] ' + (interrupted ? '✅ PASS — interrupt 工作正常' : '❌ FAIL — 没收到 interrupt 标识'));
          child.kill('SIGTERM');
          process.exit(interrupted ? 0 : 1);
        }, 3000);
      }, 1000);  // 1 秒（足够短，确保 turn 还在飞）
    }
    if (msg.type === 'system' && msg.subtype === 'init') {
      sessionId = msg.session_id;
      console.log('[spike] system init, session_id:', String(sessionId).slice(0, 8));
    }
    if (msg.type === 'result') {
      console.log('[spike] 📥 result 事件: is_error=' + (msg.is_error || false) + ', error=' + (msg.error?.message?.slice(0, 80) || 'none'));
    }
  }
});

// 1. 握手：立刻发 initialize
sendControl({
  subtype: 'initialize',
  hooks: null,
  mcpServers: null,
  sdkMcpServers: null,
  agents: null,
  timeout: { canUseTool: 600000 },
});
console.log('[spike] 📤 initialize 已发');

// 15 秒兜底退出
setTimeout(() => {
  console.log('[spike] ⏱ 超时退出');
  child.kill('SIGTERM');
  process.exit(2);
}, 15000);