// ACMS GEO v0.41 P2 Schema.org 输出建议 — 单测
// 用 node 内置 test runner：node --test server/services/__tests__/v041-schema-suggest.test.js
// 测纯函数（不依赖 db / 网络）

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { suggestSchemas, sortByQuickWin, SCHEMA_RULES, countByIntent } = require('../geo-schema-suggest');

// ===== SCHEMA_RULES 数据结构 =====

test('v0.41 P2 SCHEMA_RULES: 包含主流 8+ 个 Schema 类型', () => {
  const types = SCHEMA_RULES.map(r => r.type);
  const required = ['Organization', 'WebSite', 'BreadcrumbList', 'FAQPage', 'HowTo', 'Product', 'Article'];
  for (const r of required) {
    assert.ok(types.includes(r), `应包含 ${r}`);
  }
});

test('v0.41 P2 每条规则字段完整（priority/difficulty/impact/reason/urlPattern/applicable）', () => {
  for (const rule of SCHEMA_RULES) {
    assert.ok(['P0', 'P1', 'P2'].includes(rule.priority), `${rule.type} priority 必须 P0/P1/P2`);
    assert.ok(['EASY', 'MEDIUM', 'HARD'].includes(rule.difficulty), `${rule.type} difficulty 必须 EASY/MEDIUM/HARD`);
    assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(rule.impact), `${rule.type} impact 必须 HIGH/MEDIUM/LOW`);
    assert.ok(typeof rule.reason === 'string' && rule.reason.length > 0, `${rule.type} reason 缺失`);
    assert.ok(typeof rule.urlPattern === 'string' && rule.urlPattern.length > 0, `${rule.type} urlPattern 缺失`);
    assert.ok(typeof rule.applicable === 'function', `${rule.type} applicable 必须是函数`);
  }
});

// ===== countByIntent 工具函数 =====

test('v0.41 P2 countByIntent: 直接传 intent 字段', () => {
  const queries = [
    { intent: 'informational' },
    { intent: 'informational' },
    { intent: 'comparative' },
  ];
  assert.equal(countByIntent(queries, ['informational']), 2);
  assert.equal(countByIntent(queries, ['comparative']), 1);
  assert.equal(countByIntent(queries, ['implementation']), 0);
});

test('v0.41 P2 countByIntent: 从 tags 推断（intent:xxx 格式）', () => {
  const queries = [
    { tags: ['intent:informational'] },
    { tags: ['intent:informational', 'exhibition-domain'] },
    { tags: ['intent:comparative'] },
  ];
  assert.equal(countByIntent(queries, ['informational']), 2);
});

test('v0.41 P2 countByIntent: 空 queries / null 安全', () => {
  assert.equal(countByIntent(null, ['informational']), 0);
  assert.equal(countByIntent(undefined, ['informational']), 0);
  assert.equal(countByIntent([], ['informational']), 0);
});

// ===== suggestSchemas 主函数 =====

test('v0.41 P2 suggestSchemas 空数据：永远推荐基础 4 条（Organization/WebSite/BreadcrumbList/Article）', () => {
  const r = suggestSchemas({ id: 'b1', name: '某品牌', domain: 'example.com', industry: 'exhibition' }, []);
  assert.equal(r.ok, true);
  const types = r.suggestions.map(s => s.type);
  assert.ok(types.includes('Organization'));
  assert.ok(types.includes('WebSite'));
  assert.ok(types.includes('BreadcrumbList'));
  assert.ok(types.includes('Article'));
});

test('v0.41 P2 suggestSchemas 无 domain 时不推荐 WebSite/BreadcrumbList', () => {
  const r = suggestSchemas({ id: 'b1', name: '某品牌', industry: 'exhibition' }, []);
  const types = r.suggestions.map(s => s.type);
  assert.ok(!types.includes('WebSite'), '无 domain 时不应推荐 WebSite');
  assert.ok(!types.includes('BreadcrumbList'), '无 domain 时不应推荐 BreadcrumbList');
  assert.ok(!types.includes('Product'), '无 domain 时不应推荐 Product');
  assert.ok(types.includes('Organization'), 'Organization 应永远推荐');
});

test('v0.41 P2 FAQPage 触发：informational + troubleshooting ≥ 3', () => {
  const queries = [
    { intent: 'informational' }, { intent: 'informational' }, { intent: 'informational' },
    { intent: 'troubleshooting' },
  ];
  const r = suggestSchemas({ id: 'b1', name: 'X', domain: 'x.com' }, queries);
  assert.ok(r.suggestions.find(s => s.type === 'FAQPage'), '应该推荐 FAQPage');
});

