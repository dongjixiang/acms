const path = require('path');
const { isPathAllowed } = require('../server/services/vision-service');
const home = process.env.USERPROFILE || '';
const cwd = process.cwd();
console.log('home:', home);
console.log('cwd:', cwd);
console.log();
const p = 'C:\Windows\System32\config.png';
const ctx = { cwd: cwd };
console.log('Test path:', p);
console.log('Test ctx.cwd:', ctx.cwd);
console.log();
const abs = path.resolve(p);
console.log('after resolve:', abs);
const SEP = String.fromCharCode(92);
console.log('absolute path components:', abs.split(SEP));
console.log();

const allowRoots = [path.resolve(ctx.cwd)];
console.log('allowRoots:', allowRoots);
let inAllow = false;
for (const root of allowRoots) {
  console.log('  check abs starts with', JSON.stringify(root + path.sep), '?', abs.startsWith(root + path.sep));
  if (abs === root || abs.startsWith(root + path.sep)) { inAllow = true; break; }
}
console.log('after first loop, inAllow:', inAllow);
if (!inAllow) {
  const userHomeDirs = ['Pictures', 'Desktop', 'Downloads'].map((d) => path.resolve(home, d));
  console.log('userHomeDirs:', userHomeDirs);
  for (const d of userHomeDirs) {
    console.log('  check abs starts with', JSON.stringify(d + path.sep), '?', abs.startsWith(d + path.sep));
    if (abs === d || abs.startsWith(d + path.sep)) { inAllow = true; break; }
  }
}
console.log('after second loop, inAllow:', inAllow);
console.log();
console.log('isPathAllowed result:', isPathAllowed(p, ctx));
