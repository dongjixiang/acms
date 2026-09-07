// ACMS GEO v0.41 P1 答案空间分析 — 单测
// 用 node 内置 test runner：node --test server/services/__tests__/v041-answer-space.test.js
// 测纯函数（不依赖 db / LLM 实时调用）

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// ---- Mock geo-store / agent-runtime 避免数据库与 LLM 连接 ----
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
  analyzeAnswerSpace,
  parseAnswerSpaceOutput,
  FALLBACK_ANSWER_SPACES,
  buildLlmPrompt,
  generateAndPersistPrompts,
} = require('../geo-prompt-llm');

// ===== FALLBACK_ANSWER_SPACES 数据结构 =====

test('v0.41 P1 FALLBACK_ANSWER_SPACES: 7 个行业 + default', () => {
  const keys = Object.keys(FALLBACK_ANSWER_SPACES);
  assert.deepEqual(
    keys.sort(),
    ['banking', 'default', 'ecommerce', 'exhibition', 'marketing', 'pharma', 'saas'].sort(),
    `行业类目必须包含 7 个 + default，实际: ${keys.join(',')}`
  );
});

test('v0.41 P1 每个 fallback 答案空间结构完整', () => {
  for (const [key, spaces] of Object.entries(FALLBACK_ANSWER_SPACES)) {
    assert.ok(Array.isArray(spaces) && spaces.length > 0, `[${key}] 必须是非空数组`);
    for (const sp of spaces) {
      assert.ok(typeof sp.name === 'string' && sp.name.length > 0, `[${key}] 某空间 name 缺失`);
      assert.ok(['decision', 'discovery', 'comparison', 'implementation', 'troubleshooting'].includes(sp.type),
        `[${key}] ${sp.name} type 必须是 5 类之一，实际: ${sp.type}`);
      assert.ok(Array.isArray(sp.concept_roots) && sp.concept_roots.length > 0, `[${key}] ${sp.name} concept_roots 缺失`);
      assert.ok(sp.concept_roots.length <= 4, `[${key}] ${sp.name} concept_roots 数量超 4`);
      assert.ok(typeof sp.rationale === 'string', `[${key}] ${sp.name} rationale 缺失`);
    }
  }
});

// ===== analyzeAnswerSpace: skipLlm=true 路径（兜底）=====

test('v0.41 P1 analyzeAnswerSpace skipLlm=true exhibition → 返回 exhibition 兜底', async () => {
  const r = await analyzeAnswerSpace({ name: '卡司通', industry: 'exhibition' }, { skipLlm: true });
  assert.equal(r.ok, true);
  assert.equal(r.source, 'fallback');
  assert.equal(r.answer_spaces.length, FALLBACK_ANSWER_SPACES.exhibition.length);
  // exhibition 兜底第一个应该是「展台搭建公司选择」
  assert.equal(r.answer_spaces[0].name, '展台搭建公司选择');
  assert.equal(r.answer_spaces[0].type, 'decision');
});

test('v0.41 P1 analyzeAnswerSpace skipLlm=true 各行业映射正确', async () => {
  const cases = [
    { industry: 'marketing', expectedName: '营销 ROI 衡量' },
    { industry: 'banking', expectedName: '银行产品对比' },
    { industry: 'pharma', expectedName: '药品临床证据' },
    { industry: 'saas', expectedName: 'SaaS 产品对比' },
    { industry: 'ecommerce', expectedName: '产品购买渠道' },
    { industry: 'exhibition', expectedName: '展台搭建公司选择' },
    { industry: 'unknown_industry', expectedName: '产品选择决策' }, // → default
    { industry: undefined, expectedName: '产品选择决策' },
    { industry: null, expectedName: '产品选择决策' },
    { industry: '', expectedName: '产品选择决策' },
  ];
  for (const c of cases) {
    const r = await analyzeAnswerSpace({ name: '某品牌', industry: c.industry }, { skipLlm: true });
    assert.equal(r.source, 'fallback', `${c.industry} 应该走 fallback`);
    assert.equal(r.answer_spaces[0].name, c.expectedName,
      `${c.industry} 应该映射到 ${c.expectedName}，实际 ${r.answer_spaces[0].name}`);
  }
});

