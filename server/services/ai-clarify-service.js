// AI 澄清服务 — 连接大模型进行需求澄清
const modelStore = require('../stores/model-store');
const reqStore = require('../stores/requirement-store');
const { callLLM } = require('./llm-adapter');
const validator = require('./concreteness-validator');

// ===== Prompt 段从文件加载 =====
const fs = require('fs');
const path = require('path');
const SEGMENTS_DIR = path.join(__dirname, '..', 'skills', 'prompts');

const PROMPT_SEGMENTS = new Proxy({}, {
  get(target, name) {
    if (name in target) return target[name];
    if (typeof name !== 'string' || name === 'then' || name === 'toJSON') return undefined;
    try {
      const filePath = path.join(SEGMENTS_DIR, `seg-${name}.md`);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        // Strip YAML frontmatter if present
        const content = raw.replace(/^---[\s\S]*?---\n*/, '').trim();
        target[name] = content;
        return content;
      }
    } catch (e) { /* 降级 */ }
    return undefined;
  }
});

// 预加载所有段（首次访问时缓存）
function loadAllSegments() {
  try {
    const files = fs.readdirSync(SEGMENTS_DIR).filter(f => f.startsWith('seg-') && f.endsWith('.md'));
    for (const file of files) {
      const name = file.replace('seg-', '').replace('.md', '');
      const raw = fs.readFileSync(path.join(SEGMENTS_DIR, file), 'utf-8');
      PROMPT_SEGMENTS[name] = raw.replace(/^---[\s\S]*?---\n*/, '').trim();
    }
  } catch (e) { /* 降级 */ }
}
loadAllSegments();


// ===== Prompt 段组合器 =====
function buildPrompt(phase, domain) {
  const base = [PROMPT_SEGMENTS['role-base'], PROMPT_SEGMENTS['choices-format']];
  switch (phase) {
    case 'clarify-round1':
      return [...base,
        PROMPT_SEGMENTS['clarify-round1'],
        PROMPT_SEGMENTS['clarify-self-review'],
        PROMPT_SEGMENTS['clarify-smart'],
        PROMPT_SEGMENTS['clarify-memo'],
        PROMPT_SEGMENTS['clarify-split'],
        PROMPT_SEGMENTS['concreteness-placeholders'],
      ].join('\n\n');
    case 'clarify-roundN':
      return [...base,
        PROMPT_SEGMENTS['clarify-roundN'],
        PROMPT_SEGMENTS['clarify-self-review'],
        PROMPT_SEGMENTS['clarify-smart'],
        PROMPT_SEGMENTS['clarify-memo'],
        PROMPT_SEGMENTS['concreteness-placeholders'],
      ].join('\n\n');
    case 'review':
      return [PROMPT_SEGMENTS['role-base'],
        PROMPT_SEGMENTS['review-5dim'],
        PROMPT_SEGMENTS['review-level-l2'],
      ].join('\n\n');
    case 'split-gate':
      return [PROMPT_SEGMENTS['role-base'],
        PROMPT_SEGMENTS['split-generate'],
      ].join('\n\n');
    case 'sync-check':
      return [PROMPT_SEGMENTS['role-base'],
        PROMPT_SEGMENTS['sync-boundary'],
      ].join('\n\n');
    case 'change-impact':
      return [PROMPT_SEGMENTS['role-base'],
        PROMPT_SEGMENTS['change-impact'],
      ].join('\n\n');
    default:
      return [...base,
        PROMPT_SEGMENTS['clarify-roundN'],
        PROMPT_SEGMENTS['clarify-self-review'],
        PROMPT_SEGMENTS['clarify-smart'],
        PROMPT_SEGMENTS['clarify-memo'],
        PROMPT_SEGMENTS['concreteness-placeholders'],
      ].join('\n\n');
  }
}

// 保留 CLARIFY_SYSTEM_PROMPT 作为向后兼容的 fallback
const CLARIFY_SYSTEM_PROMPT = buildPrompt('clarify-round1');

