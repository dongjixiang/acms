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
  // ── B4: 扩展工具（2026-08-22）──
  {
    name: 'acms_project_list',
    description: '列出 ACMS 中的所有项目。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回条数上限（默认 20）' },
      },
    },
  },
  {
    name: 'acms_requirement_list',
    description: '列出 ACMS 需求（可筛选项目/状态）。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: '项目 ID（可选）' },
        status: { type: 'string', description: '状态筛选（可选）：backlog/todo/in_progress/done' },
        limit: { type: 'number', description: '返回条数上限（默认 10）' },
      },
    },
  },
  {
    name: 'acms_web_search',
    description: '通过 ACMS 搜索网络（Bing/头条/百度多路，含缓存）。用于查资料、找新闻、验证事实。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        maxResults: { type: 'number', description: '返回条数（默认 5，最大 10）' },
      },
      required: ['query'],
    },
  },
  {
    name: 'acms_workspace_read_file',
    description: '读取 ACMS 项目工作区中的文件内容。',
    inputSchema: {
      type: 'object',
      properties: {
        projectSlug: { type: 'string', description: '项目 slug/ID' },
        path: { type: 'string', description: '相对路径（如 src/main.js）' },
      },
      required: ['projectSlug', 'path'],
    },
  },
  {
    name: 'acms_workspace_write_file',
    description: '写入文件到 ACMS 项目工作区（注意：会真实修改文件，请先确认）。',
    inputSchema: {
      type: 'object',
      properties: {
        projectSlug: { type: 'string', description: '项目 slug/ID' },
        path: { type: 'string', description: '相对路径（如 src/main.js）' },
        content: { type: 'string', description: '文件内容' },
      },
      required: ['projectSlug', 'path', 'content'],
    },
  },
  // ── v0.118：视觉描述（单张图，纯文字回） ──
  {
    name: 'acms_describe_image',
    // v0.118 强化 description（让 Agent 知道何时调）：
    //   - 描述从纯技术改成"用户触发式"——明确告诉 Agent 看到本地图片路径就该调
    //   - 反向提示避免重复：消息已经含 <image> attachment 时不要重复调
    description: '当用户提供本地图片路径（PNG / JPG / GIF / WebP，≤8MB）让你看图时调用。返回 vision 模型给出的中文描述（不超过 400 字，纯文本，无 base64）。注意：消息已经含 <image> attachment 时不要重复调（避免重复计费）。路径必须在 cwd / 项目 workspace / Qwen task sandbox / 当前用户的 Pictures / Desktop / Downloads 之内，.git / .ssh / .env 等敏感路径会被拒。',
    inputSchema: {
      type: 'object',
      properties: {
        path:  { type: 'string', description: '图片绝对路径' },
        prompt:{ type: 'string', description: '可选：自定义 vision 提示词（默认"描述图中关键信息"）' },
      },
      required: ['path'],
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
      case 'acms_project_list': {
        const projectStore = require('../stores/project-store');
        const projects = (projectStore.list() || []).slice(0, args.limit || 20).map((p) => ({
          id: p.id, name: p.name, slug: p.slug, description: (p.description || '').slice(0, 80),
        }));
        return toolResult({ count: projects.length, projects });
      }
      case 'acms_requirement_list': {
        const reqStore = require('../stores/requirement-store');
        const reqs = reqStore.list({
          projectId: args.projectId || undefined,
          status: args.status || undefined,
          limit: args.limit || 10,
          lite: true,
        });
        const list = (reqs || []).map((r) => ({
          id: r.id, title: r.title, status: r.status, priority: r.priority, projectId: r.project_id,
        }));
        return toolResult({ count: list.length, requirements: list });
      }
      case 'acms_web_search': {
        const ws = require('../services/web-search');
        const result = await ws.searchWeb(args.query, { maxResults: Math.min(args.maxResults || 5, 10) });
        if (result && result.error) return toolResult({ error: result.error }, true);
        const items = (result.results || []).map((r) => ({
          title: r.title, url: r.url, snippet: (r.snippet || '').slice(0, 150),
        }));
        return toolResult({ query: args.query, count: items.length, results: items });
      }
      case 'acms_workspace_read_file': {
        const ws = require('../services/workspace-service');
        const content = ws.readFile(args.projectSlug, args.path);
        return toolResult({ path: args.path, content: String(content).slice(0, 20000) });
      }
      case 'acms_workspace_write_file': {
        const ws = require('../services/workspace-service');
        const result = ws.writeFile(args.projectSlug, args.path, args.content);
        return toolResult(result);
      }
      case 'acms_describe_image': {
        const visionService = require('../services/vision-service');
        // 上下文：cwd + 当前项目 workspace（如果可取）
        const context = { cwd: process.cwd() };
        try {
          const projectStore = require('../stores/project-store');
          // 没有明显可取的"当前项目"——MCP 调用方应传 path 直接走；白名单兜底会接受 Pictures 等用户目录
        } catch (e) { /* ignore */ }
        const r = await visionService.describeImage(args.path, context, { prompt: args.prompt });
        if (!r.ok) {
          // v0.118 三态路径政策：中间地带 (NOT_IN_AUTO_ALLOWLIST) 不当 error 抛，
          //   而是作为结构化信息让 Agent 主动告诉用户"需要你确认"
          if (r.requires_approval) {
            return toolResult({
              requires_user_approval: true,
              reason: r.error || 'NOT_IN_AUTO_ALLOWLIST',
              policy: r.policy,
              path: args.path,
              allowRoots: r.allowRoots || [],
              message: '该路径不在自动白名单内。需要请用户明确批准是否放行（建议措辞："小吉：[路径] 不在我的自动允许目录里，要读这个图的话你点头 OK 我就当次放行，或者直接修改路径也行"）。',
            });
          }
          return toolResult({ error: r.error || 'VISION_FAILED', size: r.size, mime: r.mime, policy: r.policy }, true);
        }
        return toolResult({ path: args.path, mime: r.mime, size: r.size, description: r.description });
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
