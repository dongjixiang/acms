// ACMS 内建工具 — Agent 数据库查询工具
// 让 agent 能直接查询 SQLite 数据库，用于查看任务状态、提交记录、评审结果等
const { registerTool } = require('../../services/tool-registry');
const path = require('path');

registerTool({
  name: 'agent_db_query',
  description: 'Execute a SQL query against the ACMS SQLite database. Use to check task status, submissions, reviews, execution logs, and project data. Default database is at data/acms.db in the ACMS root directory. Safe for SELECT queries only — writes are blocked.',
  parameters: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: 'SQL SELECT query. Example: "SELECT id, title, status, progress FROM tasks WHERE status=\'in_progress\' ORDER BY id DESC LIMIT 5"' },
    },
    required: ['sql'],
  },
  async handler(args, ctx = {}) {
    const { projectId } = ctx;
    if (!projectId) return { error: 'NO_PROJECT_ID' };
    const projectStore = require('../../stores/project-store');
    const project = projectStore.getById(projectId);
    if (!project) return { error: 'PROJECT_NOT_FOUND' };
    const slug = project.slug || project.name;
    const workspace = require('../../services/workspace-service');
    // 只允许 SELECT 语句，防止写操作
    const trimmedSql = (args.sql || '').trim().toUpperCase();
    if (!trimmedSql.startsWith('SELECT')) {
      return { error: 'WRITE_OPERATIONS_NOT_ALLOWED. Only SELECT queries are permitted.' };
    }
    // 限制查询长度，防止超大查询
    if (args.sql.length > 2000) {
      return { error: 'Query too long (max 2000 chars).' };
    }
    // 使用 Node.js + better-sqlite3 执行查询
    const acmsRoot = path.resolve(workspace.workspaceDir, '../../..');
    const dbPath = path.join(acmsRoot, 'data', 'acms.db');
    const result = await workspace.exec(slug, {
      cmd: `node -e "
const Database = require('better-sqlite3');
const db = new Database('${dbPath.replace(/\\/g, '\\\\')}');
try {
  const stmt = db.prepare(\`$(args.sql.replace(/\`/g, '\\\`').replace(/\\$/g, '\\$'))\`);
  const rows = stmt.all();
  console.log(JSON.stringify({ ok: true, count: rows.length, rows: rows.slice(0, 100) }));
} catch(e) {
  console.log(JSON.stringify({ ok: false, error: e.message }));
} finally {
  db.close();
}
"`,
      timeout: 15000,
    });
    try {
      const output = result.stdout || result.stderr || '';
      const match = output.match(/\{.*\}/s);
      if (match) {
        const data = JSON.parse(match[0]);
        if (data.ok) {
          return {
            ok: true,
            rowCount: data.count,
            columns: data.rows.length > 0 ? Object.keys(data.rows[0]) : [],
            rows: data.rows,
          };
        }
        return { error: data.error };
      }
      return { raw_output: output.slice(0, 1000) };
    } catch(e) {
      return { error: 'Parse failed: ' + e.message, raw_output: (result.stdout || '').slice(0, 500) };
    }
  },
});

console.log('[tools] 数据库工具注册完成: agent_db_query');
