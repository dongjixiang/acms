// ACMS GEO v0.36 描述准确率判定单测
// 测纯函数 + mock LLM 调用 + GEO_STORE

const test = require('node:test');
const assert = require('node:assert/strict');

// Mock 关键依赖
const Module = require('node:module');
const origRequire = Module.prototype.require;

// mock GEO_STORE
const mockStore = {
  getBrand: (id) => mockStore._brand,
  listResponses: () => mockStore._responses,
  listQueries: () => mockStore._queries,
  listScores: () => mockStore._scores,
  createScore: (s) => { mockStore._scores.push({ ...s, id: 'scr_' + Math.random(), computed_at: new Date().toISOString() }); return s.s; },
  _brand: null,
  _responses: [],
  _queries: [],
  _scores: [],
};

// mock callLLM
let mockCallLLM = async () => ({ content: '{"verdict":"correct","issue":null}' });

// mock modelStore
const mockModelStore = {
  list: () => [{ id: 'model_test', name: 'Test', status: 'active', capabilities: ['text', 'json-mode'] }],
  getById: (id) => mockModelStore.list()[0],
};

Module.prototype.require = function (id) {
  if (id === './geo-store') return mockStore;
  if (id === './llm-adapter') return { callLLM: (...args) => mockCallLLM(...args) };
  if (id === '../stores/model-store') return mockModelStore;
  return origRequire.call(this, id);
};

const judge = require('../geo-accuracy-judge');

const TEST_BRAND = {
  id: 'brand_test', name: '中展集团', domain: 'zhanwei-expo.com',
  industry: 'exhibition', aliases: ['中展', 'zhanwei'],
};

// === Reset mock state before each test ===
test.beforeEach(() => {
  mockStore._brand = { ...TEST_BRAND };
  mockStore._responses = [];
  mockStore._queries = [];
  mockStore._scores = [];
  mockCallLLM = async () => ({ content: '{"verdict":"correct","issue":null}' });
});

// === 纯函数测试 ===

test('buildJudgeUserPrompt: 截断超长文本', () => {
  const longText = 'x'.repeat(5000);
  const prompt = judge._internal.buildJudgeUserPrompt(TEST_BRAND, longText);
  const obj = JSON.parse(prompt);
  assert.ok(obj.ai_response.length <= 1500);
  assert.equal(obj.brand.name, '中展集团');
});

test('buildJudgeUserPrompt: 包含 brand.aliases', () => {
  const prompt = judge._internal.buildJudgeUserPrompt(TEST_BRAND, 'short text');
  const obj = JSON.parse(prompt);
  assert.deepEqual(obj.brand.aliases, ['中展', 'zhanwei']);
  assert.equal(obj.brand.industry, 'exhibition');
});

test('getCommercialQueryIds: 关键词命中', () => {
  const queries = [
    { id: 'q1', prompt: '上海展览公司推荐' },     // 商业意图
    { id: 'q2', prompt: '展览设计的流程是什么' }, // 非商业
    { id: 'q3', prompt: 'best exhibition company' }, // 商业 (英文)
    { id: 'q4', prompt: '哪家好' },                  // 商业
    { id: 'q5', prompt: '对比灵通和华毅' },         // 商业
    { id: 'q6', prompt: '中展怎么样' },             // 含品牌名但是个问法；关键词没命中 → 非商业
  ];
  const ids = judge._internal.getCommercialQueryIds(queries);
  assert.ok(ids.has('q1'));
  assert.ok(!ids.has('q2'));
  assert.ok(ids.has('q3'));
  assert.ok(ids.has('q4'));
  assert.ok(ids.has('q5'));
  // q6 不含商业意图关键词（"怎么样"不在表里），应被排除
  assert.ok(!ids.has('q6'));
});

test('getCommercialQueryIds: 复用 v0.31 intent:comparative tag', () => {
  const queries = [
    { id: 'q1', prompt: '随便什么问题', systemTags: ['intent:comparative'] },
    { id: 'q2', prompt: '另一个', tags: ['intent:comparative'] },
  ];
  const ids = judge._internal.getCommercialQueryIds(queries);
  assert.ok(ids.has('q1'));
  assert.ok(ids.has('q2'));
});

test('pickSamples: 商业意图 ≥ limit 时只用商业样本', () => {
  const responses = Array.from({ length: 25 }, (_, i) => ({
    id: 'r' + i, query_id: 'qc' + i, text: 'ok', ts: i,
  }));
  const ids = judge._internal.getCommercialQueryIds([
    ...Array.from({ length: 25 }, (_, i) => ({ id: 'qc' + i, prompt: '推荐 ' + i })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: 'qn' + i, prompt: '流程问题' })),
  ]);
  const picked = judge._internal.pickSamples(responses, ids, 20);
  assert.equal(picked.length, 20);
  assert.ok(picked.every(r => r.query_id.startsWith('qc')));
});

