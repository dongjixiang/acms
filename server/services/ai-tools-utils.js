// ACMS AI 工具层共享 utility — 跨 doc-generator / requirement-decomposer / consistency-checker 共用
// v0.23 L2 拆分：原 ai-tools-service.js (783 行) 拆出此文件 + 4 个独立业务模块

// ===== 工具函数 =====

/** 安全数组转换（undefined/null → []） */
function safeArr(val) {
  return Array.isArray(val) ? val : [];
}

// ===== JSON 修复 =====
// LLM 输出的 JSON 常有：尾逗号、截断导致括号不匹配
function repairJSON(text) {
  let fixed = text;

  // 1. 删除尾逗号（对象和数组）
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');

  // 2. 补全截断的 JSON — 统计括号并补缺失的闭合
  let depth = 0;
  let inString = false;
  let escape = false;
  for (const ch of fixed) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') depth--;
  }
  if (inString) fixed += '"';
  if (depth > 0) {
    const stack = [];
    inString = false; escape = false;
    for (const ch of fixed) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') stack.push('}');
      if (ch === '[') stack.push(']');
      if (ch === '}' || ch === ']') stack.pop();
    }
    fixed += stack.reverse().join('');
  }
  return fixed;
}

/** 从 LLM 输出中提取 JSON 文本 — 多层容错 */
function extractJSON(content) {
  try { JSON.parse(content); return content; } catch {}
  const stripped = content.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();
  const m = stripped.match(/\{[\s\S]*\}/);
  return m ? m[0] : null;
}

/** JSON 彻底坏掉时的保底：从原始文本中捕获 title 和 description */
function salvageTasks(text) {
  const tasks = [];
  const blocks = text.split(/\{(?=\s*"title")/g);
  for (const block of blocks) {
    if (!block.includes('"title"')) continue;
    const titleMatch = block.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (!titleMatch) continue;
    const title = titleMatch[1];
    let description = '';
    const descMatch = block.match(/"description"\s*:\s*"((?:[^"\\]|\\.)*?)"(?:\s*[,}]|$)/s);
    if (descMatch) {
      description = descMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    tasks.push({
      title,
      description,
      type: 'coding',
      estimatedHours: 4,
      priority: 3,
      requiredSkills: {},
      dependsOn: [],
      linkedWiki: []
    });
  }
  return tasks;
}

// ===== 复杂度评估（用于 decomposeRequirement user message 注入） =====
function assessComplexity(requirement, srs) {
  let score = 0;
  const desc = (requirement.description || '').length;
  const structured = (requirement.structured_description || '').length;
  const scopeItems = (srs.scopeIn || []).length;
  const acItems = (srs.acceptanceCriteria || []).length;
  const constraints = (srs.technicalConstraints || []).length;

  if (desc > 200 || structured > 200) score += 1;
  if (desc > 500 || structured > 500) score += 1;
  if (scopeItems >= 2) score += 1;
  if (scopeItems >= 4) score += 1;
  if (acItems >= 3) score += 1;
  if (acItems >= 6) score += 1;
  if (constraints >= 2) score += 1;

  const complexKeywords = ['数据库', '缓存', '消息队列', '分布式', '微服务', 'API', 'auth', '认证', '权限', '实时', 'websocket', '并发', '事务', '支付', '加密'];
  const text = (requirement.description + ' ' + requirement.structured_description + ' ' + requirement.title).toLowerCase();
  const keywordHits = complexKeywords.filter(k => text.includes(k.toLowerCase())).length;
  if (keywordHits >= 2) score += 1;
  if (keywordHits >= 4) score += 1;

  let complexity, taskRange;
  if (score <= 2) {
    complexity = '🟢 简单'; taskRange = '1-2 个任务';
  } else if (score <= 4) {
    complexity = '🟡 中等'; taskRange = '3-5 个任务';
  } else {
    complexity = '🔴 复杂'; taskRange = '6-8 个任务';
  }
  return `复杂度评估: ${complexity}（评分: ${score}）\n建议任务数: ${taskRange}\n${score <= 2 ? '注意: 这是简单需求，任务描述可以简洁，不需要测试/文档任务。' : ''}`;
}

