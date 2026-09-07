// ACMS GEO — LLM 自动生成 prompts（v0.40 — 行业差异化 prompt 工程）
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
// v0.40 升级（行业差异化 prompt 设计 — Profound 实证驱动）：
//   1. 新增 INDUSTRY_PROMPT_GUIDANCE 行业差异化指南（7 类：marketing/exhibition/
//      banking/pharma/saas/ecommerce + default），基于 Profound "Where do AI
//      citations come from" 11.8B citations × 29 industries 实证数据
//   2. buildLlmPrompt 根据 brand.industry 注入：
//      a) extra_patterns（行业特化句式 4-5 条）
//      b) intent_weights（四类意图比例按行业调整）
//      c) modifiers（行业修饰词：合规/临床/transactional）
//   3. inferIntentAndTags 关键词扩展至多行业（pharma/saas/ecommerce），
//      原版只针对 banking 做关键词推断
//   4. industry 缺省走 default（70/30 + Editorial intent 标准配置），向后兼容
//   5. 行业 key 与 v0.34 v034-set-industry.js 对齐（banking/exhibition），
//      新增 marketing/saas/pharma/ecommerce 行业类目
//
// 借鉴来源：
//   - Profound: Where do AI Citations Come From（11.8B citations, 29 industries）
//     marketing 72% brand media / pharma 33% / government 15.9%
//   - Yao Open Prompts: answer-space-occupation-strategy.md（四类意图三层框架）
//   - Yao Open Prompts: ai-friendly-content-creation.md（EEAT 原则）
//   - Yao Open Prompts: geo-prompt-generator-template.md（RTF 框架）
//   - elmo analyze.ts: promptSchema + TAG_GUIDANCE
//   - Profound Parrot Problem: ~50% AI 回答含 unsolicited Editorial content

const GEO_STORE = require('./geo-store');

// ===== v0.42: 语言一致性句式库（按 zh/en 拆分，杜绝中英混搭 prompt）=====
// 背景（多多 9/4 实踩）：v0.31+v0.40 的 UNBRANDED_PATTERNS 混搭严重：
//   - "避坑 checklist" (中英)
//   - "for [目标客户]" (中英)
//   - LLM 拿到这些模板后倾向输出 "best 展台搭建公司" / "上海 best 展览公司" 等混搭 prompt
// 真实搜索场景里混搭 prompt 不自然 → AI 引用概率下降
// 解法：把句式库严格按 lang 拆分（zh 库 16 类纯中文 / en 库 16 类纯英文），
//       品牌走哪种语言就只用对应语言的模板集，从源头杜绝混搭
//
// 句式格式：(id, 模板字符串, 意图类型, 触发场景)
// v0.42: zh 库的 ctx（第 4 列）全中文；en 库的 ctx 全英文 — 杜绝模板段中英混搭
const UNBRANDED_PATTERNS_BY_LANG = {
  // === 中文库：纯中文 editorial 信号词（最佳/推荐/哪家好）替代英文 best/top ===
  zh: [
    // 信息型
    ['best',      '最佳 [产品/服务]',            'informational', '最佳推荐'],
    ['top',       '2026 最佳 [产品/服务]',        'informational', '年度榜单'],
    ['recommend', '[产品/服务] 推荐',            'informational', '编辑推荐'],
    ['which',     '[产品/服务] 哪家好',          'informational', '决策辅助'],
    ['what-is',   '什么是 [产品/服务]',          'informational', '概念探索'],

    // 比较型
    ['alt',       '[产品/服务] 替代品',          'comparative',   '替代选择'],
    ['vs',        '[产品/服务] 对比 [竞品]',     'comparative',   '横向对比'],
    ['for-persona','[产品/服务] 适合 [目标客户]', 'comparative',   '人群适配'],

    // 实施型
    ['where',     '[产品/服务] 哪里找',          'implementation','采购入口'],
    ['how-to',    '如何选 [产品/服务]',          'implementation','操作指南'],
    ['guide',     '[产品/服务] 选购指南',        'implementation','购物参考'],
    ['checklist', '[产品/服务] 避坑指南',        'implementation','实操清单'],

    // 排错型
    ['problem',   '[产品/服务] 常见问题',         'troubleshooting','问题排查'],
    ['risk',      '[产品/服务] 避坑',            'troubleshooting','风险预警'],

    // 地域型（v0.44 删）：LLM 阶段不生成地域型 prompt，地域完全在追踪阶段由用户选城市后注入
    //   原因: 地域属于「搜索范围」维度，与 query 维度（信息型/比较型/实施型/排错型）正交，混在一起会让 LLM 夹带私货
    //   新行为:  tracker 阶段（geo-tracker-agent.js）选 city → 自动给所有 prompt 加城市前缀
    //   旧数据兼容: 旧 prompt 含 [地域名] 时 tracker 仍 replace 占位符（line 198 双 replace）
  ],

  // === 英文库：纯英文 editorial 信号词（best/top/recommended） ===
  en: [
    // informational
    ['best',      'best [category]',            'informational', 'best-for'],
    ['top',       'top [category] 2026',        'informational', 'best-for'],
    ['recommend', '[category] recommendations', 'informational', 'editorial'],
    ['which',     'which [category] is best',   'informational', 'editorial'],
    ['what-is',   'what is [category]',         'informational', 'discovery'],

    // comparative
    ['alt',       '[category] alternatives',    'comparative',   'alternative'],
    ['vs',        '[category] vs [competitor]', 'comparative',   'comparison'],
    ['for-persona','best [category] for [persona]', 'comparative', 'best-for'],

    // implementation
    ['where',     'where to find [category]',   'implementation','discovery'],
    ['how-to',    'how to choose [category]',   'implementation','best-for'],
    ['guide',     '[category] buying guide',    'implementation','editorial'],
    ['checklist', '[category] checklist',       'implementation','best-for'],

    // troubleshooting
    ['problem',   '[category] common problems', 'troubleshooting','discovery'],
    ['risk',      '[category] risks',           'troubleshooting','best-for'],

    // location（v0.44 删）：同 zh 库 — 地域由 tracker 阶段统一注入
  ],
};

const BRANDED_PATTERNS_BY_LANG = {
  // === 中文库：纯中文 ===
  zh: [
    ['intro',     '[brand] 怎么样',           '品牌介绍'],
    ['alt',       '[brand] 替代品',           '替代选择'],
    ['vs',        '[brand] 对比 [竞品]',      '横向对比'],
    ['worth',     '[brand] 值得吗',           '价值评估'],
    ['review',    '[brand] 用户评价',         '口碑评价'],
    ['pricing',   '[brand] 收费',             '价格信息'],
    ['demystify', '[brand] 靠谱吗',           '可信度'],
    ['how-works', '[brand] 怎么用',           '使用方法'],
    ['pros-cons', '[brand] 优缺点',           '优缺点'],
  ],

  // === 英文库：纯英文 ===
  en: [
    ['intro',     'is [brand] good',           'brand-intro'],
    ['alt',       '[brand] alternatives',      'alternative'],
    ['vs',        '[brand] vs [competitor]',   'comparison'],
    ['worth',     'is [brand] worth it',       'brand-intro'],
    ['review',    '[brand] review',            'editorial'],
    ['pricing',   '[brand] pricing',           'brand-intro'],
    ['demystify', 'is [brand] legit',          'brand-intro'],
    ['how-works', 'how to use [brand]',        'brand-intro'],
    ['pros-cons', '[brand] pros and cons',     'comparison'],
  ],
};

