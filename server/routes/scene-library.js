// P199/P200: 场景档案库路由 — CRUD for scene library
//   P200 新增：/list 支持 docId+scope 过滤；/assign-doc 批量绑定文档
const express = require('express');
const router = express.Router();
var lib = require('../services/scene-library');

router.get('/list', function (req, res) {
  try {
    res.json({
      ok: true,
      data: lib.list({
        docId: req.query.docId,
        scope: req.query.scope
      })
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/get/:id', function (req, res) {
  try {
    var s = lib.get(req.params.id);
    if (!s) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    res.json({ ok: true, data: s });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/find-in-text', function (req, res) {
  try {
    var hits = lib.findByText((req.body && req.body.text) || '');
    res.json({ ok: true, data: hits });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/create', function (req, res) {
  try { res.json({ ok: true, data: lib.create(req.body || {}) }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

router.post('/update/:id', function (req, res) {
  try { res.json({ ok: true, data: lib.update(req.params.id, req.body || {}) }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

router.post('/delete/:id', function (req, res) {
  try { res.json(lib.remove(req.params.id)); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

// P200: 批量绑定文档
router.post('/assign-doc', function (req, res) {
  try {
    var b = req.body || {};
    res.json(lib.assignDoc(b.ids, b.docId, b.docName));
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// P200: 设为/取消「通用」（跨文档复用）
router.post('/set-shared', function (req, res) {
  try {
    var b = req.body || {};
    res.json(lib.setShared(b.ids, b.shared === true));
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;
