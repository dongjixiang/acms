const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ExcelJS = require('exceljs');
const { XMLParser } = require('fast-xml-parser');

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  isArray: (name, jpath, isLeafNode, isParentNode) => {
    if (name === 'p:sp' || name === 'p:pic') return true;
    if (name === 'Relationship') return true;
    if (name === 'p:sldId') return true;
    return false;
  }
});

const OFFICE_DIR = path.join(__dirname, '..', 'public', 'office');
if (!fs.existsSync(OFFICE_DIR)) fs.mkdirSync(OFFICE_DIR, { recursive: true });

const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function parsePptxToSchema(buf) {
  var AdmZip = require('adm-zip');
  var zip = new AdmZip(buf);
  
  // 1. 提取所有图片
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
  
  // 2. 读取 presentation.xml
  var presXml = zip.readAsText('ppt/presentation.xml');
  var presObj = xmlParser.parse(presXml);
  
  // 3. 提取 slide IDs
  var slideIds = [];
  var pres = presObj['p:presentation'];
  if (pres) {
    var sldIdLst = pres['p:sldIdLst'];
    if (sldIdLst) {
      var ids = sldIdLst['p:sldId'];
      if (!Array.isArray(ids)) ids = [ids];
      ids.forEach(function(sid) {
        if (sid['@_r:id']) {
          slideIds.push(sid['@_r:id']);
        }
      });
    }
  }
  
  // 4. 读取 rels
  var relsXml = zip.readAsText('ppt/_rels/presentation.xml.rels');
  var relsObj = xmlParser.parse(relsXml);
  var relMap = {};
  
  var relsRoot = relsObj['Relationships'];
  if (relsRoot && relsRoot['Relationship']) {
    var rels = relsRoot['Relationship'];
    if (!Array.isArray(rels)) rels = [rels];
    rels.forEach(function(r) {
      if (r['@_Id'] && r['@_Target']) {
        relMap[r['@_Id']] = r['@_Target'];
      }
    });
  }
  
  // 5. 解析每页幻灯片
  var pptSlides = [];
  
  slideIds.forEach(function(rid) {
    var slideFile = relMap[rid];
    if (!slideFile) return;
    
    var slideXml = zip.readAsText('ppt/' + slideFile);
    if (!slideXml) return;
    
    var slideObj = xmlParser.parse(slideXml);
    
    var titleText = '';
    var bodyText = '';
    var layout = 'content';
    
    // 提取所有 p:sp 形状
    var shapes = [];
    var sld = slideObj['p:sld'];
    if (sld) {
      var cSld = sld['p:cSld'];
      if (cSld) {
        var spTree = cSld['p:spTree'];
        if (spTree) {
          shapes = spTree['p:sp'] || [];
          if (!Array.isArray(shapes)) shapes = [shapes];
        }
      }
    }
    
    shapes.forEach(function(sp) {
      var nvSpPr = sp['p:nvSpPr'];
      if (!nvSpPr) return;
      
      var cNvPr = nvSpPr['p:cNvPr'];
      if (!cNvPr) return;
      
      var name = cNvPr['@_name'] || '';
      var nvPr = nvSpPr['p:nvPr'];
      var phType = '';
      if (nvPr) {
        var ph = nvPr['p:ph'];
        if (ph) {
          phType = ph['@_type'] || '';
          if (!phType && ph['@_idx']) {
            phType = 'body';
          }
        }
      }
      
      var texts = extractTextFromShape(sp);
      var innerText = texts.join(' ');
      
      if (phType === 'title' || (name.indexOf('标题') >= 0 && name.indexOf('副标题') < 0) || name.indexOf('Title') >= 0) {
        titleText = innerText;
        layout = 'cover';
      } else if (phType === 'body' || phType === 'subTitle' || name.indexOf('正文') >= 0 || name.indexOf('Content') >= 0 || name.indexOf('副标题') >= 0) {
        if (bodyText) bodyText += '\n' + innerText;
        else bodyText = innerText;
        layout = 'content';
      } else if (!phType && !name && innerText) {
        if (bodyText) bodyText += '\n' + innerText;
        else bodyText = innerText;
      }
    });
    
    // 提取图片和表格
    var imgRefs = extractImages(slideFile, zip, imageMap);
    var tables = extractTables(slideObj);

    if (titleText || bodyText) {
      pptSlides.push({
        title: escHtml(titleText || '标题'),
        content: escHtml(bodyText || ''),
        layout: layout,
        images: imgRefs,
        tables: tables
      });
    }
  });
  
  if (pptSlides.length > 0) {
    return 'SCHEMA:' + JSON.stringify({ slides: pptSlides });
  } else {
    return '(PPTX 文本提取失败，请手动创建)';
  }
}