// ===== v0.42: 推断品牌 prompt 语言 =====
// 优先级：
//   1. options.lang 显式传入（'zh' / 'en'）→ 用它
//   2. brand.name 含中文字符 → 'zh'
//   3. brand.industry 含中文字符 → 'zh'
//   4. 默认 'en'
function inferPromptLanguage(brand, options = {}) {
  if (options.lang === 'zh' || options.lang === 'en') return options.lang;
  if (!brand) return 'en';
  // 中文 Unicode 范围：CJK 统一汉字 + 全角标点 + 假名/谚文等东方文字
  // 用更宽松的检测：含 CJK Unified Ideographs（U+4E00–U+9FFF）即视为含中文
  const _hasCJK = (s) => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(String(s || ''));
  if (_hasCJK(brand.name)) return 'zh';
  if (_hasCJK(brand.industry)) return 'zh';
  // 别名里只要有一个含中文也算 zh
  if (Array.isArray(brand.aliases) && brand.aliases.some(_hasCJK)) return 'zh';
  return 'en';
}

// ===== Persona 维度定义（按 lang 拆分）=====
const PERSONAS_BY_LANG = {
  zh: [
    { id: 'decision_maker', label: '决策者', desc: '关注 ROI、合规、品牌信誉，语言正式' },
    { id: 'executor',       label: '执行者', desc: '关注落地、操作细节、工具选择，语言务实' },
    { id: 'procurement',    label: '采购者', desc: '关注性价比、流程、合同条款，语言直接' },
  ],
  en: [
    { id: 'decision_maker', label: 'Decision Maker', desc: 'Focus on ROI, compliance, brand reputation, formal tone' },
    { id: 'executor',       label: 'Executor', desc: 'Focus on implementation, operations, tool selection, practical tone' },
    { id: 'procurement',    label: 'Procurement', desc: 'Focus on cost-effectiveness, process, contract terms, direct tone' },
  ],
};

// ===== v0.40 + v0.42: 行业差异化 Prompt 设计（Profound 实证 + 按语言拆分）=====
// v0.42 升级：extra_unbranded / extra_branded / modifiers 全部按 lang 拆分
//   - extra_unbranded_by_lang = { zh: [...], en: [...] }
//   - extra_branded_by_lang = { zh: [...], en: [...] }
//   - modifiers_by_lang = { zh: [...], en: [...] }
// buildLlmPrompt 按 brand.lang 选择对应语言的版本，杜绝中英混搭
const INDUSTRY_PROMPT_GUIDANCE = {
  'marketing': {
    label: '营销/广告/SEO',
    citation_basis: 'Profound 实证: brand media 主导 (72%)',
    extra_unbranded_by_lang: {
      zh: [
        '{category} 客户案例',
        '{category} 数据对比',
        '{category} ROI 测算',
        '最佳 {category} 代理商 2026',
      ],
      en: [
        '{category} case study',
        '{category} data benchmark',
        '{category} ROI comparison',
        'best {category} agency 2026',
      ],
    },
    extra_branded_by_lang: {
      zh: ['{brand} 客户案例', '{brand} 数据驱动'],
      en: ['{brand} case studies', '{brand} data-driven'],
    },
    intent_weights: { informational: 0.40, comparative: 0.25, implementation: 0.20, troubleshooting: 0.15 },
    modifiers_by_lang: {
      zh: ['数据驱动', 'ROI', '案例', '行业奖项'],
      en: ['data-driven', 'ROI', 'case study', 'industry awards'],
    },
  },
  'exhibition': {
    label: '展览/展台/会展',
    citation_basis: 'Profound 实证: 平衡 (33% brand media)',
    extra_unbranded_by_lang: {
      zh: [
        '{category} 报价参考',
        '{category} 案例',
        '{category} 价格',
        '{category} 哪家专业',
      ],
      en: [
        '{category} pricing guide',
        '{category} case studies',
        '{category} cost',
        '{category} professional companies',
      ],
    },
    extra_branded_by_lang: {
      zh: ['{brand} 报价', '{brand} 案例'],
      en: ['{brand} pricing', '{brand} case studies'],
    },
    intent_weights: { informational: 0.30, comparative: 0.25, implementation: 0.30, troubleshooting: 0.15 },
    modifiers_by_lang: {
      zh: ['报价', '案例'],  // v0.44: 删"上海/北京/广州"——LLM 会把这个当关键词调色板直接学（v0.40 留下的设计错误，把城市当行业 AI 引用偏好）。地域完全由用户追踪阶段控制
      en: ['booth design', 'tradeshow', 'case studies'],
    },
  },
  'banking': {
    label: '银行/金融',
    citation_basis: 'Profound 实证: 权威/合规主导 (< 20% brand media)',
    extra_unbranded_by_lang: {
      zh: [
        '{category} 合规',
        '{category} 利率对比',
        '{category} 安全',
        '最佳 {category} 服务小企业',
      ],
      en: [
        '{category} compliance',
        '{category} interest rates',
        '{category} security',
        'best {category} for small business',
      ],
    },
    extra_branded_by_lang: {
      zh: ['{brand} 安全吗', '{brand} 利率'],
      en: ['is {brand} safe', '{brand} interest rates'],
    },
    intent_weights: { informational: 0.35, comparative: 0.30, implementation: 0.20, troubleshooting: 0.15 },
    modifiers_by_lang: {
      zh: ['合规', '安全', '监管', '利率'],
      en: ['compliance', 'security', 'regulation', 'rates'],
    },
  },
  'pharma': {
    label: '医药/健康',
    citation_basis: 'Profound 实证: 权威/临床主导 (33% brand media)',
    extra_unbranded_by_lang: {
      zh: [
        '{category} 临床证据',
        '{category} 认证',
        '{category} 安全性',
        '{category} 副作用',
      ],
      en: [
        '{category} clinical evidence',
        '{category} FDA approval',
        '{category} safety',
        '{category} side effects',
      ],
    },
    extra_branded_by_lang: {
      zh: ['{brand} 临床数据', '{brand} 副作用'],
      en: ['{brand} clinical data', '{brand} side effects'],
    },
    intent_weights: { informational: 0.35, comparative: 0.20, implementation: 0.15, troubleshooting: 0.30 },
    modifiers_by_lang: {
      zh: ['临床', '认证', '安全', '副作用'],
      en: ['clinical', 'FDA', 'safety', 'side effects'],
    },
  },
  'saas': {
    label: 'SaaS / B2B 软件',
    citation_basis: '决策导向（comparative + implementation 主导）',
    extra_unbranded_by_lang: {
      zh: [
        '{category} 价格',
        '{category} 替代品',
        '{category} 集成',
        '{category} 接口',
        '最佳 {category} 服务企业',
      ],
      en: [
        '{category} pricing',
        '{category} vs alternatives',
        '{category} integration',
        '{category} API',
        'best {category} for enterprise',
      ],
    },
    extra_branded_by_lang: {
      zh: ['{brand} 价格', '{brand} 集成', '{brand} vs {competitor}'],
      en: ['{brand} pricing', '{brand} integration', '{brand} vs {competitor}'],
    },
    intent_weights: { informational: 0.20, comparative: 0.30, implementation: 0.35, troubleshooting: 0.15 },
    modifiers_by_lang: {
      zh: ['企业级', '接口', '集成', '价格'],
      en: ['enterprise', 'API', 'integration', 'pricing'],
    },
  },
  'ecommerce': {
    label: '电商/零售',
    citation_basis: 'transactional 主导（how-to/where 主导）',
    extra_unbranded_by_lang: {
      zh: [
        '{category} 哪里买',
        '{category} 运费',
        '{category} 退换货',
        '{category} 折扣',
      ],
      en: [
        'where to buy {category}',
        '{category} shipping',
        '{category} return policy',
        '{category} discount',
      ],
    },
    extra_branded_by_lang: {
      zh: ['{brand} 折扣码', '{brand} 运费'],
      en: ['{brand} discount code', '{brand} shipping'],
    },
    intent_weights: { informational: 0.20, comparative: 0.20, implementation: 0.50, troubleshooting: 0.10 },
    modifiers_by_lang: {
      zh: ['免运费', '折扣', '包邮'],
      en: ['free shipping', 'discount', 'best price'],
    },
  },
  'default': {
    label: '通用',
    citation_basis: '无行业差异化（70/30 + Editorial intent 标准配置）',
    extra_unbranded_by_lang: { zh: [], en: [] },
    extra_branded_by_lang: { zh: [], en: [] },
    intent_weights: { informational: 0.30, comparative: 0.25, implementation: 0.25, troubleshooting: 0.20 },
    modifiers_by_lang: { zh: [], en: [] },
  },
};

