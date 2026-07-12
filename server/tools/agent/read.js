// ACMS 内建工具 — Agent 只读工具（3 工具）
// 原 tools/index.js 317-411 行提取
// v0.23 L3 拆分：agent 工具放独立子目录，按权限分文件（read.js 只读 / write.js 有副作用）
//   context 由 agent-execute 端点注入（含 projectId）
//   workspace 已有沙箱安全（path traversal / 越界访问均被拦截）
const { registerTool } = require('../../services/tool-registry');
const readCache = require('./read-cache');

registerTool({
  name: 'agent_read_file',
  description: 'Read a file from the project workspace. Returns file content as text (truncated to 100000 chars for large files). Use this to understand existing code, configs, or documentation in the project. If the file is truncated, use offset/limit or agent_exec_command with head/tail or sed to view the rest.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative file path in the project workspace (e.g. "README.md", "code/server.js", "requirements/req-001.md")' },
      offset: { type: 'number', description: 'Line number to start reading from (0-indexed). Useful for large files.' },
      limit: { type: 'number', description: 'Maximum number of lines to read (default: all lines). Useful for large files.' },
    },
    required: ['path'],
  },
  async handler(args, ctx = {}) {
    const { projectId, taskId } = ctx;
    if (!projectId) return { error: 'NO_PROJECT_ID', message: 'Tool context missing projectId' };

    // P0 v0.X: 缓存命中直接返回，避免 39 次 read_file 重复 IO
    //   T-MRGDBST1 实测：GameLoop.js 读 4 次、app/game.js 读 3 次，纯浪费
    //   agent_write_file / patch_file 会调 readCache.invalidate()，所以缓存不会过时
    const cached = readCache.get(taskId, args.path, args.offset, args.limit);
    if (cached) return cached;

    const projectStore = require('../../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { error: 'PROJECT_NOT_FOUND' };
    const slug = project.slug || project.name;
    const workspace = require('../../services/workspace-service');
    const content = workspace.readFile(slug, args.path);
    if (content === null) {
      // 不缓存 NOT_FOUND（写文件后必须能被发现）
      return { error: 'FILE_NOT_FOUND', path: args.path, notFound: true };
    }

    // v0.45: 支持 offset/limit 让 LLM 读指定行范围（避免大文件浪费 token）
    let selectedContent = content;
    let viewStart = 0;
    let viewEnd = content.length;
    if (typeof args.offset === 'number' || typeof args.limit === 'number') {
      // 按行分割
      const lines = content.split('\n');
      const offset = typeof args.offset === 'number' ? Math.max(0, args.offset) : 0;
      const limit = typeof args.limit === 'number' ? Math.max(1, args.limit) : lines.length;
      const selectedLines = lines.slice(offset, offset + limit);
      selectedContent = selectedLines.join('\n');
      viewStart = offset;
      viewEnd = Math.min(lines.length, offset + limit);
    }

    // v0.45: 8000→50000 — 让 LLM 能一次性看到完整文件，不用分批 read + sed tail
    // v0.45.1: 50000→100000 — 大文件支持更广
    const maxLen = 100000;
    const finalContent = selectedContent.length > maxLen
      ? selectedContent.substring(0, maxLen) + '\n... [truncated at 100000 chars, use offset/limit or agent_exec_command tail/sed to view rest]'
      : selectedContent;

    // P0 v0.X: 把缓存写入挪到 return 之前 — cache.set 自动跳过 error 结果
    const result = {
      path: args.path,
      content: finalContent,
      totalLength: content.length,
      totalLines: content.split('\n').length,
      viewedLines: args.offset !== undefined || args.limit !== undefined
        ? `${viewStart + 1}-${viewEnd}`
        : `1-${content.split('\n').length}`,
      truncated: selectedContent.length > maxLen,
      _cacheHit: false,
    };
    readCache.set(taskId, args.path, args.offset, args.limit, result);
    return result;
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

// v0.45: 批量读多个文件 — 让 LLM 一次获取多个相关文件的完整内容
//   节省 N 个 read 调用 → N 个 round 变成 1 个 round
registerTool({
  name: 'agent_read_files',
  description: 'Read multiple files in one call. Returns each file\'s content concatenated. '
    + 'Use this to explore related files (e.g. all files in src/core/) in a single round instead of '
    + 'calling agent_read_file multiple times. Each file is truncated to 100000 chars.',
  parameters: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        description: 'Array of relative file paths to read',
        items: { type: 'string' },
      },
    },
    required: ['paths'],
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!projectId) return { error: 'NO_PROJECT_ID' };
    if (!Array.isArray(args.paths) || args.paths.length === 0) {
      return { error: 'NO_PATHS', message: 'paths must be a non-empty array' };
    }
    if (args.paths.length > 20) {
      return { error: 'TOO_MANY_PATHS', message: 'Maximum 20 paths per call. Split into multiple calls.' };
    }
    const projectStore = require('../../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { error: 'PROJECT_NOT_FOUND' };
    const slug = project.slug || project.name;
    const workspace = require('../../services/workspace-service');

    const results = [];
    const maxLen = 100000;
    for (const path of args.paths) {
      try {
        const content = workspace.readFile(slug, path);
        if (content === null || content === undefined) {
          results.push({ path, ok: false, error: 'FILE_NOT_FOUND' });
          continue;
        }
        const finalContent = content.length > maxLen
          ? content.substring(0, maxLen) + '\n... [truncated at 100000 chars]'
          : content;
        results.push({
          path,
          ok: true,
          content: finalContent,
          totalLength: content.length,
          totalLines: content.split('\n').length,
          truncated: content.length > maxLen,
        });
      } catch (e) {
        results.push({ path, ok: false, error: e.message });
      }
    }

    return {
      totalFiles: args.paths.length,
      successCount: results.filter(r => r.ok).length,
      failedCount: results.filter(r => !r.ok).length,
      files: results,
    };
  },
});

// v0.45: 目录摘要 — 一次列出目录下所有文件的元信息和前几行
//   LLM 想知道"这个目录有啥"时用，比 list_files + 逐个 read 省 80% 轮次
registerTool({
  name: 'agent_read_dir_summary',
  description: 'Get a summary of all files in a directory: name, size, line count, and first N lines of each file. '
    + 'Use this to quickly understand a directory\'s contents without reading each file fully.',
  parameters: {
    type: 'object',
    properties: {
      dir: { type: 'string', description: 'Relative directory path (e.g. "src/core"). Empty string = workspace root.', default: '' },
      previewLines: { type: 'number', description: 'Number of preview lines per file (default 10)', default: 10 },
      maxFiles: { type: 'number', description: 'Maximum number of files to include (default 30)', default: 30 },
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

    const allFiles = workspace.listFiles(slug, { showAll: false });
    const dir = args.dir || '';
    const files = allFiles
      .filter(f => dir === '' || f.path.startsWith(dir + '/'))
      .slice(0, args.maxFiles || 30);

    const previewLines = args.previewLines || 10;
    const summaries = [];
    for (const f of files) {
      try {
        const content = workspace.readFile(slug, f.path);
        if (content === null) continue;
        const lines = content.split('\n');
        summaries.push({
          path: f.path,
          size: f.size,
          totalLines: lines.length,
          preview: lines.slice(0, previewLines).join('\n'),
        });
      } catch (e) { /* skip */ }
    }

    return {
      dir: dir || '(workspace root)',
      totalFiles: summaries.length,
      previewLines,
      files: summaries,
    };
  },
});
