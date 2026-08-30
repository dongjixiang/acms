'use strict';

// ACMS · 邮件应用 v0.74
// 三栏（文件夹 / 邮件列表 / 阅读/写信）布局，所有事件、DOM 状态、按钮
// 都绑定到 ACMSWin 提供的 root 容器；不依赖全局 EM_* 接口。HTML 邮件内容
// 通过 sanitizeEmailHtml 过滤后再 innerHTML。SMTP 发送使用 Content-Type:
// application/json，附件走 /api/chat/upload。

(function (root) {
  var API_KEY = (root.ACMSConfig && root.ACMSConfig.apiKey) || 'dev-key-001';
  var DRAFT_KEY = 'acms.email-draft.v1';
  var MAX_BODY_LENGTH = 5000;
  var HTML_LIKE_TAGS = {
    'SCRIPT': true, 'STYLE': true, 'IFRAME': true, 'OBJECT': true,
    'EMBED': true, 'LINK': true, 'META': true, 'FORM': true, 'INPUT': true,
    'BUTTON': true, 'TEXTAREA': true, 'SELECT': true, 'BASE': true,
  };
  var ALLOWED_ATTRS = {
    '*': ['style', 'title', 'lang'],
    'A': ['href', 'name', 'target', 'rel'],
    'IMG': ['src', 'alt', 'width', 'height'],
    'TABLE': ['align', 'border', 'cellpadding', 'cellspacing', 'width'],
    'TH': ['colspan', 'rowspan', 'align', 'valign', 'width'],
    'TD': ['colspan', 'rowspan', 'align', 'valign', 'width'],
  };

  function escHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escAttr(value) {
    return escHtml(value);
  }

  function buildUrl(path, query) {
    if (!query) return path;
    var pairs = [];
    for (var key in query) {
      if (!Object.prototype.hasOwnProperty.call(query, key)) continue;
      var v = query[key];
      if (v === undefined || v === null) continue;
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(v));
    }
    return pairs.length ? path + (path.indexOf('?') >= 0 ? '&' : '?') + pairs.join('&') : path;
  }

  function apiFetch(method, path, body) {
    var headers = { 'X-API-Key': API_KEY };
    var init = { method: method, headers: headers };
    if (body !== undefined && body !== null) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return fetch(path, init).then(function (response) {
      var dataPromise = response.json().catch(function () { return {}; });
      return dataPromise.then(function (data) {
        if (!response.ok) {
          var err = new Error((data && (data.message || data.error)) || ('HTTP ' + response.status));
          err.status = response.status;
          err.code = (data && data.error) || 'HTTP_ERROR';
          err.payload = data;
          throw err;
        }
        return data;
      });
    });
  }

  function showToast(message, type) {
    if (typeof root.toast === 'function') {
      root.toast(message, type || 'info');
    } else if (root.ACMS && typeof root.ACMS.toast === 'function') {
      root.ACMS.toast(message, type || 'info');
    }
  }

  function showConfirm(message, opts) {
    if (typeof root.showConfirm === 'function') return root.showConfirm(message, opts);
    if (root.ACMS && typeof root.ACMS.showConfirm === 'function') return root.ACMS.showConfirm(message, opts);
    return Promise.resolve(root.confirm(message));
  }

  function showPrompt(message, defaultValue) {
    if (typeof root.showPrompt === 'function') return root.showPrompt(message, defaultValue);
    if (root.ACMS && typeof root.ACMS.showPrompt === 'function') return root.ACMS.showPrompt(message, defaultValue);
    return Promise.resolve(root.prompt(message, defaultValue || ''));
  }

  function sanitizeEmailHtml(html) {
    if (!html) return '';
    var doc;
    try {
      doc = new DOMParser().parseFromString(String(html), 'text/html');
    } catch (err) {
      return escHtml(String(html));
    }
    if (!doc || !doc.body) return escHtml(String(html));
    var walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, null, false);
    var toRemove = [];
    var node = walker.currentNode;
    while (node) {
      var tag = node.tagName ? node.tagName.toUpperCase() : '';
      if (HTML_LIKE_TAGS[tag]) {
        toRemove.push(node);
      } else if (tag === 'A') {
        for (var i = node.attributes.length - 1; i >= 0; i--) {
          var attr = node.attributes[i];
          if (!isAttrAllowed(tag, attr.name)) node.removeAttribute(attr.name);
        }
        var href = node.getAttribute('href') || '';
        if (/^\s*javascript:/i.test(href)) node.removeAttribute('href');
        if (!node.getAttribute('rel')) node.setAttribute('rel', 'noopener noreferrer');
        if (!node.getAttribute('target')) node.setAttribute('target', '_blank');
      } else if (tag === 'IMG') {
        for (var j = node.attributes.length - 1; j >= 0; j--) {
          var a = node.attributes[j];
          if (!isAttrAllowed(tag, a.name)) node.removeAttribute(a.name);
        }
        var src = node.getAttribute('src') || '';
        if (!/^(https?:|data:image\/|cid:)/i.test(src)) node.removeAttribute('src');
        if (!node.getAttribute('alt')) node.setAttribute('alt', '');
      } else {
        for (var k = node.attributes.length - 1; k >= 0; k--) {
          var at = node.attributes[k];
          if (!isAttrAllowed(tag, at.name)) node.removeAttribute(at.name);
        }
      }
      node = walker.nextNode();
    }
toRemove.forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
    return doc.body.innerHTML;
  }

  // 方案 B：iframe 渲染专用 sanitize —— 保留 <style>/<link>/内联 style/class，只清理脚本/危险属性
  function sanitizeEmailHtmlForIframe(html, attachments, uid, mailbox) {
    if (!html) return '';
    var doc;
    try {
      doc = new DOMParser().parseFromString(String(html), 'text/html');
    } catch (err) {
      return escHtml(String(html));
    }
    if (!doc || !doc.body) return escHtml(String(html));
    var walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, null, false);
    var toRemove = [];
    var node = walker.currentNode;
    while (node) {
      var tag = node.tagName ? node.tagName.toUpperCase() : '';
      // 只移除真正危险的标签
      if (['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT'].indexOf(tag) >= 0) {
        toRemove.push(node);
      } else if (tag === 'A') {
        // 链接安全处理
        for (var i = node.attributes.length - 1; i >= 0; i--) {
          var attr = node.attributes[i];
          if (attr.name.indexOf('on') === 0) node.removeAttribute(attr.name);
        }
        var href = node.getAttribute('href') || '';
        if (/^\s*javascript:/i.test(href)) node.removeAttribute('href');
        if (!node.getAttribute('rel')) node.setAttribute('rel', 'noopener noreferrer');
        if (!node.getAttribute('target')) node.setAttribute('target', '_blank');
      } else if (tag === 'LINK') {
        // 允许 stylesheet，清理危险属性
        var rel = node.getAttribute('rel') || '';
        if (!/stylesheet/i.test(rel)) { toRemove.push(node); continue; }
        for (var j = node.attributes.length - 1; j >= 0; j--) {
          var at = node.attributes[j];
          if (at.name.indexOf('on') === 0) node.removeAttribute(at.name);
        }
      } else if (tag === 'STYLE') {
        // 保留 style 标签，但清理危险内容（如 expression()、@import javascript:）
        var css = node.textContent || '';
        node.textContent = css.replace(/expression\s*\(/gi, 'blocked-expression(')
                             .replace(/@import\s+["']?\s*javascript:/gi, '@import blocked:');
      } else if (tag === 'META') {
        // 允许 viewport/charset，移除 http-equiv=refresh 等
        var httpEquiv = node.getAttribute('http-equiv');
        if (httpEquiv && /refresh/i.test(httpEquiv)) toRemove.push(node);
      } else {
        // 通用：移除所有 on* 事件属性
        for (var k = node.attributes.length - 1; k >= 0; k--) {
          var ak = node.attributes[k];
          if (ak.name.indexOf('on') === 0) node.removeAttribute(ak.name);
        }
      }
      node = walker.nextNode();
    }
    toRemove.forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });

    // 处理图片：cid: 引用 → 附件下载链接；相对路径 → 补全 base href
    // 需要邮件的 attachments 列表和 uid 来构建下载 URL
    if (attachments && attachments.length && uid) {
      var imgNodes = doc.querySelectorAll('img[src]');
      for (var i = 0; i < imgNodes.length; i++) {
        var img = imgNodes[i];
        var src = img.getAttribute('src') || '';
        // cid: 引用 → 查找对应附件 partID → 生成下载 URL
        if (/^cid:/i.test(src)) {
          var cid = src.slice(4).replace(/[<>]/g, ''); // 去掉 cid: 和可能的 < >
          // 在 attachments 中找匹配的 partID 或 name
          var matchedAtt = null;
          for (var ai = 0; ai < attachments.length; ai++) {
            var att = attachments[ai];
            // partID 可能包含 cid 的内容，或 name 匹配
            if (att.partID && (att.partID.indexOf(cid) >= 0 || cid.indexOf(att.partID) >= 0)) {
              matchedAtt = att; break;
            }
            if (att.name && (att.name.indexOf(cid) >= 0 || cid.indexOf(att.name) >= 0)) {
              matchedAtt = att; break;
            }
          }
          if (matchedAtt) {
            var downloadUrl = buildUrl('/api/emails/' + uid + '/attachment/' + encodeURIComponent(matchedAtt.partID), {
              mailbox: mailbox,
              api_key: API_KEY,
              name: matchedAtt.name,
              type: matchedAtt.type,
            });
            img.setAttribute('src', downloadUrl);
          } else {
            // 找不到对应附件，移除 src 避免破碎图标
            img.removeAttribute('src');
          }
        }
        // 相对路径（非 http/https/data/cid）保留，靠 base href 解析
      }
    }

    // 补全 base href（让相对路径图片/CSS 能按邮件域名解析）——留空 target=_blank 让链接在新标签页打开
    // 注意：无法获知邮件原始域名，base href 留空则相对路径按当前 origin (ACMS) 解析，可能 404
    // 这里不设置 href，仅设 target；若邮件 HTML 含 <base href="..."> 会被保留
    var base = doc.createElement('base');
    base.setAttribute('target', '_blank');
    if (doc.head) doc.head.insertBefore(base, doc.head.firstChild);

    return '<!DOCTYPE html><html><head>' + (doc.head ? doc.head.innerHTML : '') + '</head><body>' + doc.body.innerHTML + '</body></html>';
  }

  function isAttrAllowed(tag, attr) {
    var name = String(attr || '').toLowerCase();
    if (name.indexOf('on') === 0) return false;
    var allow = ALLOWED_ATTRS[tag] || [];
    if (allow.indexOf(name) >= 0) return true;
    var any = ALLOWED_ATTRS['*'] || [];
    return any.indexOf(name) >= 0;
  }

  function formatDate(dateValue) {
    if (!dateValue) return '';
    var d = new Date(dateValue);
    if (isNaN(d.getTime())) return String(dateValue);
    var now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    var yearDiff = now.getFullYear() - d.getFullYear();
    if (yearDiff >= 1) {
      return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
    }
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function formatSize(bytes) {
    var n = Number(bytes) || 0;
    if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
    if (n > 1024) return (n / 1024).toFixed(0) + ' KB';
    return n + ' B';
  }

  function formatAddress(value) {
    if (!value) return '';
    var angle = String(value).match(/<\s*([^<>]+)\s*>\s*$/);
    return angle ? angle[1] : value;
  }

  function extractName(value) {
    if (!value) return '';
    var angle = String(value).match(/<\s*([^<>]+)\s*>\s*$/);
    var display = angle ? value.replace(/<\s*[^<>]+\s*>\s*$/, '').trim() : value;
    return display || (angle ? angle[1] : '');
  }

  function avatarLetter(value) {
    var name = extractName(value) || formatAddress(value) || '?';
    return name.charAt(0).toUpperCase();
  }

  // ── 附件 → 可用 ACMS 应用 ──
  // 按 MIME / 扩展名推断。ACMS 没有对应应用时返回 []（菜单降级为「仅下载」提示）。
  // 命中规则参考 file-browser.js 的 allApps 列表 + openWithAcms() 的支持范围。
  var ATT_APP_RULES = [
    { app: 'image-editor', label: '🖼️ 图片编辑器',
      mime: /^image\//i,
      exts: ['png','jpg','jpeg','gif','webp','bmp','svg','ico','avif','tif','tiff'] },
    { app: 'code-editor', label: '💻 代码编辑器',
      mime: /^text\/(?!html)/i,
      exts: ['txt','md','json','js','jsx','ts','tsx','py','java','c','cpp','h','hpp','css','scss','sass','less','xml','csv','tsv','log','sh','bash','zsh','yaml','yml','ini','conf','toml','sql','env','gitignore','dockerfile','vue','svelte','go','rs','rb','php','kt','swift','r','lua','pl','asm'] },
    { app: 'web-browser', label: '🌐 浏览器（HTML）',
      mime: /^text\/html/i,
      exts: ['html','htm','mhtml'] },
    { app: 'web-browser', label: '📕 PDF 预览',
      mime: /^application\/pdf/i,
      exts: ['pdf'] },
    { app: 'web-browser', label: '🎬 视频播放',
      mime: /^video\//i,
      exts: ['mp4','webm','mov','avi','mkv','m4v','ogv'] },
    { app: 'web-browser', label: '🎵 音频播放',
      mime: /^audio\//i,
      exts: ['mp3','wav','ogg','m4a','flac','aac','opus'] },
    // Office: 需要先存 workspace 再用 office editor 打开（v0.74 暂未支持附件直传，留 TODO）
    { app: 'office-word', label: '📝 Word 编辑器（暂未支持邮件附件，请下载）',
      mime: /(officedocument\.word|msword)/i,
      exts: ['docx','doc','odt','rtf'] },
    { app: 'office-xlsx', label: '📊 Excel 编辑器（暂未支持邮件附件，请下载）',
      mime: /(officedocument\.spreadsheet|excel)/i,
      exts: ['xlsx','xls','ods'] },
    { app: 'office-pptx', label: '📽️ PPT 编辑器（暂未支持邮件附件，请下载）',
      mime: /(officedocument\.presentation|powerpoint)/i,
      exts: ['pptx','ppt','odp'] },
  ];

  function attachmentExt(name) {
    var s = String(name || '');
    var dot = s.lastIndexOf('.');
    if (dot < 0 || dot === s.length - 1) return '';
    return s.slice(dot + 1).toLowerCase();
  }

  function getAppsForAttachment(name, type) {
    var mime = String(type || '').toLowerCase();
    var ext = attachmentExt(name);
    var apps = [];
    var seen = {};
    ATT_APP_RULES.forEach(function (rule) {
      var match = false;
      if (mime && rule.mime.test(mime)) match = true;
      if (!match && ext && rule.exts.indexOf(ext) >= 0) match = true;
      if (!match) return;
      if (seen[rule.app]) return; // 去重：同一应用多条规则只取第一条 label
      seen[rule.app] = true;
      apps.push({ name: rule.app, label: rule.label, supported: rule.app !== 'office-word' && rule.app !== 'office-xlsx' && rule.app !== 'office-pptx' });
    });
    return apps;
  }

  function attachmentIcon(name, type) {
    var apps = getAppsForAttachment(name, type);
    var mime = String(type || '').toLowerCase();
    var ext = attachmentExt(name);
    if (apps.length) {
      var a = apps[0];
      if (a.name === 'image-editor') return '🖼️';
      if (a.name === 'code-editor') return '📄';
      if (a.name === 'web-browser') {
        if (/^audio\//.test(mime) || ['mp3','wav','ogg','m4a','flac','aac'].indexOf(ext) >= 0) return '🎵';
        if (/^video\//.test(mime) || ['mp4','webm','mov','avi','mkv'].indexOf(ext) >= 0) return '🎬';
        if (/pdf/.test(mime) || ext === 'pdf') return '📕';
        return '🌐';
      }
      if (a.name === 'office-word') return '📝';
      if (a.name === 'office-xlsx') return '📊';
      if (a.name === 'office-pptx') return '📽️';
    }
    // 兜底按扩展名/类型
    if (/zip|rar|7z|tar|gz|gzip/.test(ext)) return '🗜';
    if (/exe|msi|dmg/.test(ext)) return '⚙️';
    return '📎';
  }

  // ── 附件 → 可用 ACMS 应用（实例方法） ──
  EmailApp.prototype.openAttachmentWithAcms = function (appName, att) {
    var emailUid = this.state.detail && this.state.detail.uid;
    var mailbox = this.state.mailbox;
    var url = buildUrl('/api/emails/' + emailUid + '/attachment/' + encodeURIComponent(att.partID), {
      mailbox: mailbox,
      api_key: API_KEY,
      name: att.name,
      type: att.type,
    });
    var self = this;
    if (!window.ACMSFileApps) {
      showToast('文件应用 registry 未加载', 'error');
      return Promise.resolve();
    }
    self.setStatus('打开中…');
    return window.ACMSFileApps.openFileWith(appName, { url: url, name: att.name, mime: att.type })
      .then(function (result) {
        if (result && result.ok) self.setStatus('附件已打开');
        else if (result && result.reason === 'needs-download') {
          showToast('该附件类型需下载到本地后再打开', 'info');
          self.setStatus('需要下载后打开');
        } else {
          showToast('打开失败' + (result && result.error ? ': ' + result.error : ''), 'error');
          self.setStatus('打开失败', 'error');
        }
      });
  };

  // 弹「打开方式」菜单（仿 file-browser.js 的 cx 子菜单）
  // - 有 ACMS 应用：列出可用应用 + 下载兜底
  // - 无 ACMS 应用：只显示「未找到 ACMS 应用」提示 + 下载
  // - 已记住的偏好（localStorage）：直接打开并提示
  EmailApp.prototype.pickAttachmentOpener = function (target) {
    var self = this;
    var li = target.closest('[data-att-name]');
    if (!li) return;
    var name = li.getAttribute('data-att-name');
    var type = li.getAttribute('data-att-type');
    var partID = li.getAttribute('data-att-part');
    var size = parseInt(li.getAttribute('data-att-size') || '0', 10);
    var att = { name: name, type: type, partID: partID, size: size };
    var apps = getAppsForAttachment(name, type);
    var ext = attachmentExt(name);

    // 检查 localStorage 是否记住了偏好（em_att_open_<ext>）
    var assocKey = 'em_att_open_' + ext;
    var preferred = null;
    try { preferred = JSON.parse(localStorage.getItem(assocKey) || 'null'); } catch (e) { preferred = null; }
    if (preferred && apps.some(function (a) { return a.name === preferred; })) {
      this.openAttachmentWithAcms(preferred, att);
      this.setStatus('已用 ' + preferred + ' 打开');
      return;
    }

    // 关闭已有菜单
    var existing = document.querySelectorAll('.em-att-menu');
    existing.forEach(function (m) { m.remove(); });

    var menu = document.createElement('div');
    menu.className = 'em-att-menu';
    var appsHtml = apps.map(function (a) {
      return '<div class="em-att-menu-item' + (a.supported ? '' : ' em-att-menu-disabled') + '" data-app="' + escAttr(a.name) + '">'
        + escHtml(a.label) + (a.supported ? '' : ' <span style="color:var(--text3);font-size:10px">⬇ 下载提示</span>')
        + '</div>';
    }).join('');
    var emptyHint = apps.length === 0
      ? '<div class="em-att-menu-empty">⚠ 未找到 ACMS 应用处理该类型<br/><span style="color:var(--text3);font-size:11px">可下载到本地后用系统应用打开</span></div>'
      : '';
    menu.innerHTML = [
      '<div class="em-att-menu-head">📂 打开方式 · ' + escHtml(name) + '</div>',
      appsHtml,
      emptyHint,
      '<div class="em-att-menu-sep"></div>',
      '<div class="em-att-menu-item" data-action="download">💾 下载到本地</div>',
    ].filter(Boolean).join('');

    var rect = target.getBoundingClientRect();
    var mw = 240, mh = 40 + apps.length * 30 + 24;
    var left = rect.right + 4;
    var top = rect.top;
    if (left + mw > window.innerWidth) left = Math.max(4, rect.left - mw - 4);
    if (top + mh > window.innerHeight) top = Math.max(4, window.innerHeight - mh - 8);
    menu.style.cssText = 'position:fixed;z-index:100000;left:' + left + 'px;top:' + top + 'px';

    // 点击行为
    Array.prototype.forEach.call(menu.querySelectorAll('[data-app]'), function (el) {
      el.addEventListener('click', function () {
        var app = el.getAttribute('data-app');
        var matched = apps.find(function (a) { return a.name === app; });
        menu.remove();
        if (matched && matched.supported) {
          self.openAttachmentWithAcms(app, att);
        } else if (matched && !matched.supported) {
          // Office 等暂未支持的：提示 + 引导下载
          showToast('该附件需下载后再打开', 'info');
          self.downloadAttachmentFromLi(li);
        }
      });
    });
    Array.prototype.forEach.call(menu.querySelectorAll('[data-action="download"]'), function (el) {
      el.addEventListener('click', function () {
        menu.remove();
        self.downloadAttachmentFromLi(li);
      });
    });

    function close() {
      if (menu.parentNode) menu.parentNode.removeChild(menu);
      document.removeEventListener('click', close);
      document.removeEventListener('contextmenu', close);
    }
    setTimeout(function () {
      document.addEventListener('click', close);
      document.addEventListener('contextmenu', close);
    }, 0);

    document.body.appendChild(menu);
  };

  // 触发附件下载（点击「下载」按钮或菜单的下载项时）
  EmailApp.prototype.downloadAttachmentFromLi = function (li) {
    var a = li.querySelector('a.em-btn-link');
    if (!a) return;
    // 复用现成的 <a> 链接 → target=_blank 触发下载
    window.open(a.href, '_blank');
  };

  // v0.74.1: 客户端 RFC 2047 解码（兜底 server 端可能未解码的情况）
  function decodeMimeWord(text) {
    if (!text) return '';
    var re = /=\?([^?]+)\?([BbQq])\?([^?]*?)\?=/g;
    return String(text).replace(re, function(_m, charset, enc, data) {
      try {
        var encUpper = enc.toUpperCase();
        var buf;
        if (encUpper === 'B') {
          buf = _atob(data);
        } else {
          var q = data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, function(_x, h) { return String.fromCharCode(parseInt(h, 16)); });
          // Q encoding 单字节 = latin1 char
          buf = _strToLatin1(q);
        }
        var cs = String(charset).toLowerCase().replace(/^["']|["']$/g, '');
        if (cs === 'utf-8' || cs === 'utf8') {
          try { return _decodeUtf8(buf); } catch (_) { return buf; }
        }
        if (cs === 'gb2312' || cs === 'gbk' || cs === 'gb18030') return _decodeGbk(buf);
        if (cs === 'big5') return _decodeBig5(buf);
        return buf;
      } catch (e) { return _m; }
    });
  }
  function _atob(b64) {
    try { return atob(b64); } catch (e) {
      // polyfill for older browsers (we don't expect this in ACMS, but safety)
      var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      var buffer = [];
      var i = 0;
      while (i < b64.length) {
        var c1 = chars.indexOf(b64.charAt(i++));
        var c2 = chars.indexOf(b64.charAt(i++));
        var c3 = chars.indexOf(b64.charAt(i++));
        var c4 = chars.indexOf(b64.charAt(i++));
        buffer.push(String.fromCharCode((c1 << 2) | (c2 >> 4)));
        if (c3 !== -1) buffer.push(String.fromCharCode(((c2 & 15) << 4) | (c3 >> 2)));
        if (c4 !== -1) buffer.push(String.fromCharCode(((c3 & 3) << 6) | c4));
      }
      return buffer.join('');
    }
  }
  function _strToLatin1(s) {
    // 把 latin1 char 序列转成 UTF-8 字符串
    try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
  }
  function _decodeUtf8(latin1Str) {
    // latin1Str 是 8-bit char 序列，按 utf-8 字节解码
    var bytes = [];
    for (var i = 0; i < latin1Str.length; i++) bytes.push(latin1Str.charCodeAt(i) & 0xff);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)); } catch (e) { return latin1Str; }
  }
  function _decodeGbk(latin1Str) {
    var bytes = [];
    for (var i = 0; i < latin1Str.length; i++) bytes.push(latin1Str.charCodeAt(i) & 0xff);
    if (window.ACMSIconv && window.ACMSIconv.gbk) {
      try { return window.ACMSIconv.gbk(bytes); } catch (e) {}
    }
    return _decodeUtf8(latin1Str); // 兜底 utf8
  }
  function _decodeBig5(latin1Str) {
    if (window.ACMSIconv && window.ACMSIconv.big5) {
      try { return window.ACMSIconv.big5(latin1Str); } catch (e) {}
    }
    return _decodeUtf8(latin1Str);
  }
  // 完整 header 解码（含 RFC 5322 多行折叠）
  function decodeEmailHeader(s) {
    if (!s) return '';
    var folded = String(s).replace(/\r\n[ \t]+/g, '');
    return decodeMimeWord(folded);
  }

  // v0.74.1: body 解码（兜底 server 端可能没按 Content-Transfer-Encoding 解码）
  function decodeEmailBody(text, mime) {
    if (!text) return '';
    var s = String(text);
    var trimmed = s.replace(/\s+/g, '');
    // base64 检测：全是 base64 字符 + 长度合理（不要 % 4 限制，因为 atob 自动处理）
    if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length >= 16) {
      try {
        var decoded = _atob(trimmed);
        var cs = String(mime || '').toLowerCase().replace(/^["']|["']$/g, '');
        if (cs === 'gb2312' || cs === 'gbk' || cs === 'gb18030') return _decodeGbk(decoded);
        return _decodeUtf8(decoded);
      } catch (e) { return s; }
    }
    // quoted-printable 检测：含 =XX 或 =_ 或软换行
    if (/=[0-9A-Fa-f]{2}/.test(s) || /=_/.test(s) || /=\r?\n/.test(s)) {
      try {
        // 1) 先处理软换行 =CRLF / =LF → 直接删除（不加空格）
        var q = s.replace(/=\r?\n/g, '');
        // 2) =_ → 空格
        q = q.replace(/=_/g, ' ');
        // 3) =XX → 字节
        q = q.replace(/=([0-9A-Fa-f]{2})/g, function(_x, h) { return String.fromCharCode(parseInt(h, 16)); });
        return _decodeUtf8(q);
      } catch (e) { return s; }
    }
    return s;
  }


  // CSS attribute selector 转义（处理文件名中可能出现的引号/反斜杠等）
  function cssEscape(s) {
    return String(s || '').replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"');
  }


  // ── 应用入口：每个 ACMSWin 独立一个实例 ──
  function EmailApp(windowRef) {
    this.window = windowRef;
    this.root = (windowRef && windowRef.$c) || null;
    if (!this.root) throw new Error('email: ACMSWin root is required');

    this.state = {
      account: null,
      mailboxes: [],
      mailbox: 'INBOX',
      emails: [],
      total: 0,
      offset: 0,
      limit: 30,
      selectedUid: null,
      detail: null,
      composerOpen: false,
      composerData: null,
      attachmentCount: 0,
      attachmentBytes: 0,
      loading: false,
      searchKeyword: '',
      draftTimer: null,
      // 'idle' | 'sending'
      sendInFlight: false,
      // v0.37: AI 分类筛选（'' 表示全部；其他值来自 email-classifier 8 类别）
      categoryFilter: '',
      // v0.37: 当前邮件所有已分类集合（用于筛选 chip 显示）
      availableCategories: ['客户咨询','会议邀请','工作协作','财务发票','营销订阅','求职招聘','自动通知','其他'],
      // v0.37: 视图状态：'main' | 'settings'
      currentView: 'main',
      settingsCategory: 'rules',
      rulesSubTab: 'config',
    };
    this.templates = {};
  }

  EmailApp.prototype.init = function () {
    var self = this;
    this.render();
    this.loadAccount()
      .then(function () { return self.loadMailboxes(); })
      .then(function () { return self.loadEmails(); })
      .catch(function (err) {
        if (err && err.code === 'IMAP_CONNECT_FAILED') return;
        self.setStatus('初始化失败: ' + (err && err.message || '未知错误'), 'error');
      });
  };

  EmailApp.prototype.render = function () {
    var self = this;

    this.root.innerHTML = [
      '<div class="em-app" data-state="idle">',
'  <aside class="em-side" aria-label="邮箱文件夹">',
      '    <div class="em-side-head"><span>📬</span><b>邮件</b> <button type="button" class="em-btn" data-action="settings" title="设置：规则引擎（完整解析/预览/确认卡片/日志）· 邮箱账户 · 通知设置 — 每项带悬停说明（参考记忆：指标/按钮hover必须带说明）" style="margin-left:auto;padding:3px 8px;font-size:10px;">⚙️ 设置</button></div>',
      '    <ul class="em-folders" data-role="folders"></ul>',
      '  </aside>',
      '  <section class="em-list" aria-label="邮件列表">',
      '    <div class="em-list-head">',
      '      <input type="search" class="em-input" data-role="search" placeholder="搜索主题、邮件地址、正文…" />',
      '      <button type="button" class="em-btn" data-action="refresh" title="刷新">↻</button>',
      // v0.74.1: 写信按钮移到邮件列表栏顶部（紧邻搜索框）— 之前在左侧底部，被邮件列表挡住一半
      '      <button type="button" class="em-btn em-btn-primary em-btn-compose" data-action="compose" title="写新邮件">✉ 写信</button>',


      '    </div>',
      '    <div class="em-list-body" data-role="list"></div>',
      '    <div class="em-category-filter" data-role="category-filter" style="padding:8px 14px;border-top:1px solid var(--border);background:var(--bg3);display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:11px;">',
      '      <span style="font-size:10px;color:var(--text3);font-weight:700;letter-spacing:.04em;margin-right:4px;" title="按 AI 分类筛选邮件（参考 email-classifier.js 8 类别，AI 自动分类的结果可在此筛选）">🗂 按分类筛选</span>',
      self.renderCategoryFilterChips(),
      '    </div>',
      '    <div class="em-list-foot" data-role="pager">',
      '      <button type="button" class="em-btn" data-action="prev" disabled>‹ 上一页</button>',
      '      <span data-role="pager-info">–</span>',
      '      <button type="button" class="em-btn" data-action="next" disabled>下一页 ›</button>',
      '    </div>',
      '  </section>',
      '  <main class="em-pane" data-role="pane" tabindex="0">',
      '    <div class="em-pane-empty" data-role="pane-empty">',
      '      <div class="em-pane-empty-emoji">📭</div>',
      // 提示文案同步更新（写信按钮现在在列表上方）
      '      <p>选择左侧邮件查看详情，或点击列表栏上方「✉ 写信」。</p>',
      '    </div>',
      '  </main>',
      '  <div class="em-status" data-role="status" aria-live="polite">就绪</div>',
      '</div>',
    ].join('');
    this.bindEvents();
    this.setStatus('就绪');
  };

  EmailApp.prototype.bindEvents = function () {
    var self = this;
    var root = this.root;

    root.addEventListener('click', function (event) {
      var target = event.target.closest('[data-action]');
      if (target) {
        var action = target.getAttribute('data-action');
        if (action === 'compose') return self.openComposer();
        if (action === 'refresh') return self.refresh();
        if (action === 'prev') return self.gotoPage(-1);
        if (action === 'next') return self.gotoPage(1);
        if (action === 'back-to-list') return self.closeDetail();
        if (action === 'composer-discard') return self.discardComposer();
        if (action === 'composer-send') return self.submitComposer();
        if (action === 'composer-attach') return self.openAttachmentPicker();
        if (action === 'composer-template') return self.applyComposerTemplate(target.getAttribute('data-template'));
        if (action === 'composer-format') return self.toggleFormat(target.getAttribute('data-format'));
        if (action === 'remove-attachment') {
          var id = target.getAttribute('data-id');
          return self.removeAttachment(id);
        }
        if (action === 'reply') return self.openComposer({ kind: 'reply' });
        if (action === 'reply-all') return self.openComposer({ kind: 'reply-all' });
        if (action === 'forward') return self.openComposer({ kind: 'forward' });
        if (action === 'load-remote') return self.loadRemoteImages(target);
        if (action === 'attachment-open') return self.pickAttachmentOpener(target);
        // v0.74.2: 列表项操作（删除 / 移动 / 标已读）
        if (action === 'email-delete') return self.deleteEmail(target.getAttribute('data-uid'), target);
        if (action === 'email-move') return self.pickMoveTarget(target.getAttribute('data-uid'), target);
        if (action === 'email-toggle-read') return self.toggleRead(target);
        // v0.38: 恢复 AI 草拟回复按钮（保留在详情头部，不恢复分类入口）
        if (action === 'email-ai-draft-reply') return self.aiDraftReply(self.state.detail && self.state.detail.uid);
        // v0.37: 邮件列表/详情中的 AI 分类入口已移除 — 用户要求「邮件中的AI分类可以去掉」
        // 保留 AI 方法定义（aiClassifyEmail/aiBulkAnalyze）以兼容历史调用，但 UI 上不再暴露入口
        // v0.36: 规则引擎快速入口（点击后右栏内嵌显示 — 主入口在设置界面内的「规则引擎」分类）
        if (action === 'email-rules') return self.showRulesPanel();
        // v0.36: 进入设置界面（全屏整页切换 — 主界面 ↔ 设置界面，不是右栏内嵌）
        if (action === 'settings') return self.showSettingsView();
        // v0.36: 返回主界面（从设置界面返回）
        if (action === 'back-to-main') return self.backToMainView();
        // v0.36: 切换设置分类
        if (action === 'settings-category') return self.showSettingsCategory(target.getAttribute('data-category'));
        // v0.38: 用户维护的分类管理（CRUD）
        if (action === 'add-category') return self.addCategory();
        if (action === 'edit-category') return self.editCategory(target.getAttribute('data-cat-id'));
        if (action === 'delete-category') return self.deleteCategory(target.getAttribute('data-cat-id'));
        if (action === 'refresh-categories') return self.loadCategories();
        if (action === 'seed-categories') return self.seedCategories();
        // v0.38: 启动/停止 IMAP IDLE 实时监听（集成 mail-listener — 推荐1）
        if (action === 'start-listening') return self.startListening();
        if (action === 'stop-listening') return self.stopListening();
        if (action === 'refresh-listening') return self.refreshListeningStatus();
        // v0.36: 切换规则引擎子页签（配置/列表/模板/日志）
        if (action === 'rules-sub-tab') return self.showRulesSubTab(target.getAttribute('data-sub'));
        if (action === 'refresh-rule-list') return self.loadRuleList(true);
        if (action === 'rule-parse') return self.parseRuleInput();
        if (action === 'rule-save') return self.saveRule();
        // v0.36: 删除规则（防 silent write — 显式确认）
        if (action === 'delete-rule') return self.deleteRule(target.getAttribute('data-rule-id'));
        // v0.99: 模板管理事件
        if (action === 'template-add') return self.showTemplateModal();
        if (action === 'template-edit') return self.showTemplateModal(target.getAttribute('data-tpl-id'));
        if (action === 'template-delete') return self.deleteTemplate(target.getAttribute('data-tpl-id'));
        // v0.36: 按 AI 分类筛选邮件
        if (action === 'filter-by-category') return self.filterByCategory(target.getAttribute('data-category'));
        return;
      }
      var folder = event.target.closest('[data-role="folder"]');
      if (folder) return self.selectMailbox(folder.getAttribute('data-mailbox'));
      var item = event.target.closest('[data-role="item"]');
      if (item) return self.openEmail(parseInt(item.getAttribute('data-uid'), 10));
    });

    var search = root.querySelector('[data-role="search"]');
    if (search) {
      var debounce;
      search.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () {
          self.runSearch(search.value.trim());
        }, 220);
      });
      search.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          self.runSearch(search.value.trim());
        } else if (event.key === 'Escape') {
          search.value = '';
          self.runSearch('');
        }
      });
    }

    root.addEventListener('keydown', function (event) {
      if (!self.state.composerOpen) return;
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        self.submitComposer();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        self.discardComposer();
      }
    });

    root.addEventListener('dragover', function (event) {
      if (!self.state.composerOpen) return;
      if (event.dataTransfer && Array.prototype.indexOf.call(event.dataTransfer.types || [], 'Files') >= 0) {
        event.preventDefault();
        root.querySelector('.em-composer').classList.add('em-drop-active');
      }
    });
    root.addEventListener('dragleave', function (event) {
      if (!event.relatedTarget || !root.contains(event.relatedTarget)) {
        var composer = root.querySelector('.em-composer');
        if (composer) composer.classList.remove('em-drop-active');
      }
    });
    root.addEventListener('drop', function (event) {
      if (!self.state.composerOpen) return;
      if (!event.dataTransfer || !event.dataTransfer.files) return;
      event.preventDefault();
      var composer = root.querySelector('.em-composer');
      if (composer) composer.classList.remove('em-drop-active');
      self.uploadFiles(event.dataTransfer.files);
    });

    if (this.window && typeof this.window.on === 'function') {
      this.window.on('destroy', function () {
        clearTimeout(self.state.draftTimer);
        self.persistDraft(true);
      });
    }
  };

  EmailApp.prototype.setStatus = function (text, level) {
    var el = this.root.querySelector('[data-role="status"]');
    if (el) {
      el.textContent = text || '';
      el.dataset.level = level || 'info';
    }
  };


  // v0.36: HTML 转义辅助（设置界面渲染用）
  EmailApp.prototype.escapeHtml = function (value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };
  EmailApp.prototype.loadAccount = function () {
    var self = this;
    return apiFetch('GET', '/api/emails/account').then(function (account) {
      self.state.account = account;
    }).catch(function () {
      self.state.account = { configured: false, email: '', name: '', limits: { recipients: 50, attachments: 10, attachmentBytes: 25 * 1024 * 1024 } };
    });
  };

  EmailApp.prototype.loadMailboxes = function () {
    var self = this;
    return apiFetch('GET', '/api/emails/mailboxes').then(function (data) {
      var mailboxes = (data && data.mailboxes) || [];
      if (!mailboxes.length) {
        mailboxes = [{ name: 'INBOX' }];
      }
      self.state.mailboxes = mailboxes;
      if (!mailboxes.some(function (box) { return box.name === self.state.mailbox; })) {
        self.state.mailbox = mailboxes[0].name;
      }
      self.renderFolders();
    });
  };

  EmailApp.prototype.renderFolders = function () {
    var list = this.root.querySelector('[data-role="folders"]');
    if (!list) return;
    var html = this.state.mailboxes.map(function (box) {
      var label = box.name || 'INBOX';
      var marker = box.flags && box.flags.indexOf('\\Noselect') >= 0 ? ' (只读)' : '';
      return '<li class="em-folder" data-role="folder" data-mailbox="' + escAttr(label) + '">'
        + '<span class="em-folder-icon">📁</span>'
        + '<span class="em-folder-name">' + escHtml(label) + escHtml(marker) + '</span>'
        + '</li>';
    }).join('');
    list.innerHTML = html;
    this.highlightFolder();
  };

  EmailApp.prototype.highlightFolder = function () {
    var nodes = this.root.querySelectorAll('[data-role="folder"]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.getAttribute('data-mailbox') === this.state.mailbox) {
        node.classList.add('em-folder-active');
      } else {
        node.classList.remove('em-folder-active');
      }
    }
  };

  EmailApp.prototype.selectMailbox = function (name) {
    if (!name || name === this.state.mailbox) return;
    this.state.mailbox = name;
    this.state.offset = 0;
    this.highlightFolder();
    this.loadEmails();
  };

  EmailApp.prototype.loadEmails = function () {
    var self = this;
    if (self.state.loading) return;
    self.state.loading = true;
    self.setStatus('加载邮件…');
    var query = {
      mailbox: self.state.mailbox,
      limit: self.state.limit,
      offset: self.state.offset,
    };
    return apiFetch('GET', buildUrl('/api/emails', query))
      .then(function (data) {
        self.state.emails = (data && data.emails) || [];
        self.state.total = (data && data.total) || 0;
        // v0.74.1: client-side RFC 2047 decode（兜底 server 端可能没解码）
        self.state.emails.forEach(function (em) { em.subject = decodeEmailHeader(em.subject); em.from = decodeEmailHeader(em.from); });
        self.renderList();
        // v0.33: 加载邮件后拉一次已持久化的 sender categories（chip 渲染用）
        self.refreshSenderCategories();
        self.setStatus(self.state.total + ' 封邮件，显示 ' + self.state.emails.length + ' 封');
      })
      .catch(function (err) {
        self.setStatus('加载失败: ' + err.message, 'error');
        self.renderError(err);
      })
      .then(function () { self.state.loading = false; });
  };

  EmailApp.prototype.runSearch = function (keyword) {
    var self = this;
    self.state.searchKeyword = keyword;
    if (!keyword) return self.loadEmails();
    self.setStatus('搜索: ' + keyword);
    return apiFetch('GET', buildUrl('/api/emails/search', { q: keyword, mailbox: self.state.mailbox, limit: 50 }))
      .then(function (data) {
        self.state.emails = (data && data.emails) || [];
        self.state.total = (data && data.total) || self.state.emails.length;
        self.state.offset = 0;
        // v0.74.1: client-side RFC 2047 decode（兜底 server 端可能没解码）
        self.state.emails.forEach(function (em) { em.subject = decodeEmailHeader(em.subject); em.from = decodeEmailHeader(em.from); });
        self.renderList();
        // v0.33: 搜索结果也要拉 categories
        self.refreshSenderCategories();
      })
      .catch(function (err) {
        self.setStatus('搜索失败: ' + err.message, 'error');
      });
  };

  EmailApp.prototype.refresh = function () {
    this.state.offset = 0;
    if (this.state.searchKeyword) {
      return this.runSearch(this.state.searchKeyword);
    }
    return this.loadEmails();
  };

  EmailApp.prototype.gotoPage = function (delta) {
    var next = this.state.offset + delta * this.state.limit;
    if (next < 0) next = 0;
    if (next >= this.state.total) return;
    this.state.offset = next;
    this.loadEmails();
  };

  EmailApp.prototype.renderList = function () {
    var body = this.root.querySelector('[data-role="list"]');
    if (!body) return;
    var self = this;
    // v0.37: 应用 AI 分类筛选（前端过滤 — 不重新请求后端，避免性能开销）
    var emailsToShow = this.state.emails || [];
    if (this.state.categoryFilter) {
      emailsToShow = emailsToShow.filter(function (email) {
        var cat = self.senderCategoryForEmail(email.from);
        return cat && cat.category === self.state.categoryFilter;
      });
    }
    if (!emailsToShow.length) {
      var emptyMsg = this.state.categoryFilter
        ? '<div class="em-empty">📂 当前分类「' + self.escapeHtml(this.state.categoryFilter) + '」暂无邮件<br><span style="font-size:11px;color:var(--text3);">点 [全部] 查看所有邮件，或在 [设置] → [AI 与分类] 中调整分类敏感度</span></div>'
        : '<div class="em-empty">📭 当前邮箱没有邮件</div>';
      body.innerHTML = emptyMsg;
    } else {
      body.innerHTML = emailsToShow.map(this.renderListItem, this).join('');
    }
    this.renderPager();
    // v0.74.2: 渲染后检查"还有更多"，给 .em-list 父容器加 has-more class
    // 触发底部渐变阴影 + 滑到位后再算（onScroll 也算）
    var self = this;
    requestAnimationFrame(function () { self.updateListMoreHint(); });
    body.onscroll = function () { self.updateListMoreHint(); };
  };

  EmailApp.prototype.renderListItem = function (email) {
    var self = this; // v0.33: chip 渲染用到
    var initial = avatarLetter(email.from);
    var subject = email.subject || '(无主题)';
    var fromName = extractName(email.from) || formatAddress(email.from) || '(未知发件人)';
    var dateStr = formatDate(email.date);
    var flags = email.flags || [];
    var read = flags.indexOf('\\Seen') >= 0;
    var classes = ['em-item'];
    if (!read) classes.push('em-item-unread');
    if (email.hasAttachments) classes.push('em-item-has-att');
    // v0.74.2: hover 操作条（删除/移动/标已读）— 不占用布局空间，hover 时才显出
    var readBtnLabel = read ? '已读' : '标已读';
    var readBtnTitle = read ? '标记为未读' : '标记为已读';
    return [
      '<article class="' + classes.join(' ') + '" data-role="item" data-uid="' + escAttr(email.uid) + '">',
      '  <div class="em-avatar">' + escHtml(initial) + '</div>',
      '  <div class="em-item-body">',
      '    <div class="em-item-row"><b class="em-from">' + escHtml(fromName) + '</b>',
      '      <span class="em-time">' + escHtml(dateStr) + '</span></div>',
      '    <div class="em-subject">' +
            (() => {
              // v0.33: 在主题前缀显示已持久化 chip（按 sender 查 store）
              return escHtml(subject);
            })() +
            '</div>',
      '  </div>',
      email.hasAttachments ? '  <span class="em-att-mark" title="含附件">📎</span>' : '',
      '  <div class="em-item-actions" data-role="item-actions">',
      '    <button type="button" class="em-item-action em-act-move" data-action="email-move" data-uid="' + escAttr(email.uid) + '" title="移动到文件夹">📁</button>',
      '    <button type="button" class="em-item-action em-act-read" data-action="email-toggle-read" data-uid="' + escAttr(email.uid) + '" data-read="' + (read ? '1' : '0') + '" title="' + escAttr(readBtnTitle) + '">' + readBtnLabel + '</button>',
      '    <button type="button" class="em-item-action em-act-del" data-action="email-delete" data-uid="' + escAttr(email.uid) + '" title="删除邮件">🗑</button>',
      '  </div>',
      '</article>',
    ].join('');
  };

  EmailApp.prototype.renderPager = function () {
    var pager = this.root.querySelector('[data-role="pager"]');
    if (!pager) return;
    var info = pager.querySelector('[data-role="pager-info"]');
    var prev = pager.querySelector('[data-action="prev"]');
    var next = pager.querySelector('[data-action="next"]');
    if (this.state.total <= 0) {
      info.textContent = '0 / 0';
      prev.disabled = true;
      next.disabled = true;
      return;
    }
    var start = this.state.offset + 1;
    var end = Math.min(this.state.offset + this.state.emails.length, this.state.total);
    info.textContent = start + ' – ' + end + ' / ' + this.state.total;
    prev.disabled = this.state.offset <= 0;
    next.disabled = end >= this.state.total;
  };

  // v0.74.2: 列表项下方"还有更多"阴影提示（has-more 状态）
  EmailApp.prototype.updateListMoreHint = function () {
    var list = this.root.querySelector('.em-list');
    if (!list) return;
    var body = list.querySelector('.em-list-body');
    if (!body) return;
    var hasMore = body.scrollHeight > body.clientHeight + 4;
    list.classList.toggle('has-more', hasMore);
  };

  // v0.30: AI 草拟回复（借鉴 inbox-zero draft-reply 完整 system prompt）
  EmailApp.prototype.aiBulkAnalyze = function () {
    var self = this;
    self.setStatus('AI 批量分析中（拉 IMAP + 1 次 LLM 推断）…', 'loading');
    apiFetch('POST', '/api/emails/analyze-senders', {}).then(function (data) {
      self.setStatus('');
      self.showBulkAnalyzeModal(data);
    }).catch(function (err) {
      self.setStatus('批量分析失败: ' + err.message, 'error');
      self.showBulkAnalyzeModal({ ok: false, senders: [], error: err.message });
    });
  };

  // v0.30: 弹窗显示批量分析结果（每个 sender 1 行 — sender · 频次 · 类目 chip · rationale）
  EmailApp.prototype.showBulkAnalyzeModal = function (result) {
    var old = document.querySelector('.em-bulk-modal-backdrop');
    if (old) old.remove();
    var backdrop = document.createElement('div');
    backdrop.className = 'em-bulk-modal-backdrop';
    var modal = document.createElement('div');
    modal.className = 'em-bulk-modal';
    var sendersHtml = '';
    if (result.senders && result.senders.length > 0) {
      var rows = result.senders.map(function (s) {
        var sc = s.source === 'static' ? '#22c55e' : (s.source === 'ai' ? '#0891b2' : '#888');
        var srcLabel = ({'static':'静态','ai':'AI','fallback':'降级'})[s.source] || '未知';
        return '<tr style="border-bottom:1px solid var(--border,#e5e7eb)">' +
          '<td style="padding:8px 6px;font-size:12px;color:var(--text2,#555);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escHtml(s.sender) + '">' + escHtml(s.sender) + '</td>' +
          '<td style="padding:8px 6px;text-align:center;font-size:12px"><b>' + (s.count || 0) + '</b></td>' +
          '<td style="padding:8px 6px"><span class="em-classify-chip" style="background:' + sc + ';color:#fff;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:600">' + escHtml(s.category) + '</span><div style="font-size:10px;color:var(--text3,#888);margin-top:2px">' + srcLabel + '</div></td>' +
          '<td style="padding:8px 6px;font-size:11px;color:var(--text2,#555);max-width:280px;line-height:1.4">' + escHtml(s.rationale || '') + '</td>' +
          '</tr>';
      }).join('');
      sendersHtml = '<div style="max-height:380px;overflow:auto;border:1px solid var(--border,#e5e7eb);border-radius:6px;margin-bottom:12px">' +
        '<table style="width:100%;border-collapse:collapse">' +
        '<thead style="position:sticky;top:0;background:var(--bg1,#fff);border-bottom:1px solid var(--border,#e5e7eb)">' +
        '<tr style="font-size:11px;color:var(--text3,#888);text-align:left">' +
        '<th style="padding:6px 6px;font-weight:600">发件人</th>' +
        '<th style="padding:6px 6px;font-weight:600;text-align:center">频次</th>' +
        '<th style="padding:6px 6px;font-weight:600">类目</th>' +
        '<th style="padding:6px 6px;font-weight:600">推理依据</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    } else {
      sendersHtml = '<div style="padding:24px;text-align:center;color:var(--text3,#888)">' +
        (result.error ? '⚠️ ' + escHtml(result.error) : '暂无 sender 数据') + '</div>';
    }
    modal.innerHTML = [
      '<h3 style="margin:0 0 12px;font-size:16px">🔍 AI 批量分析结果</h3>',
      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;font-size:12px;color:var(--text3,#888)">' +
        (result.analyzed ? '<span>分析 <b>' + result.analyzed + '</b> 个 sender（总 <b>' + (result.total_senders || 0) + '</b> 个）</span>' : '') +
        (result.note ? ' <span style="margin-left:8px">' + escHtml(result.note) + '</span>' : '') +
      '</div>',
      sendersHtml,
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">' +
        '<span style="font-size:11px;color:var(--text3,#888)">💡 借鉴 inbox-zero ai-categorize-senders.ts（1 次 LLM 批量推断 N 个 sender · NOASSERTION license · 重写为 JS）</span>' +
        '<button type="button" class="em-btn em-btn-tiny em-bulk-close">关闭</button>' +
      '</div>'
    ].join('');
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    var close = function () { backdrop.remove(); };
    modal.querySelector('.em-bulk-close').onclick = close;
    backdrop.onclick = function (ev) { if (ev.target === backdrop) close(); };
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
  };

  // v0.30: AI 草拟回复（借鉴 inbox-zero draft-reply 完整 system prompt）
  EmailApp.prototype.aiDraftReply = function (uid, options) {
    var self = this;
    options = options || {};
    uid = parseInt(uid, 10);
    if (!uid) { self.setStatus('草拟失败：无效邮件编号'); return; }
    if (!this.state.detail || this.state.detail.uid !== uid) {
      self.setStatus('请先打开邮件详情'); return;
    }
    var email = this.state.detail;
    var payload = {
      from: email.from || '',
      subject: email.subject || '',
      body: (email.text || '').toString().slice(0, 3000),
    };
    // v0.32: 重新生成时把上一版 + retryHint 传给后端，让 LLM 换角度
    if (options.previousDraft) payload.previousDraft = options.previousDraft;
    if (options.retryHint) payload.retryHint = options.retryHint;
    var loadingText = options.previousDraft ? '🔄 AI 重新生成中…' : 'AI 草拟回复中…';
    self.setStatus(loadingText, 'loading');
    apiFetch('POST', '/api/emails/draft-reply', payload).then(function (data) {
      self.setStatus('');
      self.showDraftReplyModal(uid, data);
    }).catch(function (err) {
      self.setStatus('草拟失败: ' + err.message, 'error');
      self.showDraftReplyModal(uid, { ok: false, draft: '', reason: '', source: 'fallback', error: err.message });
    });
  };

  // v0.30: 弹窗显示 AI 草拟回复（含「填入 Composer」按钮 — 绝不自动发）
  EmailApp.prototype.showDraftReplyModal = function (uid, result) {
    var old = document.querySelector('.em-draft-modal-backdrop');
    if (old) old.remove();
    var backdrop = document.createElement('div');
    backdrop.className = 'em-draft-modal-backdrop';
    var modal = document.createElement('div');
    modal.className = 'em-draft-modal';
    var draft = (result.draft || '').slice(0, 4000);
    var draftHtml = draft
      ? '<pre style="background:var(--bg3,#f5f5f7);border-left:3px solid var(--accent2,#0891b2);padding:12px 14px;border-radius:6px;font-size:13px;line-height:1.6;max-height:280px;overflow:auto;white-space:pre-wrap;word-break:break-word;margin:0 0 12px">' + escHtml(draft) + '</pre>'
      : '';
    modal.innerHTML = [
      '<h3 style="margin:0 0 12px;font-size:16px">✍️ AI 建议回复</h3>',
      result.ok
        ? '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><span class="em-classify-chip" style="background:var(--accent2,#0891b2);color:#fff;padding:3px 10px;border-radius:14px;font-size:12px">AI 推断</span><span style="font-size:12px;color:var(--text3,#888)">' + escHtml(result.reason || '') + '</span></div>'
        : '',
      result.error ? '<div style="color:#a00;font-size:12px;margin-bottom:12px">⚠️ ' + escHtml(result.error) + '（' + escHtml(result.reason || '') + '）</div>' : '',
      draftHtml,
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">',
      '  <span style="font-size:11px;color:var(--text3,#888)">💡 借鉴 inbox-zero draft-reply 完整 prompt（NOASSERTION license · 重写为 JS）</span>',
 '      <div style="display:flex;gap:8px">',
      '    <button type="button" class="em-btn em-btn-tiny em-draft-close">关闭</button>',
      result.ok && draft ? '    <button type="button" class="em-btn em-btn-tiny em-btn-primary em-draft-retry" title="重写一版（明显不同角度，但保留语气）">🔄 重写</button>' : '',
      result.ok && draft ? '    <button type="button" class="em-btn em-btn-tiny em-btn-primary em-draft-fill">📋 填入 Composer</button>' : '',
      '  </div>',
      '</div>'
    ].join('');
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    var close = function () { backdrop.remove(); };
    modal.querySelector('.em-draft-close').onclick = close;
    backdrop.onclick = function (ev) { if (ev.target === backdrop) close(); };
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
    var fillBtn = modal.querySelector('.em-draft-fill');
    if (fillBtn) {
      fillBtn.onclick = function () {
        // 打开 composer (复用现有 reply 流程），然后直接覆盖 body textarea
        self.openComposer({ kind: 'reply' });
        // 等下一帧让 composer 渲染
        setTimeout(function () {
          var textarea = self.root.querySelector('[data-role="body"]');
          if (textarea) {
            textarea.value = draft;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, 60);
        close();
        self.setStatus('已填入 Composer — 修改后发送');
      };
    }
    // v0.32: 重新生成按钮（借鉴 inbox-zero — 草稿不满意点 🔄 重写）
    var retryBtn = modal.querySelector('.em-draft-retry');
    if (retryBtn) {
      retryBtn.onclick = function () {
        var sid = self.state.detail && self.state.detail.uid ? self.state.detail.uid : null;
        if (!sid) { self.setStatus('重新生成失败：邮件详情已变更'); return; }
        close();
        // 用 aiDraftReply options 注入（不用临时替换 prototype）
        self.aiDraftReply(sid, {
          previousDraft: draft,
          retryHint: '请重新写一版：与上一版明显不同（不同开场/不同重点/不同结构），但保持语气一致。如果上一版已经够好就微调细节。',
        });
      };
    }
  };

  // v0.30: AI 智能分类（借鉴 inbox-zero@main ai-categorize-single-sender.ts + 防止 toast 骗人）
  // v0.33: AI 智能分类（按 inbox-zero 完整 system prompt + 持久化到 store）
  EmailApp.prototype.senderCategoryForEmail = function (from) {
    if (!from || !this.state || !this.state.senderCategories) return null;
    var key = String(from).toLowerCase().trim();
    return this.state.senderCategories[key] || null;
  };
  EmailApp.prototype.refreshSenderCategories = function () {
    var self = this;
    var mailbox = self.state && self.state.mailbox ? self.state.mailbox : 'INBOX';
    apiFetch('GET', '/api/emails/sender-categories?mailbox=' + encodeURIComponent(mailbox), null)
      .then(function (data) {
        if (data && data.categories) {
          // apiFetch 已 await response.json() — data 是解析后的对象
          self.state.senderCategories = data.categories || {};
          // 重渲染列表让 chip 出现
          // v0.37: AI 分类 chip 已从列表项移除 — 改用顶部 AI 分类筛选器（filter-by-category）
          // 此处保留空判断，刷新分类缓存后无需重渲染（筛选器会重新读取 availableCategories）
        }
      })
      .catch(function (err) { console.warn('[email] refreshSenderCategories:', err.message); });
  };
  EmailApp.prototype.aiClassifyEmail = function (uid) {
    var self = this;
    uid = parseInt(uid, 10);
    if (!uid) { self.setStatus('分类失败：无效邮件编号'); return; }
    var email = (this.state.emails || []).find(function (e) { return e.uid === uid; });
    if (!email && this.state.detail && this.state.detail.uid === uid) email = this.state.detail;
    if (!email) { self.setStatus('分类失败：找不到邮件数据，请先点开邮件'); return; }
    var payload = {
      from: email.from || '',
      subject: email.subject || '',
      snippet: (email.snippet || email.text || '').toString().slice(0, 500),
      mailbox: self.state.mailbox || 'INBOX', // v0.33: 传 mailbox 让后端持久化
    };
    self.setStatus('AI 分类中…', 'loading');
    apiFetch('POST', '/api/emails/classify', payload).then(function (data) {
      self.setStatus('');
      self.showClassifyResult(uid, data);
      // v0.33: 分类成功后立刻刷新 sender categories 缓存 + 主动写入（即使后端失败也前端能存）
      if (data && data.ok && data.source !== 'fallback' && payload.from) {
        self.refreshSenderCategories(); // 重新拉 hashmap 让该 email 行 chip 立刻出现
      }
    }).catch(function (err) {
      self.setStatus('分类失败: ' + err.message, 'error');
      self.showClassifyResult(uid, { ok: false, category: '其他', rationale: '', confidence: 'low', source: 'fallback', error: err.message });
    });
  };

  // v0.30: 弹窗显示 AI 分类结果（自建 modal，不依赖 ACMSModal — 类目 chip + rationale + confidence + source）
  EmailApp.prototype.showClassifyResult = function (uid, result) {
    var old = document.querySelector('.em-classify-modal-backdrop');
    if (old) old.remove();
    var srcLabel = ({'static':'静态规则匹配','ai':'AI 推断','fallback':'降级返回'})[result.source] || result.source || '未知';
    var confLabel = ({'high':'高','medium':'中','low':'低'})[result.confidence] || result.confidence || '-';
    var confColor = ({'high':'#22c55e','medium':'#eab308','low':'#ef4444'})[result.confidence] || '#888';
    var cat = result.category || '其他';
    var backdrop = document.createElement('div');
    backdrop.className = 'em-classify-modal-backdrop';
    var modal = document.createElement('div');
    modal.className = 'em-classify-modal';
    modal.innerHTML = [
      '<h3 style="margin:0 0 12px;font-size:16px">📂 AI 智能分类结果</h3>',
      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">',
      '  <span class="em-classify-chip" style="background:var(--accent,#0ea89d);color:#fff;padding:4px 12px;border-radius:16px;font-size:13px;font-weight:600">' + escHtml(cat) + '</span>',
      '  <span style="font-size:12px;color:var(--text3,#888)">' + escHtml(srcLabel) + ' · 置信度 <span style="color:' + confColor + ';font-weight:600">' + escHtml(confLabel) + '</span></span>',
      '</div>',
      result.rationale ? '<div style="background:var(--bg3,#f5f5f7);border-left:3px solid var(--accent,#0ea89d);padding:10px 12px;border-radius:6px;font-size:13px;margin-bottom:12px;line-height:1.5">💡 ' + escHtml(result.rationale) + '</div>' : '',
      result.error ? '<div style="color:#a00;font-size:12px;margin-bottom:12px">⚠️ ' + escHtml(result.error) + '</div>' : '',
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">',
      '  <span style="font-size:11px;color:var(--text3,#888)">💡 借鉴 inbox-zero（NOASSERTION license · 重写为 JS）</span>',
      '  <button type="button" class="em-btn em-btn-tiny em-classify-close">关闭</button>',
      '</div>'
    ].join('');
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    var close = function () { backdrop.remove(); };
    modal.querySelector('.em-classify-close').onclick = close;
    backdrop.onclick = function (ev) { if (ev.target === backdrop) close(); };
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
  };

  // v0.74.2: 删除邮件（带二次确认 + 乐观更新）
  EmailApp.prototype.deleteEmail = function (uid, btn) {
    var self = this;
    if (!uid) return;
    var n = Number(uid);
    if (!Number.isFinite(n) || n <= 0) return;
    showConfirm('确定删除邮件 #' + n + '？此操作不可撤销。').then(function (ok) {
      if (!ok) return;
      self.setStatus('删除中…');
      return apiFetch('DELETE', buildUrl('/api/emails/' + n, { mailbox: self.state.mailbox }))
        .then(function (res) {
          // 乐观更新：本地列表立即移除（避免再 round-trip 拉）
          self.state.emails = self.state.emails.filter(function (em) { return Number(em.uid) !== n; });
          self.state.total = Math.max(0, self.state.total - (res.removed || 1));
          // 如果删的是当前打开的详情，关闭详情
          if (self.state.selectedUid && Number(self.state.selectedUid) === n) {
            self.state.selectedUid = null;
            self.state.detail = null;
            self.closeDetail();
          }
          self.renderList();
          self.setStatus('已删除 ' + (res.removed || 1) + ' 封');
          showToast('已删除 ' + (res.removed || 1) + ' 封邮件', 'success');
        })
        .catch(function (err) {
          self.setStatus('删除失败: ' + err.message, 'error');
          showToast('删除失败: ' + err.message, 'error');
        });
    });
  };

  // v0.74.2: 弹出"移动到..."文件夹选择器（仿附件打开方式 cx 子菜单）
  EmailApp.prototype.pickMoveTarget = function (uid, btn) {
    var self = this;
    if (!uid) return;
    var n = Number(uid);
    if (!Number.isFinite(n) || n <= 0) return;

    // 关已有
    var existing = document.querySelectorAll('.em-move-menu');
    existing.forEach(function (m) { m.remove(); });

    var folders = (self.state.mailboxes || []).filter(function (b) {
      // 过滤 \Noselect（不能接收邮件的元文件夹）
      var flags = b.flags || [];
      return flags.indexOf('\\Noselect') < 0;
    });

    var menu = document.createElement('div');
    menu.className = 'em-move-menu';
    var head = '<div class="em-move-menu-head">📁 移动到文件夹 · 邮件 #' + n + '</div>';
    if (!folders.length) {
      menu.innerHTML = head + '<div class="em-move-menu-empty">⚠ 未找到可用的目标文件夹</div>';
    } else {
      menu.innerHTML = head + folders.map(function (box) {
        var name = box.name || '';
        var isCurrent = name === self.state.mailbox;
        return '<div class="em-move-menu-item' + (isCurrent ? ' em-move-current' : '') + '"'
          + (isCurrent ? '' : ' data-target="' + escAttr(name) + '"')
          + '>' + (isCurrent ? '✓ ' : '📂 ') + escHtml(name) + (isCurrent ? '（当前）' : '') + '</div>';
      }).join('');
    }

    // 定位
    var rect = btn.getBoundingClientRect();
    var mw = 240, mh = 60 + folders.length * 28;
    var left = rect.right + 4;
    var top = rect.bottom + 4;
    if (left + mw > window.innerWidth) left = Math.max(4, rect.left - mw - 4);
    if (top + mh > window.innerHeight) top = Math.max(4, window.innerHeight - mh - 8);
    menu.style.cssText = 'left:' + left + 'px;top:' + top + 'px';

    function close() {
      if (menu.parentNode) menu.parentNode.removeChild(menu);
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    Array.prototype.forEach.call(menu.querySelectorAll('[data-target]'), function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        var target = el.getAttribute('data-target');
        close();
        self.moveEmail(n, target);
      });
    });

    setTimeout(function () {
      document.addEventListener('click', close);
      document.addEventListener('keydown', onKey);
    }, 0);
    document.body.appendChild(menu);
  };

  // v0.74.2: 执行移动（调用后端 + 乐观更新）
  EmailApp.prototype.moveEmail = function (uid, target) {
    var self = this;
    if (!uid || !target) return;
    self.setStatus('移动到 ' + target + '…');
    return apiFetch('POST', buildUrl('/api/emails/' + uid + '/move', { mailbox: self.state.mailbox }), { to: target })
      .then(function (res) {
        self.state.emails = self.state.emails.filter(function (em) { return Number(em.uid) !== Number(uid); });
        self.state.total = Math.max(0, self.state.total - (res.removed || 1));
        if (self.state.selectedUid && Number(self.state.selectedUid) === Number(uid)) {
          self.state.selectedUid = null;
          self.state.detail = null;
          self.closeDetail();
        }
        self.renderList();
        self.setStatus('已移动到 ' + target);
        showToast('已移动 ' + (res.copied || 1) + ' 封到 ' + target, 'success');
      })
      .catch(function (err) {
        self.setStatus('移动失败: ' + err.message, 'error');
        showToast('移动失败: ' + err.message, 'error');
      });
  };

  // v0.74.2: 切换已读/未读（乐观更新 + 后端落盘）
  EmailApp.prototype.toggleRead = function (btn) {
    var self = this;
    if (!btn) return;
    var uid = Number(btn.getAttribute('data-uid'));
    if (!Number.isFinite(uid) || uid <= 0) return;
    var wasRead = btn.getAttribute('data-read') === '1';
    var willBeRead = !wasRead;
    // 乐观更新：本地状态先改 + 按钮 label 立即变
    var email = self.state.emails.find(function (em) { return Number(em.uid) === uid; });
    if (email) {
      var flags = email.flags || [];
      if (willBeRead) {
        if (flags.indexOf('\\Seen') < 0) flags.push('\\Seen');
      } else {
        flags = flags.filter(function (f) { return f !== '\\Seen'; });
      }
      email.flags = flags;
    }
    btn.setAttribute('data-read', willBeRead ? '1' : '0');
    btn.textContent = willBeRead ? '已读' : '标已读';
    btn.title = willBeRead ? '标记为未读' : '标记为已读';
    if (email) self.renderList();
    return apiFetch('POST', buildUrl('/api/emails/' + uid + '/read', { mailbox: self.state.mailbox }), { read: willBeRead })
      .then(function () {
        self.setStatus(willBeRead ? '已标为已读' : '已标为未读');
      })
      .catch(function (err) {
        // 回滚
        if (email) {
          var flags2 = email.flags || [];
          if (wasRead) {
            if (flags2.indexOf('\\Seen') < 0) flags2.push('\\Seen');
          } else {
            flags2 = flags2.filter(function (f) { return f !== '\\Seen'; });
          }
          email.flags = flags2;
        }
        btn.setAttribute('data-read', wasRead ? '1' : '0');
        btn.textContent = wasRead ? '已读' : '标已读';
        if (email) self.renderList();
        self.setStatus('标记失败: ' + err.message, 'error');
        showToast('标记失败: ' + err.message, 'error');
      });
  };

  EmailApp.prototype.openEmail = function (uid) {
    var self = this;
    if (!uid) return;
    self.state.selectedUid = uid;
    self.setStatus('加载邮件…');
    var pane = self.root.querySelector('[data-role="pane"]');
    if (!pane) return;
    pane.innerHTML = '<div class="em-loading">⏳ 加载中…</div>';
    return apiFetch('GET', buildUrl('/api/emails/' + uid, { mailbox: self.state.mailbox }))
      .then(function (email) {
        self.state.detail = email;
        // v0.74.1: client-side RFC 2047 decode（兜底 server 端可能没解码）
        email.subject = decodeEmailHeader(email.subject);
        email.from = decodeEmailHeader(email.from);
        email.to = decodeEmailHeader(email.to);
        email.cc = decodeEmailHeader(email.cc);
        if (Array.isArray(email.attachments)) {
          email.attachments.forEach(function (att) { att.name = decodeEmailHeader(att.name); });
        }
        self.renderDetail();
        self.setStatus('邮件已加载');
      })
      .catch(function (err) {
        pane.innerHTML = '<div class="em-error">❌ ' + escHtml(err.message) + '</div>';
        self.setStatus('加载失败', 'error');
      });
  };

EmailApp.prototype.renderDetail = function () {
    var pane = this.root.querySelector('[data-role="pane"]');
    if (!pane) return;
    var email = this.state.detail;
    if (!email) return;
    var fromDisplay = email.from || '';
    var subject = email.subject || '(无主题)';
    var dateStr = formatDate(email.date);
    // v0.74.1: client-side body decode（兜底 server 端可能没按 Content-Transfer-Encoding 解码）
    var decodedText = decodeEmailBody(email.text, 'utf-8');
    var decodedHtml = decodeEmailBody(email.html, 'utf-8');

    var self = this;
    var mailbox = self.state.mailbox;
    var attachments = (email.attachments || []).map(function (att) {
      var url = buildUrl('/api/emails/' + email.uid + '/attachment/' + encodeURIComponent(att.partID), {
        mailbox: self_currentMailbox(self),
        api_key: API_KEY,
        name: att.name,
        type: att.type,
      });
      var apps = (window.ACMSFileApps ? window.ACMSFileApps.getAppsForFile(att.name, att.type) : []);
      var hasApp = apps.length > 0;
      return '<li class="em-attachment" data-att-name="' + escAttr(att.name) + '" data-att-type="' + escAttr(att.type || '') + '" data-att-part="' + escAttr(att.partID) + '" data-att-size="' + escAttr(String(att.size || 0)) + '">'
        + '<span class="em-attachment-icon">' + attachmentIcon(att.name, att.type) + '</span>'
        + '<span class="em-attachment-name" title="' + escAttr(att.name) + '">' + escHtml(att.name) + '</span>'
        + '<span class="em-attachment-size">' + escHtml(formatSize(att.size)) + '</span>'
        + '<button type="button" class="em-btn em-btn-tiny" data-action="attachment-open" title="' + (hasApp ? '选择 ACMS 应用打开' : '未找到 ACMS 应用处理该类型') + '">📂 打开</button>'
        + '<a class="em-btn em-btn-tiny em-btn-link" href="' + escAttr(url) + '" target="_blank" rel="noopener">下载</a>'
        + '</li>';
    }, this).join('');

    function self_currentMailbox(app) { return app.state.mailbox; }

    // 先渲染外层结构，iframe 占位
    var iframeId = 'em-iframe-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    var iframeHtml = decodedHtml
      ? '<iframe id="' + iframeId + '" class="em-body-iframe" sandbox="allow-same-origin allow-forms allow-pointer-lock" style="width:100%;border:none;min-height:200px;background:transparent;"></iframe>'
      : '<pre class="em-text-body">' + escHtml(decodedText || '(无正文)') + '</pre>';

    pane.innerHTML = [
      '<header class="em-detail-head">',
      '  <div class="em-detail-actions" style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap;">',
      '    <button type="button" class="em-btn" data-action="back-to-list">← 返回</button>',
      '    <button type="button" class="em-btn" data-action="reply">↩ 回复</button>',
      '    <button type="button" class="em-btn" data-action="reply-all">↩ 全部回复</button>',
      '    <button type="button" class="em-btn" data-action="forward">↪ 转发</button>',
      '    <button type="button" class="em-btn em-btn-primary" data-action="email-ai-draft-reply" title="AI 根据邮件内容草拟回复（参考 inbox-zero draft-reply 完整 prompt）">🤖 AI 草拟回复</button>',
      '  </div>',
      '  <div class="em-detail-title">',
      '    <h2>' + escHtml(subject) + '</h2>',
      '  </div>',
      '  <table class="em-meta">',
      '    <tr><th>发件人</th><td>' + escHtml(fromDisplay) + '</td></tr>',
      email.to ? '    <tr><th>收件人</th><td>' + escHtml(email.to) + '</td></tr>' : '',
      email.cc ? '    <tr><th>抄送</th><td>' + escHtml(email.cc) + '</td></tr>' : '',
      '    <tr><th>时间</th><td>' + escHtml(dateStr) + '</td></tr>',
      '  </table>',
      '</header>',
      '<article class="em-body" data-role="body">' + iframeHtml + '</article>',
      attachments ? '<section class="em-att-list"><h3>📎 附件 (' + email.attachments.length + ')</h3><ul>' + attachments + '</ul></section>' : '',
    ].join('');

    // DOM 就绪后，初始化 iframe 内容（innerHTML 里的 script 不会执行，必须单独跑）
    if (decodedHtml) {
      var sanitizedHtml = sanitizeEmailHtmlForIframe(decodedHtml, email.attachments || [], email.uid, mailbox);
      var iframe = document.getElementById(iframeId);
      if (iframe) {
        initEmailIframe(iframe, sanitizedHtml);
      }
    }

    this.renderRemoteImagePrompt();
  };

  // 单独函数：初始化邮件 iframe 内容 + 自动高度（多重兜底：立即 + 延迟 + 事件 + MutationObserver + 最小高度）
  function initEmailIframe(iframe, html) {
    var doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    function resizeIframe() {
      try {
        var body = iframe.contentWindow.document.body;
        var htmlEl = iframe.contentWindow.document.documentElement;
        var h = Math.max(body ? body.scrollHeight : 0, htmlEl ? htmlEl.scrollHeight : 0, 300);
        iframe.style.height = h + 'px';
      } catch (e) {}
    }
    // 立即尝试（内容刚写入）
    resizeIframe();
    // 延迟多次重算（内容渐进渲染、字体加载、图片加载）
    setTimeout(resizeIframe, 50);
    setTimeout(resizeIframe, 300);
    setTimeout(resizeIframe, 800);
    setTimeout(resizeIframe, 1500);
    iframe.onload = resizeIframe;
    doc.addEventListener('DOMContentLoaded', resizeIframe);
    // 图片加载触发
    var imgs = doc.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) { imgs[i].addEventListener('load', resizeIframe); imgs[i].addEventListener('error', resizeIframe); }
    // 内容变化（动态插入内容、样式计算变化）触发重算
    try {
      var observer = new MutationObserver(function () { resizeIframe(); });
      observer.observe(doc.body || doc, { childList: true, subtree: true, attributes: true });
    } catch (e) {}
  }

  EmailApp.prototype.closeDetail = function () {
    this.state.selectedUid = null;
    this.state.detail = null;
    var pane = this.root.querySelector('[data-role="pane"]');
    if (!pane) return;
    pane.innerHTML = [
      '<div class="em-pane-empty" data-role="pane-empty">',
      '  <div class="em-pane-empty-emoji">📭</div>',
      '  <p>选择左侧邮件查看详情，或点击右上角写信。</p>',
      '</div>',
    ].join('');
  };

  EmailApp.prototype.renderRemoteImagePrompt = function () {
    var body = this.root.querySelector('[data-role="body"]');
    if (!body) return;
    var imgs = body.querySelectorAll('img[src^="http"]');
    if (!imgs.length) return;
    var count = imgs.length;
    var banner = document.createElement('div');
    banner.className = 'em-remote-banner';
    banner.innerHTML = '已隐藏 ' + count + ' 张远程图片以保护隐私。'
      + '<button type="button" class="em-btn em-btn-tiny" data-action="load-remote">加载图片</button>';
    body.insertBefore(banner, body.firstChild);
    imgs.forEach(function (img) { img.dataset.srcRemote = img.getAttribute('src'); img.removeAttribute('src'); });
  };

  EmailApp.prototype.loadRemoteImages = function () {
    var body = this.root.querySelector('[data-role="body"]');
    if (!body) return;
    var imgs = body.querySelectorAll('img[data-src-remote]');
    imgs.forEach(function (img) { img.setAttribute('src', img.dataset.srcRemote); img.removeAttribute('data-src-remote'); });
    var banner = body.querySelector('.em-remote-banner');
    if (banner) banner.parentNode.removeChild(banner);
  };

  EmailApp.prototype.renderError = function (err) {
    var body = this.root.querySelector('[data-role="list"]');
    if (!body) return;
    if (err && err.code === 'IMAP_CONNECT_FAILED') {
      body.innerHTML = '<div class="em-error">❌ ' + escHtml(err.message) + '<br/>请确认 config.json 中 smtp 配置了正确的邮箱和密码。</div>';
    } else {
      body.innerHTML = '<div class="em-error">❌ ' + escHtml(err.message || '加载失败') + '</div>';
    }
  };

  // ── 写信：草稿、模板、附件、HTML 切换、发送 ──
  EmailApp.prototype.openComposer = function (options) {
    var self = this;
    self.state.composerOpen = true;
    self.state.composerData = self.buildComposerData(options || {});
    self.state.attachmentBytes = 0;
    self.state.attachmentCount = 0;
    self.renderComposer();
    self.hydrateComposer();
    self.scheduleDraftSave();
  };

  EmailApp.prototype.buildComposerData = function (options) {
    var data = {
      kind: options.kind || 'new',
      to: '',
      cc: '',
      bcc: '',
      replyTo: '',
      subject: '',
      body: '',
      isHtml: false,
      inReplyTo: '',
      references: '',
      file_ids: [],
    };
    if (this.state.account && this.state.account.email && (options.kind === 'reply' || options.kind === 'reply-all' || options.kind === 'forward')) {
      data.replyTo = this.state.account.email;
    }
    if (options.kind === 'reply' || options.kind === 'reply-all' || options.kind === 'forward') {
      var email = this.state.detail;
      if (email) {
        data.inReplyTo = email.messageId || '';
        data.references = email.messageId || '';
        var from = formatAddress(email.from);
        var prefix = options.kind === 'forward' ? 'Fwd: ' : 'Re: ';
        data.subject = email.subject && email.subject.indexOf(prefix) === 0 ? email.subject : prefix + (email.subject || '');
        if (options.kind === 'reply') {
          data.to = from;
        } else if (options.kind === 'reply-all') {
          data.to = from;
          data.cc = email.cc || '';
        }
        if (options.kind === 'forward') {
          data.body = '\n\n---------- Forwarded message ----------\n'
            + 'From: ' + (email.from || '') + '\n'
            + 'Date: ' + (email.date || '') + '\n'
            + 'Subject: ' + (email.subject || '') + '\n'
            + 'To: ' + (email.to || '') + '\n\n'
            + (email.text || email.html || '');
        } else {
          var quote = (email.text || '').split('\n').map(function (line) { return '> ' + line; }).join('\n');
          data.body = '\n\n' + (quote || '(无原文)') + '\n';
        }
      }
    }
    return data;
  };

  EmailApp.prototype.renderComposer = function () {
    var pane = this.root.querySelector('[data-role="pane"]');
    if (!pane) return;
    var data = this.state.composerData || {};
    pane.innerHTML = [
      '<section class="em-composer" data-role="composer">',
      '  <header class="em-composer-head">',
      '    <h2>✉ 写邮件</h2>',
      '    <div class="em-composer-actions">',
      '      <button type="button" class="em-btn" data-action="composer-discard">取消</button>',
      '      <button type="button" class="em-btn em-btn-primary" data-action="composer-send">发送</button>',
      '    </div>',
      '  </header>',
      '  <div class="em-composer-body">',
      '    <label class="em-field">',
      '      <span>收件人 *</span>',
      '      <input type="text" class="em-input" data-role="to" placeholder="a@example.com; b@example.com" value="' + escAttr(data.to || '') + '" />',
      '    </label>',
      '    <details class="em-field em-field-extra">',
      '      <summary>抄送 / 密送 / 回复</summary>',
      '      <label class="em-field"><span>抄送</span><input type="text" class="em-input" data-role="cc" placeholder="可选，多个分号分隔" value="' + escAttr(data.cc || '') + '" /></label>',
      '      <label class="em-field"><span>密送</span><input type="text" class="em-input" data-role="bcc" placeholder="可选，多个分号分隔" value="' + escAttr(data.bcc || '') + '" /></label>',
      '      <label class="em-field"><span>回复地址</span><input type="email" class="em-input" data-role="reply-to" placeholder="留空使用账号默认" value="' + escAttr(data.replyTo || '') + '" /></label>',
      '    </details>',
      '    <label class="em-field"><span>主题 *</span><input type="text" class="em-input" data-role="subject" placeholder="邮件主题" value="' + escAttr(data.subject || '') + '" /></label>',
      '    <div class="em-toolbar">',
      '      <div class="em-toolbar-group">',
      '        <button type="button" class="em-btn em-btn-tiny" data-action="composer-template" data-template="blank">空白</button>',
      '        <button type="button" class="em-btn em-btn-tiny" data-action="composer-template" data-template="greeting">问候</button>',
      '        <button type="button" class="em-btn em-btn-tiny" data-action="composer-template" data-template="apology">致歉</button>',
      '      </div>',
      '      <div class="em-toolbar-group">',
      '        <button type="button" class="em-btn em-btn-tiny" data-action="composer-format" data-format="bold"><b>B</b></button>',
      '        <button type="button" class="em-btn em-btn-tiny" data-action="composer-format" data-format="italic"><i>I</i></button>',
      '        <button type="button" class="em-btn em-btn-tiny" data-action="composer-format" data-format="link">🔗 链接</button>',
      '        <button type="button" class="em-btn em-btn-tiny" data-action="composer-format" data-format="list">• 列表</button>',
      '        <label class="em-toggle"><input type="checkbox" data-role="html-toggle"' + (data.isHtml ? ' checked' : '') + ' />富文本</label>',
      '      </div>',
      '      <div class="em-toolbar-group">',
      '        <button type="button" class="em-btn em-btn-tiny" data-action="composer-attach">📎 添加附件</button>',
      '        <input type="file" multiple class="em-file-input" data-role="file-input" hidden />',
      '      </div>',
      '    </div>',
      '    <textarea class="em-textarea" data-role="body" rows="14" placeholder="邮件正文…">' + escHtml(data.body || '') + '</textarea>',
      '    <ul class="em-att-chips" data-role="attachments"></ul>',
      '    <div class="em-send-status" data-role="send-status" aria-live="polite"></div>',
      '  </div>',
      '</section>',
    ].join('');

    var fileInput = pane.querySelector('[data-role="file-input"]');
    if (fileInput) {
      var appSelf = this;
      fileInput.addEventListener('change', function (event) {
        appSelf.uploadFiles(event.target.files);
        event.target.value = '';
      });
    }

    var htmlToggle = pane.querySelector('[data-role="html-toggle"]');
    if (htmlToggle) {
      htmlToggle.addEventListener('change', function (event) {
        var checked = event.target.checked;
        var body = pane.querySelector('[data-role="body"]');
        if (checked) {
          body.classList.add('em-textarea-html');
        } else {
          body.classList.remove('em-textarea-html');
        }
        self_capture().state.composerData.isHtml = checked;
        self_capture().scheduleDraftSave();
      });
    }

    ['to', 'cc', 'bcc', 'reply-to', 'subject', 'body'].forEach(function (role) {
      var input = pane.querySelector('[data-role="' + role + '"]');
      if (input) {
        input.addEventListener('input', self_capture().scheduleDraftSave.bind(self_capture()));
      }
    });
  };

  EmailApp.prototype.hydrateComposer = function () {
    var data = this.state.composerData;
    if (!data || !data.file_ids || !data.file_ids.length) return;
    var self = this;
    Promise.all(data.file_ids.map(function (id) {
      return apiFetch('GET', buildUrl('/api/chat/upload/' + id + '/raw', { api_key: API_KEY }), null).then(function () { return { id: id }; }).catch(function () { return { id: id }; });
    })).then(function (entries) {
      var files = entries.map(function (entry) { return { id: entry.id, name: entry.id, size: 0 }; });
      self.state.attachmentCount = files.length;
      self.renderAttachments(files);
    });
  };

  EmailApp.prototype.applyComposerTemplate = function (name) {
    var templates = {
      blank: '',
      greeting: '你好，\n\n',
      apology: '非常抱歉给您带来不便，针对这个问题我们已采取以下措施：\n\n1. \n2. \n\n如仍有疑问请随时回复。\n',
    };
    var body = this.root.querySelector('[data-role="body"]');
    if (!body) return;
    body.value = (body.value ? body.value + '\n\n' : '') + (templates[name] || '');
    this.state.composerData.body = body.value;
    this.scheduleDraftSave();
  };

  EmailApp.prototype.toggleFormat = function (format) {
    var body = this.root.querySelector('[data-role="body"]');
    if (!body) return;
    var htmlToggle = this.root.querySelector('[data-role="html-toggle"]');
    if (!htmlToggle.checked) htmlToggle.checked = true;
    this.state.composerData.isHtml = true;
    body.classList.add('em-textarea-html');
    var start = body.selectionStart || 0;
    var end = body.selectionEnd || 0;
    var selected = body.value.slice(start, end) || (format === 'link' ? '链接文字' : format === 'list' ? '条目' : '文字');
    var wrapped;
    if (format === 'bold') wrapped = '<b>' + selected + '</b>';
    else if (format === 'italic') wrapped = '<i>' + selected + '</i>';
    else if (format === 'link') {
      var url = root_prompt('链接地址：', 'https://');
      if (!url) return;
      wrapped = '<a href="' + escAttr(url) + '">' + selected + '</a>';
    } else if (format === 'list') {
      wrapped = '<ul><li>' + selected + '</li></ul>';
    } else wrapped = selected;
    body.value = body.value.slice(0, start) + wrapped + body.value.slice(end);
    this.state.composerData.body = body.value;
    this.scheduleDraftSave();
  };

  function root_prompt(msg, def) {
    if (typeof root.showPrompt === 'function') return root.showPrompt(msg, def);
    return root.prompt(msg, def);
  }

  EmailApp.prototype.openAttachmentPicker = function () {
    var input = this.root.querySelector('[data-role="file-input"]');
    if (input) input.click();
  };

  EmailApp.prototype.uploadFiles = function (fileList) {
    var self = this;
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    var max = (self.state.account && self.state.account.limits && self.state.account.limits.attachments) || 10;
    var maxBytes = (self.state.account && self.state.account.limits && self.state.account.limits.attachmentBytes) || (25 * 1024 * 1024);
    var remain = max - self.state.attachmentCount;
    if (remain <= 0) {
      showToast('附件数量已达上限 ' + max, 'error');
      return;
    }
    if (files.length > remain) {
      files = files.slice(0, remain);
      showToast('只会上传前 ' + remain + ' 个文件', 'info');
    }
    files.forEach(function (file) {
      self.uploadOne(file, maxBytes);
    });
  };

  EmailApp.prototype.uploadOne = function (file, maxBytes) {
    var self = this;
    if (file.size > maxBytes) {
      showToast('附件 ' + file.name + ' 超过限制', 'error');
      return;
    }
    var placeholder = { id: null, name: file.name, size: file.size, status: 'uploading' };
    self.state.attachmentCount++;
    self.state.attachmentBytes += file.size;
    self.appendAttachment(placeholder);
    var form = new FormData();
    form.append('file', file, file.name);
    fetch(buildUrl('/api/chat/upload', { api_key: API_KEY }), {
      method: 'POST',
      headers: { 'X-API-Key': API_KEY },
      body: form,
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (data && data.error) throw new Error(data.message || data.error);
      var info = data && data.files ? data.files[0] : data;
      placeholder.id = info.id;
      placeholder.status = 'done';
      placeholder.name = info.name || file.name;
      placeholder.size = info.size || file.size;
      self.state.composerData.file_ids.push(info.id);
      self.refreshAttachment(placeholder);
      self.scheduleDraftSave();
    }).catch(function (err) {
      placeholder.status = 'failed';
      placeholder.error = err.message;
      self.refreshAttachment(placeholder);
      self.state.attachmentCount--;
      self.state.attachmentBytes -= file.size;
    });
  };

