// ACMS 内建工具 — Agent Git 工具
// 让 agent 能在 workspace 里执行 git 操作：commit、diff、status、log、branch
const { registerTool } = require('../../services/tool-registry');

registerTool({
  name: 'agent_git_status',
  description: 'Show the working tree status — which files are modified, staged, or untracked. Returns git status output.',
  parameters: {
    type: 'object',
    properties: {
      cwd: { type: 'string', description: 'Working directory relative to workspace root (optional, defaults to workspace root)' },
    },
    required: [],
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
      cmd: 'git status --porcelain',
      cwd: args.cwd || '',
      timeout: 10000,
    });
    return {
      ok: result.exitCode === 0,
      output: (result.stdout || '').slice(0, 5000),
      error: (result.stderr || '').slice(0, 1000),
    };
  },
});

registerTool({
  name: 'agent_git_diff',
  description: 'Show changes between working tree and last commit, or between commits. Use to review what was modified before committing.',
  parameters: {
    type: 'object',
    properties: {
      staged: { type: 'boolean', description: 'If true, show staged changes (git diff --cached). If false (default), show unstaged changes.', default: false },
      file: { type: 'string', description: 'Optional: show diff for a specific file path (relative to workspace root).' },
    },
    required: [],
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!projectId) return { error: 'NO_PROJECT_ID' };
    const projectStore = require('../../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { error: 'PROJECT_NOT_FOUND' };
    const slug = project.slug || project.name;
    const workspace = require('../../services/workspace-service');
    let cmd = 'git diff';
    if (args.staged) cmd = 'git diff --cached';
    if (args.file) cmd += ' -- ' + args.file;
    const result = await workspace.exec(slug, {
      cmd,
      cwd: args.cwd || '',
      timeout: 10000,
    });
    return {
      ok: result.exitCode === 0,
      output: (result.stdout || '').slice(0, 10000),
      error: (result.stderr || '').slice(0, 1000),
    };
  },
});

registerTool({
  name: 'agent_git_commit',
  description: 'Stage all modified files and create a commit with the given message. Returns commit hash and summary.',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Commit message (required). Use descriptive messages like "Fix: add renderGrid call in game.js".' },
      files: { type: 'array', items: { type: 'string' }, description: 'Optional: specific files to stage. If empty, stages all modified files.' },
    },
    required: ['message'],
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!projectId) return { error: 'NO_PROJECT_ID' };
    const projectStore = require('../../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { error: 'PROJECT_NOT_FOUND' };
    const slug = project.slug || project.name;
    const workspace = require('../../services/workspace-service');
    const lines = [];
    if (args.files && args.files.length > 0) {
      for (const f of args.files) {
        const r = await workspace.exec(slug, { cmd: 'git add ' + f, timeout: 5000 });
        lines.push('git add: exit=' + r.exitCode);
      }
    } else {
      const r = await workspace.exec(slug, { cmd: 'git add -A', timeout: 5000 });
      lines.push('git add -A: exit=' + r.exitCode);
    }
// ⚠️ Shell 单引号字符串内无法 escape 单引号 (`\` 是字面字符, 不是转义)
    //    历史 bug (T-MRKP19DR 2026-07-14): .replace(/'/g, "\\'") 在 cmd.exe+MSYS2 bash 双层解析下
    //    会破坏引号结构, 导致 message 含 ' (如 `base: './'`) 时 git 报 "error: pathspec 'xxx'"
    //    Node spawn 在 Windows 默认用 cmd.exe (单引号按字面传), 然后 git.exe 内部用 MSYS2 bash
    //    解析, `\'` 在 bash 单引号字符串内 broken → 拆散 message → 多个 token 被 git 当 pathspec
    //
    //    修复 (v0.46): 写临时文件 + `git commit -F <msgfile>` (方案 B)
    //    彻底绕开 shell quoting 问题, 支持任意特殊字符 (', `, $, \, ", \n)
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const msgFile = path.join(os.tmpdir(), `acms-commit-msg-${Date.now()}-${Math.random().toString(36).slice(2,8)}.txt`);
    fs.writeFileSync(msgFile, args.message || '', 'utf8');
    let commitResult;
    try {
      commitResult = await workspace.exec(slug, {
        cmd: `git commit -F "${msgFile}"`,
        timeout: 10000,
      });
    } finally {
      try { fs.unlinkSync(msgFile); } catch (e) { /* ignore cleanup error */ }
    }
    lines.push('git commit: exit=' + commitResult.exitCode);
    lines.push('output: ' + (commitResult.stdout || '').slice(0, 500));
    if (commitResult.stderr) lines.push('stderr: ' + commitResult.stderr.slice(0, 500));

    // v0.X: 解析 commit hash — agent 不需要再调 git_log 确认
    let commitHash = null;
    if (commitResult.exitCode === 0) {
      const hashResult = await workspace.exec(slug, { cmd: 'git rev-parse HEAD', timeout: 5000 });
      if (hashResult.exitCode === 0) {
        commitHash = (hashResult.stdout || '').trim().split('\n')[0];
      }
      // 顺便拿到 commit 摘要（files changed + short stat）
      const statResult = await workspace.exec(slug, { cmd: 'git show --stat --format="" HEAD', timeout: 5000 });
      lines.push('files changed:\n' + (statResult.stdout || '').slice(0, 1000));
    }

    return {
      ok: commitResult.exitCode === 0,
      commitHash,  // ← 关键：agent 拿这个当"commit 真的发生了"的信号
      shortHash: commitHash ? commitHash.slice(0, 7) : null,
      message: commitResult.stdout ? commitResult.stdout.split('\n')[0] : (msg || ''),
      steps: lines.join('\n'),
    };
  },
});

