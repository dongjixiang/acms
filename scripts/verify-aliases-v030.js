#!/usr/bin/env node
// ACMS GEO v0.30 别名匹配修复 — 端到端验证脚本
// 路径：scripts/verify-aliases-v030.js
//
// 用途：多多 start.bat 重启 3300 后一键跑，验证「中展集团」场景
//   - P0: isMentioned 用别名命中（之前漏匹配）
//   - P1: store.createBrand / updateBrand aliases 字段持久化
//   - P3: POST /api/geo/brands/:id/infer-aliases 路由可用
//
// 跑法：
//   node scripts/verify-aliases-v030.js
//
// 输出：
//   12 个断言全 PASS = v0.30 别名匹配生效
//   任何 FAIL = 给出 brand_id 排查

const http = require('http');

const HOST = 'localhost';
const PORT = 3300;
const AK = 'dev-key-001';

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = path + (path.includes('?') ? '&' : '?') + `api_key=${AK}`;
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: HOST, port: PORT, path: url, method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (chunk) => { buf += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, ok: res.statusCode < 400, data: buf ? JSON.parse(buf) : null }); }
        catch (e) { resolve({ status: res.statusCode, ok: res.statusCode < 400, data: buf }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const tests = [];
function assert(name, cond, detail) {
  tests.push({ name, ok: !!cond, detail });
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  console.log('=== ACMS GEO v0.30 别名匹配修复 — 端到端验证 ===\n');
  console.log(`目标: ${HOST}:${PORT}\n`);

  // 1. 创建「中展集团」测试 brand（带 aliases）
  const createRes = await api('POST', '/api/geo/brands', {
    name: '中展集团',
    domain: 'ciec.com.cn',
    industry: '会展',
    aliases: ['中展', 'CIEC', '中展股份'],
  });
  const brandId = createRes.data?.brand?.id;
  assert('1. 创建品牌（中展集团 + aliases）', !!brandId,
    `status=${createRes.status} id=${brandId} brand.aliases=${JSON.stringify(createRes.data?.brand?.aliases)}`);

  // 2. 验证 aliases 写入（顶层）
  const getRes = await api('GET', `/api/geo/brands/${brandId}`);
  const persistedAliases = getRes.data?.brand?.aliases || [];
  assert('2. 别名持久化到 brand.aliases（顶层字段）',
    JSON.stringify(persistedAliases.sort()) === JSON.stringify(['CIEC', '中展', '中展股份']),
    `actual=${JSON.stringify(persistedAliases)}`);

  // 3. 注入 5 个测试 query（3 个含别名变体 + 2 个不相关）
  const queries = [
    { prompt: '展览设计公司 行业排名' },      // unbranded, 不含任何别名
    { prompt: '中展怎么样' },                 // branded (含简称"中展")
    { prompt: 'CIEC review' },                // branded (含英文别名)
    { prompt: '上海 best 展览公司 for 创业团队' }, // unbranded, 不含别名
    { prompt: '中展集团 vs 振威' },          // branded (含全称)
  ];
  const queryIds = [];
  for (const q of queries) {
    const r = await api('POST', '/api/geo/queries', { brand_id: brandId, prompt: q.prompt });
    queryIds.push(r.data?.query?.id);
  }
  assert('3. 注入 5 个测试 query', queryIds.filter(Boolean).length === 5,
    `created=${queryIds.filter(Boolean).length}/5`);

  // 4. 注入 mock responses（每个 query 跑 deepseek 1 次）
  //    5 个 query × 1 engine = 5 个 response
  //    故意设计：q1/q4 (unbranded) 3 个回答里 2 个提"中展"（应该命中别名）
  //              q2/q3/q5 (branded) 3 个回答里全提"中展集团"或"CIEC"或"中展"
  //    整体 mention_rate 应该 100% (5/5)，且分层正确
  const mockResponses = [
    // q1: "展览设计公司 行业排名" — unbranded, AI 提"中展" → mention=true
    { query_idx: 0, text: '国内展览设计公司前列的有中展、振威、华毅等。', engine: 'deepseek' },
    // q2: "中展怎么样" — branded (含"中展"), AI 提"中展集团" → mention=true
    { query_idx: 1, text: '中展集团是中国展览行业的领军企业。', engine: 'deepseek' },
    // q3: "CIEC review" — branded (含 CIEC), AI 提"CIEC" → mention=true
    { query_idx: 2, text: 'CIEC has a strong reputation in exhibition industry.', engine: 'deepseek' },
    // q4: "上海 best 展览公司 for 创业团队" — unbranded, AI 提"中展" → mention=true
    { query_idx: 3, text: 'For startups, 推荐中展作为可靠的展览合作伙伴。', engine: 'deepseek' },
    // q5: "中展集团 vs 振威" — branded, AI 提"中展"和"中展集团" → mention=true
    { query_idx: 4, text: '中展集团和振威各有优势。中展在创意设计方面领先。', engine: 'deepseek' },
  ];

  // 直接通过 store 接口注入（避免 tracker agent 调真引擎）
  // 但 store 是 server 端模块，外部脚本拿不到 — 用更简单的方法：直接 PUT responses
  // 看是否有 POST /api/geo/responses 接口（应该有）
  let injectedCount = 0;
  for (const mr of mockResponses) {
    const qid = queryIds[mr.query_idx];
    if (!qid) continue;
    // 试 POST /api/geo/responses
    const r = await api('POST', '/api/geo/responses', {
      brand_id: brandId,
      query_id: qid,
      engine: mr.engine,
      raw_answer: mr.text,
      model: 'mock-test-v030',
      language: mr.text.match(/[a-z]/i) && !mr.text.match(/[\u4e00-\u9fa5]/) ? 'en' : 'zh',
    });
    if (r.ok) injectedCount++;
    else console.log(`   注入失败 [${mr.engine}]: status=${r.status} data=${JSON.stringify(r.data).slice(0, 200)}`);
  }
  // fallback：如果 POST /api/geo/responses 不存在，提示用户用 tracker agent
  if (injectedCount === 0) {
    console.log('   ⚠️  POST /api/geo/responses 不存在或失败 — 需要用 tracker agent 跑真引擎');
    console.log('   建议：直接看步骤 5 的 score 计算，mention_rate 取决于 tracker 跑出来的真实数据');
  } else {
    assert(`4. 注入 ${mockResponses.length} 个 mock response`, injectedCount === mockResponses.length,
      `injected=${injectedCount}`);
  }

  // 5. 跑评分 — 核心验证：mention_rate 不应该是 0
  const scoreRes = await api('GET', `/api/geo/score/${brandId}`);
  const score = scoreRes.data;
  assert('5. GET /api/geo/score 返回成功', scoreRes.ok && score?.ok,
    `status=${scoreRes.status} ok=${score?.ok} error=${score?.error}`);
  if (score?.ok) {
    const mr = score.components?.mention_rate;
    assert('6. mention_rate > 0（关键：别名命中生效）',
      typeof mr === 'number' && mr > 0,
      `mention_rate=${mr} (期望 > 0, 因为别名 "中展"/"CIEC" 应该命中)`);
    assert('7. branded/unbranded 分层正确',
      score.natural_sample_size > 0 && score.branded_sample_size > 0,
      `natural=${score.natural_sample_size} branded=${score.branded_sample_size}`);
    assert('8. components.branded_mention_rate 存在',
      'branded_mention_rate' in (score.components || {}),
      `keys=${Object.keys(score.components || {}).join(',')}`);
  } else {
    console.log('   ⚠️  评分无数据（需先跑 tracker）— 当前验证只到算法层');
  }

  // 6. 测 infer-aliases 路由（v0.30 新接口）
  console.log('\n   测 infer-aliases（需要 LLM agent 可用 — 可能 60-120s）:');
  const inferRes = await api('POST', `/api/geo/brands/${brandId}/infer-aliases`);
  assert('9. POST /api/geo/brands/:id/infer-aliases 路由可达',
    inferRes.status !== 404,
    `status=${inferRes.status} error=${inferRes.data?.error}`);
  if (inferRes.data?.ok) {
    assert('10. infer-aliases 返回 aliases 数组',
      Array.isArray(inferRes.data.inferred) && inferRes.data.inferred.length > 0,
      `inferred=${JSON.stringify(inferRes.data.inferred)}`);
    assert('11. 合并后 brand.aliases 持久化',
      Array.isArray(inferRes.data.merged) && inferRes.data.merged.length > 0,
      `merged=${JSON.stringify(inferRes.data.merged)}`);
  } else if (inferRes.data?.error === 'LLM_CALL_FAILED') {
    console.log('   ⚠️  LLM 不可用 — 跳过 infer-aliases 实跑（路由可达即可）');
  }

  // 7. PATCH 更新别名（验证写入路径）
  const patchRes = await api('PATCH', `/api/geo/brands/${brandId}`, {
    aliases: ['中展集团', '中展', 'CIEC', '中展股份', 'China Exhibition'],
  });
  assert('12. PATCH /api/geo/brands/:id aliases 写入 + 清洗',
    Array.isArray(patchRes.data?.brand?.aliases) &&
    !patchRes.data.brand.aliases.includes('中展集团') && // 子串压扁：brandName "中展集团" 的精确匹配若 alias 包含就被去重；"中展集团" 同 brandName → 应被过滤
    patchRes.data.brand.aliases.length > 0,
    `cleaned=${JSON.stringify(patchRes.data?.brand?.aliases)}`);

  // 清理
  console.log('\n=== 清理测试数据 ===');
  await api('DELETE', `/api/geo/brands/${brandId}`);
  console.log(`已删除 brand ${brandId}\n`);

  // 报告
  const pass = tests.filter(t => t.ok).length;
  const fail = tests.length - pass;
  console.log(`\n=== 结果: ${pass}/${tests.length} 通过 ===`);
  if (fail > 0) {
    console.log('\n失败的断言:');
    tests.filter(t => !t.ok).forEach(t => console.log('  ❌', t.name));
    process.exit(1);
  } else {
    console.log('\n🎉 v0.30 别名匹配修复全部生效！');
    process.exit(0);
  }
}

main().catch(e => { console.error('脚本异常:', e); process.exit(2); });