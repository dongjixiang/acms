// AI 辅助服务 — MD文档生成 + 智能任务分解
const modelStore = require('../stores/model-store');
const reqStore = require('../stores/requirement-store');
const { callLLM } = require('./llm-adapter');

// ===== 生成 MD 需求文档 =====
const DOC_SYSTEM_PROMPT = `你是一个专业的需求文档撰写专家。请根据以下需求信息，生成一份结构清晰、用户友好的 Markdown 格式需求文档。

**要求：**
1. 使用中文撰写，语言简洁专业
2. 包含以下章节：需求概述、功能范围、验收标准、📊 成功指标（表格）、技术约束、补充说明
3. 成功指标章节使用表格格式，每行包含可衡量的数字目标：
| 指标项 | 目标值 | 测量方式 |
|--------|--------|----------|
| 页面加载时间 | ≤ 1.5s | Chrome DevTools Network 面板 |
| 并发用户数 | 50 | JMeter 压力测试 |
4. 每个章节内容具体、可执行，避免模糊描述
5. 格式规范，使用恰当的 Markdown 标题、列表、表格
6. 适当使用 Mermaid 图表增强表达，帮助读者快速理解：
   - 业务流程图（flowchart）展示操作流程或状态转移
   - 时序图（sequenceDiagram）展示系统间/模块间的交互
   - 类图/ER 图（classDiagram / erDiagram）展示数据模型
   - 甘特图（gantt）展示项目时间线
   - **只在确实能提升理解时使用图表**，不要为了用而用
   - 图表用 \`\`\`mermaid 代码块包裹
7. 输出纯 Markdown 文本，不要用 JSON 包裹`;

async function generateDoc(reqId, modelId) {
  const requirement = reqStore.getById(reqId);
  if (!requirement) throw Object.assign(new Error('需求不存在'), { status: 404 });

  // Skill 感知
  let docPrompt = null;
  try {
    const skillStore = require('../stores/skill-store');
    docPrompt = skillStore.loadPrompt('skill-requirement-doc');
    if (docPrompt) console.log(`[generateDoc] 从 Skill 加载提示词`);
  } catch (e) { /* */ }

  const srs = JSON.parse(requirement.srs || '{}');

  const messages = [
    { role: 'system', content: docPrompt || DOC_SYSTEM_PROMPT },
    { role: 'user', content: `请为以下需求生成 Markdown 文档：

需求标题: ${requirement.title}
原始描述: ${requirement.description || ''}
当前 SRS:
- 功能范围: ${(srs.scopeIn || []).join('、') || '待定'}
- 排除范围: ${(srs.scopeOut || []).join('、') || '无'}
- 验收标准: ${(srs.acceptanceCriteria || []).join('；') || '待定'}
- 技术约束: ${(srs.technicalConstraints || []).join('、') || '无'}
- 需求摘要: ${srs.summary || ''}` },
  ];

  const result = await callLLM(modelId, messages, { temperature: 0.5, maxTokens: 3000 });

  // 自动保存到项目工作区
  try {
    const workspace = require('./workspace-service');
    const projectStore = require('../stores/project-store');
    const project = projectStore.getById(requirement.project_id);
    if (project) {
      workspace.saveRequirementDoc(project.slug || project.name, requirement.id, requirement.title, result.content);
    }
  } catch (e) { /* 非关键 */ }

  return { content: result.content, modelUsed: result.modelUsed };
}

