// v0.88: keyword vs bge 检索模式对比
// 用法: node scripts/compare-retriever-modes.js
// 对比 DOMAIN_TERMS 注入后 keyword 模式 vs bge 语义模式的检索效果
require('../server/tools/index.js');
const tr = require('../server/services/tool-retriever');

const QUERIES = [
  // 字面匹配类（DOMAIN_TERMS 覆盖）
  { q: '帮我修这个bug，改一下代码', expect: '写文件类' },
  { q: '读一下项目里的文件看看结构', expect: '读文件类' },
  { q: '帮我跑个命令测试一下', expect: 'exec 类' },
  { q: '把这段代码重构一下', expect: '写文件类' },
  // 语义匹配类（字面无覆盖，需语义理解）
  { q: '给我出一份季度汇报的PPT', expect: 'generate_pptx' },
  { q: '写一封邮件通知大家开会', expect: 'send_email' },
  { q: '看看最近系统有没有异常', expect: 'bug/事件类' },
  { q: '这个接口的返回格式是什么样的', expect: 'http/代码类' },
  { q: '帮我把需求整理成文档', expect: 'docx/office' },
  { q: '查一下数据库里有多少用户', expect: 'db/query' },
];

async function main() {
  // keyword 模式
  await tr.init();
  tr.setMode('keyword');
  console.log('═══════ keyword 模式（DOMAIN_TERMS 注入后）═══════');
  for (const { q } of QUERIES) {
    const r = await tr.retrieve(q, 3);
    console.log(`  "${q}"\n    → ${r.map(x => x.name + '(' + x.score + ')').join(', ')}`);
  }

  // bge 模式
  console.log('\n═══════ bge 模式（语义）═══════');
  tr.setMode('bge');
  // 等 bge 初始化 + 全量向量预计算完成（bgeReady 在向量算完前就置位，需轮询向量数）
  for (let i = 0; i < 120; i++) {
    const st = tr.status();
    if (st.bgeReady && st.bgeToolVectors >= tr.status().toolsCount) break;
    await new Promise(r => setTimeout(r, 500));
  }
  const st = tr.status();
  console.log('  bgeReady:', st.bgeReady, 'toolVectors:', st.bgeToolVectors, '/ tools:', st.toolsCount);
  if (!st.bgeReady) {
    console.log('  ⚠️ bge 未就绪，跳过对比');
    process.exit(0);
  }
  for (const { q } of QUERIES) {
    const r = await tr.retrieve(q, 3);
    console.log(`  "${q}"\n    → ${r.map(x => x.name + '(' + x.score + ')').join(', ')}`);
  }
  process.exit(0);
}

main().catch(e => { console.error('失败:', e.message); process.exit(1); });
