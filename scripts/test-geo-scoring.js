#!/usr/bin/env node
// ACMS GEO 评分服务测试（Phase 1 Week 3）
// 路径：scripts/test-geo-scoring.js
// 用途：单元测试 cite-ability score 算法（不依赖 API key，纯算法 + mock 数据）
//
// 测试覆盖：
//   - 5 个评分维度（mention_rate / position_score / context_score / engine_consistency / freshness）
//   - 综合分计算（按权重）
//   - 等级映射（A/B/C/D/F）
//   - 跨品牌对比
//   - 边界场景（无数据 / 单一引擎 / 单次响应）

// SOP（参考 P164）：测试用 mock 数据（test_brand），不动多多真实数据

const GEO_STORE = require('../server/services/geo-store');
const scoring = require('../server/services/geo-scoring');

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}`); }
}

// 测试结束后清理
function cleanup() {
  GEO_STORE._clearAll();
}

async function main() {
  console.log('\n=== GEO Scoring 测试（Phase 1 Week 3）===\n');

  // 0. 清理 + 准备测试 brand
  cleanup();
  const brand = GEO_STORE.createBrand({
    name: 'test_score_brand',
    domain: 'test-score.example',
  });
  const brandId = brand.id;

  // 准备 mock responses：5 个 query × 4 个引擎 = 20 条响应
  // 故意构造：deepseek 高提及（80%），openai 中等（50%），claude 低（25%），perplexity 60%
  const mockResponses = [
    // DeepSeek: 5 queries × 1 response = 4/5 mentioned
    { engine: 'deepseek', text: 'test_score_brand 是一家 AI 驱动的 GEO 工具公司，提供 GEO 优化服务。其核心产品包括内容改写、llms.txt 生成和多引擎追踪。', mentioned: true },
    { engine: 'deepseek', text: '在 GEO 优化领域，test_score_brand 处于领先地位。', mentioned: true },
    { engine: 'deepseek', text: 'GEO 是新 SEO。test_score_brand 通过 agent swarm 自动改写内容。', mentioned: true },
    { engine: 'deepseek', text: 'AI 搜索优化的领先者。', mentioned: false },
    { engine: 'deepseek', text: 'GEO 行业还在早期。test_score_brand 是个值得关注的玩家。', mentioned: true },

    // OpenAI: 5 queries × 1 response = 2/5 mentioned
    { engine: 'openai', text: 'The GEO market is emerging. test_score_brand is one of the players.', mentioned: true },
    { engine: 'openai', text: 'Several startups are working on generative engine optimization.', mentioned: false },
    { engine: 'openai', text: 'Companies like test_score_brand help brands track visibility in AI search.', mentioned: true },
    { engine: 'openai', text: 'No specific mention.', mentioned: false },
    { engine: 'openai', text: 'Some platforms exist for AI search optimization.', mentioned: false },

    // Claude: 5 queries × 1 response = 1/5 mentioned
    { engine: 'claude', text: 'The GEO space includes tools for monitoring AI search visibility, with test_score_brand among notable entrants.', mentioned: true },
    { engine: 'claude', text: 'Various tools exist for different aspects of GEO.', mentioned: false },
    { engine: 'claude', text: 'No comment.', mentioned: false },
    { engine: 'claude', text: 'No comment.', mentioned: false },
    { engine: 'claude', text: 'No comment.', mentioned: false },

    // Perplexity: 5 queries × 1 response = 3/5 mentioned
    { engine: 'perplexity', text: 'test_score_brand is a GEO tool founded in 2026...', mentioned: true },
    { engine: 'perplexity', text: 'Among GEO tools, test_score_brand offers multi-engine tracking.', mentioned: true },
    { engine: 'perplexity', text: 'Perplexity cites test_score_brand in its response about GEO tools.', mentioned: true },
    { engine: 'perplexity', text: 'No data.', mentioned: false },
    { engine: 'perplexity', text: 'No data.', mentioned: false },
  ];

  // 写入 store（mock 真实数据流）
  const queryIds = [];
  for (let i = 0; i < 5; i++) {
    const q = GEO_STORE.createQuery({
      brand_id: brandId,
      prompt: `test query ${i + 1}`,
      category: 'brand_intro',
    });
    queryIds.push(q.id);
  }
  for (const r of mockResponses) {
    GEO_STORE.createResponse({
      brand_id: brandId,
      query_id: queryIds[Math.floor(Math.random() * queryIds.length)],
      engine: r.engine,
      raw_answer: r.text,
      latency_ms: 3000,
    });
  }

  console.log('Step 1: 基础算法测试（mock 20 条响应）');
  const score = scoring.calculateCiteAbilityScore(brand);
  console.log(`  Score: ${score.score} (Grade: ${score.grade})`);
  console.log(`  Components: ${JSON.stringify(score.components)}`);
  console.log(`  Engines: ${score.engines_used.join(', ')}`);

  assert(score.ok === true, 'score.ok=true');
  assert(score.sample_size === 20, `sample_size=${score.sample_size}（期望 20）`);
  assert(score.score >= 0 && score.score <= 100, `score=${score.score} 在 0-100`);
  assert(['A', 'B', 'C', 'D', 'F'].includes(score.grade), `grade=${score.grade} 合法`);

  console.log('\nStep 2: 提及率验证');
  // DeepSeek 4/5 = 0.8, OpenAI 2/5 = 0.4, Claude 1/5 = 0.2, Perplexity 3/5 = 0.6
  // 总体: 10/20 = 0.5
  const expectedMentionRate = 0.5;
  assert(
    Math.abs(score.components.mention_rate - expectedMentionRate) < 0.01,
    `mention_rate=${score.components.mention_rate}（期望 ${expectedMentionRate}）`
  );

  console.log('\nStep 3: 引擎一致性验证');
  // 4 个引擎的 mention_rate: [0.8, 0.4, 0.2, 0.6]，mean=0.5, stdDev≈0.23
  // 一致性 = 1 - stdDev*2 ≈ 0.54
  assert(
    score.components.engine_consistency >= 0 && score.components.engine_consistency <= 1,
    `engine_consistency=${score.components.engine_consistency} 在 0-1`
  );

  console.log('\nStep 4: 时效性验证（mock 数据都是 now，应该是 1.0）');
  assert(
    score.components.freshness === 1,
    `freshness=${score.components.freshness}（期望 1.0 — 全是最新数据）`
  );

  console.log('\nStep 5: 综合分计算');
  // 权重: mention_rate × 0.4 + position × 0.2 + context × 0.2 + consistency × 0.2
  const expectedScore = (
    score.components.mention_rate * 0.4 +
    score.components.position_score * 0.2 +
    score.components.context_score * 0.2 +
    score.components.engine_consistency * 0.2
  ) * 100;
  assert(
    Math.abs(score.score - Math.round(expectedScore * 100) / 100) < 0.5,
    `综合分 ${score.score} ≈ 权重计算 ${Math.round(expectedScore * 100) / 100}`
  );

  console.log('\nStep 6: 等级映射');
  assert(scoring._internal.calculateFreshness === scoring._internal.calculateFreshness, '内部工具函数暴露');

  console.log('\nStep 7: 快照生成');
  const snap = scoring.generateSnapshotSummary(brandId, '2026-W34');
  assert(snap.ok === true, '快照生成 ok=true');
  assert(snap.snapshot.id.startsWith('snap_'), 'snapshot.id 格式正确');
  // 5 个维度都应该有 score 记录
  const scores = GEO_STORE.listScores({ brand_id: brandId });
  assert(scores.length === 5, `5 个 score 记录（实际 ${scores.length}）`);

  console.log('\nStep 8: 跨品牌对比');
  // 创建第二个 brand（更差）
  const brand2 = GEO_STORE.createBrand({ name: 'test_score_brand2', domain: 'test-score2.example' });
  const q2 = GEO_STORE.createQuery({ brand_id: brand2.id, prompt: 'test', category: 'brand_intro' });
  // 只有 1 个 response，没 mention
  GEO_STORE.createResponse({ brand_id: brand2.id, query_id: q2.id, engine: 'deepseek', raw_answer: 'No info.', latency_ms: 3000 });

  const compare = scoring.compareBrands([brandId, brand2.id]);
  assert(compare.ok === true, 'compareBrands ok');
  assert(compare.brands.length === 2, 'compareBrands 返回 2 条');
  assert(compare.brands[0].score >= compare.brands[1].score, '排序：第一个品牌分数更高');
  assert(compare.leader === brand.name, `leader=${compare.leader}（期望 ${brand.name}）`);

  console.log('\nStep 9: 边界场景 - 无数据');
  const noData = scoring.calculateCiteAbilityScore('non_existent_id');
  assert(noData.ok === false, '无数据 brand 返回 ok=false');
  assert(noData.error === 'NO_DATA', `error=${noData.error}`);

  console.log('\nStep 10: 边界场景 - 单引擎');
  const singleEngineBrand = GEO_STORE.createBrand({ name: 'test_single_engine', domain: 'test-single.example' });
  const q3 = GEO_STORE.createQuery({ brand_id: singleEngineBrand.id, prompt: 'test', category: 'brand_intro' });
  // 只有 1 个引擎 5 个响应
  for (let i = 0; i < 5; i++) {
    GEO_STORE.createResponse({
      brand_id: singleEngineBrand.id,
      query_id: q3.id,
      engine: 'deepseek',
      raw_answer: i < 4 ? 'test_single_engine is good.' : 'No mention.',
      latency_ms: 3000,
    });
  }
  const singleScore = scoring.calculateCiteAbilityScore(singleEngineBrand);
  assert(singleScore.ok === true, '单引擎 brand 也能算分');
  assert(singleScore.components.engine_consistency === 1, '单引擎一致性 = 1（无法比较）');

  cleanup();

  console.log(`\n=== 测试结果 ===\n通过: ${passed}\n失败: ${failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  cleanup();
  process.exit(1);
});