// ===== 角色感知（30 文档「一放一收」Step 3）=====
// 根据用户角色裁剪提问方向：
//   - 业务角色（PM/设计/...）：聚焦场景、用户故事、验收标准
//   - 技术角色（架构师/开发/...）：聚焦实现方案、技术约束、风险
//   - Agent 角色：能问任何问题
//   - 匿名：不感知角色，按通用规则
const ROLE_PROFILES = {
  pm: {
    label: '产品经理（PM）',
    focus: '业务场景、用户故事、转化漏斗、运营策略、验收标准',
    avoid: '数据库 schema、API 协议、并发模型、性能预算等技术细节',
  },
  tech: {
    label: '架构师/技术',
    focus: '技术架构、API 契约、数据模型、性能、并发、可维护性、风险评估',
    avoid: '用户故事、转化漏斗、运营策略、UI 视觉等纯业务问题',
  },
  design: {
    label: '设计师',
    focus: '交互流程、视觉规范、信息层级、可访问性、跨端一致性',
    avoid: '后端架构、数据库设计、性能优化等技术问题',
  },
  test: {
    label: '测试',
    focus: '边界条件、异常路径、回归点、可测性、自动化策略',
    avoid: '产品定位、运营策略等宏观问题',
  },
  // 架构师/开发者复用 tech 模板
  'agent:小吉': { label: 'Agent（小吉）', focus: '通用', avoid: '' },
  'agent:other': { label: 'Agent（其他）', focus: '通用', avoid: '' },
  system: { label: '系统', focus: '通用', avoid: '' },
  anonymous: { label: '匿名用户', focus: '通用', avoid: '' },
};
// architecture/developer 复用 tech（按需 resolve 时才取，避免初始化顺序问题）
ROLE_PROFILES.architecture = { label: '架构师', focus: ROLE_PROFILES.tech.focus, avoid: ROLE_PROFILES.tech.avoid };
ROLE_PROFILES.developer = { label: '开发者', focus: ROLE_PROFILES.tech.focus, avoid: ROLE_PROFILES.tech.avoid };

function buildRoleContext(userRole) {
  const profile = ROLE_PROFILES[userRole] || { label: userRole, focus: '通用', avoid: '' };
  let ctx = `## 👤 用户角色：${profile.label}\n\n`;
  ctx += `**重要指示**：根据用户的角色（${profile.label}）调整你的提问方向和深度。\n\n`;
  if (profile.focus && profile.focus !== '通用') {
    ctx += `**聚焦**：${profile.focus}\n\n`;
  }
  if (profile.avoid) {
    ctx += `**避免**：${profile.avoid}\n\n`;
  }
  ctx += `如果用户给的回答里包含了其他维度的关键信息，请记录到 SRS，但不要继续追问不属于他/她专业领域的问题。`;
  return ctx;
}

// ===== JSON 提取（多层容错：清洗→正则→关键锚点→修复） =====
function extractJSON(content) {
  // 1. 直接解析（整个字符串就是 JSON）
  try { JSON.parse(content); return content; } catch {}

  // 2. 清洗：剥离 markdown 代码块标记、零宽字符、不可见控制符
  let cleaned = content
    .replace(/```(?:json)?\s*/g, '')
    .replace(/```/g, '')
    .replace(/[\u200b-\u200d\ufeff]/g, '')          // 零宽字符
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '') // 控制字符（保留 \n\r\t）
    .trim();

  // 3. 清洗后直接解析
  try { JSON.parse(cleaned); return cleaned; } catch {}

  // 4. 找最后一个完整的 JSON 对象（处理"叙述前缀 + JSON 后缀"模式）
  //    从最后一个 } 往前回溯找匹配的 {，每次尝试解析
  let idx = cleaned.length;
  while ((idx = cleaned.lastIndexOf('}', idx - 1)) >= 0) {
    const candidate = cleaned.substring(0, idx + 1);
    const openBrace = candidate.indexOf('{');
    if (openBrace >= 0) {
      const jsonStr = candidate.substring(openBrace);
      try { JSON.parse(jsonStr); return jsonStr; } catch {}
    }
  }

  // 5. 以已知 JSON 根级 Key 为锚点截取（处理嵌套 { 干扰的情况）
  const knownKeys = ['"message"', '"choices"', '"srs"', '"readyForReview"'];
  for (const key of knownKeys) {
    const keyIdx = cleaned.indexOf('{' + key);
    if (keyIdx < 0) continue;
    const jsonStr = cleaned.substring(keyIdx);
    let depth = 0, inStr = false, escape = false;
    for (let i = 0; i < jsonStr.length; i++) {
      const ch = jsonStr[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      if (ch === '}') { depth--; if (depth === 0) {
        const candidate = jsonStr.substring(0, i + 1);
        try { JSON.parse(candidate); return candidate; } catch { break; }
      }}
    }
  }

  return null;
}

