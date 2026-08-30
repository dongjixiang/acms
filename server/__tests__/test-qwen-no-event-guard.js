// ============================================================
// test-qwen-no-event-guard.js — v0.118.6 无事件守护探测逻辑单元测试
// 验证（mock CLI，不 spawn 真实进程）：
//   A. 无事件 120s + 心跳存活（CLI 回 control_response）→ 不杀、重置计时
//   B. wrapper 已死（exitCode !== null）→ 走 stall 快速失败路径
//   C. 心跳无响应 + 非 Linux（无法 CPU 探测）→ 保守不杀（等总超时 600s）
// 跑法：cd server && node __tests__/test-qwen-no-event-guard.js
// ============================================================
const path = require('path');
const SERVER = path.join(__dirname, '..');
process.chdir(SERVER);

const { QwenSession } = require('../services/qwen-worker');

let passed = 0;
let failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${detail || ''}`); }
}

function makeSession() {
  const s = new QwenSession({
    model: 'test-model',
    authType: 'openai',
    baseUrl: 'http://127.0.0.1:9',
    cwd: SERVER,
    sessionId: '11111111-2222-3333-4444-555555555555',
    onApproval: async () => true,
    onEvent: () => {},
  });
  return s;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ---------- 场景 A：心跳存活 → 不杀 + 重置计时 ----------
  console.log('\n[场景 A] 无事件 120s，心跳探测存活');
  {
    const s = makeSession();
    const sent = [];
    let killed = false;
    s.child = {
      pid: 424242,
      exitCode: null,
      stdin: { write: (d) => { try { sent.push(JSON.parse(d)); } catch (e) {} }, destroyed: false },
      kill: () => { killed = true; },
    };
    let stallResult = null;
    s._pendingResolve = (r) => { stallResult = r; };
    s._lastEventAt = Date.now() - 130000;  // 模拟已无事件 > 120s

    const probePromise = s._probeAndMaybeKill(120000);
    await sleep(100);  // 等心跳发出

    check('A1 发出 get_usage_info 心跳', sent.length === 1 && sent[0] && sent[0].request && sent[0].request.subtype === 'get_usage_info',
      `sent=${JSON.stringify(sent)}`);

    // mock CLI 回 control_response（任意 control_response 都算存活）
    s._handleLine(JSON.stringify({ type: 'control_response', response: { subtype: 'success', response: { subtype: 'get_usage_info', usage: {} } } }));
    await probePromise;

    check('A2 心跳存活 → 不 SIGKILL', !killed);
    check('A3 _pendingResolve 未被清空（ask 继续挂起等结果）', !!s._pendingResolve && !stallResult);
    check('A4 _lastEventAt 被重置（下一个 120s 窗口）', Date.now() - s._lastEventAt < 10000, `diff=${Date.now() - s._lastEventAt}ms`);
  }

  // ---------- 场景 B：wrapper 已死 → stall 快速失败 ----------
  console.log('\n[场景 B] wrapper 进程已退出 → 走 stall 路径');
  {
    const s = makeSession();
    let killed = false;
    s.child = {
      pid: 1,
      exitCode: 1,  // CLI 已退出（exit 事件应该已处理，这里是守护兜底）
      stdin: { write: () => {}, destroyed: false },
      kill: () => { killed = true; },
    };
    let stallResult = null;
    s._pendingResolve = (r) => { stallResult = r; };
    s._lastEventAt = Date.now() - 130000;

    await s._probeAndMaybeKill(120000);

    check('B1 探测确认无活性 → resolve stall', !!stallResult && stallResult.subtype === 'stall', JSON.stringify(stallResult));
    check('B2 stall 错误文案不再误导为内存不足', !!stallResult && !/内存不足/.test(stallResult.error.message), stallResult && stallResult.error.message);
    check('B3 _pendingResolve 已清空（防双 resolve）', s._pendingResolve === null);
    check('B4 exitCode!==null 时不重复 kill（exit 流程已处理）', !killed);
  }

  // ---------- 场景 C：心跳无响应 + 非 Linux → 保守不杀 ----------
  console.log('\n[场景 C] 心跳无响应，非 Linux 平台 → 保守不杀');
  {
    const s = makeSession();
    let killed = false;
    s.child = {
      pid: 2,
      exitCode: null,
      stdin: { write: () => {}, destroyed: false },
      kill: () => { killed = true; },
    };
    let stallResult = null;
    s._pendingResolve = (r) => { stallResult = r; };
    s._lastEventAt = Date.now() - 130000;

    const t0 = Date.now();
    // 保活：_cliHasActivity 心跳 timer 是 unref 的，测试进程无其他 handle 会提前退出
    await Promise.race([s._probeAndMaybeKill(120000), sleep(6000)]);
    const elapsed = Date.now() - t0;

    check('C1 心跳无响应 + 非 Linux → 不杀（等总超时 600s 兜底）', !killed && !stallResult);
    check('C2 探测耗时约 3s（心跳超时）', elapsed >= 2500 && elapsed < 6000, `elapsed=${elapsed}ms`);
    check('C3 _lastEventAt 被重置（保守继续等）', Date.now() - s._lastEventAt < 10000);
  }

  // ---------- 场景 D：探测期间 CLI 恰好恢复（事件到达）→ 不杀 ----------
  console.log('\n[场景 D] 探测无活性但探测期间 CLI 恢复 → 不杀');
  {
    const s = makeSession();
    let killed = false;
    s.child = {
      pid: 3,
      exitCode: null,
      stdin: { write: () => {}, destroyed: false },
      kill: () => { killed = true; },
    };
    let stallResult = null;
    s._pendingResolve = (r) => { stallResult = r; };
    s._lastEventAt = Date.now() - 130000;

    const probePromise = s._probeAndMaybeKill(120000);
    await sleep(100);
    // CLI 在探测期间恢复正常（发了 stream_event → _lastEventAt 刷新）
    s._handleLine(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } } }));
    // 保活：等待探测完成（心跳 3s 超时 unref，需 race 保活）
    await Promise.race([probePromise, sleep(6000)]);

    check('D1 探测期间恢复 → 不杀', !killed && !stallResult, `killed=${killed} stall=${JSON.stringify(stallResult)}`);
  }

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error('测试崩溃:', e);
  process.exit(1);
});
