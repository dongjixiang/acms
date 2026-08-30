// ACMS GEO — LLM 自动生成 prompts（v0.31 — Yao Open Prompts 借鉴版）
// 路径：server/services/geo-prompt-llm.js
//
// v0.31 升级（借鉴 yaojingang/yao-open-prompts 25 个 GEO 模板）：
//   1. 引入 RTF 框架（Role-Task-Format）结构化 prompt 生成 — 姚金刚方案核心
//   2. 四类用户意图覆盖（信息型/比较型/实施型/排错型）— 答案空间占领策略
//   3. EEAT 原则注入（Experience/Expertise/Authoritativeness/Trustworthiness）
//   4. unbranded 句式从 8 类扩展至 16 类（覆盖四类意图 + 地域/时间/价位等维度）
//   5. branded 句式从 6 类扩展至 9 类（增加 pricing/demystify/how-it-works）
//   6. persona 维度：决策者/执行者/采购者视角差异化 query
//   7. 数量 24-30 → unbranded 70% (17-21) + branded 30% (7-9)
//
// 借鉴来源：
//   - Yao Open Prompts: answer-space-occupation-strategy.md（四类意图三层框架）
//   - Yao Open Prompts: ai-friendly-content-creation.md（EEAT 原则）
//   - Yao Open Prompts: geo-prompt-generator-template.md（RTF 框架）
//   - elmo analyze.ts: promptSchema + TAG_GUIDANCE
//   - Profound Parrot Problem: ~50% AI 回答含 unsolicited Editorial content

const GEO_STORE = require('./geo-store');

// ===== 结构化句式骨架（v0.31 扩展至 16 类 unbranded + 9 类 branded）=====
// (句式 id, 中文模板, 意图类型, 触发场景)
const UNBRANDED_PATTERNS = [
  // === 信息型（Informational）— 用户想了解某个领域 ===
  ['best',        'best [产品/服务]',           'informational', 'best-for'],
  ['top',        'top [产品/服务] 2026',       'informational', 'best-for'],
  ['recommend',  '[产品/服务] 推荐',           'informational', 'editorial'],
  ['which',      '[产品/服务] 哪家好',         'informational', 'editorial'],
  ['what-is',    '什么是 [产品/服务]',         'informational', 'discovery'],

  // === 比较型（Comparative）— 用户正在对比选项 ===
  ['alt',        '[产品/服务] alternatives',   'comparative',   'alternative'],
  ['vs',         '[产品/服务] vs [竞品]',      'comparative',   'comparison'],
  ['for-persona','[产品/服务] for [目标客户]', 'comparative',   'best-for'],

  // === 实施型（Implementational）— 用户准备行动/采购 ===
  ['where',      'where to find [产品/服务]',  'implementation','discovery'],
  ['how-to',     '如何选 [产品/服务]',         'implementation','best-for'],
  ['guide',      '[产品/服务] 选购指南',       'implementation','editorial'],
  ['checklist',  '[产品/服务] 避坑 checklist', 'implementation','best-for'],

  // === 排错型（Troubleshooting）— 用户遇到问题/风险 ===
  ['problem',    '[产品/服务] 常见问题',        'troubleshooting','discovery'],
  ['risk',       '[产品/服务] 避坑',           'troubleshooting','best-for'],
  ['where-loc',  '上海 [产品/服务] 公司',      'informational', 'discovery'],
];

const BRANDED_PATTERNS = [
  ['intro',      '[brand] 怎么样',            'brand-intro'],
  ['alt',        '[brand] alternatives',      'alternative'],
  ['vs',         '[brand] vs [竞品]',         'comparison'],
  ['worth',      'is [brand] worth it',       'brand-intro'],
  ['review',     '[brand] review',            'editorial'],
  ['pricing',    '[brand] 收费',              'brand-intro'],
  ['demystify',  '[brand] 靠谱吗',            'brand-intro'],
  ['how-works',  '[brand] 怎么用',            'brand-intro'],
  ['pros-cons',  '[brand] 优缺点',            'comparison'],
];

