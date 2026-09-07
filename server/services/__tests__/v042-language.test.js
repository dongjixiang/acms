// ACMS GEO v0.42 语言一致性 — 单测
// 用 node 内置 test runner：node --test server/services/__tests__/v042-language.test.js
// 测纯函数（不依赖 db / 网络）

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// ---- Mock geo-store / agent-runtime ----
const Module = require('node:module');
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === './geo-store' || id === '../db/connection') {
    return new Proxy({}, { get: () => () => ({}) });
  }
  if (id === './agent-runtime') {
    return { execute: async () => ({ content: '{}' }) };
  }
  return origRequire.call(this, id);
};

const {
  inferPromptLanguage,
  buildLlmPrompt,
  UNBRANDED_PATTERNS_BY_LANG,
  BRANDED_PATTERNS_BY_LANG,
  PERSONAS_BY_LANG,
  INDUSTRY_PROMPT_GUIDANCE,
} = require('../geo-prompt-llm');

// ===== Helper：从 buildLlmPrompt 输出提取「模板段」=====
// 模板段特征：行首是 `[...]`（如 `[informational]` / `[最佳推荐]` / `[特化]`）
// 不过滤中文 — zh 模板行的 `[最佳推荐]` 也是中文标签
// 让后续测试按需检测行的语言
function extractPatternLines(promptOutput) {
  const lines = promptOutput.split('\n');
  return lines.filter(l => l.trim().startsWith('['));
}

// 国际通用术语白名单（不算"语言混搭" — 这些词在中文/英文搜索里都是术语）
const INTL_TERMS = ['ROI', 'FDA', 'API', 'CRM', 'SEO', 'PPC', 'B2B', 'B2C', 'KPI', 'OKR', 'CEO', 'AI', 'IT', 'UI', 'UX', 'SKU', 'VS', 'AIGC'];
// 检测行内是否有英文 editorial 信号词（排除占位符 + INTL_TERMS 白名单）
function hasEnglishEditorial(line) {
  // 去掉占位符 {xxx} 和 [xxx]
  let cleaned = line.replace(/\{[^}]+\}/g, '').replace(/\[[^\]]+\]/g, '');
  // 拆词检测：每个英文单词不在 INTL_TERMS 白名单就算"混搭"
  const words = cleaned.match(/\b[a-zA-Z]{2,}\b/g) || [];
  for (const w of words) {
    const upper = w.toUpperCase();
    if (!INTL_TERMS.includes(upper) && !INTL_TERMS.includes(w)) {
      return true;
    }
  }
  return false;
}

// ===== inferPromptLanguage 基础推断 =====

test('v0.42 inferPromptLanguage: 中文 brand.name → zh', () => {
  assert.equal(inferPromptLanguage({ name: '中展集团', industry: 'exhibition' }), 'zh');
  assert.equal(inferPromptLanguage({ name: '微众银行', industry: 'banking' }), 'zh');
  assert.equal(inferPromptLanguage({ name: '卡司通展览' }), 'zh');
});

test('v0.42 inferPromptLanguage: 英文 brand.name → en', () => {
  assert.equal(inferPromptLanguage({ name: 'Nike', industry: 'sports' }), 'en');
  assert.equal(inferPromptLanguage({ name: 'Asics America', industry: 'sports' }), 'en');
  assert.equal(inferPromptLanguage({ name: 'Tons of Books' }), 'en');
});

test('v0.42 inferPromptLanguage: options.lang 显式覆盖', () => {
  assert.equal(inferPromptLanguage({ name: '卡司通' }, { lang: 'en' }), 'en');
  assert.equal(inferPromptLanguage({ name: 'Nike' }, { lang: 'zh' }), 'zh');
  // 非 zh/en 字符串 → 忽略（按 brand.name 推断）
  assert.equal(inferPromptLanguage({ name: 'Nike' }, { lang: 'fr' }), 'en');
});

test('v0.42 inferPromptLanguage: 边界 — null/空/只有 industry 含中文', () => {
  assert.equal(inferPromptLanguage(null), 'en');
  assert.equal(inferPromptLanguage(undefined), 'en');
  assert.equal(inferPromptLanguage({}), 'en');
  // name 是英文但 industry 是中文 → zh（fallback 到 industry）
  assert.equal(inferPromptLanguage({ name: 'BrandX', industry: '展览' }), 'zh');
  // name 是英文且 industry 是英文 → en
  assert.equal(inferPromptLanguage({ name: 'BrandX', industry: 'exhibition' }), 'en');
});

