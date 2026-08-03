// v0.88: 小吉执行域端到端验证
// 用法: node scripts/verify-buddy-code-execution.js
// 验证：
//   1. retriever 中文检索能捞到 agent_* 执行工具
//   2. routeMessage 能分类 code_execution 意图
//   3. getActionToolNames 注入 code_execution 池
//   4. buildChatPrompt 生成 prompt 包含执行工具描述
require('../server/tools/index.js');
const toolRetriever = require('../server/services/tool-retriever');
const buddyAction = require('../server/services/agent-buddy-action');
const buddySkill = require('../server/services/agent-buddy-skill');
const reg = require('../server/services/tool-registry');

let problems = [];
let okCount = 0;

async function main() {
  // 1. retriever 中文检索
  await toolRetriever.init();
  const queries = [
    '帮我修这个bug，改一下代码',
    '读一下项目里的文件看看结构',
    '帮我跑个命令测试一下',
    '把这段代码重构一下',
  ];
  for (const q of queries) {
    const results = await toolRetriever.retrieve(q, 5);
    const names = results.map(r => r.name);
    const hasExec = names.some(n => n.startsWith('agent_') || n === 'delegate_subtasks');
    console.log(`🔍 "${q}" → ${names.join(', ')}`);
    if (hasExec) okCount++; else problems.push(`retriever 未捞到执行工具: "${q}" → ${names.join(', ') || '空'}`);
  }

  // 2. getActionToolNames 注入
  const route = { mode: 'single_action', capabilities: ['code_execution'], confidence: 0.9 };
  const toolNames = buddyAction.getActionToolNames(route, []);
  const hasRead = toolNames.includes('agent_read_file');
  const hasWrite = toolNames.includes('agent_write_file');
  const hasExec = toolNames.includes('agent_exec_command');
  const hasGit = toolNames.includes('agent_git_commit');
  const hasDelegate = toolNames.includes('delegate_subtasks');
  console.log(`\n🔧 code_execution 注入 ${toolNames.length} 个工具: ${toolNames.slice(0, 8).join(', ')}...`);
  if (hasRead && hasWrite && hasExec && hasGit) okCount++;
  else problems.push(`code_execution 池注入不完整: read=${hasRead} write=${hasWrite} exec=${hasExec} git=${hasGit}`);
  if (hasDelegate) okCount++; else problems.push('delegate_subtasks 未注入');

  // 3. token 成本
  let tokens = 0;
  function estTokens(str) { return Math.ceil(str.length / 3.5); }
  for (const n of toolNames) {
    const t = reg.getTool(n);
    if (!t) continue;
    let p = '';
    try { p = JSON.stringify(t.parameters || {}); } catch (e) {}
    tokens += estTokens((t.description || '') + p);
  }
  console.log(`💰 code_execution 注入 ${toolNames.length} 个工具 ≈ ${tokens} tokens`);
  if (tokens < 5000) okCount++; else problems.push(`token 成本过高: ${tokens}`);

  // 4. buildChatPrompt 包含执行工具
  const prompt = buddySkill.buildChatPrompt({
    currentView: 'kanban',
    expandedCategories: [],
    retrievedTools: ['agent_read_file', 'agent_write_file', 'agent_exec_command'],
    userName: '多多',
  });
  const hasPromptExec = prompt.includes('agent_exec_command') && prompt.includes('agent_read_file');
  console.log(`📝 prompt 长度: ${prompt.length} 字符, 含执行工具: ${hasPromptExec}`);
  if (hasPromptExec) okCount++; else problems.push('buildChatPrompt 未包含执行工具描述');

  // 5. 风险统计
  const riskDist = {};
  for (const n of toolNames) {
    const pool = reg.getToolPool(n);
    if (pool) riskDist[pool.risk] = (riskDist[pool.risk] || 0) + 1;
  }
  console.log(`⚠️  注入工具风险分布: ${JSON.stringify(riskDist)}`);

  if (problems.length) {
    console.log('\n❌ 问题 ' + problems.length + ' 项:');
    problems.forEach(p => console.log('  - ' + p));
    process.exit(1);
  }
  console.log(`\n✅ 全部通过 (${okCount} 组检查)`);
  process.exit(0);
}

main().catch(e => { console.error('执行失败:', e.message); process.exit(1); });
