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

// 简易 HTML 转义（服务端 PPTX 文本提取用）
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ExcelJS = require('exceljs');

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

    // v0.63: 写原始 OOXML
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

    // v0.63 Phase3: 写 JSON schema 供编辑器读取
    if (type === 'pptx' || type === 'xlsx') {
      const schemaData = body.data;
      // 检查是否有实际数据
      const hasData = type === 'pptx'
        ? (schemaData && schemaData.slides && Array.isArray(schemaData.slides) && schemaData.slides.length > 0)
        : (schemaData && schemaData.sheets && Array.isArray(schemaData.sheets));
      // 只有 schema 里有实际数据才写文件，
      // 避免文件浏览器传入二进制 base64 时生成空的 schema 导致 load 静默失败
      if (hasData) {
        const schemaFile = path.join(OFFICE_DIR, fileId + '.schema.json');
        fs.writeFileSync(schemaFile, JSON.stringify({ type: type, name: name, data: schemaData }));
      }
    }

    // v0.63 Phase3: 如果前端传了 schema（直接从编辑器 save 来的），存 schema
    if (body._schema && body._schema.data && body._schema.data.slides) {
      const schemaFile = path.join(OFFICE_DIR, fileId + '.schema.json');
      fs.writeFileSync(schemaFile, JSON.stringify(body._schema));
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

// ──────────── /load：根据 fileId 加载文件供编辑器打开（PR 5）────────────
// GET /api/office/load/:fileId?source=office|chat
//   source=office (默认) → 读 server/public/office/<fileId>.<ext>
//   source=chat           → 读 data/chat-uploads/<fileId>.<ext>
// 返回：{ ok, filename, content (base64), type, text (plain text 提取) }
router.get('/load/:fileId', async function (req, res) {
  try {
    var fileId = req.params.fileId;
    var source = (req.query.source || 'office').toString();
    var baseDir = source === 'chat'
      ? path.join(__dirname, '..', '..', 'data', 'chat-uploads')
      : OFFICE_DIR;
    var files = fs.readdirSync(baseDir);
    var match = files.find(function (f) { return f === fileId || f.startsWith(fileId + '.') || f.startsWith(fileId); });
    if (!match) return res.status(404).json({ error: 'FILE_NOT_FOUND', fileId: fileId, source: source });
    var filePath = path.join(baseDir, match);
    var buf = fs.readFileSync(filePath);
    var ext = (path.extname(match) || '').toLowerCase().replace(/^\./, '');
    var text = '';
    // docx 提取纯文本（简单实现：解 zip 读 word/document.xml，提取 w:t 内容）
    if (ext === 'docx') {
      try {
        var AdmZip = require('adm-zip');
        var zip = new AdmZip(buf);
        var docXml = zip.readAsText('word/document.xml');
        // 提取所有 <w:t>...</w:t> 内容，<w:p> 分段
        text = docXml
          .replace(/<\/w:p>/g, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      } catch (e) { text = '(docx 文本提取失败: ' + e.message + ')'; }
    } else if (ext === 'xlsx') {
      // v0.63 Phase3: 优先读 .schema.json（结构化数据）
      var schemaFile = filePath.replace('.' + ext, '.schema.json');
      if (fs.existsSync(schemaFile)) {
        try {
          var schemaJson = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
          // 只有 schema 有实际数据才返回 SCHEMA 格式
          if (schemaJson.data && schemaJson.data.sheets && Array.isArray(schemaJson.data.sheets)) {
            text = 'SCHEMA:' + JSON.stringify(schemaJson.data);
          } else {
            // 无数据 schema，尝试从二进制解析
            text = await parseXlsxToSchema(buf);
          }
        } catch (e) { text = '(schema 解析失败: ' + e.message + ')'; }
      } else {
        // 无 schema 文件，尝试从二进制解析
        text = await parseXlsxToSchema(buf);
      }
    } else if (ext === 'pptx') {
      // v0.67: 优先读 .schema.json（结构化数据）
      var schemaFile = filePath.replace('.' + ext, '.schema.json');
      if (fs.existsSync(schemaFile)) {
        try {
          var schemaJson = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
          if (schemaJson.data && schemaJson.data.slides && Array.isArray(schemaJson.data.slides)) {
            text = 'SCHEMA:' + JSON.stringify(schemaJson.data);
          } else {
            // 无数据 schema，尝试从二进制解析
            text = await parsePptxToSchema(buf);
          }
        } catch (e) { text = '(schema 解析失败: ' + e.message + ')'; }
      } else {
        // 无 schema：检测是否为旧版假 PPTX（JSON 格式）
        try {
          var strContent = buf.toString('utf8').trim();
          if (strContent.indexOf('{') === 0) {
            // 旧版假 PPTX（JSON 格式），尝试解析
            var oldData = JSON.parse(strContent);
            if (oldData.slides && Array.isArray(oldData.slides)) {
              text = 'SCHEMA:' + JSON.stringify({ slides: oldData.slides });
            } else {
              text = '(旧版 PPT 格式，请重新保存)';
            }
          } else {
            // 真正的 PPTX（ZIP 格式），从二进制提取文本和图像
            try {
              var AdmZip = require('adm-zip');
              var zip = new AdmZip(buf);
              var presXml = zip.readAsText('ppt/presentation.xml');
              // 提取所有图片（base64）
              var imageMap = {};
              var imageFiles = zip.getEntries().filter(function(e) {
                return e.entryName.match(/^ppt\/media\//) && e.entryName.match(/\.(png|jpg|jpeg|gif|bmp)$/i);
              });
              imageFiles.forEach(function(img) {
                var imgBuf = img.getData();
                var ext = img.entryName.replace(/.*\./, '').toLowerCase();
                var mimeType = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp' }[ext] || 'image/png';
                imageMap[img.entryName] = 'data:' + mimeType + ';base64,' + imgBuf.toString('base64');
              });
              // 找所有 slide id → 文件名映射
              var slideIds = presXml.match(/<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/);
              var ids = [];
              if (slideIds) {
                var idMatches = slideIds[1].match(/<p:sldId[^>]*\sr:id="rId(\d+)"/g);
                if (idMatches) ids = idMatches.map(function(m) { var n = m.match(/rId(\d+)/); return n ? parseInt(n[1]) : null; }).filter(Boolean);
              }
              // 找 rels 映射 rId → 文件名
              var relsXml = zip.readAsText('ppt/_rels/presentation.xml.rels') || '';
              var relMap = {};
              var relMatches = relsXml.match(/<Relationship[^>]*Id="(rId\d+)"[^>]*Target="([^"]*)"/g);
              if (relMatches) relMatches.forEach(function(r) {
                var id = r.match(/Id="(rId\d+)"/);
                var target = r.match(/Target="([^"]*)"/);
                if (id && target) relMap[id[1]] = target[1];
              });
              // 解析每页幻灯片
              var pptSlides = [];
              ids.forEach(function(rid) {
                var slideFile = relMap['rId' + rid];
                if (!slideFile) return;
                var slideXml = zip.readAsText('ppt/' + slideFile);
                if (!slideXml) return;
                // 提取标题和正文占位符文本
                var titleText = '';
                var bodyText = '';
                var layout = 'content';
                // 匹配 p:ph 占位符
                var phMatches = slideXml.match(/<p:sp><p:nvSpPr><p:cNvPr[^>]*name="([^"]*)"[^>]*\/><\/p:nvSpPr>([\s\S]*?)<\/p:sp>/g) || [];
                phMatches.forEach(function(sp) {
                  var nameMatch = sp.match(/p:cNvPr[^>]*name="([^"]*)"/);
                  var name = nameMatch ? nameMatch[1] : '';
                  var phMatch = sp.match(/<p:ph[^>]*type="([^"]*)"/);
                  var phType = phMatch ? phMatch[1] : '';
                  var innerText = sp.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                  if (phType === 'title' || name.indexOf('标题') >= 0 || name.indexOf('Title') >= 0) {
                    titleText = innerText;
                    layout = 'cover';
                  } else if (phType === 'body' || name.indexOf('正文') >= 0 || name.indexOf('Content') >= 0) {
                    bodyText = innerText;
                    layout = 'content';
                  } else if (!phType && !name) {
                    // 普通形状文本
                    if (bodyText) bodyText += '\n' + innerText;
                    else bodyText = innerText;
                  }
                });
                // 也提取不带 ph 标记的纯文本（fallback）
                if (!titleText && !bodyText) {
                  var allText = slideXml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
                  allText.forEach(function(t) {
                    var txt = t.replace(/<\/?a:t>/g, '');
                    if (txt.trim()) {
                      if (!titleText) titleText = txt;
                      else bodyText += '\n' + txt;
                    }
                  });
                }
                // 提取图片引用
                var slideRels = zip.readAsText('ppt/slides/_rels/' + slideFile + '.rels') || '';
                var imgRefs = [];
                var imgMatches = slideRels.match(/<Relationship[^>]*Id="(rId\d+)"[^>]*Target="(.*?\.(png|jpg|jpeg|gif|bmp))"/gi) || [];
                imgMatches.forEach(function(m) {
                  var rid = m.match(/Id="(rId\d+)"/);
                  var target = m.match(/Target="([^"]*)"/);
                  if (rid && target) {
                    var imgEntry = 'ppt/media/' + target[1].replace(/.*\//, '');
                    if (imageMap[imgEntry]) {
                      imgRefs.push({ rid: rid[1], src: imageMap[imgEntry] });
                    }
                  }
                });
                if (titleText || bodyText) {
                  pptSlides.push({
                    title: escHtml(titleText || '标题'),
                    content: escHtml(bodyText || ''),
                    layout: layout,
                    images: imgRefs
                  });
                }
              });
              if (pptSlides.length > 0) {
                text = 'SCHEMA:' + JSON.stringify({ slides: pptSlides });
              } else {
                text = '(PPTX 文本提取失败，请手动创建)';
              }
            } catch (e) { text = '(PPTX 解析失败: ' + e.message + ')'; }
          }
        } catch (e) { text = '(PPTX 解析失败: ' + e.message + ')'; }
        }
      } else {
        text = buf.toString('utf8');
      }
    res.json({
      ok: true,
      filename: match,
      source: source,
      ext: ext,
      size: buf.length,
      content: buf.toString('base64'),
      text: text.slice(0, 20000), // 截断避免巨大响应
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


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
  const fmt = b.attrs?.formatting || {};

  // 如果有块级格式，给所有 runs 添加格式
  const hasBlockFmt = fmt.bold || fmt.italic || fmt.underline || fmt.fontSize || fmt.fontFamily;

  let runs;
  if (hasBlockFmt) {
    runs = parseInlineFormatting(text, D, fmt);
  } else {
    runs = parseInlineFormatting(text, D);
  }

  const paraOpts = { children: runs, spacing: { after: 80 } };
  if (fmt.align) paraOpts.alignment = { type: fmt.align };

  if (b.type === 'heading') {
    const lv = Math.min(Math.max(b.attrs?.level || 1, 1), 6);
    const hl = [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
                HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6][lv];
    return new Paragraph(Object.assign(paraOpts, { heading: hl, spacing: { before: 200, after: 100 } }));
  }
  if (b.type === 'bulletList' || b.type === 'bullet') {
    return new Paragraph(Object.assign(paraOpts, { bullet: { level: 0 }, spacing: { after: 60 } }));
  }
  if (b.type === 'orderedList' || b.type === 'ordered') {
    return new Paragraph(Object.assign(paraOpts, { numbering: { reference: 'default-numbering', level: 0 }, spacing: { after: 60 } }));
  }
  if (b.type === 'quote' || b.type === 'blockquote') {
    return new Paragraph(Object.assign(paraOpts, { indent: { left: 720 }, spacing: { after: 120 } }));
  }
  if (b.type === 'code' || b.type === 'codeBlock') {
    return new Paragraph(Object.assign(paraOpts, {
      children: runs.map(function (r) { return new TextRun(Object.assign({}, r, { font: 'Consolas' })); }),
      spacing: { after: 100 },
    }));
  }
  return new Paragraph(paraOpts);
}

function parseInlineFormatting(text, D, blockFmt) {
  // 极简 markdown 行内：支持 **bold**、*italic*、`code`
  const { TextRun } = D;
  const runs = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      runs.push({ text: text.slice(last, m.index) });
    }
    const token = m[0];
    let opts = { text: '' };
    if (token.startsWith('**')) {
      opts.text = token.slice(2, -2);
      opts.bold = true;
    } else if (token.startsWith('`')) {
      opts.text = token.slice(1, -1);
      opts.font = 'Consolas';
    } else {
      opts.text = token.slice(1, -1);
      opts.italics = true;
    }
    // 应用块级格式
    if (blockFmt) {
      if (blockFmt.bold) opts.bold = true;
      if (blockFmt.italic) opts.italics = true;
      if (blockFmt.underline) opts.underline = {};
      if (blockFmt.fontSize) opts.size = blockFmt.fontSize * 2;
      if (blockFmt.fontFamily) {
        if (blockFmt.fontFamily === 'mono') opts.font = 'Consolas';
        else if (blockFmt.fontFamily === 'serif') opts.font = 'Georgia';
        else opts.font = 'Calibri';
      }
    }
    runs.push(opts);
    last = re.lastIndex;
  }
  if (last < text.length) {
    const opts = { text: text.slice(last) };
    if (blockFmt) {
      if (blockFmt.bold) opts.bold = true;
      if (blockFmt.italic) opts.italics = true;
      if (blockFmt.underline) opts.underline = {};
      if (blockFmt.fontSize) opts.size = blockFmt.fontSize * 2;
      if (blockFmt.fontFamily) {
        if (blockFmt.fontFamily === 'mono') opts.font = 'Consolas';
        else if (blockFmt.fontFamily === 'serif') opts.font = 'Georgia';
        else opts.font = 'Calibri';
      }
    }
    runs.push(opts);
  }
  if (runs.length === 0) {
    const opts = { text: text };
    if (blockFmt) {
      if (blockFmt.bold) opts.bold = true;
      if (blockFmt.italic) opts.italics = true;
      if (blockFmt.underline) opts.underline = {};
      if (blockFmt.fontSize) opts.size = blockFmt.fontSize * 2;
      if (blockFmt.fontFamily) {
        if (blockFmt.fontFamily === 'mono') opts.font = 'Consolas';
        else if (blockFmt.fontFamily === 'serif') opts.font = 'Georgia';
        else opts.font = 'Calibri';
      }
    }
    runs.push(opts);
  }
  // 转换为 TextRun 实例
  return runs.map(function(r) { return new TextRun(r); });
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
    // 标题
    var titleText = '';
    try {
      titleText = (s.title || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    } catch(e) { titleText = ''; }
    sl.addText(titleText || '', {
      x: 0.5, y: 0.4, w: 9, h: 0.8,
      fontSize: 24, bold: true, color: '1A1A1A',
    });
    // 内容
    var contentHtml = s.content || '';
    // 先渲染图片
    if (s.images && s.images.length > 0) {
      var imgHtml = '';
      s.images.forEach(function(img) {
        imgHtml += '<img src="' + img.src + '" style="max-width:400px;height:auto;margin:8px 0">';
      });
      contentHtml = imgHtml + contentHtml;
    }
    // 解析HTML内容
    var lines = [];
    // 简单解析：提取所有文本段落
    var tempDiv = contentHtml.replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, '[IMG:$1]');
    var tempDiv2 = tempDiv.replace(/<[^>]+>/g, '\n');
    lines = tempDiv2.split('\n').filter(function(l) { return l.trim(); });
    if (lines.length > 0) {
      sl.addText(lines.map(function(l) { return { text: l, options: { bullet: true } }; }), {
        x: 0.6, y: 1.4, w: 8.8, h: 5.5,
        fontSize: 16, color: '333333', paraSpaceAfter: 6,
      });
    }
    // 添加图片
    if (s.images && s.images.length > 0) {
      var imgX = 7.5;
      var imgY = 1.5;
      s.images.forEach(function(img, idx) {
        try {
          sl.addImage({
            data: img.src.split(',')[1],
            x: imgX,
            y: imgY + idx * 1.5,
            w: 2,
            h: 1.5
          });
        } catch(e) { /* 忽略图片添加错误 */ }
      });
    }
  }

  return await pres.write({ outputType: 'arraybuffer' }).then((b) => Buffer.from(b));
}

