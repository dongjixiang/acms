// v0.46: 内置 hook — 写 .ts/.tsx 文件后自动跑 tsc --noEmit
//   防 LLM 写完 TS 文件不跑类型检查就 submit
//   参考 Claude Code PostToolUse hook
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { registerHook } = require('../services/hook-registry');

registerHook('PostToolUse', 'auto-typescheck-on-write', async ({ toolName, args, result, ctx }) => {
  if (toolName !== 'agent_write_file') return { result };
  const filePath = args.path || '';
  if (!/\.(ts|tsx)$/.test(filePath)) return { result };

  // 找 tsconfig.json
  const projectRoot = ctx.projectRoot || process.cwd();
  const tsconfig = path.join(projectRoot, 'tsconfig.json');
  const jsconfig = path.join(projectRoot, 'jsconfig.json');
  let configFlag = '';
  if (fs.existsSync(tsconfig)) configFlag = '-p tsconfig.json';
  else if (fs.existsSync(jsconfig)) configFlag = '-p jsconfig.json';
  else return { result };  // 没有 TS 项目配置，跳过

  return new Promise((resolve) => {
    execFile('npx', ['--no-install', 'tsc', '--noEmit', ...(configFlag ? configFlag.split(' ') : [])], {
      cwd: projectRoot,
      timeout: 30000,
      shell: true,
    }, (err, stdout, stderr) => {
      const exitCode = err ? err.code || 1 : 0;
      const typescheckResult = {
        typescheck: {
          ran: true,
          exitCode,
          stdout: (stdout || '').slice(0, 2000),
          stderr: (stderr || '').slice(0, 2000),
          ok: exitCode === 0,
        },
      };
      // 合并进 write_file result（不覆盖原 ok/path 等字段）
      const merged = { ...(typeof result === 'object' ? result : { value: result }), ...typescheckResult };
      if (exitCode !== 0) {
        merged.warning = `⚠️ TypeScript errors detected. Run agent_typescheck for details.`;
      }
      console.log(`[hook:auto-typescheck] ${filePath}: ${exitCode === 0 ? '✅ PASS' : `❌ ${exitCode}`}`);
      resolve({ result: merged });
    });
  });
});