// ===== JSON 修复（尾逗号、截断、缺失引号等） =====
function repairJSON(text) {
  let fixed = text;
  // 去除尾逗号
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');
  // 尝试修复 Unicode escape 中的异常
  fixed = fixed.replace(/\\u([0-9a-fA-F]{0,3}[^0-9a-fA-F])/g, '');
  // 补齐缺失的引号（奇数个引号时补一个）
  let inString = false, escape = false;
  for (let i = 0; i < fixed.length; i++) {
    const ch = fixed[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; }
  }
  if (inString) fixed += '"';
  // 补齐缺失的闭合括号
  const stack = [];
  inString = false; escape = false;
  for (let i = 0; i < fixed.length; i++) {
    const ch = fixed[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    if (ch === '}' || ch === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === ch) stack.pop();
    }
  }
  if (stack.length > 0) fixed += stack.reverse().join('');
  return fixed;
}

async function clarify(reqId, modelId, userMessage, conversationHistory, userRole = '') {
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

  // 检测阶段: 根据对话历史判断是首轮还是后续轮次
  const isFirstRound = !conversationHistory || conversationHistory.length === 0;
  const phase = isFirstRound ? 'clarify-round1' : 'clarify-roundN';
  console.log(`[clarify] 阶段: ${phase} (历史 ${(conversationHistory||[]).length} 条)`);

  // 注入领域规则到核心提示词
  const systemPrompt = (modelStore.getById(modelId)?.systemPrompt || buildPrompt(phase))
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
  ];

  // 30 文档「角色感知」：根据用户角色裁剪提问方向
  if (userRole) {
    messages.push({ role: 'system', content: buildRoleContext(userRole) });
  }

  // 把对话历史拼到 role context 之后
  if (conversationHistory && conversationHistory.length > 0) {
    messages.push(...conversationHistory.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.role === 'user' ? m.content : (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)),
    })));
  }

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

  // === 项目知识库上下文注入 ===
  try {
    const knowledgeMatcher = require('./knowledge-matcher');
    const project = require('../stores/project-store').getById(requirement.project_id);
    if (project && project.wiki_vault_path) {
      const matches = knowledgeMatcher.matchRequirement(
        requirement.project_id, project.wiki_vault_path,
        requirement.title, requirement.description || ''
      );
      if (matches.length > 0) {
        const knowledgeCtx = knowledgeMatcher.buildKnowledgeContext(
          matches, requirement.project_id, project.wiki_vault_path
        );
        if (knowledgeCtx) {
          messages.splice(2, 0, { role: 'system', content: knowledgeCtx });
          console.log(`[clarify] 注入 ${matches.length} 条相关知识 (${matches.filter(m=>m.relevance==='high').length} 条高相关)`);
        }
      }
    }
  } catch (e) { /* 非关键 */ }

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
  const result = await callLLM(modelId, messages, { temperature: 0.7, maxTokens: 32000, jsonMode: true, projectId: requirement.project_id, caller: 'clarify' });
  const content = result.content;

  // 提取 JSON — 多层容错 + 自动重试
  let parsed;
  let finalContent = content;
  let finalResult = result;
  try {
    const firstExtracted = extractJSON(content);
    if (firstExtracted) {
      try { parsed = JSON.parse(firstExtracted); } catch {}
      if (!parsed) {
        try { parsed = JSON.parse(repairJSON(firstExtracted)); } catch {}
      }
    }
  } catch { /* fallthrough to retry */ }

  if (!parsed) {
    console.error('[clarify] 未找到 JSON，尝试自动重问... 前200字:', content.substring(0, 200));
    const retryMsg = {
      role: 'user',
      content: '⚠️ 系统提示：你刚才的回复不是 JSON 格式。请严格按照以下 JSON 格式重新输出，不要添加任何额外文字：\n{\n  "message": "你的回复",\n  "choices": [{"id":"A","question":"问题","options":["选项1","选项2"]}],\n  "srs": {},\n  "readyForReview": false,\n  "splitSuggestion": null,\n  "vaguenessWarnings": []\n}',
    };
    try {
      const retryResult = await callLLM(modelId, [...messages, retryMsg], { temperature: 0.3, maxTokens: 32000, jsonMode: true, projectId: requirement.project_id, caller: 'clarify-retry' });
      const retryExtracted = extractJSON(retryResult.content);
      if (retryExtracted) {
        try { parsed = JSON.parse(repairJSON(retryExtracted)); } catch {}
      }
      if (parsed) {
        console.log('[clarify] 重试成功，JSON 已解析');
        finalContent = retryResult.content;
        finalResult = retryResult;
      }
    } catch (e) {
      console.error('[clarify] 重试调用失败:', e.message);
    }
  }

  if (!parsed) {
    // 持久化：即使格式异常也保存用户消息（AI 回复为空）
    try {
      const userContent = userMessage || (conversationHistory && conversationHistory.length === 0 ? '请开始分析这个需求' : '');
      if (userContent) reqStore.addClarification(reqId, { role: 'user', content: userContent });
    } catch (e) { /* 非关键 */ }
    return {
      message: '抱歉，AI 回复格式异常，请重新输入您刚才的答案，或点击「继续澄清」按钮手动输入。',
      choices: [],
      srs,
      readyForReview: false,
      progressMemo: null,
      modelUsed: finalResult.modelUsed,
    };
  }

  // 更新 SRS — 归一化 scopeIn/acceptanceCriteria 为字符串数组
  let mergedSrs = srs;
  if (parsed.srs && Object.keys(parsed.srs).length > 0) {
    const normalizedSrs = { ...parsed.srs };
    ['scopeIn', 'scopeOut', 'acceptanceCriteria', 'technicalConstraints'].forEach(key => {
      if (Array.isArray(normalizedSrs[key])) {
        normalizedSrs[key] = normalizeStrArr(normalizedSrs[key]);
      }
    });
    mergedSrs = { ...srs, ...normalizedSrs };
    reqStore.updateSrs(reqId, mergedSrs);

    // 自动提取并保存架构宪法
    if (mergedSrs.archSpec && Object.keys(mergedSrs.archSpec).length > 0) {
      try {
        reqStore.updateArchSpec(reqId, mergedSrs.archSpec);
        console.log(`[clarify] archSpec 已保存: ${Object.keys(mergedSrs.archSpec).join(', ')}`);
      } catch (e) { /* 非关键 */ }
    }
  }

  // === B0: 自动补充验收标准 ===
  // 当 LLM 标记 readyForReview 但 AC 为空时，从 scopeIn 中自动提取总体验收标准
  // 这是对"LLM 把规格全塞进 scopeIn、AC 空着"的系统性修复
  if (parsed.readyForReview && (!mergedSrs.acceptanceCriteria || mergedSrs.acceptanceCriteria.length === 0)) {
    const scopeIn = mergedSrs.scopeIn || [];
    if (scopeIn.length > 0) {
      // 从 scopeIn 中提取可验证的规格作为总体验收标准
      const generatedAC = [];
      // 总体验收：所有 scopeIn 项完成
      generatedAC.push(`所有 ${scopeIn.length} 项功能范围要求全部实现并符合描述规格`);

      // 检测是否有文件格式要求
      const formatItems = scopeIn.filter(s => /\.(png|wav|mp3|psd|svg|jpg|jpeg|gif|webp|pdf|docx?)/i.test(s));
      if (formatItems.length > 0) generatedAC.push(`交付物格式符合 scopeIn 中指定的文件类型要求（${formatItems.map(s => s.match(/\.\w+/)?.[0]).filter(Boolean).join(', ') || '按约定格式'}）`);

      // 检测是否有尺寸/规格要求
      const sizeItems = scopeIn.filter(s => /\d+×\d+/i.test(s) || /\d+x\d+/i.test(s));
      if (sizeItems.length > 0) generatedAC.push(`图片/音频资产尺寸和规格符合 scopeIn 中列出的具体参数`);

      // 检测是否有数量要求
      const countItems = scopeIn.filter(s => /\d+\s*[句张套个条]/i.test(s));
      if (countItems.length > 0) generatedAC.push(`交付物数量达到 scopeIn 中约定的总数要求`);

      // 检测是否有命名规范要求
      if (scopeIn.some(s => /命名|文件.*名|目录/.test(s))) {
        generatedAC.push(`交付物按 scopeIn 约定的目录结构和文件命名规范组织`);
      }

      // 检测是否有交付周期要求
      if (scopeIn.some(s => /交付周期|工作[日天]/.test(s))) {
        generatedAC.push(`按 scopeIn 约定的交付周期完成全部交付物`);
      }

      if (generatedAC.length > 0) {
        mergedSrs.acceptanceCriteria = generatedAC;
        reqStore.updateSrs(reqId, mergedSrs);
        console.log(`[clarify] B0: 自动从 scopeIn 生成了 ${generatedAC.length} 条验收标准（原 AC 为空）`);
      }
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

      // 自动生成选择题: 每个模糊点一个带引导选项的问题
      parsed.choices = deduped.slice(0, 5).map((e, i) => {
        const q = e.message.replace(/^[\u201c\u201d](.+)[\u201c\u201d]$/, '$1');
        return {
          id: String.fromCharCode(65 + i),
          question: q,
          // 给一个具名引导选项，替代空数组，让用户看到可点击的内容
          options: ['\u270f\ufe0f 在此描述\u300c' + q.substring(0, 20) + '\u300d的详细信息'],
          allowCustom: true,
          allowMultiple: false,
        };
      });

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

  // 持久化澄清对话
  try {
    // 保存用户本轮消息
    const userContent = userMessage || (conversationHistory && conversationHistory.length === 0 ? '请开始分析这个需求' : '');
    if (userContent) reqStore.addClarification(reqId, { role: 'user', content: userContent });
    // 保存 AI 回复
    const aiContent = parsed.message || '';
    if (aiContent) reqStore.addClarification(reqId, { role: 'agent', agentId: 'ai', content: aiContent });
  } catch (e) {
    console.error('[clarify] 持久化对话失败:', e.message);
  }

  // 透传 strategy + strategyContent（v0.3.1 思路先于画面 增量：让 AI 自选澄清手段）
  // strategy: 'choices' | 'decision_tree'（Phase 1 试点只支持这 2 个）
  // strategyContent: strategy 非 choices 时携带结构化数据（branches / references / question...）
  const validStrategies = ['choices', 'decision_tree'];
  const strategy = validStrategies.includes(parsed.strategy) ? parsed.strategy : 'choices';
  // 容错：必须是对象；branches 必须是对象数组
  let strategyContent = (parsed.content && typeof parsed.content === 'object') ? parsed.content : {};
  if (strategy === 'decision_tree' && !Array.isArray(strategyContent.branches)) {
    strategyContent = {}; // 决策树缺失 branches → 降级回 choices
  }

  return {
    message: parsed.message || '',
    strategy,
    content: strategyContent,
    choices: parsed.choices || [],
    srs: parsed.srs || srs,
    readyForReview: forceNotReady ? false : (parsed.readyForReview || false),
    splitSuggestion: parsed.splitSuggestion || null,
    vaguenessWarnings: parsed.vaguenessWarnings || [],
    progressMemo: parsed.progressMemo || null,
    modelUsed: result.modelUsed,
  };
}

// ===== 归一化字符串数组（兼容 LLM 返回对象数组的情况） =====
function normalizeStrArr(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.map(item => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      return item.item || item.title || item.description || JSON.stringify(item);
    }
    return String(item);
  });
}

