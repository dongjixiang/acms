// 回归测试：实时网络调研可靠性（v0.52）
// 运行：node scripts/test-web-research-reliability.js
const assert = require('assert');

function testRegisteredToolSchemaAdvertisesExpandedLimits() {
  require('../server/tools/web');
  const { getTool } = require('../server/services/tool-registry');
  const tool = getTool('web_research');
  assert.ok(tool, 'web_research 应已注册');
  const props = tool.parameters.properties;
  assert.strictEqual(props.max_results.default, 20);
  assert.strictEqual(props.max_results.maximum, 20);
  assert.strictEqual(props.deep_fetch.default, 10);
  assert.strictEqual(props.deep_fetch.maximum, 10);

  const searchTool = getTool('web_search');
  assert.ok(searchTool, 'web_search 应已注册');
  assert.strictEqual(searchTool.parameters.properties.max_results.default, 20);
  assert.strictEqual(searchTool.parameters.properties.max_results.maximum, 20);
}

function testWebSearchExecutionAllowsTwentyResults() {
  const { normalizeSearchArgs } = require('../server/tools/web-search');
  const { filterByRelevance } = require('../server/services/web-search');
  assert.strictEqual(normalizeSearchArgs({ max_results: 20 }), 20, 'web_search 应识别 snake_case max_results');
  assert.strictEqual(normalizeSearchArgs({ max_results: 99 }), 20, 'web_search max_results 应封顶 20');

  const results = Array.from({ length: 20 }, (_, i) => ({
    title: `2026 World Cup result ${i + 1}`,
    url: `https://example.com/world-cup-${i + 1}`,
    snippet: '2026 World Cup latest result',
  }));
  assert.strictEqual(filterByRelevance(results, '2026 World Cup results').length, 20, '相关性过滤不得再截成 6 条');
}

function testResearchArgsUseSnakeCaseAndExpandedLimits() {
  const { normalizeResearchArgs } = require('../server/tools/web-research');
  assert.strictEqual(typeof normalizeResearchArgs, 'function', 'web-research 应导出参数归一化函数');

  const requested = normalizeResearchArgs({
    max_results: 20,
    deep_fetch: 10,
    model_id: 'model-test',
  });
  assert.deepStrictEqual(requested, {
    maxResults: 20,
    deepFetch: 10,
    modelId: 'model-test',
  });

  const clamped = normalizeResearchArgs({ max_results: 99, deep_fetch: 99 });
  assert.strictEqual(clamped.maxResults, 20, 'max_results 上限应为 20');
  assert.strictEqual(clamped.deepFetch, 10, 'deep_fetch 上限应为 10');

  const defaults = normalizeResearchArgs({});
  assert.strictEqual(defaults.maxResults, 20, 'max_results 默认值应为 20');
  assert.strictEqual(defaults.deepFetch, 10, 'deep_fetch 默认值应为 10');
}

function testRealtimeEvidencePagesRankAheadOfGenericPages() {
  const { rankResultsForResearch } = require('../server/tools/web-research');
  const ranked = rankResultsForResearch([
    {
      title: 'FIFA World Cup 2026 hosts, cities and dates',
      url: 'https://www.fifa.com/articles/fifa-world-cup-2026-hosts-cities-dates',
      snippet: 'Hosts and cities',
    },
    {
      title: 'FIFA World Cup 2026',
      url: 'https://www.fifa.com/articles/match-schedule-fixtures-results-teams-stadiums',
      snippet: 'Full fixtures and results from every match',
    },
    {
      title: '2026 calendar',
      url: 'https://example.com/2026-calendar',
      snippet: 'Calendar and holidays',
    },
  ], true);
  assert.match(ranked[0].url, /match-schedule-fixtures-results/, '实时赛果页必须排在介绍页和年历前');
}

function testKeywordExtractionAcceptsFencedJson() {
  const { parseKeywordExtractionContent } = require('../server/tools/web-research');
  const parsed = parseKeywordExtractionContent('```json\n{"query":"2026世界杯 比分","key_entities":["2026世界杯"],"time_constraint":"最新","intent":"factual"}\n```');
  assert.strictEqual(parsed.query, '2026世界杯 比分');
  assert.deepStrictEqual(parsed.key_entities, ['2026世界杯']);
  assert.strictEqual(parsed.time_constraint, '最新');
}

