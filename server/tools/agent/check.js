// ACMS 内建工具 — Agent TypeScript 类型检查
// 在 workspace 里跑 tsc --noEmit 检测类型错误
const { registerTool } = require('../../services/tool-registry');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

registerTool({
  name: 'agent_typescheck',
  description: 'Run TypeScript type checking on the workspace. Auto-detects tsconfig.json or jsconfig.json. Uses tsc --noEmit (no output files produced). Only works in JS/TS projects with a tsconfig.json or jsconfig.json at the root. Use after writing TypeScript files to catch type errors before tests. '
    + '示例: agent_typescheck() — 全项目类型检查。 agent_typescheck({path: "src/game.ts"}) — 只检查特定文件。',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Optional: specific file or directory to check. Defaults to workspace root.' },
    },
    required: [],
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!projectId) return { ok: false, error: 'NO_PROJECT_ID' };

    const projectStore = require('../../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { ok: false, error: 'PROJECT_NOT_FOUND' };

    const slug = project.slug || project.name;
    const workspace = require('../../services/workspace-service');
    const projectRoot = workspace.getProjectRoot(slug);

    // 检测 tsconfig.json 或 jsconfig.json
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    const jsconfigPath = path.join(projectRoot, 'jsconfig.json');
    let configFile = null;

    if (fs.existsSync(tsconfigPath)) configFile = 'tsconfig.json';
    else if (fs.existsSync(jsconfigPath)) configFile = 'jsconfig.json';
    else {
      // 没 config 文件 → 尝试直接 tsc 看是否有 TS 文件
      const tsFiles = fs.existsSync(projectRoot)
        ? require('child_process').execSync(`node -e "const fs=require('fs'),p=require('path');function walk(d){let r=[];try{for(const f of fs.readdirSync(d)){const fp=p.join(d,f);const s=fs.statSync(fp);if(s.isDirectory()&&!['node_modules','.git','dist','build'].includes(f))r=r.concat(walk(fp));else if(/\\.(ts|tsx)$/.test(f))r.push(fp);}}catch(e){}return r;}console.log(walk(process.argv[1]).length)" "${projectRoot}"`, { encoding: 'utf-8', timeout: 5000 }).trim()
        : '0';

      if (parseInt(tsFiles) === 0) {
        return {
          ok: false,
          error: 'NO_TYPESCRIPT_PROJECT',
          message: 'No tsconfig.json/jsconfig.json found and no .ts/.tsx files in workspace. Use node --check for syntax checking.',
        };
      }

      configFile = 'tsconfig.json';  // 让 tsc 自己报错说缺 config
    }

    // 跑 tsc --noEmit
    const target = args.path || '';

    return new Promise((resolve) => {
      execFile('npx', ['--no-install', 'tsc', '--noEmit', ...(configFile ? ['-p', configFile] : []), ...(target ? [target] : [])], {
        cwd: projectRoot,
        timeout: 60000,
        maxBuffer: 1024 * 1024,
        shell: true,
      }, (err, stdout, stderr) => {
        const exitCode = err ? err.code || 1 : 0;
        resolve({
          ok: exitCode === 0,
          exitCode,
          configFile,
          target: target || '<workspace>',
          stdout: (stdout || '').slice(0, 5000),
          stderr: (stderr || '').slice(0, 5000),
          message: exitCode === 0
            ? `✅ TypeScript check passed (${configFile})`
            : `❌ TypeScript errors found (exit ${exitCode})`,
        });
      });
    });
  },
});
