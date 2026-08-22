/**
 * Qwen Code 最小嵌入式驱动原型（绕过 SDK bug，直接实现 JSONL 协议）
 * 验证：spawn CLI → 写文件任务 → can_use_tool 审批 → 产物验证
 * 
 * 协议（已实测）：
 *   spawn: node cli.js --input-format stream-json --output-format stream-json --channel=SDK
 *   stdin → user 消息: {"type":"user","message":{"role":"user","content":...},"session_id":...,"parent_tool_use_id":null}
 *   stdout ← 事件: system / assistant / result / stream_event / control_request
 *   control_request(can_use_tool) → stdin 回复 control_response
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const readline = require('readline');

// ===== 1. 解密 MiniMax key =====
const MASTER_KEY = process.env.ACMS_MASTER_KEY || crypto.createHash('sha256').update('acms-dev-master-key').digest();
function decrypt(c) {
  if (!c) return '';
  const p = c.split(':');
  if (p.length !== 3) return '';
  const iv = Buffer.from(p[0], 'hex'), tag = Buffer.from(p[1], 'hex'), enc = Buffer.from(p[2], 'hex');
  const d = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, iv);
  d.setAuthTag(tag);
  return d.update(enc) + d.final('utf8');
}
const db = new Database(path.join(process.env.USERPROFILE || 'C:\\Users\\swede', 'acms', 'data', 'acms.db'));
const doc = JSON.parse(db.prepare('SELECT doc FROM llm_models WHERE id=2').get().doc);
const cfg = { name: doc.name, model: doc.model, baseUrl: doc.baseUrl, apiKey: decrypt(doc.apiKey) };
console.log('[init] MiniMax:', cfg.name, '| key_len:', cfg.apiKey.length);

// ===== 2. spawn CLI =====
const CLI = path.join(__dirname, 'node_modules', '@qwen-code', 'qwen-code', 'cli.js');
const SCRATCH = path.join(__dirname, 'scratch2');
fs.mkdirSync(SCRATCH, { recursive: true });

const env = { ...process.env, ANTHROPIC_BASE_URL: cfg.baseUrl, ANTHROPIC_API_KEY: cfg.apiKey };
const args = [
  CLI,
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--channel=SDK',
  '--auth-type', 'anthropic',
  '--model', cfg.model,
  '--approval-mode', 'default',
  '--include-partial-messages',
];
console.log('[spawn] node', args.join(' '));
const child = spawn('node', args, { env, cwd: SCRATCH, stdio: ['pipe', 'pipe', 'pipe'] });

let sessionId = 'acms-test-' + Date.now();
let toolApprovals = 0;
let resultEvent = null;

// ===== 3. initialize 握手 + 发送任务 =====
// stdout 原始监听（诊断）
child.stdout.on('data', (d) => {
  const s = d.toString();
  if (s.trim()) console.log('[stdout-raw]', JSON.stringify(s.slice(0, 300)));
});
// stdout 逐行读
const rl = readline.createInterface({ input: child.stdout });
// SDK 在 spawn 后先发 initialize control_request 建立通道
function sendInitialize() {
  const init = {
    type: 'control_request',
    request_id: 'acms-init-' + Date.now(),
    request: { subtype: 'initialize', hooks: null, mcpServers: null, sdkMcpServers: null, agents: null },
  };
  child.stdin.write(JSON.stringify(init) + '\n');
  console.log('[握手] initialize sent');
}

// 等 CLI 就绪：先发 initialize（CLI 收到后才输出 system init），再等 ACK
sendInitialize();
let taskSent = false;
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { console.log('[raw]', line.slice(0, 150)); return; }

  switch (msg.type) {
    case 'system':
      if (msg.subtype === 'init') {
        sessionId = msg.session_id;
        console.log('[sys] init session:', sessionId.slice(0, 8));
      } else console.log('[sys]', msg.subtype, JSON.stringify(msg).slice(0, 150));
      break;
    case 'control_response': {
      const resp = msg.response || {};
      if (resp.subtype === 'success' && resp.response?.subtype === 'initialize') {
        console.log('[握手] initialize ACK, capabilities:', JSON.stringify(resp.response.capabilities).slice(0, 120));
        // 通道就绪，发任务（只发一次）
        if (!taskSent) {
          taskSent = true;
          child.stdin.write(JSON.stringify({
            type: 'user',
            message: { role: 'user', content: '写一个 hello.txt 到当前目录，内容为 Hello from Qwen Code via ACMS SDK!' },
            session_id: sessionId || 'acms-test-' + Date.now(),
            parent_tool_use_id: null,
          }) + '\n');
          console.log('[任务] 已发送');
        }
      } else {
        console.log('[control_resp]', JSON.stringify(msg).slice(0, 150));
      }
      break;
    }
    case 'assistant': {
      const content = msg.message?.content;
      const text = Array.isArray(content)
        ? content.filter(p => p.type === 'text').map(p => p.text).join('')
        : (typeof content === 'string' ? content : '');
      if (text) console.log('[ai]', text.slice(0, 180));
      break;
    }
    case 'stream_event': {
      const ev = msg.event;
      if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
        process.stdout.write(ev.delta.text);
      }
      break;
    }
    case 'control_request': {
      const req = msg.request;
      console.log('\n[审批] control_request:', req.subtype, JSON.stringify(req).slice(0, 300));
      if (req.subtype === 'can_use_tool') {
        toolApprovals++;
        console.log('[审批] tool_name:', req.tool_name, '| input:', JSON.stringify(req.input).slice(0, 150));
        const resp = {
          type: 'control_response',
          response: { subtype: 'success', request_id: msg.request_id, response: { behavior: 'allow' } },
        };
        child.stdin.write(JSON.stringify(resp) + '\n');
        console.log('[审批] → allow');
      } else {
        const resp = { type: 'control_response', response: { subtype: 'success', request_id: msg.request_id, response: { subtype: 'ok' } } };
        child.stdin.write(JSON.stringify(resp) + '\n');
      }
      break;
    }
    case 'result':
      resultEvent = msg;
      console.log('\n[result]', msg.subtype, '| turns:', msg.num_turns, '| duration:', msg.duration_ms + 'ms', '| err:', msg.is_error);
      console.log('[usage]', JSON.stringify(msg.usage));
      if (msg.is_error) console.log('[err]', JSON.stringify(msg.error).slice(0, 400));
      child.stdin.end();
      break;
    default:
      console.log('[msg]', msg.type, JSON.stringify(msg).slice(0, 120));
  }
});

child.stderr.on('data', (d) => { const s = d.toString(); if (s.trim()) console.log('[stderr]', s.slice(0, 300)); });
child.on('error', (e) => console.log('[child-error]', e.message));
child.on('exit', (code) => {
  console.log('\n[exit]', code);
  const hello = path.join(SCRATCH, 'hello.txt');
  if (fs.existsSync(hello)) {
    console.log('[产物] OK hello.txt =', JSON.stringify(fs.readFileSync(hello, 'utf8').slice(0, 100)));
  } else {
    console.log('[产物] 未找到 hello.txt; 目录内容:', fs.readdirSync(SCRATCH));
  }
  console.log('[统计] 审批次数:', toolApprovals);
  process.exit(0);
});

// 60s 超时
setTimeout(() => { console.log('[!] 60s timeout'); child.kill('SIGKILL'); }, 60000);