// ===== analyzeAnswerSpace: LLM 调用成功路径 =====

test('v0.41 P1 analyzeAnswerSpace LLM 返回合法 JSON → 解析 answer_spaces', async () => {
  // 临时替换 mock 让 agent-runtime 返回合法 JSON
  const origRequire = Module.prototype.require;
  Module.prototype.require = function (id) {
    if (id === './geo-store' || id === '../db/connection') {
      return new Proxy({}, { get: () => () => ({}) });
    }
    if (id === './agent-runtime') {
      return {
        execute: async () => ({
          content: JSON.stringify({
            answer_spaces: [
              { name: '如何选 SaaS', type: 'decision', concept_roots: ['SaaS 选型', '对比'], rationale: '采购前' },
              { name: 'SaaS 集成实施', type: 'implementation', concept_roots: ['API', '集成'], rationale: '执行阶段' },
            ],
          }),
        }),
      };
    }
    return origRequire.call(this, id);
  };
  delete require.cache[require.resolve('../geo-prompt-llm')];
  try {
    const fresh = require('../geo-prompt-llm');
    const r = await fresh.analyzeAnswerSpace({ name: '某 SaaS', industry: 'saas' });
    assert.equal(r.ok, true);
    assert.equal(r.source, 'llm');
    assert.equal(r.answer_spaces.length, 2);
    assert.equal(r.answer_spaces[0].name, '如何选 SaaS');
  } finally {
    Module.prototype.require = origRequire;
    delete require.cache[require.resolve('../geo-prompt-llm')];
  }
});

// ===== analyzeAnswerSpace: LLM 失败路径（兜底 + warning）=====

test('v0.41 P1 analyzeAnswerSpace LLM 抛错 → 兜底 + warning', async () => {
  const origRequire = Module.prototype.require;
  Module.prototype.require = function (id) {
    if (id === './geo-store' || id === '../db/connection') {
      return new Proxy({}, { get: () => () => ({}) });
    }
    if (id === './agent-runtime') {
      return { execute: async () => ({ content: '', error: 'Connect Timeout', modelUsed: 'm1' }) };
    }
    return origRequire.call(this, id);
  };
  delete require.cache[require.resolve('../geo-prompt-llm')];
  try {
    const fresh = require('../geo-prompt-llm');
    const r = await fresh.analyzeAnswerSpace({ name: '某品牌', industry: 'exhibition' });
    assert.equal(r.ok, true, 'LLM 失败时 analyzeAnswerSpace 应该 ok=true（兜底）');
    assert.equal(r.source, 'fallback', '应该走 fallback');
    assert.ok(r.warning && r.warning.includes('Connect Timeout'), '应该保留 warning 字段');
    assert.equal(r.answer_spaces.length, FALLBACK_ANSWER_SPACES.exhibition.length);
  } finally {
    Module.prototype.require = origRequire;
    delete require.cache[require.resolve('../geo-prompt-llm')];
  }
});

test('v0.41 P1 analyzeAnswerSpace LLM 返回非 JSON → 兜底 + warning', async () => {
  const origRequire = Module.prototype.require;
  Module.prototype.require = function (id) {
    if (id === './geo-store' || id === '../db/connection') {
      return new Proxy({}, { get: () => () => ({}) });
    }
    if (id === './agent-runtime') {
      return { execute: async () => ({ content: '不是 JSON', modelUsed: 'm1' }) };
    }
    return origRequire.call(this, id);
  };
  delete require.cache[require.resolve('../geo-prompt-llm')];
  try {
    const fresh = require('../geo-prompt-llm');
    const r = await fresh.analyzeAnswerSpace({ name: '某品牌', industry: 'banking' });
    assert.equal(r.source, 'fallback');
    assert.equal(r.answer_spaces[0].name, '银行产品对比');
  } finally {
    Module.prototype.require = origRequire;
    delete require.cache[require.resolve('../geo-prompt-llm')];
  }
});

// ===== parseAnswerSpaceOutput 双路径 =====

test('v0.41 P1 parseAnswerSpaceOutput 严格 JSON 解析', () => {
  const r = parseAnswerSpaceOutput(JSON.stringify({
    answer_spaces: [
      { name: '空间A', type: 'decision', concept_roots: ['a', 'b'], rationale: '原因' },
    ],
  }));
  assert.equal(r.ok, true);
  assert.equal(r.answer_spaces.length, 1);
  assert.equal(r.answer_spaces[0].name, '空间A');
});

