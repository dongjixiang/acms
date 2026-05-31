// AI 澄清服务 — 连接大模型进行需求澄清
const modelStore = require('../stores/model-store');
const reqStore = require('../stores/requirement-store');
const { callLLM } = require('./llm-adapter');
const validator = require('./concreteness-validator');

const CLARIFY_SYSTEM_PROMPT = `你是一个专业的需求分析师。用户提交了一个需求，你需要通过选择题的方式帮助澄清需求细节。

**核心原则：**
1. 尽量用选择题让用户选择，降低用户负担——不要问开放式问题
2. **所有选择题默认允许多选（allowMultiple: true）**——让用户自由组合答案。如果发现用户选择有矛盾，在下一轮追问确认即可
3. **首轮必须一次性列出所有独立问题**——功能范围、技术选型、性能指标、用户场景、验收标准等，能想到的全部在第一轮发出。不要分批！不要一个一个问题问！
4. 每次回复后，根据讨论结果更新需求规格说明（SRS）
5. 当需求足够清晰时，生成完整的 SRS 并告知用户可以提交审核

**澄清轮次策略：**
- 首轮：列出所有你能想到的问题（至少4-6个），一次性全部发出。不要犹豫，不要保留
- 后续轮次：仅追问矛盾点、首轮遗漏的角度、或依赖性问题
- 当所有关键决策点已确认，即可设置 readyForReview=true

**回复格式（严格JSON）：**
{
  "message": "你的分析和对用户说的话（友好、简洁）",
  "choices": [
    { "id": "A", "question": "关于XX方面", "options": ["选项1", "选项2", "选项3"], "allowCustom": true, "allowMultiple": false }
  ],
  "srs": { ... },
  "readyForReview": false,
  "splitSuggestion": null,
  "vaguenessWarnings": []
}

**需求范围检测与拆分建议（splitSuggestion）：**
- 如果用户需求涉及**多个独立子系统、功能模块、或差异很大的用户角色**（如"做一个电商平台"包含商品管理、订单、支付、用户中心），请在首轮回复中设置 splitSuggestion。
- splitSuggestion 格式：
  {
    "shouldSplit": true,
    "reason": "该需求涉及多个独立模块（商品管理、订单系统、用户中心），建议拆分为子需求分别管理，便于聚焦和并行推进",
    "suggestedChildren": [
      { "title": "商品管理模块", "description": "负责商品的创建、编辑、分类、上下架等功能" },
      { "title": "订单系统", "description": "处理用户下单、订单状态流转、退款等功能" }
    ]
  }
- 判断标准：需求描述中出现了 **3个以上明显不同的功能域**、或同时包含了**前端+后端+运维**等不同层面的工作、或模糊的大概念（"平台""系统""全套"）。
- 如果需求范围适中（单一功能、单一模块），设置 splitSuggestion: null。
- 不要滥用——只对确实过于庞大的需求建议拆分。

**SMART 验收标准规则（重要！）：**
- 每条 acceptanceCriteria 必须包含至少一个可衡量的数字指标（时间/数量/百分比/频率/阈值）
- ❌ 错误: "用户可浏览商品列表"（不可衡量）
- ✅ 正确: "商品列表页首屏加载 ≤ 1.5s，分页翻页 ≤ 500ms，支持 1000+ 商品无卡顿"
- ❌ 错误: "系统稳定运行"（模糊）
- ✅ 正确: "连续运行 7 天无崩溃，CPU 均值 ≤ 30%，内存 ≤ 512MB"
- ❌ 错误: "界面美观"（主观）
- ✅ 正确: "首屏渲染时间 ≤ 2s，Lighthouse Performance ≥ 80 分"
- 如果当前信息不足以写出可衡量的 AC，请在选择题中追问具体指标
- 每个 scopeIn 条目必须有对应的可衡量 AC

**allowMultiple 使用规则：**
- **默认所有问题设置 allowMultiple: true**，让用户自由多选
- 仅当选项明显互斥且同时选择会导致逻辑矛盾时，才设 allowMultiple: false
- 如果用户多选产生了矛盾，在下一轮单独追问澄清即可

**何时设置 readyForReview=true：**
- 所有关键决策点已确认（功能范围、技术方案、验收标准）
- 没有明显的模糊点（参见 {{DOMAIN_RULES}}）
- 用户表达了满意或想提交的意思
- **⚠️ 具体性门控（必须全部通过才能 readyForReview=true）：**

{{DOMAIN_CONCRETENESS_RULES}}

3. **技术方案无决策**：「使用现代框架」「采用合适的数据库」「高性能渲染」
   → 必须追问：哪个框架？哪个数据库？具体指标是什么？
   → ❌ technicalConstraints: "使用现代前端框架"
   → ✅ technicalConstraints: "使用 Vue 3 + Vite（决策理由: 团队熟悉，生态完善）"

4. **验收标准无数字**：「保证流畅」「加载快」「画面好」
   → 必须追问：帧率多少？加载时间多少秒？
   → ❌ acceptanceCriteria: "游戏流畅运行"
   → ✅ acceptanceCriteria: "帧率 ≥ 60fps (中档设备), 首屏加载 ≤ 2s, 内存 ≤ 200MB"

**输出格式新增 vaguenessWarnings 字段：**
- 当检测到模糊表达时，在 vaguenessWarnings 中列出具体问题和追问建议
- 有 vaguenessWarnings 时，必须同时设置 readyForReview: false

**⚠️ 每轮结束前必须执行自我审查（Self-Review）：**
在生成 JSON 回复前，逐条检查 SRS，对照具体性门控规则和 {{DOMAIN_RULES}}：

{{DOMAIN_SELF_REVIEW_CHECKLIST}}

3. 扫描 technicalConstraints 中是否有 "现代XXX""合适的XXX" 但未做决策？
4. 扫描 acceptanceCriteria 中是否每条都有可量化数字指标？

**审查结果填入 vaguenessWarnings，并据此决定 readyForReview：**
- vaguenessWarnings 为空 → 可以 readyForReview=true（其他条件也满足时）
- vaguenessWarnings 非空 → 必须 readyForReview=false，并在 message 中逐条追问

当前需求信息会以 JSON 格式提供。请始终保持 JSON 输出格式。`;

