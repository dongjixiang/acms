// Word 文档导出服务（v0.8）
// 1. 提取 AI brief 内容
// 2. 调用 LLM 优化格式
// 3. 生成 .docx 文件返回
const { callLLMWithRetry } = require('./json-extractor');
const modelStore = require('../stores/model-store');
const reqStore = require('../stores/requirement-store');
const docx = require('docx');
const fs = require('fs');
const path = require('path');
const os = require('os');

const OPTIMIZE_PROMPT = `你是一个文档排版助手。用户给你一段 AI 与用户的产品需求对话记录（含 AI 的理解、开场、追问），请你把它整理成一份**结构清晰、语言专业**的 Word 文档。

## 要求
1. **提炼标题**：根据内容提炼一个简短的文档标题（如"需求分析报告：XX"或"AI 需求解读"）
2. **分段呈现**：
   - 如果内容包含"理解/分析"部分 → 作为独立的"AI 分析"段落
   - 如果内容包含"开场/回答"部分 → 作为"讨论纪要"段落
   - 如果内容包含"追问"部分 → 作为"待确认问题"段落
3. **语言风格**：保留原意的同时，让文字更连贯、专业、易读。不要增删实质内容。
4. **格式要求**：使用丰富的 Markdown 格式，导出时会完整保留格式：
   - 标题用 # / ## / ###（一级/二级/三级标题）
   - 关键术语和重要概念用 **粗体** 强调
   - 专业名词、字段名用 \`行内代码\`
   - 并列项用 - 无序列表
   - 有顺序的步骤用 1. 有序列表
   - 引用用户原话用 > 引用块
   - 代码或配置示例用 \`\`\` 代码块
   - 有对照关系的数据用 | 表格 | 呈现
   - 分隔段落用 --- 分隔线

## 输出格式
{
  "title": "文档标题（≈15字）",
  "content": "优化后的 Markdown 正文（使用上述丰富的 Markdown 格式）"
}

输出严格 JSON，不要额外文字。`;

function pickDefaultLlm() {
  const defaultGen = modelStore.getDefaultGenModel();
  if (defaultGen) return defaultGen;
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0] || null;
}

/**
 * 解析行内 Markdown 格式 → TextRun 数组
 * 支持: **粗体** *斜体* `行内代码` ~~删除线~~ [链接](url)
 */
function parseInlineText(text) {
  const { TextRun, ExternalHyperlink } = docx;
  const runs = [];
  // 顺序匹配：`` `code` ``  |  **[text](url)**  |  **bold**  |  *italic*  |  `code`  |  ~~strike~~  |  [text](url)
  const regex = /(``.+?``|`[^`]+`|\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;

  const addText = (from, to) => {
    const plain = text.slice(from, to);
    if (plain) runs.push(new TextRun({ text: plain, size: 22 }));
  };

  let m;
  while ((m = regex.exec(text)) !== null) {
    addText(lastIndex, m.index);
    const full = m[0];
    if (full.startsWith('`')) {
      // 行内代码（单反引号或双反引号）
      const codeText = full.replace(/^``?|``?$/g, '');
      runs.push(new TextRun({ text: codeText, font: 'Consolas', size: 20, color: '333333', shading: { type: docx.ShadingType.CLEAR, fill: 'F5F5F5' } }));
    } else if (full.startsWith('**')) {
      // 粗体
      runs.push(new TextRun({ text: m[2], bold: true, size: 22 }));
    } else if (full.startsWith('*')) {
      // 斜体
      runs.push(new TextRun({ text: m[3], italics: true, size: 22 }));
    } else if (full.startsWith('~~')) {
      // 删除线
      runs.push(new TextRun({ text: m[4], strike: true, size: 22 }));
    } else if (full.startsWith('[')) {
      // 链接
      runs.push(
        new TextRun({
          children: [new docx.InternalHyperlink({ children: [new TextRun({ text: m[5], style: 'Hyperlink', size: 22 })], anchor: m[6] })],
        })
      );
    }
    lastIndex = regex.lastIndex;
  }
  addText(lastIndex, text.length);
  return runs;
}