function testFreshnessQueryAndPromptContainCurrentDate() {
  const {
    buildCurrentTimeContext,
    augmentFreshnessQuery,
    buildFreshnessSearchQueries,
    buildSynthesisPrompt,
  } = require('../server/tools/web-research');
  const now = new Date('2026-07-18T00:19:27.000Z');
  const current = buildCurrentTimeContext(now);
  const query = augmentFreshnessQuery(
    '2026世界杯 赛况 比分 晋级',
    '你帮我查一下2026世界杯最新的赛况',
    { time_constraint: '最新' },
    current,
  );
  const prompt = buildSynthesisPrompt(current);
  const searchQueries = buildFreshnessSearchQueries(
    '2026世界杯 最新赛况',
    '你帮我查一下2026世界杯最新的赛况',
    {
      key_entities: ['2026世界杯'],
      official_query: '2026 FIFA World Cup',
      time_constraint: '最新',
    },
    current,
  );

  assert.match(current.shanghaiDate, /2026-07-18/);
  assert.match(query, /2026年7月18日/, '最新查询必须带具体北京时间日期');
  assert.match(searchQueries[1], /2026 FIFA World Cup.*results.*July 18, 2026/i, '备用查询必须使用官方英文实体和日期');
  assert.match(prompt, /2026-07-18/, '综合 prompt 必须包含当前日期');
  assert.match(prompt, /时区.*换算|换算.*时区/s, '综合 prompt 必须约束跨时区换算');
  assert.match(prompt, /资料不足.*尚未发生|尚未发生.*资料不足/s, '综合 prompt 必须禁止把资料不足推导为事件尚未发生');
}

async function testDynamicOfficialPageFallsBackToBrowser() {
  const { fetchUrlCore, clearCache } = require('../server/tools/url-fetch');
  clearCache();

  const url = 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/match-schedule-fixtures-results-teams-stadiums';
  const result = await fetchUrlCore({ url, max_length: 12000 });
  const content = result.content || result.text || '';
  const { excerptForSynthesis } = require('../server/tools/web-research');
  const excerpt = excerptForSynthesis(content, true);

  assert.ok(!result.error, `动态官网不应返回抓取错误，实际：${result.error}`);
  assert.ok(content.length > 1000, `动态官网正文应由浏览器兜底提取，实际仅 ${content.length} 字`);
  assert.match(content, /France 0-2 Spain/i, 'FIFA 赛果正文应保留法国 0-2 西班牙半决赛比分');
  assert.match(content, /England 1-2 Argentina/i, 'FIFA 赛果正文应保留英格兰 1-2 阿根廷半决赛比分');
  assert.match(content, /All kick-offs listed in Eastern Time/i, 'FIFA 赛果正文应保留原始 ET 时区说明');
  assert.match(excerpt, /France 0-2 Spain/i, '送给综合模型的实时摘录也必须包含法国 0-2 西班牙');
  assert.match(excerpt, /All kick-offs listed in Eastern Time/i, '送给综合模型的实时摘录必须包含 ET 时区说明');
}

async function main() {
  testRegisteredToolSchemaAdvertisesExpandedLimits();
  console.log('PASS registered web_research schema 20/10');
  testWebSearchExecutionAllowsTwentyResults();
  console.log('PASS web_search snake_case + 20-result execution');
  testResearchArgsUseSnakeCaseAndExpandedLimits();
  console.log('PASS research args snake_case + 20/10 limits');
  testRealtimeEvidencePagesRankAheadOfGenericPages();
  console.log('PASS realtime evidence ranking');
  testKeywordExtractionAcceptsFencedJson();
  console.log('PASS keyword extraction fenced JSON');
  testFreshnessQueryAndPromptContainCurrentDate();
  console.log('PASS freshness query + current-date synthesis guard');
  await testDynamicOfficialPageFallsBackToBrowser();
  console.log('PASS dynamic official page browser fallback');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FAIL', err.stack || err.message);
    process.exit(1);
  });
