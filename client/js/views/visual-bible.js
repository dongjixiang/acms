// P200: 视觉设定集客户端 API 封装
//   analyzeDocument(docText, { onProgress }) → Promise<{characters, scenes, stats}>
//   matchSegment(selectedText, bible)        → Promise<{characters, scene, shot, prompt}>
(function (root) {
  var BASE = '/api/visual-bible';

  // SSE 流式分析：全文 → 设定集草案
  function analyzeDocument(docText, opts) {
    opts = opts || {};
    var onProgress = opts.onProgress;
    var signal = opts.signal;
    return fetch(BASE + '/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
      body: JSON.stringify({ docText: docText }),
      signal: signal
    }).then(function (resp) {
      if (!resp.ok || !resp.body) {
        return resp.text().then(function (t) {
          throw new Error('analyze HTTP ' + resp.status + ': ' + String(t).slice(0, 200));
        });
      }
      var reader = resp.body.getReader();
      var decoder = new TextDecoder('utf-8');
      var buf = '';
      var bibleResult = null;
      var errorMsg = null;

      function handleEvent(name, data) {
        if (name === 'progress') {
          if (onProgress) try { onProgress(data); } catch (_) { }
        } else if (name === 'done') {
          bibleResult = data.bible;
        } else if (name === 'error') {
          errorMsg = data.message || '分析失败';
        }
      }

      function pump() {
        return reader.read().then(function (r) {
          if (r.done) {
            if (errorMsg) throw new Error(errorMsg);
            if (!bibleResult) throw new Error('分析未返回结果');
            return bibleResult;
          }
          buf += decoder.decode(r.value, { stream: true });
          var events = buf.split('\n\n');
          buf = events.pop() || '';
          for (var i = 0; i < events.length; i++) {
            var ev = events[i];
            var m = ev.match(/^event:\s*(.+)\ndata:\s*([\s\S]+)$/);
            if (!m) continue;
            var name = m[1].trim();
            var data;
            try { data = JSON.parse(m[2]); } catch (_) { continue; }
            handleEvent(name, data);
          }
          return pump();
        });
      }
      return pump();
    });
  }

  // 匹配：选中文字 → 角色/场景 + 镜头
  function matchSegment(selectedText, bible) {
    return fetch(BASE + '/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
      body: JSON.stringify({ selectedText: selectedText, bible: bible || {} })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  root.acmsVisualBible = {
    analyzeDocument: analyzeDocument,
    matchSegment: matchSegment
  };
})(window);