/**
 * 解析 Markdown → docx 段落/表格数组
 * 完整支持: 标题(H1-H3)、段落、粗体/斜体/行内代码/删除线/链接、列表、代码块、引用、分隔线、表格
 */
function mdToDocx(markdown) {
  const { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } = docx;
  const children = [];
  const lines = markdown.split('\n');
  let inCodeBlock = false;
  let codeBuffer = [];
  let inTable = false;
  let tableRows = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // === 代码块（```）===
    if (/^```/.test(trimmed)) {
      if (inCodeBlock) {
        // 代码块结束
        const codeText = codeBuffer.join('\n');
        children.push(
          new Paragraph({
            spacing: { before: 100, after: 100 },
            indent: { left: 300 },
            shading: { type: docx.ShadingType.CLEAR, fill: 'F5F5F5' },
            children: codeBuffer.map((line, idx) =>
              new TextRun({ text: (idx > 0 ? '\n' : '') + line, font: 'Consolas', size: 18, color: '444444' })
            ),
          })
        );
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeBuffer = [];
      }
      continue;
    }
    if (inCodeBlock) {
      codeBuffer.push(raw);
      continue;
    }

    // === 表格（| col1 | col2 |）===
    if (/^\|.+\|$/.test(trimmed) && trimmed.includes('|', 1)) {
      // 跳过对齐行（---|---|---）
      if (/^\|[\s:-]+\|[\s:-]/.test(trimmed)) continue;
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      const cells = trimmed.split('|').filter(c => c.trim()).map(c => c.trim());
      tableRows.push(
        new TableRow({
          children: cells.map(cellText =>
            new TableCell({
              children: [new Paragraph({ children: parseInlineText(cellText), spacing: { after: 40 } })],
            })
          ),
        })
      );
      continue;
    } else {
      if (inTable && tableRows.length > 0) {
        // 结束表格
        children.push(
          new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          })
        );
        children.push(new Paragraph({ spacing: { after: 120 } }));
        inTable = false;
        tableRows = [];
      }
    }

    // === 分隔线 ===
    if (/^[-*_]{3,}\s*$/.test(trimmed)) {
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 200 },
          borders: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999' } },
        })
      );
      continue;
    }

    // === 空行 ===
    if (!trimmed) {
      children.push(new Paragraph({ spacing: { after: 100 } }));
      continue;
    }

    // === 引用 > ===
    if (trimmed.startsWith('> ')) {
      const quoteText = trimmed.replace(/^>\s*/, '');
      children.push(
        new Paragraph({
          indent: { left: 400 },
          spacing: { before: 60, after: 60 },
          shading: { type: docx.ShadingType.CLEAR, fill: 'F0F4FF' },
          children: parseInlineText(quoteText),
        })
      );
      continue;
    }

    // === 标题 ===
    let headingLevel = null;
    let headingText = trimmed;
    if (trimmed.startsWith('### ')) { headingLevel = HeadingLevel.HEADING_3; headingText = trimmed.slice(4); }
    else if (trimmed.startsWith('## ')) { headingLevel = HeadingLevel.HEADING_2; headingText = trimmed.slice(3); }
    else if (trimmed.startsWith('# ')) { headingLevel = HeadingLevel.HEADING_1; headingText = trimmed.slice(2); }

    if (headingLevel) {
      children.push(
        new Paragraph({
          children: parseInlineText(headingText),
          heading: headingLevel,
          spacing: { before: 300, after: 150 },
        })
      );
      continue;
    }

    // === 无序列表 ===
    if (/^[-*+]\s/.test(trimmed)) {
      const listText = trimmed.replace(/^[-*+]\s+/, '');
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: '•  ', bold: false, size: 22 }),
            ...parseInlineText(listText),
          ],
          spacing: { after: 60 },
          indent: { left: 400, hanging: 200 },
        })
      );
      continue;
    }

    // === 有序列表 ===
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (orderedMatch) {
      const num = orderedMatch[1];
      const listText = orderedMatch[2];
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${num}. `, bold: false, size: 22 }),
            ...parseInlineText(listText),
          ],
          spacing: { after: 60 },
          indent: { left: 400, hanging: 200 },
        })
      );
      continue;
    }

    // === 普通段落 ===
    children.push(
      new Paragraph({
        children: parseInlineText(trimmed),
        spacing: { after: 120 },
      })
    );
  }

  // 未闭合的代码块
  if (inCodeBlock && codeBuffer.length > 0) {
    children.push(
      new Paragraph({
        spacing: { before: 100, after: 100 },
        indent: { left: 300 },
        shading: { type: docx.ShadingType.CLEAR, fill: 'F5F5F5' },
        children: codeBuffer.map((line, idx) =>
          new TextRun({ text: (idx > 0 ? '\n' : '') + line, font: 'Consolas', size: 18, color: '444444' })
        ),
      })
    );
  }

  // 未闭合的表格
  if (inTable && tableRows.length > 0) {
    children.push(
      new Table({
        rows: tableRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      })
    );
  }

  return children;
}

