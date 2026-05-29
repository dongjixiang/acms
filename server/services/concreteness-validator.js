// 需求具体性验证器 — 检测模糊表达
// 调用时机: 需求提交审核前 / 生成文档前

const VAGUE_PATTERNS = [
  // 数量范围无具体内容
  { pattern: /(\d+)\s*[~～\-]\s*(\d+)\s*个?[^,，\s]*(关卡|模块|功能|页面|接口|武器|角色|NPC|BOSS|道具|技能|任务|章节|场景|副本|地图|种族|职业)/g, severity: 'error', message: (m) => `"${m[0]}" 未说明具体内容——请至少列出前${Math.min(3, parseInt(m[1]))}个的具体名称和机制` },
  { pattern: /若干|一些|几个|多种|各种|等等|之类|什么的/g, severity: 'warning', message: () => '使用了模糊数量词，建议列出具体清单' },

  // 创意内容无剧情/无设定
  { pattern: /原创剧情|剧情线|剧情|故事线/g, severity: 'warning', message: () => '"剧情"需要至少说明主线概要（主角、冲突、章节结构）' },
  { pattern: /有趣的NPC|独特的BOSS|有意思的|cool的|好玩的/g, severity: 'error', message: () => '主观形容词无法执行——需要具体描述NPC/BOSS的名字、特点、行为' },

  // 人物/角色无背景设定
  { pattern: /(?:设计|创建|添加|加入)\s*(?:一些|几个)?\s*(人物|角色|英雄|敌人|怪物|主角|反派|队友)/g, severity: 'error', message: (m) => `"${m[0]}" 未说明具体人物——需要列出: 名字、身份/定位、核心能力/特点、在剧情中的作用` },
  { pattern: /人物设定|角色设计|英雄设计|敌人设计/g, severity: 'warning', message: () => '"人物设定"需要具体信息: 每个角色的名字、背景故事、技能树、性格特征' },

  // 地形/场景无具体内容
  { pattern: /(?:设计|创建|添加|实现)\s*(?:一些|几个)?\s*(地形|场景|地图|关卡场景|战场|环境|地貌)/g, severity: 'error', message: (m) => `"${m[0]}" 未说明具体内容——需要列出: 地形名称、视觉风格、核心机制、尺寸/规模` },
  { pattern: /地形设计|场景设计|地图设计|关卡设计/g, severity: 'warning', message: () => '"地形/场景设计"需明确: 每种地形的名称、视觉特征、影响游戏机制的方式、参考图或风格描述' },

  // 技术方案无决策
  { pattern: /现代(?:前端)?框架/gi, severity: 'warning', message: () => '"现代框架"未指定——需要明确是 React/Vue/Angular 及其版本' },
  { pattern: /合适的数据库|适当的缓存|高性能渲染|优秀的架构/gi, severity: 'warning', message: () => '技术选型未做决策——需明确具体方案和理由' },

  // 验收标准无数字
  { pattern: /保证流畅|加载快|画面好|性能好|运行稳定|体验好|界面美[观观]/g, severity: 'error', message: () => '验收标准缺少可量化指标——需要具体数字（fps/秒/MB）' },
];

/**
 * 检查文本中的模糊表达
 * @param {string} text — 需求描述或 SRS 文本
 * @returns {{ passed: boolean, warnings: [] }}
 */
function checkConcreteness(text) {
  const warnings = [];
  if (!text) return { passed: true, warnings: [] };

  for (const rule of VAGUE_PATTERNS) {
    const matches = [...text.matchAll(rule.pattern)];
    for (const m of matches) {
      warnings.push({
        severity: rule.severity,
        pattern: m[0],
        message: typeof rule.message === 'function' ? rule.message(m) : rule.message,
      });
    }
  }

  return {
    passed: warnings.filter(w => w.severity === 'error').length === 0,
    warnings,
  };
}

/**
 * 检查 requirement 的 SRS 是否足够具体
 * @param {object} requirement
 * @returns {{ passed: boolean, warnings: [] }}
 */
function validateRequirement(requirement) {
  const srs = JSON.parse(requirement.srs || '{}');
  const texts = [
    requirement.title || '',
    requirement.description || '',
    (srs.scopeIn || []).join(' '),
    (srs.acceptanceCriteria || []).join(' '),
    (srs.technicalConstraints || []).join(' '),
    srs.summary || '',
  ];
  const allWarnings = [];
  for (const text of texts) {
    const result = checkConcreteness(text);
    allWarnings.push(...result.warnings);
  }

  return {
    passed: allWarnings.filter(w => w.severity === 'error').length === 0,
    warnings: allWarnings,
  };
}

module.exports = { checkConcreteness, validateRequirement, VAGUE_PATTERNS };