test('pickSamples: 商业意图不足时补充自然样本', () => {
  const responses = [
    { id: 'r1', query_id: 'qc1', text: 'ok' },
    { id: 'r2', query_id: 'qc2', text: 'ok' },
    { id: 'r3', query_id: 'qn1', text: 'ok' },
    { id: 'r4', query_id: 'qn2', text: 'ok' },
    { id: 'r5', query_id: 'qn3', text: 'ok' },
  ];
  const ids = judge._internal.getCommercialQueryIds([
    { id: 'qc1', prompt: '哪家好' },
    { id: 'qc2', prompt: '推荐' },
    { id: 'qn1', prompt: '流程' },
    { id: 'qn2', prompt: '原理' },
    { id: 'qn3', prompt: '介绍' },
  ]);
  const picked = judge._internal.pickSamples(responses, ids, 5);
  assert.equal(picked.length, 5);
  // 应包含 2 商业 + 3 自然
  assert.equal(picked.filter(r => r.query_id.startsWith('qc')).length, 2);
});

test('findChatModel: 优先选支持 text 的', () => {
  const m = judge._internal.findChatModel();
  assert.equal(m.id, 'model_test');
});

test('judgeOne: 解析正确 JSON', async () => {
  const r = await judge._internal.judgeOne(TEST_BRAND, 'text', 'model_test');
  assert.equal(r.verdict, 'correct');
  assert.equal(r.issue, null);
});

test('judgeOne: LLM 返回非法 JSON → unknown', async () => {
  mockCallLLM = async () => ({ content: 'not json at all' });
  const r = await judge._internal.judgeOne(TEST_BRAND, 'text', 'model_test');
  assert.equal(r.verdict, 'unknown');
  assert.equal(r.issue, 'PARSE_FAILED');
});

test('judgeOne: LLM 返回带 JSON 块的文本 → 提取', async () => {
  mockCallLLM = async () => ({ content: '我判定：{"verdict":"misleading","issue":"成立年份错误"}' });
  const r = await judge._internal.judgeOne(TEST_BRAND, 'text', 'model_test');
  assert.equal(r.verdict, 'misleading');
  assert.equal(r.issue, '成立年份错误');
});

test('judgeOne: verdict 不在白名单 → unknown', async () => {
  mockCallLLM = async () => ({ content: '{"verdict":"maybe","issue":null}' });
  const r = await judge._internal.judgeOne(TEST_BRAND, 'text', 'model_test');
  assert.equal(r.verdict, 'unknown');
});

test('judgeOne: LLM 抛错 → unknown + 错误信息', async () => {
  mockCallLLM = async () => { throw new Error('API timeout'); };
  const r = await judge._internal.judgeOne(TEST_BRAND, 'text', 'model_test');
  assert.equal(r.verdict, 'unknown');
  assert.ok(r.issue.includes('API timeout'));
});

// === 主入口测试 ===

test('judgeResponsesAccuracy: 无 responses → NO_DATA', async () => {
  const r = await judge.judgeResponsesAccuracy(TEST_BRAND.id);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'NO_DATA');
});

test('judgeResponsesAccuracy: 全部正确 → 100%', async () => {
  mockStore._queries = [{ id: 'q1', prompt: '推荐' }, { id: 'q2', prompt: '哪家' }];
  mockStore._responses = [
    { id: 'r1', query_id: 'q1', text: '中展集团是专业展览设计公司...', ts: 1 },
    { id: 'r2', query_id: 'q2', text: '推荐中展，他们...', ts: 2 },
  ];
  mockCallLLM = async () => ({ content: '{"verdict":"correct","issue":null}' });
  const r = await judge.judgeResponsesAccuracy(TEST_BRAND.id);
  assert.equal(r.ok, true);
  assert.equal(r.correct, 2);
  assert.equal(r.misleading, 0);
  assert.equal(r.accuracy_rate, 1.0);
  // 缓存写入
  assert.equal(mockStore._scores.length, 1);
  assert.equal(mockStore._scores[0].dimension, 'accuracy_rate');
});

test('judgeResponsesAccuracy: 部分错误 → 真实比例', async () => {
  mockStore._queries = Array.from({ length: 5 }, (_, i) => ({ id: 'q' + i, prompt: '推荐 ' + i }));
  mockStore._responses = Array.from({ length: 5 }, (_, i) => ({
    id: 'r' + i, query_id: 'q' + i, text: 'reply' + i, ts: i,
  }));
  let count = 0;
  mockCallLLM = async () => {
    count++;
    // 前 3 次 correct，后 2 次 misleading
    return { content: count <= 3 ? '{"verdict":"correct","issue":null}' : '{"verdict":"misleading","issue":"错误' + count + '"}' };
  };
  const r = await judge.judgeResponsesAccuracy(TEST_BRAND.id);
  assert.equal(r.correct, 3);
  assert.equal(r.misleading, 2);
  assert.equal(r.accuracy_rate, 0.6);  // 3 / (3+2)
  assert.equal(r.issues.length, 2);
  assert.ok(r.issues[0].issue.includes('错误4'));
});

