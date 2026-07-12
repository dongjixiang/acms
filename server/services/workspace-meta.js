// P0 v0.X: workspace.meta — 跨任务记忆
//   T-MRH4256G 问题：每个任务独立 process，前序任务的"读了哪些文件"、"踩过什么坑"完全没传给后续任务
//   现在：每个 workspace 持久化一个 .acms-meta.json，记录：
//     - filesRead:    { path: readCount }   — 哪些文件被多次读过（agent 可能该考虑缓存策略）
//     - filesWritten: { path: [taskId, ...] } — 哪些文件被改过（看是不是有人改过这块）
//     - errorsHit:    [string, ...]         — 最近踩过的坑（拼写错误、anchor 失败等）
//     - filesCached:  { path: lastSummary }  — agent 读过的文件 + 摘要（让后续任务快速 recall）
//
//   注意：这是 per-workspace，不是 per-task。Task A 改了 X.js → Task B 看 meta 知道 "X.js 有人改过"
//
//   设计取舍：
//     - 简单实现（json 文件，不入 DB）→ 不影响现有 schema
//     - 限速：每次工具调用都 update 文件会拖性能，所以加 in-memory cache + 5s flush
//     - 限容量：filesRead 最多 200 条，errorsHit 最多 50 条，超过 LRU 淘汰

const fs = require('fs');
const path = require('path');
const WORKSPACE_ROOT = path.join(__dirname, '..', '..', 'workspaces');

const META_FILENAME = '.acms-meta.json';
const MAX_FILES_READ = 200;
const MAX_FILES_CACHED = 100;
const MAX_ERRORS = 50;
const FLUSH_INTERVAL_MS = 5000;

// in-memory cache: workspaceSlug -> meta object
const cache = new Map();
const dirty = new Set();  // 已修改但未落盘的 slugs

// debounce flush
let flushTimer = null;
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    for (const slug of dirty) {
      flushSync(slug);
    }
  }, FLUSH_INTERVAL_MS);
}

function flushSync(slug) {
  const meta = cache.get(slug);
  if (!meta) return;
  const filePath = path.join(WORKSPACE_ROOT, slug, META_FILENAME);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(meta, null, 2));
    dirty.delete(slug);
  } catch (e) {
    console.error(`[workspace-meta] flush ${slug} failed:`, e.message);
  }
}

function getEmptyMeta() {
  return {
    filesRead: {},        // path -> count
    filesWritten: {},     // path -> [taskId, ...]
    filesCached: {},      // path -> { taskId, summary, lastRead }
    errorsHit: [],        // [{ at, msg, taskId }, ...]
    lastTouched: new Date().toISOString(),
    version: 1,
  };
}

function load(slug) {
  if (cache.has(slug)) return cache.get(slug);
  const filePath = path.join(WORKSPACE_ROOT, slug, META_FILENAME);
  let meta = getEmptyMeta();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      meta = { ...getEmptyMeta(), ...parsed };
    }
  } catch (e) {
    console.warn(`[workspace-meta] load ${slug} failed:`, e.message);
  }
  cache.set(slug, meta);
  return meta;
}

function getMeta(slug) {
  return load(slug);
}

function recordRead(slug, filePath, ctx = {}) {
  const meta = load(slug);
  meta.filesRead[filePath] = (meta.filesRead[filePath] || 0) + 1;
  meta.lastTouched = new Date().toISOString();
  // LRU 淘汰
  const entries = Object.entries(meta.filesRead);
  if (entries.length > MAX_FILES_READ) {
    entries.sort((a, b) => a[1] - b[1]);
    const toRemove = entries.slice(0, entries.length - MAX_FILES_READ);
    for (const [k] of toRemove) delete meta.filesRead[k];
  }
  dirty.add(slug);
  scheduleFlush();
  return meta;
}