// ===== 粒度评估（decomposeRequirement 前调用，检查需求是否过大） =====
function assessGranularity(requirement) {
  const desc = (requirement.structured_description || requirement.description || '');
  const srs = JSON.parse(requirement.srs || '{}');
  const scopeIn = srs.scopeIn || [];
  const warnings = [];

  if (scopeIn.length > 5) {
    warnings.push(`功能范围有 ${scopeIn.length} 个顶级条目（建议 ≤5），考虑拆分为 ${Math.ceil(scopeIn.length / 3)} 个独立需求`);
  }

  const techDomains = [];
  const domainKeywords = [
    { word: '渲染|Canvas|DOM|CSS|绘制|动画|UI|界面|布局', domain: '渲染/前端' },
    { word: '音频|音效|音乐|语音|声音', domain: '音频' },
    { word: 'AI|决策|智能|思考', domain: 'AI' },
    { word: '规则|结算|掷骰|伤害|命中|战斗', domain: '规则引擎' },
    { word: '存储|存档|localStorage|IndexedDB|数据库', domain: '数据存储' },
    { word: '网络|API|HTTP|WebSocket|联机', domain: '网络' },
    { word: '构建|编译|打包|部署|CI', domain: 'DevOps' },
  ];
  for (const { word, domain } of domainKeywords) {
    if (new RegExp(word).test(desc) && !techDomains.includes(domain)) {
      techDomains.push(domain);
    }
  }
  if (techDomains.length > 3) {
    warnings.push(`跨 ${techDomains.length} 个技术领域（${techDomains.join('、')}），建议每个需求聚焦 1-2 个领域`);
  }

  const charCount = desc.length;
  if (charCount > 3000) {
    warnings.push(`需求描述 ${charCount} 字（建议 ≤3000），可能覆盖过多内容`);
  }

  const flowKeywords = ['主界面', '入口', '首页', '导航', '集成', '外壳', '流程', '主菜单',
    'main menu', 'entry point', 'navigation', 'integration', 'shell', '引导', '路由'];
  const scopeText = JSON.stringify(scopeIn).toLowerCase();
  const hasFlowItem = flowKeywords.some(kw => scopeText.includes(kw.toLowerCase()));
  if (scopeIn.length >= 3 && !hasFlowItem) {
    warnings.push(`scopeIn 包含 ${scopeIn.length} 个独立模块/子系统，但缺乏「主界面/入口/流程集成」类条目。` +
      `建议补充一条「主界面与用户流程整合」任务，防止各系统独立实现后缺少组装`);
  }

  return { techDomains, warnings };
}

// ===== 产品类型分类（体验型 vs 功能型，决定 decompose 策略） =====
function classifyProductType(description, title, srs) {
  const text = ((title || '') + ' ' + (description || '') + ' ' + JSON.stringify(srs || {})).toLowerCase();

  const experienceSignals = [
    /像素级还原/i, /复刻.*游戏/i, /游戏体验/i, /手感/i, /沉浸/i, /画风/i, /美术风格/i,
    /像素风格/i, /氛围感/i, /原汁原味/i, /好玩/i, /画质/i, /视觉风格/i, /色彩搭配/i,
    /色调/i, /游戏节奏/i, /难度曲线/i, /新手引导.*体验/i, /操作手感/i, /战斗手感/i,
    /游戏性/i, /趣味性/i, /可玩性/i, /看起来像/i, /感觉像/i, /风格一致/i, /复古风格/i,
    /单机游戏/i, /网页游戏/i, /HTML5.*游戏/i, /Canvas.*游戏/i, /战棋/i, /策略游戏/i,
  ];
  let score = 0;
  for (const re of experienceSignals) if (re.test(text)) score += 1;

  const functionSignals = [
    /api\s*接口/i, /数据导入/i, /数据导出/i, /webhook/i, /路由/i, /中间件/i,
    /数据库/i, /crud/i, /查询.*筛选/i, /后台管理/i, /配置管理/i, /管理系统/i,
    /agent/i, /命令行/i, /cli/i, /自动化/i, /工作流/i, /监控/i, /审计/i,
  ];
  let antiScore = 0;
  for (const re of functionSignals) if (re.test(text)) antiScore += 1;

  const net = score - antiScore;
  const type = net >= 3 ? 'experience' : 'function';
  const reason = type === 'experience'
    ? `检测到 ${score} 个体验/感官类关键词，净分 ${net}`
    : `功能型需求（体验关键词 ${score} 个 vs 功能关键词 ${antiScore} 个，净分 ${net}）`;

  return { type, score, antiScore, net, reason };
}

// ===== 体验型产品 decompose 规则（inject 到 LLM prompt） =====
const EXPERIENCE_DECOMPOSE_RULES = `## ⚠ 当前需求判定为【体验型产品】（游戏/创意工具/视觉导向的交互界面）

体验型产品与功能型产品有根本区别：功能型可以"每个模块跑通后拼起来就对了"，但体验型必须"每步都看方向有没有偏"。

### 🔴 强制规则

**1. 模块上限：≤ 4 个核心子需求。** 禁止拆到 5+ 个——拆得越细，每个模块独立验收时看不到全局，拼起来必然不像一个整体。

**2. 强制 MVP 集成体验任务。** 必须创建一个任务，标题含「MVP 集成与体验性验收」，内容：
- 串联所有核心模块的主流程（从入口到首次核心交互结束，约 5-10 分钟体验）
- 验收标准写成「打开后完整走一遍流程，判断：整体感觉对吗？方向需要调整吗？」
- 类型标记为 testing（人工体验验收）
- 必须在所有模块完成后、最终交付前执行

**3. 阶段人工 gate。** 每 2 个模块完成后，下一个验收任务里加上一行「📌 人工检视点 — 确认当前中间状态的方向和质感是否正确」
- 这不是"求用户测试"——这是"给 PM 一个 checkpoint 让产品不会跑飞"

**4. 任务粒度上限。** 单个任务 estimated_hours ≤ 16h（优先 8-12h）。游戏/创意需求的任务如果超过这个粒度，AI 会陷入局部最优看不到全局。

**5. 禁止纯机械验收。** 每个模块的战斗/体验核心任务，验收标准里不能只有命令行自动化测试。必须包含至少一个"人工体验"类验收：如「打开游戏，只玩第 1 个剧本 10 分钟，看能不能坚持玩完」`;

module.exports = {
  safeArr,
  repairJSON,
  extractJSON,
  salvageTasks,
  assessComplexity,
  assessGranularity,
  classifyProductType,
  EXPERIENCE_DECOMPOSE_RULES,
};