registerTool({
  name: 'agent_git_log',
  description: 'Show commit log. Use to understand recent changes and find commit hashes.',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'integer', description: 'Number of commits to show (default: 10).', default: 10 },
      file: { type: 'string', description: 'Optional: show log for a specific file.' },
    },
    required: [],
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!projectId) return { error: 'NO_PROJECT_ID' };
    const projectStore = require('../../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { error: 'PROJECT_NOT_FOUND' };
    const slug = project.slug || project.name;
    const workspace = require('../../services/workspace-service');
    let cmd = 'git log --oneline -' + (args.limit || 10);
    if (args.file) cmd += ' -- ' + args.file;
    const result = await workspace.exec(slug, {
      cmd,
      timeout: 10000,
    });
    return {
      ok: result.exitCode === 0,
      output: (result.stdout || '').slice(0, 5000),
    };
  },
});

registerTool({
  name: 'agent_git_branch',
  description: 'List branches or create a new branch. Use before making changes to isolate your work.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'create'], description: 'Action to perform.', default: 'list' },
      name: { type: 'string', description: 'Branch name (required when action=create). Format: feature/xxx or fix/xxx.' },
    },
    required: [],
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!projectId) return { error: 'NO_PROJECT_ID' };
    const projectStore = require('../../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { error: 'PROJECT_NOT_FOUND' };
    const slug = project.slug || project.name;
    const workspace = require('../../services/workspace-service');
    if (args.action === 'create') {
      const result = await workspace.exec(slug, {
        cmd: 'git checkout -b ' + args.name,
        timeout: 10000,
      });
      return {
        ok: result.exitCode === 0,
        output: (result.stdout || result.stderr || '').slice(0, 500),
      };
    }
    const result = await workspace.exec(slug, {
      cmd: 'git branch',
      timeout: 10000,
    });
    return {
      ok: result.exitCode === 0,
      output: (result.stdout || '').slice(0, 5000),
    };
  },
});

console.log('[tools] Git 工具注册完成: agent_git_status, agent_git_diff, agent_git_commit, agent_git_log, agent_git_branch');
