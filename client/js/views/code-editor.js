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
    var menuOpen = null; // 当前打开的菜单

    function closeMenu() {
      if (menuOpen) { menuOpen.style.display = 'none'; menuOpen = null; }
    }

    function toggleMenu(menuEl) {
      closeMenu();
      menuOpen = menuEl;
      menuEl.style.display = 'block';
    }

    // 渲染 UI
    var h = '';
    h += '<div class="oo-editor oo-editor-code" style="display:flex;flex-direction:column;height:100%">';
    // 标题栏: 文件名 + 保存
    h += '<div class="oo-titlebar">';
    h += '<span class="oo-titlebar-icon">📝</span>';
    h += '<div class="oo-titlebar-name"><input id="code-title-input" value="' + escHtml(fileName || 'untitled') + '" placeholder="untitled"></div>';
    h += '<div class="oo-titlebar-actions">';
    h += '<button class="oo-titlebar-btn" id="code-save-btn">💾 保存</button>';
    h += '</div></div>';
    // 菜单栏
    h += '<div class="code-menu-bar" style="display:flex;background:var(--bg2,#f0f0f0);border-bottom:1px solid var(--office-divider,#ddd);flex-shrink:0">';
    h += '<div class="code-menu-item" data-menu="file" style="position:relative;padding:4px 14px;cursor:pointer;font-size:13px;user-select:none">文件';
    h += '<div class="code-menu-dropdown" style="display:none;position:absolute;top:100%;left:0;z-index:9999;background:var(--bg,#fff);border:1px solid var(--office-divider,#ddd);border-radius:4px;box-shadow:0 4px 16px rgba(0,0,0,0.12);min-width:160px;padding:4px 0">';
    h += '<div class="code-menu-dropdown-item" data-action="save">💾 保存 <span style="float:right;color:var(--text2,#999);font-size:11px">Ctrl+S</span></div>';
    h += '<div class="code-menu-divider" style="height:1px;background:var(--office-divider,#ddd);margin:4px 8px"></div>';
    h += '<div class="code-menu-dropdown-item" data-action="new-tab">📄 新建文件</div>';
    h += '</div></div>';
    h += '<div class="code-menu-item" data-menu="edit" style="position:relative;padding:4px 14px;cursor:pointer;font-size:13px;user-select:none">编辑';
    h += '<div class="code-menu-dropdown" style="display:none;position:absolute;top:100%;left:0;z-index:9999;background:var(--bg,#fff);border:1px solid var(--office-divider,#ddd);border-radius:4px;box-shadow:0 4px 16px rgba(0,0,0,0.12);min-width:160px;padding:4px 0">';
    h += '<div class="code-menu-dropdown-item" data-action="undo">↩ 撤销 <span style="float:right;color:var(--text2,#999);font-size:11px">Ctrl+Z</span></div>';
    h += '<div class="code-menu-dropdown-item" data-action="redo">↪ 重做 <span style="float:right;color:var(--text2,#999);font-size:11px">Ctrl+Y</span></div>';
    h += '<div class="code-menu-divider" style="height:1px;background:var(--office-divider,#ddd);margin:4px 8px"></div>';
    h += '<div class="code-menu-dropdown-item" data-action="find">🔍 查找 <span style="float:right;color:var(--text2,#999);font-size:11px">Ctrl+F</span></div>';
    h += '<div class="code-menu-dropdown-item" data-action="replace">🔁 替换 <span style="float:right;color:var(--text2,#999);font-size:11px">Ctrl+H</span></div>';
    h += '<div class="code-menu-divider" style="height:1px;background:var(--office-divider,#ddd);margin:4px 8px"></div>';
    h += '<div class="code-menu-dropdown-item" data-action="select-all">☐ 全选 <span style="float:right;color:var(--text2,#999);font-size:11px">Ctrl+A</span></div>';
    h += '</div></div>';
    h += '<div class="code-menu-item" data-menu="view" style="position:relative;padding:4px 14px;cursor:pointer;font-size:13px;user-select:none">查看';
    h += '<div class="code-menu-dropdown" style="display:none;position:absolute;top:100%;left:0;z-index:9999;background:var(--bg,#fff);border:1px solid var(--office-divider,#ddd);border-radius:4px;box-shadow:0 4px 16px rgba(0,0,0,0.12);min-width:160px;padding:4px 0">';
    h += '<div class="code-menu-dropdown-item" data-action="toggle-minimap">☐ 缩略图</div>';
    h += '<div class="code-menu-dropdown-item" data-action="toggle-wordwrap">☐ 自动换行</div>';
    h += '<div class="code-menu-divider" style="height:1px;background:var(--office-divider,#ddd);margin:4px 8px"></div>';
    h += '<div class="code-menu-dropdown-item" data-action="zoom-in">🔍+ 放大</div>';
    h += '<div class="code-menu-dropdown-item" data-action="zoom-out">🔍− 缩小</div>';
    h += '<div class="code-menu-dropdown-item" data-action="zoom-reset">🔍 重置</div>';
    h += '</div></div>';
    h += '<div class="code-menu-item" data-menu="ai" style="position:relative;padding:4px 14px;cursor:pointer;font-size:13px;user-select:none;color:var(--office-word-primary,#446995);font-weight:600">🤖 AI';
    h += '<div class="code-menu-dropdown" style="display:none;position:absolute;top:100%;left:0;z-index:9999;background:var(--bg,#fff);border:1px solid var(--office-divider,#ddd);border-radius:4px;box-shadow:0 4px 16px rgba(0,0,0,0.12);min-width:160px;padding:4px 0">';
    h += '<div class="code-menu-dropdown-item" data-action="ai-explain">📖 解释代码</div>';
    h += '<div class="code-menu-dropdown-item" data-action="ai-optimize">⚡ 优化代码</div>';
    h += '<div class="code-menu-dropdown-item" data-action="ai-translate-en">🇺🇸 译成英文</div>';
    h += '<div class="code-menu-dropdown-item" data-action="ai-translate-zh">🇨🇳 译成中文</div>';
    h += '<div class="code-menu-dropdown-item" data-action="ai-comments">💬 添加注释</div>';
    h += '<div class="code-menu-dropdown-item" data-action="ai-fix">🔧 查找 Bug</div>';
    h += '</div></div>';
    h += '<div style="flex:1"></div>';
    h += '</div>';
    // 编辑器 mount 区
    h += '<div id="code-editor-mount" style="flex:1;min-height:0"></div>';
    // AI 结果面板
    h += '<div id="code-ai-panel" style="display:none;flex-shrink:0;max-height:200px;overflow:auto;background:var(--bg2,#f5f5f7);border-top:1px solid var(--office-divider,#ddd);padding:8px;font-size:13px"></div>';
    h += '</div>';
    w.$c.innerHTML = h;

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

    // ─── 菜单事件绑定 ───
    // 点击菜单项展开下拉
    w.$c.querySelectorAll('.code-menu-item').forEach(function (item) {
      item.onclick = function (e) {
        e.stopPropagation();
        var dd = this.querySelector('.code-menu-dropdown');
        if (!dd) return;
        if (menuOpen === dd) { closeMenu(); return; }
        toggleMenu(dd);
      };
    });
    // 点击下拉项执行动作
    w.$c.querySelectorAll('.code-menu-dropdown-item').forEach(function (item) {
      item.onclick = function (e) {
        e.stopPropagation();
        closeMenu();
        var action = this.dataset.action;
        if (!editor) { toast('编辑器未就绪', 'warning'); return; }
        switch (action) {
          case 'save':
            var content = editor.getValue();
            var name = (w.$c.querySelector('#code-title-input').value || '').trim() || 'untitled.txt';
            toast('已保存 ' + name + ' (' + content.length + ' chars)', 'success');
            break;
          case 'new-tab': toast('新建文件 (即将支持)', 'info'); break;
          case 'undo': editor.trigger('keyboard', 'undo'); break;
          case 'redo': editor.trigger('keyboard', 'redo'); break;
          case 'find': editor.trigger('keyboard', 'actions.find'); break;
          case 'replace': editor.trigger('keyboard', 'editor.action.startFindReplaceAction'); break;
          case 'select-all': editor.trigger('keyboard', 'editor.action.selectAll'); break;
          case 'toggle-minimap':
            var opts = editor.getRawOptions();
            editor.updateOptions({ minimap: { enabled: !opts.minimap.enabled } });
            break;
          case 'toggle-wordwrap':
            editor.updateOptions({ wordWrap: editor.getRawOptions().wordWrap === 'on' ? 'off' : 'on' });
            break;
          case 'zoom-in': editor.trigger('keyboard', 'editor.action.fontZoomIn'); break;
          case 'zoom-out': editor.trigger('keyboard', 'editor.action.fontZoomOut'); break;
          case 'zoom-reset': editor.trigger('keyboard', 'editor.action.fontZoomReset'); break;
          case 'ai-explain':
          case 'ai-optimize':
          case 'ai-translate-en':
          case 'ai-translate-zh':
          case 'ai-comments':
          case 'ai-fix':
            var sel = editor.getSelection();
            var txt = editor.getModel().getValueInRange(sel);
            if (!txt.trim()) txt = editor.getValue();
            var aiAction = action.replace('ai-', '');
            showAIMenu(aiPanel, editor, txt, lang, aiAction);
            break;
        }
      };
    });
    // 点击空白关闭菜单
    w.$c.addEventListener('mousedown', function (e) {
      if (!e.target.closest('.code-menu-item')) closeMenu();
    });

    // ─── 保存按钮 ───
    w.$c.querySelector('#code-save-btn').onclick = function () {
      if (!editor) { toast('编辑器未就绪', 'warning'); return; }
      var content = editor.getValue();
      var name = (w.$c.querySelector('#code-title-input').value || '').trim() || 'untitled.txt';
      toast('已保存 ' + name + ' (' + content.length + ' chars)', 'success');
    };

    // ─── 键盘快捷键 ───
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        if (!w.$c || !document.body.contains(w.$c)) return;
        e.preventDefault();
        var btn = w.$c.querySelector('#code-save-btn');
        if (btn) btn.click();
      }
    });
  }

  // ─── AI 菜单 — 选中代码后的操作面板 ───
  function showAIMenu(panel, editor, text, lang, autoAction) {
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
      '<div id="code-ai-result" style="margin-top:8px;white-space:pre-wrap;color:var(--text2,#666)"></div>';

    var resultEl = panel.querySelector('#code-ai-result');

    function buildPrompt(action, code, lang) {
      var prompts = {
        'explain': '解释以下 ' + lang + ' 代码的功能，用中文回答：\n\n```' + lang + '\n' + code + '\n```',
        'optimize': '优化以下 ' + lang + ' 代码（性能/可读性），用中文回答：\n\n```' + lang + '\n' + code + '\n```',
        'translate-en': 'Translate the following comments and identifiers in this ' + lang + ' code to English:\n\n```' + lang + '\n' + code + '\n```',
        'translate-zh': '将以下 ' + lang + ' 代码中的注释和标识符翻译成中文：\n\n```' + lang + '\n' + code + '\n```',
        'comments': '为以下 ' + lang + ' 代码添加中文注释，直接在原代码中插入：\n\n```' + lang + '\n' + code + '\n```',
        'fix': '找出以下 ' + lang + ' 代码中的潜在 bug 和改进点，用中文回答：\n\n```' + lang + '\n' + code + '\n```',
      };
      return prompts[action] || prompts['explain'];
    }

    function runAI(action) {
      var p = buildPrompt(action, text, lang);
      resultEl.textContent = '⏳ AI 思考中...';
      fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': (window.ACMSConfig && window.ACMSConfig.apiKey) || 'dev-key-001' },
        body: JSON.stringify({ messages: [{ role: 'user', content: p }], stream: false }),
      }).then(function (r) { return r.json(); }).then(function (data) {
        var answer = data && (data.content || data.message || data.text || data.reply) || '无响应';
        resultEl.textContent = answer;
      }).catch(function (e) { resultEl.textContent = '❌ ' + e.message; });
    }

    panel.querySelectorAll('[data-ai]').forEach(function (btn) {
      btn.onclick = function () { runAI(this.dataset.ai); };
    });
    panel.querySelector('#code-ai-close').onclick = function () { panel.style.display = 'none'; };

    // 如果从菜单调用，自动触发
    if (autoAction) runAI(autoAction);
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  root.openCodeEditor = openCodeEditor;
  root.CodeEditor = { openCodeEditor: openCodeEditor, loadMonaco: loadMonaco };

})(window);
