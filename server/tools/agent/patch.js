// ACMS Agent 工具 — 补丁文件（v0.45）
// 让 LLM agent 能精准修改现有文件，不用 read → 重写整个文件
// 支持：indent-aware 匹配、multi-patch、语法验证

const { registerTool } = require('../../services/tool-registry');
// P0 v0.X: 改文件后失效 read_file 缓存
const readCache = require('./read-cache');
// P0 v0.X: 跨任务记忆
const workspaceMeta = require('../../services/workspace-meta');

// ===== 辅助函数 =====

/**
 * Normalize 空白字符：把连续空白（空格/Tab）压缩为单个空格
 * 用于 indent-aware 匹配
 */
function normalizeWhitespace(s) {
  return s.replace(/[ \t]+/g, ' ').replace(/\n/g, ' ').trim();
}

/**
 * 尝试 indent-aware 匹配：
 * 如果 exact match 失败，尝试忽略 old_string 前导空白差异后匹配
 */
function findPatchAnchor(content, oldString, options = {}) {
  const { indentAware = true, replaceAll = false } = options;

  // 先试精确匹配
  if (!replaceAll) {
    const idx = content.indexOf(oldString);
    if (idx !== -1) return { idx, matchType: 'exact' };
  } else {
    const indices = [];
    let searchFrom = 0;
    while (true) {
      const idx = content.indexOf(oldString, searchFrom);
      if (idx === -1) break;
      indices.push(idx);
      searchFrom = idx + oldString.length;
    }
    if (indices.length > 0) return { indices, matchType: 'exact' };
  }

  // indent-aware 匹配：忽略前导空白差异
  if (indentAware) {
    const normOld = normalizeWhitespace(oldString);
    const normContent = normalizeWhitespace(content);

    if (!replaceAll) {
      const idx = normContent.indexOf(normOld);
      if (idx !== -1) {
        // 需要映射回原始 content 的位置
        // 简单做法：用 char-by-char 映射
        let origIdx = 0;
        let normIdx = 0;
        while (normIdx < idx && origIdx < content.length) {
          if (/[\s]/.test(content[origIdx])) {
            // 跳过原始 content 中的空白
            while (origIdx < content.length && /[\s]/.test(content[origIdx])) origIdx++;
          } else {
            origIdx++;
          }
          normIdx++;
        }
        return { idx: origIdx, matchType: 'indent-ignored' };
      }
    } else {
      const indices = [];
      let searchFrom = 0;
      while (searchFrom < normContent.length) {
        const idx = normContent.indexOf(normOld, searchFrom);
        if (idx === -1) break;
        // 映射回原始位置
        let origIdx = 0;
        let normIdx = 0;
        while (normIdx < idx && origIdx < content.length) {
          if (/[\s]/.test(content[origIdx])) {
            while (origIdx < content.length && /[\s]/.test(content[origIdx])) origIdx++;
          } else {
            origIdx++;
          }
          normIdx++;
        }
        indices.push(origIdx);
        searchFrom = idx + normOld.length;
      }
      if (indices.length > 0) return { indices, matchType: 'indent-ignored' };
    }
  }

  return null;
}

/**
 * 应用单个 patch 到内容
 */
function applyPatch(content, oldString, newString, options = {}) {
  const { replaceAll = false, indentAware = true } = options;

  const result = findPatchAnchor(content, oldString, { indentAware, replaceAll });
  if (!result) {
    return { ok: false, error: 'ANCHOR_NOT_FOUND', hint: `old_string not found (matchType: ${result?.matchType || 'none'})` };
  }

  if (replaceAll) {
    // 批量替换
    let newContent = content;
    for (const idx of result.indices) {
      newContent = newContent.substring(0, idx) + newString + newContent.substring(idx + oldString.length);
    }
    return { ok: true, newContent, replacedCount: result.indices.length, matchType: result.matchType };
  } else {
    // 单次替换
    const idx = result.idx;
    const newContent = content.substring(0, idx) + newString + content.substring(idx + oldString.length);
    return { ok: true, newContent, replacedCount: 1, matchType: result.matchType };
  }
}

// ===== 工具注册 =====

