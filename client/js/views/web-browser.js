// ACMS 内部浏览器窗口 — 地址栏 + iframe 预览
// 注册为 ACMSWin.registerViewLoader('web-browser', loader)
(function() {
  'use strict';

  var historyStack = [];
  var currentUrl = '';
  var browsingWindow = null;

  // ── 渲染 ──
  function render(w) {
    if (w.dead) return;
    browsingWindow = w;

    var html = '';
    // 工具栏
    html += '<div style="display:flex;align-items:center;gap:4px;padding:6px 8px;border-bottom:1px solid var(--border);flex-shrink:0">';
    html += '<button class="wb-btn" onclick="window.WB_goBack()" title="后退" id="wb-back" style="opacity:0.4">◀</button>';
    html += '<button class="wb-btn" onclick="window.WB_goForward()" title="前进" id="wb-forward" style="opacity:0.4">▶</button>';
    html += '<button class="wb-btn" onclick="window.WB_refresh()" title="刷新">↻</button>';
    html += '<input id="wb-url" type="text" placeholder="输入 URL 或搜索…" value="' + escHtml(currentUrl) + '" style="flex:1;min-width:0;padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-size:12px;font-family:inherit;outline:none" onkeydown="if(event.key===\'Enter\')window.WB_go(this.value)">';
    html += '<button class="wb-btn" onclick="window.WB_go(document.getElementById(\'wb-url\').value)" title="前往">前往</button>';
    html += '<button class="wb-btn" onclick="window.WB_openExternal()" title="在系统浏览器中打开" style="font-size:14px">↗</button>';
    html += '</div>';

    // iframe 区域
    html += '<div id="wb-container" style="flex:1;position:relative;background:#fff">';
    if (currentUrl) {
      html += '<iframe id="wb-iframe" src="' + escHtml(currentUrl) + '" style="width:100%;height:100%;border:none" sandbox="allow-scripts allow-same-origin allow-forms" onerror="window.WB_showFallback()"></iframe>';
    } else {
      html += '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text2);font-size:14px;flex-direction:column;gap:8px">' +
        '<div style="font-size:48px">🌐</div>' +
        '<div>在地址栏输入网址开始浏览</div>' +
        '<div style="font-size:11px;color:var(--text3)">支持预览 HTML 文件、文档站等</div>' +
        '</div>';
    }
    html += '<div id="wb-blocked" style="display:none;position:absolute;inset:0;background:var(--bg);flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px">' +
      '<div style="font-size:40px">🚫</div>' +
      '<div style="font-size:14px;color:var(--text);text-align:center">该页面禁止在 iframe 中显示</div>' +
      '<button class="wb-btn" onclick="window.WB_openExternal()" style="padding:6px 16px;background:var(--accent);color:var(--window-bg);border:none;border-radius:6px;cursor:pointer">↗ 在系统浏览器中打开</button>' +
      '</div>';
    html += '</div>';

    // 状态栏
    html += '<div id="wb-status" style="padding:2px 8px;font-size:10px;color:var(--text2);border-top:1px solid var(--border);flex-shrink:0">就绪</div>';

    w.$c.innerHTML = html;
    w.$c.style.display = 'flex';
    w.$c.style.flexDirection = 'column';
  }

  // ── 导航 ──
  function go(url) {
    if (!url || !url.trim()) return;
    url = url.trim();
    // 没有协议头则补 http://
    if (!/^https?:\/\//i.test(url)) {
      url = 'http://' + url;
    }
    var input = document.getElementById('wb-url');
    if (input) input.value = url;

    if (currentUrl) historyStack.push(currentUrl);
    currentUrl = url;

    var container = document.getElementById('wb-container');
    if (!container) return;
    container.innerHTML = '<iframe id="wb-iframe" src="' + escHtml(url) + '" style="width:100%;height:100%;border:none" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>' +
      '<div id="wb-blocked" style="display:none;position:absolute;inset:0;background:var(--bg);flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px">' +
      '<div style="font-size:40px">🚫</div>' +
      '<div style="font-size:14px;color:var(--text);text-align:center">该页面禁止在 iframe 中显示</div>' +
      '<button class="wb-btn" onclick="window.WB_openExternal()" style="padding:6px 16px;background:var(--accent);color:var(--window-bg);border:none;border-radius:6px;cursor:pointer">↗ 在系统浏览器中打开</button>' +
      '</div>';

    setStatus('加载 ' + url + ' …');
    updateNavBtns();

    // 检测 iframe 是否被屏蔽
    var iframe = document.getElementById('wb-iframe');
    if (iframe) {
      iframe.addEventListener('load', function() {
        setStatus('完成');
      });
      // 某些浏览器在 X-Frame-Options 拒绝时触发 error 事件
      iframe.addEventListener('error', function() {
        showBlocked();
      });
      // 兜底：2 秒后检查
      setTimeout(function() {
        try {
          if (iframe.contentDocument || iframe.contentWindow) {
            // 如果能访问，说明加载正常
          }
        } catch(e) {
          // 跨域或屏蔽
          showBlocked();
        }
      }, 2000);
    }
  }

  function showBlocked() {
    var blocked = document.getElementById('wb-blocked');
    if (blocked) blocked.style.display = 'flex';
    setStatus('该页面禁止在 iframe 中显示');
  }

  function setStatus(msg) {
    var el = document.getElementById('wb-status');
    if (el) el.textContent = msg;
  }

  function updateNavBtns() {
    var back = document.getElementById('wb-back');
    var fwd = document.getElementById('wb-forward');
    if (back) back.style.opacity = historyStack.length > 0 ? '1' : '0.4';
    if (fwd) fwd.style.opacity = '0.4'; // 暂不支持前进
  }

  function goBack() {
    if (historyStack.length === 0) return;
    var url = historyStack.pop();
    currentUrl = url;
    var input = document.getElementById('wb-url');
    if (input) input.value = url;
    var container = document.getElementById('wb-container');
    if (container) {
      container.innerHTML = '<iframe id="wb-iframe" src="' + escHtml(url) + '" style="width:100%;height:100%;border:none" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>' +
        '<div id="wb-blocked" style="display:none;position:absolute;inset:0;background:var(--bg);flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px">' +
        '<div style="font-size:40px">🚫</div>' +
        '<div style="font-size:14px;color:var(--text);text-align:center">该页面禁止在 iframe 中显示</div>' +
        '<button class="wb-btn" onclick="window.WB_openExternal()" style="padding:6px 16px;background:var(--accent);color:var(--window-bg);border:none;border-radius:6px;cursor:pointer">↗ 在系统浏览器中打开</button>' +
        '</div>';
    }
    setStatus('就绪');
    updateNavBtns();
  }

  function refresh() {
    if (currentUrl) go(currentUrl);
  }

  function openExternal() {
    var url = document.getElementById('wb-url');
    if (url && url.value.trim()) {
      window.open(url.value.trim(), '_blank');
    }
  }

  // ── 辅助 ──
  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── 全局函数 ──
  window.WB_go = function(url) { go(url); };
  window.WB_goBack = goBack;
  window.WB_goForward = function() {};
  window.WB_refresh = refresh;
  window.WB_openExternal = openExternal;
  window.WB_showFallback = showBlocked;

  // 启动浏览器窗口
  window.openWebBrowser = function() {
    if (window.ACMSWin) {
      if (!ACMSWin.isActive()) ACMSWin.enable();
      ACMSWin.open('web-browser', { w: 820, h: 560, title: '🌐 浏览器' });
    }
  };

  // ── 注册 viewLoader ──
  if (window.ACMSWin) {
    // v0.58 包注册
    if (window.ACMS && ACMS.registerPackage) {
      ACMS.registerPackage('web-browser', {
        title: '浏览器', icon: '🌐', category: '工具',
        defaultSize: { w: 820, h: 560 },
        loader: function(w) {
          render(w);
          var opts = arguments[1] || {};
          if (opts && opts.url) {
            go(opts.url);
          }
        }
      });
    } else {
      ACMSWin.registerViewLoader('web-browser', function(w) {
        render(w);
        var opts = arguments[1] || {};
        if (opts && opts.url) {
          go(opts.url);
        }
      });
    }
  }

})();
