// P200: 视觉设定集路由
//   POST /analyze  — SSE 流式：全文抽取人物/场景 → 设定集草案（含进度事件）
//   POST /match    — 一次性 JSON：选中文字 → 匹配角色/场景 + 镜头描述
//   生成设定图复用 /api/image-tools/ai-generate；落库复用 character-library / scene-library
const express = require('express');
const router = express.Router();
var bible = require('../services/visual-bible');

// ── SSE: 全文分析 → 设定集草案 ──
// 协议：
//   event: progress  data: {"phase":"segment","current":1,"total":3,"message":"..."}
//   event: done      data: {"bible":{characters:[...],scenes:[...],stats:{...}}}
//   event: error     data: {"message":"..."}
//   : heartbeat                                        — 15s 防反代超时
router.post('/analyze', async function (req, res) {
  var body = req.body || {};
  var docText = String(body.docText || '').trim();
  if (!docText) {
    return res.status(400).json({ ok: false, error: '缺少 docText（前端需先抽取文档全文）' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  var heartbeat = setInterval(function () {
    try { res.write(': heartbeat\n\n'); } catch (_) { }
  }, 15000);
  function sse(event, data) {
    try { res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'); } catch (_) { }
  }
  function finish() {
    clearInterval(heartbeat);
    try { res.end(); } catch (_) { }
  }

  try {
    var result = await bible.analyzeDocument(docText, function (p) {
      sse('progress', p);
    });
    console.log('[visual-bible] 分析完成:', result.stats);
    sse('done', { bible: result });
  } catch (e) {
    console.error('[visual-bible] 分析失败:', e.message);
    sse('error', { message: e.message });
  }
  finish();
});

// ── 匹配：选中文字 → 角色/场景 + 镜头描述 ──
// body: { selectedText: '...', bible: { characters:[...], scenes:[...] } }
// resp: { ok:true, data:{ characters:[...], scene:{...}|null, shot:'...', prompt:'...' } }
router.post('/match', async function (req, res) {
  try {
    var body = req.body || {};
    var selectedText = String(body.selectedText || '').trim();
    if (!selectedText) return res.json({ ok: false, error: '缺少 selectedText' });
    var b = body.bible || {};
    var r = await bible.matchSegment(selectedText, b);
    res.json({ ok: true, data: r });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
