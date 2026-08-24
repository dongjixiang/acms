const path = require('path');
const { checkPathPolicy, isPathAllowed, describeImage } = require('../server/services/vision-service');

const home = process.env.USERPROFILE || '';
const SEP = String.fromCharCode(92);
const cwd = process.cwd();

const cases = [
  // ── 自动白名单 ──
  [path.join(cwd, 'a.png'), { cwd }, 'AUTO_ALLOWED', false, 'cwd 内'],
  [path.join(home, 'Pictures', 'xjl.png'), { cwd }, 'AUTO_ALLOWED', false, 'home/Pictures 兜底'],
  [path.join(home, 'Desktop', 'd.png'), { cwd }, 'AUTO_ALLOWED', false, 'home/Desktop 兜底'],
  [path.join(home, 'Downloads', 'd.png'), { cwd }, 'AUTO_ALLOWED', false, 'home/Downloads 兜底'],
  [path.join(cwd, 'subdir', 'a.png'), { cwd, workspacePath: cwd }, 'AUTO_ALLOWED', false, 'workspacePath 兜底'],

  // ── 黑名单（FORBIDDEN — 直接拒，不需要审批）──
  [path.join(home, '.ssh', 'id_rsa.png'), { cwd }, 'FORBIDDEN', false, '.ssh 黑名单'],
  // .env 文件 + .env 目录都该黑名单
  [path.join(home, '.env', 'config.png'), { cwd }, 'FORBIDDEN', false, '.env 目录黑名单（v0.118）'],
  [path.join(home, '.env'), { cwd }, 'FORBIDDEN', false, '.env 目录本身黑名单'],
  // 系统目录用真实反斜杠
  [['C:', 'Windows', 'System32', 'drivers.png'].join(SEP), { cwd }, 'FORBIDDEN', false, 'Win System32 黑名单'],
  [path.join(home, 'Pictures', '.git', 'a.png'), { cwd }, 'FORBIDDEN', false, '.git 黑名单'],

  // ── 中间地带（REQUIRES_APPROVAL — 让 Agent 提示用户）──
  // 这是多多反馈要修的关键点
  [path.join(home, 'Documents', 'a.png'), { cwd }, 'REQUIRES_APPROVAL', true, 'home/Documents 中间 → 需审批'],
  [path.join(home, 'Projects', 'work', 'a.png'), { cwd }, 'REQUIRES_APPROVAL', true, 'home/Projects/... 嵌套 → 需审批'],
  [['D:', 'somewhere', 'a.png'].join(SEP), { cwd }, 'REQUIRES_APPROVAL', true, 'D 盘其他位置 → 需审批'],

  // ── 边界 ──
  ['', {}, 'EMPTY_PATH', false, 'empty path'],
  [null, {}, 'EMPTY_PATH', false, 'null path'],
];

let pass = 0, fail = 0;
for (const [p, ctx, expectedPolicy, expectedReq, label] of cases) {
  const r = checkPathPolicy(p, ctx);
  const actualPolicy = r.ok ? 'AUTO_ALLOWED' : (r.requiresApproval ? 'REQUIRES_APPROVAL' : (r.reason || 'UNKNOWN'));
  const actualReq = !!r.requiresApproval;
  const okMatch = actualPolicy === expectedPolicy && actualReq === expectedReq;
  if (okMatch) { pass++; console.log('  PASS |', label); }
  else { fail++; console.log('  FAIL |', label, '| got=', actualPolicy, 'requires=', actualReq, '| expect=', expectedPolicy, 'requires=', expectedReq); }
}
console.log(`---`);
console.log(`[checkPathPolicy] ${pass}/${pass+fail} pass`);

console.log('');
console.log('=== isPathAllowed 向后兼容 ===');
console.log('  isPathAllowed(Documents/a.png, cwd) →', JSON.stringify(isPathAllowed(path.join(home, 'Documents', 'a.png'), { cwd })));
console.log('  isPathAllowed(Pictures/xjl.png, cwd) →', JSON.stringify(isPathAllowed(path.join(home, 'Pictures', 'xjl.png'), { cwd })));
console.log('  isPathAllowed(.ssh/id_rsa, cwd)     →', JSON.stringify(isPathAllowed(path.join(home, '.ssh', 'id_rsa'), { cwd })));

(async () => {
  console.log('');
  console.log('=== describeImage 三态透传 ===');
  const r1 = await describeImage(path.join(home, 'Documents', 'a.png'), { cwd });
  console.log('  describeImage(Documents)   →', JSON.stringify({ ok: r1.ok, error: r1.error, requires_approval: r1.requires_approval, policy: r1.policy }));
  const r2 = await describeImage(path.join(home, '.ssh', 'id_rsa.png'), { cwd });
  console.log('  describeImage(.ssh)         →', JSON.stringify({ ok: r2.ok, error: r2.error, requires_approval: r2.requires_approval, policy: r2.policy }));
  const r3 = await describeImage(path.join(home, 'Pictures', 'xjl.png'), { cwd });
  console.log('  describeImage(Pictures/真xjl) →', JSON.stringify({ ok: r3.ok, requires_approval: r3.requires_approval, mime: r3?.mime, size: r3?.size }));
  process.exit(fail > 0 ? 1 : 0);
})();