test('v0.41 P2 FAQPage 不触发：informational + troubleshooting < 3', () => {
  const queries = [
    { intent: 'informational' }, { intent: 'troubleshooting' },
  ];
  const r = suggestSchemas({ id: 'b1', name: 'X', domain: 'x.com' }, queries);
  assert.ok(!r.suggestions.find(s => s.type === 'FAQPage'), '不应推荐 FAQPage');
});

test('v0.41 P2 HowTo 触发：implementation ≥ 3', () => {
  const queries = [
    { intent: 'implementation' }, { intent: 'implementation' }, { intent: 'implementation' },
  ];
  const r = suggestSchemas({ id: 'b1', name: 'X', domain: 'x.com' }, queries);
  assert.ok(r.suggestions.find(s => s.type === 'HowTo'), '应该推荐 HowTo');
});

test('v0.41 P2 Product 触发：comparative ≥ 3 + 有 domain', () => {
  const queries = [
    { intent: 'comparative' }, { intent: 'comparative' }, { intent: 'comparative' },
  ];
  const r = suggestSchemas({ id: 'b1', name: 'X', domain: 'x.com' }, queries);
  assert.ok(r.suggestions.find(s => s.type === 'Product'), '应该推荐 Product');

  // 无 domain 时不推荐
  const r2 = suggestSchemas({ id: 'b1', name: 'X' }, queries);
  assert.ok(!r2.suggestions.find(s => s.type === 'Product'), '无 domain 时不应推荐 Product');
});

test('v0.41 P2 QAPage 触发：troubleshooting ≥ 5', () => {
  const queries = Array.from({ length: 5 }, () => ({ intent: 'troubleshooting' }));
  const r = suggestSchemas({ id: 'b1', name: 'X', domain: 'x.com' }, queries);
  assert.ok(r.suggestions.find(s => s.type === 'QAPage'), 'troubleshooting=5 应该触发 QAPage');

  // troubleshooting=4 不触发
  const r2 = suggestSchemas({ id: 'b1', name: 'X', domain: 'x.com' },
    Array.from({ length: 4 }, () => ({ intent: 'troubleshooting' })));
  assert.ok(!r2.suggestions.find(s => s.type === 'QAPage'), 'troubleshooting=4 不应触发 QAPage');
});

test('v0.41 P2 Review 触发：comparative ≥ 3', () => {
  const queries = [
    { intent: 'comparative' }, { intent: 'comparative' }, { intent: 'comparative' },
  ];
  const r = suggestSchemas({ id: 'b1', name: 'X', domain: 'x.com' }, queries);
  assert.ok(r.suggestions.find(s => s.type === 'Review'));
});

// ===== stats 统计正确 =====

test('v0.41 P2 stats.intentDistribution 正确', () => {
  const queries = [
    { intent: 'informational', systemTags: ['unbranded'] },
    { intent: 'informational', systemTags: ['unbranded'] },
    { intent: 'comparative', systemTags: ['unbranded'] },
    { intent: 'implementation', systemTags: ['branded'] },
    { intent: 'unknown_xyz', systemTags: ['unbranded'] }, // unknown
  ];
  const r = suggestSchemas({ id: 'b1', name: 'X', domain: 'x.com' }, queries);
  assert.equal(r.stats.totalQueries, 5);
  assert.equal(r.stats.unbrandedQueries, 4);
  assert.equal(r.stats.brandedQueries, 1);
  assert.equal(r.stats.intentDistribution.informational, 2);
  assert.equal(r.stats.intentDistribution.comparative, 1);
  assert.equal(r.stats.intentDistribution.implementation, 1);
  assert.equal(r.stats.intentDistribution.unknown, 1);
});

test('v0.41 P2 stats 空 queries 时全 0', () => {
  const r = suggestSchemas({ id: 'b1', name: 'X' }, []);
  assert.equal(r.stats.totalQueries, 0);
  assert.equal(r.stats.unbrandedQueries, 0);
  assert.equal(r.stats.brandedQueries, 0);
  assert.deepEqual(r.stats.intentDistribution, { informational: 0, comparative: 0, implementation: 0, troubleshooting: 0, unknown: 0 });
});

// ===== schemasByPriority 分组 =====

test('v0.41 P2 schemasByPriority 按 P0/P1/P2 正确分组', () => {
  const queries = [
    { intent: 'informational' }, { intent: 'informational' }, { intent: 'informational' },
    { intent: 'comparative' }, { intent: 'comparative' }, { intent: 'comparative' },
    { intent: 'implementation' }, { intent: 'implementation' }, { intent: 'implementation' },
    { intent: 'troubleshooting' }, { intent: 'troubleshooting' }, { intent: 'troubleshooting' },
    { intent: 'troubleshooting' }, { intent: 'troubleshooting' },
  ];
  const r = suggestSchemas({ id: 'b1', name: 'X', domain: 'x.com' }, queries);
  assert.ok(r.schemasByPriority.P0.length > 0);
  assert.ok(r.schemasByPriority.P1.length > 0);
  // P2 可能有（Review + comparative≥3）也可能没有，取决于 intent 数
  for (const s of r.suggestions) {
    assert.ok(r.schemasByPriority[s.priority].find(x => x.type === s.type),
      `${s.type} 应该在 ${s.priority} 分组里`);
  }
});

