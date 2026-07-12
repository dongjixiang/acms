// ACMS AI 工具层 — 智能任务分解（v0.23 L2 拆分）
// 原 ai-tools-service.js L198-608 提取（DECOMPOSE_SYSTEM_PROMPT + decomposeRequirement）
const reqStore = require('../stores/requirement-store');
const taskStore = require('../stores/task-store');
const { callLLM } = require('./llm-adapter');
const {
  safeArr,
  repairJSON,
  extractJSON,
  salvageTasks,
  assessComplexity,
  assessGranularity,
  classifyProductType,
  EXPERIENCE_DECOMPOSE_RULES,
} = require('./ai-tools-utils');

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

⚠ **原则 0（优先级最高） — 流程完整性检查：**

在开始分解具体任务前，**先画出完整的用户操作流程链**：

\`\`\`
启动 → 主界面 → 功能A → 功能B → 结算 → 返回
\`\`\`

确认这条链上的 **每个环节** 的任务都已覆盖。特别检查以下 4 类任务是否存在：

| 缺失类型 | 表现 | 后果 |
|---------|------|------|
| 🔴 **入口任务** | 无 index.html / main.ts / app.py | 用户不知从哪启动 |
| 🔴 **导航任务** | 模块 A → 模块 B 的跳转无定义 | UI 组件各自孤立 |
| 🔴 **集成任务** | 子系统接口无人对接 | 零件齐全但装不起来 |
| 🔴 **边界/空态任务** | 无数据/加载失败/空列表未处理 | 运行时直接崩溃 |

**如果以上 4 类中任意一类缺失，必须在任务列表中补充一个「XX流程整合」或「系统入口」任务。**

❌ 反面案例：5 个子系统各自独立实现，没有入口文件、没有路由、没有模块间对接任务 → 14 个任务全部完成后才发现游戏无法启动
✅ 正确做法：分解中包含「主界面与流程整合」任务，负责创建入口文件并串联所有模块

1. 每个任务应该是独立可交付的单元
2. 识别任务间的依赖关系（用任务标题引用，稍后系统会映射为 ID）
3. 为每个任务标注所需技能和水平
4. 如有相关 Wiki 文档（技术规范、API 文档），注明引用路径
5. **接口先行** — 如果多个任务共享数据模型/API/事件总线，必须创建独立的「接口定义」任务作为所有依赖任务的前置。接口任务产出的是接口文件（JSDoc 类型定义、接口文档），不是完整实现。后续任务必须引用接口任务作为依赖
6. **粒度控制** — 每个 coding 任务应该只修改 1-3 个文件，核心逻辑 ≤200 行。如果一个任务需要同时实现数据模型 + 业务逻辑 + 渲染，拆分之
7. **验收可自动化** — 每个任务的验收标准必须包含至少一条可机器执行的命令（如 npm test、node --check file.js、curl 检查 API）。禁止使用「手动验证」「代码审查通过」作为唯一验收方式
8. **Fan-out / Fan-in 分解模式**：识别可并行的独立工作流 → 拆成无依赖关系的并行任务；识别需要汇总合并的工作流 → 创建「汇总」任务，依赖所有并行产出
9. **角色分配** — 根据任务性质标注建议执行角色：researcher（调研）、designer（设计）、backend-eng（后端）、frontend-eng（前端）、reviewer（审核）、pm（产品）

**任务类型：** coding(编码) | design(设计) | testing(测试) | documentation(文档) | review(审查) | audio(音频) | modeling(建模) | image-gen(图片生成) | audio-gen(音频生成)

**每个任务的 description 必须包含（用 Markdown 格式）：**
1. **任务目标** — 一句话说明要完成什么
2. **前置条件** — 列出执行前必须已存在的接口、文件、环境
3. **接口产出** — 产出文件路径 + 导出函数/类的签名
4. **实现要点** — 具体的实现思路、技术方案、关键算法或架构决策
5. **涉及文件** — 每行标注操作类型：(新建)/(修改)/(只读)
6. **验收方式（SMART — 必须包含可验证的具体标准）** — coding 任务：运行命令 + 期望通过率 + 关键性能阈值；design 任务：交付物格式 + 评审通过标准
7. **注意事项** — 边界情况、性能要求、兼容性考虑
8. **参考资料** — 相关的文档、Wiki 页面、API 规范链接

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
      "dependsContract": [{ "taskTitle": "接口定义任务", "contract": "需要 Unit.js 导出的 Unit 类包含 ownerId 字段", "file": "src/models/Unit.js" }],
      "linkedWiki": []
    }
  ],
  "summary": "分解说明"
}`;

