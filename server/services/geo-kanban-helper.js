// ACMS GEO Kanban 集成工具（v0.1 — Phase 1 Week 6）
// 用途：让 GEO 任务能进 ACMS Kanban 系统（小吉 / 手动可触发）
// 路径：server/services/geo-kanban-helper.js
//
// 设计要点：
//   - GEO 任务作为 Kanban task 的一种 type（geo-audit / geo-optimize / geo-report / geo-track）
//   - artifacts JSON 字段存 brand_id + engine_targets + 自动产出的报告 ID
//   - 提供工具让小吉调用：「为 X 品牌创建一个 GEO 审计任务」
//   - 不实现 auto-execute（让 task-agent 检测 type 调度）— Phase 1.5
//     （当前实现：任务创建后 status=backlog，等用户/agent claim）

const taskStore = require('../stores/task-store');
const GEO_STORE = require('./geo-store');

const GEO_TASK_TYPES = {
  'geo-audit': { icon: '🔍', label: 'GEO 审计', description: '对品牌跑完整 GEO 审计' },
  'geo-optimize': { icon: '✨', label: 'GEO 优化', description: '优化品牌内容提升可见性' },
  'geo-report': { icon: '📊', label: 'GEO 报告', description: '生成周报/月报/对比报告' },
  'geo-track': { icon: '🔄', label: 'GEO 追踪', description: '跑多引擎跟踪收集数据' },
};

function createGEOTask({ projectId, brandId, type, title, description, priority = 3, engineTargets = [] }) {
  if (!GEO_TASK_TYPES[type]) {
    throw new Error(`Invalid GEO task type: ${type}. Allowed: ${Object.keys(GEO_TASK_TYPES).join(', ')}`);
  }
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) throw new Error(`Brand ${brandId} not found`);

  const task = taskStore.create({
    projectId,
    title: title || `${GEO_TASK_TYPES[type].icon} ${GEO_TASK_TYPES[type].label}: ${brand.name}`,
    description: description || GEO_TASK_TYPES[type].description,
    type,
    priority,
    // v0.2 (Phase 2 #10): GEO 任务由 geo-task-executor 自动执行（eventBus task.claimed 监听）
    //   必须 execution_mode='manual' 避免 task-agent 通用 loop 抢跑
    executionMode: 'manual',
  });

  // v0.2.1 修复：taskStore.create 签名没有 artifacts 参数（硬编码 artifacts:'{}'），
  //   必须 create 后手动 update 写入 GEO 关联信息（brand_id 等）
  taskStore.update(task.id, {
    artifacts: JSON.stringify({
      geo: {
        brand_id: brandId,
        brand_name: brand.name,
        brand_domain: brand.domain,
        engine_targets: engineTargets,
        created_via: 'geo-kanban-helper',
      },
    }),
  });

  return taskStore.getById(task.id);
}

function listGEOTasks(projectId, brandId) {
  const allTasks = taskStore.list({ projectId, limit: 500 });
  return allTasks.filter(t => {
    if (!t.type || !t.type.startsWith('geo-')) return false;
    if (brandId) {
      try {
        const arts = JSON.parse(t.artifacts || '{}');
        return arts.geo?.brand_id === brandId;
      } catch {
        return false;
      }
    }
    return true;
  });
}

function getGEOTaskTypes() {
  return Object.entries(GEO_TASK_TYPES).map(([id, info]) => ({
    id,
    ...info,
    description: info.description,
  }));
}

module.exports = {
  GEO_TASK_TYPES,
  createGEOTask,
  listGEOTasks,
  getGEOTaskTypes,
};