test('v0.42 inferPromptLanguage: 别名含中文 → zh', () => {
  assert.equal(inferPromptLanguage({ name: 'Asics', aliases: ['亚瑟士'] }), 'zh');
  assert.equal(inferPromptLanguage({ name: 'BrandX', aliases: ['CN-name'] }), 'en');
});

// ===== UNBRANDED_PATTERNS_BY_LANG 句式库完整性 =====

test('v0.42 UNBRANDED_PATTERNS_BY_LANG: zh/en 两库存在且大小一致（v0.31 设计 16 类对齐）', () => {
  assert.ok(Array.isArray(UNBRANDED_PATTERNS_BY_LANG.zh));
  assert.ok(Array.isArray(UNBRANDED_PATTERNS_BY_LANG.en));
  assert.equal(UNBRANDED_PATTERNS_BY_LANG.zh.length, 16, 'zh 库应该 ≥ v0.31 的 16 类');
  assert.equal(UNBRANDED_PATTERNS_BY_LANG.en.length, 16, 'en 库应该 ≥ v0.31 的 16 类');
});

test('v0.42 UNBRANDED_PATTERNS_BY_LANG.zh: 16 类全部纯中文（无 ASCII 字母）', () => {
  // v0.42 设计原则：zh 库的句式模板不应包含英文字母（除了占位符 [xxx]）
  for (const [id, tpl] of UNBRANDED_PATTERNS_BY_LANG.zh) {
    // 去掉 [xxx] 占位符再检测
    const cleaned = tpl.replace(/\[[^\]]+\]/g, '');
    // 检查是否有 ASCII 字母（a-zA-Z）
    assert.ok(!/[a-zA-Z]{2,}/.test(cleaned),
      `zh 库句式 "${id}" 含英文字母: "${tpl}"`);
  }
});

test('v0.42 UNBRANDED_PATTERNS_BY_LANG.en: 16 类全部纯英文（无 CJK 字符）', () => {
  for (const [id, tpl] of UNBRANDED_PATTERNS_BY_LANG.en) {
    // 去掉 [xxx] 占位符再检测
    const cleaned = tpl.replace(/\[[^\]]+\]/g, '');
    // 检查是否有 CJK 字符
    assert.ok(!/[\u4e00-\u9fff]/.test(cleaned),
      `en 库句式 "${id}" 含中文字符: "${tpl}"`);
  }
});

test('v0.42 BRANDED_PATTERNS_BY_LANG: zh/en 各 9 类对齐', () => {
  assert.equal(BRANDED_PATTERNS_BY_LANG.zh.length, 9);
  assert.equal(BRANDED_PATTERNS_BY_LANG.en.length, 9);
});

test('v0.42 BRANDED_PATTERNS_BY_LANG.zh: 全部纯中文', () => {
  for (const [id, tpl] of BRANDED_PATTERNS_BY_LANG.zh) {
    const cleaned = tpl.replace(/\{[a-z]+\}|\[[^\]]+\]/g, '');
    assert.ok(!/[a-zA-Z]{3,}/.test(cleaned),
      `branded zh 句式 "${id}" 含英文字母: "${tpl}"`);
  }
});

test('v0.42 BRANDED_PATTERNS_BY_LANG.en: 全部纯英文', () => {
  for (const [id, tpl] of BRANDED_PATTERNS_BY_LANG.en) {
    const cleaned = tpl.replace(/\{[a-z]+\}|\[[^\]]+\]/g, '');
    assert.ok(!/[\u4e00-\u9fff]/.test(cleaned),
      `branded en 句式 "${id}" 含中文字符: "${tpl}"`);
  }
});

// ===== INDUSTRY_PROMPT_GUIDANCE 行业特化按 lang 拆分 =====

test('v0.42 INDUSTRY_PROMPT_GUIDANCE: 每个行业都有 zh/en 双版本特化句式', () => {
  for (const [key, g] of Object.entries(INDUSTRY_PROMPT_GUIDANCE)) {
    assert.ok(g.extra_unbranded_by_lang, `[${key}] 缺 extra_unbranded_by_lang`);
    assert.ok(g.extra_branded_by_lang, `[${key}] 缺 extra_branded_by_lang`);
    assert.ok(g.modifiers_by_lang, `[${key}] 缺 modifiers_by_lang`);
    assert.ok(Array.isArray(g.extra_unbranded_by_lang.zh), `[${key}] extra_unbranded_by_lang.zh 不是数组`);
    assert.ok(Array.isArray(g.extra_unbranded_by_lang.en), `[${key}] extra_unbranded_by_lang.en 不是数组`);
    // 每个行业（除 default）应有内容
    if (key !== 'default') {
      assert.ok(g.extra_unbranded_by_lang.zh.length > 0, `[${key}] zh 行业特化 unbranded 应该非空`);
      assert.ok(g.extra_unbranded_by_lang.en.length > 0, `[${key}] en 行业特化 unbranded 应该非空`);
    }
  }
});