// ===== Persona 维度定义 =====
const PERSONAS = [
  { id: 'decision_maker', label: '决策者', desc: '关注 ROI、合规、品牌信誉，语言正式' },
  { id: 'executor',       label: '执行者', desc: '关注落地、操作细节、工具选择，语言务实' },
  { id: 'procurement',    label: '采购者', desc: '关注性价比、流程、合同条款，语言直接' },
];

// ===== v0.31: RTF 框架 buildLlmPrompt =====
function buildLlmPrompt(brand) {
  const _industry = brand.industry || '[行业词]';
  const _name = brand.name || '[品牌名]';
  const _domain = brand.domain || '';

  const lines = [];

  // === R: Role ===
  lines.push(`## 【Role — 角色】`);
  lines.push(`你是一名 GEO（Generative Engine Optimization）搜索策略专家，擅长从用户真实搜索行为中提炼高价值 AI 查询片段。`);
  lines.push(`你的核心能力：`);
  lines.push(`- 理解 AI 搜索引擎（DeepSeek/ChatGPT/Perplexity/Gemini）的内容偏好和引用逻辑`);
  lines.push(`- 识别用户在不同决策阶段的真实搜索意图（信息/比较/实施/排错）`);
  lines.push(`- 避免同义反复，确保每个 query 提供独特的搜索入口`);
  lines.push(`- 遵循 EEAT 原则（Experience/Expertise/Authoritativeness/Trustworthiness）构建信任信号`);
  lines.push('');

  // === 品牌上下文 ===
  lines.push(`## 【品牌上下文】`);
  lines.push(`- 名称: ${_name}`);
  if (_domain) lines.push(`- 域名: ${_domain}`);
  lines.push(`- 行业: ${_industry}`);
  lines.push(`- 别名: ${(brand.aliases || []).join(', ') || '（无，需补充）'}`);
  lines.push(``);
  lines.push(`**重要**：下面所有模板中的 [产品/服务] 必须替换为与「${_industry}」相关的**细分词**（不是笼统的行业大类）。`);
  lines.push(`例如「会展服务」→ 展台搭建/展览设计/展台制作/会展公司/展陈设计`);
  lines.push(`例如「互联网银行」→ 手机银行App/数字信贷/互联网理财/网贷平台/线上开户`);
  lines.push(`禁止留 [产品/服务] 原样，禁止只用"XX服务/XX行业"这种空词。`);
  lines.push('');

  // === T: Task ===
  lines.push(`## 【Task — 任务】`);
  lines.push(`为品牌「${_name}」（${_industry}）生成 24-30 个 AI 搜索跟踪查询片段，覆盖四类用户意图和三种用户 persona。`);
  lines.push('');

  // 硬性约束
  lines.push(`### 硬性约束（不满足 → 输出无效）`);
  lines.push(`1. **形态**：每个 prompt ≤12 字（或 ≤8 词英文），**不是完整问句** — 是用户在搜索框直接敲的片段`);
  lines.push(`2. **标点**：句号/问号/感叹号全去掉`);
  lines.push(`3. **数量**：24-30 个 — unbranded 17-21 个（70%）+ branded 7-9 个（30%）`);
  lines.push(`4. **意图覆盖**：unbranded 必须覆盖四类意图，每类至少 3 个`);
  lines.push(`5. **Persona 覆盖**：unbranded 中至少 3 个 query 体现不同 persona 视角（决策者/执行者/采购者）`);
  lines.push(`6. **去重**：禁止同义反复 — 「展会公司」和「展览公司」算同义，只保留一个`);
  lines.push(`7. **长度控制**：英文 ≤8 词，中文 ≤12 字`);
  lines.push('');

  // 四类意图定义
  lines.push(`### 四类用户意图（必须全覆盖）`);
  lines.push(`| 意图类型 | 用户状态 | 典型 query 形态 | 示例（会展服务） |`);
  lines.push(`|---------|---------|----------------|----------------|`);
  lines.push(`| **信息型** | 刚接触，想了解 | best/top/推荐/什么是 | best 展台搭建公司 / 什么是会展设计 |`);
  lines.push(`| **比较型** | 在对比选项 | alternatives/vs/for+persona | 展台搭建 alternatives / 会展公司 for 创业团队 |`);
  lines.push(`| **实施型** | 准备行动/采购 | how-to/选购指南/checklist/where | 如何选会展公司 / 展台搭建避坑 checklist |`);
  lines.push(`| **排错型** | 遇到问题/风险 | 常见问题/避坑/risk | 会展公司常见问题 / 展台搭建避坑 |`);
  lines.push('');

  // Unbranded 句式模板
  lines.push(`### Unbranded 句式模板（16 类，覆盖四类意图）`);
  lines.push(`\`\`\``);
  for (const [, tpl, intent, ctx] of UNBRANDED_PATTERNS) {
    const filledTpl = tpl.replace(/\[产品\/服务\]/g, _industry)
                         .replace(/\[目标客户\]/g, '企业客户')
                         .replace(/\[竞品\]/g, '其他服务商');
    lines.push(`[${intent.padEnd(14)}]  ${ctx.padEnd(11)}  ${filledTpl}`);
  }
  lines.push(`\`\`\``);
  lines.push(`要求：上述 16 类句式至少命中 10 种结构，每种变体 ≤2 条。`);
  lines.push('');

  // Branded 句式模板
  lines.push(`### Branded 句式模板（9 类）`);
  lines.push(`\`\`\``);
  for (const [, tpl, ctx] of BRANDED_PATTERNS) {
    lines.push(`[${ctx.padEnd(13)}]  ${tpl.replace('[brand]', _name)}`);
  }
  lines.push(`\`\`\``);
  lines.push(`要求：branded 至少覆盖 5 种结构，必须含「怎么样 / alternatives / vs 竞品 / worth it」各 1 条。`);
  lines.push('');

  // Profound Parrot
  lines.push(`### Profound Parrot 原理（自然发现核心窗口）`);
  lines.push(`~50% 的 AI 回复会主动塞「对比/观点/推荐」类 Editorial content。`);
  lines.push(`因此 best/top/recommended/review/优缺点 类句式**最容易触发品牌自然被提及**，必须重点覆盖。`);
  lines.push(`目标：unbranded 中 editorial/best-for 类 query ≥ 40%。`);
  lines.push('');

  // EEAT
  lines.push(`### EEAT 原则注入（提升 AI 信任度）`);
  lines.push(`每个 unbranded query 的 tags 中应包含反映 EEAT 信号的关键词：`);
  lines.push(`- **Experience**（经验）：实操类 query → tag 含「实操」「案例」`);
  lines.push(`- **Expertise**（专业）：深度类 query → tag 含「专业」「深度」`);
  lines.push(`- **Authoritativeness**（权威）：行业地位类 query → tag 含「行业」「头部」`);
  lines.push(`- **Trustworthiness**（可信）：避坑/风险类 query → tag 含「安全」「合规」`);
  lines.push('');

  // Tags 规范
  lines.push(`### Tags 规范（每个 prompt 1-3 个）`);
  lines.push(`- 描述「prompt 是关于什么的」：产品类别 / 用户分群 / 子特性 / 地域 / 竞品名`);
  lines.push(`- 全集合共享 ≤6 个不同 tag，便于过滤`);
  lines.push(`- 优先单词；多词小写连字符（multi-word）`);
  lines.push(`- 不写「branded/unbranded」— 系统自动算`);
  lines.push(`- 可写意图标签：informational/comparative/implementation/troubleshooting`);
  lines.push('');

  // Format
  lines.push(`## 【Format — 输出格式】`);
  lines.push(`严格 JSON，无 markdown 代码块：`);
  lines.push(`{\n  "prompts": [\n    {\n      "prompt": "搜索片段（≤12字/≤8词英文）",\n      "intent": "informational|comparative|implementation|troubleshooting|brand-intro|comparison",\n      "tags": ["tag1", "tag2"],\n      "persona": "decision_maker|executor|procurement|general"\n    }\n  ]\n}`);
  lines.push(`注意：intent 字段必填（帮助后续分析四类意图覆盖率）；persona 为 general 时可省略。`);

  return lines.join('\n');
}

