// ACMS Office 文件路由 — 保存/读取 Office 文档
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const OFFICE_DIR = path.join(__dirname, '..', 'public', 'office');
if (!fs.existsSync(OFFICE_DIR)) fs.mkdirSync(OFFICE_DIR, { recursive: true });

// 保存 Office 文件
// POST /api/office/save
// Body: { type: 'docx'|'xlsx'|'pptx', name, content: buffer(base64), data?: object }
router.post('/save', function(req, res) {
  try {
    var body = req.body || {};
    var type = body.type || 'docx';
    var name = body.name || ('untitled.' + type);
    var ext = type.replace('.', '');
    var fileId = uuidv4();
    var fileName = fileId + '.' + ext;
    var filePath = path.join(OFFICE_DIR, fileName);

    // 支持直接传 buffer 或前端传 JSON data
    if (body.content) {
      fs.writeFileSync(filePath, Buffer.from(body.content, 'base64'));
    } else if (body.data) {
      fs.writeFileSync(filePath, JSON.stringify(body.data));
    } else {
      // 空文件
      fs.writeFileSync(filePath, '');
    }

    res.json({
      ok: true,
      fileId: fileId,
      fileName: name,
      path: '/api/office/download/' + fileId + '/' + name,
      size: fs.statSync(filePath).size,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 读取 Office 文件
// GET /api/office/read/:fileId
router.get('/read/:fileId', function(req, res) {
  try {
    var files = fs.readdirSync(OFFICE_DIR);
    var match = files.find(function(f) { return f.startsWith(req.params.fileId); });
    if (!match) return res.status(404).json({ error: 'FILE_NOT_FOUND' });

    var filePath = path.join(OFFICE_DIR, match);
    var content = fs.readFileSync(filePath);
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

// 下载 Office 文件
// GET /api/office/download/:fileId/:name
router.get('/download/:fileId/:name', function(req, res) {
  var files = fs.readdirSync(OFFICE_DIR);
  var match = files.find(function(f) { return f.startsWith(req.params.fileId); });
  if (!match) return res.status(404).json({ error: 'FILE_NOT_FOUND' });

  var mimeTypes = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
  var ext = path.extname(match).slice(1);
  res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="' + req.params.name + '"');
  res.sendFile(path.join(OFFICE_DIR, match));
});

module.exports = router;
