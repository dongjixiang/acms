// P0 v0.X: agent_read_file 缓存 — 防 agent 重复读同一文件
//   T-MRGDBST1 实测：agent_read_file 调了 39 次，其中 GameLoop.js 读了 4 次、app/game.js 读了 3 次
//   缓存按 (taskId, path, offset, limit) 索引；agent_write_file / patch_file 触发 invalidate
//   T-MRZ5GUN7 v0.64: 新增 wasPathRead() 跨 offset/limit 检测 — 同一 task 内第二次读同一 path 时返回警告
//
// 注意：进程重启缓存清零，符合预期（不是长生命周期缓存）
// 不缓存 FILE_NOT_FOUND（防止 agent 写了文件后还看到"没找到"）

const cache = new Map();  // key: `${taskId}::${path}::${offset}::${limit}` -> result object
const pathIndex = new Map(); // key: `${taskId}::${path}` -> { readCount: N, firstAt: <timestamp> }

function keyFor(taskId, path, offset, limit) {
  return `${taskId || ''}::${path}::${offset || ''}::${limit || ''}`;
}

function pathKey(taskId, path) {
  return `${(taskId || '')}::${(path || '')}`;
}

function get(taskId, path, offset, limit) {
  if (!taskId) return null;  // 没 taskId 上下文不缓存（防跨任务污染）
  const k = keyFor(taskId, path, offset, limit);
  const entry = cache.get(k);
  if (!entry) return null;
  entry.hits = (entry.hits || 0) + 1;
  return { ...entry.value, _cacheHit: true, _cacheHits: entry.hits };
}

// 跨 offset/limit 检测：此任务是否读过这个 path（任意 offset/limit）
function wasPathRead(taskId, path) {
  if (!taskId || !path) return null;
  return pathIndex.get(pathKey(taskId, path)) || null;
}

function trackRead(taskId, path) {
  if (!taskId || !path) return;
  const pk = pathKey(taskId, path);
  const existing = pathIndex.get(pk);
  if (existing) {
    existing.readCount++;
  } else {
    pathIndex.set(pk, { readCount: 1, firstAt: Date.now() });
  }
}

function set(taskId, path, offset, limit, value) {
  if (!taskId) return;
  // 不缓存错误结果（FILE_NOT_FOUND 等）— agent 写文件后必须能重新发现
  if (value && (value.error || value.notFound)) return;
  const k = keyFor(taskId, path, offset, limit);
  cache.set(k, { value, hits: 0, at: Date.now() });
  // 任何成功写入缓存都记入 path 索引
  trackRead(taskId, path);
}

// 文件被改写时调用，清掉该 task+path 的所有缓存条目（不同 offset/limit 都要失效）
function invalidate(taskId, path) {
  if (!taskId || !path) return;
  const prefix = `${taskId}::${path}::`;
  let cleared = 0;
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) { cache.delete(k); cleared++; }
  }
  // 同时清 path 索引，让下次读拿到最新内容
  pathIndex.delete(pathKey(taskId, path));
  return cleared;
}

function stats() {
  return { size: cache.size, entries: [...cache.entries()].slice(0, 5).map(([k, v]) => ({ k, hits: v.hits })) };
}

// 防内存膨胀：>500 条时清掉命中最少的一半
function trim() {
  if (cache.size <= 500) return;
  const entries = [...cache.entries()].sort((a, b) => a[1].hits - b[1].hits);
  const toDelete = entries.slice(0, Math.floor(cache.size / 2));
  toDelete.forEach(([k]) => cache.delete(k));
}

module.exports = { get, set, invalidate, stats, trim, wasPathRead, trackRead };