// ===== LLM 调用 =====
async function generatePromptsWithLLM(brand) {
  const runtime = require('./agent-runtime');
  const prompt = buildLlmPrompt(brand);

  try {
    const result = await runtime.execute({
      messages: [
        { role: 'system', content: '你是 GEO 搜索策略专家，擅长生成用户真实输入的 AI 搜索查询。严格输出 JSON。' },
        { role: 'user', content: prompt },
      ],
      toolNames: [],
      maxRounds: 1,
      caller: 'geo-prompt-llm',
      maxTokens: 3000,
      temperature: 0.5,
    });

    const rawContent = result.content || '';
    const parsed = parseLlmOutput(rawContent);

    if (!parsed.ok) return parsed;
    // v0.31: 扩量至 30（原 12）— 配合 buildLlmPrompt 数量约束 24-30
    parsed.prompts = parsed.prompts.slice(0, 30);
    return parsed;
  } catch (e) {
    return {
      ok: false,
      error: 'LLM_CALL_FAILED',
      message: e.message,
    };
  }
}

// ===== v0.31: 从 prompt 文本确定性推断 intent + tags（不依赖 LLM 输出）=====\
// intent 标准化映射：LLM 可能返回非标准值（如 brand-intro/comparison），统一归入四类
const INTENT_MAP = {
  'informational': 'informational',
  'comparative': 'comparative',
  'implementation': 'implementation',
  'troubleshooting': 'troubleshooting',
  // LLM 常见非标准返回值 → 标准化
  'brand-intro': 'informational',
  'intro': 'informational',
  'overview': 'informational',
  'description': 'informational',
  'comparison': 'comparative',
  'vs': 'comparative',
  'howto': 'implementation',
  'how-to': 'implementation',
  'guide': 'implementation',
  'review': 'troubleshooting',
  'risk': 'troubleshooting',
  'problem': 'troubleshooting',
};
function normalizeIntent(raw) {
  if (!raw) return 'informational';
  const r = String(raw).toLowerCase().replace(/\s+/g, '-');
  return INTENT_MAP[r] || 'informational';
}
function inferIntentAndTags(p) {
  const raw = p.prompt.trim();
  const rawLower = raw.toLowerCase();
  const tagList = Array.isArray(p.tags) ? p.tags.map(t => String(t).toLowerCase()) : [];
  const tagStr = tagList.join(' ');

  // 1. 推断 intent（先用 LLM 返回值标准化，再 fallback 到关键词推断）
  let intent = normalizeIntent(p.intent);
  // 若 LLM 没返回或标准化后仍是 informational，用关键词重新判定（更准确）
  const kwIntent = (() => {
    if (tagStr.includes('comparison') || tagStr.includes('alternative') ||
        rawLower.includes('vs') || rawLower.includes('比较') || rawLower.includes('优缺点'))
      return 'comparative';
    if (tagStr.includes('how-to') || rawLower.includes('如何') || rawLower.includes('指南') ||
        rawLower.includes('开户') || rawLower.includes('下载') || rawLower.includes('checklist'))
      return 'implementation';
    if (tagStr.includes('risk') || rawLower.includes('问题') || rawLower.includes('风险') ||
        rawLower.includes('靠谱') || rawLower.includes('坑') || rawLower.includes('安全') || rawLower.includes('费用'))
      return 'troubleshooting';
    return 'informational';
  })();
  // 除非 LLM 明确返回了 comparative/implementation/troubleshooting，否则用关键词判定结果
  if (['comparative', 'implementation', 'troubleshooting'].includes(kwIntent)) intent = kwIntent;
  if (!intent) intent = 'informational';

  // 2. 推断 tags（基于 prompt 关键词 + 已有 tags）
  const tags = [...new Set(tagList)]; // 保留 LLM 返回的 tags
  if (intent === 'informational' && !tags.includes('editorial')) tags.push('editorial');
  if (intent === 'comparative' && !tags.includes('comparison')) tags.push('comparison');
  if (intent === 'implementation' && !tags.includes('how-to')) tags.push('how-to');
  if (intent === 'troubleshooting' && !tags.includes('risk')) tags.push('risk');
  if (rawLower.includes('手机银行') || rawLower.includes('app')) tags.push('mobile-banking');
  if (rawLower.includes('信贷') || rawLower.includes('贷款') || rawLower.includes('网贷')) tags.push('loans');
  if (rawLower.includes('理财') || rawLower.includes('存款')) tags.push('wealth-management');
  if (rawLower.includes('开户')) tags.push('account-opening');
  if (rawLower.includes('收费') || rawLower.includes('费用') || rawLower.includes('利率')) tags.push('pricing');

  return { prompt: raw, tags: tags.slice(0, 4), intent, persona: p.persona || null };
}

