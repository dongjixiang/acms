// v0.59 P2-4 独立验证：独立 node 进程，直接 require service 实例，验证 idle timer
// 完全绕开主 server——不需要重启，不需要 env 透传
// 用法：
//   APP_RUNTIME_IDLE_MS=2500 node workspace/tmp-verify-p2-idle-standalone.js

process.env.APP_RUNTIME_IDLE_MS = process.env.APP_RUNTIME_IDLE_MS || '2500';

const appRuntime = require('../server/services/app-runtime.js');

(async () => {
  console.log('[1] openSession（独立 puppeteer 实例，独立 BrowserContext）');
  const t0 = Date.now();
  const s = await appRuntime.openSession({ url: 'https://example.com', w: 600, h: 400 });
  console.log(`    sessionId=${s.sessionId.slice(0, 8)}  url=${s.url}`);
  console.log(`    配置 IDLE_MS=${process.env.APP_RUNTIME_IDLE_MS}`);

  console.log('[2] 不发任何 input，等 idle 时长 1.6 倍…');
  // 1.6 倍 = 4 秒（env=2500 时）
  const waitMs = Number(process.env.APP_RUNTIME_IDLE_MS) * 1.6;
  console.log(`    等待 ${(waitMs / 1000).toFixed(1)} 秒`);
  await new Promise(r => setTimeout(r, waitMs));

  console.log('[3] 检查 sessions：');
  const list = appRuntime.listSessions();
  const still = list.find(x => x.sessionId === s.sessionId);
  if (still) {
    console.log(`    ❌ session ${s.sessionId.slice(0, 8)} 仍在（idle 没触发）`);
    await appRuntime.cleanup();
    process.exit(1);
  }
  console.log(`    ✅ session 已自动清理（idle timer 触发）`);

  console.log('[4] cleanup puppeteer');
  await appRuntime.cleanup();

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✅ P2-4 PASS (${dt}s elapsed)`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