registerTool({
  name: 'agent_patch_file',
  description: 'Apply a targeted patch to a file in the project workspace. '
    + 'Unlike agent_write_file (which overwrites the entire file), this only modifies the matched region. '
    + 'Supports indent-aware matching (ignores leading whitespace differences). '
    + 'For multiple patches in one file, use agent_multi_patch instead. '
    + 'Parameters: path (required), old_string (required, text to find), '
    + 'new_string (required, replacement text), replace_all (optional, default false). '
    + '示例: agent_patch_file({path: "src/server.js", old_string: "port: 3000", new_string: "port: 8080"}) — 把端口从 3000 改成 8080。'
    + ' 如需改多个不同文件或同一文件的多个位置，用 agent_multi_patch 一次完成。',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative file path in the project workspace (e.g. "src/game/GameLoop.js")' },
      old_string: { type: 'string', description: 'Exact text to find and replace. Include surrounding context lines for uniqueness. Leading whitespace differences are ignored (indent-aware).' },
      new_string: { type: 'string', description: 'Replacement text. Can be multi-line.' },
      replace_all: { type: 'boolean', description: 'Replace all occurrences (default: false). Use with caution on HTML/config files.', default: false },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!projectId) return { error: 'NO_PROJECT_ID', message: 'Tool context missing projectId' };
    if (!args.path) return { error: 'NO_PATH', message: 'Missing required arg `path`' };
    if (!args.old_string) return { error: 'NO_OLD_STRING', message: 'Missing required arg `old_string`' };
    if (args.new_string === undefined || args.new_string === null) return { error: 'NO_NEW_STRING', message: 'Missing required arg `new_string`' };

    const projectStore = require('../../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { error: 'PROJECT_NOT_FOUND' };
    const slug = project.slug || project.name;
    const workspace = require('../../services/workspace-service');

    // Read existing file
    const existingContent = workspace.readFile(slug, args.path);
    if (existingContent === null || existingContent === undefined) {
      return { error: 'FILE_NOT_FOUND', path: args.path };
    }

    // Apply patch
    const result = applyPatch(existingContent, args.old_string, args.new_string, {
      replaceAll: args.replace_all || false,
      indentAware: true,
    });

    if (!result.ok) {
      return {
        error: 'PATCH_FAILED',
        path: args.path,
        hint: result.hint || 'The old_string was not found. Re-read the file and use the exact text.',
      };
    }

    // Write back
    workspace.writeFile(slug, args.path, result.newContent);
    // P0 v0.X: 改文件后失效缓存
    readCache.invalidate(ctx.taskId, args.path);
    // P0 v0.X: 跨任务记忆
    try { workspaceMeta.recordWrite(slug, args.path, { taskId: ctx.taskId }); } catch (e) { /* 不阻塞 */ }

    // Syntax check for .js files
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

    const stats = {
      oldLines: args.old_string.split('\n').length,
      newLines: args.new_string.split('\n').length,
      netChange: args.new_string.split('\n').length - args.old_string.split('\n').length,
    };

    return {
      ok: true,
      patched: `${stats.netChange > 0 ? '+' : ''}${stats.netChange} lines (${stats.oldLines}→${stats.newLines})`,
      path: args.path,
      matchType: result.matchType,
      syntaxStatus,
      replacedCount: result.replacedCount,
    };
  },
});

// ===== Multi-patch 工具（一次修改多个文件或多个区域）=====

registerTool({
  name: 'agent_multi_patch',
  description: 'Apply multiple patches to one or more files in a single call. '
    + 'Each patch has its own path, old_string, and new_string. '
    + 'Useful for coordinated changes across multiple files. '
    + 'Returns per-patch results (success/failure). '
    + 'All patches are applied sequentially — if one fails, subsequent patches still run. '
    + 'Parameters: patches (array of {path, old_string, new_string}). '
    + '示例: agent_multi_patch({patches: [{path: "src/a.js", old_string: "oldFunc", new_string: "newFunc"}, {path: "src/b.js", old_string: "oldFunc", new_string: "newFunc"}]}) — 同时在 a.js 和 b.js 中改名函数。',
  parameters: {
    type: 'object',
    properties: {
      patches: {
        type: 'array',
        description: 'Array of patch objects, each with path, old_string, new_string',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            old_string: { type: 'string' },
            new_string: { type: 'string' },
          },
          required: ['path', 'old_string', 'new_string'],
        },
      },
    },
    required: ['patches'],
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!projectId) return { error: 'NO_PROJECT_ID' };
    if (!args.patches || !Array.isArray(args.patches) || args.patches.length === 0) {
      return { error: 'NO_PATCHES', message: 'Missing or empty patches array' };
    }

    const projectStore = require('../../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { error: 'PROJECT_NOT_FOUND' };
    const slug = project.slug || project.name;
    const workspace = require('../../services/workspace-service');

    const results = [];
    let hadFailure = false;

    for (let i = 0; i < args.patches.length; i++) {
      const patch = args.patches[i];
      try {
        const existingContent = workspace.readFile(slug, patch.path);
        if (existingContent === null || existingContent === undefined) {
          results.push({ index: i, ok: false, error: 'FILE_NOT_FOUND', path: patch.path });
          hadFailure = true;
          continue;
        }

        const result = applyPatch(existingContent, patch.old_string, patch.new_string, {
          replaceAll: false,
          indentAware: true,
        });

        if (!result.ok) {
          results.push({ index: i, ok: false, error: 'PATCH_FAILED', path: patch.path, hint: result.hint });
          hadFailure = true;
          continue;
        }

        workspace.writeFile(slug, patch.path, result.newContent);
        // P0 v0.X: multi_patch 也失效缓存
        readCache.invalidate(ctx.taskId, patch.path);
        // P0 v0.X: 跨任务记忆
        try { workspaceMeta.recordWrite(slug, patch.path, { taskId: ctx.taskId }); } catch (e) { /* 不阻塞 */ }

        // Syntax check for .js files
        let syntaxStatus = null;
        if (patch.path.endsWith('.js') || patch.path.endsWith('.mjs') || patch.path.endsWith('.cjs')) {
          try {
            const syntaxCheck = await workspace.exec(slug, {
              cmd: `node --check "${patch.path}"`,
              cwd: '',
              timeout: 10000,
            });
            syntaxStatus = syntaxCheck.exitCode === 0 ? 'OK' : `FAILED (exit ${syntaxCheck.exitCode})`;
          } catch (e) {
            syntaxStatus = `EXEC_ERROR: ${e.message}`;
          }
        }

        results.push({
          index: i,
          ok: true,
          path: patch.path,
          syntaxStatus,
          matchType: result.matchType,
        });
      } catch (e) {
        results.push({ index: i, ok: false, error: 'EXCEPTION', path: patch.path, message: e.message });
        hadFailure = true;
      }
    }

    return {
      ok: !hadFailure,
      total: args.patches.length,
      success: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      results,
    };
  },
});