// ===== JSON 解析 =====
function parseLlmOutput(raw) {
  let jsonText = String(raw || '').trim();
  jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = jsonText.indexOf('{');
  const end = jsonText.lastIndexOf('}');
  if (start >= 0 && end > start) {
    jsonText = jsonText.slice(start, end + 1);
  }
  try {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed.prompts)) throw new Error('no prompts array');
    const prompts = parsed.prompts
      .filter(p => p && typeof p.prompt === 'string' && p.prompt.trim())
      .map(p => inferIntentAndTags(p));
    if (prompts.length === 0) throw new Error('empty prompts');
    return { ok: true, prompts };
  } catch (e) {
    return {
      ok: false,
      error: 'PARSE_FAILED',
      message: `LLM 输出解析失败: ${e.message}。原始输出: ${raw.slice(0, 100)}`,
      prompts: [],
    };
  }
}

// ===== 持久化 =====
async function generateAndPersistPrompts(brandId, options = {}) {
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) return { ok: false, error: 'BRAND_NOT_FOUND', message: `Brand ${brandId} 不存在` };

  let replaced = 0;
  if (options.replace) {
    try {
      const existing = (typeof GEO_STORE.listQueries === 'function')
        ? GEO_STORE.listQueries(brandId)
        : [];
      const removable = existing.filter(q =>
        ['ai_generated', 'template', 'onboarding'].includes(q.source) || !q.source
      );
      const removableIds = removable.map(q => q.id);
      if (removableIds.length > 0 && typeof GEO_STORE.deleteQueries === 'function') {
        replaced = GEO_STORE.deleteQueries(removableIds, { cascade: true });
      }
    } catch (e) {
      console.warn('[geo-prompt-llm] replace 模式清理旧 queries 失败（继续生成）:', e.message);
    }
  }

  const genResult = await generatePromptsWithLLM(brand);
  if (!genResult.ok) return { ...genResult, replaced };

  const created = [];
  for (const item of genResult.prompts) {
    const systemTags = GEO_STORE.computeSystemTags
      ? GEO_STORE.computeSystemTags(item.prompt, brand.name)
      : (item.prompt.toLowerCase().includes(brand.name.toLowerCase()) ? ['branded'] : ['unbranded']);
    // v0.31: intent 存入 tags（第一层），便于统计和过滤；同时放入 prompt 前缀
    const normalizedIntent = normalizeIntent(item.intent);
    const intentTag = `intent:${normalizedIntent}`;
    const tags = [...new Set([...item.tags, intentTag])];
    const q = GEO_STORE.createQuery({
      brand_id: brandId,
      prompt: item.prompt,
      category: 'custom',
      engine_targets: options.engine_targets || ['deepseek', 'openai', 'claude', 'perplexity', 'gemini', 'grok'],
      tags,
      source: 'ai_generated',
      systemTags,
    });
    created.push(q);
  }

  // v0.31: 返回意图分布统计，便于前端展示覆盖率
  const intentDist = {};
  for (const p of created) {
    const intentTag = p.tags.find(t => t.startsWith('intent:'));
    const intent = intentTag ? intentTag.replace('intent:', '') : 'unknown';
    intentDist[intent] = (intentDist[intent] || 0) + 1;
  }

  return { ok: true, count: created.length, queries: created, source: 'ai_generated', replaced, intentDistribution: intentDist };
}

module.exports = {
  buildLlmPrompt,
  generatePromptsWithLLM,
  parseLlmOutput,
  generateAndPersistPrompts,
};