async function decomposeRequirement(reqId, modelId) {
  const requirement = reqStore.getById(reqId);
  if (!requirement) throw Object.assign(new Error('需求不存在'), { status: 404 });
  if (requirement.status !== 'approved') throw Object.assign(new Error('只有已确认的需求才能分解'), { status: 400 });

  const granularity = assessGranularity(requirement);
  if (granularity.warnings.length > 0) {
    console.log(`[decompose] ⚠ 需求粒度警告: ${granularity.warnings.join('; ')}`);
  }

  let decomposePrompt = null;
  try {
    const skillStore = require('../stores/skill-store');
    decomposePrompt = skillStore.loadPrompt('skill-task-decompose');
    if (decomposePrompt) console.log(`[decompose] 从 Skill 加载提示词`);
  } catch (e) { /* */ }

  const srs = JSON.parse(requirement.srs || '{}');

  const productType = classifyProductType(
    requirement.description || requirement.structured_description || '',
    requirement.title || '',
    srs
  );
  console.log(`[decompose] 产品类型: ${productType.type} (${productType.reason})`);

  const messages = [
    { role: 'system', content: decomposePrompt || DECOMPOSE_SYSTEM_PROMPT },
  ];

  if (productType.type === 'experience') {
    messages.push({ role: 'system', content: EXPERIENCE_DECOMPOSE_RULES });
    console.log(`[decompose] ⚡ 注入体验型分解规则（模块上限 4、强制 MVP 集成、阶段人工 gate）`);
  }

  try {
    const skillStore = require('../stores/skill-store');
    const skillList = skillStore.exportForPrompt();
    if (skillList) {
      messages.push({ role: 'system', content: `## 可用技能模板（优先匹配使用）\n\n以下技能定义了常见任务类型的标准做法。如果需求涉及这些类型，请优先按技能模板创建任务：\n\n${skillList}` });
    }
  } catch (e) { /* 非关键 */ }

  // 多模态能力注入
  try {
    const modelStore = require('../stores/model-store');
    const activeModels = modelStore.getActive();
    const visionModels = modelStore.getActiveWithCapability('vision');
    const genStore = require('../stores/gen-store');
    const imageGens = genStore.list('image');
    const audioGens = genStore.list('audio');

    const capLines = [`## 当前系统能力`];
    if (visionModels.length > 0) {
      capLines.push(`- 👁️ 视觉理解: ${visionModels.map(m => m.name).join('、')} — 可以分析图片内容`);
    } else {
      capLines.push(`- 👁️ 视觉理解: 无 — 暂时无法分析生成的图片`);
    }
    if (imageGens.length > 0) {
      capLines.push(`- 🎨 图片生成可用: ${imageGens.map(g => `${g.name}(${g.provider})`).join('、')}`);
      if (requirement.description && /配图|UI图|产品图|素材|图标|海报|渲染图|头像|封面/i.test(requirement.description)) {
        capLines.push(`  ⚡ 当前需求涉及视觉内容，建议创建 image-gen 类型任务`);
      }
    }
    if (audioGens.length > 0) {
      capLines.push(`- 🔊 音频生成可用: ${audioGens.map(g => `${g.name}(${g.provider})`).join('、')}`);
      if (requirement.description && /语音|配音|音乐|旁白|音效|背景音乐|播报|朗读/i.test(requirement.description)) {
        capLines.push(`  ⚡ 当前需求涉及音频内容，建议创建 audio-gen 类型任务`);
      }
    }
    const videoGens = genStore.list('video');
    if (videoGens.length > 0) {
      capLines.push(`- 🎬 视频生成可用: ${videoGens.map(g => `${g.name}(${g.provider})`).join('、')}`);
      if (requirement.description && /视频|动画|演示|宣传片|动态|片段|特效|场景动画|角色动画|过场/i.test(requirement.description)) {
        capLines.push(`  ⚡ 当前需求涉及视频内容，建议创建 video-gen 类型任务`);
      }
    }
    if (capLines.length > 1) {
      messages.push({ role: 'system', content: capLines.join('\\n') });
    }
  } catch (e) { /* 非关键 */ }

  // 已有任务列表注入（防重复）
  try {
    const existingTasks = taskStore.list({ parentId: reqId });
    if (existingTasks.length > 0) {
      const taskList = existingTasks.map((t, i) => `${i + 1}. [${t.status}] ${t.title}${t.priority ? ` (P${t.priority})` : ''}`).join('\n');
      messages.push({
        role: 'system',
        content: `## 已有任务列表（请勿重复创建）\n\n以下 ${existingTasks.length} 个任务已隶属于该需求。AI 的任务是「补充缺失的任务」，不是重新生成整套。\n\n请逐一对比：如果新任务与某个已有任务标题或功能重叠，请跳过不创建。\n\n${taskList}\n\n⚠ 重要：仅创建当前需求尚缺失的任务，不要创建任何与已有任务重复或功能重叠的任务。`
      });
      console.log(`[decompose] 注入 ${existingTasks.length} 个已有任务，引导 AI 增量分解`);
    }
  } catch (e) { /* 非关键 */ }

  messages.push(
    { role: 'user', content: `请分解以下需求：

${assessComplexity(requirement, srs)}
${granularity.warnings.length > 0 ? `\n⚠ **粒度警告：** ${granularity.warnings.join('；')}\n如果需求过大，请在分解时主动提取可独立的子模块，标注为\"建议拆分为独立需求\"。\n` : ''}
标题: ${requirement.title}
描述: ${requirement.structured_description || requirement.description || ''}
功能范围: ${safeArr(srs.scopeIn).join('、')}
验收标准: ${safeArr(srs.acceptanceCriteria).join('；')}
技术约束: ${safeArr(srs.technicalConstraints).join('、')}
Wiki 参考: ${requirement.wiki_path || '无'}

请生成任务列表。` }
  );

  const result = await callLLM(modelId, messages, { temperature: 0.5, maxTokens: 32000, jsonMode: true, projectId: requirement.project_id, caller: 'decompose' });
  const content = result.content;

  const extracted = extractJSON(content);
  if (!extracted) {
    console.error('[decompose] 未找到 JSON 对象，原始内容前200字:', content.substring(0, 200));
    return { tasks: [], summary: '解析失败: 未找到有效 JSON', modelUsed: result.modelUsed };
  }

  let parsed;
  try { parsed = JSON.parse(extracted); } catch {}
  if (!parsed) {
    try { parsed = JSON.parse(repairJSON(extracted)); } catch {}
  }
  if (!parsed) {
    console.error('[decompose] 修复后仍无法解析，原始内容前200字:', content.substring(0, 200));
    const salvaged = salvageTasks(extracted);
    return { tasks: salvaged, summary: '部分解析成功（JSON 格式异常，已尽力提取）', modelUsed: result.modelUsed };
  }

  return { ...parsed, modelUsed: result.modelUsed };
}

module.exports = { decomposeRequirement };
