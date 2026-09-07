// ACMS GEO v0.34 新指标单测
// 用 node 内置 test runner（node >= 18）：node --test server/services/__tests__/v034-indicators.test.js
// 测纯函数部分（不依赖 db）；集成测试放到 v0.34 联调阶段

const test = require('node:test');
const assert = require('node:assert/strict');

// 跳过 GEO_STORE 加载（mock）
const Module = require('node:module');
const origResolve = Module._resolve_filename;
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === './geo-store' || id === '../db/connection') {
    return new Proxy({}, { get: () => () => ({}) });
  }
  return origRequire.call(this, id);
};

const { _internal } = require('../geo-scoring');
const { isCommercialIntent, judgeTop1, calculateTop1Rate, calculateCitationShare } = _internal;

const TEST_BRAND = {
  id: 'brand_test',
  name: '中展集团',
  domain: 'zhanwei-expo.com',
  industry: 'exhibition',
  aliases: ['中展', 'zhanwei'],
};

test('isCommercialIntent: 关键词命中"推荐"', () => {
  const q = { prompt: '上海展览设计公司推荐' };
  assert.equal(isCommercialIntent(TEST_BRAND, q), true);
});

test('isCommercialIntent: 关键词命中"哪家"', () => {
  const q = { prompt: '展览搭建哪家好' };
  assert.equal(isCommercialIntent(TEST_BRAND, q), true);
});

test('isCommercialIntent: 英文 best 命中', () => {
  const q = { prompt: 'best exhibition design company' };
  assert.equal(isCommercialIntent(TEST_BRAND, q), true);
});

test('isCommercialIntent: 纯信息问句不命中', () => {
  const q = { prompt: '展览设计的流程是什么' };
  assert.equal(isCommercialIntent(TEST_BRAND, q), false);
});

test('isCommercialIntent: 双轨——已标 intent:comparative 即便关键词不命中也算', () => {
  const q = { prompt: '某某问题', systemTags: ['intent:comparative'] };
  assert.equal(isCommercialIntent(TEST_BRAND, q), true);
});

test('isCommercialIntent: branded query 不含商业意图词 → false（注意：商业意图与 branded 独立判定）', () => {
  const q = { prompt: '中展怎么样' };
  assert.equal(isCommercialIntent(TEST_BRAND, q), false);
});

test('judgeTop1: 列表结构 + 品牌在前 100 字符 → true', () => {
  const text = '第一名 中展集团；第二名 灵通；第三名 华毅。详情如下...';
  assert.equal(judgeTop1(TEST_BRAND, text), true);
});

test('judgeTop1: 列表结构 + 品牌在 100 字符之后 → false', () => {
  // 填充前缀确保 "中展集团" 出现在 ≥100 字符位置（列表结构阈值）
  const padded = '第一名 灵通展览；第二名 华毅展览集团；第三名 点意展览服务公司；第四名 司马展览制作工厂；第五名 笔克展览；第六名 励展展览；第七名 华毅展览服务集团；第八名 灵通展览股份；这里填充额外的内容以保证中展集团确实出现在一百个字符之后。中展集团';
  assert.ok(padded.indexOf('中展集团') >= 100, '前置：品牌应在 ≥100 字符位置');
  assert.equal(judgeTop1(TEST_BRAND, padded), false);
});

test('judgeTop1: 兜底路径——回答前半段出现品牌 → true', () => {
  const text = '中展集团是一家专业做展览设计的公司，服务客户 500+，覆盖上海北京深圳...（大量介绍）';
  assert.equal(judgeTop1(TEST_BRAND, text), true);
});

test('judgeTop1: 兜底路径——品牌仅出现在后半段 → false', () => {
  const text = '前言：展览设计行业有诸多选择，包括灵通、华毅、笔克等知名企业...（中段很长）...也有中展集团参与。';
  // 品牌在中后段；兜底阈值 < 50% 字符
  assert.equal(judgeTop1(TEST_BRAND, text), false);
});

test('judgeTop1: aliases 命中（中展）也算', () => {
  const text = '第一名 中展做的展览非常专业；其他三家是灵通、华毅、笔克。';
  assert.equal(judgeTop1(TEST_BRAND, text), true);
});

test('judgeTop1: 品牌完全未提 → false', () => {
  const text = '上海比较好的展览设计公司有灵通、华毅、点意、笔克、司马。';
  assert.equal(judgeTop1(TEST_BRAND, text), false);
});

test('judgeTop1: 传 brandName 字符串 → aliases 失效，全 false（防退化回归）', () => {
  const text = '第一名 中展做的展览；其他三家...';
  // 字符串退化只会匹配 [name]，而 text 中没有完整 "中展集团" 但有 "中展"
  // 因此应判 false（无别名命中）
  assert.equal(judgeTop1('中展集团', text), false);
});

test('calculateTop1Rate: 商业意图样本 < 20 → INSUFFICIENT_SAMPLES', () => {
  const queries = [
    { id: 'q1', prompt: '展览公司推荐' },
    { id: 'q2', prompt: '哪家好' },
    { id: 'q3', prompt: 'best exhibition' },
  ];
  const responses = [{ query_id: 'q1' }, { query_id: 'q2' }, { query_id: 'q3' }];
  const result = calculateTop1Rate(TEST_BRAND, responses, queries);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'INSUFFICIENT_SAMPLES');
  assert.equal(result.sampleSize, 3);
});