module.exports = router;

// ─────────── 解析 xlsx 二进制为 schema ───────────
async function parseXlsxToSchema(buf) {
  try {
    var workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);
    var sheets = [];
    workbook.eachSheet(function (worksheet, sheetId) {
      var headers = [];
      var rows = [];
      worksheet.eachRow(function (row, rowNumber) {
        var vals = [];
        row.eachCell(function (cell, colNumber) {
          vals.push(cell.value !== null && cell.value !== undefined ? cell.value : '');
        });
        if (rowNumber === 1) {
          headers = vals;
        } else {
          rows.push(vals);
        }
      });
      sheets.push({
        name: worksheet.name,
        headers: headers,
        rows: rows
      });
    });
    if (sheets.length > 0) {
      return 'SCHEMA:' + JSON.stringify({
        type: 'xlsx',
        sheets: sheets,
        rows: sheets[0].rows.length,
        cols: sheets[0].headers.length
      });
    }
  } catch (e) {
    return '(xlsx 解析失败: ' + e.message + ')';
  }
  return '(空 xlsx 文件)';
}

// ─────────── docx 解析为带格式 markdown ───────────
function parseDocxToMarkdown(xml) {
  // 提取所有段落
  const paragraphs = xml.match(/<w:p[^>]*>[\s\S]*?<\/w:p>/g) || [];
  const lines = [];
  
  for (const p of paragraphs) {
    // 检测段落样式（标题级别）
    const styleMatch = p.match(/w:pStyle w:val="([^"]+)"/);
    const style = styleMatch ? styleMatch[1] : '';
    
    // 提取文本 run（保留格式）
    const runs = p.match(/<w:r[^>]*>[\s\S]*?<\/w:r>/g) || [];
    let line = '';
    let isBold = false, isItalic = false;
    
    for (const run of runs) {
      // 检测 run 级格式
      const rPr = run.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
      if (rPr) {
        if (/<w:b[^\/]*\/>/i.test(rPr[1])) isBold = true;
        if (/<w:i[^\/]*\/>/i.test(rPr[1])) isItalic = true;
      }
      
      // 提取文本
      const textMatches = run.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
      for (const t of textMatches) {
        const text = t.replace(/<[^>]+>/g, '');
        let formatted = text;
        if (isBold) formatted = '**' + formatted + '**';
        if (isItalic) formatted = '*' + formatted + '*';
        line += formatted;
      }
    }
    
    // 根据样式添加 markdown 前缀
    if (style === 'Heading1' || style === 'Title') {
      lines.push('# ' + line.trim());
    } else if (style === 'Heading2') {
      lines.push('## ' + line.trim());
    } else if (style === 'Heading3') {
      lines.push('### ' + line.trim());
    } else if (style === 'Heading4') {
      lines.push('#### ' + line.trim());
    } else if (style === 'Heading5') {
      lines.push('##### ' + line.trim());
    } else if (style === 'Heading6') {
      lines.push('###### ' + line.trim());
    } else if (style === 'Code') {
      lines.push('```
' + line.trim() + '
```');
    } else if (style === 'Quote') {
      lines.push('> ' + line.trim());
    } else {
      lines.push(line.trim());
    }
  }
  
  // 清理空行
  return lines.filter(l => l.trim()).join('

');
}
