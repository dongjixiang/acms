// ACMS Office 文档编辑工具（v0.62.4 PR 5）
// 位置：server/tools/document-edit.js
//
// 作用：让 LLM 在 plan_execute 流程里增量修改现有 .docx
// 协议：
//   fileId  可选 — 已有文件则覆盖，无则新建
//   content 必填 — 完整的 markdown 文本（覆盖全文）
//   name    可选 — 文件名
//
// 流程：markdown → writeDocx（自带逻辑）→ 写盘
// 返回：{ ok, fileId, url, size, message }

const { registerTool } = require('../services/tool-registry');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const OFFICE_DIR = path.join(__dirname, '..', 'public', 'office');
if (!fs.existsSync(OFFICE_DIR)) fs.mkdirSync(OFFICE_DIR, { recursive: true });

// markdown → docx Buffer（自包含，复制 office-gen 的逻辑避免循环依赖）
async function writeDocxFromMd(content, name) {
  const D = require('docx');
  const children = [];
  const lines = String(content || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { children.push(new D.Paragraph({ spacing: { after: 100 } })); continue; }
    const h = t.match(/^(#{1,6})\s+(.+)/);
    if (h) {
      const lv = h[1].length;
      const hl = [null, D.HeadingLevel.HEADING_1, D.HeadingLevel.HEADING_2, D.HeadingLevel.HEADING_3][lv] || D.HeadingLevel.HEADING_1;
      children.push(new D.Paragraph({ text: h[2], heading: hl, spacing: { before: 200, after: 100 } }));
      continue;
    }
    const li = t.match(/^[-*]\s+(.+)/);
    if (li) {
      children.push(new D.Paragraph({ spacing: { after: 60 }, bullet: { level: 0 }, children: [new D.TextRun(li[1])] }));
      continue;
    }
    children.push(new D.Paragraph({ spacing: { after: 80 }, children: [new D.TextRun(t)] }));
  }
  const doc = new D.Document({
    creator: 'ACMS',
    title: (name || 'untitled').replace(/\.docx$/, ''),
    sections: [{ children: children.length > 0 ? children : [new D.Paragraph({ children: [new D.TextRun('')] })] }],
  });
  return await D.Packer.toBuffer(doc);
}

registerTool({
  name: 'document_edit',
  description: '增量修改或新建 .docx 文档。\n' +
    '输入 fileId（已有文档）+ markdown 内容覆写，或不传 fileId（新建）。\n' +
    '示例 1（修改已有）：document_edit({ fileId: "abc-123.docx", content: "# 新标题\\n\\n新的正文" })\n' +
    '示例 2（新建）：document_edit({ name: "报告", content: "# 报告\\n\\n..." })',
  parameters: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: '已有 .docx 的 fileId（可选）。给则覆盖，不给则新建' },
      content: { type: 'string', description: '完整的新内容（Markdown 格式，支持 # 标题、**加粗**、- 列表）' },
      name: { type: 'string', description: '文件名（新建时必填；如 abc-123.docx 可省略后缀）' },
    },
    required: ['content'],
  },
  async handler(args) {
    try {
      const content = args.content || '';
      let name = args.name || '';
      let fileId = args.fileId || '';

      if (fileId) {
        // 验证 fileId：必须存在
        let existingPath = path.join(OFFICE_DIR, fileId);
        if (!fs.existsSync(existingPath)) {
          // 兼容不带后缀的 fileId
          const matches = fs.readdirSync(OFFICE_DIR).filter((f) => f.startsWith(fileId));
          if (matches.length === 0) {
            return { ok: false, error: 'FILE_NOT_FOUND', fileId, message: 'fileId 不存在：' + fileId };
          }
          fileId = matches[0];
        }
      } else {
        // 新建
        if (!name) name = 'untitled.docx';
        if (!name.toLowerCase().endsWith('.docx')) name += '.docx';
        fileId = uuidv4() + '.docx';
      }

      const filePath = path.join(OFFICE_DIR, fileId);
      const buffer = await writeDocxFromMd(content, name);
      fs.writeFileSync(filePath, buffer);

      const displayName = name || fileId;
      return {
        ok: true,
        fileId,
        name: displayName,
        url: '/api/office/download/' + fileId + '/' + encodeURIComponent(displayName),
        size: buffer.length,
        message: args.fileId ? '已更新' : '已新建',
      };
    } catch (e) {
      return { ok: false, error: 'EDIT_FAILED', message: e.message };
    }
  },
});