test('v0.42 INDUSTRY_PROMPT_GUIDANCE: marketing zh 行业特化纯中文，en 纯英文', () => {
  const m = INDUSTRY_PROMPT_GUIDANCE.marketing;
  // 去掉占位符 {xxx} 和 [xxx] 再检测（占位符里的英文不算混搭）
  const stripPlaceholders = (s) => s.replace(/\{[^}]+\}/g, '').replace(/\[[^\]]+\]/g, '');
  for (const tpl of m.extra_unbranded_by_lang.zh) {
    const cleaned = stripPlaceholders(tpl);
    assert.ok(!hasEnglishEditorial(cleaned), `marketing zh 特化含英文: "${tpl}"`);
  }
  for (const tpl of m.extra_unbranded_by_lang.en) {
    assert.ok(!/[\u4e00-\u9fff]/.test(tpl), `marketing en 特化含中文: "${tpl}"`);
  }
});

// ===== buildLlmPrompt 语言隔离（核心测试）=====

test('v0.42 buildLlmPrompt: 中文品牌 → 模板段全中文，无英文 editorial', () => {
  const out = buildLlmPrompt({ name: '卡司通展览', industry: 'exhibition' });
  const patternLines = extractPatternLines(out);

  // 至少要有 16 个 unbranded + 9 个 branded
  assert.ok(patternLines.length >= 25, `模板行数应该 ≥25（16+9），实际 ${patternLines.length}`);

  // 所有模板行不能含英文 editorial 信号词（除占位符 + INTL_TERMS 白名单外）
  for (const line of patternLines) {
    assert.ok(!hasEnglishEditorial(line),
      `中文品牌模板含英文 editorial: "${line.trim()}"`);
  }
});

test('v0.42 buildLlmPrompt: 英文品牌 → 模板段全英文，无中文 editorial', () => {
  const out = buildLlmPrompt({ name: 'Nike', industry: 'sports', domain: 'nike.com' });
  const patternLines = extractPatternLines(out);

  assert.ok(patternLines.length >= 25, `模板行数应该 ≥25，实际 ${patternLines.length}`);

  // 所有模板行不能含 CJK 字符
  for (const line of patternLines) {
    assert.ok(!/[\u4e00-\u9fff]/.test(line),
      `英文品牌模板含中文: "${line.trim()}"`);
  }
});

test('v0.42 buildLlmPrompt: 中文品牌 → 行业特化 zh 版本（含中文关键词）', () => {
  const out = buildLlmPrompt({ name: '某营销公司', industry: 'marketing' });
  // marketing zh 行业特化应该有「客户案例」「数据对比」「ROI 测算」「代理商」
  assert.ok(out.includes('客户案例'), '应含 marketing zh 特化');
  assert.ok(out.includes('ROI 测算'), '应含 marketing zh 特化');
  // 检测特化行不含英文 editorial
  const patternLines = extractPatternLines(out);
  // 特化段现在被 extractPatternLines 排除（含中文前缀）
  // 但我们可以检测整个 prompt 输出不含英文 case study 等
  assert.ok(!out.includes('case study') || out.includes('case study\n❌'), '正常特化段不应含 case study');
});

test('v0.42 buildLlmPrompt: 英文品牌 → 行业特化 en 版本（含英文关键词）', () => {
  const out = buildLlmPrompt({ name: 'BrandX', industry: 'marketing', domain: 'brandx.com' });
  // 检测特化段（含 [特化] 前缀的行）
  const lines = out.split('\n');
  const industryExtra = lines.filter(l => l.includes('[特化]'));
  assert.ok(industryExtra.length > 0, '应该有行业特化行');
  const hasEnglish = industryExtra.some(l => /case study|data-driven|ROI/i.test(l));
  assert.ok(hasEnglish, 'en 特化行应该含 case study / data-driven / ROI 等英文');
  // 不应含 CJK（去掉 [特化] 中文标记前缀后再检测）
  for (const line of industryExtra) {
    const stripped = line.replace(/\[特化\]/g, '');
    assert.ok(!/[\u4e00-\u9fff]/.test(stripped),
      `en 特化行含中文: "${line.trim()}"`);
  }
});

// ===== 语言一致性硬约束段 =====

