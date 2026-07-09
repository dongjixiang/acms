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
    + 'Content must be valid UTF-8 text. For code files, ensure syntax is correct before writing.',
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
    if (!args.path) return { error: 'NO_PATH' };
    if (args.content === undefined || args.content === null) return { error: 'NO_CONTENT' };
    const projectStore = require('../../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { error: 'PROJECT_NOT_FOUND' };
    const slug = project.slug || project.name;
    const workspace = require('../../services/workspace-service');
    try {
      const result = workspace.writeFile(slug, args.path, args.content);
      return {
        ok: true,
        path: result.path,
        size: result.size,
        message: `File written: ${args.path} (${result.size} bytes)`,
      };
    } catch (e) {
      return { error: 'WRITE_FAILED', message: e.message };
    }
  },
});
