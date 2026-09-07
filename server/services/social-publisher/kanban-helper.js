// ACMS social-publisher Kanban 集成（v0.118 PR 4-1）
// 路径：server/services/social-publisher/kanban-helper.js
//
// 复用 geo-kanban-helper 模式：
//   - social_publish 作为 Kanban task type
//   - executionMode='manual'（避 P172 教训：避免 task-agent 通用 loop 抢跑）
//   - artifacts 二次 update 写入 publish params（title/content/images/tags/account_id/platforms）
//
// 任务类型清单：
//   social-publish      单平台单账号发布
//   social-publish-all  单选题自动发 5 平台（多轮任务）
//   social-rewrite      AI 改写（PR 5 接入）
//   social-schedule     定时发布（依赖 social-publish）
//
// 设计：发布本身由 sp-task-executor 监听 task.claimed 事件触发（PR 4-2）

'use strict';

const taskStore = require('../../stores/task-store');
const sp = require('./index');

const SOCIAL_TASK_TYPES = {
  'social-publish': {
    icon: '🚀',
    label: '单平台发布',
    description: '把一篇内容发到 1 个平台（头条/小红书/公众号/知乎/抖音）',
  },
  'social-publish-all': {
    icon: '🌐',
    label: '全平台发布',
    description: '一个选题自动发到 5 平台（AI 改写 + 逐平台发布）',
  },
  'social-rewrite': {
    icon: '✨',
    label: 'AI 改写',
    description: '按平台规范改写内容（不改，只产改写稿）',
  },
  'social-schedule': {
    icon: '📅',
    label: '定时发布',
    description: '指定时间自动发布（内部用 social-publish 任务承载）',
  },
};

function getSocialTaskTypes() {
  return Object.entries(SOCIAL_TASK_TYPES).map(([id, info]) => ({ id, ...info }));
}

function listSocialTasks({ projectId, platform, type } = {}) {
  const allTasks = taskStore.list({ projectId, limit: 500 });
  return allTasks.filter(t => {
    // type 过滤（如果传了）
    if (type && t.type !== type) return false;
    // 没 type 但 artifacts 里有 social 标识的也算
    const isSocial = t.type?.startsWith('social-');
    if (!isSocial) return false;
    if (platform) {
      try {
        const arts = JSON.parse(t.artifacts || '{}');
        return arts.social?.platform === platform;
      } catch {
        return false;
      }
    }
    return true;
  });
}

function createPublishTask({
  projectId,
  type = 'social-publish',
  title,
  description,
  priority = 3,
  // 必填发布参数
  account_id,
  platform,
  content,
  post_title,
  images = [],
  tags = [],
  // 可选
  options = {},
  schedule_at = null,        // null = 立即发；未来时间 = 排期
  sub_tasks = [],            // 多平台：每个 {platform, account_id}
  dependsOn = [],
}) {
  if (!SOCIAL_TASK_TYPES[type]) {
    throw new Error(`Invalid social task type: ${type}. Allowed: ${Object.keys(SOCIAL_TASK_TYPES).join(', ')}`);
  }
  if (!platform && type !== 'social-rewrite') {
    throw new Error('platform is required for publish tasks');
  }
  if (!account_id && type !== 'social-rewrite') {
    throw new Error('account_id is required for publish tasks');
  }
  if (!content) {
    throw new Error('content is required');
  }

  // 1) 先建任务
  const fallbackTitle = `${SOCIAL_TASK_TYPES[type].icon} ${SOCIAL_TASK_TYPES[type].label}: ${(post_title || '').slice(0, 20) || platform}`;
  const task = taskStore.create({
    projectId,
    title: title || fallbackTitle,
    description: description || SOCIAL_TASK_TYPES[type].description,
    type,
    priority,
    executionMode: 'manual',  // P172 教训：避免 task-agent 通用 loop 抢跑
    dependsOn,
  });

  // 2) 二次 update 写 publish params（P165 教训：artifacts 必须二次写入）
  taskStore.update(task.id, {
    artifacts: JSON.stringify({
      social: {
        // 核心参数
        platform,
        account_id,
        post_title: post_title || title,
        content,
        images,
        tags,
        options: {
          // v0.118.6: 默认开截图（方便回看 + 失败定位），用户显式 false 才关
          // 修复：原 `!!options.screenshot_each_step` 反向默认（undefined → false 反人类）
          require_approval: options.require_approval !== false,
          humanize: options.humanize !== false,
          screenshot_each_step: options.screenshot_each_step !== false,
          wait_after_each_step_ms: options.wait_after_each_step_ms || 1500,
          ...options,
        },
        // 排期
        schedule_at,
        // 多平台子任务
        sub_tasks: sub_tasks || [],
        // 元数据
        created_via: 'social-publisher-kanban-helper',
        created_at: new Date().toISOString(),
      },
    }),
  });

  return taskStore.getById(task.id);
}

function getPublishParams(taskId) {
  const task = taskStore.getById(taskId);
  if (!task) return null;
  try {
    const arts = JSON.parse(task.artifacts || '{}');
    return arts.social || null;
  } catch {
    return null;
  }
}

module.exports = {
  SOCIAL_TASK_TYPES,
  getSocialTaskTypes,
  listSocialTasks,
  createPublishTask,
  getPublishParams,
  // PR 4-2 暴露给 executor 用
  sp,
};
