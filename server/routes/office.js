// ACMS Office 文件路由 — 保存/读取/下载 Office 文档
// v0.62 重写 /save 端点：之前是写 JSON 后缀 .docx 的假文件
// 现在按 type 调用 docx / exceljs / pptxgenjs 写真 OOXML，Office/WPS 能正常打开
//
// 协议：
// POST /api/office/save
//   Body: { type: 'docx'|'xlsx'|'pptx', name, content?: string(base64) | data?: object }
//     - 走 docx/exceljs/pptxgenjs 标准 schema（content 或 data 二选一）
//     - 旧前端传 { html, text } 字符串也能兼容（fallback 到 generate_docx 走 markdown）
//   响应: { ok, fileId, fileName, path, size }
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const OFFICE_DIR = path.join(__dirname, '..', 'public', 'office');
if (!fs.existsSync(OFFICE_DIR)) fs.mkdirSync(OFFICE_DIR, { recursive: true });

const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

// ─────────── /save 写真 OOXML ───────────
router.post('/save', async function (req, res) {
  try {
    const body = req.body || {};
    const type = (body.type || 'docx').replace('.', '');
    const name = body.name || ('untitled.' + type);
    const fileId = uuidv4();
    const fileName = fileId + '.' + type;
    const filePath = path.join(OFFICE_DIR, fileName);

    // 1) 前端直传 base64 内容（最直接）
    if (body.content && typeof body.content === 'string') {
      const buf = Buffer.from(body.content, 'base64');
      if (buf.length < 4) throw new Error('content too short');
      fs.writeFileSync(filePath, buf);
    }
    // 2) 按 type 调对应库写 OOXML
    else if (type === 'docx') {
      const buffer = await writeDocx(body);
      fs.writeFileSync(filePath, buffer);
    } else if (type === 'xlsx') {
      const buffer = await writeXlsx(body);
      fs.writeFileSync(filePath, buffer);
    } else if (type === 'pptx') {
      const buffer = await writePptx(body);
      fs.writeFileSync(filePath, buffer);
    } else {
      return res.status(400).json({ error: 'UNSUPPORTED_TYPE', type });
    }

    res.json({
      ok: true,
      fileId,
      fileName: name,
      path: '/api/office/download/' + fileId + '/' + encodeURIComponent(name),
      size: fs.statSync(filePath).size,
    });
  } catch (e) {
    console.error('[office/save] failed:', e);
    res.status(500).json({ error: e.message, stack: e.stack?.slice(0, 300) });
  }
});

// ─────────── /read：原样返回 base64（前端自行解析） ───────────
router.get('/read/:fileId', function (req, res) {
  try {
    const files = fs.readdirSync(OFFICE_DIR);
    const match = files.find((f) => f.startsWith(req.params.fileId));
    if (!match) return res.status(404).json({ error: 'FILE_NOT_FOUND' });

    const filePath = path.join(OFFICE_DIR, match);
    const content = fs.readFileSync(filePath);
    res.json({
      ok: true,
      fileName: match,
      content: content.toString('base64'),
      size: content.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────── /download：流式下载（带 Content-Type） ───────────
router.get('/download/:fileId/:name', function (req, res) {
  const files = fs.readdirSync(OFFICE_DIR);
  const match = files.find((f) => f.startsWith(req.params.fileId));
  if (!match) return res.status(404).json({ error: 'FILE_NOT_FOUND' });

  const ext = path.extname(match).slice(1);
  // v0.62 顺手修 header 注入：filename 用 encodeURIComponent + 引号包住
  const safeName = encodeURIComponent(req.params.name);
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeName}`);
  res.sendFile(path.join(OFFICE_DIR, match));
});

// ═══════════════════════════════════════════════
// 写 OOXML 的三个辅助函数
// 全部用 npm 标准库：docx / exceljs / pptxgenjs
// 兼容前端老 payload：{ html, text } → 当 markdown 处理
// ═══════════════════════════════════════════════

async function writeDocx(body) {
  const docxLib = require('docx');
  const D = docxLib;
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = D;

  // 三种输入兼容：
  //  A. body.data.content 是 markdown 字符串（旧 Quill → text）
  //  B. body.data.blocks 是结构化数组（新 Block schema，每个 {type, content, level?, ...}）
  //  C. body.content 是 base64（已生成的 docx 二进制）— /save 第一分支处理
  const blocks = body.data?.blocks;
  const mdText = body.data?.content || body.data?.text || body.html || '';

  let children = [];

  if (Array.isArray(blocks) && blocks.length > 0) {
    // 新 Block schema 路径
    for (const b of blocks) {
      children.push(blockToParagraph(b, D));
    }
  } else if (mdText) {
    // Markdown 文本路径（兼容旧前端 payload）
    children = markdownToParagraphs(mdText, D);
  } else {
    // 空文档
    children = [new Paragraph({ children: [new TextRun('')] })];
  }

  const doc = new Document({
    creator: 'ACMS',
    title: body.name || 'untitled',
    sections: [{ children }],
  });
  return await Packer.toBuffer(doc);
}

function blockToParagraph(b, D) {
  const { Paragraph, TextRun, HeadingLevel, AlignmentType } = D;
  const text = String(b.content || b.text || '');
  const runs = parseInlineFormatting(text, D);

  if (b.type === 'heading') {
    const lv = Math.min(Math.max(b.level || 1, 1), 6);
    const hl = [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
                HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6][lv];
    return new Paragraph({ heading: hl, children: runs, spacing: { before: 200, after: 100 } });
  }
  if (b.type === 'bulletList' || b.type === 'bullet') {
    return new Paragraph({ bullet: { level: 0 }, children: runs, spacing: { after: 60 } });
  }
  if (b.type === 'orderedList' || b.type === 'ordered') {
    return new Paragraph({ numbering: { reference: 'default-numbering', level: 0 }, children: runs, spacing: { after: 60 } });
  }
  if (b.type === 'quote' || b.type === 'blockquote') {
    return new Paragraph({ indent: { left: 720 }, children: runs, spacing: { after: 120 } });
  }
  if (b.type === 'code' || b.type === 'codeBlock') {
    return new Paragraph({
      children: runs.map((r) => new TextRun({ text: r.text || '', font: 'Consolas' })),
      spacing: { after: 100 },
    });
  }
  // 默认 paragraph
  return new Paragraph({ children: runs, spacing: { after: 80 } });
}

function parseInlineFormatting(text, D) {
  // 极简 markdown 行内：支持 **bold**、*italic*、`code`
  const { TextRun } = D;
  const runs = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      runs.push(new TextRun({ text: text.slice(last, m.index) }));
    }
    const token = m[0];
    if (token.startsWith('**')) {
      runs.push(new TextRun({ text: token.slice(2, -2), bold: true }));
    } else if (token.startsWith('`')) {
      runs.push(new TextRun({ text: token.slice(1, -1), font: 'Consolas' }));
    } else {
      runs.push(new TextRun({ text: token.slice(1, -1), italics: true }));
    }
    last = re.lastIndex;
  }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last) }));
  if (runs.length === 0) runs.push(new TextRun({ text }));
  return runs;
}

