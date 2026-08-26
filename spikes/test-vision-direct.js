// 直接测 vision-service.describeImage，看 MiniMax 现在是否可用
const path = require('path');
const visionService = require(path.resolve('server/services/vision-service'));

(async () => {
  const target = 'C:\\Users\\swede\\Pictures\\桌面截屏.png';
  const ctx = { cwd: process.cwd(), workspacePath: '', sandboxPath: '' };
  const r = await visionService.describeImage(target, ctx, {});
  console.log('RESULT:', JSON.stringify(r, null, 2).slice(0, 1200));
})().catch(e => {
  console.error('ERR', e.message);
  process.exit(1);
});
