// ============================================================
// acms-mcp-server.js — ACMS 工具 MCP Server（Phase B3 v0.1）
// ============================================================
// 把 ACMS 核心能力暴露给 Qwen Code 内核（stdio transport）。
// Qwen Code 通过 --mcp-config 连接本 server，即可调用：
//   acms_task_list / acms_task_get / acms_knowledge_list
//   acms_workspace_list_files / acms_email_send
//
// 运行：node server/services/acms-mcp-server.js
// 测试：node server/__tests__/test-acms-mcp-server.js
// ============================================================
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

// ---------- 工具定义 ----------
const TOOLS = [
  {
    name: 'acms_task_list',
    description: '列出 ACMS 中的任务（看板/需求任务）。可按状态筛选：backlog/todo/in_progress/done。',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: '任务状态筛选（可选）' },
        limit: { type: 'number', description: '返回条数上限（默认 20）' },
      },
    },
  },
  {
    name: 'acms_task_get',
    description: '获取 ACMS 单个任务详情。',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: '任务 ID' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'acms_knowledge_list',
    description: '列出 ACMS 项目知识库的目录树（wiki 页面）。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: '项目 ID' },
      },
    },
  },
  {
    name: 'acms_workspace_list_files',
    description: '列出 ACMS 项目工作区的文件。',
    inputSchema: {
      type: 'object',
      properties: {
        projectSlug: { type: 'string', description: '项目 slug/ID' },
        path: { type: 'string', description: '子目录（可选）' },
      },
    },
  },
  {
    name: 'acms_email_send',
    description: '通过 ACMS 发送邮件。',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: '收件人（逗号分隔多个）' },
        subject: { type: 'string', description: '主题' },
        body: { type: 'string', description: '正文（纯文本）' },
        cc: { type: 'string', description: '抄送（可选）' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
];

// ---------- 工具实现 ----------
function toolResult(text, isError = false) {
  return {
    content: [{ type: 'text', text: typeof text === 'string' ? text : JSON.stringify(text, null, 2) }],
    isError,
  };
}

async function handleCall(toolName, args) {
  try {
    switch (toolName) {
      case 'acms_task_list': {
        const taskStore = require('../stores/task-store');
        const tasks = taskStore.list();
        const filtered = args.status ? tasks.filter((t) => t.status === args.status) : tasks;
        const list = (filtered || []).slice(0, args.limit || 20).map((t) => ({
          id: t.id, title: t.title, status: t.status, priority: t.priority,
          updated_at: t.updated_at, assignee: t.assignee || '',
        }));
        return toolResult({ count: list.length, tasks: list });
      }
      case 'acms_task_get': {
        const taskStore = require('../stores/task-store');
        const task = taskStore.getById(args.taskId);
        if (!task) return toolResult({ error: `任务不存在: ${args.taskId}` }, true);
        return toolResult(task);
      }
      case 'acms_knowledge_list': {
        const ks = require('../services/knowledge-service');
        // wiki_vault_path 来自项目配置
        let wikiVault = null;
        try {
          const projectStore = require('../stores/project-store');
          const proj = projectStore.getById && projectStore.getById(args.projectId || 'default');
          wikiVault = (proj && proj.wiki_vault_path) || null;
        } catch (e) { /* 项目读取失败 */ }
        if (!wikiVault) {
          return toolResult({ error: `未找到项目 ${args.projectId || 'default'} 的 wiki_vault_path（知识库未配置）` }, true);
        }
        const tree = ks.listKnowledgeTree(args.projectId || 'default', wikiVault);
        return toolResult({ projectId: args.projectId || 'default', tree: tree || [] });
      }
      case 'acms_workspace_list_files': {
        const ws = require('../services/workspace-service');
        const files = ws.listFiles(args.projectSlug || 'default', { path: args.path || '' });
        return toolResult({ projectSlug: args.projectSlug || 'default', files: (files || []).slice(0, 50) });
      }
      case 'acms_email_send': {
        const emailSender = require('../services/email-sender');
        const result = await emailSender.sendEmail({
          to: args.to, cc: args.cc, subject: args.subject, body: args.body,
        });
        return toolResult({ ok: true, messageId: result && result.messageId });
      }
      default:
        return toolResult({ error: `未知工具: ${toolName}` }, true);
    }
  } catch (e) {
    return toolResult({ error: `${toolName} 执行失败: ${e.message}` }, true);
  }
}

// ---------- MCP Server ----------
async function main() {
  const server = new Server(
    { name: 'acms-mcp-server', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleCall(name, args || {});
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // 不退出（stdio 连接保持）
}

// 被 require 时直接跑（作为子进程入口）
main().catch((e) => {
  console.error('[acms-mcp-server] 启动失败:', e.message);
  process.exit(1);
});
