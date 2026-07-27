// ACMS Office 文档生成工具 — Word / Excel / PowerPoint
const { registerTool } = require('../services/tool-registry');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const AdmZip = require('adm-zip');

var GENERATE_DIR = path.join(__dirname, '..', 'public', 'generate', 'assets');
if (!fs.existsSync(GENERATE_DIR)) fs.mkdirSync(GENERATE_DIR, { recursive: true });

function saveFile(ext, buffer) {
  var id = uuidv4();
  var fileName = id + '.' + ext;
  var filePath = path.join(GENERATE_DIR, fileName);
  fs.writeFileSync(filePath, buffer);
  return { id: id, url: '/api/generate/assets/' + fileName, path: filePath };
}

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ═══════════════════════════════════════════════════════════
// generate_docx — 生成 Word 文档
// ═══════════════════════════════════════════════════════════
registerTool({
  name: 'generate_docx',
  description: '生成 Word (.docx) 文档。接收 markdown 格式内容，转成格式化的 Word 文档。'
    + '支持标题、段落、列表、表格、加粗。'
    + '示例: generate_docx({title: "报告", content: "# 标题\\n\\n正文"})',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '文档标题（必填）' },
      content: { type: 'string', description: '文档内容（Markdown 格式）。支持 # 标题、**加粗**、- 列表、| 表格 |' },
    },
    required: ['title', 'content'],
  },
  async handler(args) {
    try {
      var title = (args.title || '文档').trim();
      var content = args.content || '';
      var docx = require('docx');
      var d = docx;

      var children = [];
      var lines = content.split('\n');
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var t = line.trim();
        if (!t) { children.push(new d.Paragraph({ spacing: { after: 100 } })); continue; }

        var h = t.match(/^(#{1,6})\s+(.+)/);
        if (h) {
          var lv = h[1].length;
          var hl = [null, d.HeadingLevel.HEADING_1, d.HeadingLevel.HEADING_2, d.HeadingLevel.HEADING_3][lv] || d.HeadingLevel.HEADING_1;
          children.push(new d.Paragraph({ text: h[2], heading: hl, spacing: { before: 200, after: 100 } }));
          continue;
        }
        var li = t.match(/^[\-\*]\s+(.+)/);
        if (li) { children.push(new d.Paragraph({ spacing: { after: 60 }, bullet: { level: 0 }, children: [new d.TextRun(li[1])] })); continue; }
        children.push(new d.Paragraph({ spacing: { after: 80 }, children: [new d.TextRun(t)] }));
      }

      var doc = new d.Document({ title: title, sections: [{ children: children }] });
      var buffer = await d.Packer.toBuffer(doc);
      var file = saveFile('docx', buffer);
      return { ok: true, title: title, url: file.url, fileId: file.id, size: buffer.length, message: '文档已生成' };
    } catch (e) {
      return { ok: false, error: 'DOCX_FAILED', message: e.message };
    }
  },
});

// ═══════════════════════════════════════════════════════════
// generate_xlsx — 生成 Excel 表格（手动构建 XLSX XML）
// ═══════════════════════════════════════════════════════════
registerTool({
  name: 'generate_xlsx',
  description: '生成 Excel (.xlsx) 表格。接收表头和行数据。'
    + '示例: generate_xlsx({title: "任务列表", headers: ["ID","名称"], rows: [["T-001","测试"]]})',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '工作表名（必填），如 "任务列表"' },
      headers: { type: 'array', description: '表头数组', items: { type: 'string' } },
      rows: { type: 'array', description: '数据行，每行是字符串数组', items: { type: 'array', items: { type: 'string' } } },
    },
    required: ['title', 'headers', 'rows'],
  },
  async handler(args) {
    try {
      var sheetName = (args.title || 'Sheet1').trim().slice(0, 31);
      var headers = Array.isArray(args.headers) ? args.headers : [];
      var rows = Array.isArray(args.rows) ? args.rows : [];
      if (headers.length === 0) return { ok: false, error: 'NO_HEADERS' };
      var colCount = headers.length;
      var rowCount = rows.length;

      var zip = new AdmZip();
      var srId = 1; // shared strings ID counter
      var ssItems = [];
      var ssMap = {};

      function ss(val) {
        var s = String(val);
        if (ssMap[s] !== undefined) return ssMap[s];
        ssMap[s] = srId;
        ssItems.push(s);
        srId++;
        return ssMap[s];
      }

      // 预注册所有字符串
      headers.forEach(function(h) { ss(h); });
      rows.forEach(function(r) { for (var c = 0; c < Math.min(r.length, colCount); c++) ss(r[c]); });

      function cellRef(r, c) { return String.fromCharCode(65 + c) + r; }

      // sheet1.xml
      var sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
      // 表头行
      sheetXml += '<row r="1">';
      headers.forEach(function(h, ci) {
        sheetXml += '<c r="' + cellRef(1, ci) + '" t="s"><v>' + ssMap[String(h)] + '</v></c>';
      });
      sheetXml += '</row>';
      // 数据行
      rows.forEach(function(r, ri) {
        sheetXml += '<row r="' + (ri + 2) + '">';
        for (var ci = 0; ci < Math.min(r.length, colCount); ci++) {
          sheetXml += '<c r="' + cellRef(ri + 2, ci) + '" t="s"><v>' + ssMap[String(r[ci])] + '</v></c>';
        }
        sheetXml += '</row>';
      });
      sheetXml += '</sheetData></worksheet>';

      // sharedStrings.xml
      var ssXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + ssItems.length + '" uniqueCount="' + ssItems.length + '">';
      ssItems.forEach(function(s) { ssXml += '<si><t>' + escXml(s) + '</t></si>'; });
      ssXml += '</sst>';

      // 组装 ZIP
      zip.addFile('[Content_Types].xml', Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>'
      ));
      zip.addFile('_rels/.rels', Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
      ));
      zip.addFile('xl/_rels/workbook.xml.rels', Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
      ));
      zip.addFile('xl/workbook.xml', Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + escXml(sheetName) + '" sheetId="1" r:id="rId1"/></sheets></workbook>'
      ));
      zip.addFile('xl/worksheets/sheet1.xml', Buffer.from(sheetXml));
      zip.addFile('xl/sharedStrings.xml', Buffer.from(ssXml));
      zip.addFile('xl/styles.xml', Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>'
      ));

      var buffer = zip.toBuffer();
      var file = saveFile('xlsx', buffer);
      return { ok: true, title: sheetName, url: file.url, fileId: file.id, size: buffer.length, rows: rowCount, cols: colCount, message: '表格已生成' };
    } catch (e) {
      return { ok: false, error: 'XLSX_FAILED', message: e.message };
    }
  },
});

