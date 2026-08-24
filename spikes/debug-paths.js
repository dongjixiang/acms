const path = require('path');
const { isPathAllowed } = require('../server/services/vision-service');
const home = process.env.USERPROFILE || '';
const cwd = process.cwd();
console.log('home:', home);
console.log('cwd:', cwd);
console.log();

// 模拟测试用例
const p = 'C:\Windows\System32\config.png';
const ctx = { cwd: cwd };
console.log('Test path:', p);
console.log('Test ctx.cwd:', ctx.cwd);
console.log();
const abs = path.resolve(p);
console.log('after resolve:', abs);
console.log('absolute path components:', abs.split('\'));

const allowRoots = [];
if (ctx.cwd) allowRoots.push(path.resolve(ctx.cwd));
if (ctx.workspacePath) allowRoots.push(path.resolve(ctx.workspacePath));
if (ctx.sandboxPath) allowRoots.push(path.resolve(ctx.sandboxPath));
console.log('allowRoots:', allowRoots);

let inAllow = false;
for (const root of allowRoots) {
  console.log(`  check abs starts with "${root}"?`, abs.startsWith(root + path.sep));
  if (abs === root || abs.startsWith(root + path.sep)) { inAllow = true; break; }
}
console.log('after first loop, inAllow:', inAllow);

if (!inAllow) {
  const userHomeDirs = ['Pictures', 'Desktop', 'Downloads'].map((d) => path.resolve(home, d));
  console.log('userHomeDirs:', userHomeDirs);
  for (const d of userHomeDirs) {
    console.log(`  check abs starts with "${d}"?`, abs.startsWith(d + path.sep));
    if (abs === d || abs.startsWith(d + path.sep)) { inAllow = true; break; }
  }
}
console.log('after second loop, inAllow:', inAllow);

console.log();
console.log('Final isPathAllowed:', isPathAllowed(p, ctx));