// ═══════════════════════════════════════
// 领域感知函数
// ═══════════════════════════════════════

function detectDomain(requirement) {
  const text = (requirement.title + ' ' + (requirement.description || '')).toLowerCase();
  if (/原型|prototype|demo|演示|概念验证|poc/.test(text)) return 'prototype';
  if (/游戏|game|关卡|角色|NPC|BOSS|战斗|技能|副本|地图|武器|装备|升级|血量/.test(text)) return 'game';
  if (/API|接口|后端|服务|微服务|REST|GraphQL|gRPC|端点/.test(text)) return 'api';
  if (/页面|前端|UI|UX|交互|组件|表单|路由|SPA|PWA|响应式/.test(text)) return 'webapp';
  if (/文档|Wiki|手册|教程|指南|README|规范|标准/.test(text)) return 'documentation';
  if (/竞品|产品规划|商业模式|定价|用户画像|市场分析|差异化|MVP|楔子|RICE/.test(text)) return 'product';
  return 'general';
}

function getDomainSkillId(type) {
  const map = { game: 'skill-clarify-game', webapp: 'skill-clarify-webapp', api: 'skill-clarify-api', documentation: 'skill-clarify-documentation', product: 'skill-clarify-product', prototype: 'skill-clarify-prototype' };
  return map[type] || 'skill-clarify-general';
}