// ===== v0.42 向后兼容：旧字段名初始化赋值（避免每次访问触发 getter，防止品牌列表/别名编辑变慢）=====
// v0.40 时期使用 `extra_unbranded` / `extra_branded` / `modifiers`（直接数组）
// v0.42 改成 `extra_unbranded_by_lang.zh` / `.en` 拆分版本
// 这里直接在数据上赋旧字段名（只运行一次，初始化阶段完成，不影响运行时性能）
(function initV042Compat() {
  for (const _key of Object.keys(INDUSTRY_PROMPT_GUIDANCE)) {
    const _g = INDUSTRY_PROMPT_GUIDANCE[_key];
    if (!_g.extra_unbranded && _g.extra_unbranded_by_lang) {
      _g.extra_unbranded = _g.extra_unbranded_by_lang.zh || [];
    }
    if (!_g.extra_branded && _g.extra_branded_by_lang) {
      _g.extra_branded = _g.extra_branded_by_lang.zh || [];
    }
    if (!_g.modifiers && _g.modifiers_by_lang) {
      _g.modifiers = _g.modifiers_by_lang.zh || [];
    }
  }
})();

// 行业 key 解析（大小写不敏感、空白裁剪）
function getIndustryGuidance(industry) {
  if (!industry || typeof industry !== 'string') return INDUSTRY_PROMPT_GUIDANCE.default;
  const key = industry.toLowerCase().trim();
  return INDUSTRY_PROMPT_GUIDANCE[key] || INDUSTRY_PROMPT_GUIDANCE.default;
}