// ===== 需求复杂度评估 =====
function assessComplexity(requirement, srs) {
  let score = 0;
  const desc = (requirement.description || '').length;
  const structured = (requirement.structured_description || '').length;
  const scopeItems = (srs.scopeIn || []).length;
  const acItems = (srs.acceptanceCriteria || []).length;
  const constraints = (srs.technicalConstraints || []).length;

  // 描述长度
  if (desc > 200 || structured > 200) score += 1;
  if (desc > 500 || structured > 500) score += 1;
  // 功能范围项数
  if (scopeItems >= 2) score += 1;
  if (scopeItems >= 4) score += 1;
  // 验收标准数
  if (acItems >= 3) score += 1;
  if (acItems >= 6) score += 1;
  // 技术约束
  if (constraints >= 2) score += 1;
  // 关键词检测（复杂领域）
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

// ===== JSON 修复工具 =====
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
  // 如果截断在字符串内，先闭合字符串
  if (inString) fixed += '"';
  // 补缺失的闭合括号 — 从最后向前找对应的开括号
  if (depth > 0) {
    // 重建闭合：倒序遍历找未闭合的开括号类型
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

// ===== 智能任务分解 =====
const DECOMPOSE_SYSTEM_PROMPT = `你是一个经验丰富的技术项目经理。请根据需求规格说明，将需求分解为可执行的任务列表。

**按复杂度调整粒度（重要！）：**

| 复杂度 | 判断标准 | 任务数 | 示例 |
|--------|---------|--------|------|
| 🟢 简单 | 单一功能点、改文案/加字段/调样式 | **1-2个** | "给按钮加loading状态"、"增加导出按钮" |
| 🟡 中等 | 独立功能模块、涉及2-3个文件 | **3-5个** | "用户登录功能"、"天气粒子特效" |
| 🔴 复杂 | 跨系统/跨模块、涉及数据库/API/多端 | **6-8个** | "微服务拆分"、"实时协作编辑" |

**简单需求的任务描述可以简洁**——只需要任务目标 + 验收方式即可，不需要写满6段。
**简单需求不要强行拆出"测试任务"和"文档任务"**——如果改动很小（<10行代码），一个任务包含实现+自测即可。

**分解原则：**
1. 每个任务应该是独立可交付的单元
2. 识别任务间的依赖关系（用任务标题引用，稍后系统会映射为 ID）
3. 为每个任务标注所需技能和水平
4. 如有相关 Wiki 文档（技术规范、API 文档），注明引用路径

> 注意：任务描述用纯 Markdown（标题/列表/表格），不要用 Mermaid 图表。Mermaid 只用在需求文档生成阶段。

**任务类型：** coding(编码) | design(设计) | testing(测试) | documentation(文档) | review(审查) | audio(音频) | modeling(建模)

**每个任务的 description 必须包含（用 Markdown 格式）：**
1. **任务目标** — 一句话说明要完成什么
2. **实现要点** — 具体的实现思路、技术方案、关键算法或架构决策
3. **涉及文件** — 预计需要创建或修改的文件路径列表
4. **验收方式（SMART — 必须包含可验证的具体标准）**
   - coding 任务：说明运行命令（如 npm test weather.test.js）、期望通过率（100% pass）、关键性能阈值（帧率 ≥ 30fps, latency ≤ 200ms）
   - design 任务：说明交付物格式（如 Figma 链接 / 方案对比文档）和评审通过标准
   - testing 任务：说明测试覆盖目标（覆盖率 ≥ 80%）、测试用例数量、通过的测试套件名
   - ❌ 错误写法: "手动测试通过即可"、"代码审查通过"（无法验证）
   - ✅ 正确写法: "npm test → 23/23 passed; curl /api/weather?city=Beijing → 返回 JSON, latency ≤ 200ms"
5. **注意事项** — 边界情况、性能要求、兼容性考虑
6. **参考资料** — 相关的文档、Wiki 页面、API 规范链接

**输出格式（严格JSON）：**
{
  "tasks": [
    {
      "title": "任务标题",
      "description": "## 任务目标\\n实现XXX功能\\n\\n## 实现要点\\n- 使用Three.js的PointsMaterial\\n- 粒子数量1000+，使用BufferGeometry优化\\n\\n## 涉及文件\\n- client/systems/weather/rain.js（新建）\\n- client/systems/weather/index.js（修改）\\n\\n## 验收方式\\n- npm test weather\\n- 手动验证：打开场景确认粒子效果\\n- 帧率≥30fps\\n\\n## 注意事项\\n- 注意内存泄漏，粒子回收\\n- 兼容Chrome/Edge\\n\\n## 参考资料\\n- [[技术/Three.js粒子系统]]",
      "type": "coding",
      "estimatedHours": 8,
      "priority": 1,
      "requiredSkills": { "coding": 1.5, "threejs": 1.0 },
      "dependsOn": [],
      "linkedWiki": ["技术/Three.js粒子系统.md"]
    }
  ],
  "summary": "分解说明"
}`;

async function decomposeRequirement(reqId, modelId) {
  const requirement = reqStore.getById(reqId);
  if (!requirement) throw Object.assign(new Error('需求不存在'), { status: 404 });
  if (requirement.status !== 'approved') throw Object.assign(new Error('只有已确认的需求才能分解'), { status: 400 });

  // Skill 感知
  let decomposePrompt = null;
  try {
    const skillStore = require('../stores/skill-store');
    decomposePrompt = skillStore.loadPrompt('skill-task-decompose');
    if (decomposePrompt) console.log(`[decompose] 从 Skill 加载提示词`);
  } catch (e) { /* */ }

  const srs = JSON.parse(requirement.srs || '{}');

  const messages = [
    { role: 'system', content: decomposePrompt || DECOMPOSE_SYSTEM_PROMPT },
  ];

  // 注入可用的 Skill 列表
  try {
    const skillStore = require('../stores/skill-store');
    const skillList = skillStore.exportForPrompt();
    if (skillList) {
      messages.push({ role: 'system', content: `## 可用技能模板（优先匹配使用）\n\n以下技能定义了常见任务类型的标准做法。如果需求涉及这些类型，请优先按技能模板创建任务：\n\n${skillList}` });
    }
  } catch (e) { /* 非关键 */ }

  messages.push(
    { role: 'user', content: `请分解以下需求：

${assessComplexity(requirement, srs)}

标题: ${requirement.title}
描述: ${requirement.structured_description || requirement.description || ''}
功能范围: ${(srs.scopeIn || []).join('、')}
验收标准: ${(srs.acceptanceCriteria || []).join('；')}
技术约束: ${(srs.technicalConstraints || []).join('、')}
Wiki 参考: ${requirement.wiki_path || '无'}

请生成任务列表。` }
  );

  const result = await callLLM(modelId, messages, { temperature: 0.5, maxTokens: 8000, jsonMode: true });
  const content = result.content;

  // 提取 JSON — 多层容错：直接解析 → 剥 markdown → 修复 → 拆解标题
  const extracted = extractJSON(content);
  if (!extracted) {
    console.error('[decompose] 未找到 JSON 对象，原始内容前200字:', content.substring(0, 200));
    return { tasks: [], summary: '解析失败: 未找到有效 JSON', modelUsed: result.modelUsed };
  }

  let parsed;
  // 第1层：原始提取直接解析
  try { parsed = JSON.parse(extracted); } catch {}
  // 第2层：修复后再试
  if (!parsed) {
    try { parsed = JSON.parse(repairJSON(extracted)); } catch {}
  }
  // 第3层：修复失败，尝试从修复后的 JSON 中提取 tasks 标题（保底）
  if (!parsed) {
    console.error('[decompose] 修复后仍无法解析，原始内容前200字:', content.substring(0, 200));
    const salvaged = salvageTasks(extracted);
    return { tasks: salvaged, summary: '部分解析成功（JSON 格式异常，已尽力提取）', modelUsed: result.modelUsed };
  }

  return { ...parsed, modelUsed: result.modelUsed };

// ---- 辅助函数 ----

/** 从 LLM 输出中提取 JSON 文本 */
function extractJSON(content) {
  // 先尝试直接解析
  try { JSON.parse(content); return content; } catch {}
  // 剥离 markdown 代码块
  const stripped = content.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();
  const m = stripped.match(/\{[\s\S]*\}/);
  return m ? m[0] : null;
}

/** JSON 彻底坏掉时的保底：从原始文本中捕获 title 和 description */
function salvageTasks(text) {
  const tasks = [];
  // 按任务对象分割（以 {\n 或 { "title 开头）
  const blocks = text.split(/\{(?=\s*"title")/g);
  for (const block of blocks) {
    if (!block.includes('"title"')) continue;
    const titleMatch = block.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (!titleMatch) continue;
    const title = titleMatch[1];
    // 尝试提取 description（可能在多行 JSON 中）
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
}

module.exports = { generateDoc, decomposeRequirement };
