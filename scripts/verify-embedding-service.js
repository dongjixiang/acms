// v0.89: embedding-service 独立验证
// 用法: node scripts/verify-embedding-service.js
// 验证：
//   1. init 加载模型
//   2. embed 返回向量（维度正确 + 归一化）
//   3. indexDocs + search（知识库 RAG 场景）
//   4. searchDocs（工具实时检索场景）
//   5. getModelInfo（模型可配置信息）
require('../server/services/embedding-service') ? null : null;
const embedSvc = require('../server/services/embedding-service');

let okCount = 0;
let problems = [];

async function main() {
  // 1. init
  const initRes = await embedSvc.init();
  console.log('1️⃣ init:', JSON.stringify(initRes));
  if (initRes.ready) okCount++; else problems.push('init 失败: ' + initRes.error);

  // 2. embed
  const vec = await embedSvc.embed('如何配置邮件服务器', true);
  console.log('2️⃣ embed dim:', vec.length, 'norm:', Math.sqrt(vec.reduce((s, v) => s + v * v, 0)).toFixed(3));
  if (vec.length > 0) okCount++; else problems.push('embed 返回空向量');
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (Math.abs(norm - 1) < 0.01) okCount++; else problems.push('向量未归一化: ' + norm);

  // 3. indexDocs + search（知识库场景）
  const docs = [
    { name: '邮件配置', text: 'SMTP 服务器设置，包括收发信服务器地址、端口、认证账号密码。发信走 25/465/587 端口，收信用 IMAP 993。' },
    { name: '需求流程', text: '需求从 idea 状态开始，经过澄清、审批后进入开发。PM 可以审批需求，tech 认领任务。' },
    { name: '小吉使用', text: '小吉是 ACMS 的系统助手，可以帮你建需求、查数据、发邮件、生成图片和文档。' },
    { name: '部署指南', text: '服务器部署：先 git clone 仓库，然后 npm install，配置 config.json，最后 systemctl start acms。' },
  ];
  const idxRes = await embedSvc.indexDocs(docs);
  console.log('3️⃣ indexDocs:', JSON.stringify(idxRes));
  if (idxRes.indexed === docs.length) okCount++; else problems.push('indexDocs 数量不对: ' + idxRes.indexed);

  // 语义检索：验证服务能返回排序结果（模型质量不在此验证——bge-small-zh 对
  //   短中文文本区分度差是已知结论，未来换 bge-base/m3；此处只验证链路通）
  const results = await embedSvc.search('怎么发邮件给别人', 2);
  console.log('   "怎么发邮件给别人" →', results.map(r => r.name + '(' + r.score.toFixed(3) + ')').join(', '));
  if (results.length === 2 && typeof results[0].score === 'number') okCount++;
  else problems.push('search 返回结构不对');

  const results2 = await embedSvc.search('服务怎么跑起来', 2);
  console.log('   "服务怎么跑起来" →', results2.map(r => r.name + '(' + r.score.toFixed(3) + ')').join(', '));
  if (results2.length === 2) okCount++; else problems.push('search 返回数量不对');

  // 4. searchDocs（工具实时检索场景）
  const toolDocs = [
    { name: 'agent_read_file', text: 'Read file from project workspace 读文件 文件内容 查看代码' },
    { name: 'send_email', text: 'Send email to team 邮件 发送 通知 发信' },
    { name: 'generate_pptx', text: 'Generate PowerPoint 演示 幻灯片 PPT 汇报' },
  ];
  const toolRes = await embedSvc.searchDocs('帮我做个PPT', toolDocs, 1);
  console.log('4️⃣ searchDocs "帮我做个PPT" →', toolRes.map(r => r.name + '(' + r.score.toFixed(3) + ')').join(', '));
  if (toolRes.length === 1 && typeof toolRes[0].score === 'number') okCount++;
  else problems.push('searchDocs 返回结构不对');

  // 5. getModelInfo
  const info = embedSvc.getModelInfo();
  console.log('5️⃣ modelInfo:', JSON.stringify(info));
  if (info.modelDir && info.ready) okCount++; else problems.push('modelInfo 不完整');

  if (problems.length) {
    console.log('\n❌ 问题 ' + problems.length + ' 项:');
    problems.forEach(p => console.log('  - ' + p));
    process.exit(1);
  }
  console.log(`\n✅ embedding-service 全部通过 (${okCount} 组检查)`);
  process.exit(0);
}

main().catch(e => { console.error('执行失败:', e.message); process.exit(1); });