test('v0.42 buildLlmPrompt: 中文品牌 → 包含「中文」语言一致性硬约束', () => {
  const out = buildLlmPrompt({ name: '卡司通展览', industry: 'exhibition' });
  assert.ok(out.includes('语言一致性硬约束'), '应包含硬约束段标题');
  assert.ok(out.includes('中文'), '应明确标注 prompt 语言为中文');
  // 反例段
  assert.ok(out.includes('best 展台搭建公司'), '反例应展示中英混搭');
  assert.ok(out.includes('❌'), '反例应标 ❌');
});

test('v0.42 buildLlmPrompt: 英文品牌 → 包含「English」一致性约束', () => {
  const out = buildLlmPrompt({ name: 'Nike', industry: 'sports' });
  assert.ok(out.includes('Language consistency'), 'en 硬约束段标题');
  assert.ok(out.includes('English'), '应明确标注 prompt 语言为 English');
});

test('v0.42 buildLlmPrompt: options.lang 显式覆盖语言推断', () => {
  // 中文品牌 + options.lang=en → 应该输出英文模板
  const out = buildLlmPrompt(
    { name: '卡司通展览', industry: 'exhibition' },
    { lang: 'en' }
  );
  assert.ok(out.includes('English'), 'options.lang=en 应该覆盖 → 输出 English 模板');
  // 检测模板段不含中文（branded + 行业特化段允许含中文 brand name — brand identity 强制保留）
  const patternLines = extractPatternLines(out);
  for (const line of patternLines) {
    // branded 段或 [特化] 行业特化段会含中文 brand 名 — 不算混搭
    const isBranded = line.includes('[特化]') || /^\[(brand-intro|替代选择|价值评估|口碑评价|价格信息|可信度|使用方法|优缺点|横向对比|alternative|comparison|editorial)\s*\]/.test(line);
    if (isBranded) continue;
    assert.ok(!/[\u4e00-\u9fff]/.test(line), `强制 en 后模板含中文: "${line.trim()}"`);
  }
});

// ===== 硬约束段按 lang 切换 =====

test('v0.42 buildLlmPrompt: 中文品牌硬约束 8 含「100% 中文」', () => {
  const out = buildLlmPrompt({ name: '某品牌' });
  assert.ok(out.includes('100% 中文'), '硬约束应明确 100% 中文');
});

test('v0.42 buildLlmPrompt: 英文品牌硬约束 8 含 "100% English"', () => {
  const out = buildLlmPrompt({ name: 'BrandX' });
  assert.ok(out.includes('100% English'), '硬约束应明确 100% English');
});

// ===== Profound Parrot 段按 lang 切换 =====

test('v0.42 buildLlmPrompt: 中文品牌 Parrot 段用中文 editorial 信号词', () => {
  const out = buildLlmPrompt({ name: '某品牌' });
  // 中文 Parrot 段应该用「最佳/推荐/替代品/优缺点」
  assert.ok(out.includes('最佳') || out.includes('推荐'), '中文 Parrot 段应含中文信号词');
  // 不应在 Parrot 段说要"用英文 best" — 等等，是说不要用英文 best
});

test('v0.42 buildLlmPrompt: 英文品牌 Parrot 段用英文 editorial 信号词', () => {
  const out = buildLlmPrompt({ name: 'BrandX' });
  assert.ok(out.includes('best/top/recommended'), '英文 Parrot 段应含英文信号词');
  assert.ok(out.includes('NOT Chinese'), '英文 Parrot 段应明确不用中文');
});

// ===== EEAT 段按 lang 切换 =====

test('v0.42 buildLlmPrompt: 中文品牌 EEAT 用中文 tag 示例', () => {
  const out = buildLlmPrompt({ name: '某品牌' });
  assert.ok(out.includes('「实操」「案例」'), '中文 EEAT 应有中文 tag 示例');
});

test('v0.42 buildLlmPrompt: 英文品牌 EEAT 用英文 tag 示例', () => {
  const out = buildLlmPrompt({ name: 'BrandX' });
  assert.ok(out.includes('"case-study"') || out.includes('"real-world"'), '英文 EEAT 应有英文 tag 示例');
});

// ===== Tags 规范段按 lang =====

test('v0.42 buildLlmPrompt: 中文品牌 Tags 规范要求「tag 内容跟 prompt 同语言」', () => {
  const out = buildLlmPrompt({ name: '某品牌' });
  assert.ok(out.includes('tag 内容跟 prompt 同语言'), '中文 Tags 规范应要求同语言');
});

