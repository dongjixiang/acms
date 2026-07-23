// ACMS Regression Test — agent_git_commit shell escape bug (T-MRKP19DR)
// 测试 commit message 含特殊字符时 git commit 仍能成功
//
// 历史 bug (2026-07-14, T-MRKP19DR): git.js:100 用 .replace(/'/g, "\\'") 在单引号包裹的 cmd
// 里破坏引号结构, 导致含 ' ` $ \ 的 commit 失败 (error: pathspec 'X')
//
// 修复 (v0.46): 写临时文件 + git commit -F <msgfile>, 彻底绕开 shell quoting
//
// 运行: node test-agent-git-commit-regression.js

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const results = [];

async function runGit(cwd, cmd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, [], { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d.toString());
    child.stderr.on('data', d => stderr += d.toString());
    child.on('close', (code) => resolve({ exitCode: code, stdout, stderr }));
  });
}

async function setupTestRepo() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'acms-git-test-'));
  // init repo
  await runGit(tmpRoot, 'git init -q -b main');
  await runGit(tmpRoot, 'git config user.email "test@acms.local"');
  await runGit(tmpRoot, 'git config user.name "ACMS Test"');
  // commit-override so git status never blocks
  fs.writeFileSync(path.join(tmpRoot, 'README.md'), '# ACMS Regression Test\n');
  await runGit(tmpRoot, 'git add README.md');
  await runGit(tmpRoot, 'git commit -q -m "init"');
  return tmpRoot;
}

// Mimic git.js agent_git_commit logic (post-P0 fix, method B -F file)
async function commitMessage(repoDir, message) {
  const msgFile = path.join(os.tmpdir(), `acms-commit-msg-${Date.now()}-${Math.random().toString(36).slice(2,8)}.txt`);
  fs.writeFileSync(msgFile, message, 'utf8');
  try {
    // Simulate "git add -A" by touching a dummy file (so there's always something to commit)
    const dummyPath = path.join(repoDir, '.acms-test-dummy');
    fs.writeFileSync(dummyPath, `trigger ${Date.now()}\n`);
    await runGit(repoDir, 'git add -A');
    // The actual test target:
    const result = await runGit(repoDir, `git commit -F "${msgFile}"`);
    return result;
  } finally {
    try { fs.unlinkSync(msgFile); } catch (e) {}
  }
}

async function getLastCommitMessage(repoDir) {
  const r = await runGit(repoDir, 'git log -1 --format=%B');
  return r.stdout.trim();
}

async function testCase(name, message) {
  const repoDir = await setupTestRepo();
  const result = await commitMessage(repoDir, message);
  const stored = await getLastCommitMessage(repoDir);

  // Cleanup
  try {
    fs.rmSync(repoDir, { recursive: true, force: true });
  } catch (e) {}

  const success = result.exitCode === 0 && stored === message.trim();
  if (success) {
    pass++;
    results.push(`✅ ${name}`);
    console.log(`✅ PASS: ${name}`);
  } else {
    fail++;
    results.push(`❌ ${name}`);
    console.log(`❌ FAIL: ${name}`);
    console.log(`   exit: ${result.exitCode}, stderr: ${result.stderr.slice(0, 200)}`);
    console.log(`   expected: ${JSON.stringify(message.trim().slice(0, 100))}`);
    console.log(`   got:      ${JSON.stringify(stored.slice(0, 100))}`);
  }
}

(async () => {
  console.log('===== ACMS agent_git_commit Regression Test (T-MRKP19DR) =====\n');

  // 1. 原始 bug case
  await testCase(
    'T-MRKP19DR exact message (含 single quotes + backticks)',
    "Fix: set relative base in vite config and fix syntax error in RelationOverlay.tsx\n\n- Set `base: './'` in vite.config.ts so assets resolve correctly under sub-path deployments (e.g. /preview/<uuid>/dist/)"
  );

  // 2. Pure ASCII
  await testCase(
    'simple ASCII message',
    'feat: add user authentication module'
  );

  // 3. Single quote (the main bug)
  await testCase(
    "single quote: don't",
    "Fix: don't break on empty list"
  );

  // 4. Backticks
  await testCase(
    'backticks (code spans)',
    'Refactor: rename `oldFn` to `newFn` for clarity'
  );

  // 5. Dollar sign
  await testCase(
    'dollar sign (variable reference)',
    'Fix: use $HOME instead of hardcoded path'
  );

  // 6. Double quotes
  await testCase(
    'double quotes',
    'Add "feature X" with proper escaping'
  );

  // 7. Backslash
  await testCase(
    'backslash (Windows path)',
    'fix: handle C:\\Users\\test path correctly'
  );

  // 8. Mixed special chars
  await testCase(
    'mixed special chars',
    "fix: don't use $HOME, prefer `process.env.HOME` with \\ escaping"
  );

  // 9. Multiline + special chars
  await testCase(
    'multiline + special chars',
    "feat: comprehensive commit\n\n- Don't repeat mistakes\n- Use `safe escapes`\n- Reference $VAR when needed"
  );

  // 10. Empty-ish message (just whitespace + newline)
  await testCase(
    'minimal message',
    'x'
  );

  // Summary
  console.log('\n===== Summary =====');
  results.forEach(r => console.log('  ' + r));
  console.log(`\nTotal: ${pass + fail}, Pass: ${pass}, Fail: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
})();