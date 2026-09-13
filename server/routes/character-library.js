// P199/P200: 角色档案库路由 — CRUD for character library
//   P200 新增：/list 支持 docId+scope 过滤；/assign-doc 批量绑定文档
const express = require('express');
const router = express.Router();
var lib = require('../services/character-library');

// 列表 — ?docId=xxx&scope=doc|all|unassigned
//   scope 缺省：带 docId → 'doc'（本文档+通用）；不带 → 'all'
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
    var c = lib.get(req.params.id);
    if (!c) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    res.json({ ok: true, data: c });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/find-in-text', function (req, res) {
  try {
    var text = (req.body && req.body.text) || '';
    res.json({ ok: true, data: lib.findByText(text) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/create', function (req, res) {
  try {
    res.json({ ok: true, data: lib.create(req.body || {}) });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.post('/update/:id', function (req, res) {
  try {
    res.json({ ok: true, data: lib.update(req.params.id, req.body || {}) });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.post('/delete/:id', function (req, res) {
  try { res.json(lib.remove(req.params.id)); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

// P200: 批量绑定文档
//   body: { ids?: string[], docId: string, docName?: string }
//   ids 省略/空 → 作用到「全部未绑定文档的」项；docId 传空字符串 = 退回未绑定
router.post('/assign-doc', function (req, res) {
  try {
    var b = req.body || {};
    res.json(lib.assignDoc(b.ids, b.docId, b.docName));
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// P200: 设为/取消「通用」（跨文档复用）
//   body: { ids: string[], shared: boolean }
router.post('/set-shared', function (req, res) {
  try {
    var b = req.body || {};
    res.json(lib.setShared(b.ids, b.shared === true));
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;