// ═══════════════════════════════════════════════════════════
// generate_pptx — 生成 PowerPoint 演示文稿（手动构建 PPTX XML）
// ═══════════════════════════════════════════════════════════
registerTool({
  name: 'generate_pptx',
  description: '生成 PowerPoint (.pptx) 演示文稿。接收幻灯片数组，每页含标题和正文。'
    + '示例: generate_pptx({title: "项目汇报", slides: [{title:"概述", content:"进展顺利"}]})'
    + '【注意：参数是 slides（幻灯片数组），不是 instruction。instruction 是 document_gen 的参数，不要混用。'
    + '即使从搜索结果生成 PPT，也必须自己组织 slides 内容，不能依赖系统自动整理。】',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '演示文稿标题（必填）' },
      slides: { type: 'array', description: '幻灯片数组，每页 {title, content, image_url?}', items: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, image_url: { type: 'string', description: '可选：幻灯片配图 URL' } } } },
    },
    required: ['title', 'slides'],
  },
  async handler(args) {
    try {
      var title = (args.title || '演示').trim();
      var slides = Array.isArray(args.slides) ? args.slides : [];
      if (slides.length === 0) return { ok: false, error: 'NO_SLIDES' };

      var zip = new AdmZip();
      var totalSlides = slides.length + 1; // +1 封面
      var imgIndex = 1; // 图片计数器

      // 下载图片并保存到 zip 的 media/ 目录
      async function downloadImage(url) {
        if (!url) return null;
        var imgId = 'rIdImg' + imgIndex;
        var fileName = 'image' + imgIndex + '.jpg';
        imgIndex++;

        try {
          // 用 fetch 或 http/https 下载
          var http = url.startsWith('https') ? require('https') : require('http');
          var buf = await new Promise(function(resolve, reject) {
            http.get(url, function(resp) {
              if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
                // 重定向
                http.get(resp.headers.location, function(r2) {
                  var chunks = [];
                  r2.on('data', function(c) { chunks.push(c); });
                  r2.on('end', function() { resolve(Buffer.concat(chunks)); });
                }).on('error', reject);
              } else {
                var chunks = [];
                resp.on('data', function(c) { chunks.push(c); });
                resp.on('end', function() { resolve(Buffer.concat(chunks)); });
              }
            }).on('error', reject);
          });

          if (buf.length < 100) return null;
          zip.addFile('ppt/media/' + fileName, buf);
          return { id: imgId, file: fileName, contentType: 'image/jpeg' };
        } catch (e) {
          console.warn('[generate_pptx] 图片下载失败:', url.slice(0, 60), e.message);
          return null;
        }
      }

      // [Content_Types].xml
      var ctXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Default Extension="jpg" ContentType="image/jpeg"/>' +
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>';
      for (var si = 1; si <= totalSlides; si++) ctXml += '<Override PartName="/ppt/slides/slide' + si + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
      ctXml += '</Types>';
      zip.addFile('[Content_Types].xml', Buffer.from(ctXml));

      zip.addFile('_rels/.rels', Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>'
      ));

      // 下载所有图片
      var imgInfos = [];
      for (var si = 0; si < slides.length; si++) {
        var imgInfo = await downloadImage(slides[si].image_url);
        imgInfos.push(imgInfo);
      }

      // 构建每页的 rels（图片关系）
      function buildSlideRels(slideIndex, imgInfo) {
        var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
        rels += '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>';
        if (imgInfo) {
          rels += '<Relationship Id="' + imgInfo.id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/' + imgInfo.file + '"/>';
        }
        rels += '</Relationships>';
        return rels;
      }

      var relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>';
      for (var si = 1; si <= totalSlides; si++) relsXml += '<Relationship Id="rId' + (si + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + si + '.xml"/>';
      relsXml += '</Relationships>';
      zip.addFile('ppt/_rels/presentation.xml.rels', Buffer.from(relsXml));

      var presXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst>';
      for (var si = 1; si <= totalSlides; si++) presXml += '<p:sldId id="' + (255 + si) + '" r:id="rId' + (si + 1) + '"/>';
      presXml += '</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>';
      zip.addFile('ppt/presentation.xml', Buffer.from(presXml));

      zip.addFile('ppt/slideMasters/slideMaster1.xml', Buffer.from('<?xml version="1.0"?><p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/></p:nvGrpSpPr><p:grpSpPr/></p:nvGrpSpPr></p:spTree></p:cSld></p:sldMaster>'));
      zip.addFile('ppt/slideLayouts/slideLayout1.xml', Buffer.from('<?xml version="1.0"?><p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/></p:nvGrpSpPr><p:grpSpPr/></p:nvGrpSpPr></p:spTree></p:cSld></p:sldLayout>'));
      zip.addFile('ppt/theme/theme1.xml', Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Default"><a:themeElements><a:clrScheme name="Default"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:dk2><a:srgbClr val="333333"/></a:dk2><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:accent1><a:srgbClr val="4472C4"/></a:accent1></a:clrScheme></a:themeElements></a:theme>'));

      function makeSlideXml(sTitle, sContent, isCover, imgInfo) {
        var fontSize = isCover ? '4400' : '3600';
        var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>';
        xml += '<p:nvGrpSpPr><p:cNvPr id="1" name=""/></p:nvGrpSpPr><p:grpSpPr/>';

        // 如果有图片，先加图片（占右侧区域）
        if (imgInfo) {
          var imgW = 5000000; // ~5 inches
          var imgH = 4000000;
          var imgX = 5500000; // 右侧
          var imgY = 1200000;
          // 非封面：文字在左，图片在右
          if (!isCover) {
            imgX = 5500000;
            imgY = 1200000;
          } else {
            // 封面：图片居中
            imgX = 2500000;
            imgY = 2000000;
            imgW = 6000000;
            imgH = 4000000;
          }
          xml += '<p:pic><p:nvPicPr><p:cNvPr id="4" name="Picture"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr></p:nvPicPr><p:blipFill><a:blip r:embed="' + imgInfo.id + '" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="' + imgX + '" y="' + imgY + '"/><a:ext cx="' + imgW + '" cy="' + imgH + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></a:spPr></p:pic>';
        }

        // 标题
        var titleX = imgInfo && !isCover ? '457200' : '914400';
        var titleW = imgInfo && !isCover ? '4500000' : '8229600';
        var titleSize = isCover ? '3600' : '2400';
        xml += '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:nvSpPrType/></p:nvSpPr><p:spPr><a:xfrm><a:off x="' + titleX + '" y="457200"/><a:ext cx="' + titleW + '" cy="' + fontSize + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></a:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="' + titleSize + '" b="1"/><a:t>' + escXml(sTitle) + '</a:t></a:r></a:p></p:txBody></p:sp>';

        // 正文
        if (sContent) {
          var contentX = imgInfo && !isCover ? '457200' : '914400';
          var contentW = imgInfo && !isCover ? '4500000' : '8229600';
          var contentY = imgInfo && !isCover ? '20%' : (isCover ? '35%' : '20%');
          xml += '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:nvSpPrType/></p:nvSpPr><p:spPr><a:xfrm><a:off x="' + contentX + '" y="' + contentY + '"/><a:ext cx="' + contentW + '" cy="60%"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></a:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="1600"/><a:t>' + escXml(sContent) + '</a:t></a:r></a:p></p:txBody></p:sp>';
        }

        xml += '</p:spTree></p:cSld></p:sld>';
        return xml;
      }

      // 封面
      zip.addFile('ppt/slides/slide1.xml', Buffer.from(makeSlideXml(title, slides.length + ' 页', true, null)));
      zip.addFile('ppt/slides/_rels/slide1.xml.rels', Buffer.from(buildSlideRels(1, null)));

      // 内容页
      slides.forEach(function(s, idx) {
        var imgInfo = imgInfos[idx] || null;
        zip.addFile('ppt/slides/slide' + (idx + 2) + '.xml', Buffer.from(makeSlideXml(s.title || '', s.content || '', false, imgInfo)));
        zip.addFile('ppt/slides/_rels/slide' + (idx + 2) + '.xml.rels', Buffer.from(buildSlideRels(idx + 2, imgInfo)));
      });

      var buffer = zip.toBuffer();
      var file = saveFile('pptx', buffer);
      var imgCount = imgInfos.filter(function(i) { return i !== null; }).length;
      return { ok: true, title: title, url: file.url, fileId: file.id, size: buffer.length, slides: slides.length, images: imgCount, message: '演示文稿已生成' };
    } catch (e) {
      return { ok: false, error: 'PPTX_FAILED', message: e.message };
    }
  },
});