function getDefaultConcretenessRules() {
  return `1. **通用规则 — 数量范围必须具体化**：任何「X~Y 个」的表达都必须在 scopeIn 中列出具体清单
   → ❌ scopeIn: "添加5~8个功能模块"
   → ✅ scopeIn: "功能1: 用户登录(邮箱+手机), 功能2: 数据看板(实时图表), 功能3: 消息通知(邮件+站内)"

2. **通用规则 — 无名称/无设定的内容不可接受**：任何实体（页面、模块、接口、组件）必须有名称和简要说明

3. **技术方案无决策**：如果用户未明确指定技术方案，且描述中有「使用现代框架」「采用合适的数据库」「高性能渲染」等模糊表述，追问具体方案。
   → ❌ technicalConstraints: "使用现代前端框架"
   → ✅ technicalConstraints: "使用 Vue 3 + Vite"

4. **流程完整性规则**：当 scopeIn 包含 3 个以上独立子系统/模块时，必须至少有一条负责「界面入口/流程整合/导航串联」的条目。否则标记为模糊，追问「用户的操作路径是什么？从打开到退出的完整流程？」`;
}

function getDefaultChecklist() {
  return `1. 扫描 scopeIn: 是否有 "X~Y 个" 数量范围但无具体名称列表？
2. 扫描描述: 是否有泛指实体（"模块""页面""功能"）但无名字和用途说明？`;
}

