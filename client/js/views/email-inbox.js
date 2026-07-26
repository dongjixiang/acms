// ACMS 邮件收件箱 + 发送（v0.73）
// 通过 IMAP 读取收件箱，在 ACMS 窗口内展示，支持写信发送
(function(root) {
  'use strict';

  var AK = '';
  try { AK = (window.ACMSConfig && window.ACMSConfig.apiKey) || 'dev-key-001'; } catch(e) {}
  function auth() { return { 'X-API-Key': AK }; }

  // ── 渲染 ──
  function render(w) {
    if (w.dead) return;
    w.$c.innerHTML =
      '<div style="display:flex;flex-direction:column;height:100%;font-size:13px">'
      + '<div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid var(--border,#ddd);flex-shrink:0;background:var(--bg2,#f5f5f7)">'
        + '<span style="font-size:16px">📬</span>'
        + '<b>收件箱</b>'
        + '<input id="em-search" type="text" placeholder="搜索邮件…" style="flex:1;min-width:0;padding:4px 8px;border:1px solid var(--border,#ddd);border-radius:4px;font-size:12px;outline:none" onkeydown="if(event.key===\'Enter\')window.EM_search(this.value)">'
        + '<button class="em-btn" onclick="window.EM_refresh()" title="刷新" style="padding:4px 10px;border:1px solid var(--border,#ddd);border-radius:4px;cursor:pointer;background:var(--bg,#fff)">↻</button>'
        + '<button class="em-btn" onclick="window.EM_compose()" title="写信" style="padding:4px 10px;border:1px solid var(--accent,#0ea89d);border-radius:4px;cursor:pointer;background:var(--accent,#0ea89d);color:#fff;font-size:12px">✉ 写信</button>'
      + '</div>'
      + '<div id="em-list" style="flex:1;overflow-y:auto;background:var(--bg,#fff)"></div>'
      + '<div id="em-detail" style="display:none;flex:1;overflow-y:auto;background:var(--bg,#fff);padding:16px"></div>'
      + '<div id="em-status" style="padding:3px 10px;font-size:10px;color:var(--text2,#888);border-top:1px solid var(--border,#ddd);flex-shrink:0">就绪</div>'
      + '</div>';
    refreshList();
  }

  function setStatus(msg) {
    var el = document.getElementById('em-status');
    if (el) el.textContent = msg;
  }

  // ── 刷新邮件列表 ──
  function refreshList() {
    setStatus('加载中…');
    var list = document.getElementById('em-list');
    var detail = document.getElementById('em-detail');
    if (detail) detail.style.display = 'none';
    if (list) list.style.display = 'block';
    fetch('/api/emails?limit=30', { headers: auth() })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!list) return;
        if (data.error) {
          list.innerHTML = '<div style="padding:30px;text-align:center;color:#a00">❌ ' + escHtml(data.error || data.message || '未知错误') + '</div>';
          setStatus('加载失败');
          // 如果是连接错误，显示配置提示
          if (data.error === 'IMAP_CONNECT_FAILED') {
            list.innerHTML += '<div style="padding:10px 30px;text-align:center;font-size:12px;color:#666">请确认 config.json 中 smtp 配置了正确的邮箱和密码</div>';
          }
          return;
        }
        if (!data.emails || data.emails.length === 0) {
          list.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text2,#888)">📭 收件箱为空</div>';
          setStatus('0 封邮件');
          return;
        }
        var html = data.emails.map(function(e) {
          var dateStr = '';
          try {
            var d = new Date(e.date);
            dateStr = isNaN(d.getTime()) ? e.date : d.toLocaleDateString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
          } catch(e) { dateStr = e.date || ''; }
          var fromName = e.from ? e.from.replace(/<[^>]+>/g, '').trim() || e.from : '(未知)';
          return '<div class="em-item" data-uid="' + e.uid + '" onclick="window.EM_open(' + e.uid + ')" style="padding:8px 12px;border-bottom:1px solid var(--border,#eee);cursor:pointer;display:flex;gap:8px;align-items:flex-start">'
            + '<div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:var(--accent,#0ea89d);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold">' + escHtml((fromName.charAt(0) || '?').toUpperCase()) + '</div>'
            + '<div style="flex:1;min-width:0">'
              + '<div style="display:flex;justify-content:space-between;align-items:center">'
                + '<b style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px">' + escHtml(fromName) + '</b>'
                + '<span style="font-size:10px;color:var(--text3,#aaa);flex-shrink:0">' + escHtml(dateStr) + '</span>'
              + '</div>'
              + '<div style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2,#666);margin-top:2px">' + escHtml(e.subject || '(无主题)') + '</div>'
            + '</div>'
            + (e.hasAttachments ? '<span style="font-size:10px;color:var(--text3,#aaa);flex-shrink:0">📎</span>' : '')
            + '</div>';
        }).join('');
        list.innerHTML = html;
        setStatus(data.total + ' 封邮件，显示 ' + data.emails.length + ' 封');
      })
      .catch(function(e) {
        if (list) list.innerHTML = '<div style="padding:30px;text-align:center;color:#a00">❌ 网络错误</div>';
        setStatus('加载失败');
      });
  }

  // ── 打开邮件 ──
  function openEmail(uid) {
    setStatus('加载邮件…');
    var list = document.getElementById('em-list');
    var detail = document.getElementById('em-detail');
    if (list) list.style.display = 'none';
    if (detail) {
      detail.style.display = 'block';
      detail.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text2,#888)">⏳ 加载中…</div>';
    }
    fetch('/api/emails/' + uid, { headers: auth() })
      .then(function(r) { return r.json(); })
      .then(function(email) {
        if (!detail) return;
        if (email.error) {
          detail.innerHTML = '<div style="padding:20px;text-align:center;color:#a00">❌ ' + escHtml(email.error) + '</div>';
          setStatus('加载失败');
          return;
        }
        var dateStr = '';
        try { var d = new Date(email.date); dateStr = isNaN(d.getTime()) ? email.date : d.toLocaleString('zh-CN'); } catch(e) { dateStr = email.date || ''; }
        var html = '<div style="margin-bottom:16px">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">'
            + '<h2 style="margin:0;font-size:15px;line-height:1.4;word-break:break-word">' + escHtml(email.subject || '(无主题)') + '</h2>'
            + '<button onclick="window.EM_back()" style="padding:4px 10px;border:1px solid var(--border,#ddd);border-radius:4px;cursor:pointer;background:var(--bg,#fff);font-size:12px;flex-shrink:0">← 返回</button>'
          + '</div>'
          + '<table style="font-size:12px;color:var(--text2,#666);width:100%">'
            + '<tr><td style="padding:2px 8px 2px 0;white-space:nowrap;color:var(--text3,#999)">发件人</td><td style="word-break:break-all">' + escHtml(email.from || '') + '</td></tr>'
            + '<tr><td style="padding:2px 8px 2px 0;white-space:nowrap;color:var(--text3,#999)">收件人</td><td style="word-break:break-all">' + escHtml(email.to || '') + '</td></tr>'
            + (email.cc ? '<tr><td style="padding:2px 8px 2px 0;white-space:nowrap;color:var(--text3,#999)">抄送</td><td>' + escHtml(email.cc) + '</td></tr>' : '')
            + '<tr><td style="padding:2px 8px 2px 0;white-space:nowrap;color:var(--text3,#999)">时间</td><td>' + escHtml(dateStr) + '</td></tr>'
          + '</table>'
        + '</div>'
        + '<div style="border-top:1px solid var(--border,#eee);padding-top:12px;font-size:13px;line-height:1.6;word-break:break-word;white-space:pre-wrap;color:var(--text,#333)">'
          + (email.html ? email.html : escHtml(email.text || '(无正文)'))
        + '</div>';
        // 附件
        if (email.attachments && email.attachments.length > 0) {
          html += '<div style="border-top:1px solid var(--border,#eee);padding-top:12px;margin-top:12px">'
            + '<div style="font-size:12px;font-weight:bold;margin-bottom:6px">📎 附件 (' + email.attachments.length + ')</div>'
            + email.attachments.map(function(a) {
                var sizeStr = a.size > 1024*1024 ? (a.size/1024/1024).toFixed(1)+'MB' : (a.size/1024).toFixed(0)+'KB';
                return '<div style="padding:6px 10px;border:1px solid var(--border,#eee);border-radius:4px;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;font-size:12px">'
                  + '<span>' + escHtml(a.name) + ' (' + sizeStr + ')</span>'
                  + '<a href="/api/emails/' + uid + '/attachment/' + encodeURIComponent(a.partID) + '?mailbox=INBOX&api_key=' + encodeURIComponent(AK) + '" target="_blank" style="padding:2px 8px;border:1px solid var(--accent,#0ea89d);border-radius:4px;text-decoration:none;color:var(--accent,#0ea89d);font-size:11px">下载</a>'
                  + '</div>';
              }).join('')
            + '</div>';
        }
        detail.innerHTML = html;
        setStatus('邮件已加载');
      })
      .catch(function(e) {
        if (detail) detail.innerHTML = '<div style="padding:20px;text-align:center;color:#a00">❌ 加载失败</div>';
        setStatus('加载失败');
      });
  }

  // ── 写信 ──
  function compose() {
    var list = document.getElementById('em-list');
    var detail = document.getElementById('em-detail');
    if (list) list.style.display = 'none';
    if (detail) {
      detail.style.display = 'block';
      detail.innerHTML =
        '<div style="max-width:600px;margin:0 auto">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
          + '<b style="font-size:15px">✉ 写邮件</b>'
          + '<button onclick="window.EM_back()" style="padding:4px 10px;border:1px solid var(--border,#ddd);border-radius:4px;cursor:pointer;background:var(--bg,#fff);font-size:12px">取消</button>'
        + '</div>'
        + '<div style="margin-bottom:8px">'
          + '<label style="display:block;font-size:12px;color:var(--text2,#666);margin-bottom:2px">收件人 *</label>'
          + '<input id="em-to" type="text" placeholder="收件人邮箱" style="width:100%;padding:6px 8px;border:1px solid var(--border,#ddd);border-radius:4px;font-size:13px;outline:none;box-sizing:border-box">'
        + '</div>'
        + '<div style="margin-bottom:8px">'
          + '<label style="display:block;font-size:12px;color:var(--text2,#666);margin-bottom:2px">抄送</label>'
          + '<input id="em-cc" type="text" placeholder="抄送（可选，多个用分号分隔）" style="width:100%;padding:6px 8px;border:1px solid var(--border,#ddd);border-radius:4px;font-size:13px;outline:none;box-sizing:border-box">'
        + '</div>'
        + '<div style="margin-bottom:8px">'
          + '<label style="display:block;font-size:12px;color:var(--text2,#666);margin-bottom:2px">主题 *</label>'
          + '<input id="em-subject" type="text" placeholder="邮件主题" style="width:100%;padding:6px 8px;border:1px solid var(--border,#ddd);border-radius:4px;font-size:13px;outline:none;box-sizing:border-box">'
        + '</div>'
        + '<div style="margin-bottom:8px">'
          + '<label style="display:block;font-size:12px;color:var(--text2,#666);margin-bottom:2px">正文 *</label>'
          + '<textarea id="em-body" placeholder="邮件正文…" style="width:100%;height:180px;padding:6px 8px;border:1px solid var(--border,#ddd);border-radius:4px;font-size:13px;outline:none;resize:vertical;box-sizing:border-box;font-family:inherit;line-height:1.5"></textarea>'
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:8px;margin-top:12px">'
          + '<button id="em-send-btn" onclick="window.EM_send()" style="padding:6px 20px;border:none;border-radius:4px;cursor:pointer;background:var(--accent,#0ea89d);color:#fff;font-size:13px">发送</button>'
          + '<span id="em-send-status" style="font-size:12px;color:var(--text2,#888)"></span>'
        + '</div>'
        + '</div>';
      setStatus('写信');
      // 焦点到收件人
      setTimeout(function() { var el = document.getElementById('em-to'); if (el) el.focus(); }, 50);
    }
  }

  // ── 发送邮件 ──
  function send() {
    var btn = document.getElementById('em-send-btn');
    var status = document.getElementById('em-send-status');
    if (!btn || !status) return;
    var to = document.getElementById('em-to');
    var cc = document.getElementById('em-cc');
    var subject = document.getElementById('em-subject');
    var body = document.getElementById('em-body');
    if (!to || !subject || !body) return;
    // 校验
    if (!to.value.trim()) { status.innerHTML = '<span style="color:#a00">请输入收件人</span>'; to.focus(); return; }
    if (!subject.value.trim()) { status.innerHTML = '<span style="color:#a00">请输入主题</span>'; subject.focus(); return; }
    if (!body.value.trim()) { status.innerHTML = '<span style="color:#a00">请输入正文</span>'; body.focus(); return; }
    btn.disabled = true;
    btn.style.opacity = '0.6';
    status.textContent = '发送中…';
    fetch('/api/emails/send', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        to: to.value.trim(),
        cc: cc.value.trim(),
        subject: subject.value.trim(),
        body: body.value,
        isHtml: false,
      }),
    })
      .then(function(r) { return r.json(); })
      .then(function(result) {
        if (result.error) {
          status.innerHTML = '<span style="color:#a00">❌ ' + escHtml(result.message || result.error) + '</span>';
          btn.disabled = false;
          btn.style.opacity = '1';
        } else {
          status.innerHTML = '<span style="color:#080">✅ 发送成功</span>';
          // 2 秒后回列表
          setTimeout(function() { window.EM_back(); }, 2000);
        }
      })
      .catch(function(e) {
        status.innerHTML = '<span style="color:#a00">❌ 网络错误</span>';
        btn.disabled = false;
        btn.style.opacity = '1';
      });
  }

  // ── 搜索 ──
  function search(keyword) {
    if (!keyword || !keyword.trim()) { refreshList(); return; }
    setStatus('搜索: ' + keyword);
    var list = document.getElementById('em-list');
    var detail = document.getElementById('em-detail');
    if (detail) detail.style.display = 'none';
    if (list) {
      list.style.display = 'block';
      list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text2,#888)">⏳ 搜索中…</div>';
    }
    fetch('/api/emails/search?q=' + encodeURIComponent(keyword.trim()) + '&limit=30', { headers: auth() })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!list) return;
        if (!data.emails || data.emails.length === 0) {
          list.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text2,#888)">📭 没有找到匹配的邮件</div>';
          setStatus('搜索无结果');
          return;
        }
        var html = '<div style="padding:6px 12px;font-size:11px;color:var(--text2,#888);border-bottom:1px solid var(--border,#eee)">搜索 "' + escHtml(keyword) + '" — 找到 ' + data.total + ' 封</div>';
        html += data.emails.map(function(e) {
          var dateStr = '';
          try { var d = new Date(e.date); dateStr = isNaN(d.getTime()) ? e.date : d.toLocaleDateString('zh-CN', { month:'2-digit', day:'2-digit' }); } catch(e) {}
          var fromName = e.from ? e.from.replace(/<[^>]+>/g, '').trim() || e.from : '(未知)';
          return '<div class="em-item" data-uid="' + e.uid + '" onclick="window.EM_open(' + e.uid + ')" style="padding:8px 12px;border-bottom:1px solid var(--border,#eee);cursor:pointer">'
            + '<b style="font-size:12px">' + escHtml(fromName) + '</b>'
            + '<span style="float:right;font-size:10px;color:var(--text3,#aaa)">' + escHtml(dateStr) + '</span>'
            + '<div style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2,#666)">' + escHtml(e.subject || '(无主题)') + '</div>'
            + '</div>';
        }).join('');
        list.innerHTML = html;
        setStatus(data.total + ' 封匹配');
      })
      .catch(function() { setStatus('搜索失败'); });
  }

  function back() {
    var list = document.getElementById('em-list');
    var detail = document.getElementById('em-detail');
    if (detail) detail.style.display = 'none';
    if (list) list.style.display = 'block';
    setStatus('就绪');
  }

  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── 全局 ──
  window.EM_refresh = refreshList;
  window.EM_open = openEmail;
  window.EM_back = back;
  window.EM_search = search;
  window.EM_compose = compose;
  window.EM_send = send;

  // ── 注册 ──
  if (window.ACMSWin) {
    if (window.ACMS && ACMS.registerPackage) {
      ACMS.registerPackage('email-inbox', {
        title: '收件箱', icon: '📬', category: '工具',
        defaultSize: { w: 720, h: 560 },
        loader: function(w) { render(w); }
      });
    } else {
      ACMSWin.registerViewLoader('email-inbox', render);
    }
  }

  // 启动器入口
  window.openEmailInbox = function() {
    if (window.ACMSWin) {
      if (!ACMSWin.isActive()) ACMSWin.enable();
      ACMSWin.open('email-inbox', { w: 720, h: 560, title: '📬 收件箱' });
    }
  };
})(window);