test('calculateTop1Rate: 商业意图样本 ≥ 20 + 偶数下标首位 → rate=0.52（13/25）', () => {
  const queries = [];
  const responses = [];
  for (let i = 0; i < 25; i++) {
    const qid = 'q' + i;
    queries.push({ id: qid, prompt: `推荐问题 ${i}` });
    // 偶数下标首位（13 个），奇数不首位（12 个）
    const text = i % 2 === 0
      ? `第一名 中展集团；第二名 灵通；第三名 华毅。后续详情 ${i}。`
      : `第一名 灵通；第二名 华毅；第三名 笔克。后续说明 ${i}。`;
    responses.push({ query_id: qid, engine: i % 2 === 0 ? 'deepseek' : 'kimi', text, raw_answer: text });
  }
  const result = calculateTop1Rate(TEST_BRAND, responses, queries);
  assert.equal(result.ok, true);
  assert.equal(result.commercialQueryCount, 25);
  assert.equal(result.sampleSize, 25);
  assert.equal(result.rate, 0.52);
  // byEngine 拆解：deepseek 全首位 (13 个)，kimi 全不首位 (12 个)
  assert.ok(result.byEngine.deepseek > 0);
  assert.equal(result.byEngine.kimi, 0);
});

test('calculateTop1Rate: error response 排除', () => {
  const queries = [];
  const responses = [];
  for (let i = 0; i < 22; i++) {
    const qid = 'q' + i;
    queries.push({ id: qid, prompt: `推荐 ${i}` });
    const text = `第一名 中展集团；第二名 灵通。详情 ${i}。`;
    responses.push({
      query_id: qid,
      engine: 'deepseek',
      text, raw_answer: text,
      error: i < 3 ? 'TIMEOUT' : null,  // 前 3 个报错
    });
  }
  const result = calculateTop1Rate(TEST_BRAND, responses, queries);
  assert.equal(result.sampleSize, 19);  // 25-3
  assert.equal(result.rate, 1.0);  // 剩下的全首位
});

test('calculateCitationShare: brand-site 类型直接算', () => {
  const responses = [
    { citations: [
      { type: 'brand-site', domain: 'zhanwei-expo.com', url: 'https://zhanwei-expo.com/a' },
      { type: 'earned-media', domain: 'zhihu.com', url: 'https://zhihu.com/q' },
      { type: 'earned-media', domain: 'thepaper.cn', url: 'https://thepaper.cn/n' },
    ]},
  ];
  const result = calculateCitationShare(TEST_BRAND, responses);
  assert.equal(result.ok, true);
  assert.equal(result.totalCitations, 3);
  assert.equal(result.brandCitations, 1);
  assert.equal(result.share, 0.333);
  assert.equal(result.brandDomainCount, 1);
});

test('calculateCitationShare: domain 匹配 + aliases 匹配都算', () => {
  const responses = [
    { citations: [
      { type: 'earned-media', domain: 'zhanwei-expo.com', url: 'https://zhanwei-expo.com/b' },  // domain 匹配
      { type: 'earned-media', domain: 'sohu.com', url: 'https://sohu.com/中展集团报道', title: '中展集团活动' },  // alias 命中
      { type: 'earned-media', domain: 'other.com', url: 'https://other.com/a' },
      { type: 'earned-media', domain: 'other2.com', url: 'https://other2.com/b' },
    ]},
  ];
  const result = calculateCitationShare(TEST_BRAND, responses);
  assert.equal(result.totalCitations, 4);
  assert.equal(result.brandCitations, 2);
  assert.equal(result.share, 0.5);
  assert.equal(result.brandDomainCount, 2);
});

test('calculateCitationShare: 全部无引用 → NO_CITATIONS', () => {
  const responses = [
    { citations: [] },
    { citations: null },
  ];
  const result = calculateCitationShare(TEST_BRAND, responses);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'NO_CITATIONS');
});

test('calculateCitationShare: error response 跳过 + coverage 分母=有效 response', () => {
  const responses = [
    { error: 'TIMEOUT', citations: [{ type: 'brand-site' }] },  // error 不计入
    { citations: [{ type: 'brand-site' }] },
    { citations: [] },  // 无引用但有效
  ];
  const result = calculateCitationShare(TEST_BRAND, responses);
  assert.equal(result.totalCitations, 1);
  assert.equal(result.brandCitations, 1);
  // coverage = 含引用的有效 response 数 / 有效 response 总数 = 1/2 = 0.5
  assert.equal(result.coverage, 0.5);
});

test('isCommercialIntent: branded query 也算（注意：商业意图判定与 branded 独立）', () => {
  // 商业意图是 prompt 形态判定；branded 由 isBrandedPrompt 单独判定
  const q = { prompt: '中展怎么样' };  // 含品牌词但不是商业意图词
  assert.equal(isCommercialIntent(TEST_BRAND, q), false);
});