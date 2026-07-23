// 诊断卡住的任务
const { collection } = require('../server/db/connection');

const tasks = collection('tasks').all() || [];
const now = Date.now();

console.log('=== 任务状态分布 ===');
const byStatus = {};
tasks.forEach(function(t) {
  var s = t.status || 'unknown';
  byStatus[s] = (byStatus[s] || 0) + 1;
});
Object.keys(byStatus).sort().forEach(function(s) {
  console.log('  ' + s + ': ' + byStatus[s] + ' 条');
});

console.log('\n=== 可能卡住的任务（in_progress > 10 分钟无更新）===');
var stuck = tasks.filter(function(t) {
  return t.status === 'in_progress';
}).map(function(t) {
  var lastUpdate = new Date(t.last_progress_update || t.updated_at || t.created_at || 0).getTime();
  var idleMin = Math.round((now - lastUpdate) / 60000);
  var logs = [];
  try { logs = JSON.parse(t.execution_log || '[]'); } catch(e) {}
  var lastLog = logs.length > 0 ? logs[logs.length - 1] : null;
  return { id: t.id, title: (t.title || '').slice(0, 50), phase: t.phase || '-', progress: t.progress || 0, idleMin: idleMin, logCount: logs.length, lastLogNote: lastLog ? (lastLog.note || lastLog.action || '').slice(0, 80) : '(无)' };
}).filter(function(t) {
  return t.idleMin > 10;
}).sort(function(a, b) { return b.idleMin - a.idleMin; });

if (stuck.length === 0) {
  console.log('  暂无卡住超过 10 分钟的任务');
} else {
  stuck.forEach(function(t) {
    console.log('  [' + t.id + '] ' + t.title);
    console.log('    阶段:' + t.phase + ' 进度:' + t.progress + '% 空闲:' + t.idleMin + 'm 日志:' + t.logCount + '条');
    console.log('    最后日志: ' + t.lastLogNote);
  });
}

console.log('\n=== 锁状态 ===');
// 检查是否有未释放的锁
const locks = tasks.filter(function(t) {
  return t.locked_at || t.locked_by;
}).map(function(t) {
  return { id: t.id, lockedBy: t.locked_by || '-', lockedAt: t.locked_at || '-', idleMin: Math.round((now - new Date(t.locked_at || 0).getTime()) / 60000) };
});
if (locks.length === 0) {
  console.log('  无锁定任务');
} else {
  locks.forEach(function(l) {
    console.log('  [' + l.id + '] 锁定者:' + l.lockedBy + ' 锁定时间:' + l.idleMin + 'm 前');
  });
}

console.log('\n=== runToolLoop 超时保护检查 ===');
console.log('  DEFAULT_TIMEOUT: 120s');
console.log('  空转检测: 写后 ≥3 轮无写操作时触发');
console.log('  重复失败检测: 同一工具连续 ≥3 次 ok=false 时触发');
console.log('  只读超时: 前 6 轮无写操作时触发');
console.log('  Budget Alert: 剩余 ≤3 轮时注入提醒');