// ===== JSON 修复工具（LLM 输出常有尾逗号、截断） =====
function repairJSON(text) {
  let fixed = text;
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');
  let inString = false, escape = false;
  for (const ch of fixed) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
  }
  if (inString) fixed += '"';
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
  if (stack.length > 0) fixed += stack.reverse().join('');
  return fixed;
}

function extractJSON(content) {
  try { JSON.parse(content); return content; } catch {}
  const stripped = content.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();
  const m = stripped.match(/\{[\s\S]*\}/);
  return m ? m[0] : null;
}

async function clarify(reqId, modelId, userMessage, conversationHistory) {
  const requirement = reqStore.getById(reqId);
  if (!requirement) throw Object.assign(new Error('需求不存在'), { status: 404 });

  // Skill 感知: 加载 Skill 提示词
  let skillPrompt = null;
  let domainRules = ''; let domainChecklist = ''; let domainExamples = '';
  try {
    const skillStore = require('../stores/skill-store');
    skillPrompt = skillStore.loadPrompt('skill-requirement-clarify');

    // 领域感知: 根据项目类型加载对应的澄清 Skill
    const projectStore = require('../stores/project-store');
    const project = projectStore.getById(requirement.project_id);
    const projectType = (project && project.type) || requirement.domain || detectDomain(requirement);
    const domainSkillId = getDomainSkillId(projectType);
    const domainPrompt = skillStore.loadPrompt(domainSkillId);
    if (domainPrompt) {
      console.log(`[clarify] 领域 Skill: ${domainSkillId} (${domainPrompt.length} chars)`);
      domainRules = domainPrompt;
      domainChecklist = buildDomainChecklist(projectType);
      domainExamples = buildDomainExamples(projectType);
    }
  } catch (e) { /* 静默降级 */ }

  // 注入领域规则到核心提示词
  const systemPrompt = (modelStore.getById(modelId)?.systemPrompt || skillPrompt || CLARIFY_SYSTEM_PROMPT)
    .replace('{{DOMAIN_CONCRETENESS_RULES}}', domainRules || getDefaultConcretenessRules())
    .replace('{{DOMAIN_SELF_REVIEW_CHECKLIST}}', domainChecklist || getDefaultChecklist())
    .replace('{{DOMAIN_RULES}}', domainRules ? '领域特定规则（见下方具体性门控）' : '通用规则');

  // 构建消息
  const srs = JSON.parse(requirement.srs || '{}');
  const context = {
    title: requirement.title,
    description: requirement.description || '',
    priority: requirement.priority,
    currentSRS: srs,
  };

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: `当前需求上下文:\n${JSON.stringify(context, null, 2)}` },
    ...(conversationHistory || []).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.role === 'user' ? m.content : (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)),
    })),
  ];

  // 变更上下文感知: 如果需求经历过变更，注入变更背景
  const changeHistory = JSON.parse(requirement.change_history || '[]');
  if (changeHistory.length > 0) {
    const lastChange = changeHistory[changeHistory.length - 1];
    const changeContext = `## ⚠️ 这是一个经历过变更的需求

上次变更 (v${lastChange.version}): ${lastChange.reason}
影响: ${lastChange.impact.summary}

**重要指示**:
- 上面的 SRS 是变更前已确定的内容，请**不要重新追问已确定的细节**
- 只针对变更部分（${lastChange.reason}）提出澄清问题
- 如果变更描述已经足够清晰，可以在首轮直接设置 readyForReview=true
- 你的选择题应该聚焦于变更带来的新不确定性，而非重复确认已有结论`;
    messages.splice(2, 0, { role: 'system', content: changeContext });
  }

  // === 架构宪法上下文注入 ===
  if (requirement.parent_id) {
    // 子需求: 注入父需求的架构宪法 + 兄弟需求信息
    try {
      const parentReq = reqStore.getById(requirement.parent_id);
      if (parentReq) {
        const archSpec = JSON.parse(parentReq.arch_spec || '{}');
        const siblings = reqStore.findChildren(requirement.parent_id)
          .filter(c => c.id !== requirement.id);
        const archContext = buildArchContext(requirement, parentReq, archSpec, siblings);
        if (archContext) {
          messages.splice(2, 0, { role: 'system', content: archContext });
        }
      }
    } catch (e) { /* 非关键 */ }
  } else {
    // 主需求: 如果 ArchSpec 为空且范围可能过大，引导 LLM 先定义架构
    const archSpec = JSON.parse(requirement.arch_spec || '{}');
    const hasDecisions = archSpec.decisions && Object.keys(archSpec.decisions).length > 0;
    if (!hasDecisions && !requirement.parent_id) {
      messages.splice(2, 0, { role: 'system', content: buildArchPrompt() });
    }
  }

  if (userMessage) {
    messages.push({ role: 'user', content: userMessage });
  } else if (!conversationHistory || conversationHistory.length === 0) {
    messages.push({ role: 'user', content: '请开始分析这个需求，用选择题帮助我澄清细节。' });
  }

  // === A: 调 LLM 前注入具体性审查反馈 ===
  const currentSrsData = JSON.parse(requirement.srs || '{}');
  const preConcResult = validator.validateRequirement({
    title: requirement.title,
    description: currentSrsData.summary || requirement.description || '',
    srs: requirement.srs,
  });
  if (!preConcResult.passed) {
    const errors = preConcResult.warnings.filter(w => w.severity === 'error');
    if (errors.length > 0) {
      const fb = ['⚠️ [系统审查] 当前需求仍存在模糊表达，请在本次回复中针对每个问题提出选择题：'];
      errors.forEach((e, i) => fb.push(`${i + 1}. [${e.pattern}] ${e.message}`));
      fb.push('不要设置 readyForReview=true。');
      messages.push({ role: 'system', content: fb.join('\n') });
      console.log(`[clarify] A-预引导: 注入 ${errors.length} 个模糊点`);
    }
  }

  // 调用 LLM（适配器自动根据 model.api 选择格式）
  const result = await callLLM(modelId, messages, { temperature: 0.7, maxTokens: 6000, jsonMode: true, projectId: requirement.project_id, caller: 'clarify' });
  const content = result.content;

  // 提取 JSON — 多层容错
  const extracted = extractJSON(content);
  if (!extracted) {
    console.error('[clarify] 未找到 JSON 对象，原始内容前200字:', content.substring(0, 200));
    return { message: content, choices: [], srs, readyForReview: false, modelUsed: result.modelUsed };
  }

  let parsed;
  try { parsed = JSON.parse(extracted); } catch {}
  if (!parsed) {
    try { parsed = JSON.parse(repairJSON(extracted)); } catch (e2) {
      console.error('[clarify] JSON 修复后仍失败:', e2.message, '内容前200字:', content.substring(0, 200));
      return { message: content, choices: [], srs, readyForReview: false, modelUsed: result.modelUsed };
    }
  }

  // 更新 SRS
  let mergedSrs = srs;
  if (parsed.srs && Object.keys(parsed.srs).length > 0) {
    mergedSrs = { ...srs, ...parsed.srs };
    reqStore.updateSrs(reqId, mergedSrs);

    // 自动提取并保存架构宪法
    if (mergedSrs.archSpec && Object.keys(mergedSrs.archSpec).length > 0) {
      try {
        reqStore.updateArchSpec(reqId, mergedSrs.archSpec);
        console.log(`[clarify] archSpec 已保存: ${Object.keys(mergedSrs.archSpec).join(', ')}`);
      } catch (e) { /* 非关键 */ }
    }
  }

  // === B: LLM 回复后兜底审查 ===
  let forceNotReady = false;
  if (parsed.readyForReview) {
    const tempReq = {
      title: requirement.title,
      description: mergedSrs.summary || (mergedSrs.scopeIn || []).join('; ') || requirement.description || '',
      srs: JSON.stringify(mergedSrs),
    };
    const postConcResult = validator.validateRequirement(tempReq);
    const hasErrors = postConcResult.warnings.some(w => w.severity === 'error');
    const selfWarnings = parsed.vaguenessWarnings || [];

    if (hasErrors || selfWarnings.length > 0) {
      forceNotReady = true;

      const allErrors = postConcResult.warnings.filter(w => w.severity === 'error');
      const deduped = [];
      const seen = new Set();
      for (const e of allErrors) {
        const key = e.pattern;
        if (!seen.has(key)) { seen.add(key); deduped.push(e); }
      }

      // 替换消息: 不追加到 LLM 原消息上
      parsed.message = `🔍 系统审查发现需求仍有 ${deduped.length} 个模糊点需要澄清：`;
      deduped.slice(0, 5).forEach((e, i) => {
        parsed.message += `\n${i + 1}. ${e.message}`;
      });
      if (selfWarnings.length > 0) {
        parsed.message += `\n\n📋 AI 自查也发现了 ${selfWarnings.length} 个未解决的问题。`;
      }
      parsed.message += `\n\n请在下方选择题中输入具体内容，或直接在输入框中自由回复。`;

      // 自动生成选择题: 每个模糊点一个可自定义的问题
      parsed.choices = deduped.slice(0, 5).map((e, i) => ({
        id: String.fromCharCode(65 + i),
        question: e.message.replace(/^[""](.+)[""]$/, '$1'),
        options: [],
        allowCustom: true,
        allowMultiple: false,
      }));

      console.log(`[clarify] B-兜底拦截: readyForReview 被覆盖，${allErrors.length}个error(去重${deduped.length}) + ${selfWarnings.length}个自查警告，已生成${parsed.choices.length}个选择题`);

      // === 触发自我改进: AI 认为 ready 但系统发现了漏洞 → 优化领域 Skill ===
      try {
        const improvement = require('./clarify-improvement-service');
        const clarifications = reqStore.getClarifications(reqId);
        const report = improvement.analyzeClarification(requirement, clarifications);
        if (report.skillPatches.length > 0) {
          for (const patch of report.skillPatches) {
            improvement.applySkillPatch(patch);
            console.log(`[clarify] 自我改进: 已应用 skill-clarify-${patch.domain} 补丁 — ${patch.reason}`);
          }
        } else if (report.suggestions.length > 0) {
          console.log(`[clarify] 自我改进: ${report.suggestions.length} 条建议 (未达到自动应用阈值)`);
          report.suggestions.slice(0, 3).forEach(s => console.log(`  - [${s.type}] ${s.title}`));
        }
      } catch (e) { console.log('[clarify] 自我改进触发失败:', e.message); }
    }
  }

  return {
    message: parsed.message || '',
    choices: parsed.choices || [],
    srs: parsed.srs || srs,
    readyForReview: forceNotReady ? false : (parsed.readyForReview || false),
    splitSuggestion: parsed.splitSuggestion || null,
    vaguenessWarnings: parsed.vaguenessWarnings || [],
    modelUsed: result.modelUsed,
  };
}