// ===== v0.31/v0.40/v0.42: RTF 框架 buildLlmPrompt（v0.42 语言一致性增强）=====
function buildLlmPrompt(brand, options = {}) {
  const _industry = brand.industry || '[行业词]';
  const _name = brand.name || '[品牌名]';
  const _domain = brand.domain || '';
  // v0.42: 语言推断（brand.name 含中文 → zh；否则 en；options.lang 显式覆盖）
  const _lang = inferPromptLanguage(brand, options);
  // v0.42: 按 lang 选模板库（杜绝中英混搭 prompt）
  const _unbrandedPatterns = UNBRANDED_PATTERNS_BY_LANG[_lang] || UNBRANDED_PATTERNS_BY_LANG.zh;
  const _brandedPatterns = BRANDED_PATTERNS_BY_LANG[_lang] || BRANDED_PATTERNS_BY_LANG.zh;
  const _personas = PERSONAS_BY_LANG[_lang] || PERSONAS_BY_LANG.zh;
  // v0.40: 行业差异化指南（Profound 实证驱动）
  const _guidance = getIndustryGuidance(brand.industry);
  const _isGeneric = _guidance === INDUSTRY_PROMPT_GUIDANCE.default;
  // 模板填充：v0.42 中文品牌时填中文 label（_guidance.label），避免英文 industry key 混入
  const _industryText = _lang === 'zh' ? _guidance.label : _industry;
  // v0.42: 行业特化模板按 lang 选版本（extra_unbranded_by_lang / extra_branded_by_lang / modifiers_by_lang）
  const _industryExtraUnbranded = (_guidance.extra_unbranded_by_lang || {})[_lang] || [];
  const _industryExtraBranded = (_guidance.extra_branded_by_lang || {})[_lang] || [];
  const _industryModifiers = (_guidance.modifiers_by_lang || {})[_lang] || [];
  // v0.41 P1: 答案空间（analyzeAnswerSpace 输出的品牌应占领空间）
  const _answerSpaces = Array.isArray(options.answerSpaces) ? options.answerSpaces : [];

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

  // === v0.42: 语言一致性硬约束（R 段后立刻注入）===
  const _langName = _lang === 'zh' ? '中文' : 'English';
  lines.push(`## 【语言一致性硬约束 — v0.42】`);
  lines.push(`本品牌「${_name}」是【${_langName}】品牌 — 所有 prompt 必须使用【${_langName}】${_lang === 'zh' ? '（包括产品词、句式词、persona 描述）' : '(including category words, pattern tokens, persona descriptions)'}。`);
  lines.push('');
  if (_lang === 'zh') {
    lines.push(`**禁止中英混搭 prompt** — 以下都是反例：`);
    lines.push(`- ❌ "best 展台搭建公司"（英文 editorial + 中文产品词）`);
    lines.push(`- ❌ "exhibition 公司推荐"（英文产品词 + 中文句式）`);  // v0.44: 删"上海 best 展览公司"——完全无地域的中英混搭反例，避免 LLM 学"地域+公司"模式
    lines.push(`- ❌ "如何选 gym app"（中文句式 + 英文产品词）`);
    lines.push(`- ❌ "{brand} alternatives" 形式的 branded query（必须改为「{brand} 替代品」）`);
    lines.push(``);
    lines.push(`**正确示例**：最佳展台搭建公司 / 展台设计公司推荐 / 如何选展览设计公司`);  // v0.44: 删 "上海展览公司哪家好"——LLM 会把这个当模板去复制生成变体
  } else {
    lines.push(`**Forbidden to mix languages** — the following are bad examples:`);
    lines.push(`- ❌ "best 展台搭建公司" (English editorial + Chinese category)`);
    lines.push(`- ❌ "exhibition 公司推荐" (English category + Chinese pattern)`);  // v0.44: 删"上海 best 展览公司"
    lines.push(`- ❌ "{brand} 怎么样" (Chinese pattern for English brand)`);
    lines.push(``);
    lines.push(`**Correct examples**: best exhibition design company / which exhibition company is best / how to choose booth design`);
  }
  lines.push('');

  // v0.44: 全局地域元规则 — 兜底防污染（治本）
  //  背景: 之前 v0.40 把"上海/北京/广州"列为展览行业 modifiers + v0.42 在"正确示例"里写"上海展览公司哪家好"，
  //        LLM 把这些城市词当模板直接学。卡司通的别名"上海卡司通"也会让 LLM 推断地域。
  //  新规则: 不管 aliases/行业 modifiers/任何模板里是否带城市，LLM 输出时**必须完全剔除**所有具体城市词
  lines.push(`**【地域全局硬约束 — v0.44 元规则】**`);
  lines.push(`所有 prompt **严禁包含任何具体城市名**（上海/北京/广州/深圳 等），也严禁包含"国内/国外/一线城市"等地域泛称。`);
  lines.push(`即便利名（如"上海卡司通"）/域名 / 行业关键词含城市词也不允许出现在输出里。`);
  lines.push(`地域完全由用户在「追踪」面板选择城市后注入；LLM 不夹带任何地域信息。`);
  lines.push('');

  // === 品牌上下文 ===
  lines.push(`## 【品牌上下文】`);
  lines.push(`- 名称: ${_name}`);
  if (_domain) lines.push(`- 域名: ${_domain}`);
  lines.push(`- 行业: ${_industry}`);
  lines.push(`- 别名: ${(brand.aliases || []).join(', ') || '（无，需补充）'}`);
  lines.push(`- **Prompt 语言: ${_langName}**（v0.42 强制）`);
  lines.push(``);
  if (_lang === 'zh') {
    lines.push(`**重要**：下面所有模板中的 [产品/服务] 必须替换为与「${_industry}」相关的**细分词**（不是笼统的行业大类）。`);
    lines.push(`例如「会展服务」→ 展台搭建/展览设计/展台制作/会展公司/展陈设计`);
    lines.push(`例如「互联网银行」→ 手机银行App/数字信贷/互联网理财/网贷平台/线上开户`);
    lines.push(`禁止留 [产品/服务] 原样，禁止只用"XX服务/XX行业"这种空词。`);
  } else {
    lines.push(`**Important**: All [category] placeholders must be replaced with concrete sub-categories specific to **${_industry}** (not generic industry labels).`);
    lines.push(`For example "marketing services" → "SEO agency / content marketing / PPC agency / email marketing / brand strategy"`);
    lines.push(`For example "SaaS" → "CRM software / project management tool / analytics platform / helpdesk / marketing automation"`);
    lines.push(`Do NOT keep [category] as-is, do NOT use only generic terms like "service" or "industry".`);
  }
  lines.push('');

  // === v0.40: 行业差异化上下文（仅在已识别行业时注入）===
  if (!_isGeneric) {
    lines.push(`## 【行业差异化（v0.40）— Profound 实证驱动】`);
    lines.push(`品牌所在行业类别：**${_guidance.label}**（数据基础: ${_guidance.citation_basis}）。`);
    lines.push(`这意味着该行业 AI 引用的内容来源分布与通用情形差异显著，prompt 设计必须按行业调整。`);
    lines.push('');
    // 四类意图权重（该行业目标分布）
    const iw = _guidance.intent_weights;
    lines.push(`### 该行业四类意图分布目标`);
    lines.push(`- 信息型 (informational): **${Math.round(iw.informational * 100)}%**`);
    lines.push(`- 比较型 (comparative): **${Math.round(iw.comparative * 100)}%**`);
    lines.push(`- 实施型 (implementation): **${Math.round(iw.implementation * 100)}%**`);
    lines.push(`- 排错型 (troubleshooting): **${Math.round(iw.troubleshooting * 100)}%**`);
    lines.push(`（最终比例可微调，但单一意图占比不得超过上述目标 ×1.5）`);
    lines.push('');
    if (_industryModifiers.length > 0) {
      lines.push(`### 该行业关键词调色板（v0.42 按 ${_langName} 渲染 — 必须出现在 query 中至少 30%）`);
      lines.push(`${_lang === 'zh' ? '可选关键词' : 'Available keywords'}: ${_industryModifiers.join(_lang === 'zh' ? '、' : ', ')} — 这些词是该行业 AI 引用偏好里的高频信号词。`);
      lines.push('');
    }
  }

  // === T: Task ===
  lines.push(`## 【Task — 任务】`);
  lines.push(`为品牌「${_name}」（${_industry}，${_langName}市场）生成 24-30 个 AI 搜索跟踪查询片段，覆盖四类用户意图和三种用户 persona。`);
  lines.push(`**所有 prompt 必须用 ${_langName}**。`);
  lines.push('');

  // 硬性约束
  lines.push(`### 硬性约束（不满足 → 输出无效）`);
  if (_lang === 'zh') {
    lines.push(`1. **形态**：每个 prompt ≤12 字（或 ≤8 词英文），**不是完整问句** — 是用户在搜索框直接敲的片段`);
    lines.push(`2. **标点**：句号/问号/感叹号全去掉`);
    lines.push(`3. **数量**：24-30 个 — unbranded 17-21 个（70%）+ branded 7-9 个（30%）`);
    lines.push(`4. **意图覆盖**：unbranded 必须覆盖四类意图，每类至少 3 个`);
    lines.push(`5. **Persona 覆盖**：unbranded 中至少 3 个 query 体现不同 persona 视角（${_personas.map(p => p.label).join('/')}）`);
    lines.push(`6. **去重**：禁止同义反复 — 「展会公司」和「展览公司」算同义，只保留一个`);
    lines.push(`7. **长度控制**：中文 ≤12 字，英文 ≤8 词`);
    lines.push(`8. **语言一致性**：所有 prompt 必须 100% 中文，禁止出现英文单词（专有名如 FDA/API 等除外）`);
  } else {
    lines.push(`1. **Format**: Each prompt ≤8 words (or ≤12 Chinese chars), NOT a full sentence — what users type into search box`);
    lines.push(`2. **Punctuation**: No periods, question marks, or exclamation marks`);
    lines.push(`3. **Count**: 24-30 prompts — unbranded 17-21 (70%) + branded 7-9 (30%)`);
    lines.push(`4. **Intent coverage**: unbranded must cover all 4 intents, ≥3 each`);
    lines.push(`5. **Persona coverage**: unbranded must include ≥3 queries reflecting different personas (${_personas.map(p => p.label).join('/')})`);
    lines.push(`6. **Deduplication**: No synonymous repetition — "gym app" and "workout app" are synonyms, keep only one`);
    lines.push(`7. **Length**: English ≤8 words, Chinese ≤12 chars`);
    lines.push(`8. **Language consistency**: All prompts MUST be 100% English (proper nouns like API/CRM excepted)`);
  }
  lines.push('');

  // 四类意图定义（v0.42 按 lang 切换示例）
  if (_lang === 'zh') {
    lines.push(`### 四类用户意图（必须全覆盖）`);
    lines.push(`| 意图类型 | 用户状态 | 典型 query 形态 | 示例（${_industry}） |`);
    lines.push(`|---------|---------|----------------|----------------|`);
    lines.push(`| **信息型** | 刚接触，想了解 | 最佳/2026 最佳/推荐/哪家好/什么是 | 最佳展台搭建公司 / 什么是会展设计 |`);
    lines.push(`| **比较型** | 在对比选项 | 替代品/vs/适合[目标客户] | 展台搭建替代品 / 会展公司 适合创业团队 |`);
    lines.push(`| **实施型** | 准备行动/采购 | 如何选/选购指南/避坑指南/哪里找 | 如何选会展公司 / 展台搭建避坑指南 |`);
    lines.push(`| **排错型** | 遇到问题/风险 | 常见问题/避坑 | 会展公司常见问题 / 展台搭建避坑 |`);
  } else {
    lines.push(`### Four user intents (must cover all)`);
    lines.push(`| Intent | User state | Typical query pattern | Example (${_industry}) |`);
    lines.push(`|---------|---------|----------------|----------------|`);
    lines.push(`| **informational** | Discovering the space | best/top 2026/recommendations/what is | best exhibition design company / what is booth design |`);
    lines.push(`| **comparative** | Comparing options | alternatives/vs/best for [persona] | booth design alternatives / exhibition company for startups |`);
    lines.push(`| **implementation** | Ready to act/buy | how to choose/buying guide/checklist/where to find | how to choose booth design / booth design checklist |`);
    lines.push(`| **troubleshooting** | Facing problems/risks | common problems/risks | booth design common problems / booth design risks |`);
  }
  lines.push('');

  // === v0.41 P1: 答案空间分配（Yao 三层框架）— 先分析再生成 ===
  if (_answerSpaces.length > 0) {
    const perSpace = Math.max(3, Math.ceil(24 / _answerSpaces.length)); // 24 个 unbranded 平均分配，每个空间 ≥3 个
    lines.push(`### v0.41 答案空间分配（三层框架 — Yao 借鉴）`);
    lines.push(`已规划该品牌的 **${_answerSpaces.length} 个答案空间**，每个空间至少 ${perSpace} 个 query（覆盖度优先于随机性）：`);
    lines.push('');
    for (let i = 0; i < _answerSpaces.length; i++) {
      const sp = _answerSpaces[i];
      const roots = (sp.concept_roots || []).slice(0, 4).join(' / ');
      lines.push(`${i + 1}. **${sp.name || '(unnamed)'}** [type=${sp.type || 'decision'}]`);
      if (roots) lines.push(`   - 概念词根: ${roots}`);
      if (sp.rationale) lines.push(`   - 关键性: ${sp.rationale}`);
    }
    lines.push('');
    lines.push(`**强约束**：生成的 query 必须能在上述某个答案空间下找到归属 — 避免"无关查询"和"同义反复"。`);
    lines.push(`**反例**：不要生成"杭州旅游攻略"这类跟答案空间无关的 query（即便在 24-30 个目标数内）。`);
    lines.push('');
  }

  // Unbranded 句式模板（v0.42 按 lang 渲染 — 杜绝中英混搭）
  if (_lang === 'zh') {
    lines.push(`### Unbranded 句式模板（${_unbrandedPatterns.length} 类中文，覆盖四类意图）`);
  } else {
    lines.push(`### Unbranded patterns (${_unbrandedPatterns.length} English templates, covering all 4 intents)`);
  }
  lines.push('```');
  for (const [, tpl, intent, ctx] of _unbrandedPatterns) {
    // zh 模板用 [产品/服务]，en 模板用 [category]
    const _placeholder = _lang === 'zh' ? '[产品/服务]' : '[category]';
    const filledTpl = tpl
      .replace(/\[产品\/服务\]/g, _industryText)
      .replace(/\[category\]/g, _industryText)
      .replace(/\[目标客户\]/g, _lang === 'zh' ? '企业客户' : 'enterprise')
      .replace(/\[persona\]/g, _lang === 'zh' ? '企业客户' : 'startups')
      .replace(/\[competitor\]/g, _lang === 'zh' ? '其他服务商' : 'competitors')
      .replace(/\[location\]/g, _lang === 'zh' ? '[地域名]' : '[region name]');
    lines.push(`[${intent.padEnd(14)}]  ${ctx.padEnd(11)}  ${filledTpl}`);
  }
  lines.push('```');
  // v0.44: 删掉了"地域硬约束"段 — LLM 阶段不生成地域型 prompt，地域完全在 tracker 阶段由用户选城市后注入
  //   原约束（占位符保留/反例/正例）已不需要：地域型模板已从 zh/en 库删除
  lines.push('');
  if (_lang === 'zh') {
    lines.push(`要求：上述 ${_unbrandedPatterns.length} 类句式至少命中 10 种结构（中文变体），每种变体 ≤2 条。`);
  } else {
    lines.push(`Requirement: Hit at least 10 of the ${_unbrandedPatterns.length} structures above (English variants), ≤2 variants per structure.`);
  }
  lines.push('');

  // === v0.42: 行业特化 unbranded 句式（按 lang 选版本）===
  if (!_isGeneric && _industryExtraUnbranded.length > 0) {
    lines.push(`### 行业特化 Unbranded 句式（v0.42 — ${_guidance.label} ${_langName}版 必覆盖）`);
    lines.push('```');
    for (const tpl of _industryExtraUnbranded) {
      const filledTpl = tpl
        .replace(/\{category\}/g, _industryText)
        .replace(/\{competitor\}/g, _lang === 'zh' ? '其他服务商' : 'competitors');
      lines.push(`[特化]  ${filledTpl}`);
    }
    lines.push('```');
    lines.push(`**要求**：上述 ${_industryExtraUnbranded.length} 个行业特化句式（${_langName}版）必须全部命中（这是 ${_guidance.label} 行业 AI 引用的内容偏好，缺失会显著降低 mention_rate）。`);
    lines.push('');
  }

  // Branded 句式模板（v0.42 按 lang 渲染）
  if (_lang === 'zh') {
    lines.push(`### Branded 句式模板（${_brandedPatterns.length} 类中文）`);
  } else {
    lines.push(`### Branded patterns (${_brandedPatterns.length} English templates)`);
  }
  lines.push('```');
  for (const [, tpl, ctx] of _brandedPatterns) {
    lines.push(`[${ctx.padEnd(13)}]  ${tpl.replace('[brand]', _name).replace('{competitor}', _lang === 'zh' ? '其他服务商' : 'competitors')}`);
  }
  lines.push('```');
  if (_lang === 'zh') {
    lines.push(`要求：branded 至少覆盖 5 种结构，必须含「怎么样 / 替代品 / vs 竞品 / 值得吗」各 1 条。`);
  } else {
    lines.push(`Requirement: branded must cover ≥5 structures, must include "is [brand] good / alternatives / vs [competitor] / worth it" each 1+ time.`);
  }
  lines.push('');

  // === v0.42: 行业特化 branded 句式（按 lang 选版本）===
  if (!_isGeneric && _industryExtraBranded.length > 0) {
    lines.push(`### 行业特化 Branded 句式（v0.42 — ${_guidance.label} ${_langName}版 必覆盖）`);
    lines.push('```');
    for (const tpl of _industryExtraBranded) {
      const filledTpl = tpl
        .replace(/\{brand\}/g, _name)
        .replace(/\{competitor\}/g, _lang === 'zh' ? '其他服务商' : 'competitors');
      lines.push(`[特化]  ${filledTpl}`);
    }
    lines.push('```');
    lines.push(`**要求**：上述 ${_industryExtraBranded.length} 个行业特化 branded 句式（${_langName}版）必须全部命中。`);
    lines.push('');
  }

  // Profound Parrot（按 lang 切换说明）
  if (_lang === 'zh') {
    lines.push(`### Profound Parrot 原理（自然发现核心窗口）`);
    lines.push(`~50% 的 AI 回复会主动塞「对比/观点/推荐」类 Editorial content。`);
    lines.push(`因此「最佳/2026 最佳/推荐/哪家好/替代品/优缺点」类句式**最容易触发品牌自然被提及**，必须重点覆盖（注意：editorial 信号词用中文「最佳/推荐/优缺点」，不用英文 best/top/recommended）。`);
    lines.push(`目标：unbranded 中 editorial/best-for 类 query ≥ 40%。`);
  } else {
    lines.push(`### Profound Parrot principle (organic discovery core window)`);
    lines.push(`~50% of AI responses contain unsolicited Editorial content (comparisons/opinions/recommendations).`);
    lines.push(`Therefore "best/top/recommended/review/alternatives" patterns most easily trigger organic brand mentions — must be heavily covered (use English editorial signals, NOT Chinese 最佳/推荐/优缺点).`);
    lines.push(`Target: editorial/best-for queries ≥ 40% of unbranded set.`);
  }
  lines.push('');

  // EEAT（按 lang 切换）
  if (_lang === 'zh') {
    lines.push(`### EEAT 原则注入（提升 AI 信任度）`);
    lines.push(`每个 unbranded query 的 tags 中应包含反映 EEAT 信号的关键词（中文 tag）：`);
    lines.push(`- **Experience**（经验）：实操类 query → tag 含「实操」「案例」`);
    lines.push(`- **Expertise**（专业）：深度类 query → tag 含「专业」「深度」`);
    lines.push(`- **Authoritativeness**（权威）：行业地位类 query → tag 含「行业」「头部」`);
    lines.push(`- **Trustworthiness**（可信）：避坑/风险类 query → tag 含「安全」「合规」`);
  } else {
    lines.push(`### EEAT principle injection (boost AI trust)`);
    lines.push(`Each unbranded query's tags should include EEAT signals (English tags):`);
    lines.push(`- **Experience**: hands-on queries → tags include "case-study", "real-world"`);
    lines.push(`- **Expertise**: in-depth queries → tags include "expert", "in-depth"`);
    lines.push(`- **Authoritativeness**: industry standing → tags include "industry", "leading"`);
    lines.push(`- **Trustworthiness**: risk/safety queries → tags include "safety", "compliance"`);
  }
  lines.push('');

  // Tags 规范（按 lang）
  if (_lang === 'zh') {
    lines.push(`### Tags 规范（每个 prompt 1-3 个）`);
    lines.push(`- 描述「prompt 是关于什么的」：产品类别 / 用户分群 / 子特性 / 地域 / 竞品名`);
    lines.push(`- 全集合共享 ≤6 个不同 tag，便于过滤`);
    lines.push(`- 优先单词；多词小写连字符（multi-word）`);
    lines.push(`- 不写「branded/unbranded」— 系统自动算`);
    lines.push(`- 可写意图标签：informational/comparative/implementation/troubleshooting`);
    lines.push(`- **tag 内容跟 prompt 同语言**（中文 prompt 用中文 tag，英文 prompt 用英文 tag）`);
  } else {
    lines.push(`### Tags spec (1-3 tags per prompt)`);
    lines.push(`- Describe WHAT the prompt is about: product category / audience / sub-feature / location / competitor`);
    lines.push(`- Share ≤6 unique tag values across the set (for filtering)`);
    lines.push(`- Prefer single-word tags; multi-word lowercase with hyphens`);
    lines.push(`- Do NOT use "branded/unbranded" — system computes automatically`);
    lines.push(`- Intent tags allowed: informational/comparative/implementation/troubleshooting`);
    lines.push(`- **Tags must match prompt language** (Chinese prompt → Chinese tag, English prompt → English tag)`);
  }
  lines.push('');

  // Format（按 lang 切换示例）
  lines.push(`## 【Format — 输出格式】`);
  lines.push(_lang === 'zh' ? '严格 JSON，无 markdown 代码块：' : 'Strict JSON, no markdown code blocks:');
  if (_lang === 'zh') {
    lines.push(`{
  "prompts": [
    {
      "prompt": "搜索片段（≤12字）",
      "intent": "informational|comparative|implementation|troubleshooting|brand-intro|comparison",
      "tags": ["tag1", "tag2"],
      "persona": "decision_maker|executor|procurement|general"
    }
  ]
}`);
    lines.push(`注意：intent 字段必填；persona 为 general 时可省略；所有 prompt 必须是中文。`);
  } else {
    lines.push(`{
  "prompts": [
    {
      "prompt": "search fragment (≤8 words)",
      "intent": "informational|comparative|implementation|troubleshooting|brand-intro|comparison",
      "tags": ["tag1", "tag2"],
      "persona": "decision_maker|executor|procurement|general"
    }
  ]
}`);
    lines.push(`Note: intent field is required; persona may be omitted when "general"; all prompts MUST be English.`);
  }

  return lines.join('\n');
}

