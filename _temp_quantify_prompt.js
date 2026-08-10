
require('./server/tools/index.js');  // 注册所有 tool
const skill = require('./server/services/agent-buddy-skill');

const ctx = {
  currentView: 'kanban',
  userName: '多多',
  userSummary: '见过 47 次；聊过 312 个话题',
  personality: '技术 PM，喜欢简短直接的回复',
  agentEvents: ['REQ-xxx 任务已由 Codex 完成', 'REQ-yyy 需求被驳回'],
  expandedCategories: ['office'],
  retrievedTools: ['generate_pptx', 'generate_docx', 'web_search', 'fetch_url', 'query_collection']
};

const prompt = skill.buildChatPrompt(ctx);

console.log('=== 总长度 ===');
console.log('字符数:', prompt.length);
console.log('估算 token 数:', Math.round(prompt.length / 1.6));  // 中英混合粗估 1.6 字符/token

console.log('\n=== 按段落拆解 ===');
const sections = prompt.split(/\n\n【/);
sections.forEach((s, i) => {
  const header = s.split('\n')[0].slice(0, 30);
  console.log(`${(i+1).toString().padStart(2)}. [${header}...] ${s.length} 字符 (${Math.round(s.length/1.6)} tokens)`);
});

console.log('\n=== 工具描述部分 ===');
const toolSection = prompt.match(/【你当前可用的工具.*$/s);
if (toolSection) {
  console.log('工具描述总长:', toolSection[0].length, '字符 (~', Math.round(toolSection[0].length/1.6), 'tokens)');
  // 拆每个工具
  const toolBlocks = toolSection[0].split('\n\n').slice(1);
  console.log('工具数量:', toolBlocks.length);
  toolBlocks.forEach((tb, i) => {
    const name = tb.split('】')[0].replace('【', '');
    console.log(`  - ${name}: ${tb.length} 字符 (${Math.round(tb.length/1.6)} tokens)`);
  });
}
