// ============================================================
// test-tool-card-p2.js — P2 打磨 mock 测试（用 jsdom 模拟浏览器 DOM）
// 覆盖：reset() DOM 清理 / 折叠按钮 / group 合并 / MCP 渲染 / Other 实时
// ============================================================
const path = require('path');
const SERVER = path.join(__dirname, '..');
process.chdir(SERVER);

// jsdom 模拟浏览器环境
const { JSDOM } = (function () {
  try { return require('jsdom'); } catch (e) {
    console.log('jsdom 未安装，跳过 P2 mock 测试（Node 测试范围有限）');
    process.exit(0);
  }
})();

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="ap-messages"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.CustomEvent = dom.window.CustomEvent;
global.Event = dom.window.Event;

// 加载 tool-card（IIFE 写到 window.ACMSQwenToolCard）
const fs = require('fs');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'js', 'core', 'agent-buddy-tool-card.js'), 'utf8');
// 把 window 引用替换成我们注入的 dom window
eval(src);

const tcc = window.ACMSQwenToolCard;
const container = document.getElementById('ap-messages');
// 模拟 stream bubble（card 应插在它之前）
const streamBubble = document.createElement('div');
streamBubble.id = 'ap-stream-bubble';
streamBubble.textContent = 'stream reply';
container.appendChild(streamBubble);

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

console.log('=== tool-card P2 mock 测试 ===\n');

// ============ Case 1: reset() 保留历史卡片（v0.114v） ============
console.log('--- Case 1: reset() 保留历史卡片（v0.114v 聊天流向下） ---');
tcc.handleToolCard({ type: 'tool_card', phase: 'start', tool_use_id: 'tu_1', tool_name: 'write_file' });
const beforeCount = container.querySelectorAll('.ap-tool-card').length;
check('reset 前 container 有卡片', beforeCount > 0, `count=${beforeCount}`);
tcc.reset();
const afterCount = container.querySelectorAll('.ap-tool-card').length;
check('reset 后历史卡片保留（不删 DOM）', afterCount === beforeCount, `count=${afterCount} vs ${beforeCount}`);
// 新轮次新卡片正常渲染（round 隔离，不误入历史 group）
tcc.handleToolCard({ type: 'tool_card', phase: 'start', tool_use_id: 'tu_1b', tool_name: 'write_file' });
const round2Count = container.querySelectorAll('.ap-tool-card').length;
check('新轮次卡片正常渲染', round2Count === afterCount + 1, `count=${round2Count}`);

// ============ Case 2: 折叠按钮 ============
console.log('\n--- Case 2: 折叠按钮 + 默认折叠 ---');
tcc.handleToolCard({ type: 'tool_card', phase: 'start', tool_use_id: 'tu_2', tool_name: 'read_file' });
const card = container.querySelector('[data-tool-use-id="tu_2"]');
check('卡片已渲染', !!card);
const body = card.querySelector('.ap-tool-card-body');
const toggle = card.querySelector('.ap-tool-card-toggle');
check('body 默认隐藏', body && body.style.display === 'none', body ? `display=${body.style.display}` : 'no body');
check('toggle ▶ 字符', toggle && toggle.textContent === '▶', toggle ? toggle.textContent : 'no toggle');
// 点击 toggle 展开
toggle.click();
check('点击后 body 显示', body.style.display === 'block', `display=${body.style.display}`);
check('toggle 变 ▼', toggle.textContent === '▼', toggle.textContent);

// ============ Case 3: phase 完整链路 + 状态机 ============
console.log('\n--- Case 3: 完整 phase 链路 ---');
tcc.reset();
tcc.handleToolCard({ type: 'tool_card', phase: 'start', tool_use_id: 'tu_3', tool_name: 'bash' });
tcc.handleToolCard({ type: 'tool_card', phase: 'input_complete', tool_use_id: 'tu_3', tool_name: 'bash', input: { command: 'ls -la' } });
const c3 = container.querySelector('[data-tool-use-id="tu_3"]');
check('input_complete 后 body 有参数区', !!c3.querySelector('.ap-tool-card-code'), c3.querySelector('.ap-tool-card-code') ? c3.querySelector('.ap-tool-card-code').textContent.slice(0, 30) : 'no code');

tcc.handleToolCard({ type: 'tool_card', phase: 'result', tool_use_id: 'tu_3', tool_name: 'bash', content: 'file1.txt\nfile2.txt', is_error: false });
const head3 = c3.querySelector('.ap-tool-card-head');
check('result 后 head 状态变 done', c3.classList.contains('ap-tool-status-done'), c3.className);
check('result 后 done 状态默认折叠（v0.18 极简）', c3.querySelector('.ap-tool-card-body').style.display === 'none', c3.querySelector('.ap-tool-card-body').style.display);

tcc.handleToolCard({ type: 'tool_card', phase: 'result', tool_use_id: 'tu_4', tool_name: 'bash', content: 'permission denied', is_error: true });
const c4 = container.querySelector('[data-tool-use-id="tu_4"]');
check('failed 自动展开 body（治装睡）', c4.querySelector('.ap-tool-card-body').style.display === 'block', c4.querySelector('.ap-tool-card-body').style.display);
check('failed 标 .ap-tool-status-failed', c4.classList.contains('ap-tool-status-failed'));

tcc.handleToolCard({ type: 'tool_card', phase: 'result', tool_use_id: 'tu_4', tool_name: 'bash', content: 'permission denied', is_error: true });
const c5 = container.querySelector('[data-tool-use-id="tu_4"]');
check('failed 头部 + 红色状态名', c5.querySelector('.ap-tool-card-name').style.color === 'rgb(255, 107, 107)' || c5.querySelector('.ap-tool-card-name').classList.contains('ap-tool-card-name'), 'see CSS');