function markdownToParagraphs(md, D) {
  const { Paragraph, TextRun, HeadingLevel } = D;
  const lines = String(md).split('\n');
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      out.push(new Paragraph({ spacing: { after: 100 } }));
      continue;
    }
    const h = t.match(/^(#{1,6})\s+(.+)/);
    if (h) {
      const lv = h[1].length;
      const hl = [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
                  HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6][lv] || HeadingLevel.HEADING_1;
      out.push(new Paragraph({ heading: hl, children: parseInlineFormatting(h[2], D), spacing: { before: 200, after: 100 } }));
      continue;
    }
    const li = t.match(/^[-*]\s+(.+)/);
    if (li) {
      out.push(new Paragraph({ bullet: { level: 0 }, children: parseInlineFormatting(li[1], D), spacing: { after: 60 } }));
      continue;
    }
    out.push(new Paragraph({ children: parseInlineFormatting(t, D), spacing: { after: 80 } }));
  }
  return out;
}

async function writeXlsx(body) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ACMS';
  wb.created = new Date();

  const data = body.data || {};
  const sheets = data.sheets || [{ name: data.title || 'Sheet1', headers: data.headers, rows: data.rows }];

  for (const s of sheets) {
    const ws = wb.addWorksheet((s.name || 'Sheet1').slice(0, 31));
    if (Array.isArray(s.headers) && s.headers.length) {
      ws.addRow(s.headers);
      // 表头加粗 + 背景
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B8C5A' } };
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    }
    if (Array.isArray(s.rows)) {
      for (const r of s.rows) {
        ws.addRow(Array.isArray(r) ? r : [r]);
      }
    }
    // 列宽自适应
    ws.columns?.forEach((c) => {
      let max = 8;
      c.eachCell({ includeEmpty: false }, (cell) => {
        const v = String(cell.value ?? '');
        if (v.length > max) max = Math.min(v.length + 2, 50);
      });
      c.width = max;
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function writePptx(body) {
  const PptxGenJS = require('pptxgenjs');
  const pres = new PptxGenJS();
  pres.author = 'ACMS';
  pres.title = body.name || 'untitled';

  const data = body.data || {};
  const slides = data.slides || [];

  // 封面
  const cover = pres.addSlide();
  cover.background = { color: 'FFFFFF' };
  cover.addText(data.title || body.name || '演示文稿', {
    x: 0.5, y: 1.5, w: 9, h: 1.5,
    fontSize: 36, bold: true, color: '1A1A1A', align: 'center',
  });
  if (slides.length) {
    cover.addText(`${slides.length} 页`, {
      x: 0.5, y: 4, w: 9, h: 0.5,
      fontSize: 14, color: '999999', align: 'center',
    });
  }

  for (const s of slides) {
    const sl = pres.addSlide();
    sl.background = { color: 'FFFFFF' };
    sl.addText(s.title || '', {
      x: 0.5, y: 0.4, w: 9, h: 0.8,
      fontSize: 24, bold: true, color: '1A1A1A',
    });
    if (s.content) {
      // content 可能是字符串，也可能是 bullets 数组
      const lines = Array.isArray(s.content)
        ? s.content
        : String(s.content).split('\n').filter(Boolean);
      sl.addText(lines.map((l) => ({ text: l, options: { bullet: true } })), {
        x: 0.6, y: 1.4, w: 8.8, h: 5.5,
        fontSize: 16, color: '333333', paraSpaceAfter: 6,
      });
    }
  }

  return await pres.write({ outputType: 'arraybuffer' }).then((b) => Buffer.from(b));
}

module.exports = router;
