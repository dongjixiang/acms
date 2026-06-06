// 领域检测服务 — 根据需求信息判断所属领域类型
// 用于选择合适的澄清策略和原型示意图生成

/**
 * 检测需求的领域类型
 * @param {object} requirement - { title, description, domain? }
 * @returns {string} 领域类型: 'prototype' | 'game' | 'api' | 'webapp' | 'documentation' | 'product' | 'general'
 */
function detectDomain(requirement) {
  // 如果需求已显式标注领域，优先使用
  if (requirement.domain) return requirement.domain;

  const text = (requirement.title + ' ' + (requirement.description || '')).toLowerCase();
  if (/原型|prototype|demo|演示|概念验证|poc|样片|样品|概念设计|线框图|低保真/.test(text)) return 'prototype';
  if (/游戏|game|关卡|角色|NPC|BOSS|战斗|技能|副本|地图|武器|装备|升级|血量/.test(text)) return 'game';
  if (/API|接口|后端|服务|微服务|REST|GraphQL|gRPC|端点/.test(text)) return 'api';
  if (/页面|前端|UI|UX|交互|组件|表单|路由|SPA|PWA|响应式/.test(text)) return 'webapp';
  if (/文档|Wiki|手册|教程|指南|README|规范|标准/.test(text)) return 'documentation';
  if (/竞品|产品规划|商业模式|定价|用户画像|市场分析|差异化|MVP|楔子|RICE/.test(text)) return 'product';
  return 'general';
}

/**
 * 判断需求是否属于"原型类"（界面/流程体验为主）
 * @param {object} requirement
 * @returns {boolean}
 */
function isPrototypeDomain(requirement) {
  return detectDomain(requirement) === 'prototype';
}

module.exports = { detectDomain, isPrototypeDomain };
