// ACMS · v0.23 防 agent 撒谎 单元测试
// 临时文件，跑完删
const aiTools = require('./server/services/ai-tools-service');
const { extractClaimedFiles, auditAgentClaims } = aiTools;
const projectStore = require('./server/stores/project-store');
const workspace = require('./server/services/workspace-service');
const fs = require('fs');
let pass = 0, fail = 0;
function check(cond, msg) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗', msg); }
}

console.log('===== Test 1: extractClaimedFiles basic =====');
const r1 = extractClaimedFiles('I wrote README.md and added docs/api.md, then modified code/server.js.');
console.log('  Extracted:', r1);
check(r1.includes('README.md'), 'README.md');
check(r1.includes('docs/api.md'), 'docs/api.md');
check(r1.includes('code/server.js'), 'code/server.js');

console.log('\n===== Test 2: filter URLs / absolute paths =====');
const r2 = extractClaimedFiles('Visit https://example.com/test.html for details. Read /etc/passwd. Fixed .config file.');
console.log('  Extracted:', r2);
check(!r2.some(p => p.startsWith('https:')), 'no URLs');
check(!r2.some(p => p.startsWith('/')), 'no abs paths');

console.log('\n===== Test 3: empty / null =====');
check(Array.isArray(extractClaimedFiles(null)) && extractClaimedFiles(null).length === 0, 'null → []');
check(Array.isArray(extractClaimedFiles('')) && extractClaimedFiles('').length === 0, 'empty → []');

console.log('\n===== Test 4: real workspace — write + verify =====');
const sanguo = projectStore.getById('proj_sanguo');
console.log('  sanguo:', sanguo ? sanguo.slug : 'NOT FOUND');
workspace.writeFile('sanguo', 'docs/agent-test-claim.md', 'Hello from agent test');
const a1 = auditAgentClaims('proj_sanguo', 'I wrote `docs/agent-test-claim.md`');
console.log('  audit:', a1);
check(a1.verifiedCount === 1, 'verifiedCount=1');
check(a1.missingCount === 0, 'missingCount=0');

console.log('\n===== Test 5: claim nonexistent file → fail =====');
const a2 = auditAgentClaims('proj_sanguo', 'I wrote docs/agent-test-claim.md and also wrote docs/GHOST.md that does not exist');
console.log('  audit:', a2);
check(a2.verifiedCount === 1, 'verifiedCount=1');
check(a2.missingCount === 1, 'missingCount=1');
check(a2.missingFiles[0].path === 'docs/GHOST.md', 'GHOST.md missing');

console.log('\n===== Test 6: analyze scenario summary from problematic task =====');
const sampleAnalysis = `
Task completed successfully.
I wrote the following files:
- \`docs/setup.md\` — installation guide
- \`scripts/deploy.sh\` — deployment script
Also modified:
- code/server.js
- requirements/README.md
Verification: node --check passed.
`;
const r6 = extractClaimedFiles(sampleAnalysis);
console.log('  Extracted from sample analysis:', r6);
check(r6.length >= 4, 'extracted >=4 claimed files');

console.log('\n===== Cleanup =====');
try { fs.unlinkSync('C:/Users/swede/acms/workspaces/sanguo/docs/agent-test-claim.md'); console.log('  cleaned test file'); } catch {}

console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