module.exports = { clarify, CLARIFY_SYSTEM_PROMPT };

// ═══════════════════════════════════════
// 领域感知函数
// ═══════════════════════════════════════

function detectDomain(requirement) {
  const text = (requirement.title + ' ' + (requirement.description || '')).toLowerCase();
  if (/游戏|game|关卡|角色|NPC|BOSS|战斗|技能|副本|地图|武器|装备|升级|血量/.test(text)) return 'game';
  if (/API|接口|后端|服务|微服务|REST|GraphQL|gRPC|端点/.test(text)) return 'api';
  if (/页面|前端|UI|UX|交互|组件|表单|路由|SPA|PWA|响应式/.test(text)) return 'webapp';
  if (/文档|Wiki|手册|教程|指南|README|规范|标准/.test(text)) return 'documentation';
  if (/竞品|产品规划|商业模式|定价|用户画像|市场分析|差异化|MVP|楔子|RICE/.test(text)) return 'product';
  return 'general';
}

function getDomainSkillId(type) {
  const map = { game: 'skill-clarify-game', webapp: 'skill-clarify-webapp', api: 'skill-clarify-api', documentation: 'skill-clarify-documentation', product: 'skill-clarify-product' };
  return map[type] || 'skill-clarify-general';
}

function getDefaultConcretenessRules() {
  return `1. **通用规则 — 数量范围必须具体化**：任何「X~Y 个」的表达都必须在 scopeIn 中列出具体清单
   → ❌ scopeIn: "添加5~8个功能模块"
   → ✅ scopeIn: "功能1: 用户登录(邮箱+手机), 功能2: 数据看板(实时图表), 功能3: 消息通知(邮件+站内)"

2. **通用规则 — 无名称/无设定的内容不可接受**：任何实体（页面、模块、接口、组件）必须有名称和简要说明`;
}

