// ACMS Email Classifier — v0.30（借鉴 elie222/inbox-zero@main, AI 邮件智能分类）
// 路径：server/services/email-classifier.js
//
// 借鉴来源（NOASSERTION license — 重写为 JS，不 copy 源码）：
//   - apps/web/utils/ai/categorize-sender/ai-categorize-single-sender.ts (78 行)
//     * XML 结构 prompt（<sender>/<recent_emails>/<categories>）
//     * "Use Other if unsure" 准确度优于完整度纪律
//   - apps/web/utils/categorize/senders/categorize.ts (217 行)
//     * preCategorizeSendersWithStaticRules() — static rules first, AI fallback
//     * 防类目扩散：LLM 返回的 category 必须 ∈ 用户类目列表
//
// 设计原则（多多「对 toast 骗人零容忍」）：
//   1. 不后台静默运行 — 必须用户主动点按钮
//   2. 立刻返回结果 + rationale（不掩盖不确定性）
//   3. 防 LLM 幻觉：返回校验 + 防类目扩散
//   4. 防服务端异常：fallback 到 "Other"
//
// 调用方：routes/emails.js POST /classify
//   入参：{ from, subject, snippet, categories?, modelId? }
//   出参：{ ok, category, rationale, confidence, source: 'static' | 'ai' | 'fallback' }

const runtime = require('./agent-runtime');
const categoryStore = require('./email-sender-category-store'); // v0.33 持久化发件人分类

// === 预置类目（v0.30 内置 — 用户可在 v0.31 自定义扩展） ===
// 设计依据：常见邮件分类 + inbox-zero 的 defaultCategory 模式（newsletter/receipt/other）
const DEFAULT_CATEGORIES = [
  { name: '客户咨询', description: '客户/用户的询问、报价请求、合作意向' },
  { name: '会议邀请', description: '会议、约会、面试、电话沟通的邀请和确认' },
  { name: '工作协作', description: '同事/团队内部的工作沟通、项目协作' },
  { name: '财务发票', description: '发票、收款、付款、账单、报销' },
  { name: '营销订阅', description: 'newsletter、订阅邮件、营销推广、活动邀请函' },
  { name: '求职招聘', description: '求职信、面试邀约、招聘相关' },
  { name: '自动通知', description: '系统通知、提醒、验证码、机器人发送' },
  { name: '其他', description: '不在上述类目内' },
];

// === Static rules（借鉴 inbox-zero preCategorizeSendersWithStaticRules()） ===
// 优先用 regex 规则匹配 → 不调 LLM，0 成本
// 设计依据：newsletter/receipt 类有强烈的特征词
const STATIC_RULES = [
  {
    name: '营销订阅',
    test: (from, subject) => {
      const f = (from || '').toLowerCase();
      const s = (subject || '').toLowerCase();
      // newsletter / marketing / promo 特征
      return /newsletter|marketing|promo|noreply|no-reply|notification|subscrib|@mail\.|@newsletter|@marketing|@promotions/i.test(f)
        || /\bunsubscribe\b|\bsubscribe\b|推广|订阅|营销|活动|折扣|offer|sale|deal/i.test(s);
    },
  },
  {
    name: '财务发票',
    test: (from, subject) => {
      const f = (from || '').toLowerCase();
      const s = (subject || '').toLowerCase();
      return /invoice|billing|@pay|payment|receipt|账单|账单|invoice/i.test(f)
        || /\$[\d,]+|￥[\d,]+|发票|账单|付款|收款|报销|金额|订单|order\s*#/i.test(s);
    },
  },
  {
    name: '自动通知',
    test: (from, subject) => {
      const f = (from || '').toLowerCase();
      const s = (subject || '').toLowerCase();
      return /noreply|no-reply|@notify|@alert|@bot|@daemon/i.test(f)
        || /\bverification\b|验证码|提醒|alert|signal|ping/i.test(s);
    },
  },
];

/**
 * Static-first 规则匹配
 * @returns {string|null} 匹配到的类目名称，未匹配返回 null
 */
function matchStaticRule(from, subject) {
  for (const rule of STATIC_RULES) {
    try {
      if (rule.test(from, subject)) return rule.name;
    } catch (_) { /* 忽略单条规则异常 */ }
  }
  return null;
}

// === AI Prompt（借鉴 inbox-zero XML 结构 + "Use Other if unsure" 纪律） ===
function buildSystemPrompt() {
  return `You are an AI assistant specializing in email management and classification.
Your task is to classify a single email based on its sender, subject, and content snippet.
Provide an accurate categorization to help the user efficiently manage their inbox.

IMPORTANT:
- Accuracy is more important than completeness
- Only use the categories provided in the user message
- If the category is unclear or multiple categories could apply, respond with "其他"
- If you are not sure, respond with "其他" — do not guess
- Respond in JSON format only, no markdown code blocks`;
}

function buildUserPrompt(email, categories) {
  const cats = categories || DEFAULT_CATEGORIES;
  return `Classify this email:

<email>
  <from>${escapeXml(email.from || '')}</from>
  <subject>${escapeXml(email.subject || '')}</subject>
  <snippet>${escapeXml(String(email.snippet || '').slice(0, 500))}</snippet>
</email>

<categories>
${cats.map((c, i) => `  ${i + 1}. ${c.name} — ${c.description || ''}`).join('\n')}
</categories>

<instructions>
1. Analyze the sender's email address, subject, and snippet for classification.
2. If the category is clear, assign it (return the exact category name).
3. If unsure, return "其他".
4. Only choose from the categories listed above.
</instructions>

<output_format>
{"category": "exact-category-name", "rationale": "1 sentence max"}
</output_format>`;
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// === LLM Output 解析（防 hallucination） ===
function parseLlmOutput(raw) {
  if (!raw) return null;
  let text = String(raw).trim();
  // 去 markdown 代码块
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  // 找 JSON
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  text = text.slice(start, end + 1);
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed.category !== 'string') return null;
    return {
      category: parsed.category.trim(),
      rationale: (parsed.rationale || '').toString().trim().slice(0, 200),
    };
  } catch (_) {
    return null;
  }
}

