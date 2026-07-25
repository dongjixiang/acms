// ACMS 代码编辑器 — 基于 Monaco Editor
// 纯前端, 零后端依赖, CDN 加载
// AI 集成: 选中代码 → 解释/优化/翻译/注释

(function (root) {
  'use strict';

  var MONACO_PATH = '/client/lib/monaco';
  var loaded = false;
  var loadQueue = [];

  function loadMonaco(callback) {
    if (typeof monaco !== 'undefined' && monaco.editor) { callback(); return; }
    loadQueue.push(callback);
    if (loaded) return;
    loaded = true;

    var s = document.createElement('script');
    s.src = MONACO_PATH + '/loader.js';
    s.onload = function () {
      require.config({ paths: { vs: MONACO_PATH } });
      require(['vs/editor/editor.main'], function () {
        loadQueue.forEach(function (cb) { cb(); });
        loadQueue = [];
      }, function () {
        loaded = false;
        var mount = document.getElementById('code-editor-mount');
        if (mount) mount.innerHTML = '<div style="padding:40px;text-align:center;color:#a00">❌ Monaco Editor 加载失败<br><br>请检查 /client/lib/monaco/ 文件完整性<br><button onclick="location.reload()" style="margin-top:12px;padding:8px 24px;cursor:pointer">🔄 刷新</button></div>';
      });
    };
    s.onerror = function () {
      loaded = false;
      var mount = document.getElementById('code-editor-mount');
      if (mount) mount.innerHTML = '<div style="padding:40px;text-align:center;color:#a00">❌ Monaco Editor 加载失败<br><br>缺少 /client/lib/monaco/loader.js 文件</div>';
    };
    document.head.appendChild(s);
  }

  // 文件扩展名 → language 映射
  var EXT_TO_LANG = {
    js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp',
    swift: 'swift', kt: 'kotlin', scala: 'scala',
    html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
    json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml',
    md: 'markdown', txt: 'plaintext', csv: 'plaintext',
    sql: 'sql', sh: 'shell', bash: 'shell', zsh: 'shell',
    dockerfile: 'dockerfile', conf: 'ini', ini: 'ini',
    vue: 'html', svelte: 'html', astro: 'html',
  };
  function langFromFileName(name) {
    var ext = (name || '').split('.').pop().toLowerCase();
    return EXT_TO_LANG[ext] || 'plaintext';
  }

  // ─── 编辑器主入口 ───
  function openCodeEditor(w, fileId, fileName, initialContent) {
    var lang = langFromFileName(fileName);

    // 渲染 UI
    w.$c.innerHTML =
      '<div class="oo-editor oo-editor-code" style="display:flex;flex-direction:column;height:100%">' +
        '<div class="oo-titlebar">' +
          '<span class="oo-titlebar-icon">📝</span>' +
          '<div class="oo-titlebar-name">' +
            '<input id="code-title-input" value="' + escHtml(fileName || 'untitled') + '" placeholder="untitled">' +
          '</div>' +
          '<div class="oo-titlebar-actions">' +
            '<button class="oo-titlebar-btn" id="code-ask-ai-btn">🤖 AI</button>' +
            '<button class="oo-titlebar-btn primary" id="code-save-btn">💾 保存</button>' +
          '</div>' +
        '</div>' +
        '<div id="code-editor-mount" style="flex:1;min-height:0"></div>' +
        '<div id="code-ai-panel" style="display:none;flex-shrink:0;max-height:200px;overflow:auto;background:var(--bg2,#f5f5f7);border-top:1px solid var(--office-divider);padding:8px;font-size:13px"></div>' +
      '</div>';

    var mountEl = w.$c.querySelector('#code-editor-mount');
    var aiPanel = w.$c.querySelector('#code-ai-panel');
    var editor = null;

    loadMonaco(function () {
      editor = monaco.editor.create(mountEl, {
        value: initialContent || '',
        language: lang,
        theme: 'vs',
        fontSize: 14,
        fontFamily: 'Consolas, "Courier New", monospace',
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: 'on',
        lineNumbers: 'on',
        renderWhitespace: 'selection',
        bracketPairColorization: { enabled: true },
        padding: { top: 12 },
      });

      // 文件修改标记
      var isDirty = false;
      var model = editor.getModel();
      var initialContentStr = initialContent || '';
      model.onDidChangeContent(function () {
        isDirty = model.getValue() !== initialContentStr;
        var dot = w.$c.querySelector('#code-title-input');
        if (dot) dot.style.color = isDirty ? '#ff6b35' : '';
      });
    });

    // ─── AI 按钮 ───
    w.$c.querySelector('#code-ask-ai-btn').onclick = async function () {
      if (!editor) { toast('编辑器未就绪', 'warning'); return; }
      var selection = editor.getSelection();
      var selectedText = editor.getModel().getValueInRange(selection);
      if (!selectedText.trim()) {
        // 无选中 → 对整个文件操作
        selectedText = editor.getValue();
      }
      showAIMenu(aiPanel, editor, selectedText, lang);
    };

    // ─── 保存按钮 ───
    w.$c.querySelector('#code-save-btn').onclick = function () {
      if (!editor) { toast('编辑器未就绪', 'warning'); return; }
      var content = editor.getValue();
      var name = (w.$c.querySelector('#code-title-input').value || '').trim() || 'untitled.txt';
      toast('已保存 ' + name + ' (' + content.length + ' chars)', 'success');
      var dot = w.$c.querySelector('#code-title-input');
      if (dot) dot.style.color = '';
    };
  }

  // ─── AI 菜单 — 选中代码后的操作面板 ───
  function showAIMenu(panel, editor, text, lang) {
    panel.style.display = 'block';
    panel.innerHTML =
      '<div style="margin-bottom:6px;font-weight:600;color:var(--text,#333)">🤖 AI 对所选代码做什么？</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        '<button style="padding:4px 10px;border:1px solid var(--office-divider,#ccc);border-radius:3px;background:var(--bg,#fff);color:var(--text,#333);cursor:pointer;font-size:12px" data-ai="explain">📖 解释</button>' +
        '<button style="padding:4px 10px;border:1px solid var(--office-divider,#ccc);border-radius:3px;background:var(--bg,#fff);color:var(--text,#333);cursor:pointer;font-size:12px" data-ai="optimize">⚡ 优化</button>' +
        '<button style="padding:4px 10px;border:1px solid var(--office-divider,#ccc);border-radius:3px;background:var(--bg,#fff);color:var(--text,#333);cursor:pointer;font-size:12px" data-ai="translate-en">🇺🇸 译英文</button>' +
        '<button style="padding:4px 10px;border:1px solid var(--office-divider,#ccc);border-radius:3px;background:var(--bg,#fff);color:var(--text,#333);cursor:pointer;font-size:12px" data-ai="translate-zh">🇨🇳 译中文</button>' +
        '<button style="padding:4px 10px;border:1px solid var(--office-divider,#ccc);border-radius:3px;background:var(--bg,#fff);color:var(--text,#333);cursor:pointer;font-size:12px" data-ai="comments">💬 加注释</button>' +
        '<button style="padding:4px 10px;border:1px solid var(--office-divider,#ccc);border-radius:3px;background:var(--bg,#fff);color:var(--text,#333);cursor:pointer;font-size:12px" data-ai="fix">🔧 找 Bug</button>' +
        '<button style="margin-left:auto;padding:4px 10px;border:1px solid var(--office-divider,#ccc);border-radius:3px;background:transparent;color:var(--text,#333);cursor:pointer;font-size:12px" id="code-ai-close">✕ 关闭</button>' +
      '</div>' +
      '<div id="code-ai-result" style="margin-top:8px;white-space:pre-wrap;color:var(--text2)"></div>';

    var resultEl = panel.querySelector('#code-ai-result');

    function buildPrompt(action, code, lang) {
      var prompts = {
        'explain': '解释以下 ' + lang + ' 代码的功能，用中文回答：\n\n```' + lang + '\n' + code + '\n```',
        'optimize': '优化以下 ' + lang + ' 代码（性能/可读性），用中文回答：\n\n```' + lang + '\n' + code + '\n```',
        'translate-en': 'Translate the following comments and identifiers in this ' + lang + ' code to English:\n\n```' + lang + '\n' + code + '\n```',
        'translate-zh': '将以下 ' + lang + ' 代码中的注释和标识符翻译成中文：\n\n```' + lang + '\n' + code + '\n```',
        'comments': '为以下 ' + lang + ' 代码添加中文注释：\n\n```' + lang + '\n' + code + '\n```',
        'fix': '找出以下 ' + lang + ' 代码中的潜在 bug 和改进点，用中文回答：\n\n```' + lang + '\n' + code + '\n```',
      };
      return prompts[action] || prompts['explain'];
    }

    panel.querySelectorAll('[data-ai]').forEach(function (btn) {
      btn.onclick = async function () {
        var action = this.dataset.ai;
        var prompt = buildPrompt(action, text, lang);
        resultEl.textContent = '⏳ AI 思考中...';

        try {
          var resp = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': (window.ACMSConfig && window.ACMSConfig.apiKey) || 'dev-key-001' },
            body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], stream: false }),
          });
          var data = await resp.json();
          var answer = data && (data.content || data.message || data.text || data.reply) || '无响应';
          resultEl.textContent = answer;
        } catch (e) {
          resultEl.textContent = '❌ ' + e.message;
        }
      };
    });

    panel.querySelector('#code-ai-close').onclick = function () {
      panel.style.display = 'none';
    };
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  root.openCodeEditor = openCodeEditor;
  root.CodeEditor = { openCodeEditor: openCodeEditor, loadMonaco: loadMonaco };

})(window);
