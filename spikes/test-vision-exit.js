// 直测 vision 链路（强制 exit 防止 SQLite handle 挂住进程）
const path = require('path');
const visionService = require(path.resolve('server/services/vision-service'));

const target = process.argv[2] || 'C:\\Users\\swede\\Pictures\\_analyze_zhm.jpg';
const ctx = { cwd: process.cwd(), workspacePath: '', sandboxPath: '' };

(async () => {
  console.log('[TEST] target =', target);
  const t0 = Date.now();
  const r = await visionService.describeImage(target, ctx, {});
  console.log('[TEST] elapsed =', (Date.now() - t0) + 'ms');
  console.log('[TEST] RESULT =', JSON.stringify(r).slice(0, 1000));
  process.exit(r.ok ? 0 : 2);
})().catch(e => {
  console.error('[TEST] ERR', e.message);
  process.exit(1);
});

// 兜底：40s 后强制退出（防止挂住）
setTimeout(() => { console.error('[TEST] FORCE_TIMEOUT'); process.exit(3); }, 40000);