test('v0.41 P1 parseAnswerSpaceOutput 容忍 markdown 代码块包装', () => {
  const r = parseAnswerSpaceOutput('```json\n' + JSON.stringify({
    answer_spaces: [{ name: 'X', type: 'comparison', concept_roots: ['x1'], rationale: 'r' }],
  }) + '\n```');
  assert.equal(r.ok, true);
  assert.equal(r.answer_spaces[0].name, 'X');
});

test('v0.41 P1 parseAnswerSpaceOutput 非合法 type 降级为 decision', () => {
  const r = parseAnswerSpaceOutput(JSON.stringify({
    answer_spaces: [{ name: 'Y', type: 'invalid_type_xyz', concept_roots: ['a'], rationale: 'r' }],
  }));
  assert.equal(r.ok, true);
  assert.equal(r.answer_spaces[0].type, 'decision', '非法 type 应该降级为 decision');
});

test('v0.41 P1 parseAnswerSpaceOutput 缺失 concept_roots 不抛错', () => {
  const r = parseAnswerSpaceOutput(JSON.stringify({
    answer_spaces: [{ name: 'Z', type: 'discovery', rationale: 'r' }],
  }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.answer_spaces[0].concept_roots, []);
});

test('v0.41 P1 parseAnswerSpaceOutput 截断 concept_roots 到 4 个', () => {
  const r = parseAnswerSpaceOutput(JSON.stringify({
    answer_spaces: [{
      name: 'W', type: 'decision',
      concept_roots: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      rationale: 'r',
    }],
  }));
  assert.equal(r.answer_spaces[0].concept_roots.length, 4, 'concept_roots 应该被截断到 4 个');
  assert.deepEqual(r.answer_spaces[0].concept_roots, ['a', 'b', 'c', 'd']);
});

test('v0.41 P1 parseAnswerSpaceOutput 非 JSON → PARSE_FAILED', () => {
  const r = parseAnswerSpaceOutput('not json at all');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'PARSE_FAILED');
});

// ===== buildLlmPrompt 答案空间段注入 =====

test('v0.41 P1 buildLlmPrompt 传入 answerSpaces → 注入「答案空间分配」段', () => {
  const out = buildLlmPrompt({ name: '卡司通', industry: 'exhibition' }, {
    answerSpaces: [
      { name: '展台搭建公司选择', type: 'decision', concept_roots: ['展台搭建', '展陈公司'], rationale: '采购前' },
      { name: '展台设计趋势', type: 'discovery', concept_roots: ['展台设计'], rationale: '了解阶段' },
    ],
  });
  assert.ok(out.includes('v0.41 答案空间分配'), '应输出 v0.41 答案空间分配段');
  assert.ok(out.includes('2 个答案空间'), '应该显示 2 个空间');
  assert.ok(out.includes('展台搭建公司选择'), '应该列出空间名');
  assert.ok(out.includes('采购前'), 'rationale 应该出现');
  assert.ok(out.includes('概念词根'), '应该用中文"概念词根"输出（不是英文 key）');
  assert.ok(out.includes('强约束'), '应该强调 query 归属约束');
});

test('v0.41 P1 buildLlmPrompt 不传 answerSpaces → 不输出答案空间段（向后兼容）', () => {
  const out = buildLlmPrompt({ name: '某品牌', industry: 'exhibition' });
  assert.ok(!out.includes('v0.41 答案空间分配'), '不传 answerSpaces 时不应输出分配段');
});

test('v0.41 P1 buildLlmPrompt 传空数组 answerSpaces → 不输出', () => {
  const out = buildLlmPrompt({ name: '某品牌', industry: 'exhibition' }, { answerSpaces: [] });
  assert.ok(!out.includes('v0.41 答案空间分配'), '空数组时不应输出分配段');
});