function extractTextFromShape(sp) {
  var texts = [];
  var txBody = sp['p:txBody'];
  if (!txBody) return texts;
  
  var paragraphs = txBody['a:p'] || [];
  if (!Array.isArray(paragraphs)) paragraphs = [paragraphs];
  
  paragraphs.forEach(function(p) {
    var runs = p['a:r'] || [];
    if (!Array.isArray(runs)) runs = [runs];
    runs.forEach(function(r) {
      var t = r['a:t'];
      if (t) {
        texts.push(t);
      }
    });
  });
  
  return texts;
}

function extractImages(slideFile, zip, imageMap) {
  var imgRefs = [];
  // slideFile 格式是 'slides/slide2.xml'，需要转换为 'ppt/slides/_rels/slide2.xml.rels'
  var baseName = slideFile.split('/').pop(); // 'slide2.xml'
  var relsFileName = baseName.replace('.xml', '.xml.rels'); // 'slide2.xml.rels'
  var relsPath = 'ppt/slides/_rels/' + relsFileName;
  var relsXml = zip.readAsText(relsPath) || '';
  
  if (!relsXml) return imgRefs;
  
  var relsObj = xmlParser.parse(relsXml);
  var rels = [];
  
  var relsRoot = relsObj['Relationships'];
  if (relsRoot && relsRoot['Relationship']) {
    rels = relsRoot['Relationship'];
    if (!Array.isArray(rels)) rels = [rels];
  }
  
  rels.forEach(function(r) {
    var id = r['@_Id'];
    var target = r['@_Target'];
    var type = r['@_Type'] || '';
    
    if (type.indexOf('image') >= 0 && target) {
      var imgName = path.basename(target);
      var imgEntry = 'ppt/media/' + imgName;
      if (imageMap[imgEntry]) {
        imgRefs.push({
          rid: id,
          src: imageMap[imgEntry]
        });
      }
    }
  });
  
  return imgRefs;
}

function extractTables(slideObj) {
  var tables = [];
  var sld = slideObj['p:sld'];
  if (!sld) return tables;
  
  var cSld = sld['p:cSld'];
  if (!cSld) return tables;
  
  var spTree = cSld['p:spTree'];
  if (!spTree) return tables;
  
  // 提取表格 (graphicFrame)
  var graphicFrames = spTree['p:graphicFrame'] || [];
  if (!Array.isArray(graphicFrames)) graphicFrames = [graphicFrames];
  
  graphicFrames.forEach(function(gf) {
    var graphic = gf['a:graphic'];
    if (!graphic) return;
    
    var graphicData = graphic['a:graphicData'];
    if (!graphicData) return;
    
    var tbl = graphicData['a:tbl'];
    if (!tbl) return;
    
    var tableData = { rows: [], cols: 0 };
    
    // 提取列数
    var tblGrid = tbl['a:tblGrid'];
    if (tblGrid) {
      var gridCols = tblGrid['a:gridCol'] || [];
      if (!Array.isArray(gridCols)) gridCols = [gridCols];
      tableData.cols = gridCols.length;
    }
    
    // 提取行数据
    var rows = tbl['a:tr'] || [];
    if (!Array.isArray(rows)) rows = [rows];
    
    rows.forEach(function(row) {
      var cells = row['a:tc'] || [];
      if (!Array.isArray(cells)) cells = [cells];
      
      var rowData = [];
      cells.forEach(function(cell) {
        var txBody = cell['a:txBody'];
        var cellText = '';
        if (txBody) {
          var paragraphs = txBody['a:p'] || [];
          if (!Array.isArray(paragraphs)) paragraphs = [paragraphs];
          paragraphs.forEach(function(p) {
            var runs = p['a:r'] || [];
            if (!Array.isArray(runs)) runs = [runs];
            runs.forEach(function(r) {
              var t = r['a:t'];
              if (t) cellText += t;
            });
          });
        }
        rowData.push(cellText);
      });
      
      tableData.rows.push(rowData);
    });
    
    tables.push(tableData);
  });
  
  return tables;
}

