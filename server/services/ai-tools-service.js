// AI 辅助服务 — MD文档生成 + 智能任务分解
const modelStore = require('../stores/model-store');
const reqStore = require('../stores/requirement-store');
const { callLLM } = require('./llm-adapter');

// ===== 工具函数 =====
function safeArr(val) {
  return Array.isArray(val) ? val : [];
}

// ===== 生成 MD 需求文档 =====
const DOC_SYSTEM_PROMPT = `你是一个专业的需求文档撰写专家。请根据以下需求信息，生成一份结构清晰、用户友好的 Markdown 格式需求文档。

**要求：**

1. 使用中文撰写，语言简洁专业

2. **章节结构（按顺序，不可省略任何章节）：**
   - 需求概述（必须能用一句话说清核心价值，如果说不清 → 需要拆分成多个需求）
   - 版本信息（文档版本号、创建日期、作者、变更记录）
   - 功能范围（按优先级 P0/P1/P2 分级，并明确标注不包含功能）
   - 共享接口（标记哪些数据模型/API 会被多个模块依赖）
   - 验收标准（合并指标+目标值+测量方式+验收命令，一行搞定）
   - 技术约束（做决策，不说"或"）
   - Mermaid 图表（放在相关章节内，不要堆在"补充说明"）
   - 补充说明（仅限边界情况、风险、假设——不要放图表或接口定义）

3. **需求粒度控制（3-3-8 规则）：**
   - 一个需求应当覆盖 1-2 个技术领域（如"核心战斗系统"是一个领域，"音频+渲染"是两个——应拆为两个需求）
   - 预估分解后产出 3-8 个任务。超过 8 个 → 需求过大，应拆分为多个独立需求
   - 共享接口不超过 3 个。如果超过 → 考虑提取"基础平台"需求单独管理
   - 警告信号（出现以下任一，需求过大）：
     · 一句话说不清核心价值
     · 包含功能超过 5 个顶级条目
     · 跨 3 个以上技术领域

3. **功能范围按优先级分级：**
   - P0 (必须): MVP 不可或缺的功能
   - P1 (应该): 重要但可首版延后
   - P2 (可以): 锦上添花，资源允许时做

4. **共享接口必须包含：**
   - 接口名称 (如 Unit, GameState, Map)
   - 关键字段 (字段名、类型、用途说明)
   - 被哪些功能模块依赖
   - 示例表格：
   | 接口名 | 关键字段 | 被依赖模块 |
   |--------|---------|-----------|
   | Unit | ownerId(string), weapons(Weapon[]), currentWounds(int) | 规则引擎、AI、渲染、军队构建器 |

5. **验收标准必须每行包含 4 列：**
   | 指标项 | 目标值 | 测量方式 | 验收命令 |
   |--------|--------|----------|----------|
   | 回合结算时间 | ≤5秒 | 游戏内埋点计时 | npm test performance -- --scenario=medium |
   | 首屏加载 | ≤3秒 | Lighthouse CI | npx lighthouse http://localhost:5173 --budget-path=budget.json |
   注意：测量方式优先选择可自动化执行的方案（命令行、CI、脚本），只有在确实无法自动化时才使用手动方式。

6. **技术约束必须做出明确决策：**
   - ❌ 错误: "使用 Canvas 或 DOM+CSS" (这是选择题，不是约束)
   - ✅ 正确: "使用 Canvas 2D（决策理由：大量棋子绘制性能优于 DOM+CSS，参见技术评估附录）"
   - 每个技术选型必须说明决策理由

7. **Mermaid 图表必须放在相关章节内：**
   - ER 图/类图 → 放在「共享接口」章节
   - 流程图 → 放在对应功能描述下方
   - 时序图 → 放在模块交互说明下方
   - 甘特图 → 放在补充说明（如有项目计划）
   - 禁止把所有图表堆在一个叫"补充说明"的章节末尾

8. 输出纯 Markdown 文本，不要用 JSON 包裹`;

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
- 功能范围: ${safeArr(srs.scopeIn).join('、') || '待定'}
- 排除范围: ${safeArr(srs.scopeOut).join('、') || '无'}
- 验收标准: ${safeArr(srs.acceptanceCriteria).join('；') || '待定'}
- 技术约束: ${safeArr(srs.technicalConstraints).join('、') || '无'}
- 需求摘要: ${srs.summary || ''}` },
  ];

  const result = await callLLM(modelId, messages, { temperature: 0.5, maxTokens: 6000, projectId: requirement.project_id, caller: 'generateDoc' });

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
5. **接口先行** — 如果多个任务共享数据模型/API/事件总线，必须创建独立的「接口定义」任务作为所有依赖任务的前置。接口任务产出的是接口文件（JSDoc 类型定义、接口文档），不是完整实现。后续任务必须引用接口任务作为依赖
6. **粒度控制** — 每个 coding 任务应该只修改 1-3 个文件，核心逻辑 ≤200 行。如果一个任务需要同时实现数据模型 + 业务逻辑 + 渲染，拆分之
7. **验收可自动化** — 每个任务的验收标准必须包含至少一条可机器执行的命令（如 npm test、node --check file.js、curl 检查 API）。禁止使用「手动验证」「代码审查通过」作为唯一验收方式
8. **Fan-out / Fan-in 分解模式**（参考 kanban-orchestrator）
   - 识别可并行的独立工作流 → 拆成无依赖关系的并行任务
   - 识别需要汇总合并的工作流 → 创建「汇总」任务，依赖所有并行产出
   - 示例：2个研究者并行调研 → 1个分析师汇总 → 1个实现者执行
   - 「和」「也」「最后」等词不自动意味着依赖关系——只有一方产出是另一方的输入时才建依赖
9. **角色分配** — 根据任务性质标注建议执行角色：researcher（调研）、designer（设计）、backend-eng（后端）、frontend-eng（前端）、reviewer（审核）、pm（产品）

10. **流程完整性** — 分解前先画出完整的用户操作流程链：

       启动 → 主界面 → 功能A → 功能B → 结算 → 返回

    确保这条链上的 **每个环节** 都有任务覆盖，特别是：

    - **入口任务** — 谁负责渲染主界面？谁负责启动流程？
    - **导航任务** — 用户在界面间如何切换？
    - **集成任务** — 各子系统如何串起来形成完整的用户交互路径？
    - **边界/空态任务** — 没数据时显示什么？加载失败怎么处理？

    ❌ 错误：5 个子系统各自独立实现，没人做外壳和串联
    ✅ 正确：分解中包含「XX流程整合」或「游戏外壳」类任务

> 注意：任务描述用纯 Markdown（标题/列表/表格），不要用 Mermaid 图表。Mermaid 只用在需求文档生成阶段。

**任务类型：** coding(编码) | design(设计) | testing(测试) | documentation(文档) | review(审查) | audio(音频) | modeling(建模) | image-gen(图片生成) | audio-gen(音频生成)

> 当需求涉及配图、UI 原型图、产品展示图、游戏素材、角色头像等视觉内容时，创建 image-gen 类型任务。
> 当需求涉及角色语音、背景音乐、音效、配音、产品介绍音频等内容时，创建 audio-gen 类型任务。

**每个任务的 description 必须包含（用 Markdown 格式）：**
1. **任务目标** — 一句话说明要完成什么
2. **前置条件** — 列出执行前必须已存在的接口、文件、环境：
   - 依赖接口：列出 from depends_contract 的关键函数签名（如 Unit 类必须包含 ownerId: string 字段）
   - 依赖文件：列出只读依赖的文件路径和用途
   - 环境要求：Node 版本、必需的 npm 包
3. **接口产出** — 本任务完成后对外暴露的接口（后续任务会依赖这些）：
   - 产出文件路径
   - 导出函数/类的签名（参数+返回值）
   - 示例：export function resolveShooting(attacker, defender, weapon, map) -> CombatResult
4. **实现要点** — 具体的实现思路、技术方案、关键算法或架构决策。必须包含一条"测试先行"提示
5. **涉及文件** — 每行标注操作类型：
   - (新建) — 需要创建
   - (修改) — 需要改动（说明具体改动内容，不要只写"修改"）
   - (只读) — 不能改动但需要引用的文件
6. **验收方式（SMART — 必须包含可验证的具体标准）**
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
      "description": "## 任务目标\\n实现XXX功能...",
      "type": "coding",
      "estimatedHours": 8,
      "priority": 1,
      "requiredSkills": { "coding": 1.5, "threejs": 1.0 },
      "dependsOn": [],
      "dependsContract": [
        { "taskTitle": "接口定义任务", "contract": "需要 Unit.js 导出的 Unit 类包含 ownerId 字段", "file": "src/models/Unit.js" }
      ],
      "linkedWiki": []
    }
  ],
  "summary": "分解说明"
}`;

