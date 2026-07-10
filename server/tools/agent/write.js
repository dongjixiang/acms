// ACMS 内建工具 — Agent 写入/执行工具（2 工具）
// 原 tools/index.js 413-481 行提取
// v0.23 L3 拆分：agent 工具按权限分文件 — read.js (只读) / write.js (有副作用)
// ⚠️ 安全提示：write.js 内的工具会修改工作区文件或执行 shell 命令
//   所有安全约束依赖 services/workspace-service.js 的沙箱实现
const { registerTool } = require('../../services/tool-registry');

registerTool({
  name: 'agent_exec_command',
  description: 'Execute a shell command in the project workspace (sandboxed). Allowed commands: node, npm, npx, python, git, ls, cat, echo, etc. Returns stdout, stderr, and exit code. Use for running tests, checking syntax (node --check), viewing git log, listing directories, etc.',
  parameters: {
    type: 'object',
    properties: {
      cmd: { type: 'string', description: 'Command to execute (e.g. "node --check code/server.js", "git log --oneline -5", "ls -la")' },
      cwd: { type: 'string', description: 'Working directory relative to workspace root (optional)' },
    },
    required: ['cmd'],
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!projectId) return { error: 'NO_PROJECT_ID' };
    const projectStore = require('../../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { error: 'PROJECT_NOT_FOUND' };
    const slug = project.slug || project.name;
    const workspace = require('../../services/workspace-service');
    const result = await workspace.exec(slug, {
      cmd: args.cmd,
      cwd: args.cwd || '',
      timeout: 30000,
    });
    return {
      exitCode: result.exitCode,
      stdout: (result.stdout || '').substring(0, 5000),
      stderr: (result.stderr || '').substring(0, 2000),
    };
  },
});

// v0.23 Phase 2: 写文件工具 — 让 LLM 能创建/修改工作区文件
registerTool({
  name: 'agent_write_file',
  description: 'Write or overwrite a file in the project workspace. Creates parent directories if needed. '
    + 'Use this to create new files (docs, configs, code) or modify existing ones. '
    + 'Content must be valid UTF-8 text. For code files, ensure syntax is correct before writing. '
    + 'IMPORTANT: always pass `path` (relative path from workspace root) AND `content` (full file body). '
    + 'When overwriting an existing file, the new content must preserve existing methods/imports unless explicitly rewriting the whole module.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative file path in the project workspace (e.g. "README.md", "code/server.js", "docs/design.md")' },
      content: { type: 'string', description: 'Full file content to write (will overwrite existing file)' },
    },
    required: ['path', 'content'],
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!projectId) return { error: 'NO_PROJECT_ID', message: 'Tool context missing projectId' };
    // v0.26 fix (#2): NO_PATH 时给 LLM 明确提示，避免连续 NO_PATH 浪费轮次
    if (!args.path) return {
      error: 'NO_PATH',
      message: 'Missing required arg `path`. You must explicitly pass the relative file path every time you call this tool — the tool does not auto-remember the previous path. If you want to write to the same path as your last successful call, pass that path again.',
      hint: 'Example: agent_write_file({path: "src/core/GameState.js", content: "..."})',
    };
    if (args.content === undefined || args.content === null) return { error: 'NO_CONTENT', message: 'Missing required arg `content`.' };
    const projectStore = require('../../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { error: 'PROJECT_NOT_FOUND' };
    const slug = project.slug || project.name;
    const workspace = require('../../services/workspace-service');

    // v0.26 fix (#5): size 守卫 — 如果 overwrite 时新内容 < 当前文件 30%，警告 LLM 不要砍掉已有方法
    let previousSize = null;
    try {
      const existing = workspace.readFile(slug, args.path);
      if (existing !== null && existing !== undefined && existing.length > 0) {
        previousSize = existing.length;
        const newSize = (args.content || '').length;
        if (newSize < previousSize * 0.3 && previousSize > 200) {
          // v0.26: 不阻止写入，但注入 warning 让 LLM 自己决定是否继续
          console.warn(`[agent_write_file] ⚠️ ${args.path}: new content ${newSize}b is <30% of existing ${previousSize}b — possible content loss`);
        }
      }
    } catch {}

    try {
      const result = workspace.writeFile(slug, args.path, args.content);
      // v0.29 fix: 简洁 feedback — Hermes-style status / bytes / syntax check
      //   LLM 看一眼就懂成功状态，不用深挖嵌套对象
      let syntaxStatus = null;
      if (args.path.endsWith('.js') || args.path.endsWith('.mjs') || args.path.endsWith('.cjs')) {
        try {
          const syntaxCheck = await workspace.exec(slug, {
            cmd: `node --check "${args.path}"`,
            cwd: '',
            timeout: 10000,
          });
          syntaxStatus = syntaxCheck.exitCode === 0 ? 'OK' : `FAILED (exit ${syntaxCheck.exitCode}, ${(syntaxCheck.stderr || '').substring(0, 200)})`;
        } catch (e) {
          syntaxStatus = `EXEC_ERROR: ${e.message}`;
        }
      }
      const feedbackParts = [`wrote ${result.size} bytes to ${args.path}`];
      if (previousSize !== null) feedbackParts.push(`(was ${previousSize}b)`);
      if (syntaxStatus) feedbackParts.push(`syntax: ${syntaxStatus}`);
      return {
        ok: true,
        written: feedbackParts.join(' | '),
        path: result.path,
        size: result.size,
        previousSize,
        syntaxStatus,
        syntaxCheckError: syntaxStatus && syntaxStatus !== 'OK' ? syntaxStatus : undefined,
      };
    } catch (e) {
      return { ok: false, error: 'WRITE_FAILED', message: e.message };
    }
  },
});