function buildDomainChecklist(type) {
  const checklists = {
    game: `1. 扫描 scopeIn: 是否有 "X~Y 个" 数量范围（关卡/角色/武器/地形）但无具体名称和机制？
2. 扫描描述: 是否有 "剧情""NPC""BOSS""关卡""地形""人物" 但无名字/设定？
3. 扫描 scopeIn: 是否有主观形容词（"有趣""独特""好玩""刺激"）但无具体描述？
4. 扫描 scopeIn: 是否全是子系统（引擎/单位/地图/AI/资源），缺少「主界面/入口/流程串联」类条目？
   — 例：scopeIn:["战斗引擎","单位系统","AI系统"] → 应补充"主菜单与游戏外壳"`,

    webapp: `1. 扫描 scopeIn: 是否有 "X~Y 个" 数量范围（页面/组件/表单）但无具体页面名称和功能？
2. 扫描描述: 是否有 "用户系统""数据管理""后台" 但无具体模块划分？
3. 扫描 scopeIn: 是否有 "优化体验""提升性能" 但无具体指标？
4. 扫描 scopeIn: 是否全是后端模块/API，缺少前端入口和页面流程？
   — 例：scopeIn:["用户系统","订单系统","支付系统"] → 应补充"登录页/首页/路由导航"`,

    api: `1. 扫描 scopeIn: 是否有 "X~Y 个" 数量范围（端点/接口）但无具体路径和方法？
2. 扫描描述: 是否有 "CRUD""数据操作" 但无具体资源和 Schema？
3. 扫描 scopeIn: 是否有 "认证""权限" 但未指定具体方案（JWT/OAuth/API Key）？
4. 扫描 scopeIn: 是否全是数据/业务端点，缺少「入口/健康检查/文档入口」？
   — 例：scopeIn:["POST/users","GET/users/:id","PUT/users/:id"] → 应补充"API根路径欢迎页"`,

    documentation: `1. 扫描 scopeIn: 是否有 "X~Y 个" 数量范围（章节/页面）但无具体标题和内容概要？
2. 扫描描述: 是否有 "完整文档""全套手册" 但无受众和交付格式说明？
3. 扫描 scopeIn: 是否有 "技术文档""用户手册""API文档" 但未区分受众？
4. 扫描 scopeIn: 是否全是内容章节，缺少「目录导航/索引页/搜索入口」？
   — 例：scopeIn:["安装指南","快速开始","API参考"] → 应补充"文档首页与导航架构"`,

    prototype: `1. 扫描 scopeIn: 是否有未命名的页面/组件（用 "页面1""模块A" 代替具体名称）？
2. 扫描描述: 是否有主观形容词（"漂亮""直观""好用"）但无具体布局/交互描述？
3. **不要检查技术方案**——原型技术栈默认 HTML/CSS/JS，无需追问
4. **不要检查性能指标**——原型不需要量化性能验收标准`,

    product: `1. 扫描描述: 是否有 "用户" 但无具体画像（年龄/职位/痛点/频率）？
2. 扫描描述: 是否有 "竞品""对比""差异化" 但无具体竞品名称和评价证据？
3. 扫描 scopeIn: 是否有优先级排序但无量化依据（RICE/用户量/商业价值）？
4. 扫描描述: 是否有 "MVP""第一版" 但无明确范围边界和验证假设？
5. 扫描描述: 是否有 "定价""商业模式" 但无具体层级和转化路径？
6. 扫描 scopeIn: 是否全是功能模块，缺少「入门体验/用户引导/核心路径」？
   — 例：scopeIn:["用户系统","内容管理","数据分析"] → 应补充"新用户引导流程与核心路径"`,

    prototype: `1. 扫描 scopeIn: 是否有未命名的页面/组件（用 "页面1""模块A" 代替具体名称）？
2. 扫描描述: 是否有主观形容词（"漂亮""直观""好用"）但无具体布局/交互描述？
3. **不要检查技术方案**——原型技术栈默认 HTML/CSS/JS，无需追问
4. **不要检查性能指标**——原型不需要量化性能验收标准`,

    general: `1. 扫描 scopeIn: 是否有 "X~Y 个" 数量范围但无具体名称列表？
2. 扫描描述: 是否有泛指实体（"模块""页面""功能"）但无名字和用途说明？
3. 扫描 technicalConstraints 中是否有 "现代XXX""合适的XXX" 但未做决策？`,
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

    prototype: `示例 — scopeIn: "实现管理后台原型" -> scopeIn: "页面1: 登录页, 页面2: 数据看板, 页面3: 用户列表"
提示: 原型用纯 HTML/CSS/JS，单文件或多文件均可，无需后端`,
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

module.exports = { clarify, CLARIFY_SYSTEM_PROMPT, buildPrompt, PROMPT_SEGMENTS, buildArchContext, buildArchPrompt };
