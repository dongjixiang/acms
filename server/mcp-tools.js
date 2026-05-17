// ACMS MCP 工具集 — 供 Hermes Agent 加载使用
// 将此文件复制到 Hermes 的 skills 目录，或通过 HTTP 端点提供给 Agent

const ACMS_BASE = process.env.ACMS_URL || 'http://localhost:3300/api';
const API_KEY = process.env.ACMS_API_KEY || 'dev-key-001';

const headers = { 'Content-Type': 'application/json', 'X-API-Key': API_KEY };

async function acmsCall(method, path, body = null) {
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${ACMS_BASE}${path}`, opts);
  return res.json();
}

// ===== MCP 工具定义 =====
const tools = [
  // --- 需求管理 ---
  {
    name: 'acms_create_requirement',
    description: '在项目中创建新需求',
    parameters: {
      projectId: { type: 'string', required: true, description: '项目ID' },
      title: { type: 'string', required: true, description: '需求标题' },
      description: { type: 'string', description: '需求描述' },
      priority: { type: 'number', description: '优先级 1-5, 1最高' },
    },
    handler: async (params) => acmsCall('POST', '/requirements', params),
  },
  {
    name: 'acms_list_requirements',
    description: '列出项目中的需求',
    parameters: {
      projectId: { type: 'string', required: true },
      status: { type: 'string', description: '筛选状态' },
    },
    handler: async (params) => acmsCall('GET', `/requirements?${new URLSearchParams(params)}`),
  },
  {
    name: 'acms_get_requirement',
    description: '获取需求详情（含澄清对话、SRS）',
    parameters: { id: { type: 'string', required: true } },
    handler: async (params) => acmsCall('GET', `/requirements/${params.id}`),
  },
  {
    name: 'acms_clarify_requirement',
    description: '作为分析师智能体，向需求提出澄清问题',
    parameters: {
      id: { type: 'string', required: true, description: '需求ID' },
      question: { type: 'string', required: true },
      agentId: { type: 'string', description: '智能体ID' },
    },
    handler: async (params) => acmsCall('POST', `/requirements/${params.id}/clarify`, params),
  },
  {
    name: 'acms_update_srs',
    description: '更新需求的结构化规格说明（SRS）',
    parameters: {
      id: { type: 'string', required: true },
      scopeIn: { type: 'array', description: '功能范围列表' },
      acceptanceCriteria: { type: 'array', description: '验收标准列表' },
      summary: { type: 'string', description: '需求摘要' },
      description: { type: 'string', description: '结构化描述' },
    },
    handler: async (params) => acmsCall('PATCH', `/requirements/${params.id}/srs`, params),
  },
  {
    name: 'acms_submit_requirement_review',
    description: '提交需求审核（确认需求已完善）',
    parameters: { id: { type: 'string', required: true } },
    handler: async (params) => acmsCall('POST', `/requirements/${params.id}/submit-review`),
  },

  // --- 任务分解（规划师） ---
  {
    name: 'acms_decompose_requirement',
    description: '将已确认的需求分解为任务列表（规划师角色）',
    parameters: {
      id: { type: 'string', required: true, description: '需求ID' },
      tasks: { type: 'array', required: true, description: '任务列表 [{title,type,estimatedHours}]' },
    },
    handler: async (params) => acmsCall('POST', `/requirements/${params.id}/decompose`, { tasks: params.tasks }),
  },

  // --- 任务管理（执行者） ---
  {
    name: 'acms_list_tasks',
    description: '列出看板任务',
    parameters: {
      projectId: { type: 'string' },
      status: { type: 'string', description: 'backlog|in_progress|review|done' },
      assignedTo: { type: 'string', description: '按执行者筛选' },
    },
    handler: async (params) => acmsCall('GET', `/tasks?${new URLSearchParams(params)}`),
  },
  {
    name: 'acms_get_task',
    description: '获取任务详情',
    parameters: { id: { type: 'string', required: true } },
    handler: async (params) => acmsCall('GET', `/tasks/${params.id}`),
  },
  {
    name: 'acms_get_task_context',
    description: '获取任务完整上下文（含父需求摘要、项目环境、关联Wiki）',
    parameters: {
      agentId: { type: 'string', required: true },
      taskId: { type: 'string', required: true },
    },
    handler: async (params) => acmsCall('GET', `/agents/${params.agentId}/context/${params.taskId}`),
  },
  {
    name: 'acms_claim_task',
    description: '认领任务（执行者角色）',
    parameters: {
      id: { type: 'string', required: true, description: '任务ID' },
      agentId: { type: 'string', required: true },
    },
    handler: async (params) => acmsCall('POST', `/tasks/${params.id}/claim`, { agentId: params.agentId }),
  },
  {
    name: 'acms_update_progress',
    description: '更新任务进度',
    parameters: {
      id: { type: 'string', required: true },
      progress: { type: 'number', required: true, description: '0-100' },
      note: { type: 'string', description: '进度说明' },
    },
    handler: async (params) => acmsCall('POST', `/tasks/${params.id}/progress`, { progress: params.progress, note: params.note }),
  },
  {
    name: 'acms_submit_task',
    description: '提交任务成果',
    parameters: {
      id: { type: 'string', required: true },
      agentId: { type: 'string', required: true },
      notes: { type: 'string', description: '提交说明' },
      files: { type: 'array', description: '产出文件列表' },
    },
    handler: async (params) => acmsCall('POST', `/tasks/${params.id}/submit`, params),
  },

  // --- 任务审核（审核者） ---
  {
    name: 'acms_review_task',
    description: '审核任务（审核者角色）',
    parameters: {
      id: { type: 'string', required: true },
      verdict: { type: 'string', required: true, description: 'approved|rejected' },
      feedback: { type: 'string', description: '审核反馈' },
    },
    handler: async (params) => acmsCall('POST', `/tasks/${params.id}/review`, params),
  },

  // --- 智能体自身 ---
  {
    name: 'acms_get_my_tasks',
    description: '获取当前智能体的任务列表和审核队列',
    parameters: { agentId: { type: 'string', required: true } },
    handler: async (params) => acmsCall('GET', `/agents/${params.agentId}/tasks`),
  },
  {
    name: 'acms_get_matching_tasks',
    description: '获取与智能体技能匹配的待认领任务推荐',
    parameters: { agentId: { type: 'string', required: true } },
    handler: async (params) => acmsCall('GET', `/agents/${params.agentId}/match-tasks`),
  },
  {
    name: 'acms_get_my_notifications',
    description: '获取智能体的通知列表',
    parameters: { agentId: { type: 'string', required: true } },
    handler: async (params) => acmsCall('GET', `/agents/${params.agentId}/notifications`),
  },

  // --- 项目/知识库 ---
  {
    name: 'acms_get_project',
    description: '获取项目详情（含环境、仓库、配置）',
    parameters: { id: { type: 'string', required: true } },
    handler: async (params) => acmsCall('GET', `/projects/${params.id}`),
  },
];

// 导出供 Hermes 使用
module.exports = { tools, acmsCall };