function recordWrite(slug, filePath, ctx = {}) {
  const meta = load(slug);
  const taskId = ctx.taskId || '';
  if (!meta.filesWritten[filePath]) meta.filesWritten[filePath] = [];
  if (taskId && !meta.filesWritten[filePath].includes(taskId)) {
    meta.filesWritten[filePath].push(taskId);
  }
  meta.lastTouched = new Date().toISOString();
  dirty.add(slug);
  scheduleFlush();
  return meta;
}

function recordError(slug, msg, ctx = {}) {
  const meta = load(slug);
  meta.errorsHit.push({
    at: new Date().toISOString(),
    msg: String(msg).slice(0, 200),
    taskId: ctx.taskId || '',
  });
  if (meta.errorsHit.length > MAX_ERRORS) {
    meta.errorsHit = meta.errorsHit.slice(-MAX_ERRORS);
  }
  meta.lastTouched = new Date().toISOString();
  dirty.add(slug);
  scheduleFlush();
  return meta;
}

// 缓存文件摘要（可选 — agent 读完文件后可以调用 cacheFileSummary 存摘要）
function cacheFileSummary(slug, filePath, summary, ctx = {}) {
  const meta = load(slug);
  meta.filesCached[filePath] = {
    taskId: ctx.taskId || '',
    summary: String(summary).slice(0, 500),
    lastRead: new Date().toISOString(),
  };
  // LRU 淘汰
  const entries = Object.entries(meta.filesCached);
  if (entries.length > MAX_FILES_CACHED) {
    entries.sort((a, b) => (a[1].lastRead || '').localeCompare(b[1].lastRead || ''));
    const toRemove = entries.slice(0, entries.length - MAX_FILES_CACHED);
    for (const [k] of toRemove) delete meta.filesCached[k];
  }
  meta.lastTouched = new Date().toISOString();
  dirty.add(slug);
  scheduleFlush();
  return meta;
}

// 给 agent-execute 注入 system prompt 用的摘要
//   只显示 read 最多 10 个 + written 最多 10 个 + 最近 5 个 errors
function getSummaryForPrompt(slug, currentTaskId = '') {
  const meta = load(slug);
  const topRead = Object.entries(meta.filesRead)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const topWritten = Object.entries(meta.filesWritten)
    .filter(([path, taskIds]) => !currentTaskId || !taskIds.includes(currentTaskId))
    .slice(0, 10);
  const recentErrors = meta.errorsHit.slice(-5);

  const lines = [];
  lines.push('# 🧠 Workspace Memory (from previous tasks in this workspace)');
  lines.push('');
  if (topRead.length === 0 && topWritten.length === 0 && recentErrors.length === 0) {
    lines.push('_No prior task history in this workspace._');
    return lines.join('\n');
  }
  if (topRead.length > 0) {
    lines.push('## Most-read files (other tasks read these many times — likely important):');
    for (const [path, count] of topRead) {
      lines.push(`- \`${path}\` (read ${count}x)`);
    }
    lines.push('');
  }
  if (topWritten.length > 0) {
    lines.push('## Recently modified files (other tasks touched these — review before re-editing):');
    for (const [path, taskIds] of topWritten) {
      const others = taskIds.filter(t => t !== currentTaskId);
      if (others.length > 0) {
        lines.push(`- \`${path}\` (modified by ${others.length} other task${others.length > 1 ? 's' : ''}: ${others.slice(0, 3).join(', ')})`);
      }
    }
    lines.push('');
  }
  if (recentErrors.length > 0) {
    lines.push('## Recent errors hit by other tasks in this workspace (avoid these traps):');
    for (const err of recentErrors) {
      lines.push(`- ${err.msg}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// 强制 flush（测试 / 任务结束时调用）
function flushAll() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  for (const slug of dirty) {
    flushSync(slug);
  }
}

module.exports = {
  getMeta,
  recordRead,
  recordWrite,
  recordError,
  cacheFileSummary,
  getSummaryForPrompt,
  flushAll,
};