test('judgeResponsesAccuracy: unknown 排除在分母外', async () => {
  mockStore._queries = [{ id: 'q1', prompt: '推荐' }];
  mockStore._responses = [
    { id: 'r1', query_id: 'q1', text: 'reply', ts: 1 },
    { id: 'r2', query_id: 'q1', text: 'reply', ts: 2 },
    { id: 'r3', query_id: 'q1', text: '', ts: 3 },  // 空文本 → unknown
  ];
  // r1 correct, r2 unknown (LLM 输出不在白名单), r3 empty → unknown
  let count = 0;
  mockCallLLM = async () => {
    count++;
    return { content: count === 1 ? '{"verdict":"correct","issue":null}' : '{"verdict":"haha","issue":null}' };
  };
  const r = await judge.judgeResponsesAccuracy(TEST_BRAND.id);
  assert.equal(r.correct, 1);
  assert.equal(r.misleading, 0);
  assert.equal(r.unknown, 2);  // 1 LLM 错误 + 1 空文本
  assert.equal(r.accuracy_rate, 1.0);  // 分母只有 correct 1 + misleading 0
});

test('getCachedAccuracy: 7 天内返回缓存', () => {
  // 模拟一条刚写入的缓存
  GEO_STORE_DUMMY_FOR_TEST()._scores.push({
    brand_id: TEST_BRAND.id,
    dimension: 'accuracy_rate',
    score: 0.8,
    details: { correct: 16, misleading: 4, unknown: 0, sample_size: 20, issues: [] },
    computed_at: new Date().toISOString(),
  });
  // 由于 mockStore 是 module-level 共享，前面测试的 _scores 已经被推入；读最新一条
  const r = judge.getCachedAccuracy(TEST_BRAND.id);
  assert.equal(r.cached, true);
  // accuracy_rate 来自最近一条（顺序由 listScores 控制，我们 mock 直接返回 _scores）
  // 注意：listScores 在 geo-store 里按 computed_at desc 排序；mock 没排序所以取数组第一项
  assert.ok(r.accuracy_rate != null);
});

test('getCachedAccuracy: 超过 7 天返回 null', () => {
  mockStore._scores = [{
    brand_id: TEST_BRAND.id,
    dimension: 'accuracy_rate',
    score: 0.5,
    details: { correct: 10, misleading: 10, unknown: 0, sample_size: 20, issues: [] },
    computed_at: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString(),
  }];
  const r = judge.getCachedAccuracy(TEST_BRAND.id);
  assert.equal(r, null);
});

test('judgeResponsesAccuracy: 缓存命中不重复调用 LLM', async () => {
  mockStore._queries = [{ id: 'q1', prompt: '推荐' }];
  mockStore._responses = [{ id: 'r1', query_id: 'q1', text: 'reply', ts: 1 }];
  // 先跑一次写入缓存
  mockCallLLM = async () => ({ content: '{"verdict":"correct","issue":null}' });
  const r1 = await judge.judgeResponsesAccuracy(TEST_BRAND.id);
  assert.equal(r1.correct, 1);
  // 第二次应直接读缓存，LLM 不再被调用
  let llmCalled = false;
  mockCallLLM = async () => { llmCalled = true; return { content: '{"verdict":"misleading","issue":"x"}' }; };
  const r2 = await judge.judgeResponsesAccuracy(TEST_BRAND.id);
  assert.equal(llmCalled, false, 'LLM 不应被调用（缓存命中）');
  assert.equal(r2.cached, true);
  assert.equal(r2.correct, 1);  // 仍是上次结果
});

test('judgeResponsesAccuracy: force=true 强制重跑', async () => {
  mockStore._queries = [{ id: 'q1', prompt: '推荐' }];
  mockStore._responses = [{ id: 'r1', query_id: 'q1', text: 'reply', ts: 1 }];
  mockCallLLM = async () => ({ content: '{"verdict":"correct","issue":null}' });
  await judge.judgeResponsesAccuracy(TEST_BRAND.id);  // 第一次写入缓存
  // 强制重跑 + mock 不同输出
  mockCallLLM = async () => ({ content: '{"verdict":"misleading","issue":"测试"}' });
  const r = await judge.judgeResponsesAccuracy(TEST_BRAND.id, { force: true });
  assert.equal(r.misleading, 1);
  assert.equal(r.correct, 0);
});

// === 辅助 ===
function GEO_STORE_DUMMY_FOR_TEST() { return mockStore; }