// 需求变更管理服务
const reqStore = require('../stores/requirement-store');
const taskStore = require('../stores/task-store');
const eventBus = require('./event-bus');

const service = {
  /**
   * 分析需求变更对任务的影响
   * @returns {Object} { requirement, impact: { unchanged, adjusted, discarded, newTasks, summary } }
   */
  analyzeImpact(requirementId, changeDescription) {
    const requirement = reqStore.getById(requirementId);
    if (!requirement) throw Object.assign(new Error('需求不存在'), { status: 404, code: 'REQ_NOT_FOUND' });
    if (!['in_execution', 'done'].includes(requirement.status)) {
      throw Object.assign(new Error('只有执行中的需求才能变更'), { status: 400, code: 'REQ_NOT_EXECUTING' });
    }

    const taskIds = JSON.parse(requirement.task_ids || '[]');
    const tasks = taskIds.map(id => taskStore.getById(id)).filter(Boolean);

    const impact = {
      unchanged: [],
      adjusted: [],
      discarded: [],
      summary: '',
    };

    for (const task of tasks) {
      if (task.status === 'done') {
        // 已完成的任务不受影响
        impact.unchanged.push({ id: task.id, title: task.title, reason: '已完成' });
      } else if (task.status === 'in_progress') {
        // 进行中的任务：冻结并标记需调整
        impact.adjusted.push({ id: task.id, title: task.title, reason: '进行中，需评估调整', currentProgress: task.progress });
      } else if (task.status === 'backlog') {
        // 待认领任务：标记需重做
        impact.discarded.push({ id: task.id, title: task.title, reason: '待认领，可能需要重做' });
      } else if (task.status === 'review') {
        // 待审核任务：标记需调整
        impact.adjusted.push({ id: task.id, title: task.title, reason: '待审核，需重新评估' });
      }
    }

    impact.summary = [
      `${impact.unchanged.length} 个任务不受影响`,
      `${impact.adjusted.length} 个任务需要调整`,
      `${impact.discarded.length} 个任务可能需要重做`,
    ].join('，');

    return {
      requirement: { id: requirement.id, title: requirement.title, status: requirement.status },
      changeDescription,
      impact,
      estimatedExtraHours: impact.adjusted.length * 1 + impact.discarded.length * 2,
    };
  },

  /**
   * 确认变更：冻结受影响任务，需求回到 clarifying
   */
  confirmChange(requirementId, analysisResult) {
    const requirement = reqStore.getById(requirementId);
    if (!requirement) throw Object.assign(new Error('需求不存在'), { status: 404, code: 'REQ_NOT_FOUND' });

    const impact = analysisResult.impact;

    // 冻结需要调整的进行中任务
    for (const item of impact.adjusted) {
      taskStore.transition(item.id, 'frozen');
    }

    // 归档需要重做的任务
    for (const item of impact.discarded) {
      taskStore.transition(item.id, 'archived');
    }

    // 记录变更历史
    const changeHistory = JSON.parse(requirement.change_history || '[]');
    changeHistory.push({
      version: (requirement.current_version || 1) + 1,
      time: Date.now(),
      reason: analysisResult.changeDescription,
      impact: {
        tasks_unchanged: impact.unchanged.length,
        tasks_adjusted: impact.adjusted.length,
        tasks_discarded: impact.discarded.length,
        summary: impact.summary,
      },
    });

    reqStore.update(requirementId, {
      change_history: JSON.stringify(changeHistory),
      current_version: (requirement.current_version || 1) + 1,
    });

    // 需求回到完善阶段
    reqStore.transition(requirementId, 'clarifying');

    // 事件通知
    eventBus.emit('requirement.changed', {
      projectId: requirement.project_id,
      actor: { id: 'user', type: 'human' },
      target: { type: 'requirement', id: requirement.id },
      payload: { requirement: reqStore.getById(requirementId), impact: analysisResult.impact },
    });

    return reqStore.getById(requirementId);
  },

  /**
   * 取消变更（恢复 frozen 任务）
   */
  cancelChange(requirementId) {
    const requirement = reqStore.getById(requirementId);
    if (!requirement) throw Object.assign(new Error('需求不存在'), { status: 404, code: 'REQ_NOT_FOUND' });

    const taskIds = JSON.parse(requirement.task_ids || '[]');
    for (const tid of taskIds) {
      const task = taskStore.getById(tid);
      if (task && task.status === 'frozen') {
        taskStore.transition(tid, 'in_progress');
      }
    }
    reqStore.transition(requirementId, 'in_execution');
    return reqStore.getById(requirementId);
  },
};

module.exports = service;