function getDefaultChecklist() {
  return `1. 扫描 scopeIn: 是否有 "X~Y 个" 数量范围但无具体名称列表？
2. 扫描描述: 是否有泛指实体（"模块""页面""功能"）但无名字和用途说明？`;
}

function buildDomainChecklist(type) {
  const checklists = {
    game: `1. 扫描 scopeIn: 是否有 "X~Y 个" 数量范围（关卡/角色/武器/地形）但无具体名称和机制？
2. 扫描描述: 是否有 "剧情""NPC""BOSS""关卡""地形""人物" 但无名字/设定？
3. 扫描 scopeIn: 是否有主观形容词（"有趣""独特""好玩""刺激"）但无具体描述？`,

    webapp: `1. 扫描 scopeIn: 是否有 "X~Y 个" 数量范围（页面/组件/表单）但无具体页面名称和功能？
2. 扫描描述: 是否有 "用户系统""数据管理""后台" 但无具体模块划分？
3. 扫描 scopeIn: 是否有 "优化体验""提升性能" 但无具体指标？`,

    api: `1. 扫描 scopeIn: 是否有 "X~Y 个" 数量范围（端点/接口）但无具体路径和方法？
2. 扫描描述: 是否有 "CRUD""数据操作" 但无具体资源和 Schema？
3. 扫描 scopeIn: 是否有 "认证""权限" 但未指定具体方案（JWT/OAuth/API Key）？`,

    documentation: `1. 扫描 scopeIn: 是否有 "X~Y 个" 数量范围（章节/页面）但无具体标题和内容概要？
2. 扫描描述: 是否有 "完整文档""全套手册" 但无受众和交付格式说明？
3. 扫描 scopeIn: 是否有 "技术文档""用户手册""API文档" 但未区分受众？`,

    product: `1. 扫描描述: 是否有 "用户" 但无具体画像（年龄/职位/痛点/频率）？
2. 扫描描述: 是否有 "竞品""对比""差异化" 但无具体竞品名称和评价证据？
3. 扫描 scopeIn: 是否有优先级排序但无量化依据（RICE/用户量/商业价值）？
4. 扫描描述: 是否有 "MVP""第一版" 但无明确范围边界和验证假设？
5. 扫描描述: 是否有 "定价""商业模式" 但无具体层级和转化路径？`,
  };
  return checklists[type] || getDefaultChecklist();
}

