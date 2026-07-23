// 诊断 T-MRXOMXWK 的任务状态和事件
const { collection } = require('../server/db/connection');

const taskId = 'T-MRXOMXWK';
var task = collection('tasks').findOne(function(t) { return t.id === taskId; });

if (!task) {
  console.log('任务不存在');
  process.exit(0);
}

console.log('=== 任务基本信息 ===');
console.log('ID:', task.id);
console.log('标题:', task.title);
console.log('状态:', task.status);
console.log('分配人:', task.assigned_to || '(未分配)');
console.log('创建时间:', task.created_at);
console.log('最后更新:', task.updated_at || '-');
console.log('progress:', task.progress || 0);

console.log('\n=== event-bus 事件 ===');
try {
  var events = collection('events').all() || [];
  var taskEvents = events.filter(function(e) {
    return (e.target_id && e.target_id === taskId) || (typeof e.payload === 'string' && e.payload.indexOf(taskId) >= 0);
  }).slice(-10);
  if (taskEvents.length === 0) {
    console.log('  无相关事件');
  } else {
    taskEvents.forEach(function(e) {
      console.log('  type:', e.type, 'target:', e.target_id, 'actor:', e.actor_id, 'ts:', new Date(e.timestamp).toISOString().slice(11, 19));
    });
  }
} catch(e) {
  console.log('  事件查询失败:', e.message);
}

console.log('\n=== WebSocket 客户端数 ===');
try {
  var eb = require('../server/services/event-bus');
  console.log('  _wsClients 数量:', eb._wsClients ? eb._wsClients.size : 0);
} catch(e) {
  console.log('  WS 检查失败');
}
