// 冒烟测试：agent-trace 核心链路（不碰 DB）
// 用法: node scripts/test-agent-trace-smoke.js
const path = require('path');
const traceSvc = require(path.join(__dirname, '..', 'server', 'services', 'agent-trace'));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

(async () => {
  console.log('== 1. 会话生命周期 ==');
  const t = traceSvc.startTrace({
    modelId: 'mock-model', maxRounds: 3,
    toolNames: ['web_search', 'fetch_url'],
    context: { reqId: 'sess-test123', caller: 'smoke-test' },
  });
  check('startTrace 返回会话', !!t && !!t.trace.id);
  check('状态 running', t.trace.status === 'running');

  console.log('== 2. 每轮记录 ==');
  t.beginRound(1, traceSvc.cloneMessages([
    { role: 'system', content: 'SYSTEM_PROMPT_' + 'x'.repeat(100) },
    { role: 'user', content: '查一下深圳95号汽油价格' },
  ]));
  t.recordLLMResponse(1, {
    content: '好的，我来搜索。', finishReason: 'tool_calls',
    toolCalls: [{ name: 'web_search', id: 'call_1', args: { query: '深圳95号汽油价格' } }],
    usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
    durationMs: 850,
  });
  t.recordToolCall(1, { tool: 'web_search', args: { query: '深圳95号汽油价格' }, result: { results: [{ title: '广东省油价', url: 'https://example.com' }] }, durationMs: 320, error: null });
  t.beginRound(2, traceSvc.cloneMessages([
    { role: 'system', content: 'SYSTEM_PROMPT' },
    { role: 'user', content: '查一下深圳95号汽油价格' },
    { role: 'assistant', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'web_search', arguments: '{"query":"深圳95号汽油价格"}' } }] },
    { role: 'tool', tool_call_id: 'call_1', content: '{"results":[{"title":"广东省油价"}]}' },
  ]));
  t.recordLLMResponse(2, {
    content: '', finishReason: 'stop', toolCalls: [],
    usage: { prompt_tokens: 200, completion_tokens: 40, total_tokens: 240 },
    durationMs: 500,
  });
  t.addNote(2, 'empty_content', '第 1 次空内容');
  check('2 个 round 已记录', t.trace.rounds.length === 2);
  check('round1 llm content', t.trace.rounds[0].llm.content === '好的，我来搜索。');
  check('round1 toolCalls 1 条', t.trace.rounds[0].toolCalls.length === 1);
  check('round2 note 记录', t.trace.rounds[1].notes.length === 1 && t.trace.rounds[1].notes[0].type === 'empty_content');

  console.log('== 3. 完成 + summary ==');
  t.finish({ content: '深圳95号汽油价格约 7.8 元/升', finishReason: 'stop', usage: { prompt_tokens: 320, completion_tokens: 70, total_tokens: 390 } });
  check('状态 completed', t.trace.status === 'completed');
  check('summary toolCallCount=1', t.trace.summary.toolCallCount === 1);
  check('summary tokens.total=390', t.trace.summary.tokens.total === 390);
  check('summary noteStats.empty_content=1', t.trace.summary.noteStats.empty_content === 1);

  console.log('== 4. 大 content 截断 ==');
  const big = 'A'.repeat(70000);
  const snap = traceSvc.cloneMessages([{ role: 'user', content: big }]);
  check('70KB content 截断', snap[0].content.length < 70000 && snap[0].content.includes('已截断'));

  console.log('== 5. HTML 报告生成 ==');
  const html = traceSvc.renderHtml(traceSvc.getTrace(t.trace.id));
  check('HTML 包含标题', html.includes('Agent 运行报告'));
  check('HTML 包含效率指标', html.includes('效率指标'));
  check('HTML 包含每轮详情', html.includes('逐轮详情'));
  check('HTML 包含 Round 1', html.includes('Round 1'));
  check('HTML 包含工具统计表', html.includes('工具调用统计'));
  check('HTML 包含系统事件', html.includes('系统事件'));
  check('HTML 包含空内容事件标签', html.includes('空内容重试'));
  check('HTML 转义 <script>', !traceSvc.renderHtml(traceSvc.getTrace(t.trace.id)).includes('<script>'));

  console.log('== 6. 列表 / 删除 ==');
  const list = traceSvc.listTraces(5);
  check('列表包含本条', list.some(m => m.id === t.trace.id));
  traceSvc.deleteTrace(t.trace.id);
  check('删除后不存在', !traceSvc.getTrace(t.trace.id));

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('冒烟测试异常:', e); process.exit(1); });