// ===== v0.41 P1: 三层答案空间分析（Yao Open Prompts answer-space-occupation-strategy）=====
// 灵感来源：Yao Open Prompts answer-space-occupation-strategy.md
//   - 战略指令层 → 概念词根层 → 问题矩阵层
//   - 先确定"品牌应该占领哪些答案空间"，再生成 query（替代 LLM 自由发挥）
// 调用一次 LLM，~500 tokens，返回品牌的 3-5 个答案空间
const ANSWER_SPACE_SYSTEM_PROMPT = `你是 GEO 答案空间策略专家，擅长分析品牌在 AI 搜索里"应该出现在哪些答案空间"。

输入：品牌名 + 行业 + 别名
输出：3-5 个答案空间（JSON 数组），按"用户在决策路径上的优先级"排序：
- name：答案空间名称（如"如何选择展台搭建公司"，≤20 字）
- type：decision（决策窗口，最易被推荐）/ discovery（了解阶段）/ comparison（对比阶段）/ implementation（执行阶段）
- concept_roots：该空间下的 2-4 个概念词根（如 ["展台搭建","展台设计","展陈公司"]）
- rationale：为什么这个答案空间对品牌关键（1 句话）

严格 JSON，无 markdown：
{
  "answer_spaces": [
    {"name":"...", "type":"decision", "concept_roots":["...","..."], "rationale":"..."}
  ]
}`;