// === 主入口：分类单封邮件 ===
/**
 * @param {Object} opts
 * @param {string} opts.from      - 发件人地址
 * @param {string} opts.subject   - 邮件主题
 * @param {string} opts.snippet   - 邮件正文摘要（最多 500 字）
 * @param {Array}  [opts.categories] - 可选用户类目（不传走 DEFAULT_CATEGORIES）
 * @param {string} [opts.modelId] - 可选 LLM 模型 ID
 * @returns {Promise<{
 *   ok: boolean,
 *   category: string,
 *   rationale: string,
 *   confidence: 'high'|'medium'|'low',
 *   source: 'static'|'ai'|'fallback',
 *   error?: string
 * }>}
 */
async function classifyEmail({ from, subject, snippet, categories, modelId } = {}) {
  // 1) static rules first（避免无谓 LLM 调用）
  const staticMatch = matchStaticRule(from, subject);
  if (staticMatch) {
    return {
      ok: true,
      category: staticMatch,
      rationale: '匹配内嵌静态规则（无 LLM 调用）',
      confidence: 'high',
      source: 'static',
    };
  }

  // 2) AI 推断
  const cats = categories || DEFAULT_CATEGORIES;
  const validNames = new Set(cats.map((c) => c.name));
  // 不让 LLM 创造新类目 — 始终告诉它"其他"作为兜底
  const hasFallback = validNames.has('其他');
  const promptCategories = hasFallback ? cats : [...cats, { name: '其他', description: '兜底分类' }];

  let parsed = null;
  try {
    const result = await runtime.execute({
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt({ from, subject, snippet }, promptCategories) },
      ],
      caller: 'email-classifier',
      maxRounds: 1,
      maxTokens: 300,
      temperature: 0.2,
      modelId,
    });
    if (result.error) {
      return {
        ok: false,
        category: '其他',
        rationale: '',
        confidence: 'low',
        source: 'fallback',
        error: result.error,
      };
    }
    parsed = parseLlmOutput(result.content);
  } catch (e) {
    return {
      ok: false,
      category: '其他',
      rationale: '',
      confidence: 'low',
      source: 'fallback',
      error: e.message,
    };
  }

  if (!parsed) {
    return {
      ok: false,
      category: '其他',
      rationale: '',
      confidence: 'low',
      source: 'fallback',
      error: 'LLM 输出无法解析',
    };
  }

  // 3) 防类目扩散（借鉴 inbox-zero line 116）：只在 validNames 里
  if (!validNames.has(parsed.category)) {
    return {
      ok: true,
      category: '其他',
      rationale: `LLM 返回「${parsed.category}」不在用户类目中，已降级。其他：${parsed.rationale || ''}`.slice(0, 200),
      confidence: 'medium',
      source: 'ai',
    };
  }

  return {
    ok: true,
    category: parsed.category,
    rationale: parsed.rationale,
    confidence: 'medium', // LLM 推断中等可信
    source: 'ai',
    _persisted: false, // v0.33: 真实持久化由调用方处理（路由层或前端）
  };
}

// v0.33: 包装函数 — 分类后自动写 store（供路由层调用）
// 对比上方的 classifyEmail 返回 ok:false/fallback 时不写
// v0.38: 自动从 email_categories collection 加载用户维护的分类（替代硬编码 DEFAULT_CATEGORIES）
async function classifyEmailAndPersist({ from, mailbox, subject, snippet, categories, modelId } = {}) {
  // 加载用户自定义分类（按 mailbox 隔离 + fallback 到默认 8 类别）
  let effectiveCategories = categories;
  if (!effectiveCategories && mailbox) {
    try {
      const { collection } = require('../db/connection');
      const coll = collection('email_categories');
      const userCats = coll.find
        ? coll.find(c => (c.mailbox === mailbox || c.mailbox === '*' || !c.mailbox) && c.enabled !== false)
        : (coll.all ? coll.all().filter(c => (c.mailbox === mailbox || c.mailbox === '*' || !c.mailbox) && c.enabled !== false) : []);
      if (userCats.length > 0) {
        // 转换为 classifier 期望的格式 { name, description }
        effectiveCategories = userCats.map(c => ({ name: c.name, description: c.description || '' }));
      }
    } catch (e) {
      console.warn('[email-classifier] 加载用户分类失败，回退到默认:', e.message);
    }
  }

  const r = await classifyEmail({ from, subject, snippet, categories: effectiveCategories, modelId });
  if (r.ok && r.source !== 'fallback' && from && mailbox) {
    try {
      categoryStore.saveCategory({
        sender: from, mailbox,
        category: r.category, source: r.source, rationale: r.rationale || '',
      });
      r._persisted = true;
    } catch (e) {
      console.warn('[email-classifier] 持久化失败:', e.message);
    }
  }
  // v0.38: 返回时附带用户分类来源信息（让前端能显示"使用了用户自定义分类"）
  r.userCategoriesUsed = effectiveCategories ? effectiveCategories.length : 0;
  return r;
}

module.exports = {
  classifyEmail,
  classifyEmailAndPersist,
  matchStaticRule,
  DEFAULT_CATEGORIES,
};
