// ACMS Phase 12 (v1.1) 单元测试 — 能力边界 + _expand_tools web 类别 + stall 疑问句豁免 + fetch_url 文本/GBK
// 触发场景：2026-08-20 小吉 8 连 trace 事故（conversation 模式宣称"没有网络搜索工具" + 错误记忆持久化）
// 用法：node server/__tests__/phase12-capability-boundary.test.js

require('../tools/index.js');
const buddy = require('../services/agent-buddy-skill');
const { detectStreamStall } = require('../services/llm-adapter');
const { fetchUrlCore, clearCache } = require('../tools/url-fetch');
const tr = require('../services/tool-registry');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}

// ── P1: conversation 模式（无 web 工具）注入能力边界段 ──
console.log('\n[P1] conversation 模式能力边界注入');
const L0_CONV = ['get_my_profile', 'buddy_memory_write', '_expand_tools', 'buddy_skill', 'retrieve_memory', 'query_project_context'];
const promptConv = buddy.buildChatPrompt({ currentView: '_default', userName: '多多', effectiveToolNames: L0_CONV });
assert(promptConv.includes('能力边界'), 'conversation prompt 含【能力边界】段');
assert(promptConv.includes('子集') && promptConv.includes('不是系统全部能力'), '能力边界说明"工具是子集"');
assert(promptConv.includes('严禁') && promptConv.includes('没有这个能力'), '能力边界禁止断言"没有能力"');
assert(promptConv.includes('web_search/fetch_url'), '能力边界提到 web_search/fetch_url 由系统分配');
assert(promptConv.includes('【你当前可用的工具（共 6 个）'), 'prompt 工具白名单仍显示 6 个 L0 工具（未破坏 P2-A 一致性）');

// 有 web 工具时不注入
const promptWeb = buddy.buildChatPrompt({ currentView: '_default', userName: '多多', effectiveToolNames: ['web_search', 'fetch_url'] });
assert(!promptWeb.includes('【能力边界】'), '有 web 工具时不注入能力边界段');

// ── P2: _expand_tools web 类别 ──
console.log('\n[P2] _expand_tools web 类别');
const promptWebCat = buddy.buildChatPrompt({ currentView: '_default', expandedCategories: ['web'] });
assert(promptWebCat.includes('web_search'), '扩载 web 类别 → prompt 含 web_search');
assert(promptWebCat.includes('fetch_url'), '扩载 web 类别 → prompt 含 fetch_url');

// _expand_tools handler 校验
const expandTool = tr.getTool('_expand_tools');
assert(expandTool !== null, '_expand_tools 工具已注册');
(async () => {
  const rWeb = await expandTool.handler({ category: 'web' }, {});
  assert(rWeb && rWeb.ok === true, '_expand_tools({category:"web"}) 校验通过');
  const rOffice = await expandTool.handler({ category: 'office' }, {});
  assert(rOffice && rOffice.ok === true, '_expand_tools({category:"office"}) 校验通过（之前 INVALID_CATEGORY）');
  const rBad = await expandTool.handler({ category: 'nonsense' }, {});
  assert(rBad && rBad.ok === false && rBad.error === 'INVALID_CATEGORY', '非法 category 仍拒绝');

  // ── P3: stall 疑问句豁免 ──
  console.log('\n[P3] stall 疑问句豁免');
  // 提议句（本次事故场景）："需要我帮你查一下今天的比特币具体价格吗？" → 豁免
  const q1 = detectStreamStall({ content: '需要我帮你查一下今天的比特币具体价格吗？', toolCalls: [] }, []);
  assert(q1 === null, '「需要我帮你查…吗？」提议句不判 stall');
  const q2 = detectStreamStall({ content: '要我帮你搜一下最新的新闻吗', toolCalls: [] }, []);
  assert(q2 === null, '「要我帮你搜…吗」不判 stall');
  const q3 = detectStreamStall({ content: '我可以帮你查一下今天的天气吗？', toolCalls: [] }, []);
  assert(q3 === null, '「我可以帮你查…吗？」不判 stall');
  // 承诺句（真装睡）：仍判 stall
  const p1 = detectStreamStall({ content: '我这就帮你查比特币的行情', toolCalls: [] }, []);
  assert(p1 !== null, '「我这就帮你查」仍判 stall');
  const p2 = detectStreamStall({ content: '我帮你找找看吧', toolCalls: [] }, []);
  assert(p2 !== null, '「我帮你找找看吧」（吧结尾）仍判 stall');
  const p3 = detectStreamStall({ content: '马上帮你生成图片', toolCalls: [] }, []);
  assert(p3 !== null, '「马上帮你生成图片」仍判 stall');
  // 正常回答不判 stall
  const n1 = detectStreamStall({ content: '好的，稍等。', toolCalls: [] }, []);
  assert(n1 === null, '正常回答不判 stall');

  // ── P4: fetch_url 文本/GBK 支持 ──
  console.log('\n[P4] fetch_url 行情文本接口（网络测试）');
  clearCache();
  try {
    const r = await fetchUrlCore({ url: 'https://qt.gtimg.cn/q=sh000001,btc_usd', max_length: 1000 });
    assert(!r.error, 'qt.gtimg.cn 抓取无错误');
    assert(r.rawText === true, '行情接口走 rawText 直返');
    assert(r.content && r.content.includes('v_sh000001'), '内容含腾讯行情 v_sh000001');
    assert(r.content && r.content.includes('上证指数'), 'GBK 中文正常解码（上证指数）');
  } catch (e) {
    assert(false, 'qt.gtimg.cn 抓取异常: ' + e.message);
  }

  console.log(`\n===== Phase 12 测试结果: ${passed} passed, ${failed} failed =====`);
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('测试执行异常:', e); process.exit(1); });