EmailApp.prototype.appendAttachment = function (item) {
    var list = this.root.querySelector('[data-role="attachments"]');
    if (!list) return;
    var li = document.createElement('li');
    li.className = 'em-att-chip em-att-' + item.status;
    li.setAttribute('data-id', item.id || item.name);
    li.setAttribute('data-att-name', item.name);
    li.innerHTML = this.attachmentChipHtml(item);
    list.appendChild(li);
  };

EmailApp.prototype.refreshAttachment = function (item) {
    var list = this.root.querySelector('[data-role="attachments"]');
    if (!list) return;
    // 用 name 作为稳定 selector（upload 成功后 item.id 变成 UUID，跟 li 上的 data-id 不再一致）
    var key = item.name || (item.id || '');
    var li = list.querySelector('[data-att-name="' + cssEscape(key) + '"]');
    if (li) {
      li.className = 'em-att-chip em-att-' + item.status;
      li.innerHTML = this.attachmentChipHtml(item);
    }
  };

  EmailApp.prototype.attachmentChipHtml = function (item) {
    var action = item.status === 'uploading'
      ? '<span class="em-att-status">上传中…</span>'
      : item.status === 'failed'
        ? '<span class="em-att-status em-att-status-error">失败 ' + escHtml(item.error || '') + '</span>'
        : '<button type="button" class="em-btn em-btn-tiny" data-action="remove-attachment" data-id="' + escAttr(item.id) + '">移除</button>';
    return '<span class="em-att-name">' + escHtml(item.name) + '</span>'
      + '<span class="em-att-size">' + escHtml(formatSize(item.size)) + '</span>'
      + action;
  };

  EmailApp.prototype.removeAttachment = function (id) {
    var data = this.state.composerData;
    if (!data) return;
    var idx = data.file_ids.indexOf(id);
    if (idx >= 0) data.file_ids.splice(idx, 1);
    var list = this.root.querySelector('[data-role="attachments"]');
    if (list) {
      var node = list.querySelector('[data-id="' + id + '"]');
      if (node && node.parentNode) node.parentNode.removeChild(node);
    }
    this.state.attachmentCount = Math.max(0, this.state.attachmentCount - 1);
    this.scheduleDraftSave();
  };

  EmailApp.prototype.renderAttachments = function (items) {
    var list = this.root.querySelector('[data-role="attachments"]');
    if (!list) return;
    list.innerHTML = '';
    items.forEach(this.appendAttachment, this);
  };

  EmailApp.prototype.scheduleDraftSave = function () {
    var self = this;
    clearTimeout(self.state.draftTimer);
    self.state.draftTimer = setTimeout(function () { self.persistDraft(); }, 400);
  };

  EmailApp.prototype.readComposerInputs = function () {
    var data = this.state.composerData || {};
    var root = this.root;
    function valueOf(role) {
      var el = root.querySelector('[data-role="' + role + '"]');
      return el ? el.value : '';
    }
    data.to = valueOf('to');
    data.cc = valueOf('cc');
    data.bcc = valueOf('bcc');
    data.replyTo = valueOf('reply-to');
    data.subject = valueOf('subject');
    data.body = valueOf('body');
    var htmlToggle = root.querySelector('[data-role="html-toggle"]');
    if (htmlToggle) data.isHtml = htmlToggle.checked;
    return data;
  };

  EmailApp.prototype.persistDraft = function (skipStorage) {
    if (!this.state.composerOpen) return;
    var data = this.readComposerInputs();
    if (skipStorage) {
      try { root.localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
      return;
    }
    try { root.localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), data: data })); } catch (e) { /* ignore */ }
  };

  EmailApp.prototype.loadDraft = function () {
    try {
      var raw = root.localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && parsed.data ? parsed.data : null;
    } catch (e) { return null; }
  };

  EmailApp.prototype.discardComposer = function () {
    var self = this;
    showConfirm('确定放弃当前邮件？未发送的草稿将被清除。').then(function (ok) {
      if (!ok) return;
      self.state.composerOpen = false;
      self.state.composerData = null;
      try { root.localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
      self.closeDetail();
    });
  };

  EmailApp.prototype.submitComposer = function () {
    var self = this;
    if (self.state.sendInFlight) return;
    var data = self.readComposerInputs();
    var status = self.root.querySelector('[data-role="send-status"]');
    if (!data.to.trim()) {
      status.innerHTML = '<span class="em-status-error">请输入收件人</span>';
      return;
    }
    if (data.body.length > MAX_BODY_LENGTH && !data.isHtml) {
      status.innerHTML = '<span class="em-status-error">正文不能超过 ' + MAX_BODY_LENGTH + ' 字符</span>';
      return;
    }
    if (data.isHtml) {
      data.body = sanitizeEmailHtml(data.body);
    }
    self.state.sendInFlight = true;
    self.setStatus('发送中…');
    status.innerHTML = '<span class="em-status-info">发送中…</span>';
    var payload = {
      to: data.to.trim(),
      cc: data.cc.trim(),
      bcc: data.bcc.trim(),
      replyTo: data.replyTo.trim(),
      subject: data.subject.trim(),
      body: data.body,
      isHtml: data.isHtml,
      inReplyTo: data.inReplyTo,
      references: data.references,
      file_ids: data.file_ids,
    };
    apiFetch('POST', '/api/emails/send', payload).then(function (result) {
      status.innerHTML = '<span class="em-status-success">✅ 已发送 ' + (result.rejected && result.rejected.length ? '（部分失败）' : '') + '</span>';
      self.setStatus('已发送');
      try { root.localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
      self.state.composerOpen = false;
      self.state.composerData = null;
      setTimeout(function () { self.refresh(); }, 800);
    }).catch(function (err) {
      status.innerHTML = '<span class="em-status-error">❌ ' + escHtml(err.message) + '</span>';
      self.setStatus('发送失败', 'error');
    }).then(function () { self.state.sendInFlight = false; });
  };

  function mount(windowRef) {
    if (!windowRef || !windowRef.$c) return null;
    var app = new EmailApp(windowRef);
    app.init();
    return app;
  }

  function entry(windowRef) { return mount(windowRef); }

  if (root.ACMSWin) {
    if (root.ACMS && root.ACMS.registerPackage) {
      root.ACMS.registerPackage('email-inbox', {
        title: '邮件', icon: '📬', category: '工具',
        defaultSize: { w: 960, h: 640 },
        loader: function (w) { entry(w); },
      });
    }
    if (typeof root.ACMSWin.registerViewLoader === 'function') {
      root.ACMSWin.registerViewLoader('email-inbox', function (w) { entry(w); });
    }
  }

  EmailApp.prototype.parseRuleInput = function () {
    var self = this;
    var descInput = this.root.querySelector('#rule-desc');
    var desc = descInput ? descInput.value.trim() : '';
    if (!desc) { self.setStatus('请输入规则描述', 'warning'); return; }
    var previewEl = self.root.querySelector('#rule-parse-preview');
    if (previewEl) previewEl.innerHTML = '<span style="color:var(--text3);">⏳ 解析中...</span>';
    self.setStatus('正在解析规则...');
    // 调用解析接口
    apiFetch('POST', '/api/email-rules/parse', { description: desc, mailbox: this.state.mailbox || 'INBOX' })
      .then(function (result) {
        // v0.39: 调试 — 打印完整返回结构
        console.log('[parseRuleInput] API response:', JSON.stringify(result).slice(0, 500));
        // 动态更新解析预览区域
        if (previewEl) {
          if (result.parsed) {
            var p = result.parsed;
            var conditions = p.conditions || {};
            var actions = p.actions || {};
            var cats = (conditions.categories || []).map(function (c) { return '<span style="color:var(--accent1);font-weight:600;">' + escHtml(c) + '</span>'; }).join('、') || '<span style="color:var(--text3);">无</span>';
            var senders = (conditions.senders || []).map(function (s) { return '<span style="color:var(--text2);">' + escHtml(s) + '</span>'; }).join('、') || '<span style="color:var(--text3);">无</span>';
            var keywords = (conditions.keywords || []).map(function (k) { return '<span style="color:var(--yellow);">' + escHtml(k) + '</span>'; }).join('、') || '<span style="color:var(--text3);">无</span>';
            var actionsHtml = Object.keys(actions).map(function (a) {
              var labelMap = { archive: '归档', label: '标签', notify: '通知', draft_only: '草稿', auto_reply: '自动回复' };
              return '<span style="color:var(--green);font-weight:600;">' + escHtml(labelMap[a] || a) + '</span>' + (actions[a] ? '（' + escHtml(String(actions[a])) + '）' : '');
            }).join('、') || '<span style="color:var(--text3);">无动作</span>';
            // v0.97: reply_template 作为规则级独立字段显示
            var replyTpl = result.reply_template || actions.reply_template || '';
            var tplHtml = replyTpl ? '<div style="margin-top:8px;padding:8px;background:var(--accent1);color:#fff;border-radius:6px;font-size:12px;"><strong>📝 回复模板：</strong><br>' + escHtml(replyTpl) + '</div>' : '';
            previewEl.innerHTML = '条件：类别=[' + cats + '] · 发件人包含=[' + senders + '] · 关键词=[' + keywords + '] · 动作：' + actionsHtml + ' · 置信度：' + (result.confidence || '中') + tplHtml;
            result._originalDescription = desc; // v0.39: 保存用户原始输入，防 parsed.description 丢失
            self.state.parsedRule = result;
            self.setStatus('✅ 解析完成，可以点击【保存】');
            self.populateTemplateDropdown();
          } else {
            // 解析失败但有后端错误信息
            var errMsg = result.message || result.error || '未知错误';
            previewEl.innerHTML = '<span style="color:var(--red);">❌ 解析失败：' + escHtml(errMsg) + '</span>';
            self.setStatus('❌ 解析失败：' + errMsg, 'error');
            self.state.parsedRule = null;
          }
        }
      })
      .catch(function (err) {
        // v0.39: 连接错误
        console.error('[parseRuleInput] fetch error:', err);
        if (previewEl) previewEl.innerHTML = '<span style="color:var(--red);">❌ 请求失败：' + escHtml(err.message || String(err)) + '</span>';
        self.setStatus('❌ 解析请求失败：' + (err.message || String(err)), 'error');
      });
  };

  // v0.99: Populate template dropdown
  EmailApp.prototype.populateTemplateDropdown = function () {
    var self = this;
    var dropdown = this.root.querySelector('#rule-template-dropdown');
    if (!dropdown) return;
    apiFetch('GET', '/api/email-templates').then(function (data) {
      var templates = (data && data.templates) || [];
      var currentValue = dropdown.value;
      dropdown.innerHTML = '<option value="">— 手动输入回复内容 —</option>';
      templates.forEach(function (t) {
        var opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name + ' (' + t.content.slice(0, 30) + '...)';
        dropdown.appendChild(opt);
      });
      // Restore selection if still valid
      if (currentValue && Array.from(dropdown.options).some(function (o) { return o.value === currentValue; })) {
        dropdown.value = currentValue;
      }
    }).catch(function () {
      // Silently fail - dropdown will show empty option
    });
  };

    EmailApp.prototype.saveRule = function () {
    var self = this;
    var parsed = self.state.parsedRule;
    console.log('[saveRule] parsedRule:', JSON.stringify(parsed)?.slice(0, 300));
    if (!parsed || !parsed.parsed) {
      self.setStatus('请先解析规则（点击「解析规则」按钮）', 'warning');
      return;
    }
    // v0.39: 用 ACMSModal 替代系统 confirm（多多要求 ACMS 自己风格的确认框）
    // v0.97: reply_template 作为规则级字段
    var tpl = (parsed.reply_template || (parsed.parsed && parsed.parsed.actions && parsed.parsed.actions.reply_template) || '');
    var actions = parsed.parsed && parsed.parsed.actions || {};
    // v0.99: 使用选中的模板
    var selectedTplId = (self.root.querySelector('#rule-template-dropdown') || {}).value;
    if (selectedTplId) {
      actions.reply_template_id = selectedTplId;
      actions.reply_template = null; // 使用模板ID，不硬编码内容
    }
    // v0.99: 检查 auto_reply 是否需要模板或回复内容
    if (actions.auto_reply === true && !tpl && !selectedTplId) {
      self.setStatus('⚠️ 规则包含 auto_reply 但缺少回复模板，请从下拉菜单选择或手动输入', 'warning');
      return;
    }
    var tplHtml = tpl ? '<div style="margin-bottom:12px;padding:10px;background:var(--accent1);color:#fff;border-radius:6px;"><strong>📝 回复模板：</strong><br><span style="font-size:12px;">' + escHtml(tpl) + '</span></div>' : '';
    var confirmHtml = '<div style="margin-bottom:12px;font-size:13px;color:var(--text);line-height:1.6;">'
      + '<strong>确认保存规则到 email_rules？</strong><br>'
      + '<span style="color:var(--text2);font-size:12px;">描述：' + escHtml(parsed.description || '') + '</span>'
      + tplHtml
      + '</div>'
      + '<div style="font-size:11px;color:var(--text3);line-height:1.5;">解析结果：<br>'
      + '<pre style="background:var(--bg2);padding:8px;border-radius:6px;overflow-x:auto;font-size:11px;">'
      + escHtml(JSON.stringify(parsed.parsed, null, 2)) + '</pre></div>';
    console.log('[saveRule] showing ACMSModal...');
    ACMSModal.show({
      title: '确认保存规则',
      html: confirmHtml,
      actions: [
        { label: '取消', value: null, className: 'acms-modal-btn' },
        { label: '保存', value: 'save', className: 'acms-modal-btn acms-modal-btn-primary' },
      ],
    }).then(function (result) {
      console.log('[saveRule] modal resolved with:', JSON.stringify(result));
      if (result !== 'save') return Promise.resolve(false);
      return true;
    }).then(function (ok) {
      console.log('[saveRule] user confirmed:', ok);
      if (!ok) return;
      // v0.97: reply_template 从 actions 提取到规则级别
      var actions = parsed.parsed.actions || {};
      var replyTemplate = actions.reply_template || '';
      if (replyTemplate) delete actions.reply_template;
      var payload = {
          mailbox: self.state.mailbox || 'INBOX',
          description: (parsed._originalDescription || parsed.description || '').trim(),
          parsed: parsed.parsed,
          parsed_conditions: parsed.parsed.conditions || {},
          parsed_actions: actions,
          reply_template: replyTemplate,  // v0.97: 规则级回复模板
          enabled: true,
          priority: (parsed.parsed.priority || 0),
        };
        console.log('[saveRule] posting payload:', JSON.stringify(payload).slice(0, 500));
        return apiFetch('POST', '/api/email-rules', payload);
      })
      .then(function (result) {
        console.log('[saveRule] API response:', JSON.stringify(result).slice(0, 300));
        // v0.38 修复：兼容两种返回格式（result.id 或 result.rule.id）
        var savedId = (result && result.id) || (result && result.rule && result.rule.id);
        if (savedId) {
          // v0.38: 不显示系统 toast（多多零容忍"toast 骗人"）
          self.setStatus('✅ 规则已保存（ID=' + savedId + '）', 'success');
          // 保存后自动刷新规则列表
          if (typeof self.loadRuleList === 'function') self.loadRuleList();
        } else if (result && result.ok === false) {
          self.setStatus('❌ 保存失败：' + (result.message || result.error || '未知错误'), 'error');
        } else {
          self.setStatus('⚠️ 保存结果未知：' + JSON.stringify(result).slice(0, 100), 'warning');
        }
      })
      .catch(function (err) {
        console.error('[saveRule] error:', err);
        self.setStatus('❌ 保存失败：' + (err.message || String(err)), 'error');
      });
  };

  EmailApp.prototype.showConfirmationCard = function (draftPreview, actionType) {
    // 阶段3 前端：参考 P151 异步卡片确认模式 + agent-buddy-action.js requires_confirmation 机制
    // 当规则动作包含 auto_reply 时，显示确认卡片（草稿预览 + 确认/拒绝按钮），不自动发送
    var self = this;
    var pane = this.root.querySelector('[data-role="pane"]');
    if (!pane) return;
    var cardId = 'em-confirm-card-' + (actionType || 'auto_reply');
    var existing = pane.querySelector('#' + cardId);
    if (existing) existing.remove();

    var cardHtml = [
      '<div id="' + cardId + '" style="margin-top:12px;padding:14px;background:var(--bg2);border:2px solid var(--yellow);border-radius:10px;">',
      '  <div style="font-size:10px;color:var(--yellow);font-weight:700;margin-bottom:6px;letter-spacing:.04em;">⚠️ 确认卡片（参考 P151 异步卡片确认模式 + agent-buddy-action.js requires_confirmation 机制）</div>',
      '  <div style="font-size:11px;color:var(--text2);line-height:1.5;margin-bottom:8px;">检测到规则动作包含 <span style="color:var(--accent1);font-weight:600;">自动回复（auto_reply）</span>。根据 <code>agent-buddy-action.js</code> 的 <code>requires_confirmation</code> 机制（<code>email_send</code> 能力必须确认），草稿已生成但 <strong>不会自动发送</strong>。请确认后再执行。</div>',
      '  <div style="font-size:11px;color:var(--text);line-height:1.55;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;margin-bottom:8px;max-height:200px;overflow-y:auto;white-space:pre-wrap;">' + escHtml(draftPreview || '草稿内容预览（参考 email-drafter 完整 prompt：不加签名、无占位符、长度自约束）') + '</div>',
      '  <div style="display:flex;gap:8px;">',
      '    <button onclick="var a=window.ACMSWin&&window.ACMSWin.getView&&window.ACMSWin.getView(\'email-inbox\');if(a&&a.confirmAutoReply)a.confirmAutoReply();else alert(\'确认发送（实际调用 confirmAutoReply，需实现发送逻辑）\')" style="padding:6px 14px;border-radius:6px;background:var(--green);color:#fff;font-size:11px;font-weight:600;border:none;cursor:pointer;">✅ 确认发送</button>',
      '    <button onclick="var a=window.ACMSWin&&window.ACMSWin.getView&&window.ACMSWin.getView(\'email-inbox\');if(a&&a.rejectAutoReply)a.rejectAutoReply();else alert(\'已拒绝（实际调用 rejectAutoReply，不执行发送）\')" style="padding:6px 14px;border-radius:6px;background:var(--text3);color:var(--text);font-size:11px;font-weight:600;border:1px solid var(--border);cursor:pointer;">❌ 拒绝</button>',
      '  </div>',
      '  <div style="font-size:9px;color:var(--text3);margin-top:6px;">参考：P151 异步卡片确认模式（展示草稿 + 确认/拒绝按钮，确认后才执行 email_send 动作）| P163 安全控制（不自动执行，防 silent write）</div>',
      '</div>',
    ].join('');
    pane.insertAdjacentHTML('beforeend', cardHtml);
    self.setStatus('规则引擎：检测到 auto_reply — 显示确认卡片（参考 P151 + agent-buddy-action.js requires_confirmation）');
  };

  EmailApp.prototype.confirmAutoReply = function () {
    // 阶段3 前端：用户确认后执行发送（参考 agent-buddy-action.js requires_confirmation 机制）
    // 实际发送逻辑应调用后端 /api/email-rules/confirm-auto-reply 或类似端点
    showToast('已确认发送（阶段3：参考 P151 确认模式 + agent-buddy-action requires_confirmation 机制）— 实际发送需接入后端确认端点', 'success');
    var card = this.root.querySelector('#em-confirm-card-auto_reply');
    if (card) card.style.opacity = '0.5';
  };

  EmailApp.prototype.rejectAutoReply = function () {
    // 阶段3 前端：用户拒绝后不执行任何发送动作（参考 P163 silent write 防御）
    showToast('已拒绝自动回复（阶段3：参考 P163 安全控制，不执行任何发送动作，防 silent write）', 'info');
    var card = this.root.querySelector('#em-confirm-card-auto_reply');
    if (card) card.remove();
  };

  // v0.36: 规则引擎快速入口（点击后右栏内嵌显示 — 主入口在设置界面内的「规则引擎」分类）
    EmailApp.prototype.loadRuleLogs = function (mailbox) {
    var self = this;
    mailbox = mailbox || this.state.mailbox || 'INBOX';
    var logContainer = this.root.querySelector('[data-role="rule-logs"]') || this.root.querySelector('.rule-logs-container');
    if (!logContainer) return;
    logContainer.innerHTML = '<div style="font-size:11px;color:var(--text3);text-align:center;padding:20px;">加载执行日志中...</div>';
    apiFetch('GET', buildUrl('/api/email-rules/logs', { mailbox: mailbox }))
      .then(function (data) {
        var logs = (data && data.logs) || [];
        if (!logs.length) {
          logContainer.innerHTML = '<div style="font-size:11px;color:var(--text3);text-align:center;padding:20px;">暂无执行日志（邮箱维度隔离：' + self.escapeHtml(mailbox) + '）。规则执行后将写入 <code>email_rule_logs</code>，并通过 WS 推送（参考 P177 事件广播模式）。</div>';
          return;
        }
        // log-entry 卡片样式渲染（参考 prototype-email-rules.html 右栏 log-entry 设计）
        var html = '';
        for (var i = 0; i < Math.min(logs.length, 20); i++) {
          var log = logs[i];
          var ts = log.timestamp ? new Date(log.timestamp).toLocaleString() : '无时间戳';
          var ruleName = log.rule_id || log.rule_description || '未知规则';
          var actions = log.results ? (Array.isArray(log.results) ? log.results.join(' + ') : String(log.results)) : '执行';
          var hasFail = log.executed_actions && Object.values(log.executed_actions || {}).some(function(a) { return a && a.ok === false; });
          var resultLabel = hasFail
            ? '<span style="font-size:11px;padding:1px 5px;border-radius:4px;display:inline-block;margin-top:4px;background:rgba(239,68,68,.1);color:var(--red);border:1px solid rgba(239,68,68,.25);" title="执行失败或被确认机制拦截（参考 P163 silent write 防御）">❌ 失败</span>'
            : '<span style="font-size:11px;padding:1px 5px;border-radius:4px;display:inline-block;margin-top:4px;background:rgba(16,185,129,.12);color:var(--green);border:1px solid rgba(16,185,129,.25);" title="执行成功（参考 P177 链路完整性验证）">✅ 成功</span>';
          html += '<div style="border-bottom:1px solid var(--border);padding:10px 0;font-size:12px;">';
          html += '  <div style="font-size:11px;color:var(--text3);font-family:monospace;margin-bottom:4px;" title="规则执行时间戳（参考 P177 链路完整性验证）">' + self.escapeHtml(ts) + '</div>';
          html += '  <div style="font-weight:600;color:var(--text);margin-bottom:2px;" title="规则 ID 和描述（参考 email_rules DB）">' + self.escapeHtml(String(ruleName).slice(0, 50)) + '</div>';
          html += '  <div style="font-size:11px;color:var(--text2);line-height:1.4;" title="执行动作列表（参考 ALLOWED_ACTIONS 白名单 + P177 链路）">' + self.escapeHtml(actions) + '</div>';
          html += '  ' + resultLabel;
          html += '</div>';
        }
        if (logs.length > 20) {
          html += '<div style="text-align:center;padding:10px;font-size:10px;color:var(--text3);">仅显示最新 20 条，共 ' + logs.length + ' 条记录</div>';
        }
        logContainer.innerHTML = html;
        // 更新状态栏的上次执行时间
        if (logs.length > 0 && logs[0].timestamp) {
          self.state.lastRuleRun = new Date(logs[0].timestamp).toLocaleString();
        }
      })
      .catch(function (err) {
        logContainer.innerHTML = '<div style="font-size:11px;color:var(--red);text-align:center;padding:20px;">加载执行日志失败：' + self.escapeHtml(err.message || String(err)) + '</div>';
      });
  };

EmailApp.prototype.loadRuleList = function () {
    var self = this;
    // v0.96: 兼容两个选择器（rules-list 和 rules-list-inline）
    var container = this.root.querySelector('[data-role="rules-list"], [data-role="rules-list-inline"]');
    if (!container) return;
    container.innerHTML = '<div style="font-size:11px;color:var(--text3);padding:8px;text-align:center;">加载规则中...</div>';
    apiFetch('GET', buildUrl('/api/email-rules', { mailbox: this.state.mailbox || 'INBOX' }))
      .then(function (data) {
        var rules = (data && data.rules) || [];
        if (!rules.length) {
          container.innerHTML = '<div style="font-size:11px;color:var(--text3);padding:16px;background:var(--bg);border:1px solid var(--border);border-radius:8px;text-align:center;">当前邮箱（' + self.escapeHtml(self.state.mailbox || 'INBOX') + '）暂无规则。先在「规则配置」中创建一条规则。</div>';
          return;
        }
        // 卡片式渲染（参考 prototype-email-rules.html rule-card 设计）
        var html = '';
        for (var i = 0; i < rules.length; i++) {
          var r = rules[i];
          var title = String(r.user_description || '').slice(0, 40);
          var desc = String(r.user_description || '');
          var priority = r.priority || 0;
          var enabled = r.enabled !== false;
          var mailbox = r.mailbox || 'INBOX';
          var statusLabel = enabled ? '<span style="font-size:10px;color:var(--green);font-weight:600;">✅ 已启用</span>' : '<span style="font-size:10px;color:var(--text3);">⏸ 禁用</span>';
          var priorityLabel = '<span style="font-size:10px;color:var(--accent1);font-weight:600;margin-left:auto;">优先级 ' + priority + '</span>';
          html += '<div style="border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px;background:var(--bg3);">';
          html += '  <div style="font-weight:600;font-size:13px;color:var(--text);margin-bottom:4px;display:flex;align-items:center;gap:6px;">📧 ' + self.escapeHtml(title) + priorityLabel + '</div>';
          html += '  <div style="font-size:12px;color:var(--text2);margin-bottom:6px;line-height:1.45;">' + self.escapeHtml(desc) + '</div>';
          html += '  <div style="display:flex;gap:8px;font-size:11px;color:var(--text3);align-items:center;">';
          html += '    <span style="padding:1px 6px;border-radius:4px;background:var(--bg);border:1px solid var(--border);">' + statusLabel + '</span>';
          html += '    <span style="padding:1px 6px;border-radius:4px;background:var(--bg);border:1px solid var(--border);">' + self.escapeHtml(mailbox) + '</span>';
          html += '    <span style="font-family:monospace;font-size:10px;color:var(--text3);">ID: ' + self.escapeHtml(String(r.id).slice(0, 16)) + '</span>';
          // v0.97: 显示 reply_template（规则级字段）
          var tpl = r.reply_template || (r.parsed_actions && r.parsed_actions.reply_template) || '';
          if (tpl) {
            html += '    <span style="font-size:10px;color:var(--accent1);" title="该规则配置的自动回复模板">📝模板</span>';
          }
          html += '    <button data-rule-id="' + self.escapeHtml(String(r.id)) + '" data-action="delete-rule" style="margin-left:auto;padding:3px 10px;border-radius:6px;background:var(--red);color:#fff;font-size:10px;font-weight:600;border:none;cursor:pointer;" title="删除规则（显式确认，防 P163 silent write）">🗑 删除</button>';
          html += '  </div>';
          html += '</div>';
        }
        container.innerHTML = html;
      // v0.38: 同步更新配置页内的内嵌规则列表（如果存在）
      var inlineContainer = self.root.querySelector('[data-role="rules-list-inline"]');
      if (inlineContainer && inlineContainer !== container) {
        inlineContainer.innerHTML = html;
      }
      })
      .catch(function (err) {
        container.innerHTML = '<div style="font-size:11px;color:var(--red);padding:8px;">加载失败：' + self.escapeHtml(err.message || String(err)) + '</div>';
      });
  };

  // 子页面 3：自动回复模板管理 — v0.99（独立维护模板，规则引用模板 ID）
  EmailApp.prototype.renderRulesSubTemplate = function () {
    var self = this;
    return [
      '<section>',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">',
      '    <h3 style="font-size:13px;font-weight:700;color:var(--text);margin:0;"><span style="width:3px;height:16px;border-radius:2px;background:var(--accent1);display:inline-block;margin-right:6px;"></span>✉️ 自动回复模板库</h3>',
      '    <button data-action="template-add" style="padding:6px 14px;border-radius:6px;background:var(--accent1);color:#fff;font-size:11px;font-weight:600;border:none;cursor:pointer;" title="新建回复模板">+++ 新建模板</button>',
      '  </div>',
      '  <div data-role="template-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;" title="自动回复模板列表（每个规则可引用一个模板）">',
      '    <div style="font-size:11px;color:var(--text3);text-align:center;padding:20px;background:var(--bg);border:1px solid var(--border);border-radius:8px;grid-column:1/-1;">Loading...</div>',
      '  </div>',
      '  <div style="margin-top:12px;padding:10px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;font-size:11px;color:var(--text2);line-height:1.5;" title="模板使用说明：规则配置时从下拉菜单选择模板，不直接在规则中编写回复内容">',
      '    💡 <strong>Usage:</strong> Templates are reusable reply content. Rules reference templates via dropdown.',
      '  </div>',
      '</section>',
    ].join('');
    // Load templates after render
    setTimeout(function () { self.loadTemplates(); }, 50);
  };

  // v0.99: Load template list
  EmailApp.prototype.loadTemplates = function () {
    var self = this;
    var container = this.root.querySelector('[data-role="template-list"]');
    if (!container) return;
    apiFetch('GET', '/api/email-templates').then(function (data) {
      var templates = (data && data.templates) || [];
      if (!templates.length) {
        container.innerHTML = '<div style="font-size:11px;color:var(--text3);text-align:center;padding:20px;background:var(--bg);border:1px solid var(--border);border-radius:8px;grid-column:1/-1;">No templates yet. Click "New Template" to add one.</div>';
        return;
      }
      container.innerHTML = templates.map(function (t) {
        return '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;" title="ID: ' + escHtml(t.id) + '">';
      }).join('');
    }).catch(function (err) {
      container.innerHTML = '<div style="font-size:11px;color:var(--red);text-align:center;padding:20px;">Failed: ' + escHtml(err.message) + '</div>';
    });
  };

  // v0.99: Show template modal (add/edit)
  EmailApp.prototype.showTemplateModal = function (tplId) {
    var self = this;
    var isEdit = !!tplId;
    var tpl = null;
    if (isEdit) {
      // Load existing template
      apiFetch('GET', '/api/email-templates').then(function (data) {
        var templates = (data && data.templates) || [];
        tpl = templates.find(function (t) { return t.id === tplId; });
        self.renderTemplateModal(tpl || null);
      }).catch(function (err) {
        self.renderTemplateModal(null);
      });
    } else {
      this.renderTemplateModal(null);
    }
  };

  EmailApp.prototype.renderTemplateModal = function (tpl) {
    var self = this;
    var title = tpl ? '编辑模板' : '新建模板';
    var html = '<div style="margin-bottom:12px;">'
      + '<label style="display:block;font-size:11px;color:var(--text2);margin-bottom:4px;font-weight:600;">模板名称</label>'
      + '<input id="tpl-name" type="text" placeholder="例如：客户咨询回复" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;" value="' + (tpl ? escHtml(tpl.name) : '') + '"/>'
      + '</div>'
      + '<div style="margin-bottom:12px;">'
      + '<label style="display:block;font-size:11px;color:var(--text2);margin-bottom:4px;font-weight:600;">模板内容</label>'
      + '<textarea id="tpl-content" style="width:100%;min-height:120px;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px;color:var(--text);font-size:12px;line-height:1.5;resize:vertical;font-family:inherit;" placeholder="输入自动回复内容...">' + (tpl ? escHtml(tpl.content) : '') + '</textarea>'
      + '</div>'
      + '<div style="font-size:10px;color:var(--text3);line-height:1.4;">💡 提示：模板内容会被用于 auto_reply 规则的回复。每个规则可引用不同模板。</div>';
    
    ACMSModal.show({
      title: title,
      html: html,
      actions: [
        { label: '取消', value: 'cancel', className: 'acms-modal-btn' },
        { label: '保存', value: 'save', className: 'acms-modal-btn acms-modal-btn-primary' },
      ],
    }).then(function (result) {
      if (result !== 'save') return;
      var name = document.getElementById('tpl-name').value.trim();
      var content = document.getElementById('tpl-content').value.trim();
      if (!name || !content) {
        self.setStatus('请填写模板名称和内容', 'warning');
        return;
      }
      var payload = { name: name, content: content, mailbox: self.state.mailbox || 'INBOX' };
      if (tpl) payload.id = tpl.id;
      var method = tpl ? 'PUT' : 'POST';
      var url = tpl ? '/api/email-templates/' + encodeURIComponent(tpl.id) : '/api/email-templates';
      apiFetch(method, url, payload).then(function (data) {
        self.setStatus(tpl ? '模板已更新' : '模板已创建', 'success');
        self.loadTemplates();
      }).catch(function (err) {
        self.setStatus('操作失败：' + err.message, 'error');
      });
    });
  };

  // v0.99: Delete template
  EmailApp.prototype.deleteTemplate = function (tplId) {
    var self = this;
    ACMSModal.show({
      title: '确认删除模板',
      html: '<div style="font-size:13px;color:var(--text);">确认删除此模板？删除后引用此模板的规则将失去回复内容。</div>',
      actions: [
        { label: '取消', value: 'cancel', className: 'acms-modal-btn' },
        { label: '删除', value: 'delete', className: 'acms-modal-btn', style: 'background:var(--red);' },
      ],
    }).then(function (result) {
      if (result !== 'delete') return;
      apiFetch('DELETE', '/api/email-templates/' + encodeURIComponent(tplId)).then(function () {
        self.setStatus('模板已删除', 'success');
        self.loadTemplates();
      }).catch(function (err) {
        self.setStatus('删除失败：' + err.message, 'error');
      });
    });
  };

  // 子页面 4：执行日志 — 参考原型右栏 log-entry（卡片式：时间戳/规则名/动作/结果标签）
  EmailApp.prototype.renderRulesSubLogs = function () {
    var self = this;
    return [
      '<section style="padding:14px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">',
      '    <h3 style="font-size:13px;font-weight:700;color:var(--text);">📊 规则执行日志（log-entry 卡片视图）</h3>',
      '    <button onclick="var a=window.ACMSWin&&window.ACMSWin.getView&&window.ACMSWin.getView(\'email-inbox\');if(a&&a.loadRuleLogs)a.loadRuleLogs();else alert(\'加载日志\')" style="padding:5px 12px;border-radius:6px;background:var(--accent1);color:#fff;font-size:11px;font-weight:600;border:none;cursor:pointer;" title="刷新执行日志（参考 email_rule_logs DB）">🔄 刷新日志</button>',
      '  </div>',
      '  <div class="rule-logs-container" data-role="rule-logs" style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;font-size:12px;color:var(--text2);max-height:500px;overflow-y:auto;" title="email_rule_logs 数据（参考 prototype-email-rules.html 右栏 log-entry 设计）">',
      '    <div style="font-size:11px;color:var(--text3);text-align:center;padding:20px;">点击「刷新日志」加载最新执行记录</div>',
      '  </div>',
      '</section>',
    ].join('');
  };

  // v0.36: 分类 2 - 邮箱账户
  EmailApp.prototype.renderCategoryAccount = function () {
    return [
      '<div style="max-width:900px;">',
      '  <h2 style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:6px;">邮箱账户</h2>',
      '  <p style="font-size:12px;color:var(--text3);margin-bottom:20px;line-height:1.6;" title="邮箱账户配置（参考 imap-service.js v0.73 + IMAP/SMTP 协议）">配置 IMAP 收信和 SMTP 发信服务器，管理邮箱文件夹列表，查看账户信息（连接状态、最近同步时间）。</p>',
      // IMAP 配置
      '  <section style="margin-bottom:20px;padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;">',
      '    <h3 style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:12px;">📥 IMAP 收信配置（参考 imap-service.js createImapService）</h3>',
      '    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">',
      '      <div><label style="display:block;font-size:11px;color:var(--text2);margin-bottom:4px;font-weight:600;" title="IMAP 服务器地址（参考 imap-service.js host 配置）">服务器地址</label><input type="text" value="imap.263.net" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;" /></div>',
      '      <div><label style="display:block;font-size:11px;color:var(--text2);margin-bottom:4px;font-weight:600;" title="IMAP 端口（SSL 默认 993）">端口</label><input type="number" value="993" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;" /></div>',
      '      <div><label style="display:block;font-size:11px;color:var(--text2);margin-bottom:4px;font-weight:600;" title="邮箱账号">账号</label><input type="text" placeholder="user@example.com" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;" /></div>',
      '      <div><label style="display:block;font-size:11px;color:var(--text2);margin-bottom:4px;font-weight:600;" title="邮箱密码 / 授权码">密码</label><input type="password" placeholder="••••••••" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;" /></div>',
      '    </div>',
      '    <div style="margin-top:10px;display:flex;gap:8px;align-items:center;">',
      '      <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text2);" title="启用 SSL/TLS 加密连接"><input type="checkbox" checked /> 启用 SSL/TLS</label>',
      '      <button style="padding:5px 12px;border-radius:6px;background:var(--accent1);color:#fff;font-size:11px;font-weight:600;border:none;cursor:pointer;" title="测试 IMAP 连接（参考 imap-service.js connect）">🧪 测试连接</button>',
      '      <button style="padding:5px 12px;border-radius:6px;background:var(--green);color:#fff;font-size:11px;font-weight:600;border:none;cursor:pointer;" title="保存配置（显式确认写入，防 P163 silent write）">💾 保存</button>',
      '    </div>',
      '  </section>',
      // 邮箱列表
      '  <section style="padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;">',
      '    <h3 style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:12px;">📁 邮箱文件夹（参考 loadMailboxes）</h3>',
      '    <div style="font-size:11px;color:var(--text2);" title="邮箱文件夹列表（INBOX、已处理、草稿、已发送等）">',
      '      <div style="padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;"><span>📁 INBOX</span><span style="color:var(--text3);font-size:10px;">默认邮箱</span></div>',
      '      <div style="padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;"><span>📁 已处理</span><span style="color:var(--text3);font-size:10px;">归档</span></div>',
      '      <div style="padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;"><span>📁 草稿</span><span style="color:var(--text3);font-size:10px;">Drafts</span></div>',
      '      <div style="padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;display:flex;justify-content:space-between;align-items:center;"><span>📁 已发送</span><span style="color:var(--text3);font-size:10px;">Sent</span></div>',
      '    </div>',
      '  </section>',
      '  <section style="margin-top:20px;padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;">',
      '    <h3 style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px;">📡 实时监听（IMAP IDLE — 集成 mail-listener）</h3>',
      '    <p style="font-size:11px;color:var(--text3);margin-bottom:12px;line-height:1.6;" title="启动后，新邮件到达时自动触发规则引擎匹配 + 写入执行日志（参考 P177 事件广播链路）">启动后，新邮件到达时会自动触发规则引擎匹配 + 写入执行日志（参考集成决策矩阵 Tier 1-推荐1）。监听器状态保存在内存，重启 ACMS 后需重新启动。</p>',
      '    <div style="display:flex;gap:8px;margin-bottom:12px;">',
      '      <button data-action="start-listening" style="padding:6px 14px;border-radius:6px;background:var(--green);color:#fff;font-size:12px;font-weight:600;border:none;cursor:pointer;" title="启动 IMAP IDLE 监听（集成 mail-listener）">▶ 启动实时监听</button>',
      '      <button data-action="stop-listening" style="padding:6px 14px;border-radius:6px;background:var(--bg3);color:var(--text);font-size:12px;font-weight:600;border:1px solid var(--border);cursor:pointer;" title="停止监听">⏹ 停止监听</button>',
      '      <button data-action="refresh-listening" style="padding:6px 14px;border-radius:6px;background:var(--accent1);color:#fff;font-size:12px;font-weight:600;border:none;cursor:pointer;" title="刷新监听状态（从后端拉取当前正在监听的 mailbox）">🔄 刷新状态</button>',
      '    </div>',
      '    <div data-role="listening-status" style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px;min-height:40px;">',
      '      <div style="font-size:11px;color:var(--text3);">点击【刷新状态】查看当前监听情况</div>',
      '    </div>',
      '    <div style="font-size:9px;color:var(--text3);margin-top:8px;">参考代码：email-listener-integration.js + imap-service.js startListening/stopListening/listListening</div>',
      '  </section>',
      '</div>',
    ].join('');
  };

  // v0.36: 分类 3 - AI 与分类
    // v0.36 + v0.38: AI 与分类（含用户维护的分类列表 — AI 自动分类依据）
  EmailApp.prototype.renderCategoryAI = function () {
    var self = this;
    return [
      '<div style="max-width:900px;">',
      '  <h2 style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:6px;">AI 与分类</h2>',
      '  <p style="font-size:12px;color:var(--text3);margin-bottom:20px;line-height:1.6;" title="邮件分类设置（参考 email-classifier.js + email-sender-analyzer.js）">配置邮件分类使用的 LLM 模型，调节分类敏感度，<strong style="color:var(--accent1);">并维护你自定义的分类体系</strong>（AI 会根据你的分类自动给进入的邮件分类）。</p>',
      // 用户维护的分类列表（v0.38 新增）
      '  <section style="margin-bottom:20px;padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;">',
      '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">',
      '      <h3 style="font-size:14px;font-weight:700;color:var(--text);">📋 你的分类体系（用户维护 — AI 自动分类依据）</h3>',
      '      <div style="display:flex;gap:6px;">',
      '        <button data-action="seed-categories" style="padding:5px 12px;border-radius:6px;background:var(--bg3);color:var(--text);font-size:11px;font-weight:600;border:1px solid var(--border);cursor:pointer;" title="首次使用初始化默认 8 分类（已有则跳过）">🌱 初始化默认</button>',
      '        <button data-action="add-category" style="padding:5px 12px;border-radius:6px;background:var(--accent1);color:#fff;font-size:11px;font-weight:600;border:none;cursor:pointer;" title="新增自定义分类">+ 新增分类</button>',
      '        <button data-action="refresh-categories" style="padding:5px 12px;border-radius:6px;background:var(--bg3);color:var(--text);font-size:11px;font-weight:600;border:1px solid var(--border);cursor:pointer;" title="刷新分类列表">🔄</button>',
      '      </div>',
      '    </div>',
      '    <div class="categories-list-container" data-role="categories-list" style="font-size:11px;color:var(--text2);">',
      '      <div style="font-size:11px;color:var(--text3);text-align:center;padding:16px;background:var(--bg);border:1px solid var(--border);border-radius:8px;">点击【初始化默认】或【+ 新增分类】开始维护你的分类</div>',
      '    </div>',
      '    <div style="font-size:9px;color:var(--text3);margin-top:8px;" title="参考 v0.38：用户维护分类 + AI 自动分类（参考 email-classifier.js classifyEmailAndPersist）">参考 v0.38：AI 收到新邮件时，会自动从你的分类列表中选择最合适的（参考 email-classifier.js + email_categories collection）。</div>',
      '  </section>',
      // LLM 模型选择
      '  <section style="margin-bottom:20px;padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;">',
      '    <h3 style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:12px;">🤖 LLM 模型选择</h3>',
      '    <select style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;">',
      '      <option>anthropic/claude-sonnet-4</option>',
      '      <option>openai/gpt-4o-mini</option>',
      '      <option selected>agnes-2.5-flash（默认）</option>',
      '      <option>Qwen Code（本地模型）</option>',
      '    </select>',
      '  </section>',
      // 分类敏感度
      '  <section style="padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;">',
      '    <h3 style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:12px;">📊 分类敏感度</h3>',
      '    <div style="display:flex;gap:12px;align-items:center;">',
      '      <input type="range" min="0.3" max="0.9" step="0.05" value="0.6" style="flex:1;" />',
      '      <span style="font-size:12px;color:var(--text);min-width:40px;">0.60</span>',
      '    </div>',
      '    <div style="margin-top:6px;font-size:10px;color:var(--text3);">低（0.3）= 更多分类触发 / 高（0.9）= 仅高置信度分类</div>',
      '  </section>',
      '</div>',
    ].join('');
  };

    // v0.36: 分类 4 - 通知设置
  EmailApp.prototype.renderCategoryNotify = function () {
    return [
      '<div style="max-width:900px;">',
      '  <h2 style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:6px;">通知设置</h2>',
      '  <p style="font-size:12px;color:var(--text3);margin-bottom:20px;line-height:1.6;" title="规则执行事件通知配置（参考 P177 事件广播模式）">规则匹配执行后是否通知用户，通知频率与推送方式。</p>',
      '  <section style="margin-bottom:20px;padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;">',
      '    <h3 style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:12px;">🔔 通知方式</h3>',
      '    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text);margin-bottom:8px;" title="前端 Toast 通知（参考 showToast）"><input type="checkbox" checked /> Toast 通知（应用内）</label>',
      '    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text);margin-bottom:8px;" title="WS 推送通知（参考 P177 事件广播链路：customEvent acms:email.rule.notify）"><input type="checkbox" checked /> WS 推送（WebSocket）</label>',
      '    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text);margin-bottom:8px;" title="浏览器系统通知（Notification API）"><input type="checkbox" /> 浏览器系统通知</label>',
      '  </section>',
      '  <section style="margin-bottom:20px;padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;">',
      '    <h3 style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:12px;">⏱️ 通知频率</h3>',
      '    <select style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;" title="通知频率（参考 P177 链路）">',
      '      <option>即时通知（每条规则执行都通知）</option>',
      '      <option selected>每日摘要（每天一次汇总）</option>',
      '      <option>每周摘要（每周一次汇总）</option>',
      '      <option>静默模式（不通知）</option>',
      '    </select>',
      '  </section>',
      '  <section style="padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;">',
      '    <h3 style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:12px;">📋 通知内容格式</h3>',
      '    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text);margin-bottom:6px;" title="包含规则 ID 和描述"><input type="radio" name="notify-format" /> 仅状态（✅/❌）</label>',
      '    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text);margin-bottom:6px;" title="包含规则描述和动作"><input type="radio" name="notify-format" checked /> 简洁（规则 + 动作）</label>',
      '    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text);" title="包含完整日志条目（参考 P177 链路完整性）"><input type="radio" name="notify-format" /> 完整（规则 + 动作 + 原始邮件摘要）</label>',
      '  </section>',
      '</div>',
    ].join('');
  };

  // v0.36: 分类 5 - 显示与界面
  EmailApp.prototype.renderCategoryDisplay = function () {
    return [
      '<div style="max-width:900px;">',
      '  <h2 style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:6px;">显示与界面</h2>',
      '  <p style="font-size:12px;color:var(--text3);margin-bottom:20px;line-height:1.6;" title="主题 / 密度 / 字体设置">自定义邮件应用的视觉外观。</p>',
      '  <section style="margin-bottom:20px;padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;">',
      '    <h3 style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:12px;">🎨 主题</h3>',
      '    <div style="display:flex;gap:12px;">',
      '      <label style="flex:1;padding:12px;background:var(--bg);border:2px solid var(--accent1);border-radius:8px;cursor:pointer;text-align:center;" title="深色主题（默认）"><input type="radio" name="theme" checked style="display:none;" /><div style="font-size:13px;color:var(--text);font-weight:600;">🌙 深色</div></label>',
      '      <label style="flex:1;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;cursor:pointer;text-align:center;" title="浅色主题"><input type="radio" name="theme" style="display:none;" /><div style="font-size:13px;color:var(--text);font-weight:600;">☀️ 浅色</div></label>',
      '      <label style="flex:1;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;cursor:pointer;text-align:center;" title="跟随系统"><input type="radio" name="theme" style="display:none;" /><div style="font-size:13px;color:var(--text);font-weight:600;">🖥️ 跟随系统</div></label>',
      '    </div>',
      '  </section>',
      '  <section style="margin-bottom:20px;padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;">',
      '    <h3 style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:12px;">📏 列表密度</h3>',
      '    <select style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;" title="邮件列表的显示密度（参考 .em-item padding）">',
      '      <option>紧凑（每页显示更多）</option>',
      '      <option selected>标准（推荐）</option>',
      '      <option>宽松（信息更清晰）</option>',
      '    </select>',
      '  </section>',
      '  <section style="padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;">',
      '    <h3 style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:12px;">🔤 字体大小</h3>',
      '    <div style="display:flex;gap:12px;align-items:center;" title="正文字体大小（参考 --font 变量）">',
      '      <input type="range" min="12" max="18" step="1" value="14" style="flex:1;" />',
      '      <span style="font-size:12px;color:var(--text);min-width:40px;">14px</span>',
      '    </div>',
      '  </section>',
      '</div>',
    ].join('');
  };

  // v0.36: 分类 6 - 高级
  EmailApp.prototype.renderCategoryAdvanced = function () {
    return [
      '<div style="max-width:900px;">',
      '  <h2 style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:6px;">高级</h2>',
      '  <p style="font-size:12px;color:var(--text3);margin-bottom:20px;line-height:1.6;" title="调试模式 / 数据管理 / 关于信息">高级设置与诊断。</p>',
      '  <section style="margin-bottom:20px;padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;">',
      '    <h3 style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:12px;">🐛 调试模式</h3>',
      '    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text);" title="启用后输出详细日志（参考 imap-service.js v0.74.1 debug 日志）"><input type="checkbox" /> 启用调试日志（控制台输出详细 IMAP/规则执行日志）</label>',
      '  </section>',
      '  <section style="margin-bottom:20px;padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;">',
      '    <h3 style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:12px;">🗑️ 数据管理</h3>',
      '    <div style="display:flex;gap:8px;flex-wrap:wrap;">',
      '      <button style="padding:6px 12px;border-radius:6px;background:var(--bg3);color:var(--text);font-size:11px;font-weight:600;border:1px solid var(--border);cursor:pointer;" title="清理执行日志（参考 email_rule_logs DB）">清理执行日志</button>',
      '      <button style="padding:6px 12px;border-radius:6px;background:var(--bg3);color:var(--text);font-size:11px;font-weight:600;border:1px solid var(--border);cursor:pointer;" title="清理发件人分类缓存（参考 email_sender_categories）">清理发件人分类</button>',
      '      <button style="padding:6px 12px;border-radius:6px;background:var(--bg3);color:var(--text);font-size:11px;font-weight:600;border:1px solid var(--border);cursor:pointer;" title="导出所有规则和日志">导出数据</button>',
      '    </div>',
      '  </section>',
      '  <section style="padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;">',
      '    <h3 style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:12px;">ℹ️ 关于</h3>',
      '    <div style="font-size:12px;color:var(--text2);line-height:1.7;">',
      '      <div>ACMS 邮件应用 · v0.74</div>',
      '      <div>规则引擎：v0.36（参考 Inbox-Zero plain English rules）</div>',
      '      <div>数据库：SQLite（email_rules / email_rule_logs）</div>',
      '      <div style="margin-top:8px;font-size:10px;color:var(--text3);" title="参考代码：email-inbox.js · email-classifier.js · email-rule-parser.js · email-rule-engine.js · email-drafter.js">核心模块：email-inbox.js · email-classifier.js · email-rule-parser.js · email-rule-engine.js · email-drafter.js</div>',
      '    </div>',
      '  </section>',
      '</div>',
    ].join('');
  };


  // v0.36: 全屏设置界面（整页切换 — 主界面 ↔ 设置界面，左侧导航 + 右侧内容 + 顶部返回按钮）
  EmailApp.prototype.showSettingsView = function (category) {
    var self = this;
    if (!this.root) return;
    var initialCategory = category || 'rules';
    this.state.currentView = 'settings';
    this.state.settingsCategory = initialCategory;
    this.root.innerHTML = [
      '<div class="em-settings-view" style="display:flex;flex-direction:column;height:100%;background:var(--bg);">',
      '  <header style="padding:14px 18px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-shrink:0;">',
      '    <button data-action="back-to-main" style="padding:6px 12px;border-radius:6px;background:var(--bg3);color:var(--text);font-size:12px;font-weight:600;border:1px solid var(--border);cursor:pointer;display:flex;align-items:center;gap:6px;" title="返回邮件主界面（保留当前邮件列表状态）">← 返回邮件</button>',
      '    <h1 style="font-size:16px;font-weight:700;color:var(--text);margin:0;">⚙️ 设置</h1>',
      '    <span style="font-size:11px;color:var(--text3);margin-left:8px;">当前分类：<span data-role="settings-current-cat" style="color:var(--accent1);font-weight:600;">' + self.escapeHtml(initialCategory) + '</span></span>',
      '  </header>',
      '  <div style="display:flex;flex:1;overflow:hidden;">',
      '    <nav style="width:220px;background:var(--bg2);border-right:1px solid var(--border);padding:14px 0;overflow-y:auto;flex-shrink:0;">',
      '      <div style="padding:0 14px 8px;font-size:10px;color:var(--text3);font-weight:700;letter-spacing:.06em;text-transform:uppercase;">分类</div>',
      '      <ul style="list-style:none;padding:0;margin:0;">',
      self.renderSettingsNavItem('rules', '📋 规则引擎', '自然语言规则配置 / 解析预览 / 自动回复模板 / 执行日志（核心）'),
      self.renderSettingsNavItem('account', '📧 邮箱账户', 'IMAP/SMTP 配置 / 邮箱列表 / 账户信息'),
      self.renderSettingsNavItem('ai', '🤖 AI 与分类', '模型选择 / 分类敏感度 / 发件人分类'),
      self.renderSettingsNavItem('notify', '🔔 通知设置', '规则执行通知 / WS 推送 / 通知频率'),
      self.renderSettingsNavItem('display', '🎨 显示与界面', '主题（深色/浅色）/ 列表密度 / 字体大小'),
      self.renderSettingsNavItem('advanced', '⚙️ 高级', '调试模式 / 数据管理 / 关于'),
      '      </ul>',
      '    </nav>',
      '    <main data-role="settings-content" style="flex:1;overflow-y:auto;padding:20px;background:var(--bg);">',
      self.renderSettingsCategory(initialCategory),
      '    </main>',
      '  </div>',
      '</div>',
    ].join('');
    self.setStatus('已进入设置界面（分类：' + initialCategory + '）— 点 ← 返回邮件回到主界面');
  };

  EmailApp.prototype.renderSettingsNavItem = function (category, label, tooltip) {
    var isActive = (this.state.settingsCategory || 'rules') === category;
    // v0.38: 设置左侧导航选中样式 — 深色背景 + 亮色字（最高对比度）
    var bg = isActive ? 'var(--text)' : 'transparent';
    var color = isActive ? 'var(--bg)' : 'var(--text2)';
    var borderLeft = isActive ? '3px solid var(--accent1)' : '3px solid transparent';
    return '<li><button data-action="settings-category" data-category="' + category + '" style="width:100%;text-align:left;padding:10px 14px;background:' + bg + ';color:' + color + ';font-size:12px;font-weight:' + (isActive ? '600' : '500') + ';border:none;border-left:' + borderLeft + ';cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:8px;" title="' + tooltip + '">' + label + '</button></li>';
  };

  EmailApp.prototype.showSettingsCategory = function (category) {
    var self = this;
    if (!category) return;
    this.state.settingsCategory = category;
    var navItems = this.root.querySelectorAll('nav button[data-action="settings-category"]');
    for (var i = 0; i < navItems.length; i++) {
      var item = navItems[i];
      var cat = item.getAttribute('data-category');
      var isActive = cat === category;
      item.style.background = isActive ? 'var(--text)' : 'transparent';
      item.style.color = isActive ? 'var(--bg)' : 'var(--text2)';
      item.style.fontWeight = isActive ? '600' : '500';
      item.style.borderLeft = isActive ? '3px solid var(--accent1)' : '3px solid transparent';
    }
    var catLabel = this.root.querySelector('[data-role="settings-current-cat"]');
    if (catLabel) catLabel.textContent = category;
    var content = this.root.querySelector('[data-role="settings-content"]');
    if (content) content.innerHTML = this.renderSettingsCategory(category);
    this.setStatus('设置分类已切换：' + category);
  };

  // v0.36: 返回主界面（从设置界面回到邮件三栏布局）
  EmailApp.prototype.backToMainView = function () {
    var self = this;
    this.state.currentView = 'main';
    this.render();
    this.loadAccount()
      .then(function () { return self.loadMailboxes(); })
      .then(function () { return self.loadEmails(); })
      .catch(function (err) {
        if (err && err.code === 'IMAP_CONNECT_FAILED') return;
        self.setStatus('恢复数据失败: ' + (err && err.message || '未知错误'), 'error');
      });
    this.setStatus('已返回邮件主界面（已恢复邮件目录 + 邮件列表）');
  };

  // v0.37: 规则引擎分类 — 4 个子页签（参考 prototype-email-rules.html）
  
  // v0.37: 子页签按钮渲染 helper（renderCategoryRules 调用）
  EmailApp.prototype.renderRulesSubTab = function (key, label, tooltip) {
    // v0.38 修复：选中按钮颜色对比度（深色背景 + 亮色字 = 最高对比度，避免白字看不清）
    var isActive = (this.state.rulesSubTab || 'config') === key;
    var bg = isActive ? 'var(--text)' : 'var(--bg3)';
    var color = isActive ? 'var(--bg)' : 'var(--text2)';
    var border = isActive ? '1px solid var(--text)' : '1px solid var(--border)';
    return '<button data-action="rules-sub-tab" data-sub="' + key + '" style="padding:6px 14px;border-radius:6px;background:' + bg + ';color:' + color + ';font-size:11px;font-weight:600;border:' + border + ';cursor:pointer;" title="' + tooltip + '">' + label + '</button>';
  };

EmailApp.prototype.renderCategoryRules = function () {
    var self = this;
    var sub = this.state.rulesSubTab || 'config';
    return [
      '<div style="max-width:1000px;">',
      '  <h2 style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:6px;">规则引擎</h2>',
      '  <p style="font-size:12px;color:var(--text3);margin-bottom:14px;line-height:1.6;" title="自然语言规则引擎（参考 Inbox-Zero plain English rules 模式 + email-classifier.js 8 类别 + email-drafter.js 完整 prompt）">自然语言规则引擎 — 用自然语言描述规则，自动解析为条件+动作，匹配邮件后自动执行（参考 Inbox-Zero plain English rules + prototype-email-rules.html 完整原型）。</p>',
      '  <div style="display:flex;gap:6px;margin-bottom:18px;border-bottom:1px solid var(--border);padding-bottom:8px;">',
      self.renderRulesSubTab('config', '✏️ 规则配置 + 规则列表', '自然语言输入 + 解析预览 + 安全控制 + 已保存规则（同页签合并）'),
      self.renderRulesSubTab('template', '✉️ 自动回复模板', 'reply_template 编辑 + 确认卡片 + 执行链路'),
      self.renderRulesSubTab('logs', '📊 执行日志', '规则执行历史（log-entry 卡片，含结果标签）'),
      '  </div>',
      '  <div data-role="rules-sub-content">',
      sub === 'config' ? this.renderRulesSubConfig() :
      sub === 'list' ? this.renderRulesSubList() :
      sub === 'template' ? this.renderRulesSubTemplate() :
      sub === 'logs' ? this.renderRulesSubLogs() :
      this.renderRulesSubConfig(),
      '  </div>',
      '</div>',
    ].join('');
  };

  // 子页面：规则配置 — 简版（完整版在后面会用更好的实现替换）
  EmailApp.prototype.renderRulesSubConfig = function () {
    var self = this;
    return [
      '<section style="margin-bottom:18px;">',
      '  <h3 style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:10px;">✍️ 自然语言规则输入</h3>',
      '  <textarea id="rule-desc" style="width:100%;min-height:72px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text);font-size:13px;line-height:1.6;resize:vertical;font-family:inherit;outline:none;" title="用自然语言描述规则（参考 email-rule-parser.js + ALLOWED_ACTIONS 白名单）">营销订阅的邮件自动归档到已处理，不要回复。客户咨询生成草稿（简洁商务语气），放入草稿箱。</textarea>',
      '  <div style="margin-top:8px;display:flex;gap:8px;">',
      '    <button data-action="rule-parse" style="padding:6px 14px;border-radius:6px;background:var(--accent1);color:#fff;font-size:12px;font-weight:600;border:none;cursor:pointer;" title="解析自然语言规则（不静默保存，防 P163 silent write）">🔍 解析</button>',
      '    <button data-action="rule-save" style="padding:6px 14px;border-radius:6px;background:var(--green);color:#fff;font-size:12px;font-weight:600;border:none;cursor:pointer;" title="显式确认保存规则（防 P163 silent write）">✅ 确认并保存规则</button>',
      '  </div>',
      '  <div style="margin-top:10px;padding:10px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;" id="rule-template-selector">',
      '    <div style="font-size:11px;color:var(--text2);font-weight:600;margin-bottom:6px;">📝 选择回复模板（可选）：</div>',
      '    <select id="rule-template-dropdown" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;" title="从已有模板中选择，或留空手动输入回复内容">',
      '      <option value="">— 手动输入回复内容 —</option>',
      '    </select>',
      '    <div style="font-size:10px;color:var(--text3);margin-top:4px;">前往「✉️ 自动回复模板」页签管理模板</div>',
      '  </div>',
      '  <div id="rule-parse-preview" style="margin-top:10px;padding:10px;background:var(--bg);border:1px dashed var(--border);border-radius:8px;font-size:12px;color:var(--text2);line-height:1.5;" title="解析预览：AI 解析后的规则结构（不保存，仅预览）">点击【🔍 解析】后显示解析结果</div>',
      '</section>',
      '<section style="padding:14px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;" title="参考 prototype-email-rules.html 安全控制设计 + agent-buddy-action.js line 120 requires_confirmation">',
      '  <h3 style="font-size:13px;font-weight:700;color:var(--yellow);margin-bottom:10px;">⚠️ 自动回复安全控制</h3>',
      '  <div style="font-size:12px;color:var(--text2);line-height:1.6;">auto_reply 必须用户确认（参考 agent-buddy-action.js line 120：email_send 能力必须 requires_confirmation + P151 异步卡片确认模式）。草稿生成后显示确认卡片，用户点击确认后才执行发送（防 P163 silent write）。</div>',
      '  <div style="margin-top:8px;"><button disabled style="padding:5px 12px;border-radius:6px;background:var(--bg3);color:var(--text3);font-size:11px;border:1px solid var(--border);cursor:not-allowed;" title="自动回复默认关闭（安全默认）">🔒 自动回复：已关闭（安全默认）</button></div>',
      '</section>',
      '<section style="margin-top:16px;padding:12px 14px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;display:flex;align-items:center;gap:12px;font-size:12px;color:var(--text2);" title="规则引擎运行状态（绿色脉冲点 = 引擎在线）">',
      '  <span style="width:8px;height:8px;border-radius:50%;background:var(--green);"></span>',
      '  <span>规则引擎就绪</span>',
      '  <span style="margin-left:auto;color:var(--text3);">mailbox: ' + self.escapeHtml(self.state.mailbox || 'INBOX') + '</span>',
      '</section>',
      // v0.38: 已保存的规则列表（合并到配置页面 — 多多反馈「规则列表和规则应该放到同一个页签里面」）
      '  <section style="margin-top:16px;padding:14px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;">',
      '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">',
      '      <h3 style="font-size:13px;font-weight:700;color:var(--text);">📋 已保存的规则（与配置合并 — 同一页签）</h3>',
      '      <button data-action="refresh-rule-list" style="padding:5px 12px;border-radius:6px;background:var(--accent1);color:#fff;font-size:11px;font-weight:600;border:none;cursor:pointer;" title="刷新规则列表（参考 email_rules DB）">🔄 刷新</button>',
      '    </div>',
      '    <div class="rules-list-container-inline" data-role="rules-list" data-role-alt="rules-list-inline" style="font-size:11px;color:var(--text2);">',
      '      <div style="font-size:11px;color:var(--text3);text-align:center;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;">点击【🔄 刷新】加载已保存的规则（保存新规则后会自动刷新）</div>',
      '    </div>',
      '  </section>',
    ].join('');
  };

  // 子页面：规则列表 — 卡片式（保留旧方法以兼容 loadRuleList 调用）
  EmailApp.prototype.renderRulesSubList = function () {
    return [
      '<section style="padding:14px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">',
      '    <h3 style="font-size:13px;font-weight:700;color:var(--text);">📋 规则列表（rule-card 卡片视图）</h3>',
      '    <button onclick="var a=window.ACMSWin&&window.ACMSWin.getView&&window.ACMSWin.getView(\'email-inbox\');if(a&&a.loadRuleList)a.loadRuleList();else alert(\'加载规则列表\')" style="padding:5px 12px;border-radius:6px;background:var(--accent1);color:#fff;font-size:11px;font-weight:600;border:none;cursor:pointer;" title="加载规则列表（参考 email_rules DB）">🔄 加载</button>',
      '  </div>',
      '  <div class="rules-list-container" data-role="rules-list" style="font-size:12px;color:var(--text2);" title="已保存的规则列表（参考 prototype-email-rules.html 左栏 rule-card 设计）">',
      '    <div style="font-size:11px;color:var(--text3);padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;text-align:center;">点击【加载】查看所有已保存的规则</div>',
      '  </div>',
      '</section>',
    ].join('');
  };

EmailApp.prototype.renderSettingsCategory = function (category) {
    var self = this;
    switch (category) {
      case 'rules': return this.renderCategoryRules();
      case 'account': return this.renderCategoryAccount();
      case 'ai': return this.renderCategoryAI();
      case 'notify': return this.renderCategoryNotify();
      case 'display': return this.renderCategoryDisplay();
      case 'advanced': return this.renderCategoryAdvanced();
      default: return this.renderCategoryRules();
    }
  };

EmailApp.prototype.showRulesPanel = function () {
    var self = this;
    var pane = this.root.querySelector('[data-role="pane"]');
    if (!pane) return;
    // 在右栏显示规则引擎内容（替代邮件详情，或作为详情下方的区域）
    // 参考原型：规则内容区域包含自然语言输入 + 解析预览 + 模板设置 + 执行日志
    pane.innerHTML = [
      '<div class="rule-panel" style="padding:16px;background:var(--bg);border-top:1px solid var(--border);overflow-y:auto;height:100%;">',
      '  <div style="font-size:10px;color:var(--accent1);font-weight:700;margin-bottom:8px;letter-spacing:.04em;">📋 自然语言规则引擎（v0.35 完全内嵌模式 — 无浮窗）</div>',
      '  <section style="margin-bottom:16px;">',
      '    <h4 style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px;">✍️ 规则输入</h4>',
      '    <textarea id="em-rule-desc" style="width:100%;min-height:60px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text);font-size:12px;line-height:1.55;resize:vertical;font-family:inherit;outline:none;" placeholder="例如：营销订阅的邮件自动归档到已处理，不要自动回复。客户咨询生成草稿放入草稿箱。">营销订阅的邮件自动归档到已处理，不要自动回复。客户咨询生成草稿放入草稿箱。</textarea>',
      '    <div style="margin-top:6px;display:flex;gap:8px;align-items:center;">',
      '      <button data-action="parse-rule" onclick="var a=window.ACMSWin&&window.ACMSWin.getView&&window.ACMSWin.getView(\'email-inbox\');if(a&&a.parseRuleInput)a.parseRuleInput();else alert(\'解析规则（实际调用 parseRuleInput）\')" style="padding:5px 12px;border-radius:6px;background:var(--accent1);color:#fff;font-size:11px;font-weight:600;border:none;cursor:pointer;">🔍 解析规则</button>',
      '      <button data-action="save-rule" onclick="var a=window.ACMSWin&&window.ACMSWin.getView&&window.ACMSWin.getView(\'email-inbox\');if(a&&a.saveRule)a.saveRule();else alert(\'保存规则（实际调用 saveRule）\')" style="padding:5px 12px;border-radius:6px;background:var(--green);color:#fff;font-size:11px;font-weight:600;border:none;cursor:pointer;margin-left:4px;">💾 保存规则</button>',
      '      <span style="font-size:10px;color:var(--text3);">解析后规则保存到 <code>email_rules</code> 表（显式确认写入，防 P163 silent write；参考 email-rule-engine 测试用 mock 数据隔离）</span>',
      '    </div>',
      '  </section>',
      '  <section style="margin-bottom:16px;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;">',
      '    <h4 style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px;">📊 解析预览（参考 email-classifier.js XML prompt 模式）</h4>',
      '    <div style="font-size:11px;color:var(--text2);line-height:1.5;">条件：类别=<span style="color:var(--accent1);font-weight:600;">营销订阅</span>、<span style="color:var(--accent1);font-weight:600;">客户咨询</span> · 动作：<span style="color:var(--green);font-weight:600;">归档</span>、<span style="color:var(--yellow);font-weight:600;">不自动回复</span>、<span style="color:var(--accent1);font-weight:600;">草稿</span> · 置信度：高</div>',
      '  </section>',
      '  <section>',
      '    <h4 style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px;">✍️ 自动回复模板设置</h4>',
      '    <textarea style="width:100%;min-height:60px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text);font-size:11px;line-height:1.5;resize:vertical;font-family:inherit;outline:none;">感谢您的咨询。团队将在24小时内回复具体方案。</textarea>',
      '    <div style="font-size:10px;color:var(--text3);margin-top:6px;">借鉴 inbox-zero draft-reply 完整 system prompt（不加签名、无占位符、长度自约束）→ 执行时传入 <code>email-drafter.draftReply()</code></div>',
      '  </section>',
  '  <section style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);">',
  '    <h4 style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px;">📋 执行日志（参考 P177 事件广播链路 — 实际加载数据）</h4>',
  '    <div class="rule-logs-container" style="font-size:11px;color:var(--text2);line-height:1.4;padding:8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;min-height:40px;">',
  '      <div style="font-size:10px;color:var(--text3);">规则执行结果将写入 <code>email_rule_logs</code>（邮箱维度隔离），并通过 WS 推送到前端。</div>',
  '      <button onclick="var a=window.ACMSWin&&window.ACMSWin.getView&&window.ACMSWin.getView(\'email-inbox\');if(a&&a.loadRuleLogs)a.loadRuleLogs();else alert(\'加载执行日志（实际调用 loadRuleLogs，参考 P177 链路）\')" style="margin-top:6px;padding:4px 10px;border-radius:4px;background:var(--accent1);color:#fff;font-size:10px;font-weight:600;border:none;cursor:pointer;">🔄 加载执行日志</button>',
  '    </div>',
  '  </section>',
      '</div>',
    ].join('');
    self.setStatus('规则引擎已内嵌（无浮窗）— 参考原型完整版');
  };
  root.openEmailInbox = function () {
    if (!root.ACMSWin) return;
    if (typeof root.ACMSWin.isActive === 'function' && !root.ACMSWin.isActive()) root.ACMSWin.enable();
    root.ACMSWin.open('email-inbox', { w: 960, h: 640, title: '📬 邮件' });
  };


  // v0.37: 渲染分类筛选 chip（在邮件列表头部下方）
  
  // v0.38: 加载用户维护的分类列表（按 mailbox 隔离）
  EmailApp.prototype.loadCategories = function () {
    var self = this;
    var container = this.root.querySelector('[data-role="categories-list"]');
    if (!container) return;
    var mailbox = this.state.mailbox || 'INBOX';
    container.innerHTML = '<div style="font-size:11px;color:var(--text3);text-align:center;padding:12px;">加载分类中...</div>';
    apiFetch('GET', buildUrl('/api/email-categories', { mailbox: mailbox }))
      .then(function (data) {
        if (!data || !data.categories || data.categories.length === 0) {
          container.innerHTML = '<div style="font-size:11px;color:var(--text3);text-align:center;padding:16px;background:var(--bg);border:1px solid var(--border);border-radius:8px;">当前邮箱（' + self.escapeHtml(mailbox) + '）暂无分类。<br><span style="color:var(--text3);">点击【🌱 初始化默认】使用 8 类别，或【+ 新增分类】自定义。</span></div>';
          return;
        }
        var html = '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
        html += '<thead><tr style="border-bottom:1px solid var(--border);color:var(--text);font-weight:700;"><th style="text-align:left;padding:6px 4px;">分类名</th><th style="text-align:left;padding:6px 4px;">描述</th><th style="text-align:left;padding:6px 4px;">优先级</th><th style="text-align:left;padding:6px 4px;">操作</th></tr></thead><tbody>';
        for (var i = 0; i < data.categories.length; i++) {
          var c = data.categories[i];
          html += '<tr style="border-bottom:1px dashed var(--border);">';
          html += '<td style="padding:8px 4px;color:var(--text);font-weight:600;">' + self.escapeHtml(c.name) + '</td>';
          html += '<td style="padding:8px 4px;color:var(--text2);">' + self.escapeHtml((c.description || '').slice(0, 40)) + '</td>';
          html += '<td style="padding:8px 4px;color:var(--accent1);font-family:monospace;">' + (c.priority || 0) + '</td>';
          html += '<td style="padding:8px 4px;"><button data-action="edit-category" data-cat-id="' + self.escapeHtml(c.id) + '" style="margin-right:4px;padding:3px 8px;border-radius:4px;background:var(--accent1);color:#fff;font-size:10px;font-weight:600;border:none;cursor:pointer;">✎ 编辑</button><button data-action="delete-category" data-cat-id="' + self.escapeHtml(c.id) + '" style="padding:3px 8px;border-radius:4px;background:var(--red);color:#fff;font-size:10px;font-weight:600;border:none;cursor:pointer;">🗑 删除</button></td>';
          html += '</tr>';
        }
        html += '</tbody></table>';
        container.innerHTML = html;
      })
      .catch(function (err) {
        container.innerHTML = '<div style="font-size:11px;color:var(--red);padding:8px;">加载失败：' + self.escapeHtml(err.message || String(err)) + '</div>';
      });
  };

  // v0.38: 初始化默认 8 分类
  EmailApp.prototype.seedCategories = function () {
    var self = this;
    showConfirm('初始化默认 8 分类？\n\n如果已有分类则跳过（不会覆盖）。', { okText: '初始化', cancelText: '取消' })
      .then(function (ok) {
        if (!ok) return;
        return apiFetch('POST', '/api/email-categories/seed', { mailbox: self.state.mailbox || 'INBOX' });
      })
      .then(function (result) {
        if (result && result.ok) {
          showToast(result.skipped ? '已存在分类，跳过种子' : ('已初始化 ' + result.count + ' 个默认分类'), 'success');
          self.loadCategories();
        }
      })
      .catch(function (err) {
        showToast('初始化失败：' + (err.message || String(err)), 'error');
      });
  };

  // v0.38: 新增分类（弹窗输入）
  EmailApp.prototype.addCategory = function () {
    var self = this;
    showPrompt('新增分类\n\n输入分类名称（例如：紧急事务）', '')
      .then(function (name) {
        if (!name || !String(name).trim()) return;
        return showPrompt('分类描述（帮助 AI 理解这个分类 — 参考原型描述）', '');
      })
      .then(function (description) {
        if (description === undefined) return; // 用户取消了第二次 prompt
        return apiFetch('POST', '/api/email-categories', {
          mailbox: self.state.mailbox || 'INBOX',
          name: arguments[0] || (arguments.callee && arguments.callee.caller && arguments.callee.caller.arguments && arguments.callee.caller.arguments[0]) || '',
          description: description,
          priority: 5,
        });
      })
      .catch(function (err) {
        showToast('新增失败：' + (err.message || String(err)), 'error');
      });
  };

  // v0.38: 编辑分类
  EmailApp.prototype.editCategory = function (catId) {
    var self = this;
    if (!catId) return;
    showPrompt('编辑分类名称', '')
      .then(function (newName) {
        if (!newName) return;
        return apiFetch('PATCH', '/api/email-categories/' + encodeURIComponent(catId), { name: newName });
      })
      .then(function (result) {
        if (result && result.ok) {
          showToast('已更新', 'success');
          self.loadCategories();
        }
      })
      .catch(function (err) {
        showToast('编辑失败：' + (err.message || String(err)), 'error');
      });
  };

  // v0.38: 删除分类（显式确认 — 防 silent write）
  EmailApp.prototype.deleteCategory = function (catId) {
    var self = this;
    if (!catId) return;
    showConfirm('删除分类？\n\nID: ' + catId + '\n\n此操作不可恢复（防 P163 silent write — 需显式确认）。', { okText: '删除', cancelText: '取消' })
      .then(function (ok) {
        if (!ok) return;
        return apiFetch('DELETE', '/api/email-categories/' + encodeURIComponent(catId));
      })
      .then(function (result) {
        if (result && result.ok) {
          showToast('已删除', 'success');
          self.loadCategories();
        }
      })
      .catch(function (err) {
        showToast('删除失败：' + (err.message || String(err)), 'error');
      });
  };

EmailApp.prototype.renderCategoryFilterChips = function () {
    var self = this;
    var currentFilter = this.state.categoryFilter || '';
    var cats = (this.state.availableCategories || []);
    var chips = '<button data-action="filter-by-category" data-category="" style="padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;border:1px solid ' + (currentFilter === '' ? 'var(--accent1)' : 'var(--border)') + ';background:' + (currentFilter === '' ? 'var(--accent2)' : 'var(--bg2)') + ';color:' + (currentFilter === '' ? 'var(--accent1)' : 'var(--text2)') + ';cursor:pointer;" title="显示所有邮件（不筛选）">全部</button>';
    for (var i = 0; i < cats.length; i++) {
      var cat = cats[i];
      var isActive = currentFilter === cat;
      chips += '<button data-action="filter-by-category" data-category="' + self.escapeHtml(cat) + '" style="padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;border:1px solid ' + (isActive ? 'var(--accent1)' : 'var(--border)') + ';background:' + (isActive ? 'var(--accent2)' : 'var(--bg2)') + ';color:' + (isActive ? 'var(--accent1)' : 'var(--text2)') + ';cursor:pointer;" title="按此 AI 分类筛选邮件（参考 email-classifier.js + email_sender_categories）">' + self.escapeHtml(cat) + '</button>';
    }
    return chips;
  };

  // v0.37: 按 AI 分类筛选邮件（点击分类 chip 时触发）
  EmailApp.prototype.filterByCategory = function (category) {
    var self = this;
    this.state.categoryFilter = category || '';
    var chipsContainer = this.root.querySelector('[data-role="category-filter"]');
    if (chipsContainer) {
      var tmp = document.createElement('div');
      tmp.innerHTML = '<span style="font-size:10px;color:var(--text3);font-weight:700;letter-spacing:.04em;margin-right:4px;">🗂 按分类筛选</span>' + this.renderCategoryFilterChips();
      chipsContainer.innerHTML = tmp.innerHTML;
    }
    this.renderList();
    var msg = category ? ('已筛选 AI 分类：' + category) : '已清除分类筛选（显示全部）';
    this.setStatus(msg);
    showToast(msg, 'info');
  };

  // v0.37: 切换规则引擎子页签（配置/列表/模板/日志）
  EmailApp.prototype.showRulesSubTab = function (sub) {
    var self = this;
    if (!sub) return;
    this.state.rulesSubTab = sub;
    var tabs = this.root.querySelectorAll('[data-action="rules-sub-tab"]');
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      var key = t.getAttribute('data-sub');
      var isActive = key === sub;
      // v0.38 修复：选中用深色背景 + 亮色字（最高对比度，避免白字模糊）
      t.style.background = isActive ? 'var(--text)' : 'var(--bg3)';
      t.style.color = isActive ? 'var(--bg)' : 'var(--text2)';
      t.style.borderColor = isActive ? 'var(--text)' : 'var(--border)';
    }
    var subContent = this.root.querySelector('[data-role="rules-sub-content"]');
    if (subContent) {
      if (sub === 'config') subContent.innerHTML = this.renderRulesSubConfig();
      else if (sub === 'list') subContent.innerHTML = this.renderRulesSubList();
      else if (sub === 'template') subContent.innerHTML = this.renderRulesSubTemplate();
      else if (sub === 'logs') subContent.innerHTML = this.renderRulesSubLogs();
      if (sub === 'list') setTimeout(function () { self.loadRuleList(); }, 200);
      if (sub === 'logs') setTimeout(function () { self.loadRuleLogs(); }, 200);
    }
    this.setStatus('规则引擎子页签：' + sub);
  };

  // v0.37: 删除规则（显式确认 — 防 P163 silent write）
  EmailApp.prototype.deleteRule = function (ruleId) {
    var self = this;
    if (!ruleId) return;
    showConfirm('确认删除规则？\nID: ' + ruleId + '\n\n此操作不可恢复（防 P163 silent write — 必须显式确认）。', { okText: '删除', cancelText: '取消' })
      .then(function (ok) {
        if (!ok) return;
        return apiFetch('DELETE', '/api/email-rules/' + encodeURIComponent(ruleId));
      })
      .then(function (result) {
        if (result && result.ok) {
          showToast('规则已删除（ID=' + ruleId + '）', 'success');
          self.loadRuleList();
        }
      })
      .catch(function (err) {
        showToast('删除失败：' + (err.message || String(err)), 'error');
      });
  };


  // v0.38: 启动 IMAP IDLE 实时监听（集成 mail-listener — 推荐1，前端控制）
  EmailApp.prototype.startListening = function () {
    var self = this;
    var mailbox = this.state.mailbox || 'INBOX';
    showConfirm('启动实时监听（IMAP IDLE）？\n\n监听 mailbox：' + mailbox + '\n\n启动后，新邮件到达时会自动触发规则引擎匹配 + 写入执行日志（参考 P177 事件广播链路）。', { okText: '启动监听', cancelText: '取消' })
      .then(function (ok) {
        if (!ok) return;
        return apiFetch('POST', '/api/emails/listen/start', { mailbox: mailbox });
      })
      .then(function (result) {
        if (result && result.ok) {
          showToast('✅ 实时监听已启动（' + mailbox + '）— 新邮件到达时会自动触发规则引擎', 'success');
          self.setStatus('IMAP 实时监听运行中（' + mailbox + '）');
          self.refreshListeningStatus();
        } else {
          showToast('启动监听失败：' + (result && result.message || '未知错误'), 'error');
        }
      })
      .catch(function (err) {
        showToast('启动监听失败：' + (err.message || String(err)), 'error');
      });
  };

  // v0.38: 停止 IMAP IDLE 实时监听
  EmailApp.prototype.stopListening = function () {
    var self = this;
    var mailbox = this.state.mailbox || 'INBOX';
    showConfirm('停止实时监听？\n\nmailbox：' + mailbox + '\n\n停止后，新邮件将不再自动触发规则引擎（需要手动触发或轮询）。', { okText: '停止', cancelText: '取消' })
      .then(function (ok) {
        if (!ok) return;
        return apiFetch('POST', '/api/emails/listen/stop', { mailbox: mailbox });
      })
      .then(function (result) {
        if (result && result.ok) {
          showToast('⏹ 监听已停止（' + mailbox + '）', 'info');
          self.setStatus('IMAP 实时监听已停止');
          self.refreshListeningStatus();
        } else {
          showToast('停止监听失败：' + (result && result.message || '未知错误'), 'error');
        }
      })
      .catch(function (err) {
        showToast('停止监听失败：' + (err.message || String(err)), 'error');
      });
  };

  // v0.38: 刷新监听状态（从后端拉取当前正在监听的 mailbox 列表）
  EmailApp.prototype.refreshListeningStatus = function () {
    var self = this;
    apiFetch('GET', '/api/emails/listen/list')
      .then(function (result) {
        if (result && result.ok && result.listening) {
          var container = self.root.querySelector('[data-role="listening-status"]');
          if (container) {
            if (result.listening.length === 0) {
              container.innerHTML = '<div style="font-size:11px;color:var(--text3);">⏸ 未在监听（启动后新邮件将自动触发规则引擎）</div>';
            } else {
              var html = '<div style="font-size:11px;color:var(--green);font-weight:600;margin-bottom:4px;">🟢 正在监听：</div>';
              for (var i = 0; i < result.listening.length; i++) {
                html += '<div style="font-size:11px;color:var(--text2);padding:2px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;">';
                html += '<span>' + self.escapeHtml(result.listening[i]) + '</span>';
                html += '<span style="font-size:9px;color:var(--green);">● 运行中</span>';
                html += '</div>';
              }
              container.innerHTML = html;
            }
          }
        }
      })
      .catch(function (err) {
        console.warn('[refresh-listening] 拉取监听状态失败:', err.message);
      });
  };

  root.EM = { open: openEmailInbox, mount: mount };
})(typeof window !== 'undefined' ? window : globalThis);