// ── 粒度评估（在 decomposeRequirement 前调用）──
function assessGranularity(requirement) {
  const desc = (requirement.structured_description || requirement.description || '');
  const srs = JSON.parse(requirement.srs || '{}');
  const scopeIn = srs.scopeIn || [];
  const warnings = [];

  // 检查1: 功能范围顶级条目过多
  if (scopeIn.length > 5) {
    warnings.push(`功能范围有 ${scopeIn.length} 个顶级条目（建议 ≤5），考虑拆分为 ${Math.ceil(scopeIn.length / 3)} 个独立需求`);
  }

  // 检查2: 描述过长（粗略估算技术领域数）
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

  // 检查3: 描述字数估算任务数
  const charCount = desc.length;
  if (charCount > 3000) {
    warnings.push(`需求描述 ${charCount} 字（建议 ≤3000），可能覆盖过多内容`);
  }

  // 检查4: 流程完整性 — scopeIn 全是子系统/模块，缺少入口集成
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

async function decomposeRequirement(reqId, modelId) {
  const requirement = reqStore.getById(reqId);
  if (!requirement) throw Object.assign(new Error('需求不存在'), { status: 404 });
  if (requirement.status !== 'approved') throw Object.assign(new Error('只有已确认的需求才能分解'), { status: 400 });

  // ── 粒度预检查 ──
  const granularity = assessGranularity(requirement);
  if (granularity.warnings.length > 0) {
    console.log(`[decompose] ⚠ 需求粒度警告: ${granularity.warnings.join('; ')}`);
    // 返回警告但不阻塞——让 AI 带着警告去分解
  }

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

  // 注入当前系统的多模态能力信息
  try {
    const modelStore = require('../stores/model-store');
    const activeModels = modelStore.getActive();
    const visionModels = modelStore.getActiveWithCapability('vision');
    const genStore = require('../stores/gen-store');
    const imageGens = genStore.list('image');
    const audioGens = genStore.list('audio');

    const capLines = [];
    capLines.push(`## 当前系统能力`);

    // 视觉理解能力
    if (visionModels.length > 0) {
      capLines.push(`- 👁️ 视觉理解: ${visionModels.map(m => m.name).join('、')} — 可以分析图片内容`);
    } else {
      capLines.push(`- 👁️ 视觉理解: 无 — 暂时无法分析生成的图片`);
    }

    // 图片生成能力
    if (imageGens.length > 0) {
      capLines.push(`- 🎨 图片生成可用: ${imageGens.map(g => `${g.name}(${g.provider})`).join('、')}`);
      if (requirement.description && /配图|UI图|产品图|素材|图标|海报|渲染图|头像|封面/i.test(requirement.description)) {
        capLines.push(`  ⚡ 当前需求涉及视觉内容，建议创建 image-gen 类型任务`);
      }
    }

    // 音频生成能力
    if (audioGens.length > 0) {
      capLines.push(`- 🔊 音频生成可用: ${audioGens.map(g => `${g.name}(${g.provider})`).join('、')}`);
      if (requirement.description && /语音|配音|音乐|旁白|音效|背景音乐|播报|朗读/i.test(requirement.description)) {
        capLines.push(`  ⚡ 当前需求涉及音频内容，建议创建 audio-gen 类型任务`);
      }
    }

    if (capLines.length > 1) {
      messages.push({ role: 'system', content: capLines.join('\\n') });
    }
  } catch (e) { /* 非关键 — 能力注入失败不影响分解 */ }

  messages.push(
    { role: 'user', content: `请分解以下需求：

${assessComplexity(requirement, srs)}
${granularity.warnings.length > 0 ? `\\n⚠ **粒度警告：** ${granularity.warnings.join('；')}\\n如果需求过大，请在分解时主动提取可独立的子模块，标注为\"建议拆分为独立需求\"。\\n` : ''}
标题: ${requirement.title}
描述: ${requirement.structured_description || requirement.description || ''}
功能范围: ${safeArr(srs.scopeIn).join('、')}
验收标准: ${safeArr(srs.acceptanceCriteria).join('；')}
技术约束: ${safeArr(srs.technicalConstraints).join('、')}
Wiki 参考: ${requirement.wiki_path || '无'}

请生成任务列表。` }
  );

  const result = await callLLM(modelId, messages, { temperature: 0.5, maxTokens: 8000, jsonMode: true, projectId: requirement.project_id, caller: 'decompose' });
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

module.exports = { generateDoc, decomposeRequirement, refineSection, checkConsistency };

// ===== 逐段润色 =====
const REFINE_SECTION_PROMPT = `你是一个专业的需求文档润色专家。用户会给你一个需求文档中的**特定段落**，以及**修改指示**。

**核心原则（重要！）：保留已有内容，只做必要的增补和调整。**

**要求：**
1. **保留原有内容** — 已有文字、指标、列表、表格原则上不动，只补充缺少的部分
2. **不重写** — 除非修改指示明确要求替换某段文字，否则保持原文不变
3. 保持整体 Markdown 风格一致
4. 除非修改指示要求调整章节标题，否则保留原标题
5. 输出纯 Markdown 文本，不要用 JSON 包裹
6. 直接输出润色后的完整段落内容（包括标题），不要添加额外说明

**好与不好的例子：**
✅ 已有验收标准写了3条，缺1条 → 在末尾追加第4条，前3条不动
❌ 已有验收标准写了3条 → AI 全部推翻重写成5条（禁止）
✅ 已有指标值 "帧率 ≥30fps"，建议改为 ≥60fps → 只改数值，保留结构
❌ 已有指标值 "帧率 ≥30fps"，建议改为 ≥60fps → 把整行重写成不同格式（禁止）
✅ 已有技术约束 "Canvas 2D"，新增功能需要补充 → 在末尾追加新约束，已有不动`;

async function refineSection(modelId, sectionTitle, sectionContent, fullDoc, instruction) {
  const messages = [
    { role: 'system', content: REFINE_SECTION_PROMPT },
    { role: 'user', content: `## 完整文档（供参考上下文）\n\n${fullDoc}\n\n---\n\n## 需要润色的段落\n\n### 段落标题\n${sectionTitle}\n\n### 当前内容\n${sectionContent}\n\n### 修改指示\n${instruction || '请保持原意，优化表达，使其更清晰专业'}\n\n请输出润色后的完整段落内容（含标题）。` },
  ];

  const result = await callLLM(modelId, messages, { temperature: 0.5, maxTokens: 4000, caller: 'refineSection' });
  return { content: result.content, modelUsed: result.modelUsed };
}

// ===== 编辑后关联检查 =====
const CONSISTENCY_CHECK_PROMPT = `你是一个需求文档的一致性审查专家。用户的修改可能影响其他章节。

**你的任务：**
分析用户修改某个段落后，其他章节中是否存在**数值冲突、数据不一致、过期引用**等问题。

**重点检查方向（按优先级）：**
1. **数值一致性** — 如果修改前是"50×30"，修改后是"50×40"，检查其他章节是否还写着"50×30"
2. **内容删除级联** — **如果某段删除了某个概念/主题/功能/关键词，检查其他章节是否还在引用它**
   - 示例：需求概述删除了"战锤"相关描述 → 功能范围、验收标准、技术约束中所有涉及"战锤"的内容也应标记
   - 示例：删除了「皮肤/主题切换」功能 → 验收标准中对应的验收指标、成功指标中相关条目也应标记
3. **依赖关系** — 功能范围新增了条目，验收标准是否缺对应指标
4. **术语更新** — 修改前和修改后的术语/名称是否在其他章节还有旧称
5. **范围一致性** — 需求概述的概括描述是否还准确

**suggestion 必须具体到可操作的程度：**
- ✅ 正确示例: "删除验收标准中「3.7 主题切换」整条条目，因为需求概述已取消皮肤功能"
- ✅ 正确示例: "将功能范围中「战锤主题美术资源包」改为「通用美术资源包」"
- ✅ 正确示例: "删除成功指标表中「主题切换响应时间≤200ms」这一行"
- ❌ 错误示例: "请更新相关内容"（太模糊，无法操作）
- ❌ 错误示例: "建议删除相关引用"（没说明删什么）

**输出格式（严格 JSON）：**
{
  "affectedSections": [
    {
      "section": "受影响的章节标题",
      "status": "needsUpdate" 或 "ok",
      "reason": "简述为什么需要/不需要修改",
      "suggestions": ["具体、可操作的修改建议"]
    }
  ]
}

**原则：**
1. 只有真正有依赖关系的章节才标记为 needsUpdate
2. **数值必须逐项对比**——如果修改后的数值与另一章的数值不同，必须标记为 needsUpdate
3. 每条 suggestion 必须是可操作的具体修改建议，不是模糊方向
4. 如果修改无影响，所有 status 为 "ok"
5. 返回所有已知章节，不要遗漏`;

async function checkConsistency(modelId, editedSection, oldContent, newContent, fullDoc) {
  // 从文档中提取所有章节标题
  const sectionTitles = [];
  const headingRegex = /^## (.+)$/gm;
  let match;
  while ((match = headingRegex.exec(fullDoc)) !== null) {
    if (match[1] !== editedSection) {
      sectionTitles.push(match[1]);
    }
  }

  const messages = [
    { role: 'system', content: CONSISTENCY_CHECK_PROMPT },
    { role: 'user', content: `## 完整文档\n\n${fullDoc}\n\n---\n\n## 被修改的章节\n标题: ${editedSection}\n\n### 修改前内容\n${oldContent}\n\n### 修改后内容\n${newContent}\n\n## 需要检查的其他章节\n${sectionTitles.map(t => `- ${t}`).join('\n')}\n\n请分析每章是否需要调整。` },
  ];

  const result = await callLLM(modelId, messages, { temperature: 0.3, maxTokens: 4000, jsonMode: true, caller: 'checkConsistency' });
  return { ...result, modelUsed: result.modelUsed };
}
