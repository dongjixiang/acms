// ACMS 内容运营平台 L3 App — client/js/views/social-publisher.js
// =================================================================
// 8 个 tab：账号 / 编辑 / 排期 / 队列 / 审批 / 历史 / 截图 / 设置
// 抽屉：快速操作 + 今日已发 + 平台限额 + 最近发布
// 审批弹窗：SSE 实时收审批请求
//
// 关键陷阱（沿用 P88/P96/P147/P148 + 沉淀）：
//   - _byId helper 走 wRef.$c.querySelector 优先
//   - 全量渲染入口用 document.getElementById 强制写 hidden 模板
//   - 写操作后用 ACMSWin.refreshView('social-publisher') 同步浮窗
//   - 审批 SSE 用 EventSource，断线自动重连

(function () {
  'use strict';

  const VIEW_NAME = 'social-publisher';
  const VERSION = '0.118.18';  // v0.118.18: 常驻输入条(求助随时可输入/介入发言)；0.118.17: 💬介入+web_auth_login；0.118.16: 截图 key
  // SSE EventSource 无法带 Authorization header → query api_key（auth.js 认 config.apiKeys；dev-key-001 默认在列，与 browser-console 同款）
  const SP_AK = (typeof window !== 'undefined' && window.AK) || 'dev-key-001';
  let wRef = null;
  let cleanupFns = [];
  let currentPlatform = 'all';
  let currentTab = 'accounts';
  let sseSource = null;

  // === 设置持久化（localStorage，v0.118.6 接入；后续多端同步是 B 方案）===
  // 跨会话 first-class 模式 ①：key 前后端一字不差；⑤：配置与触发两端都写
  const SETTINGS_KEY = 'acms.sp.settings';
  const DEFAULT_SETTINGS = {
    llm: '',                  // 默认 LLM 模型 id（空=使用默认）
    humanize: 'low',          // off / low / medium / high
    screenshot: 'false',      // false / true / error-only
    approval: 'true',         // true / false
  };
  function readSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const obj = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...obj };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
  function writeSettings(s) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
      return true;
    } catch (e) {
      console.warn('[settings] localStorage write failed:', e);
      return false;
    }
  }
  // 把 settings 翻译成 publish_to_* 后端实际识别的 options 字段
  function settingsToOptions(s) {
    const humanizeVal = s.humanize && s.humanize !== 'off';  // low/medium/high 都启用 humanize
    const approvalVal = s.approval !== 'false';  // 默认 true
    const shotVal = s.screenshot === 'true' ? true : (s.screenshot === 'error-only' ? false : false);
    return {
      require_approval: approvalVal,
      humanize: humanizeVal,
      screenshot_each_step: shotVal,
      _screenshot_mode: s.screenshot,  // error-only 是中间态：让后端在 execute-steps 里识别（v0.118.6+）
      _llm: s.llm || undefined,         // 给 content-rewriter 用（v0.118.6+）
      _settings_applied: true,          // 标记：settings 已生效（diagnostic）
      _settings_version: VERSION,
    };
  }

  // === 工具 ===
  function _byId(id) {
    if (wRef && wRef.$c) {
      const el = wRef.$c.querySelector('#' + id);
      if (el) return el;
    }
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // 用于 onclick 字符串参数 — 转义 \ 和 单/双引号，防 URL/文件名含特殊字符把 onclick 字符串撑爆
  function escJs(s) {
    return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
  }

  function setStatus(text, type = 'info') {
    const el = _byId('sp-status');
    if (el) {
      el.textContent = text;
      el.dataset.type = type;
    }
  }

  async function api(method, path, body) {
    // P-SP25: 必须从 localStorage 读 token 加 Authorization 头 —— server middleware 只认 JWT/API Key，
    // 不认 cookie（credentials:'include' 单走这条路永远 401 → 触发"加载失败"）。
    // 参考 client/js/api.js:7-11、kanban.js:1290-1292、agent-buddy.js:170-171 的统一模式。
    const headers = { 'Content-Type': 'application/json' };
    try {
      const token = localStorage.getItem('acms-token');
      if (token) headers['Authorization'] = 'Bearer ' + token;
    } catch (_) { /* localStorage 可能被禁用，无 token 时降级到 cookie（兜底仍带） */ }
    const opts = {
      method,
      headers,
      credentials: 'include',
    };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  }

  function notify(msg, type = 'info') {
    if (window.notify) return window.notify(msg, type);
    console.log(`[${type}] ${msg}`);
  }

  function createInfoTip(content) {
    if (!content) return '';
    return `<span class="sp-info-tip" data-tip="${esc(content)}">i</span>`;
  }

  // 缓存账号列表（供内容编辑账号选择用）
  let cachedAccounts = [];

  // === Tab 1: 账号管理 ===
  async function loadAccounts() {
    const container = _byId('sp-accounts-list');
    if (!container) return;
    setStatus('加载账号...', 'loading');
    try {
      const r = await api('GET', '/api/social-publisher/accounts');
      if (!r.ok) {
        container.innerHTML = `<div class="sp-empty">加载失败: ${esc(r.data?.error || r.status)}</div>`;
        setStatus('加载失败', 'error');
        return;
      }
      const accounts = r.data.accounts || [];
      if (accounts.length === 0) {
        container.innerHTML = `
          <div class="sp-empty">
            <p>暂无账号</p>
            <p style="font-size:11px;margin-top:8px">点击右上"添加账号"开始</p>
          </div>
        `;
        setStatus('就绪', 'info');
        return;
      }
      container.innerHTML = accounts.map(a => {
        const isAgentBrowser = a.credentials?.type === 'agent_browser';
        const lastUsed = a.last_used_at ? new Date(a.last_used_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '从未登录';
        return `
        <div class="sp-card">
          <div class="sp-card-title">
            <span class="sp-health-dot ${a.health === 'ok' ? 'ok' : a.health === 'warn' ? 'warn' : 'err'}"></span>
            <span>${esc(a.display_name)}</span>
            <span style="color:var(--sp-text-2);font-size:11px;margin-left:8px">${esc(a.platform)}</span>
          </div>
          <div class="sp-card-meta">
            <span>👤 ${esc(a.credentials?.username || a.credentials?.type || '?')}</span>
            <span>🕐 ${esc(lastUsed)}</span>
            <span>📅 今日: ${a.daily_publish_count || 0} / ${a.max_per_day || '-'}</span>
          </div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
            ${isAgentBrowser ? `<button class="sp-btn sp-btn-sm sp-btn-primary" onclick="window.SPView.loginAccount('${esc(a.id)}')" title="打开浏览器登录页 + 自动填账号密码（agent-browser auth login）">🔑 立即登录</button>` : ''}
            <button class="sp-btn sp-btn-sm" onclick="window.SPView.checkHealth('${esc(a.id)}')">🔍 检查</button>
            <button class="sp-btn sp-btn-sm sp-btn-danger" onclick="window.SPView.removeAccount('${esc(a.id)}')">🗑️ 删除</button>
          </div>
        </div>
      `;}).join('');
      setStatus(`就绪 — ${accounts.length} 个账号`, 'success');
      cachedAccounts = accounts;  // 缓存供内容编辑账号选择用
      updateComposeAccountSelector();
    } catch (e) {
      container.innerHTML = `<div class="sp-empty">加载失败: ${esc(e.message)}</div>`;
      setStatus('加载失败', 'error');
    }
  }

  // 更新内容编辑中的账号选择（多选复选框，每平台默认勾选第一个账号）
  function updateComposeAccountSelector() {
    const list = _byId('sp-compose-account-list');
    const platforms = Array.from((_byId('sp-compose-platforms') || document).querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.value);
    if (!list) return;
    if (cachedAccounts.length === 0) {
      list.innerHTML = '<span style="font-size:11px;color:var(--sp-text-2)">暂无账号（先在"账号管理"添加）</span>';
      return;
    }
    // 每平台第一个账号作为默认（默认勾选）
    const defaultByPlatform = {};
    for (const a of cachedAccounts) {
      if (!defaultByPlatform[a.platform]) defaultByPlatform[a.platform] = a.id;
    }
    // 显示所有账号，每平台分组（按平台排序）
    const sortedAccounts = [...cachedAccounts].sort((a, b) => (a.platform || '').localeCompare(b.platform || '') || (a.display_name || '').localeCompare(b.display_name || ''));
    list.innerHTML = sortedAccounts.map(a => {
      const isDefault = defaultByPlatform[a.platform] === a.id;
      const checked = isDefault ? 'checked' : '';
      return `<label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;background:var(--sp-bg-3);padding:3px 6px;border-radius:4px;border:1px solid var(--sp-border);cursor:pointer">
              <input type="checkbox" value="${esc(a.id)}" ${checked} style="margin:0"> <span>${esc(a.display_name || a.id)}</span> <span style="font-size:10px;color:var(--sp-text-2)">(${esc(a.platform)})</span>
            </label>`;
    }).join('');
  }

  // 监听平台复选框变化，动态刷新账号下拉
  (function bindPlatformChange() {
    const container = document.getElementById('sp-compose-platforms') || (_byId && _byId('sp-compose-platforms'));
    if (!container) return;
    container.addEventListener('change', () => {
      setTimeout(updateComposeAccountSelector, 10);
    });
  })();

  async function addAccount() {
    // v0.118.1: agent_browser 模式（PR 5 设计的本意）—— 用户填用户名密码 → 后端调 agent-browser auth save
    //   - 凭据存到 agent-browser 全局 auth 系统（不在 social-publisher collection）
    //   - 浏览器 session 是 agent-browser daemon 全局单实例，不存在"不同机器不同 cookie"问题
    //   - html 模式（cookie 长需要 textarea，ACMSModal 不支持 textarea 字段；用户名密码不需要 textarea）
    //   - beforeCleanup 钩子读 DOM 值（P52：cleanup 同步 removeChild，await 后 DOM 没了）
    console.log('[addAccount] start');
    let captured = null;
    let validationError = null;
    // ACMSModal.show 是同步挂载 modal 然后返回 Promise —— 在 await 之前 modal 已在 DOM 里
    const showPromise = window.ACMSModal.show({
      title: '➕ 添加平台账号',
      size: 'md',
      root: wRef && wRef.$c ? wRef.$c : undefined,  // 浮窗内挂载
      html: `
        <div class="sp-form">
          <div class="sp-form-row">
            <label>平台 <span class="sp-info-tip" data-tip="选择要添加的平台。凭据会保存到本机 agent-browser 的全局 auth 系统里 —— 不需要懂 cookie、不需要管机器差异，session 自动复用。">i</span></label>
            <select id="sp-acct-platform">
              <option value="toutiao">📰 头条</option>
              <option value="xiaohongshu">📕 小红书</option>
              <option value="wechat_oa">📱 公众号</option>
              <option value="zhihu">💭 知乎</option>
              <option value="douyin">🎬 抖音</option>
            </select>
          </div>
          <div class="sp-form-row">
            <label>显示名 <span class="sp-info-tip" data-tip="账号的备注名（如"头条-多多"），方便多账号区分。">i</span></label>
            <input id="sp-acct-display-name" placeholder="如: 头条-多多">
          </div>
          <div class="sp-form-row" id="sp-acct-cred-username">
            <label>用户名 / 登录账号 <span class="sp-info-tip" data-tip="你在平台登录用的账号（手机号/邮箱/用户名）。不会存到 social-publisher 数据库 —— 加密存在本机 agent-browser 全局 auth 系统。">i</span></label>
            <input id="sp-acct-username" placeholder="手机号 / 邮箱 / 用户名">
          </div>
          <div class="sp-form-row" id="sp-acct-cred-password">
            <label>密码 <span class="sp-info-tip" data-tip="登录密码。不存到数据库（密码全程只在 agent-browser 内部）。公众号走 App ID + App Secret（API 模式不需要浏览器登录）。">i</span></label>
            <input id="sp-acct-password" type="password" placeholder="登录密码">
          </div>
        </div>
        <div style="margin-top:8px;padding:8px;background:var(--sp-bg-2);border-radius:6px;font-size:11px;color:var(--sp-text-2);line-height:1.5">
          💡 添加后点账号卡片的 <b>🔑 立即登录</b> 按钮，agent-browser 会自动打开登录页 + 填账号密码。如需扫码验证，去 <b>Web 机器人</b> 画面手动完成。Session 保留，后续发布自动复用。
        </div>
      `,
      actions: [
        { label: '取消', value: 'CANCEL', className: 'acms-modal-btn' },
        { label: '添加', value: 'CONFIRM', className: 'acms-modal-btn acms-modal-btn-primary' },
      ],
      // P52: cleanup 同步销毁 DOM 前同步读表单值存到 closure
      //   P-SP28: html 模式下不能用 'SUBMIT' value —— ACMSModal.js:256-267 走 form 收集传 {} 给 cleanup
      //   改用普通字符串（'CONFIRM'/'CANCEL'），走 else 分支 cleanup(b.value) → v=字符串
      beforeCleanup: (v) => {
        console.log('[addAccount] beforeCleanup v=' + v);
        if (v !== 'CONFIRM') return v;  // 取消或非 CONFIRM
        const platform = document.getElementById('sp-acct-platform')?.value;
        const display_name = (document.getElementById('sp-acct-display-name')?.value || '').trim();
        const username = (document.getElementById('sp-acct-username')?.value || '').trim();
        const password = document.getElementById('sp-acct-password')?.value || '';
        console.log('[addAccount] read fields:', { platform, display_name, username, password_len: password.length });
        if (!platform || !display_name) {
          validationError = '平台和显示名必填';
          console.log('[addAccount] VALIDATION_FAIL: 平台/显示名空');
          return null;
        }
        if (!username) {
          validationError = '用户名必填';
          console.log('[addAccount] VALIDATION_FAIL: 用户名空');
          return null;
        }
        if (!password) {
          validationError = '密码必填（公众号填 App Secret）';
          console.log('[addAccount] VALIDATION_FAIL: 密码空');
          return null;
        }
        captured = {
          platform,
          display_name,
          credential: {
            type: 'agent_browser',  // v0.118.1 新流程（cookie 模式已废弃）
            username,
            password,                // 只用于本次后端调 auth save，不落 social-publisher 库
          },
        };
        console.log('[addAccount] captured set, return CONFIRM');
        return v;
      },
    });

    await showPromise;
    console.log('[addAccount] showPromise resolved, captured=' + (captured ? 'YES' : 'NO') + ' validationError=' + (validationError || 'none'));

    if (!captured) {
      if (validationError) notify(validationError, 'error');
      return;  // 取消 或 校验失败
    }

    console.log('[addAccount] POSTing to /api/social-publisher/accounts...');
    const r = await api('POST', '/api/social-publisher/accounts', captured);
    console.log('[addAccount] POST response ok=' + r.ok + ' status=' + r.status);
    if (r.ok) {
      notify(`账号已添加：${captured.display_name}（点 🔑 立即登录 完成首次登录）`, 'success');
      await loadAccounts();
    } else {
      notify('添加失败: ' + (r.data?.error || r.status), 'error');
    }
  }

  // v0.118.1：立即登录 — 调 agent-browser auth login 打开浏览器登录页 + 自动填账号密码
  async function loginAccount(id) {
    const aR = await api('GET', `/api/social-publisher/accounts/${id}`);
    if (!aR.ok || !aR.data?.account) { notify('账号不存在', 'error'); return; }
    const a = aR.data.account;
    if (a.credentials?.type !== 'agent_browser') {
      notify('该账号不是 agent_browser 类型（旧账号，不支持自动登录）', 'error');
      return;
    }
    notify('正在打开浏览器登录页 + 自动填账号密码...', 'info');
    const r = await api('POST', `/api/social-publisher/accounts/${id}/login`, {});
    if (r.ok && r.data?.status === 'logged_in') {
      notify('✅ 登录成功，可发布', 'success');
      await loadAccounts();
    } else {
      // 登录失败但 ok=true（status=need_user）→ 用户去 Web 机器人手动完成
      notify('需要验证码？去 Web 机器人画面手动完成（账号密码已自动填好）', 'info', 6000);
      // 自动打开 Web 机器人方便用户切过去
      if (window.ACMSWin) {
        try { window.ACMSWin.open('browser-console'); } catch (_) {}
      }
    }
  }

  async function removeAccount(id) {
    // P50b: 系统弹窗零容忍 → ACMSModal（v0.118.14 清理残留 confirm）
    const v = await window.ACMSModal.show({
      title: '🗑 删除账号',
      size: 'md',
      root: wRef && wRef.$c ? wRef.$c : undefined,
      html: `<style>.sp-confirm-danger{background:#e74c3c;color:#fff;border-color:#e74c3c}.sp-confirm-danger:hover{background:#c0392b}</style>
        <div style="font-size:13px;color:var(--sp-text-2);line-height:1.7">确定删除此账号？<br><span style="font-size:11px;color:var(--sp-text-3)">删除后无法恢复，该平台的发布任务将不可用。</span></div>`,
      actions: [
        { label: '取消', value: 'CANCEL', className: 'acms-modal-btn' },
        { label: '🗑 删除', value: 'CONFIRM', className: 'acms-modal-btn sp-confirm-danger' },
      ],
    });
    if (v !== 'CONFIRM') return;
    const r = await api('DELETE', `/api/social-publisher/accounts/${id}`);
    if (r.ok) {
      notify('已删除', 'success');
      await loadAccounts();
    } else {
      notify('删除失败: ' + (r.data?.error || r.status), 'error');
    }
  }

  async function checkHealth(id) {
    setStatus('检查账号健康度...', 'loading');
    const r = await api('POST', `/api/social-publisher/accounts/${id}/check`);
    if (r.ok) {
      notify(`健康度: ${r.data.status || 'ok'}`, r.data.status === 'err' ? 'error' : 'success');
      await loadAccounts();
    } else {
      notify('检查失败', 'error');
    }
  }

  // === Tab 2: 内容编辑 ===
  function getComposeData() {
    const t = _byId('sp-compose-title');
    const c = _byId('sp-compose-content');
    // PR H: contenteditable → 读取 innerHTML（HTML 格式内容）
    var contentHtml = '';
    if (c && c.getAttribute && c.getAttribute('contenteditable') === 'true') {
      contentHtml = c.innerHTML || '';
    } else {
      contentHtml = c ? (c.value || '') : '';
    }
    // 从 innerHTML 提取图片 src（用于 images 数组同步）
    var embeddedImages = [];
    try {
      var tempDiv = document.createElement('div');
      tempDiv.innerHTML = contentHtml || '';
      var imgs = tempDiv.querySelectorAll('img');
      for (var i = 0; i < imgs.length; i++) {
        var src = imgs[i].getAttribute('src') || '';
        if (src) embeddedImages.push(src);
      }
    } catch (e) { /* ignore parse error */ }
    return {
      title: _byId('sp-compose-title')?.value || '',
      content: contentHtml,
      // PR H: 内嵌图片（从内容 HTML 提取 + 外部图片输入合并）
      images: embeddedImages.concat(
        (_byId('sp-compose-images')?.value || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean)
      ),
      tags: (_byId('sp-compose-tags')?.value || '').split(',').map(s => s.trim()).filter(Boolean),
      platforms: Array.from((_byId('sp-compose-platforms') || document).querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.value),
      tone: _byId('sp-compose-tone')?.value || 'professional',
      schedule_at: _byId('sp-compose-schedule')?.value || '',
      selected_account_ids: Array.from((_byId('sp-compose-account-list') || document).querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.value),
      rich_content: window.__spActiveRichContent || null,
      rich_images: window.__spActiveRichImages || null,
      source: window.__spActiveSource || null,
    };
  }

  // v0.118 PR 6: 应用 prefill（Word → 内容运营平台导入）
  //   - 切到 compose tab
  //   - 填标题
  //   - 填正文（富文本 HTML 形式）
  //   - 显示"📝 富文本预览"区（含图片位置）
  //   - 提示 stats（X 块 Y 张图）
  function applyPrefill(prefill) {
    if (!prefill) return;
    console.log('[sp-prefill] 应用:', prefill.stats || {}, 'title:', prefill.title);

    // 切到 compose tab
    if (typeof switchTab === 'function') switchTab('compose');

    // 填标题
    const titleEl = _byId('sp-compose-title');
    if (titleEl && prefill.title) titleEl.value = prefill.title;

    // 序列化 rich_content → HTML（前端实现，避免再调后端）
    const richHtml = richToHtmlClient(prefill.rich_content);

    // 填正文（content 是 HTML；contenteditable div 用 innerHTML，textarea 用 value）
    const contentEl = _byId('sp-compose-content');
    if (contentEl) {
      if (contentEl.getAttribute && contentEl.getAttribute('contenteditable') === 'true') {
        contentEl.innerHTML = richHtml || '<br>';
      } else {
        contentEl.value = richHtml;
      }
      // 触发 input 事件让前端检测到变化
      contentEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // 显示富文本预览区
    const previewWrap = _byId('sp-rich-preview-wrap');
    const previewEl = _byId('sp-rich-preview');
    if (previewWrap && previewEl) {
      previewEl.innerHTML = richHtml;
      previewWrap.style.display = '';
    }
    const statsEl = _byId('sp-rich-stats');
    if (statsEl && prefill.stats) {
      statsEl.textContent = `从 ${prefill.source || 'Word'} 导入 · ${prefill.stats.blocks || 0} 块（含 ${prefill.stats.images || 0} 张图片 · ${prefill.stats.chars || 0} 字）`;
    }

    // 存到全局供 publish 用
    window.__spActiveRichContent = prefill.rich_content;
    window.__spActiveRichImages = null;
    window.__spActiveSource = prefill.source || 'word';

    notify(`已导入 ${prefill.stats?.blocks || 0} 块（含 ${prefill.stats?.images || 0} 张图片）`, 'success');
  }

  // 客户端 rich_content → HTML 序列化（与服务端 rich-content.js 等价，避免后端调用）
  function richToHtmlClient(blocks) {
    if (!Array.isArray(blocks)) return '';
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const runToHtml = (run) => {
      let h = esc(run.text || '');
      if (run.code) h = '<code>' + h + '</code>';
      if (run.bold) h = '<strong>' + h + '</strong>';
      if (run.italic) h = '<em>' + h + '</em>';
      if (run.underline) h = '<u>' + h + '</u>';
      if (run.strike) h = '<s>' + h + '</s>';
      if (run.color) h = '<span style="color:' + esc(run.color) + '">' + h + '</span>';
      if (run.sizeHalfPoints) h = '<span style="font-size:' + (run.sizeHalfPoints / 2) + 'pt">' + h + '</span>';
      if (run.href) h = '<a href="' + esc(run.href) + '">' + h + '</a>';
      return h;
    };
    const blockToHtml = (b) => {
      if (b.type === 'image') {
        let attrs = 'src="' + esc(b.src || '') + '"';
        if (b.alt) attrs += ' alt="' + esc(b.alt) + '"';
        if (b.width) attrs += ' width="' + Math.round(b.width) + '"';
        if (b.height) attrs += ' height="' + Math.round(b.height) + '"';
        return '<img ' + attrs + ' style="max-width:100%;height:auto">';
      }
      let inner = '';
      if (b.runs && b.runs.length) inner = b.runs.map(runToHtml).join('');
      else inner = esc(b.text || '');
      if (b.subtype === 'heading') {
        const lvl = Math.max(1, Math.min(6, b.level || 1));
        return '<h' + lvl + '>' + inner + '</h' + lvl + '>';
      }
      if (b.subtype === 'list_item') return '<li>' + inner + '</li>';
      return '<p>' + inner + '</p>';
    };
    return blocks.map(blockToHtml).join('');
  }

  async function composeRewrite() {
    const data = getComposeData();
    if (!data.content) return notify('请先写正文', 'warn');
    if (data.platforms.length === 0) return notify('请至少勾选一个平台', 'warn');
    setStatus('AI 改写中...', 'loading');
    try {
      const r = await api('POST', '/api/social-publisher/rewrite', data);
      if (r.ok) {
        // 把改写结果存到 localStorage 备用
        localStorage.setItem('sp_rewrite_result', JSON.stringify(r.data));
        notify('改写完成 — 切换到队列 tab 查看', 'success');
        setStatus('就绪 — 改写已存草稿', 'success');
      } else {
        notify('改写失败: ' + (r.data?.error || r.status), 'error');
        setStatus('改写失败', 'error');
      }
    } catch (e) {
      notify('改写失败: ' + e.message, 'error');
      setStatus('改写失败', 'error');
    }
  }

  // ─────────────────────────────────────────────────────────
  // v0.118.x: 🤖 AI 发布（goal-driven 模式）
  //   拿现有 compose 表单 → 调 /api/social-publisher/go-publish → 弹 modal 实时 SSE
  // ─────────────────────────────────────────────────────────
  let _aiEventSource = null;
  let _aiCurrentTaskId = null;
  // v0.118.x: 全局重连计数器（所有闭包共享，避免死循环）
  let _aiReconnectTotal = 0;

  function openAiModal() {
    const overlay = _byId('sp-ai-overlay');
    if (overlay) overlay.style.display = 'flex';
    // v0.118.18: 打开即聚焦输入条（随时可输入）
    setTimeout(() => {
      const ta = _byId('sp-ai-input');
      if (ta) { try { ta.focus(); } catch (_) {} }
    }, 60);
  }
  function closeAiModal() {
    const overlay = _byId('sp-ai-overlay');
    if (overlay) overlay.style.display = 'none';
    // v0.118.x: 不关 SSE + 不清 taskId
    //   关闭 modal 不等于放弃任务；waiting_user 来时自动 reopen + 强提示
  }
  function forceCloseAiModal() {
    const overlay = _byId('sp-ai-overlay');
    if (overlay) overlay.style.display = 'none';
    if (_aiEventSource) {
      _aiEventSource._aiIntentional = true;  // 主动关，onerror 静默
      _aiEventSource.close();
      _aiEventSource = null;
    }
    _aiCurrentTaskId = null;
    _aiReconnectTotal = 0;  // v0.118.x: 取消任务时重置计数，下次发布重新开始
  }
  function setAiStatus(text, kind) {
    const dot = _byId('sp-ai-status-dot');
    const txt = _byId('sp-ai-status-text');
    if (dot) {
      dot.className = 'sp-ai-status-dot';
      if (kind) dot.classList.add(kind);
    }
    if (txt) txt.textContent = text;
  }
  function setAiTaskId(taskId) {
    _aiCurrentTaskId = taskId;
    const el = _byId('sp-ai-task-id');
    if (el) el.textContent = taskId ? `task: ${taskId}` : '';
  }
  // v0.118.16: 💬 介入按钮可用态（running 可点；waiting/done 置灰）
  function setAiInterruptEnabled(enabled) {
    const btn = _byId('sp-ai-interrupt');
    if (!btn) return;
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? 1 : 0.45;
    btn.style.cursor = enabled ? 'pointer' : 'not-allowed';
  }
  // v0.118.16: 人主动发起求助 —— Agent 当前动作结束后暂停（waiting_user 链路）等人工输入
  async function requestAiInterrupt() {
    const tid = _aiCurrentTaskId;
    if (!tid) { notify('当前没有运行中的 AI 发布任务', 'warn'); return; }
    try {
      const r = await api('POST', `/api/browser-agent/session/${encodeURIComponent(tid)}/interrupt`, {});
      if (r.ok) {
        setAiStatus('⏸ 已请求 Agent 暂停…', 'waiting');
        setAiInterruptEnabled(false);
        notify(r.data?.pause ? '已请求 Agent 暂停 — 它停稳后会弹出输入框' : (r.data?.note || '已发送'), 'info', 6000);
      } else {
        if (r.data?.status === 'waiting_user') {
          notify('Agent 正在等你回复（看上方输入框）', 'info');
          setAiInterruptEnabled(false);
        } else {
          notify('暂停请求失败: ' + (r.data?.error || r.status), 'error');
        }
      }
    } catch (e) {
      notify('暂停请求失败: ' + e.message, 'error');
    }
  }
  function renderAiSteps(steps) {
    const container = _byId('sp-ai-steps');
    if (!container) return;
    if (!steps || steps.length === 0) {
      container.innerHTML = '<div class="sp-ai-empty">⏳ 等待 LLM 开始执行…</div>';
      return;
    }
    container.innerHTML = steps.map((s, i) => {
      const tools = (s.toolNames || []).map(t => `<span class="sp-ai-step-tool">${esc(t)}</span>`).join('');
      const shotHtml = s.screenshot ? `<img class="sp-ai-step-shot" src="${esc(s.screenshot)}?api_key=${esc(SP_AK)}" onclick="window.SPView?.viewScreenshot?.('${esc(s.screenshot)}','step-${s.round}.png','')" alt="step ${s.round}">` : '';
      return `
        <div class="sp-ai-step">
          <div class="sp-ai-step-header">
            <span class="sp-ai-step-num">${i+1}/${s.maxRounds || 25}</span>
            <span style="flex:1;font-size:11px">${esc(s.message || '').slice(0, 200)}</span>
          </div>
          ${tools ? `<div class="sp-ai-step-tools">${tools}</div>` : ''}
          ${shotHtml}
        </div>`;
    }).join('');
    // 自动滚到底部
    container.parentElement.scrollTop = container.parentElement.scrollHeight;
  }
  function showAiWaiting(question) {
    const w = _byId('sp-ai-waiting');
    const q = _byId('sp-ai-waiting-q');
    if (q) q.textContent = question || '需要你的帮助';
    if (w) w.style.display = 'block';
  }
  function hideAiWaiting() {
    const w = _byId('sp-ai-waiting');
    if (w) w.style.display = 'none';
  }
  function showAiDone(success, payload) {
    const d = _byId('sp-ai-done');
    const c = _byId('sp-ai-done-content');
    if (!d || !c) return;
    d.className = 'sp-ai-done ' + (success ? 'success' : 'error');
    let html = '';
    if (payload.post_url) {
      html += `<div style="margin-bottom:6px">📎 <a href="${esc(payload.post_url)}" target="_blank" style="color:#10b981">${esc(payload.post_url)}</a></div>`;
    }
    if (payload.content) {
      html += `<div style="white-space:pre-wrap;font-size:12px;color:var(--sp-text-2);margin-top:6px">${esc(payload.content).slice(0, 800)}</div>`;
    }
    if (payload.error) {
      html += `<div style="margin-top:6px;font-size:12px;color:#ef4444">❌ ${esc(payload.error)}</div>`;
    }
    c.innerHTML = html;
    d.style.display = 'block';
  }

  // ── v0.118.18: 常驻输入条 ──────────────────────────────────────
  //   _aiPhase: idle | running | waiting | done —— 决定输入条是「介入发言」还是「回复」
  let _aiPhase = 'idle';
  function setAiPhase(phase) {
    _aiPhase = phase;
    const ta = _byId('sp-ai-input');
    if (!ta) return;
    if (phase === 'waiting') {
      ta.placeholder = 'Agent 正在等你回复 — 输入验证码 / 指示 / 账号后按 Enter（或点上方 A/B/C 快捷回复）';
    } else if (phase === 'running') {
      ta.placeholder = '随时可介入：提要求 / 给验证码 / 纠正方向…（Enter 发送，Shift+Enter 换行）';
    } else if (phase === 'done' || phase === 'idle') {
      ta.placeholder = '本次发布已结束（新任务开始后可再发消息）';
    }
  }
  // 发送：waiting = 回复（reply）；running = 介入发言（interrupt 注入，不暂停）
  async function aiSendFromBar() {
    const ta = _byId('sp-ai-input');
    const msg = (ta && ta.value || '').trim();
    if (!msg) { notify('请输入内容', 'warn'); return; }
    const tid = _aiCurrentTaskId;
    if (!tid) { notify('当前没有运行中的 AI 发布任务', 'warn'); return; }
    const clearInput = () => { if (ta) ta.value = ''; };
    if (_aiPhase === 'waiting') {
      const r = await api('POST', `/api/browser-agent/session/${encodeURIComponent(tid)}/reply`, { message: msg });
      if (r.ok) {
        clearInput();
        hideAiWaiting();
        setAiStatus('🤖 Agent 收到回复，继续执行...', 'running');
        setAiInterruptEnabled(true);
        setAiPhase('running');
      } else {
        notify('回复失败: ' + (r.data?.error || r.status), 'error');
      }
    } else if (_aiPhase === 'running') {
      // 介入发言：不暂停，Agent 下一轮立即响应（要暂停可用 💬 介入按钮）
      const r = await api('POST', `/api/browser-agent/session/${encodeURIComponent(tid)}/interrupt`, { message: msg });
      if (r.ok) {
        clearInput();
        setAiStatus('💬 已把你的指示发给 Agent…', 'running');
        notify('已发送给 Agent — 它会先响应你的指示', 'info', 4000);
      } else {
        notify('发送失败: ' + (r.data?.error || r.status), 'error');
      }
    } else {
      notify('任务已结束，无法发送（开新任务可再发）', 'warn');
    }
  }

  function subscribeAiStream(taskId) {
    // v0.118.12: SSE 收敛到 browser-agent session 通道（删除 go-publish 自建通道）
    //   事件协议（与旧通道对齐）：step {round,maxRounds,message,toolNames,screenshot}
    //   / waiting_user {sessionId,question} / done {sessionId,taskId,status,content,error}
    //   session 通道原生处理：waiting_user 保活（订阅时若在等 → 立即推 waiting_user）、
    //   断线补发历史 toolCalls、任务不存在推 error —— 不再需要自建 hello/心跳/恢复
    if (_aiEventSource) {
      _aiEventSource._aiIntentional = true;
      _aiEventSource.close();
      _aiEventSource = null;
    }
    const url = `/api/browser-agent/session/${encodeURIComponent(taskId)}/stream?api_key=${SP_AK}`;
    const es = new EventSource(url);
    _aiEventSource = es;
    es._aiIntentional = false;
    // 闭包内标志：这个 ES 是主动关的吗？
    let intentional = false;
    let lastSteps = [];  // 本地步骤累积（session 通道 done 不回带 steps；订阅补发按内容去重）

    es.addEventListener('step', (ev) => {
      try {
        const step = JSON.parse(ev.data);
        // 订阅时会补发历史 toolCalls（resume 后 round 会重置）→ 按内容去重，防重复渲染
        const key = `${step.round}|${step.message}|${(step.toolNames || []).join(',')}`;
        if (lastSteps.some(s => `${s.round}|${s.message}|${(s.toolNames || []).join(',')}` === key)) return;
        lastSteps.push(step);
        renderAiSteps(lastSteps);
        setAiStatus(`🤖 步骤 ${lastSteps.length} · ${(step.toolNames || []).join(', ') || '...'}`, 'running');
      } catch (e) {}
    });
    es.addEventListener('waiting_user', (ev) => {
      try {
        const data = JSON.parse(ev.data);
        setAiStatus('⏸ LLM 在等你回复', 'waiting');
        setAiInterruptEnabled(false);  // waiting 中已有输入框，介入按钮置灰
        setAiPhase('waiting');  // v0.118.18: 输入条切「回复」模式
        showAiWaiting(data.question);
        const overlay = _byId('sp-ai-overlay');
        if (overlay && overlay.style.display === 'none') {
          overlay.style.display = 'flex';
          try {
            if (window.Notification && Notification.permission === 'granted') {
              new Notification('🤖 LLM 在等你协助', {
                body: (data.question || '').slice(0, 100),
                tag: 'sp-ai-waiting',
              });
            } else if (window.Notification && Notification.permission !== 'denied') {
              Notification.requestPermission().then(p => {
                if (p === 'granted') {
                  new Notification('🤖 LLM 在等你协助', {
                    body: (data.question || '').slice(0, 100),
                    tag: 'sp-ai-waiting',
                  });
                }
              });
            }
          } catch (e) {}
          let blinkCount = 0;
          const origTitle = document.title;
          const blink = setInterval(() => {
            document.title = blinkCount % 2 === 0 ? '🔔 LLM 在等你' : origTitle;
            blinkCount++;
            if (blinkCount >= 8) {
              clearInterval(blink);
              document.title = origTitle;
            }
          }, 1000);
        }
        notify('🔔 LLM 在等你回复 — 切回内容运营平台', 'info', 9000);
      } catch (e) {}
    });
    es.addEventListener('done', (ev) => {
      try {
        const data = JSON.parse(ev.data);
        // v0.118.12: session 通道 done 不带 post_url → 从 LLM 总结里提取
        if (!data.post_url && data.content) {
          const m = String(data.content).match(/https?:\/\/[^\s)]+(?:toutiao|xiaohongshu|zhihu|douyin|weixin|mp\.[a-z]+\.com)[^\s)]*/);
          if (m) data.post_url = m[0];
        }
        if (data.status === 'error') {
          setAiStatus('❌ 发布失败', 'error');
          showAiDone(false, data);
        } else {
          setAiStatus('✅ 发布完成', 'done');
          showAiDone(true, data);
          try {
            if (window.Notification && Notification.permission === 'granted') {
              new Notification(data.post_url ? '✅ 发布成功' : '⚠️ 发布未完成', {
                body: data.post_url || (data.error || '任务结束'),
                tag: 'sp-ai-done',
              });
            }
          } catch (e) {}
        }
        notify(data.status === 'error' ? `❌ ${data.error || '失败'}` : '✅ 发布完成', data.status === 'error' ? 'error' : 'success');
      } catch (e) {}
      hideAiWaiting();
      setAiInterruptEnabled(false);  // done/error 后介入无意义
      setAiPhase('done');  // v0.118.18
      // done 触发 → intentional 标 true → close → onerror 看到 intentional=true 静默
      intentional = true;
      es._aiIntentional = true;
      es.close();
    });

    es.onerror = (e) => {
      // 用闭包内的 intentional，不查 _aiEventSource（避免新旧 ES 错位）
      if (intentional || es._aiIntentional) {
        console.log('[sp-ai] SSE closed intentionally (this es), ignore onerror');
        return;
      }
      // readyState=0 = 浏览器在自动重连，2 = CLOSED
      if (es.readyState === EventSource.CONNECTING) {
        console.log('[sp-ai] SSE browser-native reconnecting...');
        return;
      }
      // 真断 (readyState=CLOSED)
      const currentTaskId = _aiCurrentTaskId;  // 快照，避免 this._aiCurrentTaskId 变化
      if (currentTaskId !== taskId) {
        console.log('[sp-ai] task changed during reconnect, skip');
        return;
      }
      // v0.118.12: 重连前先查 session 状态（done/error/waiting_user 都不重连，避免死循环）
      api('GET', `/api/browser-agent/session/${encodeURIComponent(taskId)}`)
        .then(async r => {
          // 二次校验：闭包内 reconnect 期间用户可能又切换了 task
          if (_aiCurrentTaskId !== taskId) {
            console.log('[sp-ai] task changed during fetch, skip');
            return;
          }
          const st = r.data || {};
          if (r.ok && (st.status === 'done' || st.status === 'error')) {
            console.log('[sp-ai] session terminal, skip reconnect');
            // session 详情无 content → 从 messages 取最后 assistant 总结
            const content = await fetchSessionFinalContent(taskId);
            if (_aiCurrentTaskId !== taskId) return;
            if (st.status === 'done') {
              setAiStatus('✅ 发布完成', 'done');
              showAiDone(true, { status: 'done', content, error: st.error || null });
            } else {
              setAiStatus('❌ 发布失败', 'error');
              showAiDone(false, { status: 'error', content, error: st.error || '未知错误' });
            }
            return;
          }
          if (r.ok && st.status === 'waiting_user' && st.pendingQuestion) {
            console.log('[sp-ai] session waiting_user, recover UI');
            setAiStatus('⏸ LLM 在等你回复（恢复）', 'waiting');
            setAiInterruptEnabled(false);
            setAiPhase('waiting');  // v0.118.18
            showAiWaiting(st.pendingQuestion);
            return;
          }
          // 还在 running：重连一次（用全局计数器，所有闭包共享，避免死循环）
          if (_aiReconnectTotal < 1) {
            _aiReconnectTotal++;
            setAiStatus('⚠️ SSE 连接断开，正在重连...', 'error');
            console.warn('[sp-ai] SSE closed, retrying once in 2s...');
            setTimeout(() => {
              if (_aiCurrentTaskId === taskId) {
                subscribeAiStream(taskId);
                notify('🔄 SSE 自动重连中…', 'info', 3000);
              }
            }, 2000);
          } else {
            setAiStatus('❌ SSE 重连失败（任务可能仍在运行，去后端查 session 状态）', 'error');
            notify('SSE 重连失败', 'error', 8000);
          }
        })
        .catch(() => {
          // GET 失败（比如 404 session 不存在）→ 当成已结束
          setAiStatus('⚠️ 无法查询会话状态', 'error');
        });
    };
  }

  // v0.118.12: 从 session messages 取最后一条 assistant 总结（onerror 终态恢复用）
  async function fetchSessionFinalContent(sessionId) {
    try {
      const r = await api('GET', `/api/browser-agent/session/${encodeURIComponent(sessionId)}/messages`);
      if (!r.ok || !Array.isArray(r.data?.messages)) return '';
      const msgs = r.data.messages;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant' && msgs[i].content) return msgs[i].content;
      }
      return '';
    } catch (e) {
      return '';
    }
  }

  async function sendAiReply(reply) {
    if (!_aiCurrentTaskId || !reply) return;
    try {
      // v0.118.12: 回复走 browser-agent session 通道（POST /session/:id/reply { message }）
      const r = await api('POST', `/api/browser-agent/session/${encodeURIComponent(_aiCurrentTaskId)}/reply`, { message: reply });
      if (!r.ok) {
        notify('回复失败: ' + (r.data?.error || r.status), 'error');
        return;
      }
      hideAiWaiting();
      setAiStatus('🤖 LLM 收到回复，继续执行...', 'running');
      setAiInterruptEnabled(true);  // v0.118.16: resume 后回到 running，可再次介入
      setAiPhase('running');  // v0.118.18
      const inBar = _byId('sp-ai-input');
      if (inBar) inBar.value = '';
    } catch (e) {
      notify('回复失败: ' + e.message, 'error');
    }
  }

  async function aiPublish() {
    const data = getComposeData();
    if (!data.title || !data.content) return notify('请先写标题和正文', 'warn');
    // v0.118.13: AI 模式不支持排期 —— 用户选了未来时间点 AI 会静默变立即执行（行为不一致），先拦截并指路
    const schedVal = _byId('sp-compose-schedule')?.value;
    if (schedVal && new Date(schedVal).getTime() > Date.now() + 60000) {
      return notify('🤖 AI 发布暂不支持排期 — 定时发布请用「🚀 传统发布」（排期走无人值守 Provider）', 'warn');
    }
    if (data.platforms.length === 0) return notify('请至少勾选一个平台', 'warn');
    if (data.platforms.length > 1) return notify('🤖 AI 模式暂只支持单平台（多平台请逐个发布）', 'warn');
    const platform = data.platforms[0];
    const selectedIds = (data.selected_account_ids || []).filter(Boolean);
    if (selectedIds.length === 0) return notify('请至少选一个发布账号', 'warn');
    const accountId = selectedIds[0];

    setStatus('创建 AI 发布任务...', 'loading');

    // 打开 modal + 重置
    openAiModal();
    setAiTaskId(null);
    setAiStatus('🚀 创建任务...', 'running');
    renderAiSteps([]);
    hideAiWaiting();
    const doneEl = _byId('sp-ai-done');
    if (doneEl) doneEl.style.display = 'none';
    // v0.118.x: 重置全局重连计数
    _aiReconnectTotal = 0;

    try {
      const r = await api('POST', '/api/social-publisher/go-publish', {
        platform,
        account_id: accountId,
        title: data.title,
        content: data.content,
        tags: data.tags || [],
        images: data.images || [],
      });
      if (!r.ok) {
        closeAiModal();
        notify('创建任务失败: ' + (r.data?.error || r.status), 'error');
        return;
      }
      setAiTaskId(r.data.task_id);
      setAiInterruptEnabled(true);  // v0.118.16: running 中可随时 💬 介入
      setAiPhase('running');  // v0.118.18
      subscribeAiStream(r.data.task_id);
    } catch (e) {
      closeAiModal();
      notify('创建任务失败: ' + e.message, 'error');
    }
  }

  async function composePublish() {
    const data = getComposeData();
    if (!data.title || !data.content) return notify('请先写标题和正文', 'warn');
    if (data.platforms.length === 0) return notify('请至少勾选一个平台', 'warn');
    setStatus('创建任务...', 'loading');
    try {
      // 取选中的账号（多选复选框），如果没有选则用每平台默认账号
      const selectedIds = (data.selected_account_ids || []).filter(Boolean);
      let account = null;
      if (selectedIds.length > 0) {
        // 优先用选中的账号（取第一个作为主账号，用于单平台；多平台时每平台匹配选中账号）
        const allR = await api('GET', `/api/social-publisher/accounts`);
        const allAccounts = allR.data?.accounts || [];
        account = allAccounts.find(a => a.id === selectedIds[0]);
      }
      if (!account) {
        const accountsR = await api('GET', `/api/social-publisher/accounts?platform=${data.platforms[0]}`);
        account = accountsR.data?.accounts?.[0];
      }
      if (!account) {
        return notify(`未配置 ${data.platforms[0]} 账号，请先在"账号管理"添加`, 'error');
      }

      // === 排期：如果选了未来时间 → 走 /kanban/schedule ===
      if (data.schedule_at) {
        const when = new Date(data.schedule_at).getTime();
        const now = Date.now();
        if (when > now + 60000) {  // 至少 1 分钟后才算排期
          setStatus('创建排期任务...', 'loading');
          // v0.118.6: 从设置页读 settings 合并到排期任务（保存了才能生效）
          const spOpts = settingsToOptions(readSettings());
          const r = await api('POST', '/api/social-publisher/kanban/schedule', {
            schedule_at: data.schedule_at,
            title: data.title,
            content: data.content,
            images: data.images,
            tags: data.tags,
            account_id: account.id,
            platforms: data.platforms,
            options: spOpts,
          });
          if (r.ok) {
            notify(`已排期：${new Date(data.schedule_at).toLocaleString()} 执行`, 'success');
            await loadSchedule();
            switchTab('schedule');
            return;
          } else {
            return notify('排期失败: ' + (r.data?.error || r.status), 'error');
          }
        }
        // 选了过去时间 = 立即执行，不走排期
      }

      const isAll = data.platforms.length > 1;
      const taskType = isAll ? 'social-publish-all' : 'social-publish';

      // 多平台时：为每个平台匹配选中的账号（如果选了对应平台的账号则用选中的，否则用默认）
      let subTasks = [];
      if (isAll) {
        const allR = selectedIds.length > 0 ? await api('GET', `/api/social-publisher/accounts`) : null;
        const allAccounts = allR?.data?.accounts || cachedAccounts;
        subTasks = data.platforms.slice(1).map(p => {
          const matchedAccount = allAccounts.find(a => selectedIds.includes(a.id) && a.platform === p);
          return { platform: p, account_id: matchedAccount ? matchedAccount.id : undefined };
        });
      }

      // v0.118.6: 从设置页读 settings 合并到任务 options（保存了才能生效）
      const spOpts = settingsToOptions(readSettings());
      const taskR = await api('POST', '/api/social-publisher/kanban/tasks', {
        projectId: 'sp-publisher',
        type: taskType,
        post_title: data.title,
        content: data.content,
        // v0.118 PR 6: 富文本（Word 导入的图片+位置）
        rich_content: data.rich_content || undefined,
        rich_images: data.rich_images || undefined,
        content_html: data.rich_content ? richToHtmlClient(data.rich_content) : undefined,
        source: data.source || undefined,
        images: data.images,
        tags: data.tags,
        platform: data.platforms[0],
        account_id: account.id,
        sub_tasks: subTasks,
        options: spOpts,
      });

      if (!taskR.ok) {
        return notify('任务创建失败: ' + (taskR.data?.error || taskR.status), 'error');
      }
      const task = taskR.data.task;
      notify(`任务 ${task.id} 已创建`, 'success');

      // 立即 claim（让 sp-task-executor 执行）
      const claimR = await api('POST', `/api/social-publisher/kanban/tasks/${task.id}/claim`, { agentId: 'user-publish' });
      if (claimR.ok) {
        notify('已触发执行 — 切到队列看进度', 'success');
      }
      switchTab('queue');
    } catch (e) {
      notify('发布失败: ' + e.message, 'error');
    }
  }

  // === Tab 3: 排期（PR 4：Kanban 集成） ===
  async function loadSchedule() {
    const container = _byId('sp-schedule-list');
    if (!container) return;
    try {
      const r = await api('GET', '/api/social-publisher/kanban/schedule');
      const r2 = await api('GET', `/api/social-publisher/kanban/tasks?type=social-publish`);
      if (!r.ok && !r2.ok) {
        container.innerHTML = `<div class="sp-empty">加载失败</div>`;
        return;
      }
      const scheduled = r.data?.items || [];
      const tasks = r2.data?.tasks || [];
      if (scheduled.length === 0 && tasks.filter(t => t.status === 'backlog').length === 0) {
        container.innerHTML = `<div class="sp-empty">暂无排期任务<br><span style="font-size:11px">在"内容编辑"里填好内容 + 选"排期发布时间"后点"发布"</span></div>`;
        return;
      }
      const items = [
        ...scheduled.map(id => tasks.find(t => t.id === id)).filter(Boolean),
        ...tasks.filter(t => t.status === 'backlog' && !scheduled.includes(t.id)),
      ];
      container.innerHTML = items.map(it => `
        <div class="sp-card">
          <div class="sp-card-title">📅 ${esc(it.title)}</div>
          <div class="sp-card-meta">
            <span>📱 ${esc(it.artifacts ? (() => { try { return JSON.parse(it.artifacts).social?.platform; } catch { return '?'; } })() : '?')}</span>
            <span>🕐 ${esc(it.updated_at || '')}</span>
            <span class="sp-card-status queued">backlog</span>
          </div>
          ${scheduled.includes(it.id) ? `<div style="margin-top:6px"><button class="sp-btn sp-btn-sm sp-btn-danger" onclick="window.SPView.cancelSchedule('${esc(it.id)}')">取消排期</button></div>` : ''}
          <div style="margin-top:6px"><button class="sp-btn sp-btn-sm sp-btn-danger" onclick="window.SPView.deleteTask('${esc(it.id)}')">🗑 删除任务</button></div>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = `<div class="sp-empty">加载失败: ${esc(e.message)}</div>`;
    }
  }

  // === Tab 4: 队列（PR 4：Kanban 任务列表） ===
  async function loadQueue() {
    const container = _byId('sp-queue-list');
    if (!container) return;
    try {
      // PR 4: 从 Kanban 拉 in_progress + review + failed
      const r = await api('GET', '/api/social-publisher/kanban/tasks');
      if (!r.ok) {
        container.innerHTML = `<div class="sp-empty">加载失败: ${esc(r.data?.error || r.status)}</div>`;
        return;
      }
      const items = r.data.tasks || [];
      // v0.118.4: 把 failed 也加进队列（之前会"隐身"——任务执行失败但 UI 看不到）
      // 用户视角：失败任务仍属于"队列"范畴，需要能看到 + 重试
      const active = items.filter(t => ['in_progress', 'review', 'backlog', 'failed'].includes(t.status));
      if (active.length === 0) {
        container.innerHTML = `<div class="sp-empty">队列为空<br><span style="font-size:11px">在"内容编辑"里点"发布"会创建 Kanban 任务</span></div>`;
        return;
      }
      // 排序：失败置顶（用户最关心的），然后 in_progress，再 backlog，再 review
      const order = { failed: 0, in_progress: 1, backlog: 2, review: 3 };
      active.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
      container.innerHTML = active.map(it => {
        const arts = (() => { try { return JSON.parse(it.artifacts || '{}'); } catch { return {}; } })();
        const platform = arts.social?.platform || '?';
        return `
        <div class="sp-card">
          <div class="sp-card-title">
            ${esc(it.title)}
            <span class="sp-card-status ${it.status === 'done' ? 'ok' : it.status === 'failed' ? 'err' : it.status === 'in_progress' ? 'warn' : 'queued'}">${esc(it.status)}</span>
          </div>
          <div class="sp-card-meta">
            <span>📱 ${esc(platform)}</span>
            <span>🆔 ${esc(it.id)}</span>
            <span>📁 ${esc(it.project_id || '-')}</span>
            <span>📊 进度: ${it.progress || 0}%</span>
            ${it.progress_note ? `<span>${esc(it.progress_note)}</span>` : ''}
          </div>
          <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
            <button class="sp-btn sp-btn-sm" onclick="window.SPView.showTaskDetail('${esc(it.id)}')" title="查看任务完整内容 / 执行步骤 / 错误信息">🔍 详情</button>
            ${it.status === 'backlog' ? `<button class="sp-btn sp-btn-sm sp-btn-primary" onclick="window.SPView.claimTask('${esc(it.id)}')">▶️ 立即执行</button>` : (it.status === 'in_progress' || it.status === 'failed' || it.status === 'review') ? `<button class="sp-btn sp-btn-sm sp-btn-warn" onclick="window.SPView.claimTask('${esc(it.id)}')">🔄 重试执行</button>` : ''}
            <button class="sp-btn sp-btn-sm sp-btn-danger" onclick="window.SPView.deleteTask('${esc(it.id)}')">🗑 删除</button>
          </div>
        </div>
      `;
      }).join('');
    } catch (e) {
      container.innerHTML = `<div class="sp-empty">加载失败: ${esc(e.message)}</div>`;
    }
  }

  // v0.118.5: 任务详情弹窗（多多：队列任务应该可以点进去看内容）
  // 用 ACMSModal 显示完整 metadata + content + images + tags + 执行步骤 + 错误
  async function showTaskDetail(taskId) {
    const r = await api('GET', `/api/social-publisher/kanban/tasks/${encodeURIComponent(taskId)}`);
    if (!r.ok || !r.data?.task) {
      notify('任务不存在', 'error');
      return;
    }
    const t = r.data.task;
    const arts = (() => { try { return JSON.parse(t.artifacts || '{}'); } catch { return {}; } })();
    const s = arts.social || {};
    const sr = arts.social_result || {};
    const steps = sr.steps || [];
    const contentText = String(s.content || '');
    const contentSnippet = contentText.length > 500 ? contentText.slice(0, 500) + '…（共 ' + contentText.length + ' 字）' : contentText;

    // 先清掉旧 modal，避免堆叠
    document.querySelectorAll('.acms-modal-overlay').forEach(el => el.remove());

    const showPromise = window.ACMSModal.show({
      title: '📋 任务详情',
      size: 'lg',
      root: wRef && wRef.$c ? wRef.$c : undefined,
      html: `
        <style>
          .sp-detail-row { display:flex;gap:8px;padding:5px 0;font-size:13px;border-bottom:1px solid var(--sp-border-soft) }
          .sp-detail-row .lbl { color:var(--sp-text-2);min-width:90px;flex-shrink:0 }
          .sp-detail-row .val { color:var(--sp-text);flex:1;word-break:break-all }
          .sp-step { padding:6px 10px;border-left:3px solid #4ecdc4;margin-bottom:4px;background:var(--sp-bg-2);border-radius:3px }
          .sp-step.err { border-left-color:#e74c3c }
        </style>
        <div class="sp-form">
          <div class="sp-form-row">
            <label>📋 元数据</label>
            <div class="sp-detail-row"><span class="lbl">任务 ID</span><span class="val" style="font-family:monospace;font-size:11px">${esc(t.id)}</span></div>
            <div class="sp-detail-row"><span class="lbl">标题</span><span class="val">${esc(t.title)}</span></div>
            <div class="sp-detail-row"><span class="lbl">状态</span><span class="val"><b style="color:${t.status==='failed'?'#e74c3c':t.status==='done'||t.status==='review'?'#4ecdc4':'var(--sp-accent)'}">${esc(t.status)}</b> ${t.progress ? `· ${t.progress}%` : ''}</span></div>
            <div class="sp-detail-row"><span class="lbl">类型</span><span class="val">${esc(t.type || '-')}</span></div>
            <div class="sp-detail-row"><span class="lbl">项目</span><span class="val" style="font-family:monospace;font-size:11px">${esc(t.project_id || '-')}</span></div>
            <div class="sp-detail-row"><span class="lbl">平台</span><span class="val">${esc(s.platform || '-')}</span></div>
            <div class="sp-detail-row"><span class="lbl">账号</span><span class="val" style="font-family:monospace;font-size:11px">${esc(s.account_id || '-')}</span></div>
            <div class="sp-detail-row"><span class="lbl">分配给</span><span class="val">${esc(t.assigned_to || '-')}</span></div>
            <div class="sp-detail-row"><span class="lbl">创建时间</span><span class="val" style="font-size:11px">${esc(t.created_at || '-')}</span></div>
            <div class="sp-detail-row"><span class="lbl">更新时间</span><span class="val" style="font-size:11px">${esc(t.updated_at || '-')}</span></div>
            ${t.progress_note ? `<div class="sp-detail-row"><span class="lbl">备注</span><span class="val">${esc(t.progress_note)}</span></div>` : ''}
          </div>
          <div class="sp-form-row">
            <label>📝 正文 <span style="font-weight:400;font-size:11px;color:var(--sp-text-2)">（${contentText.length} 字）</span></label>
            <div style="padding:8px;background:var(--sp-bg-2);border:1px solid var(--sp-border);border-radius:4px;max-height:200px;overflow:auto;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word;font-family:inherit">${esc(contentSnippet)}</div>
          </div>
          ${(s.images && s.images.length) ? `
          <div class="sp-form-row">
            <label>🖼 图片（${s.images.length}）</label>
            <div style="font-size:11px;color:var(--sp-text-2);max-height:100px;overflow:auto;background:var(--sp-bg-2);padding:6px;border-radius:3px">${s.images.map(img => esc(String(img).slice(0, 120))).join('<br>')}</div>
          </div>` : ''}
          ${(s.tags && s.tags.length) ? `
          <div class="sp-form-row">
            <label>🏷 标签</label>
            <div style="font-size:12px">${s.tags.map(tag => `<span style="background:var(--sp-bg-3);padding:2px 8px;border-radius:3px;margin-right:4px;display:inline-block">${esc(tag)}</span>`).join('')}</div>
          </div>` : ''}
          <div class="sp-form-row">
            <label>🔧 执行步骤（${steps.length}）</label>
            ${steps.length ? steps.map((st, i) => `
              <div class="sp-step ${st.ok === false ? 'err' : ''}">
                <div style="font-size:12px;font-weight:600">${i+1}. ${esc(st.name || st.step || '?')} ${st.ok === false ? '✗' : (st.ok ? '✓' : '·')}</div>
                ${st.error ? `<div style="font-size:11px;color:#e74c3c;margin-top:2px;font-family:monospace">${esc(st.error)}</div>` : ''}
                ${st.elapsed_ms ? `<div style="font-size:10px;color:var(--sp-text-3);margin-top:2px">⏱️ ${st.elapsed_ms}ms</div>` : ''}
              </div>
            `).join('') : '<div style="color:var(--sp-text-2);font-size:12px;padding:6px 0">无步骤记录（可能未开始执行）</div>'}
          </div>
          ${sr.error ? `
          <div class="sp-form-row">
            <label>❌ 错误</label>
            <div style="padding:8px 10px;background:rgba(231,76,60,0.1);border:1px solid #e74c3c;border-radius:4px;color:#e74c3c;font-size:12px;font-family:monospace;white-space:pre-wrap;word-break:break-word">${esc(sr.error)}</div>
          </div>` : ''}
        </div>
      `,
      actions: [
        { label: '关闭', value: 'CANCEL', className: 'acms-modal-btn' },
        { label: '🔄 重试执行', value: 'RETRY', className: 'acms-modal-btn acms-modal-btn-primary' },
      ],
    });
    const v = await showPromise;
    if (v === 'RETRY') {
      await claimTask(taskId);
    }
  }

  async function claimTask(id) {
    try {
      // 对于已被 claim 的任务（in_progress / failed / review），先重置为 backlog 再 claim
      const checkR = await api('GET', `/api/social-publisher/kanban/tasks`);
      const currentTask = (checkR.data?.tasks || []).find(t => t.id === id);
      if (currentTask && (currentTask.status === 'in_progress' || currentTask.status === 'failed' || currentTask.status === 'review')) {
        await api('POST', `/api/tasks/${id}/transition`, { targetStatus: 'backlog', actor: { id: 'user-manual', type: 'user' } });
        notify('已重置任务为待执行状态', 'info');
      }
    } catch (_) { /* 忽略检查错误，直接尝试 claim */ }
    const r = await api('POST', `/api/social-publisher/kanban/tasks/${id}/claim`, { agentId: 'user-manual' });
    if (r.ok) {
      notify('已触发执行', 'success');
      await loadQueue();
    } else {
      notify('触发失败: ' + (r.data?.error || r.status), 'error');
    }
  }

  async function cancelSchedule(id) {
    const r = await api('POST', `/api/social-publisher/kanban/schedule/${id}/cancel`);
    if (r.ok) {
      notify('已取消排期', 'success');
      await loadSchedule();
    } else {
      notify('取消失败', 'error');
    }
  }

  async function deleteTask(id) {
    // P50b: 系统弹窗零容忍 → ACMSModal（v0.118.14 清理残留 confirm）
    const v = await window.ACMSModal.show({
      title: '🗑 删除任务',
      size: 'md',
      root: wRef && wRef.$c ? wRef.$c : undefined,
      html: `<style>.sp-confirm-danger{background:#e74c3c;color:#fff;border-color:#e74c3c}.sp-confirm-danger:hover{background:#c0392b}</style>
        <div style="font-size:13px;color:var(--sp-text-2);line-height:1.7">确认删除任务 <b style="font-family:monospace">${esc(id)}</b>？<br><span style="font-size:11px;color:var(--sp-text-3)">若任务正在执行，删除不会停止浏览器中的操作。</span></div>`,
      actions: [
        { label: '取消', value: 'CANCEL', className: 'acms-modal-btn' },
        { label: '🗑 删除', value: 'CONFIRM', className: 'acms-modal-btn sp-confirm-danger' },
      ],
    });
    if (v !== 'CONFIRM') return;
    const r = await api('DELETE', `/api/tasks/${id}`);
    if (r.ok || r.status === 200) {
      notify('已删除任务 ' + id, 'success');
      await loadQueue();
      await loadSchedule();
    } else {
      notify('删除失败: ' + (r.data?.error || r.status), 'error');
    }
  }

  async function clearDone() {
    const r = await api('POST', '/api/social-publisher/queue/clear-done');
    if (r.ok) {
      notify('已清空', 'success');
      await loadQueue();
    } else {
      notify('清空失败', 'error');
    }
  }

  // === Tab 5: 审批 ===
  async function loadApproval() {
    const container = _byId('sp-approval-list');
    if (!container) return;
    try {
      const r = await api('GET', '/api/social-publisher/approval');
      if (!r.ok) {
        container.innerHTML = `<div class="sp-empty">加载失败: ${esc(r.data?.error || r.status)}</div>`;
        return;
      }
      const items = r.data.items || [];
      if (items.length === 0) {
        container.innerHTML = `<div class="sp-empty">无待审批任务<br><span style="font-size:11px">所有 publish_to_* 工具发前会自动请求审批</span></div>`;
        return;
      }
      container.innerHTML = items.map(it => `
        <div class="sp-card">
          <div class="sp-card-title">⏳ ${esc(it.title || '待审批')}</div>
          <div class="sp-card-meta">
            <span>📱 ${esc(it.platform)}</span>
            <span>🆔 ${esc(it.approval_id)}</span>
            <span>🕐 ${esc(it.created_at || '')}</span>
          </div>
          <div class="sp-approval-preview">${esc(it.content || '')}</div>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button class="sp-btn sp-btn-primary" onclick="window.SPView.respondApproval('${esc(it.approval_id)}', 'approve')">✅ 批准</button>
            <button class="sp-btn sp-btn-danger" onclick="window.SPView.respondApproval('${esc(it.approval_id)}', 'reject')">❌ 拒绝</button>
          </div>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = `<div class="sp-empty">加载失败: ${esc(e.message)}</div>`;
    }
  }

  async function respondApproval(id, action, opts = {}) {
    // v0.118 PR 5-4: 支持 edit 决策 + 携带 edited_content
    const body = action === 'edit' && opts.edited_content !== undefined
      ? { decision: 'edit', edited: { content: opts.edited_content } }
      : { decision: action };
    const r = await api('POST', `/api/social-publisher/approval/${id}/${action}`, body);
    if (r.ok) {
      const labels = { approve: '已批准', reject: '已拒绝', cancel: '已取消', edit: '已批准（编辑版）' };
      notify(labels[action] || '已提交', 'success');
      // 切到队列 tab 看进度
      setTimeout(() => switchTab('queue'), 500);
    } else {
      notify(`提交失败: ${r.data?.error || r.status}`, 'error');
    }
    if (currentTab === 'approval') loadApproval();
  }

  // === Tab 6: 发布历史（v0.118 PR 5-5 走持久化 + 历史详情）===
  async function loadHistory() {
    const container = _byId('sp-history-list');
    if (!container) return;
    try {
      // 走 PR 5-5 持久化端点（重启不丢）
      const r = await api('GET', `/api/social-publisher/task-history?platform=${currentPlatform}&limit=100`);
      if (!r.ok) {
        container.innerHTML = `<div class="sp-empty">加载失败: ${esc(r.data?.error || r.status)}</div>`;
        return;
      }
      const items = r.data.items || [];
      if (items.length === 0) {
        container.innerHTML = `<div class="sp-empty">暂无发布历史</div>`;
        return;
      }
      container.innerHTML = items.map(it => `
        <div class="sp-card" data-id="${esc(it.id)}" style="cursor:pointer">
          <div class="sp-card-title">
            ${it.post_url ? `<a href="${esc(it.post_url)}" target="_blank" style="color:var(--sp-accent)">${esc(it.title || it.post_url)}</a>` : esc(it.title || '(无标题)')}
            <span class="sp-card-status ${it.ok ? 'ok' : 'err'}">${it.ok ? '✓ 已发布' : '✗ 失败'}</span>
          </div>
          <div class="sp-card-meta">
            <span title="${it.source === 'goal-driven' ? 'Web 机器人 goal-driven 执行' : 'Provider 自动化执行'}" style="font-weight:600;color:${it.source === 'goal-driven' ? 'var(--sp-accent)' : 'var(--sp-text-2)'}">${it.source === 'goal-driven' ? '🤖 AI' : '⚙️'}</span>
            <span>📱 ${esc(it.platform)}</span>
            <span>🆔 ${esc(it.id.slice(-6))}</span>
            <span>🕐 ${esc(it.completed_at || '')}</span>
            ${it.total_elapsed_ms ? `<span>⏱️ ${(it.total_elapsed_ms / 1000).toFixed(1)}s</span>` : ''}
            ${it.error ? `<span style="color:var(--sp-error)">${esc(it.error)}</span>` : ''}
          </div>
        </div>
      `).join('');
      // 点击展开详情
      container.querySelectorAll('.sp-card[data-id]').forEach(card => {
        card.addEventListener('click', () => showHistoryDetail(card.dataset.id));
      });
    } catch (e) {
      container.innerHTML = `<div class="sp-empty">加载失败: ${esc(e.message)}</div>`;
    }
  }

  // v0.118.14: 统一渲染历史步骤，兼容两种 schema（同一张表）：
  //   provider:    {name, ok, error, elapsed_ms}
  //   goal-driven: {round, maxRounds, message, toolNames, ts, screenshot?}
  function renderHistoryStepsHtml(steps, isAi) {
    if (!steps || steps.length === 0) {
      return '<div style="color:var(--sp-text-2);font-size:12px;padding:6px 0">无步骤记录</div>';
    }
    return steps.map((st, i) => {
      if (isAi) {
        const tools = (st.toolNames || []).map(t =>
          `<span style="display:inline-block;background:var(--sp-bg-3);padding:1px 7px;border-radius:8px;font-size:10px;margin:1px 4px 1px 0;color:var(--sp-text-2)">${esc(t)}</span>`
        ).join('');
        const msg = esc(String(st.message || '')).slice(0, 300);
        const shot = st.screenshot
          ? `<div style="margin-top:4px"><img src="${esc(st.screenshot)}?api_key=${esc(SP_AK)}" alt="step ${st.round}" style="max-width:220px;max-height:140px;border-radius:4px;cursor:zoom-in;border:1px solid var(--sp-border)" onclick="window.SPView.viewScreenshot('${esc(st.screenshot)}','step-${st.round}.png','');event.stopPropagation()"></div>`
          : '';
        return `<div class="sp-step">
          <div style="font-size:11px;color:var(--sp-text-2);font-weight:600">第 ${i + 1} 步 · R${st.round != null ? st.round : (i + 1)}/${st.maxRounds || '-'}</div>
          <div style="font-size:12px;margin-top:2px;word-break:break-word">${msg || '<span style="color:var(--sp-text-3)">（无描述）</span>'}</div>
          ${tools ? `<div style="margin-top:3px">${tools}</div>` : ''}
          ${shot}
        </div>`;
      }
      // provider schema
      return `<div class="sp-step ${st.ok === false ? 'err' : ''}">
        <div style="font-size:12px;font-weight:600">${i + 1}. ${esc(st.name || st.step || '?')} ${st.ok === false ? '✗' : (st.ok ? '✓' : '·')}</div>
        ${st.error ? `<div style="font-size:11px;color:#e74c3c;margin-top:2px;font-family:monospace">${esc(st.error)}</div>` : ''}
        ${st.elapsed_ms ? `<div style="font-size:10px;color:var(--sp-text-3);margin-top:2px">⏱️ ${st.elapsed_ms}ms</div>` : ''}
      </div>`;
    }).join('');
  }

  async function showHistoryDetail(id) {
    const r = await api('GET', `/api/social-publisher/task-history/${id}`);
    if (!r.ok) { notify('加载详情失败', 'error'); return; }
    const it = r.data.item;
    const isAi = it.source === 'goal-driven';
    const steps = it.steps || [];
    const contentSnippet = String(it.content || '').slice(0, 400);
    // v0.118.14: alert → ACMSModal（P50b 零容忍清理）
    document.querySelectorAll('.acms-modal-overlay').forEach(el => el.remove());
    await window.ACMSModal.show({
      title: isAi ? '🤖 AI 发布详情' : '⚙️ 发布详情',
      size: 'lg',
      root: wRef && wRef.$c ? wRef.$c : undefined,
      html: `
        <style>
          .sp-detail-row { display:flex;gap:8px;padding:5px 0;font-size:13px;border-bottom:1px solid var(--sp-border-soft) }
          .sp-detail-row .lbl { color:var(--sp-text-2);min-width:90px;flex-shrink:0 }
          .sp-detail-row .val { color:var(--sp-text);flex:1;word-break:break-all }
          .sp-step { padding:6px 10px;border-left:3px solid #4ecdc4;margin-bottom:4px;background:var(--sp-bg-2);border-radius:3px }
          .sp-step.err { border-left-color:#e74c3c }
        </style>
        <div class="sp-form">
          <div class="sp-form-row">
            <div class="sp-detail-row"><span class="lbl">状态</span><span class="val"><b style="color:${it.ok ? '#4ecdc4' : '#e74c3c'}">${it.ok ? '✅ 已发布' : '❌ 失败'}</b></span></div>
            <div class="sp-detail-row"><span class="lbl">方式</span><span class="val">${isAi ? '🤖 Web 机器人（goal-driven）' : '⚙️ Provider 自动化'}</span></div>
            <div class="sp-detail-row"><span class="lbl">平台</span><span class="val">${esc(it.platform)}</span></div>
            <div class="sp-detail-row"><span class="lbl">任务 ID</span><span class="val" style="font-family:monospace;font-size:11px">${esc(it.task_id || '-')}</span></div>
            <div class="sp-detail-row"><span class="lbl">账号</span><span class="val" style="font-family:monospace;font-size:11px">${esc(it.account_id || '-')}</span></div>
            <div class="sp-detail-row"><span class="lbl">完成时间</span><span class="val" style="font-size:11px">${esc(it.completed_at || '-')}</span></div>
            ${it.total_elapsed_ms ? `<div class="sp-detail-row"><span class="lbl">总耗时</span><span class="val" style="font-size:11px">${(it.total_elapsed_ms / 1000).toFixed(1)}s</span></div>` : ''}
            ${it.post_url ? `<div class="sp-detail-row"><span class="lbl">链接</span><span class="val"><a href="${esc(it.post_url)}" target="_blank" style="color:var(--sp-accent)">${esc(it.post_url)}</a></span></div>` : ''}
          </div>
          ${it.error ? `
          <div class="sp-form-row">
            <label>❌ 错误</label>
            <div style="padding:8px 10px;background:rgba(231,76,60,0.1);border:1px solid #e74c3c;border-radius:4px;color:#e74c3c;font-size:12px;font-family:monospace;white-space:pre-wrap;word-break:break-word">${esc(it.error)}</div>
          </div>` : ''}
          <div class="sp-form-row">
            <label>🔧 执行步骤（${steps.length}）</label>
            ${renderHistoryStepsHtml(steps, isAi)}
          </div>
          ${contentSnippet ? `
          <div class="sp-form-row">
            <label>📝 正文预览</label>
            <div style="padding:8px;background:var(--sp-bg-2);border:1px solid var(--sp-border);border-radius:4px;max-height:160px;overflow:auto;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word;font-family:inherit">${esc(contentSnippet)}</div>
          </div>` : ''}
        </div>
      `,
      actions: [
        { label: '关闭', value: 'CANCEL', className: 'acms-modal-btn' },
      ],
    });
  }

  // === Tab 8: 监控（v0.118 PR 5-6）===
  async function loadMonitor() {
    const statsEl = _byId('sp-monitor-stats');
    const alertsEl = _byId('sp-monitor-alerts');
    if (!statsEl || !alertsEl) return;
    try {
      const [statsR, alertsR] = await Promise.all([
        api('GET', '/api/social-publisher/monitor/stats'),
        api('GET', '/api/social-publisher/monitor/alerts?limit=20'),
      ]);
      if (statsR.ok) {
        const s = statsR.data;
        statsEl.innerHTML = `
          <div class="sp-stat-grid">
            <div class="sp-stat-card"><div class="sp-stat-num">${s.total || 0}</div><div class="sp-stat-label">账号总数</div></div>
            <div class="sp-stat-card ok"><div class="sp-stat-num">${s.active || 0}</div><div class="sp-stat-label">活跃</div></div>
            <div class="sp-stat-card err"><div class="sp-stat-num">${s.banned || 0}</div><div class="sp-stat-label">封禁</div></div>
            <div class="sp-stat-card warn"><div class="sp-stat-num">${s.high_risk || 0}</div><div class="sp-stat-label">高风险</div></div>
            <div class="sp-stat-card"><div class="sp-stat-num">${s.today_publish_total || 0}</div><div class="sp-stat-label">今日发布</div></div>
            <div class="sp-stat-card"><div class="sp-stat-num">${s.alert_count || 0}</div><div class="sp-stat-label">告警数</div></div>
          </div>
        `;
      } else {
        statsEl.innerHTML = `<div class="sp-empty">统计加载失败: ${esc(statsR.data?.error || statsR.status)}</div>`;
      }
      if (alertsR.ok) {
        const alerts = alertsR.data.alerts || [];
        if (alerts.length === 0) {
          alertsEl.innerHTML = `<div class="sp-empty">✅ 暂无告警</div>`;
        } else {
          alertsEl.innerHTML = alerts.map(a => {
            const sevClass = { critical: 'err', warning: 'warn', info: 'ok' }[a.severity] || '';
            const icon = { critical: '🚨', warning: '⚠️', info: 'ℹ️' }[a.severity] || '•';
            return `
              <div class="sp-card sp-alert-card ${sevClass}">
                <div class="sp-card-title">${icon} ${esc(a.message)}</div>
                <div class="sp-card-meta">
                  <span>📱 ${esc(a.platform || '-')}</span>
                  <span>📌 ${esc(a.type)}</span>
                  <span>🕐 ${esc(a.created_at || '')}</span>
                  ${a.action_taken ? `<span style="color:var(--sp-warn)">🚨 已自动处置: ${esc(a.action_taken)}</span>` : ''}
                </div>
              </div>
            `;
          }).join('');
        }
      } else {
        alertsEl.innerHTML = `<div class="sp-empty">告警加载失败</div>`;
      }
    } catch (e) {
      statsEl.innerHTML = `<div class="sp-empty">加载失败: ${esc(e.message)}</div>`;
    }
  }

  // === Tab 7: 截图回看 ===
  async function loadScreenshots() {
    const container = _byId('sp-screenshots-list');
    if (!container) return;
    try {
      const r = await api('GET', '/api/social-publisher/screenshots');
      if (!r.ok) {
        container.innerHTML = `<div class="sp-empty">加载失败: ${esc(r.data?.error || r.status)}</div>`;
        return;
      }
      const items = r.data.items || [];
      if (items.length === 0) {
        container.innerHTML = `<div class="sp-empty">暂无截图<br><span style="font-size:11px">在"设置"里开启"每步截图"才会保存</span></div>`;
        return;
      }
      // 按 task_id 分组，task 头部加"清空此任务截图"按钮（整批删除）
      const groups = {};
      for (const it of items) {
        (groups[it.task_id] = groups[it.task_id] || []).push(it);
      }
      const html = Object.entries(groups).map(([taskId, files]) => {
        const cards = files.map(it => `
        <div class="sp-card" style="display:flex;gap:12px;align-items:center;position:relative">
          <img src="${esc(it.url)}" class="sp-screenshot-thumb" loading="lazy" alt="${esc(it.filename)}" title="点击查看大图" onclick="window.SPView.viewScreenshot('${escJs(it.url)}','${escJs(it.filename)}','${escJs(it.step || '')}')">
          <div style="flex:1">
            <div class="sp-card-title">${esc(it.filename)}</div>
            <div class="sp-card-meta">
              <span>🔢 ${esc(it.step || '')}</span>
              <span>🕐 ${esc(it.created_at || '')}</span>
            </div>
          </div>
          <button class="sp-btn sp-btn-sm sp-btn-danger" style="position:absolute;top:6px;right:6px;padding:2px 8px;font-size:11px" onclick="window.SPView.deleteScreenshot('${escJs(it.task_id)}','${escJs(it.filename)}')" title="删除这张截图">🗑</button>
        </div>`).join('');
        return `
        <div style="margin-bottom:14px">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:var(--sp-bg-2);border-radius:4px;margin-bottom:6px">
            <div style="font-size:12px;font-weight:600;color:var(--sp-text-2)">📁 ${esc(taskId)} <span style="font-weight:400;color:var(--sp-text-3)">(${files.length} 张)</span></div>
            <button class="sp-btn sp-btn-sm sp-btn-danger" onclick="window.SPView.deleteScreenshotsByTask('${esc(taskId)}')" title="删除这个任务的所有截图">🗑️ 清空</button>
          </div>
          ${cards}
        </div>`;
      }).join('');
      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = `<div class="sp-empty">加载失败: ${esc(e.message)}</div>`;
    }
  }

  // 截图大图查看器（多多要求：点击缩略图看大图）—— 全屏 lightbox
  // 参考 image-gen.js previewImage 模式：fixed overlay + ESC/点击关闭。增强：底部 caption 显示文件名 + 步骤。
  function viewScreenshot(url, filename, step) {
    if (!url) return;
    if (document.getElementById('sp-img-overlay')) return; // 防重复

    const overlay = document.createElement('div');
    overlay.id = 'sp-img-overlay';
    overlay.className = 'sp-img-overlay';

    const img = document.createElement('img');
    // v0.118.16: lightbox 大图补 api_key —— 截图 URL 走 /api/browser-agent/screenshots/
    //   需要鉴权（不在 auth 白名单），而 onclick 传进来的 URL 不带 key
    let shotSrc = url;
    if (shotSrc.indexOf('/api/') === 0 && shotSrc.indexOf('api_key=') === -1) {
      shotSrc += (shotSrc.indexOf('?') === -1 ? '?' : '&') + 'api_key=' + encodeURIComponent(SP_AK);
    }
    img.src = shotSrc;
    img.alt = filename || '截图';

    const caption = document.createElement('div');
    caption.className = 'sp-img-overlay-caption';
    const parts = [];
    if (step) parts.push(`步骤 ${step}`);
    if (filename) parts.push(filename);
    caption.textContent = parts.length ? parts.join(' · ') + ' · 点击或 ESC 关闭' : '点击或 ESC 关闭';

    overlay.appendChild(img);
    overlay.appendChild(caption);

    const close = () => {
      const el = document.getElementById('sp-img-overlay');
      if (el) el.remove();
      document.removeEventListener('keydown', onEsc);
    };
    const onEsc = (e) => { if (e.key === 'Escape') close(); };

    // 点击图片本身不关闭（用户可能想点开图片右键保存）；点击遮罩关闭
    img.addEventListener('click', (e) => e.stopPropagation());
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', onEsc);

    document.body.appendChild(overlay);
  }

  // 删除单张截图（多多要求：截图回看记录允许删除）—— 用 ACMSModal 替代系统 confirm 弹窗
  async function deleteScreenshot(taskId, filename) {
    const showPromise = window.ACMSModal.show({
      title: '🗑 删除截图',
      size: 'md',
      root: wRef && wRef.$c ? wRef.$c : undefined,
      html: `
        <style>
          .acms-modal-btn.sp-confirm-danger { background:#e74c3c;color:#fff;border-color:#e74c3c }
          .acms-modal-btn.sp-confirm-danger:hover { background:#c0392b;border-color:#c0392b }
          .acms-modal-btn.sp-confirm-warn { background:#f39c12;color:#fff;border-color:#f39c12 }
          .acms-modal-btn.sp-confirm-warn:hover { background:#d68910;border-color:#d68910 }
        </style>
        <div class="sp-form">
          <div class="sp-form-row">
            <label>任务 ID</label>
            <div style="font-family:monospace;font-size:12px;background:var(--sp-bg-2);padding:6px 8px;border-radius:4px">${esc(taskId)}</div>
          </div>
          <div class="sp-form-row">
            <label>文件名</label>
            <div style="font-family:monospace;font-size:12px;background:var(--sp-bg-2);padding:6px 8px;border-radius:4px">${esc(filename)}</div>
          </div>
          <div style="font-size:12px;color:var(--sp-text-2);margin-top:8px;line-height:1.6">⚠️ 此操作不可恢复，确认要删除这张截图吗？</div>
        </div>
      `,
      actions: [
        { label: '取消', value: 'CANCEL', className: 'acms-modal-btn' },
        { label: '🗑 删除', value: 'CONFIRM', className: 'acms-modal-btn sp-confirm-danger' },
      ],
    });
    const v = await showPromise;
    if (v !== 'CONFIRM') return;
    try {
      const r = await api('DELETE', `/api/social-publisher/screenshots/${encodeURIComponent(taskId)}/${encodeURIComponent(filename)}`);
      if (r.ok) {
        notify(`已删除 ${filename}`, 'success');
        await loadScreenshots();
      } else {
        notify('删除失败: ' + (r.data?.error || r.status), 'error');
      }
    } catch (e) {
      notify('删除失败: ' + e.message, 'error');
    }
  }

  // 整批删除某 task 的所有截图——用 ACMSModal 替代系统 confirm 弹窗
  async function deleteScreenshotsByTask(taskId) {
    const showPromise = window.ACMSModal.show({
      title: '🗑️ 清空任务截图',
      size: 'md',
      root: wRef && wRef.$c ? wRef.$c : undefined,
      html: `
        <style>
          .acms-modal-btn.sp-confirm-danger { background:#e74c3c;color:#fff;border-color:#e74c3c }
          .acms-modal-btn.sp-confirm-danger:hover { background:#c0392b;border-color:#c0392b }
        </style>
        <div class="sp-form">
          <div class="sp-form-row">
            <label>任务 ID</label>
            <div style="font-family:monospace;font-size:12px;background:var(--sp-bg-2);padding:6px 8px;border-radius:4px">${esc(taskId)}</div>
          </div>
          <div style="font-size:12px;color:var(--sp-text-2);margin-top:8px;line-height:1.6">⚠️ 此操作不可恢复，将删除该任务的所有截图证据。<br>建议：仅在任务已结束且确认不再需要回看时执行。</div>
        </div>
      `,
      actions: [
        { label: '取消', value: 'CANCEL', className: 'acms-modal-btn' },
        { label: '🗑️ 清空', value: 'CONFIRM', className: 'acms-modal-btn sp-confirm-danger' },
      ],
    });
    const v = await showPromise;
    if (v !== 'CONFIRM') return;
    try {
      const r = await api('DELETE', `/api/social-publisher/screenshots/by-task/${encodeURIComponent(taskId)}`);
      if (r.ok) {
        notify(`已清空 ${r.data?.deleted?.count || 0} 张截图`, 'success');
        await loadScreenshots();
      } else {
        notify('清空失败: ' + (r.data?.error || r.status), 'error');
      }
    } catch (e) {
      notify('清空失败: ' + e.message, 'error');
    }
  }

  // === Tab 8: 设置（v0.118.6 接入：localStorage 持久化 + 任务自动 merge）===
  async function loadSettings() {
    // 1. 先读 localStorage 填 4 个 select（先于 LLM 模型拉取，因为 LLM 下拉有"加载中..."占位）
    const saved = readSettings();
    _applySettingsToUI(saved);
    // 2. 拉 LLM 模型下拉
    const llmSel = _byId('sp-settings-llm');
    if (llmSel) {
      try {
        const r = await api('GET', '/api/models');
        if (r.ok) {
          const models = r.data.models || r.data || [];
          llmSel.innerHTML = '<option value="">使用默认</option>' + models.map(m => `<option value="${esc(m.id)}">${esc(m.name || m.id)}</option>`).join('');
          // 恢复 LLM 选择（如果之前存过）
          if (saved.llm) {
            const opt = llmSel.querySelector(`option[value="${saved.llm}"]`);
            if (opt) llmSel.value = saved.llm;
          }
        } else {
          llmSel.innerHTML = '<option value="">无可用模型</option>';
        }
      } catch {
        llmSel.innerHTML = '<option value="">加载失败</option>';
      }
    }
    // 3. 绑定 change 监听 + 保存按钮（确保只绑一次：用 data-bound 标记）
    _bindSettingsHandlers();
    // 4. 状态显示当前设置
    _setSettingsStatus(`已加载 (版本 ${VERSION})`, 'info');
  }

  // 把 settings 写入 4 个 select 的 selected 值（不触发 change）
  function _applySettingsToUI(s) {
    const map = [
      ['llm', 'sp-settings-llm'],
      ['humanize', 'sp-settings-humanize'],
      ['screenshot', 'sp-settings-screenshot'],
      ['approval', 'sp-settings-approval'],
    ];
    for (const [k, id] of map) {
      const el = _byId(id);
      if (!el) continue;
      // 设置 selected 值（如果 option 列表已加载）
      const val = s[k];
      const opt = el.querySelector(`option[value="${val}"]`);
      if (opt) {
        el.value = val;
      } else if (el.tagName === 'SELECT') {
        // LLM 还没加载，先跳过（loadSettings 后续会再设）
        if (k !== 'llm') el.value = val;
      }
      el.dataset.saved = val;  // 标记原始值（用于 dirty 检测）
      el.dataset.dirty = 'false';
    }
  }

  // 绑监听（一次性）
  let _settingsHandlersBound = false;
  function _bindSettingsHandlers() {
    if (_settingsHandlersBound) return;
    _settingsHandlersBound = true;
    document.querySelectorAll('.sp-settings-input').forEach(el => {
      el.addEventListener('change', () => {
        el.dataset.dirty = (el.value !== el.dataset.saved) ? 'true' : 'false';
        _setSettingsStatus(el.dataset.dirty === 'true' ? '● 未保存' : '已同步', el.dataset.dirty === 'true' ? 'warn' : 'info');
      });
    });
    const saveBtn = _byId('sp-settings-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const cur = readCurrentSettingsFromUI();
        if (writeSettings(cur)) {
          // 更新 saved 标记 + 清 dirty
          document.querySelectorAll('.sp-settings-input').forEach(el => {
            el.dataset.saved = el.value;
            el.dataset.dirty = 'false';
          });
          _setSettingsStatus(`✅ 已保存 (版本 ${VERSION}) — 后续发布任务将自动应用`, 'success');
          // 通知其它 tab/浮窗刷新
          if (window.ACMSWin && window.ACMSWin.refreshView) {
            try { window.ACMSWin.refreshView(VIEW_NAME); } catch {}
          }
        } else {
          _setSettingsStatus('❌ 保存失败（localStorage 不可用）', 'error');
        }
      });
    }
  }
  function readCurrentSettingsFromUI() {
    const out = {};
    document.querySelectorAll('.sp-settings-input').forEach(el => {
      const k = el.dataset.key;
      if (k) out[k] = el.value;
    });
    // 兜底默认值
    return { ...DEFAULT_SETTINGS, ...out };
  }
  function _setSettingsStatus(text, type = 'info') {
    const el = _byId('sp-settings-status');
    if (!el) return;
    const colors = { info: 'var(--sp-text-2)', warn: '#f59e0b', success: '#10b981', error: '#ef4444' };
    el.textContent = text;
    el.style.color = colors[type] || colors.info;
    el.style.fontWeight = type === 'success' || type === 'error' ? '600' : '400';
  }

  // === 抽屉数据 ===
  async function loadDrawer() {
    try {
      const r = await api('GET', `/api/social-publisher/drawer-stats?platform=${currentPlatform}`);
      if (r.ok) {
        const d = r.data || {};
        const todayEl = _byId('sp-drawer-today-count');
        if (todayEl) todayEl.textContent = d.today_count || 0;
        const limitsEl = _byId('sp-drawer-platform-limits');
        if (limitsEl && d.limits) {
          limitsEl.innerHTML = Object.entries(d.limits).map(([p, l]) => `
            <div style="display:flex;justify-content:space-between;font-size:11px">
              <span>${esc(p)}</span>
              <span style="color:var(--sp-text-2)">${l.used} / ${l.max}</span>
            </div>
          `).join('');
        }
        const recentEl = _byId('sp-drawer-recent');
        if (recentEl && d.recent) {
          recentEl.innerHTML = d.recent.slice(0, 5).map(it => `
            <div style="font-size:11px;padding:4px 0;border-bottom:1px solid var(--sp-border-soft)">
              ${esc(it.title || '(无)').slice(0, 20)}<br>
              <span style="color:var(--sp-text-2)">${esc(it.platform)} · ${esc(it.created_at || '')}</span>
            </div>
          `).join('') || '<div style="font-size:11px;color:var(--sp-text-2)">无</div>';
        }
      }
    } catch (e) {
      console.warn('loadDrawer failed:', e);
    }
  }

  // === SSE 审批订阅 ===
  function startApprovalSSE() {
    if (sseSource) { try { sseSource.close(); } catch (_) {} }
    try {
      sseSource = new EventSource('/api/social-publisher/stream');
      sseSource.addEventListener('approval', (e) => {
        try {
          const data = JSON.parse(e.data);
          showApprovalModal(data);
        } catch (err) {
          console.warn('SSE parse failed:', err);
        }
      });
      sseSource.onerror = () => {
        // 断线自动重连，EventSource 默认就重连
      };
    } catch (e) {
      console.warn('SSE not available:', e);
    }
  }

  function showApprovalModal(data) {
    // 关掉旧的
    const old = document.getElementById('sp-approval-modal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'sp-approval-modal';
    modal.className = 'sp-approval-modal';
    // v0.118 PR 5-4: 编辑模式 — 文本域 + 一键重写按钮 + 三个决策按钮
    const platform = esc(data.platform || '');
    const approvalId = esc(data.approval_id || '');
    modal.innerHTML = `
      <div class="sp-approval-card">
        <h3>⏳ ${esc(data.title || '待审批')}</h3>
        <div class="sp-approval-meta">
          <span>📱 ${platform}</span>
          <span>🆔 ${approvalId}</span>
        </div>
        <div class="sp-approval-edit-wrap">
          <label style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:12px;color:#888">编辑内容（发出去的就是这个）</span>
            <button class="sp-btn sp-btn-sm" id="sp-modal-rewrite">🔄 一键重写</button>
          </label>
          <textarea id="sp-modal-content" class="sp-approval-textarea" rows="6">${esc(data.preview || '')}</textarea>
        </div>
        <div class="sp-approval-actions">
          <button class="sp-btn sp-btn-danger" id="sp-modal-reject">❌ 拒绝</button>
          <button class="sp-btn sp-btn-warning" id="sp-modal-cancel">🚫 取消</button>
          <button class="sp-btn sp-btn-primary" id="sp-modal-approve">✅ 用编辑版发布</button>
        </div>
        <div class="sp-approval-timer" id="sp-modal-timer">⏱️ 300s 后自动拒绝</div>
      </div>
    `;
    document.body.appendChild(modal);

    let remaining = data.timeout ? Math.floor(data.timeout / 1000) : 300;
    const timer = setInterval(() => {
      remaining--;
      const t = _byId('sp-modal-timer');
      if (t) t.textContent = `⏱️ ${remaining}s 后自动拒绝`;
      if (remaining <= 0) {
        clearInterval(timer);
        modal.remove();
        respondApproval(data.approval_id, 'reject');
      }
    }, 1000);

    // 一键重写 — 调 LLM 重写当前文本
    _byId('sp-modal-rewrite')?.addEventListener('click', async () => {
      const ta = _byId('sp-modal-content');
      if (!ta) return;
      const original = ta.value;
      ta.disabled = true;
      const btn = _byId('sp-modal-rewrite');
      btn.textContent = '⏳ 重写中...';
      try {
        const r = await api('POST', '/api/social-publisher/rewrite', {
          content: original,
          platform: data.platform,
          tone: 'engaging',
          length: 'similar',
        });
        if (r.ok && r.data?.rewritten) {
          ta.value = r.data.rewritten;
          notify('重写完成', 'success');
        } else {
          notify(`重写失败: ${r.data?.error || r.status}`, 'error');
        }
      } catch (e) {
        notify(`重写异常: ${e.message}`, 'error');
      } finally {
        ta.disabled = false;
        btn.textContent = '🔄 一键重写';
      }
    });

    _byId('sp-modal-approve')?.addEventListener('click', () => {
      clearInterval(timer);
      const edited = _byId('sp-modal-content')?.value;
      modal.remove();
      // v0.118 PR 5-4: 把编辑过的内容传回去（edit 决策）
      respondApproval(data.approval_id, 'edit', { edited_content: edited });
    });
    _byId('sp-modal-reject')?.addEventListener('click', () => {
      clearInterval(timer);
      modal.remove();
      respondApproval(data.approval_id, 'reject');
    });
    _byId('sp-modal-cancel')?.addEventListener('click', () => {
      clearInterval(timer);
      modal.remove();
      respondApproval(data.approval_id, 'cancel');
    });

    // 切到审批 tab
    switchTab('approval');
  }

  // === Tab 切换 ===
  function switchTab(tabName) {
    currentTab = tabName;
    const tabs = (wRef?.$c || document).querySelectorAll('.sp-tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    const panes = (wRef?.$c || document).querySelectorAll('.sp-pane');
    panes.forEach(p => p.classList.toggle('active', p.id === `sp-pane-${tabName}`));

    // 切换时加载对应数据
    const loaders = {
      accounts: loadAccounts,
      compose: () => {},
      schedule: loadSchedule,
      queue: loadQueue,
      approval: loadApproval,
      history: loadHistory,
      screenshots: loadScreenshots,
      monitor: loadMonitor,  // v0.118 PR 5-6
      settings: loadSettings,
    };
    if (loaders[tabName]) loaders[tabName]();
  }

  // === 平台筛选 ===
  function bindPlatformFilter() {
    const sel = _byId('sp-platform-select');
    if (!sel) return;
    const handler = () => {
      currentPlatform = sel.value;
      // 刷新当前 tab
      switchTab(currentTab);
      loadDrawer();
    };
    sel.addEventListener('change', handler);
    cleanupFns.push(() => sel.removeEventListener('change', handler));
  }

  // === 抽屉切换 ===
  function bindDrawerToggle() {
    const btn = _byId('sp-drawer-toggle');
    const drawer = _byId('sp-drawer');
    if (!btn || !drawer) return;
    const handler = () => drawer.classList.toggle('collapsed');
    btn.addEventListener('click', handler);
    cleanupFns.push(() => btn.removeEventListener('click', handler));
  }

  // === 事件绑定 ===
  function bindEvents() {
    // Tab 切换
    const tabs = (wRef?.$c || document).querySelectorAll('.sp-tab');
    tabs.forEach(tab => {
      const handler = () => switchTab(tab.dataset.tab);
      tab.addEventListener('click', handler);
      cleanupFns.push(() => tab.removeEventListener('click', handler));
    });

    // 刷新按钮
    const refreshBtn = _byId('sp-refresh-btn');
    if (refreshBtn) {
      const handler = () => {
        switchTab(currentTab);
        loadDrawer();
      };
      refreshBtn.addEventListener('click', handler);
      cleanupFns.push(() => refreshBtn.removeEventListener('click', handler));
    }

    // 账号管理
    const addBtn = _byId('sp-add-account-btn');
    if (addBtn) {
      addBtn.addEventListener('click', addAccount);
      cleanupFns.push(() => addBtn.removeEventListener('click', addAccount));
    }

    // 内容编辑
    const rewriteBtn = _byId('sp-compose-rewrite');
    if (rewriteBtn) {
      rewriteBtn.addEventListener('click', composeRewrite);
      cleanupFns.push(() => rewriteBtn.removeEventListener('click', composeRewrite));
    }
    const publishBtn = _byId('sp-compose-publish');
    if (publishBtn) {
      publishBtn.addEventListener('click', composePublish);
      cleanupFns.push(() => publishBtn.removeEventListener('click', composePublish));
    }
    // v0.118.x: 🤖 AI 发布按钮（goal-driven 模式）
    const aiPublishBtn = _byId('sp-compose-ai-publish');
    if (aiPublishBtn) {
      aiPublishBtn.addEventListener('click', aiPublish);
      cleanupFns.push(() => aiPublishBtn.removeEventListener('click', aiPublish));
    }
    // AI modal 关闭按钮：点 X 只软关（任务继续），再次点击 ✕ 彻底取消
    let _aiCloseConfirm = false;
    const aiClose = _byId('sp-ai-close');
    if (aiClose) {
      const closeHandler = () => {
        if (_aiEventSource && !_aiCloseConfirm) {
          // 第一次点 X：软关（modal 隐藏，SSE 继续，waiting_user 来会 reopen）
          closeAiModal();
          _aiCloseConfirm = true;
          aiClose.textContent = '✕ 取消任务';
          aiClose.title = '再点一次彻底关闭（放弃后台任务）';
          notify('已隐藏 modal — 任务继续在后台，LLM 求助时会自动弹回', 'info', 5000);
        } else {
          // 第二次点 X：硬关
          forceCloseAiModal();
          _aiCloseConfirm = false;
          aiClose.textContent = '✕';
          aiClose.title = '关闭（任务继续在后台跑）';
          notify('任务已取消', 'warn');
        }
      };
      aiClose.addEventListener('click', closeHandler);
      cleanupFns.push(() => aiClose.removeEventListener('click', closeHandler));
    }
    // v0.118.16: 💬 介入 —— 人主动发起求助（Agent 暂停等人工输入）
    const aiInterruptBtn = _byId('sp-ai-interrupt');
    if (aiInterruptBtn) {
      aiInterruptBtn.addEventListener('click', requestAiInterrupt);
      cleanupFns.push(() => aiInterruptBtn.removeEventListener('click', requestAiInterrupt));
    }
    // v0.118.18: 常驻输入条 —— 发送按钮 + Enter 快捷键（Shift+Enter 换行）
    const aiSendBtn = _byId('sp-ai-input-send');
    if (aiSendBtn) {
      aiSendBtn.addEventListener('click', aiSendFromBar);
      cleanupFns.push(() => aiSendBtn.removeEventListener('click', aiSendFromBar));
    }
    const aiInputEl = _byId('sp-ai-input');
    if (aiInputEl) {
      const keyHandler = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          aiSendFromBar();
        }
      };
      aiInputEl.addEventListener('keydown', keyHandler);
      cleanupFns.push(() => aiInputEl.removeEventListener('keydown', keyHandler));
      // 高度自适应（1-4 行）
      aiInputEl.addEventListener('input', () => {
        aiInputEl.style.height = 'auto';
        aiInputEl.style.height = Math.min(aiInputEl.scrollHeight, 90) + 'px';
      });
    }
    document.querySelectorAll('#sp-ai-waiting-options [data-reply]').forEach(btn => {
      const handler = () => sendAiReply(btn.dataset.reply);
      btn.addEventListener('click', handler);
      cleanupFns.push(() => btn.removeEventListener('click', handler));
    });

    // 队列
    const clearBtn = _byId('sp-queue-clear-done');
    if (clearBtn) {
      clearBtn.addEventListener('click', clearDone);
      cleanupFns.push(() => clearBtn.removeEventListener('click', clearDone));
    }

    // 监控（v0.118 PR 5-6）
    const monitorRunBtn = _byId('sp-monitor-run');
    if (monitorRunBtn) {
      const handler = async () => {
        monitorRunBtn.disabled = true;
        monitorRunBtn.textContent = '⏳ 检查中...';
        try {
          await api('POST', '/api/social-publisher/monitor/run-check');
          await loadMonitor();
          notify('健康检查已运行', 'success');
        } finally {
          monitorRunBtn.disabled = false;
          monitorRunBtn.textContent = '🔍 立即检查';
        }
      };
      monitorRunBtn.addEventListener('click', handler);
      cleanupFns.push(() => monitorRunBtn.removeEventListener('click', handler));
    }

    // 抽屉快速操作
    const quickPub = _byId('sp-quick-publish');
    if (quickPub) {
      quickPub.addEventListener('click', () => {
        switchTab('compose');
        notify('切换到编辑 tab，勾选所有平台后点"发布"', 'info');
      });
      cleanupFns.push(() => quickPub.removeEventListener('click', quickPub.onclick));
    }
    const quickRew = _byId('sp-quick-rewrite');
    if (quickRew) {
      quickRew.addEventListener('click', () => {
        switchTab('compose');
        setTimeout(composeRewrite, 200);
      });
      cleanupFns.push(() => quickRew.removeEventListener('click', quickRew.onclick));
    }

    // 平台筛选
    bindPlatformFilter();

    // 抽屉切换
    bindDrawerToggle();

    // PR H: 富文本编辑增强（每次加载视图时重新绑定，因为 DOM 是重新渲染的）
    bindRichEditorEnhancements();
  }

  // === PR H: 富文本编辑器增强（图片粘贴 + 拖拽调整位置）===
  function bindRichEditorEnhancements() {
    const editor = _byId('sp-compose-content');
    if (!editor) return;

    // PR H: contenteditable 空状态管理（placeholder + 初始内容）
    function updateEditorEmptyState() {
      // 保持至少一个 <br> 以确保光标可见（避免完全空时无法聚焦）
      if (!editor.innerHTML || editor.innerHTML.trim() === '') {
        editor.innerHTML = '<br>';
      }
    }
    editor.addEventListener('focus', function () {
      if (!editor.innerHTML || editor.innerHTML.trim() === '<br>' || editor.innerHTML.trim() === '') {
        // 保持空时可编辑
      }
    });
    editor.addEventListener('blur', function () {
      if (!editor.innerHTML || editor.innerHTML.trim() === '<br>' || editor.innerHTML.trim() === '') {
        editor.innerHTML = '<br>';
      }
    });
    // 初始化：确保有可编辑内容（避免完全空导致光标无法显示）
    if (!editor.innerHTML || editor.innerHTML.trim() === '') {
      editor.innerHTML = '<br>';
    }

    // 1. 图片粘贴（clipboard paste → base64 内嵌）
    editor.addEventListener('paste', function (event) {
      var clipboardData = event.clipboardData || event.originalEvent && event.originalEvent.clipboardData;
      if (!clipboardData) return;
      var items = clipboardData.items || clipboardData.files;
      var hasImage = false;
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.type && item.type.indexOf('image') >= 0) {
          hasImage = true;
          var blob = item.getAsFile ? item.getAsFile() : item;
          if (blob) {
            var reader = new FileReader();
            reader.onload = function (e) {
              var imgSrc = e.target.result;
              var sel = window.getSelection ? window.getSelection() : null;
              if (sel && sel.rangeCount) {
                var range = sel.getRangeAt(0);
                range.deleteContents();
                var img = document.createElement('img');
                img.src = imgSrc;
                img.style.maxWidth = '100%';
                img.style.height = 'auto';
                img.style.borderRadius = '4px';
                img.style.cursor = 'grab';
                img.setAttribute('draggable', 'false'); // 避免浏览器原生拖拽干扰
                range.insertNode(img);
                range.setStartAfter(img);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
              } else {
                editor.innerHTML += '<img src="' + imgSrc + '" style="max-width:100%;height:auto;border-radius:4px;cursor:grab;" draggable="false">';
              }
            };
            reader.readAsDataURL(blob);
          }
        }
      }
      if (hasImage) event.preventDefault();
    });

    // 2. 图片拖拽调整位置（在编辑区域内拖动图片到不同位置）
    //    使用 HTML5 drag & drop：图片可拖拽到编辑区域内任意位置
    editor.addEventListener('dragstart', function (event) {
      var target = event.target;
      if (target && target.tagName === 'IMG') {
        event.dataTransfer.setData('text/html', target.outerHTML);
        event.dataTransfer.setData('text/plain', target.getAttribute('src') || '');
        event.dataTransfer.setData('sp-img-src', target.getAttribute('src') || ''); // PR H: 记录原图 src，drop 时删除重复
        event.dataTransfer.effectAllowed = 'move';
        target.classList.add('sp-img-dragging');
      }
    });

    editor.addEventListener('dragend', function (event) {
      if (event.target && event.target.classList) {
        event.target.classList.remove('sp-img-dragging');
      }
      // 移除拖拽占位提示
      var placeholder = editor.querySelector('.sp-image-drop-placeholder');
      if (placeholder) placeholder.remove();
    });

    editor.addEventListener('dragover', function (event) {
      if (event.dataTransfer && (event.dataTransfer.types.indexOf('text/html') >= 0 || event.dataTransfer.types.indexOf('text/plain') >= 0)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        editor.classList.add('sp-drop-active');
        // 在鼠标位置插入占位提示（可选视觉反馈）
        if (!editor.querySelector('.sp-image-drop-placeholder')) {
          var placeholder = document.createElement('div');
          placeholder.className = 'sp-image-drop-placeholder';
          placeholder.textContent = '松开以调整图片位置';
          // 不实际插入到 DOM（避免干扰内容），仅通过高亮提示
        }
      }
    });

    editor.addEventListener('dragleave', function (event) {
      if (!event.relatedTarget || !editor.contains(event.relatedTarget)) {
        editor.classList.remove('sp-drop-active');
      }
    });

    editor.addEventListener('drop', function (event) {
      event.preventDefault();
      editor.classList.remove('sp-drop-active');
      var htmlData = event.dataTransfer.getData('text/html');
      var srcData = event.dataTransfer.getData('text/plain');
      // 处理图片拖拽（从内容内部或外部拖入）
      if (htmlData && htmlData.indexOf('<img') >= 0) {
        // 内部拖拽：先删除原图片，再在光标位置插入
        if (event.dataTransfer.getData('sp-img-src')) {
          var originalSrc = event.dataTransfer.getData('sp-img-src');
          // 删除所有与原 src 匹配的图片（避免重复）
          var existingImgs = editor.querySelectorAll('img');
          for (var k = 0; k < existingImgs.length; k++) {
            if (existingImgs[k].getAttribute('src') === originalSrc) {
              existingImgs[k].parentNode.removeChild(existingImgs[k]);
            }
          }
        }
        // 在光标位置插入拖拽的图片 HTML
        var range = document.createRange ? document.caretRangeFromPoint ? document.caretRangeFromPoint(event.clientX, event.clientY) : null : null;
        if (!range && window.getSelection && window.getSelection().rangeCount) {
          range = window.getSelection().getRangeAt(0);
        }
        if (range && range.insertNode) {
          var tempDiv = document.createElement('div');
          tempDiv.innerHTML = htmlData;
          var nodes = Array.from(tempDiv.childNodes);
          nodes.forEach(function (node) {
            if (node.nodeType === 1 && node.tagName === 'IMG') {
              node.style.cursor = 'grab';
              node.setAttribute('draggable', 'false');
            }
            range.insertNode(node);
          });
        } else {
          // 无光标范围时直接追加
          editor.innerHTML += htmlData;
        }
      } else if (srcData && srcData.indexOf('data:image/') === 0 || srcData.indexOf('http') === 0) {
        // 外部拖入图片源（纯 URL 或 data URL）
        var img = document.createElement('img');
        img.src = srcData;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.borderRadius = '4px';
        img.style.cursor = 'grab';
        img.setAttribute('draggable', 'false');
        var range2 = document.createRange ? document.caretRangeFromPoint ? document.caretRangeFromPoint(event.clientX, event.clientY) : null : null;
        if (!range2 && window.getSelection && window.getSelection().rangeCount) {
          range2 = window.getSelection().getRangeAt(0);
        }
        if (range2 && range2.insertNode) {
          range2.insertNode(img);
        } else {
          editor.appendChild(img);
        }
      }
    });
  }

  // === Loader ===
  function loader(w, opts) {
    cleanupFns.forEach(fn => { try { fn(); } catch (_) {} });
    cleanupFns = [];
    wRef = w;
    // v0.118 PR 6: 从 Word 导入的预填数据（rich_content + title + stats）
    //   window-manager.js:345 调 loader(w, opts)，opts 含 prefill
    const prefill = (opts && opts.prefill) || null;
    if (prefill) {
      // 存到全局，方便 compose tab 切换时填表
      window.__spPrefill = prefill;
      console.log('[sp-loader] prefill:', prefill.stats || {}, 'title:', prefill.title);
    }

    if (!document.getElementById('sp-css')) {
      const link = document.createElement('link');
      link.id = 'sp-css';
      link.rel = 'stylesheet';
      link.href = `/client/css/social-publisher.css?v=${VERSION}`;
      document.head.appendChild(link);
    }

    fetch(`/client/views/social-publisher.html?v=${VERSION}`)
      .then(r => r.text())
      .then(html => {
        if (w.$c) w.$c.innerHTML = html;
        bindEvents();
        loadAccounts().then(() => {
          // 账号加载完成后立即刷新内容编辑的账号选择（确保用户看到最新账号）
          updateComposeAccountSelector();
        });
        loadDrawer();
        startApprovalSSE();
        setStatus(`就绪 — v${VERSION} PR 3`, 'success');
        // v0.118 PR 6: 如果有 prefill，激活 compose tab 并填字段
        if (prefill && prefill.rich_content && Array.isArray(prefill.rich_content)) {
          setTimeout(() => applyPrefill(prefill), 100);
        }
      })
      .catch(e => {
        if (w.$c) w.$c.innerHTML = `<div style="padding:20px;color:#f55">加载失败: ${esc(e.message)}</div>`;
        setStatus('加载失败', 'error');
      });
  }

  // === 注册 ===
  if (window.ACMS && typeof window.ACMS.registerPackage === 'function') {
    ACMS.registerPackage(VIEW_NAME, {
      title: '内容运营平台',
      icon: '📱',
      category: '内容',
      defaultSize: { w: 1200, h: 800 },
      loader: loader,
    });
  } else if (typeof ACMSWin !== 'undefined' && ACMSWin.registerViewLoader) {
    ACMSWin.registerViewLoader(VIEW_NAME, loader);
  }

  // 暴露给全局（onclick 用）
  window.SPView = {
    checkHealth,
    removeAccount,
    loginAccount,  // v0.118.1: agent-browser auth login
    respondApproval,
    claimTask,
    cancelSchedule,
    deleteTask,
    showTaskDetail,  // v0.118.5: 任务详情弹窗（metadata + content + steps + error）
    deleteScreenshot,  // v0.118.2: 截图回看单条删除
    deleteScreenshotsByTask,  // v0.118.2: 截图回看整批删除
    viewScreenshot,  // v0.118.x: 截图回看点击看大图（lightbox）
    refresh: () => { switchTab(currentTab); loadDrawer(); },
  };
})();