router.post('/save', async function (req, res) {
  try {
    const body = req.body || {};
    const type = (body.type || 'docx').replace('.', '');
    const name = body.name || ('untitled.' + type);
    const fileId = uuidv4();
    const fileName = fileId + '.' + type;
    const filePath = path.join(OFFICE_DIR, fileName);

    if (body.content && typeof body.content === 'string') {
      const buf = Buffer.from(body.content, 'base64');
      if (buf.length < 4) throw new Error('content too short');
      fs.writeFileSync(filePath, buf);
    }
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

    if (type === 'pptx' || type === 'xlsx') {
      const schemaData = body.data;
      const hasData = type === 'pptx'
        ? (schemaData && schemaData.slides && Array.isArray(schemaData.slides) && schemaData.slides.length > 0)
        : (schemaData && schemaData.sheets && Array.isArray(schemaData.sheets));
      if (hasData) {
        const schemaFile = path.join(OFFICE_DIR, fileId + '.schema.json');
        fs.writeFileSync(schemaFile, JSON.stringify({ type: type, name: name, data: schemaData }));
      }
    }

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
    
    if (ext === 'docx') {
      try {
        var AdmZip = require('adm-zip');
        var zip = new AdmZip(buf);
        var docXml = zip.readAsText('word/document.xml');
        var parsedBlocks = parseDocxToBlocks(docXml);
        if (parsedBlocks.length > 0) {
          return res.json({ ok: true, blocks: parsedBlocks });
        }
        text = '';
      } catch (e) { text = '(docx 文本提取失败: ' + e.message + ')'; }
    }
    else if (ext === 'xlsx') {
      var schemaFile = filePath.replace('.' + ext, '.schema.json');
      if (fs.existsSync(schemaFile)) {
        try {
          var schemaJson = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
          if (schemaJson.data && schemaJson.data.sheets && Array.isArray(schemaJson.data.sheets)) {
            text = 'SCHEMA:' + JSON.stringify(schemaJson.data);
          } else {
            text = await parseXlsxToSchema(buf);
          }
        } catch (e) { text = '(schema 解析失败: ' + e.message + ')'; }
      } else {
        text = await parseXlsxToSchema(buf);
      }
    }
    else if (ext === 'pptx') {
      var schemaFile = filePath.replace('.pptx', '.schema.json');
      if (fs.existsSync(schemaFile)) {
        try {
          var schemaJson = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
          if (schemaJson.data && schemaJson.data.slides && Array.isArray(schemaJson.data.slides)) {
            text = 'SCHEMA:' + JSON.stringify(schemaJson.data);
          } else {
            text = parsePptxToSchema(buf);
          }
        } catch (e) { text = parsePptxToSchema(buf); }
      } else {
        text = parsePptxToSchema(buf);
      }
    }
    else {
      text = buf.toString('utf8');
    }
    
    res.json({
      ok: true,
      filename: match,
      source: source,
      ext: ext,
      size: buf.length,
      content: buf.toString('base64'),
      text: text,
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
  const safeName = encodeURIComponent(req.params.name);
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeName}`);
  res.sendFile(path.join(OFFICE_DIR, match));
});

async function writeDocx(body) {
  // TODO: implement
  return Buffer.from('fake');
}

async function writeXlsx(body) {
  // TODO: implement
  return Buffer.from('fake');
}

async function writePptx(body) {
  // TODO: implement
  return Buffer.from('fake');
}

function parseDocxToBlocks(xml) { return []; }
async function parseXlsxToSchema(buf) {
  try {
    var workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);
    var sheets = [];
    workbook.eachSheet(function(sheet, sheetId) {
      var rows = [];
      var headers = [];
      var rowCount = 0;
      sheet.eachRow(function(row, rowNumber) {
        if (rowNumber === 1) {
          headers = [];
          row.eachCell(function(cell, colNumber) {
            headers.push(cell.value !== null && cell.value !== undefined ? String(cell.value) : '');
          });
        } else {
          var rowData = [];
          for (var i = 0; i < headers.length; i++) {
            var cell = row.getCell(i + 1);
            rowData.push(cell.value !== null && cell.value !== undefined ? cell.value : '');
          }
          rows.push(rowData);
          rowCount++;
        }
      });
      if (rowCount > 0 || headers.length > 0) {
        sheets.push({
          name: sheet.name,
          headers: headers,
          rows: rows
        });
      }
    });
    return 'SCHEMA:' + JSON.stringify({ sheets: sheets });
  } catch (e) {
    console.error('[parseXlsxToSchema] error:', e.message);
    return '';
  }
}

module.exports = router;
