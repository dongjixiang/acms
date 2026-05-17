// 智能体绩效统计服务
const taskStore = require('../stores/task-store');
const agentStore = require('../stores/agent-store');

const service = {
  getStats(agentId) {
    const agent = agentStore.getById(agentId);
    if (!agent) throw Object.assign(new Error('智能体不存在'), { status: 404 });

    const allTasks = taskStore.list({ assignedTo: agentId, limit: 500 });
    const completed = allTasks.filter(t => t.status === 'done');
    const inProgress = allTasks.filter(t => t.status === 'in_progress');

    // 成功率
    const totalReviewed = completed.length + allTasks.filter(t => t.status === 'review').length;
    let successRate = 0;
    if (totalReviewed > 0) {
      const rejected = allTasks.filter(t => {
        const reviews = JSON.parse(t.reviews || '[]');
        return reviews.some(r => r.verdict === 'rejected');
      }).length;
      successRate = Math.round(((completed.length) / (completed.length + rejected)) * 100);
    }

    // 平均完成时间（小时）
    const completedWithTimes = completed.filter(t => t.completed_at && t.created_at);
    const avgHours = completedWithTimes.length > 0
      ? Math.round(completedWithTimes.reduce((sum, t) => sum + (new Date(t.completed_at) - new Date(t.created_at)) / 3600000, 0) / completedWithTimes.length * 10) / 10
      : 0;

    return {
      agent: { id: agent.id, name: agent.name, type: agent.type, status: agent.status },
      stats: {
        totalCompleted: completed.length,
        inProgress: inProgress.length,
        successRate,
        avgCompletionHours: avgHours,
        totalTasks: allTasks.length,
      },
      recentTasks: completed.slice(-5).map(t => ({
        id: t.id, title: t.title, type: t.type,
        completedAt: t.completed_at,
        estimatedHours: t.estimated_hours,
        actualHours: t.actual_hours || 0,
      })),
    };
  },

  // 饥饿降级：检查超时未认领任务并降低技能要求
  checkAndDegrade() {
    const tasks = taskStore.list({ status: 'backlog', limit: 500 });
    const now = Date.now();
    const HOUR_24 = 24 * 60 * 60 * 1000;
    const degraded = [];

    for (const task of tasks) {
      const createdAt = new Date(task.created_at).getTime();
      if (now - createdAt > HOUR_24) {
        const skills = JSON.parse(task.required_skills || '{}');
        let changed = false;
        for (const key of Object.keys(skills)) {
          if (skills[key] > 0.5) {
            skills[key] = Math.max(0.5, Math.round((skills[key] - 0.3) * 10) / 10);
            changed = true;
          }
        }
        if (changed) {
          taskStore.update(task.id, { required_skills: JSON.stringify(skills) });
          degraded.push({ id: task.id, title: task.title, oldSkills: JSON.parse(task.required_skills || '{}'), newSkills: skills });
        }
      }
    }

    if (degraded.length > 0) {
      console.log(`[Degrade] 降低了 ${degraded.length} 个任务的门槛`);
    }
    return degraded;
  },
};

module.exports = service;
