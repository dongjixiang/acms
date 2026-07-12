// ACMS Agent 工具 — 隔离工作区（v0.45）
// 让 agent 在独立的 scratch 目录中工作，避免多 agent 互相覆盖

const { registerTool } = require('../../services/tool-registry');
const workspaceService = require('../../services/workspace-service');

registerTool({
  name: 'workspace_isolate',
  description: 'Create an isolated scratch workspace for this agent session. '
    + 'Copies the project workspace to a temporary directory. All file operations '
    + 'should use relative paths from the scratch root. When done, call workspace_merge '
    + 'to merge changes back to the main workspace.',
  parameters: {
    type: 'object',
    properties: {
      agentId: { type: 'string', description: 'Agent ID for isolation naming' },
    },
    required: ['agentId'],
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!projectId) return { error: 'NO_PROJECT_ID' };
    if (!args.agentId) return { error: 'NO_AGENT_ID' };

    try {
      const scratch = workspaceService.createScratchWorkspace(args.agentId, projectId);
      return {
        ok: true,
        message: `Scratch workspace created at ${scratch.workspacePath}`,
        workspacePath: scratch.workspacePath,
        agentId: args.agentId,
        projectId,
      };
    } catch (e) {
      return { error: 'ISOLATION_FAILED', message: e.message };
    }
  },
});

registerTool({
  name: 'workspace_merge',
  description: 'Merge changes from scratch workspace back to the main project workspace. '
    + 'Copies all modified files from the scratch directory to the project workspace.',
  parameters: {
    type: 'object',
    properties: {
      workspacePath: { type: 'string', description: 'Path to the scratch workspace' },
      projectId: { type: 'string', description: 'Project slug' },
    },
    required: ['workspacePath', 'projectId'],
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!args.workspacePath || !args.projectId) {
      return { error: 'MISSING_ARGS' };
    }

    try {
      const fs = require('fs');
      const path = require('path');
      const mainWs = path.join(workspaceService.WORKSPACE_ROOT || path.join(__dirname, '..', '..', 'workspaces'), args.projectId);

      // 递归复制 scratch → main workspace
      function mergeRecursive(src, dest) {
        if (!fs.existsSync(src)) return;
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          if (entry.isDirectory()) {
            mergeRecursive(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        }
      }

      mergeRecursive(args.workspacePath, mainWs);

      // 清理 scratch
      try { fs.rmSync(args.workspacePath, { recursive: true, force: true }); } catch (_) {}

      return {
        ok: true,
        message: `Changes merged from ${args.workspacePath} to ${mainWs}`,
      };
    } catch (e) {
      return { error: 'MERGE_FAILED', message: e.message };
    }
  },
});