// 默认答案空间兜底（LLM 不可用时按行业 fallback — 不调 LLM）
const FALLBACK_ANSWER_SPACES = {
  marketing: [
    { name: '营销 ROI 衡量', type: 'decision', concept_roots: ['营销 ROI', '转化率', '获客成本'], rationale: '决策者最关心营销投入产出比' },
    { name: '内容策略制定', type: 'implementation', concept_roots: ['内容策略', '内容营销', '选题'], rationale: '内容是营销的核心交付物' },
    { name: '获客渠道对比', type: 'comparison', concept_roots: ['获客渠道', '流量来源', '渠道对比'], rationale: '多渠道选择是营销的核心决策' },
  ],
  exhibition: [
    { name: '展台搭建公司选择', type: 'decision', concept_roots: ['展台搭建', '展览设计', '展陈公司'], rationale: '采购前的核心决策窗口' },
    { name: '展台设计趋势', type: 'discovery', concept_roots: ['展台设计', '展览设计趋势', '创意展台'], rationale: '用户了解阶段的搜索入口' },
    { name: '展台预算参考', type: 'comparison', concept_roots: ['展台预算', '展台报价', '搭建价格'], rationale: '采购方必查的报价对比' },
    { name: '展台施工流程', type: 'implementation', concept_roots: ['展台搭建流程', '现场施工', '进度管理'], rationale: '执行阶段的实操问题' },
  ],
  banking: [
    { name: '银行产品对比', type: 'comparison', concept_roots: ['存款产品', '理财产品', '信贷产品'], rationale: '客户决策时必查的横向对比' },
    { name: '手机银行功能', type: 'implementation', concept_roots: ['手机银行', 'App', '线上开户'], rationale: '执行阶段：用户实际操作' },
    { name: '银行合规安全', type: 'troubleshooting', concept_roots: ['合规', '安全', '风险'], rationale: '权威/合规是银行行业的内容偏好' },
  ],
  pharma: [
    { name: '药品临床证据', type: 'discovery', concept_roots: ['临床数据', 'FDA 认证', '临床试验'], rationale: '药效背书的核心证据链' },
    { name: '药品安全性', type: 'troubleshooting', concept_roots: ['副作用', '安全性', '禁忌'], rationale: '用户最关心的副作用信息' },
    { name: '药品对比', type: 'comparison', concept_roots: ['同类药对比', '替代药', '原研仿制'], rationale: '医生处方时的核心决策' },
  ],
  saas: [
    { name: 'SaaS 产品对比', type: 'comparison', concept_roots: ['SaaS 对比', 'pricing', 'vs 替代'], rationale: 'B2B 决策者必查的横向对比' },
    { name: 'SaaS 集成与 API', type: 'implementation', concept_roots: ['集成', 'API', '兼容性'], rationale: '技术决策者关心的实施细节' },
    { name: 'SaaS 实施 ROI', type: 'decision', concept_roots: ['SaaS ROI', '实施成本', '效果衡量'], rationale: '管理层决策的关键' },
  ],
  ecommerce: [
    { name: '产品购买渠道', type: 'implementation', concept_roots: ['where to buy', '海淘', '折扣码'], rationale: '执行阶段的购买决策' },
    { name: '产品对比', type: 'comparison', concept_roots: ['产品对比', '测评', '排行'], rationale: '购买前的横向对比' },
    { name: '退换货物流', type: 'troubleshooting', concept_roots: ['return policy', 'shipping', '运费'], rationale: '售后保障是电商高频搜索' },
  ],
  default: [
    { name: '产品选择决策', type: 'decision', concept_roots: ['产品选择', '对比', '推荐'], rationale: '最常见的决策路径' },
    { name: '产品实施流程', type: 'implementation', concept_roots: ['使用步骤', '操作指南', 'checklist'], rationale: '执行阶段的实操问题' },
    { name: '产品问题排错', type: 'troubleshooting', concept_roots: ['常见问题', '避坑', '风险'], rationale: '售后/排错阶段高频搜索' },
  ],
};