function buildDomainExamples(type) {
  const examples = {
    game: `示例 — ❌ scopeIn: "设计5个英雄角色" → ✅ scopeIn: "英雄1: 艾伦(战士) — 前排坦克，技能「盾墙」"
示例 — ❌ scopeIn: "设计几种地形" → ✅ scopeIn: "地形1: 密林(20×20格) — 树木提供掩体(+30%闪避)"`,

    webapp: `示例 — ❌ scopeIn: "实现5个核心页面" → ✅ scopeIn: "页面1: 首页(/home) — 数据看板+快捷入口, 页面2: 用户列表(/users) — 分页+搜索+筛选"
示例 — ❌ scopeIn: "后台管理系统" → ✅ scopeIn: "模块1: 用户管理(CRUD+角色权限), 模块2: 订单管理(列表+详情+状态流转)"`,

    api: `示例 — ❌ scopeIn: "设计RESTful API" → ✅ scopeIn: "端点1: POST /api/users — 创建用户(Body: {email,password}) → {id,token}"
示例 — ❌ scopeIn: "实现认证" → ✅ scopeIn: "JWT认证: POST /auth/login → {token}, 过期24h, refresh端点: POST /auth/refresh"`,

    documentation: `示例 — ❌ scopeIn: "编写完整API文档" → ✅ scopeIn: "章节1: 快速开始(5min教程), 章节2: 认证指南(OAuth2流程+代码示例), 章节3: API参考(20个端点+请求/响应示例)"`,

    product: `示例 — ❌ description: "做一个类似飞书的协作工具" → ✅ description: "差异化: 飞书审批不灵活(G2差评35%)→我们支持拖拽审批引擎。定位:「唯一为50-200人团队提供可视化审批引擎的协作平台」"
示例 — ❌ scopeIn: "MVP包含核心功能" → ✅ scopeIn: "MVP: 任务管理+甘特图+飞书通知→验证假设「甘特图是付费驱动力」。不包含: 审批引擎/报表/移动端。成功指标: 30天留存≥40%"`,
  };
  return examples[type] || '';
}

