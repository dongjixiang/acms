// ACMS Trace Watchdog (v1.0 / Phase 4-B)
// 治僵尸 trace bug: running 状态 trace 超过 N 分钟没更新 → 标 failed
// 之前发现的 bug: trc_msyvcijq_dv6n 跑了 20+ 小时没清理
//
// 触发方式:
//   - 手动调用 sweep() 立即扫描
//   - 集成到 server 启动时 setInterval,每 5 分钟跑一次
//   - 提供 CLI 入口 node server/services/trace-watchdog.js
//
// 设计:
//   - 不修改 trace 文件本身（保留完整证据）
//   - 仅更新 .meta.json 中的 status: running → failed + finishedAt + error
//   - 阈值可通过 TIMEOUT_MINUTES 环境变量配置（默认 30 分钟）

const fs = require('fs');
const path = require('path');

const TRACE_DIR = path.join(__dirname, '..', '..', 'data', 'traces');
const META_FILE = path.join(TRACE_DIR, '.meta.json');
const TIMEOUT_MINUTES = parseInt(process.env.TRACE_WATCHDOG_TIMEOUT_MIN || '30', 10);
const TIMEOUT_MS = TIMEOUT_MINUTES * 60 * 1000;

/**
 * 扫描僵尸 trace,超时 running 的标 failed
 * @returns {{swept: number, ids: string[]}}
 */
function sweep() {
  if (!fs.existsSync(META_FILE)) return { swept: 0, ids: [] };
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  } catch (e) {
    console.warn('[trace-watchdog] 读 meta 失败:', e.message);
    return { swept: 0, ids: [] };
  }
  if (!Array.isArray(meta)) return { swept: 0, ids: [] };

  const now = Date.now();
  const sweptIds = [];
  const updated = [];

  for (let i = 0; i < meta.length; i++) {
    const entry = meta[i];
    if (entry.status !== 'running') continue;

    const startedAt = new Date(entry.startedAt || 0).getTime();
    if (!startedAt) continue;

    // 检查 trace 文件 mtime（实际最近更新时间）
    const traceFile = path.join(TRACE_DIR, entry.id + '.json');
    let lastUpdateMs = startedAt;
    try {
      if (fs.existsSync(traceFile)) {
        const stat = fs.statSync(traceFile);
        lastUpdateMs = Math.max(startedAt, stat.mtimeMs);
      }
    } catch (_) {}

    const ageMs = now - lastUpdateMs;
    if (ageMs < TIMEOUT_MS) continue;

    // 超时 → 标 failed
    entry.status = 'failed';
    entry.finishedAt = new Date(now).toISOString();
    entry.error = `[trace-watchdog] 超时未更新,${Math.round(ageMs / 60000)} 分钟前停止 (阈值 ${TIMEOUT_MINUTES} 分钟)`;
    sweptIds.push(entry.id);
    updated.push(entry);
  }

  if (sweptIds.length === 0) return { swept: 0, ids: [] };

  try {
    fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
    console.log(`[trace-watchdog] 清理 ${sweptIds.length} 个僵尸 trace:`);
    for (const id of sweptIds) {
      console.log(`  - ${id}`);
    }
  } catch (e) {
    console.error('[trace-watchdog] 写 meta 失败:', e.message);
    return { swept: 0, ids: sweptIds };
  }

  return { swept: sweptIds.length, ids: sweptIds };
}

/**
 * 启动 watchdog（每 5 分钟自动扫描一次）
 * @param {number} intervalMs - 扫描间隔（默认 5 分钟）
 * @returns {NodeJS.Timeout} timer handle（用于 unref 防止进程不退）
 */
function start(intervalMs = 5 * 60 * 1000) {
  console.log(`[trace-watchdog] 启动: 每 ${intervalMs / 60000} 分钟扫描,超时阈值 ${TIMEOUT_MINUTES} 分钟`);
  // 启动时立即扫一次
  sweep();
  const timer = setInterval(() => sweep(), intervalMs);
  if (timer.unref) timer.unref();  // 不阻止进程退出
  return timer;
}

module.exports = { sweep, start, TIMEOUT_MINUTES };

// CLI 入口: node server/services/trace-watchdog.js
if (require.main === module) {
  const result = sweep();
  console.log(`[trace-watchdog] 完成: 清理 ${result.swept} 个`);
  process.exit(0);
}