function _getFallbackAnswerSpaces(industry) {
  const guidance = getIndustryGuidance(industry);
  const key = guidance === INDUSTRY_PROMPT_GUIDANCE.default ? 'default' : guidance.label === 'SaaS / B2B 软件' ? 'saas'
    : guidance.label === '电商/零售' ? 'ecommerce'
    : guidance.label === '医药/健康' ? 'pharma'
    : guidance.label === '银行/金融' ? 'banking'
    : guidance.label === '展览/展台/会展' ? 'exhibition'
    : guidance.label === '营销/广告/SEO' ? 'marketing'
    : 'default';
  return FALLBACK_ANSWER_SPACES[key] || FALLBACK_ANSWER_SPACES.default;
}

// JSON 解析答案空间输出（双路径：严格 + 提取，跟 parseLlmOutput 一致）
function parseAnswerSpaceOutput(raw) {
  let jsonText = String(raw || '').trim();
  jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = jsonText.indexOf('{');
  const end = jsonText.lastIndexOf('}');
  if (start >= 0 && end > start) {
    jsonText = jsonText.slice(start, end + 1);
  }
  try {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed.answer_spaces)) throw new Error('no answer_spaces array');
    const spaces = parsed.answer_spaces
      .filter(s => s && typeof s.name === 'string' && s.name.trim())
      .map(s => ({
        name: String(s.name).trim().slice(0, 30),
        type: ['decision', 'discovery', 'comparison', 'implementation', 'troubleshooting'].includes(s.type)
          ? s.type : 'decision',
        concept_roots: Array.isArray(s.concept_roots)
          ? s.concept_roots.map(r => String(r).trim()).filter(r => r).slice(0, 4)
          : [],
        rationale: typeof s.rationale === 'string' ? s.rationale.trim().slice(0, 100) : '',
      }));
    if (spaces.length === 0) throw new Error('empty answer_spaces');
    return { ok: true, answer_spaces: spaces.slice(0, 5) };
  } catch (e) {
    return { ok: false, error: 'PARSE_FAILED', message: e.message };
  }
}