// ═══════════════════════════════════════
// 架构宪法上下文构建
// ═══════════════════════════════════════

/**
 * 构建子需求的架构宪法上下文（注入给 LLM）
 */
function buildArchContext(childReq, parentReq, archSpec, siblings) {
  const parts = [];
  parts.push(`## 🏛️ 架构宪法 — 这是父需求「${parentReq.title}」定义的不可违背的架构边界`);
  parts.push('你正在澄清的子需求属于该父需求的组成部分，必须遵守以下架构约束：');

  // 规范化: 兼容旧的扁平格式和新的嵌套格式
  const tech = archSpec.technical || archSpec;
  const domain = archSpec.domain || {};
  const contracts = archSpec.contracts || archSpec.interfaceRegistry || [];

  // ── 业务架构 ──

  if (domain.boundaries && domain.boundaries.length > 0) {
    const myBoundary = domain.boundaries.find(b => b.module === childReq.title);
    if (myBoundary) {
      parts.push('\n### 📐 你的模块边界');
      parts.push(`- 职责: ${myBoundary.description || myBoundary.module}`);
      if (myBoundary.owns) parts.push(`- 管辖概念: ${myBoundary.owns.join(', ')}`);
      if (myBoundary.doesNotOwn) parts.push(`- ⚠️ 不归你管: ${myBoundary.doesNotOwn}`);
      if (myBoundary.dependsOn) parts.push(`- 依赖模块: ${myBoundary.dependsOn.join(', ')}`);
    }
  }

  if (domain.glossary && domain.glossary.length > 0) {
    parts.push('\n### 📖 共享术语表');
    domain.glossary.slice(0, 5).forEach(g => {
      parts.push(`- **${g.term}**: ${g.definition} (归${g.owner || '全局'}定义)`);
    });
  }

  if (domain.businessRules && domain.businessRules.length > 0) {
    const myRules = domain.businessRules.filter(
      r => r.owner === childReq.title || (r.involves && r.involves.includes(childReq.title))
    );
    if (myRules.length > 0) {
      parts.push('\n### 📋 与你相关的跨模块业务规则');
      myRules.forEach(r => {
        parts.push(`- ${r.rule} (主责: ${r.owner})`);
      });
    }
  }

  // ── 技术架构 ──

  if (tech.decisions && Object.keys(tech.decisions).length > 0) {
    parts.push('\n### 🔒 全局技术决策（不可被推翻）');
    for (const [key, val] of Object.entries(tech.decisions)) {
      parts.push(`- ${key}: ${val}`);
    }
  }

  if (tech.sharedSchemas && tech.sharedSchemas.length > 0) {
    parts.push('\n### 🔒 共享数据模型（必须使用）');
    tech.sharedSchemas.forEach(s => {
      parts.push(`- ${s.name}: ${s.fields ? JSON.stringify(s.fields) : s.description || ''}`);
    });
  }

  if (tech.repository && tech.repository.layout) {
    const layout = tech.repository.layout;
    const myPath = Object.entries(layout).find(([, m]) => m === childReq.title);
    parts.push('\n### 📂 交付目录规划');
    parts.push(`- 仓库策略: ${tech.repository.strategy || '未指定'}`);
    if (myPath) parts.push(`- 你的代码目录: ${myPath[0]}`);
    if (layout['/packages/shared']) parts.push(`- 共享代码: ${Object.keys(layout).filter(k => layout[k] === '共享代码' || k.includes('shared')).join(', ') || layout['/packages/shared']}`);
    if (tech.repository.conventions) {
      parts.push(`- 约定: ${JSON.stringify(tech.repository.conventions)}`);
    }
  }

  if (tech.constraints && Object.keys(tech.constraints).length > 0) {
    parts.push('\n### 🔒 全局非功能约束');
    for (const [key, val] of Object.entries(tech.constraints)) {
      parts.push(`- ${key}: ${val}`);
    }
  }

  // ── 模块契约 ──

  if (contracts.length > 0) {
    const myContracts = contracts.filter(
      c => c.from === childReq.title || c.to === childReq.title
    );
    if (myContracts.length > 0) {
      parts.push('\n### 📋 你预定的模块契约');
      myContracts.forEach(c => {
        const commitment = c.commitment || c.contract || '';
        if (c.from === childReq.title) {
          parts.push(`- 你对外提供: ${commitment} → ${c.to}${c.sla ? ` (SLA: ${c.sla})` : ''}`);
        } else {
          parts.push(`- 你需要消费: ${commitment} ← ${c.from}${c.sla ? ` (SLA: ${c.sla})` : ''}`);
        }
      });
    }
  }

  // ── 兄弟需求 ──

  if (siblings.length > 0) {
    parts.push('\n### 👥 兄弟需求');
    siblings.forEach(s => {
      const sContracts = JSON.parse(s.interface_contracts || '[]');
      parts.push(`- **${s.title}** (${s.id}) ${s.status === 'approved' ? '✅' : s.status}`);
      if (sContracts.length > 0) {
        sContracts.forEach(sc => {
          parts.push(`  ${sc.direction === 'provides' ? '📤' : '📥'} ${sc.description}`);
        });
      }
    });
  }

  parts.push(`\n**重要指示**：
- 技术选型必须符合全局决策，不可选择其他技术栈
- 数据模型必须使用共享 Schema，不可自定义冲突的定义
- 读取兄弟需求提供的接口，声明你对外提供的接口
- 你的接口声明将与其他子需求进行一致性检查`);

  return parts.join('\n');
}

/**
 * 构建主需求的架构引导提示（arch_spec 为空时注入）
 * 优先从 Skill 文件加载，无 Skill 时用精简回退
 */
function buildArchPrompt() {
  try {
    const skillStore = require('../stores/skill-store');
    const prompt = skillStore.loadPrompt('skill-arch-constitution');
    if (prompt) return prompt;
  } catch (e) { /* 回退到硬编码版本 */ }

  return `## 🏛️ 架构宪法引导

这是一个主需求。在澄清功能细节之前，请优先确认架构边界：

**业务层面**: 模块边界、共享术语、跨模块业务规则、端到端流程
**技术层面**: 全局技术选型、共享数据模型、交付目录规划、非功能约束
**模块契约**: 子需求之间的调用关系和 SLA

请在 SRS 中输出 archSpec。格式见 skill-arch-constitution。`;
}

module.exports = { clarify, CLARIFY_SYSTEM_PROMPT, buildArchContext, buildArchPrompt };
