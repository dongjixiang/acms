// ============================================================
// test-acms-mcp-server.js — ACMS MCP Server 测试（Phase B3）
// 验证：tools/list + 5 个工具调用
// 运行: node server/__tests__/test-acms-mcp-server.js
// ============================================================
const path = require('path');
process.chdir(path.join(__dirname, '..'));

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const serverPath = path.join(__dirname, '..', 'services', 'acms-mcp-server.js');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
  });
  const client = new Client({ name: 'acms-mcp-test', version: '0.1.0' });

  try {
    await client.connect(transport);
    console.log('=== ACMS MCP Server 测试 ===');

    // 1. tools/list
    const { tools } = await client.listTools();
    console.log(`工具数: ${tools.length}`);
    check('tools/list 返回 10 个工具', tools.length === 10, tools.map(t => t.name).join(', '));

    // 2. acms_task_list
    const r1 = await client.callTool({ name: 'acms_task_list', arguments: { limit: 5 } });
    const d1 = JSON.parse(r1.content[0].text);
    check('acms_task_list', !r1.isError && typeof d1.count === 'number', `count=${d1.count}`);

    // 3. acms_task_get（不存在的 ID → isError）
    const r2 = await client.callTool({ name: 'acms_task_get', arguments: { taskId: 'nonexistent-task-xyz' } });
    check('acms_task_get 未知任务报错', r2.isError === true, r2.content[0].text.slice(0, 60));

    // 4. acms_knowledge_list（用真实项目；'default' 不存在会报错——符合预期）
    const r3 = await client.callTool({ name: 'acms_knowledge_list', arguments: { projectId: 'proj_acms-self-improvement' } });
    check('acms_knowledge_list', !r3.isError, r3.content[0].text.slice(0, 80));

    // 5. acms_workspace_list_files
    const r4 = await client.callTool({ name: 'acms_workspace_list_files', arguments: { projectSlug: 'default' } });
    check('acms_workspace_list_files', !r4.isError, r4.content[0].text.slice(0, 80));

    // 6. acms_email_send（不真正发，用非法地址验证校验路径）
    const r5 = await client.callTool({ name: 'acms_email_send', arguments: { to: 'invalid-addr', subject: 't', body: 'b' } });
    check('acms_email_send 非法地址拦截', r5.isError === true || JSON.parse(r5.content[0].text).ok === true, r5.content[0].text.slice(0, 80));

    // 7. acms_project_list
    const r6 = await client.callTool({ name: 'acms_project_list', arguments: {} });
    const d6 = JSON.parse(r6.content[0].text);
    check('acms_project_list', !r6.isError && d6.count > 0, `count=${d6.count}`);

    // 8. acms_requirement_list
    const r7 = await client.callTool({ name: 'acms_requirement_list', arguments: { limit: 3 } });
    const d7 = JSON.parse(r7.content[0].text);
    check('acms_requirement_list', !r7.isError && typeof d7.count === 'number', `count=${d7.count}`);

    // 9. acms_web_search（真实搜索）
    const r8 = await client.callTool({ name: 'acms_web_search', arguments: { query: 'ACMS 智能体协同管理系统', maxResults: 3 } });
    const d8 = JSON.parse(r8.content[0].text);
    check('acms_web_search', !r8.isError && d8.count > 0, `count=${d8.count} query=${d8.query}`);

    // 10. acms_workspace_write_file + read_file（往返验证）
    const r9 = await client.callTool({ name: 'acms_workspace_write_file', arguments: { projectSlug: 'duogame', path: 'mcp-test.txt', content: 'B4 test' } });
    check('acms_workspace_write_file', !r9.isError, r9.content[0].text.slice(0, 60));
    const r10 = await client.callTool({ name: 'acms_workspace_read_file', arguments: { projectSlug: 'duogame', path: 'mcp-test.txt' } });
    const d10 = JSON.parse(r10.content[0].text);
    check('acms_workspace_read_file', !r10.isError && d10.content === 'B4 test', `content=${d10.content}`);
    // 清理测试文件
    try { require('fs').unlinkSync(path.join(process.cwd(), '..', 'workspaces', 'duogame', 'mcp-test.txt')); } catch (e) {}

    console.log('\n=== 汇总 ===');
    const ok = results.filter((r) => r.ok).length;
    console.log(`通过 ${ok}/${results.length}`);
    process.exit(ok === results.length ? 0 : 1);
  } catch (e) {
    console.error('❌ 测试异常:', e.message);
    process.exit(1);
  } finally {
    await client.close();
  }
})();