test('v0.41 P1 buildLlmPrompt 答案空间每空间至少 N 个 query（perSpace 计算正确）', () => {
  // 1 个空间 → perSpace = max(3, ceil(24/1)) = 24
  const r1 = buildLlmPrompt({}, { answerSpaces: [{ name: 'A', type: 'decision', concept_roots: ['a'], rationale: 'r' }] });
  assert.ok(r1.includes('至少 24 个 query'), '1 个空间应至少 24 个 query');

  // 4 个空间 → perSpace = max(3, ceil(24/4)) = 6
  const r4 = buildLlmPrompt({}, {
    answerSpaces: [
      { name: 'A', type: 'decision', concept_roots: ['a'], rationale: 'r' },
      { name: 'B', type: 'discovery', concept_roots: ['b'], rationale: 'r' },
      { name: 'C', type: 'comparison', concept_roots: ['c'], rationale: 'r' },
      { name: 'D', type: 'implementation', concept_roots: ['d'], rationale: 'r' },
    ],
  });
  assert.ok(r4.includes('至少 6 个 query'), '4 个空间应至少 6 个 query');

  // 10 个空间 → perSpace = max(3, ceil(24/10)) = 3
  const r10 = buildLlmPrompt({}, {
    answerSpaces: Array.from({ length: 10 }, (_, i) => ({
      name: 'S' + i, type: 'decision', concept_roots: ['x'], rationale: 'r',
    })),
  });
  assert.ok(r10.includes('至少 3 个 query'), '10 个空间应至少 3 个 query（floor）');
});

test('v0.41 P1 回归: buildLlmPrompt 不传 options 仍正常工作（v0.31/v0.40 兼容）', () => {
  const out = buildLlmPrompt({ name: '某品牌', industry: 'exhibition' });
  assert.ok(out.includes('【Role — 角色】'));
  assert.ok(out.includes('【Task — 任务】'));
  assert.ok(out.includes('【Format — 输出格式】'));
});

// ===== generateAndPersistPrompts 答案空间 tag 注入 =====

test('v0.41 P1 generateAndPersistPrompts: answer-space tag 循环分配到所有 prompt', async () => {
  // mock: LLM 返回 6 个 prompt
  const validOutput = JSON.stringify({
    prompts: [
      { prompt: 'p1', intent: 'informational', tags: [] },
      { prompt: 'p2', intent: 'informational', tags: [] },
      { prompt: 'p3', intent: 'comparative', tags: [] },
      { prompt: 'p4', intent: 'implementation', tags: [] },
      { prompt: 'p5', intent: 'troubleshooting', tags: [] },
      { prompt: 'p6', intent: 'informational', tags: [] },
    ],
  });

  // mock: store.getBrand / listQueries / computeSystemTags / createQuery
  const queries = [];
  const origRequire = Module.prototype.require;
  Module.prototype.require = function (id) {
    if (id === './geo-store') {
      return {
        getBrand: (id) => ({ id, name: '某品牌', industry: 'exhibition' }),
        listQueries: () => [],
        computeSystemTags: (prompt) => prompt.includes('某品牌') ? ['branded'] : ['unbranded'],
        createQuery: (q) => {
          const created = { id: 'q_' + (queries.length + 1), ...q };
          queries.push(created);
          return created;
        },
        deleteQueries: () => 0,
      };
    }
    if (id === '../db/connection') {
      return new Proxy({}, { get: () => () => ({}) });
    }
    if (id === './agent-runtime') {
      return {
        execute: async () => ({ content: validOutput, modelUsed: 'm1' }),
      };
    }
    return origRequire.call(this, id);
  };
  delete require.cache[require.resolve('../geo-prompt-llm')];
  try {
    const fresh = require('../geo-prompt-llm');
    const r = await fresh.generateAndPersistPrompts('brand_test', { skipAnswerSpace: true });
    assert.equal(r.ok, true);
    assert.equal(r.count, 6);
    assert.equal(queries.length, 6);

    // 答案空间 tag 循环分配
    // 但因为 skipAnswerSpace=true，没调 analyzeAnswerSpace，answerSpaces 应该是空
    // 所以不应该有 answer-space: tag
    for (const q of queries) {
      assert.ok(!q.tags.some(t => t.startsWith('answer-space:')), 'skipAnswerSpace=true 时不应有 answer-space tag');
    }
  } finally {
    Module.prototype.require = origRequire;
    delete require.cache[require.resolve('../geo-prompt-llm')];
  }
});

