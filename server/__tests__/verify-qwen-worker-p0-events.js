// ============================================================
// verify-qwen-worker-p0-events.js — 端到端验证
// spawn 真 Qwen CLI → ask 触发工具调用（写文件）→ 收集 onEvent
// 验证：tool_use_start / tool_use_end / tool_result / approval_request / approval_result / thinking_delta 全部到位
// ============================================================
const path = require('path');
const SERVER = path.join(__dirname, '..');
process.chdir(SERVER);

const fs = require('fs');
const os = require('os');
const { QwenSessionManager } = require('../services/qwen-worker');

(async () => {
  const tmp = path.join(os.tmpdir(), 'qwen-p0-verify-' + Date.now());
  fs.mkdirSync(tmp, { recursive: true });
  console.log(`[verify] workspace=${tmp}`);

  const events = [];
  let resolveResult;
  const resultPromise = new Promise((r) => { resolveResult = r; });

  const manager = new QwenSessionManager({
    maxSessions: 1,
    idleTimeoutMs: 60 * 1000,
    onApproval: async (toolCall) => {
      events.push({ evt: 'onApproval called', tool: toolCall.tool_name, input: toolCall.input });
      return true;  // auto allow
    },
    onEvent: (e) => {
      events.push(e);
      console.log(`[event] ${e.type} ${JSON.stringify({
        tool_name: e.tool_name,
        tool_use_id: e.tool_use_id,
        input_keys: e.input ? Object.keys(e.input) : undefined,
        content_preview: typeof e.content === 'string' ? e.content.slice(0, 60) : undefined,
        is_error: e.is_error,
        allowed: e.allowed,
      })}`);
    },
  });

  const t0 = Date.now();
  try {
    const session = await manager.getSession('verify-user', { cwd: tmp });
    console.log(`[verify] 会话就绪 ${Date.now() - t0}ms`);

    // 触发写文件（写一个 ASCII 内容，避免中文乱码）
    const task = `把 "p0-test-marker" 写入 p0-test.txt 文件。只做这一步。`;
    const askPromise = session.ask(task, { timeoutMs: 120000 }).then(resolveResult);

    // 异步等结果
    const result = await resultPromise;
    console.log(`\n[verify] ask 完成 ${Date.now() - t0}ms`);
    console.log(`[verify] result.subtype=${result.subtype} is_error=${result.is_error}`);
    console.log(`[verify] result.result=${(result.result || '').slice(0, 200)}`);

    // 等会话空闲
    await askPromise;

    // 检查产物
    const outFile = path.join(tmp, 'p0-test.txt');
    if (fs.existsSync(outFile)) {
      console.log(`[verify] ✅ 产物: ${outFile} = "${fs.readFileSync(outFile, 'utf8').trim()}"`);
    } else {
      console.log(`[verify] ❌ 产物不存在: ${outFile}`);
    }

    // 事件统计
    const counts = {};
    for (const e of events) {
      counts[e.type] = (counts[e.type] || 0) + 1;
    }
    console.log('\n[verify] 事件统计:');
    for (const [k, v] of Object.entries(counts)) {
      console.log(`  ${k}: ${v}`);
    }

    // 验收
    const required = ['tool_use_start', 'tool_use_end', 'tool_result', 'approval_request', 'approval_result'];
    const missing = required.filter((r) => !counts[r]);
    if (missing.length === 0) {
      console.log(`\n✅ P0 全部透传到位 (${required.join(', ')})`);
    } else {
      console.log(`\n❌ 缺失事件: ${missing.join(', ')}`);
      console.log('注：thinking_delta 是可选（依赖模型是否启用 extended thinking），不算 missing');
    }

    manager.shutdown();
    process.exit(missing.length === 0 ? 0 : 1);
  } catch (e) {
    console.error('[verify] 异常:', e.message, e.stack);
    process.exit(2);
  }
})();