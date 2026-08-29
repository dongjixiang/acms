#!/usr/bin/env node
// ACMS GEO 存储测试脚本（Phase 0 D4）
// 路径：scripts/test-geo-store.js
// 用途：单元测试 geo-store 5 张表 CRUD 全链路
//   - 创建 brand → 创建 query → 创建 response → 创建 score → 创建 snapshot
//   - 验证 list/get/stats 全对
//   - 测试完成清空所有测试数据（不污染多多的真实数据）
//
// 用法：node scripts/test-geo-store.js
//
// SOP（参考 P164）：测试用临时 brand，name 加 "test_" 前缀，测试完清理

const store = require('../server/services/geo-store');

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}`); }
}

async function main() {
  console.log('\n=== GEO Store 测试（Phase 0 D4）===\n');

  // 0. 清理残留（上次测试可能中断）
  console.log('Step 0: 清理任何残留 test_ 数据');
  const cleared = store._clearAll();
  console.log(`  清空 ${cleared.cleared} 条\n`);

  // 1. 创建 brand
  console.log('Step 1: createBrand');
  let brand;
  try {
    brand = store.createBrand({
      name: 'test_acme',
      domain: 'test-acme.example',
      settings: { engines: ['deepseek'] },
    });
    assert(brand.id && brand.id.startsWith('brand_'), 'brand.id 已生成');
    assert(brand.domain === 'test-acme.example', 'brand.domain 正确');
    assert(brand.status === 'active', 'brand.status=active');
  } catch (e) {
    assert(false, `createBrand threw: ${e.message}`);
    return cleanup();
  }

  // 2. 查询 brand
  console.log('\nStep 2: listBrands / getBrand / findBrandByDomain');
  const brands = store.listBrands();
  assert(brands.length === 1, `listBrands 返回 ${brands.length} 条（期望 1）`);
  assert(brands[0].id === brand.id, 'listBrands 第一条是刚创建的');
  assert(store.getBrand(brand.id)?.id === brand.id, 'getBrand(id) 找到');
  assert(store.findBrandByDomain('test-acme.example')?.id === brand.id, 'findBrandByDomain 找到');
  assert(store.findBrandByDomain('not-exist.com') === null, 'findBrandByDomain 找不到返回 null');

  // 3. 创建 queries
  console.log('\nStep 3: createQuery x3');
  const q1 = store.createQuery({ brand_id: brand.id, prompt: 'test query 1', category: 'brand_intro' });
  const q2 = store.createQuery({ brand_id: brand.id, prompt: 'test query 2', category: 'product' });
  const q3 = store.createQuery({ brand_id: brand.id, prompt: 'test query 3', category: 'comparison' });
  assert(q1.id && q1.engine_targets.length === 1 && q1.engine_targets[0] === 'deepseek', 'q1 创建 + engine_targets 默认 deepseek');
  assert(q2.id !== q1.id, 'q2 id 跟 q1 不同');

  // 4. 创建 responses（模拟真实查询结果）
  console.log('\nStep 4: createResponse x3');
  const r1 = store.createResponse({
    brand_id: brand.id,
    query_id: q1.id,
    engine: 'deepseek',
    model: 'deepseek-v4-flash',
    raw_answer: 'TestAcme 是一家示例公司。',
    citations: ['https://example.com/about'],
    latency_ms: 3200,
    usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
  });
  const r2 = store.createResponse({
    brand_id: brand.id,
    query_id: q1.id,
    engine: 'deepseek',
    model: 'deepseek-v4-flash',
    raw_answer: 'TestAcme 提供服务 A 和服务 B。',
    citations: [],
    latency_ms: 2800,
    usage: { prompt_tokens: 50, completion_tokens: 25, total_tokens: 75 },
  });
  const r3 = store.createResponse({
    brand_id: brand.id,
    query_id: q2.id,
    engine: 'deepseek',
    error: 'TIMEOUT',
    raw_answer: '',
    latency_ms: 60000,
  });
  assert(r1.id && r1.ts > 0, 'r1 创建');
  assert(r1.citations.length === 1, 'r1.citations 数组');
  assert(r3.error === 'TIMEOUT', 'r3 error 字段正确');

  // 5. 创建 scores
  console.log('\nStep 5: createScore x2');
  const sc1 = store.createScore({
    brand_id: brand.id,
    dimension: 'mention_rate',
    score: 0.67,
    details: { mentioned: 2, total_queries: 3 },
  });
  const sc2 = store.createScore({
    brand_id: brand.id,
    dimension: 'avg_position',
    score: 0.5,
    details: { positions: [1, 2] },
  });
  assert(sc1.score === 0.67, 'sc1.score 正确');
  assert(sc2.dimension === 'avg_position', 'sc2.dimension 正确');

  // 6. 创建 snapshot
  console.log('\nStep 6: createSnapshot');
  const snap = store.createSnapshot({
    brand_id: brand.id,
    week: '2026-W34',
    summary_json: { total_queries: 3, total_responses: 3, mention_rate: 0.67 },
  });
  assert(snap.id && snap.week === '2026-W34', 'snap 创建 + week 字段');

  // 7. stats 验证
  console.log('\nStep 7: getBrandStats');
  const stats = store.getBrandStats(brand.id);
  assert(stats.queries_count === 3, `queries_count=${stats.queries_count}（期望 3）`);
  assert(stats.responses_count === 3, `responses_count=${stats.responses_count}（期望 3）`);
  assert(stats.scores_count === 2, `scores_count=${stats.scores_count}（期望 2）`);
  assert(stats.snapshots_count === 1, `snapshots_count=${stats.snapshots_count}（期望 1）`);
  assert(stats.by_engine.deepseek?.success === 2, `deepseek.success=${stats.by_engine.deepseek?.success}（期望 2）`);
  assert(stats.by_engine.deepseek?.errors === 1, `deepseek.errors=${stats.by_engine.deepseek?.errors}（期望 1）`);
  assert(stats.by_engine.deepseek?.avg_latency_ms === 3000, `avg_latency_ms=${stats.by_engine.deepseek?.avg_latency_ms}（期望 3000）`);

  // 8. listResponses 过滤
  console.log('\nStep 8: listResponses filter');
  const all = store.listResponses({ brand_id: brand.id });
  assert(all.length === 3, `all=${all.length}`);
  const filtered = store.listResponses({ brand_id: brand.id, engine: 'openai' });
  assert(filtered.length === 0, `engine=openai 过滤返回 ${filtered.length}（期望 0）`);

  // 9. update brand
  console.log('\nStep 9: updateBrand');
  const updated = store.updateBrand(brand.id, { settings: { engines: ['deepseek', 'openai'] } });
  assert(updated?.settings.engines.length === 2, 'updateBrand 后 settings.engines 变了');

  // 10. 重复 domain 检查
  console.log('\nStep 10: 重复 domain 应抛错');
  try {
    store.createBrand({ name: 'dup', domain: 'test-acme.example' });
    assert(false, '重复 domain 应该抛错但没有');
  } catch (e) {
    assert(e.message.includes('已存在'), `重复 domain 抛错: ${e.message.slice(0, 50)}`);
  }

  // 11. 级联删除
  console.log('\nStep 11: deleteBrand 级联删除');
  const deleted = store.deleteBrand(brand.id);
  assert(deleted === true, 'deleteBrand 返回 true');
  assert(store.listBrands().length === 0, '删除后 listBrands 空');
  assert(store.listQueries(brand.id).length === 0, '级联删除 queries');
  assert(store.listResponses({ brand_id: brand.id }).length === 0, '级联删除 responses');

  function cleanup() {
    console.log('\n=== 清理测试数据 ===');
    const c = store._clearAll();
    console.log(`清空 ${c.cleared} 条`);
  }

  cleanup();

  console.log(`\n=== 测试结果 ===\n通过: ${passed}\n失败: ${failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});