test('v0.41 P1 generateAndPersistPrompts: 不 skipAnswerSpace 时 answer-space tag 出现（兜底路径）', async () => {
  // mock: LLM 返回 6 个 prompt + analyzeAnswerSpace 走兜底
  const validOutput = JSON.stringify({
    prompts: Array.from({ length: 6 }, (_, i) => ({
      prompt: 'p' + i, intent: 'informational', tags: [],
    })),
  });
  const queries = [];
  const origRequire = Module.prototype.require;
  Module.prototype.require = function (id) {
    if (id === './geo-store') {
      return {
        getBrand: () => ({ id: 'b1', name: '某品牌', industry: 'exhibition' }),
        listQueries: () => [],
        computeSystemTags: () => ['unbranded'],
        createQuery: (q) => {
          const created = { id: 'q_' + (queries.length + 1), ...q };
          queries.push(created);
          return created;
        },
        deleteQueries: () => 0,
      };
    }
    if (id === '../db/connection') {
      return new Proxy({}, { get: () => () => ({}) });
    }
    if (id === './agent-runtime') {
      return {
        execute: async () => ({ content: validOutput, modelUsed: 'm1' }),
      };
    }
    return origRequire.call(this, id);
  };
  delete require.cache[require.resolve('../geo-prompt-llm')];
  try {
    const fresh = require('../geo-prompt-llm');
    const r = await fresh.generateAndPersistPrompts('brand_test', { skipLlm: true });
    // skipLlm=true → analyzeAnswerSpace 走兜底（exhibition 4 个空间）
    assert.equal(r.ok, true);
    assert.equal(r.count, 6);
    assert.equal(r.answerSpaces.length, 4, 'exhibition fallback 应该有 4 个空间');
    assert.equal(r.answerSpaceSource, 'fallback');

    // 答案空间 tag 循环分配：6 个 prompt / 4 个空间 = 1.5 轮
    // 第 i 个 prompt → 第 (i mod 4) 个空间
    const expectedIdx = [0, 1, 2, 3, 0, 1]; // 6 个 prompt 对应的空间索引
    for (let i = 0; i < 6; i++) {
      const tag = queries[i].tags.find(t => t.startsWith('answer-space:'));
      assert.ok(tag, `prompt ${i} 应该有 answer-space tag`);
      const idx = expectedIdx[i] + 1;
      assert.ok(tag.startsWith(`answer-space:${idx}-`), `prompt ${i} 应该分到空间 ${idx}，实际 ${tag}`);
    }
  } finally {
    Module.prototype.require = origRequire;
    delete require.cache[require.resolve('../geo-prompt-llm')];
  }
});

test('v0.41 P1 generateAndPersistPrompts: 返回 answerSpaces + answerSpaceSource', async () => {
  const queries = [];
  const origRequire = Module.prototype.require;
  Module.prototype.require = function (id) {
    if (id === './geo-store') {
      return {
        getBrand: () => ({ id: 'b1', name: '某品牌', industry: 'banking' }),
        listQueries: () => [],
        computeSystemTags: () => ['unbranded'],
        createQuery: (q) => { const c = { id: 'q_' + (queries.length + 1), ...q }; queries.push(c); return c; },
        deleteQueries: () => 0,
      };
    }
    if (id === '../db/connection') return new Proxy({}, { get: () => () => ({}) });
    if (id === './agent-runtime') {
      return {
        execute: async () => ({ content: JSON.stringify({ prompts: [{ prompt: 'p', intent: 'informational', tags: [] }] }), modelUsed: 'm1' }),
      };
    }
    return origRequire.call(this, id);
  };
  delete require.cache[require.resolve('../geo-prompt-llm')];
  try {
    const fresh = require('../geo-prompt-llm');
    const r = await fresh.generateAndPersistPrompts('brand_test', { skipLlm: true });
    assert.equal(r.answerSpaceSource, 'fallback');
    assert.equal(r.answerSpaces.length, FALLBACK_ANSWER_SPACES.banking.length);
    assert.equal(r.answerSpaces[0].name, '银行产品对比');
  } finally {
    Module.prototype.require = origRequire;
    delete require.cache[require.resolve('../geo-prompt-llm')];
  }
});