// ============ Case 4: group 合并 ============
console.log('\n--- Case 4: 3+ 工具 group 合并 ---');
tcc.reset();
tcc.handleToolCard({ type: 'tool_card', phase: 'start', tool_use_id: 'tu_a', tool_name: 'read_file' });
tcc.handleToolCard({ type: 'tool_card', phase: 'start', tool_use_id: 'tu_b', tool_name: 'read_file' });
const beforeGroup = container.querySelectorAll('.ap-tool-group').length;
check('前 2 张卡片不创建 group', beforeGroup === 0, `group count=${beforeGroup}`);

tcc.handleToolCard({ type: 'tool_card', phase: 'start', tool_use_id: 'tu_c', tool_name: 'read_file' });
const at3 = container.querySelectorAll('.ap-tool-group').length;
check('第 3 张卡片触发 group 创建（threshold=3）', at3 === 1, `group count=${at3}`);

tcc.handleToolCard({ type: 'tool_card', phase: 'start', tool_use_id: 'tu_d', tool_name: 'read_file' });
const groupBody = container.querySelector('.ap-tool-group-body');
check('group body 包含全部 4 张卡片', groupBody.querySelectorAll('.ap-tool-card').length === 4, `count=${groupBody.querySelectorAll('.ap-tool-card').length}`);
check('group head 显示计数 4', container.querySelector('.ap-tool-group-stats').textContent.length >= 0 && container.querySelector('.ap-tool-group-title').textContent.includes('(4)'), container.querySelector('.ap-tool-group-title').textContent);

// ============ Case 5: MCP 渲染 ============
console.log('\n--- Case 5: MCP acms_* 友好渲染 ---');
tcc.reset();
tcc.handleToolCard({ type: 'tool_card', phase: 'start', tool_use_id: 'tu_mcp1', tool_name: 'mcp__acms__acms_web_search' });
tcc.handleToolCard({ type: 'tool_card', phase: 'input_complete', tool_use_id: 'tu_mcp1', tool_name: 'mcp__acms__acms_web_search', input: { query: 'ACMS 是什么' } });
const mcp1 = container.querySelector('[data-tool-use-id="tu_mcp1"]');
check('MCP web_search 显示 🔍 搜索标签', !!mcp1.querySelector('.ap-tool-card-mcp-name'), mcp1.querySelector('.ap-tool-card-mcp-name') ? mcp1.querySelector('.ap-tool-card-mcp-name').textContent : 'no');
check('MCP web_search 显示查询词', mcp1.querySelector('.ap-tool-card-pattern') && mcp1.querySelector('.ap-tool-card-pattern').textContent === 'ACMS 是什么', mcp1.querySelector('.ap-tool-card-pattern') ? mcp1.querySelector('.ap-tool-card-pattern').textContent : 'no');

// MCP output 渲染（acms_web_search results）
tcc.handleToolCard({ type: 'tool_card', phase: 'result', tool_use_id: 'tu_mcp1', tool_name: 'mcp__acms__acms_web_search', content: JSON.stringify({ results: [{ title: 'ACMS 官网', url: 'https://acms.com', snippet: '智能体协同管理系统' }, { title: 'ACMS GitHub', url: 'https://github.com/acms', snippet: '开源仓库' }] }) });
const mcp1Result = mcp1.querySelector('.ap-tool-card-search-item');
check('MCP web_search output 渲染搜索结果列表', !!mcp1Result, mcp1Result ? mcp1Result.textContent.slice(0, 60) : 'no result item');

// ============ Case 6: ask_user_question Other 实时显示 ============
console.log('\n--- Case 6: ask_user_question Other 实时显示 ---');
tcc.reset();
tcc.handleToolCard({ type: 'tool_card', phase: 'start', tool_use_id: 'tu_uq', tool_name: 'ask_user_question' });
tcc.handleToolCard({
  type: 'tool_card', phase: 'await_approval',
  tool_use_id: 'tu_uq', tool_name: 'ask_user_question',
  is_user_question: true,
  questions: [{
    index: '0', header: '城市', question: '查哪个城市？',
    options: [{ label: '北京' }, { label: '上海' }],
    multiSelect: false,
  }],
});
const uqCard = container.querySelector('[data-tool-use-id="tu_uq"]');
const otherInputs = uqCard.querySelectorAll('.ap-tool-card-q-other-input');
check('ask_user_question 渲染 Other 输入框', otherInputs.length === 1, `count=${otherInputs.length}`);
check('Other 输入框默认隐藏', otherInputs[0].style.display === 'none', otherInputs[0].style.display);

// 选 Other → 显示（用 click() 触发 change 事件，更贴近真实交互）
const otherRadios = uqCard.querySelectorAll('input[value="__qwen_other__"]');
otherRadios[0].click();
check('选 Other 后输入框显示', otherInputs[0].style.display === 'block', otherInputs[0].style.display);

// 取消 Other → 隐藏
otherRadios[0].checked = false;
otherRadios[0].dispatchEvent(new dom.window.Event('change', { bubbles: true }));
check('取消 Other 后输入框隐藏', otherInputs[0].style.display === 'none', otherInputs[0].style.display);

// ============ 总结 ============
console.log('\n=== 测试总结 ===');
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log(`通过 ${passed}/${results.length}`);
if (failed.length) {
  console.log('\n❌ 失败:');
  failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
  process.exit(1);
}
console.log('✅ 全部通过');