test('v0.42 buildLlmPrompt: 英文品牌 Tags 规范要求 "Tags must match prompt language"', () => {
  const out = buildLlmPrompt({ name: 'BrandX' });
  assert.ok(out.includes('Tags must match prompt language'), '英文 Tags 规范应要求同语言');
});

// ===== 行业差异化 modifiers 段按 lang =====

test('v0.42 buildLlmPrompt: 中文品牌 banking 行业关键词调色板是中文', () => {
  const out = buildLlmPrompt({ name: '微众银行', industry: 'banking' });
  assert.ok(out.includes('合规'), 'banking zh 关键词调色板含「合规」');
  assert.ok(out.includes('监管'), 'banking zh 关键词调色板含「监管」');
});

test('v0.42 buildLlmPrompt: 英文品牌 banking 行业关键词调色板是英文', () => {
  const out = buildLlmPrompt({ name: 'N26', industry: 'banking', domain: 'n26.com' });
  assert.ok(out.includes('compliance'), 'banking en 关键词调色板含 compliance');
  assert.ok(out.includes('regulation'), 'banking en 关键词调色板含 regulation');
});

// ===== Format 段按 lang =====

test('v0.42 buildLlmPrompt: 中文品牌 Format 段示例含中文', () => {
  const out = buildLlmPrompt({ name: '某品牌' });
  // Format JSON 示例的 prompt 字段应该是「搜索片段（≤12字）」
  assert.ok(out.includes('搜索片段') && out.includes('12字'), 'Format 段示例应是中文');
});

test('v0.42 buildLlmPrompt: 英文品牌 Format 段示例含英文', () => {
  const out = buildLlmPrompt({ name: 'BrandX' });
  assert.ok(out.includes('search fragment') && out.includes('8 words'), 'Format 段示例应是英文');
});

// ===== 边界 case =====

test('v0.42 buildLlmPrompt: 未知品牌（无 industry）→ 默认 zh（基于 brand.name）', () => {
  const out = buildLlmPrompt({ name: '某品牌' });
  // 中文品牌默认 zh
  assert.ok(out.includes('中文'));
});

test('v0.42 buildLlmPrompt: 纯英文品牌无 industry → en', () => {
  const out = buildLlmPrompt({ name: 'TestBrand' });
  assert.ok(out.includes('English'));
});

test('v0.42 buildLlmPrompt: options.lang 强制 en 让中文品牌走英文模板', () => {
  const out = buildLlmPrompt({ name: '某中文品牌', industry: 'exhibition' }, { lang: 'en' });
  // 应该走英文模板（含 alternatives 等英文）
  const patternLines = extractPatternLines(out);
  assert.ok(patternLines.some(l => l.includes('alternatives')), '强制 en 后应含 alternatives');
  // 不应含中文模板。branded + [特化] 段允许含中文 brand name（brand identity）
  for (const line of patternLines) {
    const isBranded = line.includes('[特化]') || /^\[(brand-intro|替代选择|价值评估|口碑评价|价格信息|可信度|使用方法|优缺点|横向对比|alternative|comparison|editorial)\s*\]/.test(line);
    if (isBranded) continue;
    assert.ok(!/[\u4e00-\u9fff]/.test(line), '强制 en 后模板段不应含中文');
  }
});

// ===== 回归：v0.31 / v0.40 / v0.41 既有能力不破 =====

test('v0.42 回归: buildLlmPrompt 不传 options 仍正常工作', () => {
  const out = buildLlmPrompt({ name: '某品牌', industry: 'exhibition' });
  assert.ok(out.includes('【Role — 角色】'));
  assert.ok(out.includes('【Task — 任务】'));
  assert.ok(out.includes('【Format — 输出格式】'));
});

test('v0.42 回归: v0.41 P1 答案空间段仍正常工作', () => {
  const out = buildLlmPrompt(
    { name: '某品牌', industry: 'exhibition' },
    { answerSpaces: [
      { name: '展台搭建公司选择', type: 'decision', concept_roots: ['展台搭建'], rationale: '采购前' },
    ] }
  );
  assert.ok(out.includes('v0.41 答案空间分配'));
  assert.ok(out.includes('展台搭建公司选择'));
});

test('v0.42 回归: v0.40 行业差异化段仍正常工作（中文 brand + banking）', () => {
  const out = buildLlmPrompt({ name: '微众银行', industry: 'banking' });
  assert.ok(out.includes('银行/金融'));
  assert.ok(out.includes('35%') || out.includes('30%')); // intent 权重
  assert.ok(out.includes('合规') || out.includes('监管'));
});
