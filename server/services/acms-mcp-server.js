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
  // ── v0.119：网络搜图（百度图片）+ 自动 vision 描述 ──
  //   单一原子：搜图 + 下载 + 描述，返回 image 列表含视觉描述（≤400 字）。
  //   describe 默认 true（用户调此工具的主诉就是"把搜到的图带到对话里"）；
  //   设 false 时只返 URL+thumb，让 Agent 决定要不要进一步处理。
  {
    name: 'acms_search_images',
    description: '从网络（百度图片）搜图并自动返回每张图的视觉描述，让你像看本地图片一样"看到"搜到的内容。默认 describe=true 时，每张图会被下载并由 vision 模型生成中文描述（≤400 字），返回的 description 字段就是你能直接引用的视觉信息；设 describe=false 只返 URL/thumb/title（自己后续 decide）。典型场景：用户要"找一些 XX 图""搜 XX 素材""有什么好看的 XX 图"，或需要分析/比较一组网络图片。注意：受 8MB 上限 + SSRF 内网拦截；下载失败的图会跳过并附 fetch_error。',
    inputSchema: {
      type: 'object',
      properties: {
        query:      { type: 'string', description: '搜图关键词（中文优先，如"夏日海滩壁纸""ACMS 系统截图"）' },
        maxResults: { type: 'number', description: '返回张数（默认 6，上限 9）' },
        describe:   { type: 'boolean', description: '是否自动下载 + vision 描述（默认 true）' },
      },
      required: ['query'],
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
      // ── v0.119：网络搜图 + 自动 vision 描述 ──
      case 'acms_search_images': {
        const ws = require('../services/web-search');
        const visionService = require('../services/vision-service');
        const maxResults = Math.min(args.maxResults || 6, 9);
        const describe = args.describe !== false;   // 默认 true
        console.log(`[acms_search_images] query="${args.query}" max=${maxResults} describe=${describe}`);

        // 1) 搜图
        let imgResult;
        try {
          imgResult = await ws.browserSearchBaiduImage(args.query, maxResults);
        } catch (e) {
          return toolResult({ error: 'SEARCH_FAIL', hint: e.message, images: [] }, true);
        }
        if (imgResult && imgResult.error) {
          return toolResult({ error: imgResult.error, images: [] }, true);
        }
        const rawImages = Array.isArray(imgResult.images) ? imgResult.images : [];
        if (rawImages.length === 0) {
          return toolResult({ query: args.query, count: 0, images: [], hint: '未搜到结果，试试换个关键词' });
        }

        // 2) 不描述就直接返
        if (!describe) {
          return toolResult({
            query: args.query, count: rawImages.length,
            images: rawImages.map((i) => ({ thumb: i.thumb, url: i.url, title: i.title })),
            note: 'describe=false，仅返回 URL/thumb/title；如需视觉描述请重调并设 describe=true',
          });
        }

        // 3) 并发下载 + 描述（concurrency=3，避免 vision API 被打爆）
        const describeOne = async (img) => {
          const out = { thumb: img.thumb, url: img.url, title: img.title };
          try {
            const fr = await visionService.fetchImageBuffer(img.url);
            if (!fr.ok) {
              out.fetch_error = fr.error;
              if (fr.hint) out.fetch_hint = fr.hint;
              return out;
            }
            const dr = await visionService.describeImage(fr.buffer, {}, {});
            if (dr.ok) {
              out.description = dr.description;
              out.mime = dr.mime;
              out.size = dr.size;
            } else {
              out.describe_error = dr.error || 'VISION_FAIL';
            }
          } catch (e) {
            out.describe_error = e.message || 'UNKNOWN';
          }
          return out;
        };

        const concurrency = 3;
        const described = [];
        for (let i = 0; i < rawImages.length; i += concurrency) {
          const batch = rawImages.slice(i, i + concurrency);
          const batchResults = await Promise.all(batch.map(describeOne));
          described.push(...batchResults);
        }

        const describedCount = described.filter((d) => d.description).length;
        return toolResult({
          query: args.query,
          count: rawImages.length,
          described_count: describedCount,
          images: described,
          hint: describedCount === 0
            ? '所有图片都未能成功描述，详见各 image.fetch_error / describe_error 字段'
            : (describedCount < rawImages.length
                ? `成功描述 ${describedCount}/${rawImages.length} 张；其余失败原因见各 image.fetch_error / describe_error 字段`
                : `成功描述全部 ${describedCount} 张图`),
        });
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