// ===== sortByQuickWin =====

test('v0.41 P2 sortByQuickWin: P0+EASY+HIGH 排第一', () => {
  const queries = [
    { intent: 'informational' }, { intent: 'informational' }, { intent: 'informational' },
    { intent: 'comparative' }, { intent: 'comparative' }, { intent: 'comparative' },
  ];
  const r = suggestSchemas({ id: 'b1', name: 'X', domain: 'x.com' }, queries);
  const sorted = sortByQuickWin(r.suggestions);
  // Organization / Article 都是 P0+EASY+HIGH（score = 3+3+3 = 9）
  assert.ok(['Organization', 'Article'].includes(sorted[0].type),
    `第一个应该是 P0+EASY+HIGH 之一（Organization/Article），实际 ${sorted[0].type}`);

  // P2+LOW 应该排最后
  const last = sorted[sorted.length - 1];
  assert.equal(last.priority, 'P2', `最后应该是 P2，实际 ${last.priority}`);
});

test('v0.41 P2 sortByQuickWin 不修改原数组', () => {
  const queries = [
    { intent: 'informational' }, { intent: 'informational' }, { intent: 'informational' },
  ];
  const r = suggestSchemas({ id: 'b1', name: 'X', domain: 'x.com' }, queries);
  const original = [...r.suggestions];
  sortByQuickWin(r.suggestions);
  assert.deepEqual(r.suggestions.map(s => s.type), original.map(s => s.type),
    'sortByQuickWin 不应该修改原数组');
});

// ===== 边界 case =====

test('v0.41 P2 suggestSchemas brand 为 null 不抛错', () => {
  const r = suggestSchemas(null, []);
  assert.equal(r.ok, true);
  assert.equal(r.brand.id, null);
});

test('v0.41 P2 suggestSchemas queries 为 null 不抛错', () => {
  const r = suggestSchemas({ id: 'b1', name: 'X' }, null);
  assert.equal(r.ok, true);
  assert.equal(r.stats.totalQueries, 0);
});

test('v0.41 P2 suggestSchemas generatedAt 是 ISO 字符串', () => {
  const r = suggestSchemas({ id: 'b1', name: 'X' }, []);
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(r.generatedAt),
    `generatedAt 应该是 ISO 格式，实际 ${r.generatedAt}`);
});

test('v0.41 P2 suggestSchemas 返回 note 字段说明依据', () => {
  const r = suggestSchemas({ id: 'b1', name: 'X' }, []);
  assert.ok(typeof r.note === 'string' && r.note.length > 0);
  assert.ok(r.note.includes('Schema.org'));
});

// ===== 集成：完整 exhibition 案例 =====

test('v0.41 P2 集成: 卡司通展览场景（4 类意图各 ≥3 个）', () => {
  const queries = [
    // 6 informational
    { intent: 'informational', systemTags: ['unbranded'] },
    { intent: 'informational', systemTags: ['unbranded'] },
    { intent: 'informational', systemTags: ['unbranded'] },
    // 4 comparative
    { intent: 'comparative', systemTags: ['unbranded'] },
    { intent: 'comparative', systemTags: ['unbranded'] },
    { intent: 'comparative', systemTags: ['unbranded'] },
    // 5 implementation
    { intent: 'implementation', systemTags: ['unbranded'] },
    { intent: 'implementation', systemTags: ['unbranded'] },
    { intent: 'implementation', systemTags: ['unbranded'] },
    // 4 troubleshooting
    { intent: 'troubleshooting', systemTags: ['unbranded'] },
    { intent: 'troubleshooting', systemTags: ['unbranded'] },
    { intent: 'troubleshooting', systemTags: ['unbranded'] },
  ];
  const r = suggestSchemas({ id: 'b1', name: '卡司通', domain: 'kst-expo.com', industry: 'exhibition' }, queries);

  const types = r.suggestions.map(s => s.type);
  // 应该触发的（基于数量）
  for (const expected of ['Organization', 'WebSite', 'BreadcrumbList', 'FAQPage', 'HowTo', 'Product', 'Article', 'Review']) {
    assert.ok(types.includes(expected), `应包含 ${expected}`);
  }
  // troubleshooting=4 < 5 → QAPage 不触发
  assert.ok(!types.includes('QAPage'), 'troubleshooting=4 不应触发 QAPage（阈值 5）');

  console.log(`  → 卡司通场景返回 ${r.suggestions.length} 个建议：${types.join(', ')}`);
});
