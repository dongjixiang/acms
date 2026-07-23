// ACMS Tool — document_gen (v0.48, 2026-07-16)
// LLM 调 plan_execute 时使用 — 把对话历史整理成 Markdown + Pandoc 转 .docx
// 返回 file_ids（docx + md 都注册到 chat-upload），可串联给 send_email 作附件
//
// v0.48 治 v0.47 案例：之前 document_gen 是 assist 不在 tool-registry，
//   plan-executor 报 UNKNOWN_TOOL: document_gen，LLM 退化成 send_email body 写死占位符

const { registerTool } = require('../services/tool-registry');

registerTool({
  name: 'document_gen',
  description:
    '把对话历史整理成 Markdown 文档，再由 Pandoc 转成 .docx 文件。\n' +
    '\n' +
    '【何时调】\n' +
    '- 用户说"整理成 Word 文档"/"生成 Word"/"导出 .docx"/"整理成 markdown"/"写一份文档"等\n' +
    '- 用户在多步骤复合意图中需要文档作为中间产物（例：先搜索 + 整理文档 + 发邮件）\n' +
    '\n' +
    '【参数】\n' +
    '- instruction（必填）：用户的整理指令，描述要文档聚焦什么内容、什么结构\n' +
    '- model_id（可选）：指定 LLM 模型，不传走默认\n' +
    '\n' +
    '【返回】handler 返回 ok=true 表示文档已生成：\n' +
    '{\n' +
    '  ok: true,\n' +
    '  title: "文档标题",\n' +
    '  md_content: "...",          // 完整 Markdown 内容\n' +
    '  docx_url: "/api/generate/assets/.../...docx",   // .docx 下载链接\n' +
    '  md_url: "/api/generate/assets/.../...md",        // .md 下载链接\n' +
    '  file_ids: [                  // ← 关键：可串联给 send_email 作附件\n' +
    '    { id: "uuid", name: "标题.docx", size: 12345, mime: "application/vnd...wordprocessingml.document", kind: "docx" },\n' +
    '    { id: "uuid", name: "标题.md", size: 678, mime: "text/markdown", kind: "md" }\n' +
    '  ]\n' +
    '}\n' +
    '\n' +
    '【串联用法】plan.steps 里：\n' +
    '  1. { tool: "web_search", ... }                    ← 先搜索\n' +
    '  2. { tool: "document_gen", args: { instruction: "把搜索结果整理成 Word 文档" } }  ← 整理\n' +
    '  3. { tool: "send_email", args: { to: "x@x.com", subject: "...", body: "..." }, depends_on: ["s2"] }  ← 发邮件\n' +
    '    ↑ plan-executor 会自动把 s2 的 result.file_ids 注入 send_email args 作附件\n' +
    '\n' +
    '【handler 行为】fire-and-forget — handler 立即返回 ok=true，文档生成 + Pandoc 转换 在后台跑。' +
    '完成后 plan_step_update entry 写入聊天流，plan-bubble 显示文档标题 + 下载链接。',
  parameters: {
    type: 'object',
    properties: {
      instruction: {
        type: 'string',
        description: '整理指令（必填，描述要文档聚焦什么内容、什么结构、什么风格）',
      },
      model_id: {
        type: 'string',
        description: 'LLM 模型 id（可选，不传走默认）',
      },
    },
    required: ['instruction'],
  },
  async handler(args, ctx = {}) {
    const { reqId } = ctx;
    if (!reqId) {
      return { ok: false, error: 'NO_REQ_ID', message: 'document_gen 需要 reqId 上下文' };
    }
    if (!args || !args.instruction || typeof args.instruction !== 'string' || !args.instruction.trim()) {
      return { ok: false, error: 'NO_INSTRUCTION', message: 'instruction 必填且非空' };
    }
    // 延迟 require 避免循环依赖（document-gen.js require services/... 而 services/ 可能 require tools/...）
    const docGen = require('../services/assists/document-gen');
    const result = await docGen.runDocGenCore(reqId, {
      instruction: args.instruction.trim(),
      modelId: args.model_id,
    });
    return result;
  },
});