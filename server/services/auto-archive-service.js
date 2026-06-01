// 自动归档服务：已完成的任务在项目配置的天数后自动归档 (done → archived)
const { collection } = require('../db/connection');
const projectStore = require('../stores/project-store');

function autoArchive() {
  const now = Date.now();
  const projects = projectStore.list();

  for (const proj of projects) {
    const cfg = projectStore.getConfig(proj.id, 'autoArchiveDays');
    const days = parseInt(cfg?.value) || 3;
    const thresholdMs = days * 24 * 60 * 60 * 1000;

    const tasks = collection('tasks').find(t =>
      t.project_id === proj.id &&
      t.status === 'done' &&
      t.completed_at
    );

    let archived = 0;
    for (const t of tasks) {
      const completedAt = new Date(t.completed_at).getTime();
      if (now - completedAt >= thresholdMs) {
        collection('tasks').update(t2 => t2.id === t.id, {
          status: 'archived',
          updated_at: new Date().toISOString()
        });
        archived++;
        console.log(`[AutoArchive] ${t.id} "${t.title}" → archived (完成于 ${t.completed_at})`);
      }
    }
    if (archived > 0) {
      console.log(`[AutoArchive] 项目 ${proj.name}: 本次归档 ${archived} 个任务`);
    }
  }
}

module.exports = { autoArchive };
