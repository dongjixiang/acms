// ACMS GEO — llms.txt 生成器工具（v0.1 — Phase 0 D3）
// 路径：server/tools/llms-txt-generator.js
//
// 注册 2 个工具：
//   1. generate_llms_txt    — 输入 url，输出标准 llms.txt 文本 + 写文件
//   2. validate_llms_txt    — 输入 llms.txt 文本，校验是否符合 v2 规范
//
// 参考模板：server/tools/web.js (get_current_time — 简单返回)
//          server/tools/leisure.js (play_music — 异步+复杂返回)

const { registerTool } = require('../services/tool-registry');
const llmsGen = require('../services/geo-llms-txt-generator');

// === 工具 1: generate_llms_txt ===
registerTool({
  name: 'generate_llms_txt',
  description: '为指定 URL 生成符合 llms.txt v2 规范的 Markdown 文件（AI 搜索引擎友好的网站摘要）。'
    + '当用户说"给 X 网站生成 llms.txt""让 X 网站 AI 友好""X 网站的 AI 摘要"等时使用。'
    + '返回生成的 llms.txt 完整内容 + 保存路径 + 字节数。',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '目标网站 URL（必填，含 http:// 或 https://）' },
      save: { type: 'boolean', description: '是否保存到 data/geo/llms-txt/ 目录（默认 true）', default: true },
      filename: { type: 'string', description: '自定义文件名（不含路径，默认 <domain>.txt）' },
    },
    required: ['url'],
  },
  pool: { domain: 'web', risk: 'read' },
  async handler(args) {
    const { url, save = true, filename = null } = args;
    if (!url || typeof url !== 'string') {
      return { ok: false, error: 'INVALID_URL', message: '必须提供 url 参数' };
    }
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, error: 'INVALID_URL', message: 'URL 必须以 http:// 或 https:// 开头' };
    }
    return llmsGen.generate(url, { save, filename });
  },
});

// === 工具 2: validate_llms_txt ===
registerTool({
  name: 'validate_llms_txt',
  description: '校验一段 Markdown 文本是否符合 llms.txt v2 规范（必须以 # Title 开头，可选 > Summary 和 ## Section）。'
    + '返回 errors/warnings 数组和结构统计。',
  parameters: {
    type: 'object',
    properties: {
      content: { type: 'string', description: '待校验的 llms.txt 文本（必填）' },
    },
    required: ['content'],
  },
  pool: { domain: 'web', risk: 'read' },
  async handler(args) {
    const { content } = args;
    if (!content || typeof content !== 'string') {
      return { ok: false, error: 'NO_CONTENT', message: '必须提供 content 参数' };
    }
    const errors = [];
    const warnings = [];

    const lines = content.split('\n');

    // 必填：第一行 # Title
    const firstLine = lines[0]?.trim() || '';
    if (!firstLine.startsWith('# ')) {
      errors.push({ line: 1, message: '第一行必须是 # Title（规范必填）' });
    }

    // 统计 H1/H2 数量
    let h1Count = 0;
    let h2Count = 0;
    let hasSummary = false;
    let hasOptional = false;
    for (const line of lines) {
      if (line.startsWith('# ') && !line.startsWith('## ')) h1Count++;
      else if (line.startsWith('## ')) {
        h2Count++;
        if (/^##\s+Optional\s*$/.test(line.trim())) hasOptional = true;
      } else if (line.startsWith('> ') && !hasSummary) {
        hasSummary = true;
      }
    }

    if (h1Count === 0) errors.push({ message: '没有 H1 标题' });
    if (h1Count > 1) warnings.push({ message: `检测到 ${h1Count} 个 H1，llms.txt 规范建议只有 1 个 # Title` });
    if (h2Count === 0) warnings.push({ message: '没有 H2 sections，建议至少 2 个' });

    // 字节数警告
    if (content.length > 100000) warnings.push({ message: `内容超过 100KB，llms.txt 建议 < 100KB（当前 ${content.length}）` });

    return {
      ok: true,
      valid: errors.length === 0,
      errors,
      warnings,
      stats: {
        bytes: content.length,
        lines: lines.length,
        h1_count: h1Count,
        h2_count: h2Count,
        has_summary: hasSummary,
        has_optional: hasOptional,
      },
    };
  },
});

console.log('[llms-txt-generator] 工具已注册: generate_llms_txt, validate_llms_txt');