// LLM 调用：分析品牌的答案空间
async function analyzeAnswerSpace(brand, options = {}) {
  const fallback = _getFallbackAnswerSpaces(brand.industry);

  // options.skipLlm = true 时跳过 LLM 直接返回兜底（用于测试 + LLM 不可用时降级）
  if (options.skipLlm) {
    return { ok: true, answer_spaces: fallback, source: 'fallback' };
  }

  let runtime;
  try {
    runtime = require('./agent-runtime');
  } catch (e) {
    return { ok: true, answer_spaces: fallback, source: 'fallback', warning: 'agent-runtime unavailable' };
  }

  const userPrompt = `品牌名：${brand.name || '(未知)'}
行业：${brand.industry || '通用'}
别名：${(brand.aliases || []).join(', ') || '（无）'}
域名：${brand.domain || '（无）'}

请分析该品牌应该占领哪些 AI 答案空间。`;

  try {
    const result = await runtime.execute({
      messages: [
        { role: 'system', content: ANSWER_SPACE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      toolNames: [],
      maxRounds: 1,
      caller: 'geo-prompt-llm/answer-space',
      maxTokens: 800,
      temperature: 0.4,
    });

    if (result.error) {
      // LLM 调用失败 → 兜底（不要因为答案空间失败拖垮整体生成）
      return { ok: true, answer_spaces: fallback, source: 'fallback', warning: result.error };
    }

    const parsed = parseAnswerSpaceOutput(result.content || '');
    if (!parsed.ok) {
      return { ok: true, answer_spaces: fallback, source: 'fallback', warning: parsed.message };
    }

    return { ok: true, answer_spaces: parsed.answer_spaces, source: 'llm' };
  } catch (e) {
    return { ok: true, answer_spaces: fallback, source: 'fallback', warning: e.message };
  }
}

// ===== LLM 调用 =====
async function generatePromptsWithLLM(brand, options = {}) {
  const runtime = require('./agent-runtime');

  // v0.41 P1: 先分析答案空间（Yao 三层框架 — 先确定"应占领哪些空间"再生成 query）
  // 默认 skipLlm=false 走真实 LLM；options.skipAnswerSpace=true 时跳过（用于单测 + 兜底）
  let answerSpaceResult = { ok: true, answer_spaces: [], source: 'none' };
  if (!options.skipAnswerSpace) {
    answerSpaceResult = await analyzeAnswerSpace(brand, { skipLlm: options.skipLlm });
  }
  const _answerSpaces = answerSpaceResult.answer_spaces || [];

  const prompt = buildLlmPrompt(brand, { answerSpaces: _answerSpaces });

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

    // v0.40: 透传 LLM 调用失败（agent-runtime 在异常时返回 {content:'', error:'...'}）
    // 不再被 PARSE_FAILED 遮盖 — 多多能立刻看到是 provider 不通还是网络问题
    if (result.error) {
      return {
        ok: false,
        error: 'LLM_CALL_FAILED',
        message: result.error,
        modelUsed: result.modelUsed,
      };
    }

    const rawContent = result.content || '';
    const parsed = parseLlmOutput(rawContent);

    if (!parsed.ok) return parsed;
    // v0.31: 扩量至 30（原 12）— 配合 buildLlmPrompt 数量约束 24-30
    parsed.prompts = parsed.prompts.slice(0, 30);
    // v0.41 P1: 把答案空间信息挂在结果上（调用方写 tag 时用）
    parsed.answer_spaces = _answerSpaces;
    parsed.answer_space_source = answerSpaceResult.source;
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
  // v0.40: 多行业关键词扩 — pharma 临床/FDA/副作用
  if (rawLower.includes('临床') || rawLower.includes('fda') || rawLower.includes('副作用') ||
      rawLower.includes('疗效') || rawLower.includes('安全性')) tags.push('clinical');
  // v0.40: saas 决策类 — pricing/integration/API
  if (rawLower.includes('pricing') || rawLower.includes('集成') || rawLower.includes(' api ') ||
      rawLower.includes('api ') || rawLower.startsWith('api ') || /\bapi\b/.test(rawLower)) tags.push('saas-integration');
  // v0.40: ecommerce transactional — 折扣/shipping/包邮
  if (rawLower.includes('shipping') || rawLower.includes('包邮') || rawLower.includes('折扣') ||
      rawLower.includes('免运费') || rawLower.includes('return')) tags.push('transactional');
  // v0.40: exhibition 报价/案例（会展行业高频信号）
  if (rawLower.includes('报价') || rawLower.includes('案例') || rawLower.includes('展台') ||
      rawLower.includes('搭建')) tags.push('exhibition-domain');
  // v0.40: marketing 数据驱动/ROI/案例
  if (rawLower.includes('roi') || rawLower.includes('data-driven') || rawLower.includes('数据驱动') ||
      rawLower.includes('case study') || rawLower.includes('案例研究')) tags.push('marketing-data');

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

  // v0.41 P1: 透传 options 给 generatePromptsWithLLM（skipAnswerSpace / skipLlm 用于单测 + LLM 不可用时降级）
  const genResult = await generatePromptsWithLLM(brand, {
    skipAnswerSpace: options.skipAnswerSpace,
    skipLlm: options.skipLlm,
  });
  if (!genResult.ok) return { ...genResult, replaced };

  const created = [];
  // v0.41 P1: 答案空间循环分配 — 第 i 个 prompt 分到第 (i mod N) 个空间（N=0 时不分）
  const _answerSpaces = genResult.answer_spaces || [];
  for (let i = 0; i < genResult.prompts.length; i++) {
    const item = genResult.prompts[i];
    const systemTags = GEO_STORE.computeSystemTags
      ? GEO_STORE.computeSystemTags(item.prompt, brand.name)
      : (item.prompt.toLowerCase().includes(brand.name.toLowerCase()) ? ['branded'] : ['unbranded']);
    // v0.31: intent 存入 tags（第一层），便于统计和过滤；同时放入 prompt 前缀
    const normalizedIntent = normalizeIntent(item.intent);
    const intentTag = `intent:${normalizedIntent}`;
    // v0.41 P1: 答案空间 tag — 用 1-based 编号 + 概念词根短名（≤20 字）
    let answerSpaceTag = null;
    if (_answerSpaces.length > 0) {
      const idx = i % _answerSpaces.length;
      const sp = _answerSpaces[idx];
      // 用空间名拼音/英文短码 OR 直接用 name（≤20 字）
      const slug = (sp.name || `space${idx + 1}`).replace(/\s+/g, '-').slice(0, 20);
      answerSpaceTag = `answer-space:${idx + 1}-${slug}`;
    }
    const tags = [...new Set([
      ...(item.tags || []),
      intentTag,
      ...(answerSpaceTag ? [answerSpaceTag] : []),
    ])];
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

  return {
    ok: true,
    count: created.length,
    queries: created,
    source: 'ai_generated',
    replaced,
    intentDistribution: intentDist,
    // v0.41 P1: 答案空间规划结果（前端展示用）
    answerSpaces: _answerSpaces,
    answerSpaceSource: genResult.answer_space_source || 'none',
  };
}

module.exports = {
  buildLlmPrompt,
  generatePromptsWithLLM,
  parseLlmOutput,
  generateAndPersistPrompts,
  // v0.40: 行业差异化导出（便于单测与外部调用）
  getIndustryGuidance,
  INDUSTRY_PROMPT_GUIDANCE,
  // v0.41 P1: 答案空间分析导出（便于单测与外部调用）
  analyzeAnswerSpace,
  parseAnswerSpaceOutput,
  FALLBACK_ANSWER_SPACES,
  // v0.42: 语言一致性导出
  inferPromptLanguage,
  UNBRANDED_PATTERNS_BY_LANG,
  BRANDED_PATTERNS_BY_LANG,
  PERSONAS_BY_LANG,
};