/**
 * 生成 .docx 文件临时路径
 */
function buildDocx(title, markdownContent) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;

  const children = mdToDocx(markdownContent);

  const doc = new Document({
    title: title || '需求分析',
    description: 'ACMS 导出',
    styles: {
      default: {
        document: {
          run: { size: 22, font: 'Microsoft YaHei' },
          paragraph: { spacing: { after: 120 } },
        },
      },
    },
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return doc;
}

/**
 * 导出指定 chat_round 的 brief 为 Word 文档
 * @param {string} requirementId
 * @param {object} opts
 * @param {number} [opts.chatRound] - 指定轮次，默认最新
 * @param {string} [opts.modelId] - 优化用模型
 * @returns {Promise<{filePath: string, fileName: string}>}
 */
async function exportBriefToWord(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) throw new Error('REQ_NOT_FOUND');

  let brief;
  try {
    brief = JSON.parse(req.thinking_brief || 'null');
  } catch { brief = null; }
  if (!brief || brief.status !== 'done') throw new Error('BRIEF_NOT_READY');

  // 1. 组装源内容
  const sourceParts = [];
  if (brief.opening) sourceParts.push(`【AI 回复】\n${brief.opening}`);
  if (brief.ai_understanding) sourceParts.push(`【AI 理解】\n${brief.ai_understanding}`);
  if (brief.followup_question) sourceParts.push(`【追问】\n${brief.followup_question}`);
  const sourceText = sourceParts.join('\n\n');

  if (!sourceText.trim()) throw new Error('BRIEF_EMPTY');

  // 2. LLM 优化格式
  const model = opts.modelId ? modelStore.getById(opts.modelId) : pickDefaultLlm();
  let title = '需求分析报告';
  let optimizedContent = sourceText;

  if (model) {
    try {
      const messages = [
        { role: 'system', content: OPTIMIZE_PROMPT },
        { role: 'user', content: `以下是要优化的 AI 回复内容：\n\n${sourceText}` },
      ];
      const parsed = await callLLMWithRetry(model, messages, {
        temperature: 0.3, maxTokens: 2000, jsonMode: true, serviceName: 'export:optimize',
      });
      if (parsed && parsed.title) title = parsed.title;
      if (parsed && parsed.content) optimizedContent = parsed.content;
    } catch (e) {
      console.warn(`[word-export] LLM 优化失败，使用原始内容: ${e.message}`);
    }
  }

  // 3. 生成 .docx
  const doc = buildDocx(title, optimizedContent);
  const tmpDir = os.tmpdir();
  const safeName = (req.title || '需求')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 40);
  const fileName = `${safeName}_AI回复_${new Date().toISOString().slice(0, 10)}.docx`;
  const filePath = path.join(tmpDir, fileName);

  const buffer = await docx.Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);

  return { filePath, fileName };
}

module.exports = { exportBriefToWord };
