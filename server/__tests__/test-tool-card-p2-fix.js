// ============================================================
// test-tool-card-p2-fix.js — A 修复（2026-08-23）专项测试
// 验证：head 内审批按钮 + group awaiting 自动展开 + group head 状态徽章
// ============================================================
const path = require('path');
const SERVER = path.join(__dirname, '..');
process.chdir(SERVER);

const { JSDOM } = (function () {
  try { return require('jsdom'); } catch (e) {
    console.log('jsdom 未安装，跳过'); process.exit(0);
  }
})();

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="ap-messages"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.CustomEvent = dom.window.CustomEvent;
global.Event = dom.window.Event;

const fs = require('fs');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'js', 'core', 'agent-buddy-tool-card.js'), 'utf8');
eval(src);

const tcc = window.ACMSQwenToolCard;
const container = document.getElementById('ap-messages');
const streamBubble = document.createElement('div');
streamBubble.id = 'ap-stream-bubble';
container.appendChild(streamBubble);

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

console.log('=== A 修复（2026-08-23）专项测试 ===\n');

// ============ Case A1: awaiting 卡片 head 内嵌审批按钮 ============
console.log('--- Case A1: awaiting 卡片 head 内嵌审批按钮（不依赖 body） ---');
tcc.reset();
tcc.handleToolCard({ type: 'tool_card', phase: 'start', tool_use_id: 'tu_1', tool_name: 'bash' });
tcc.handleToolCard({
  type: 'tool_card', phase: 'await_approval',
  tool_use_id: 'tu_1', tool_name: 'bash',
  input: { command: 'rm -rf /' },
  permission_suggestions: [{ allow: false, reason: '危险' }],
});
const c1 = container.querySelector('[data-tool-use-id="tu_1"]');
const headBtns = c1.querySelectorAll('.ap-tool-card-head-btn');
check('awaiting 卡片 head 有 2 个审批按钮', headBtns.length === 2, `count=${headBtns.length}`);
check('head 按钮含 ✅', !!c1.querySelector('.ap-tool-card-head-btn.ap-tool-card-allow'), 'allow btn');
check('head 按钮含 ❌', !!c1.querySelector('.ap-tool-card-head-btn.ap-tool-card-deny'), 'deny btn');
// body 里**没有**审批按钮（head 已经有了，body 不重复）
const bodyBtns = c1.querySelector('.ap-tool-card-body').querySelectorAll('.ap-tool-card-btn');
check('body 不重复审批按钮（head 唯一）', bodyBtns.length === 0, `body count=${bodyBtns.length}`);

// ============ Case A2: 多次调用 + group 内有 awaiting 自动展开 ============
console.log('\n--- Case A2: 多次调用 group 内 awaiting 自动展开 ---');
tcc.reset();
// 4 张卡片触发 group（threshold=3）
['read_file', 'bash', 'read_file', 'edit_file'].forEach(function (toolName, i) {
  tcc.handleToolCard({ type: 'tool_card', phase: 'start', tool_use_id: 'tu_' + i, tool_name: toolName });
});
const group = container.querySelector('.ap-tool-group');
check('group 已创建', !!group, 'ap-tool-group exists');
const groupBody = group.querySelector('.ap-tool-group-body');
check('group body 初始折叠', groupBody.style.display === 'none', groupBody.style.display);

// 触发其中一张卡 await_approval
tcc.handleToolCard({
  type: 'tool_card', phase: 'await_approval',
  tool_use_id: 'tu_1', tool_name: 'bash',
  input: { command: 'rm' },
});
check('awaiting 触发后 group body 自动展开', groupBody.style.display === 'block', groupBody.style.display);

// ============ Case A3: group head 显示 ⏳ 待审批徽章 ============
console.log('\n--- Case A3: group head 状态徽章 ---');
const statsEl = group.querySelector('.ap-tool-group-stats');
const statHtml = statsEl ? statsEl.innerHTML : '';
check('group head 显示 ⏳ 1 待审批', statHtml.includes('1 待审批'), `html=${statHtml}`);
check('group head 总数 4', group.querySelector('.ap-tool-group-title').textContent.includes('(4)'), group.querySelector('.ap-tool-group-title').textContent);

// 给另一张卡 result(done)
tcc.handleToolCard({ type: 'tool_card', phase: 'result', tool_use_id: 'tu_0', tool_name: 'read_file', content: 'file content' });
const statHtml2 = group.querySelector('.ap-tool-group-stats').innerHTML;
check('done 卡片计入 group head 徽章', statHtml2.includes('1') && statHtml2.match(/✅\s*1/), `html=${statHtml2}`);

// ============ Case A4: head 按钮 click 触发 CustomEvent ============
console.log('\n--- Case A4: head 按钮 click 触发 CustomEvent ---');
tcc.reset();
tcc.handleToolCard({ type: 'tool_card', phase: 'start', tool_use_id: 'tu_C4', tool_name: 'bash' });
tcc.handleToolCard({
  type: 'tool_card', phase: 'await_approval',
  tool_use_id: 'tu_C4', tool_name: 'bash', input: {},
});
let receivedDetail = null;
document.addEventListener('qwen:tool-card:decision', function (e) {
  receivedDetail = e.detail;
});
const c4 = container.querySelector('[data-tool-use-id="tu_C4"]');
const allowBtn4 = c4.querySelector('.ap-tool-card-head-btn.ap-tool-card-allow');
allowBtn4.click();
check('head ✅ 按钮 click 触发 CustomEvent', receivedDetail !== null, 'receivedDetail=' + JSON.stringify(receivedDetail));
check('CustomEvent detail.toolUseId 正确', receivedDetail && receivedDetail.toolUseId === 'tu_C4', receivedDetail && receivedDetail.toolUseId);
check('CustomEvent detail.allow=true', receivedDetail && receivedDetail.allow === true, receivedDetail && receivedDetail.allow);

// ============ Case A5: head 按钮不触发 head 折叠事件 ============
console.log('\n--- Case A5: head 按钮 stopPropagation（不触发折叠） ---');
tcc.reset();
tcc.handleToolCard({ type: 'tool_card', phase: 'start', tool_use_id: 'tu_A', tool_name: 'bash' });
tcc.handleToolCard({
  type: 'tool_card', phase: 'await_approval',
  tool_use_id: 'tu_A', tool_name: 'bash', input: {},
});
const cA = container.querySelector('[data-tool-use-id="tu_A"]');
const bodyBefore = cA.querySelector('.ap-tool-card-body');
const displayBefore = bodyBefore.style.display;
cA.querySelector('.ap-tool-card-head-btn.ap-tool-card-deny').click();
const displayAfter = bodyBefore.style.display;
check('点击 ❌ 按钮不改变 body 显示状态', displayBefore === displayAfter, `before=${displayBefore} after=${displayAfter}`);

// ============ Case A6: 普通 click head (非按钮区域) 折叠/展开 body ============
console.log('\n--- Case A6: 点 head 空白处折叠 body ---');
tcc.reset();
tcc.handleToolCard({ type: 'tool_card', phase: 'start', tool_use_id: 'tu_B', tool_name: 'read_file' });
const cB = container.querySelector('[data-tool-use-id="tu_B"]');
const bodyB = cB.querySelector('.ap-tool-card-body');
const beforeB = bodyB.style.display;
cB.querySelector('.ap-tool-card-name').click();
const afterB = bodyB.style.display;
check('点 head 工具名切 body 折叠', beforeB !== afterB, `before=${beforeB} after=${afterB}`);

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