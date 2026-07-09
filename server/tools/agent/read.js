// ACMS 内建工具 — Agent 只读工具（3 工具）
// 原 tools/index.js 317-411 行提取
// v0.23 L3 拆分：agent 工具放独立子目录，按权限分文件（read.js 只读 / write.js 有副作用）
//   context 由 agent-execute 端点注入（含 projectId）
//   workspace 已有沙箱安全（path traversal / 越界访问均被拦截）
const { registerTool } = require('../../services/tool-registry');

registerTool({
  name: 'agent_read_file',
  description: 'Read a file from the project workspace. Returns file content as text (truncated to 8000 chars for large files). Use this to understand existing code, configs, or documentation in the project.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative file path in the project workspace (e.g. "README.md", "code/server.js", "requirements/req-001.md")' },
    },
    required: ['path'],
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!projectId) return { error: 'NO_PROJECT_ID', message: 'Tool context missing projectId' };
    const projectStore = require('../../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { error: 'PROJECT_NOT_FOUND' };
    const slug = project.slug || project.name;
    const workspace = require('../../services/workspace-service');
    const content = workspace.readFile(slug, args.path);
    if (content === null) return { error: 'FILE_NOT_FOUND', path: args.path };
    const maxLen = 8000;
    return {
      path: args.path,
      content: content.length > maxLen ? content.substring(0, maxLen) + '\n... [truncated]' : content,
      totalLength: content.length,
      truncated: content.length > maxLen,
    };
  },
});

registerTool({
  name: 'agent_list_files',
  description: 'List all files in the project workspace (recursive tree). Returns file name, relative path, size, and type for each file. Use this to understand project structure before reading specific files.',
  parameters: {
    type: 'object',
    properties: {
      showAll: { type: 'boolean', description: 'If true, include hidden/build files (node_modules, .git, etc.)', default: false },
    },
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!projectId) return { error: 'NO_PROJECT_ID' };
    const projectStore = require('../../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { error: 'PROJECT_NOT_FOUND' };
    const slug = project.slug || project.name;
    const workspace = require('../../services/workspace-service');
    const files = workspace.listFiles(slug, { showAll: args.showAll || false });
    return { totalFiles: files.length, files: files.slice(0, 100) };
  },
});

registerTool({
  name: 'agent_search_files',
  description: 'Search for a text pattern across all files in the project workspace. Returns matching file paths, line numbers, and line content. Use this to find where specific functions, variables, or keywords are used.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Text or regex pattern to search for (case-insensitive)' },
      maxResults: { type: 'number', description: 'Maximum number of matches to return (default 20)', default: 20 },
    },
    required: ['pattern'],
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!projectId) return { error: 'NO_PROJECT_ID' };
    const projectStore = require('../../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { error: 'PROJECT_NOT_FOUND' };
    const slug = project.slug || project.name;
    const workspace = require('../../services/workspace-service');
    const files = workspace.listFiles(slug, {});
    const results = [];
    const maxResults = args.maxResults || 20;
    let regex;
    try {
      regex = new RegExp(args.pattern, 'i');
    } catch {
      regex = new RegExp(args.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
    for (const file of files) {
      if (results.length >= maxResults) break;
      const content = workspace.readFile(slug, file.path);
      if (!content) continue;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (results.length >= maxResults) break;
        if (regex.test(lines[i])) {
          results.push({ file: file.path, line: i + 1, content: lines[i].trim().substring(0, 200) });
        }
      }
    }
    return { pattern: args.pattern, totalMatches: results.length, results };
  },
});
