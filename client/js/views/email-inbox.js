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
    this.root.innerHTML = [
      '<div class="em-app" data-state="idle">',
'  <aside class="em-side" aria-label="邮箱文件夹">',
      '    <div class="em-side-head"><span>📬</span><b>邮件</b></div>',
      '    <ul class="em-folders" data-role="folders"></ul>',
      '  </aside>',
      '  <section class="em-list" aria-label="邮件列表">',
      '    <div class="em-list-head">',
      '      <input type="search" class="em-input" data-role="search" placeholder="搜索主题、邮件地址、正文…" />',
      '      <button type="button" class="em-btn" data-action="refresh" title="刷新">↻</button>',
      // v0.74.1: 写信按钮移到邮件列表栏顶部（紧邻搜索框）— 之前在左侧底部，被邮件列表挡住一半
      '      <button type="button" class="em-btn em-btn-primary em-btn-compose" data-action="compose" title="写新邮件">✉ 写信</button>',
      // v0.30: AI 批量分析所有发件人（借鉴 inbox-zero ai-categorize-senders.ts 批量模式）
      '      <button type="button" class="em-btn em-btn-ai" data-action="email-ai-bulk-analyze" title="拉 INBOX 最近 50 封 → 频次聚合 → static 规则 + LLM 批量分析 top 20 sender">🔍 AI 批量分析</button>',
      '    </div>',
      '    <div class="em-list-body" data-role="list"></div>',
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
        // v0.30: AI 智能分类（借鉴 inbox-zero@main）
        if (action === 'email-ai-classify') return self.aiClassifyEmail(target.getAttribute('data-uid'));
        // v0.30: AI 建议回复（借鉴 inbox-zero@main draft-reply）
        if (action === 'email-ai-draft-reply') return self.aiDraftReply(target.getAttribute('data-uid'));
        // v0.30: AI 批量分析所有发件人
        if (action === 'email-ai-bulk-analyze') return self.aiBulkAnalyze();
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
    if (!this.state.emails.length) {
      body.innerHTML = '<div class="em-empty">📭 当前邮箱没有邮件</div>';
    } else {
      body.innerHTML = this.state.emails.map(this.renderListItem, this).join('');
    }
    this.renderPager();
    // v0.74.2: 渲染后检查"还有更多"，给 .em-list 父容器加 has-more class
    // 触发底部渐变阴影 + 滑到位后再算（onScroll 也算）
    var self = this;
    requestAnimationFrame(function () { self.updateListMoreHint(); });
    body.onscroll = function () { self.updateListMoreHint(); };
  };

  EmailApp.prototype.renderListItem = function (email) {
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
      '    <div class="em-subject">' + escHtml(subject) + '</div>',
      '  </div>',
      email.hasAttachments ? '  <span class="em-att-mark" title="含附件">📎</span>' : '',
      '  <div class="em-item-actions" data-role="item-actions">',
      '    <button type="button" class="em-item-action em-act-classify" data-action="email-ai-classify" data-uid="' + escAttr(email.uid) + '" title="AI 智能分类">📂</button>',
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
  EmailApp.prototype.aiDraftReply = function (uid) {
    var self = this;
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
    self.setStatus('AI 草拟回复中…', 'loading');
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
      '  <div style="display:flex;gap:8px">',
      '    <button type="button" class="em-btn em-btn-tiny em-draft-close">关闭</button>',
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
  };

  // v0.30: AI 智能分类（借鉴 inbox-zero@main ai-categorize-single-sender.ts + 防止 toast 骗人）
  EmailApp.prototype.aiClassifyEmail = function (uid) {
    var self = this;
    uid = parseInt(uid, 10);
    if (!uid) { self.setStatus('分类失败：无效邮件编号'); return; }
    // 从列表状态找邮件元数据（避免额外 fetch /api/emails/:uid — 列表已含 from + subject + snippet）
    var email = (this.state.emails || []).find(function (e) { return e.uid === uid; });
    if (!email && this.state.detail && this.state.detail.uid === uid) email = this.state.detail;
    if (!email) { self.setStatus('分类失败：找不到邮件数据，请先点开邮件'); return; }
    var payload = {
      from: email.from || '',
      subject: email.subject || '',
      snippet: (email.snippet || email.text || '').toString().slice(0, 500),
    };
    self.setStatus('AI 分类中…', 'loading');
    apiFetch('POST', '/api/emails/classify', payload).then(function (data) {
      self.setStatus('');
      self.showClassifyResult(uid, data);
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
      '  <div class="em-detail-title">',
      '    <h2>' + escHtml(subject) + '</h2>',
      '    <div class="em-detail-actions">',
      '      <button type="button" class="em-btn" data-action="back-to-list">← 返回</button>',
      '      <button type="button" class="em-btn" data-action="reply">↩ 回复</button>',
      '      <button type="button" class="em-btn" data-action="reply-all">↩ 全部回复</button>',
      '      <button type="button" class="em-btn" data-action="forward">↪ 转发</button>',
      '      <button type="button" class="em-btn em-btn-ai" data-action="email-ai-classify" data-uid="' + escAttr(email.uid) + '" title="AI 智能分类（借鉴 inbox-zero）">📂 AI 分类</button>',
      '      <button type="button" class="em-btn em-btn-ai" data-action="email-ai-draft-reply" data-uid="' + escAttr(email.uid) + '" title="AI 草拟回复（借鉴 inbox-zero draft-reply prompt）">✍️ AI 建议回复</button>',
      '    </div>',
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

  root.openEmailInbox = function () {
    if (!root.ACMSWin) return;
    if (typeof root.ACMSWin.isActive === 'function' && !root.ACMSWin.isActive()) root.ACMSWin.enable();
    root.ACMSWin.open('email-inbox', { w: 960, h: 640, title: '📬 邮件' });
  };

  root.EM = { open: openEmailInbox, mount: mount };
})(typeof window !== 'undefined' ? window : globalThis);
