// ACMS · 代理设置前端（v0.76 简化版）
//
// UI 嵌入 admin.js 高级 tab（#proxy-settings-card 容器）
// 与后端 /api/proxy-settings 交互

(function () {
  'use strict';

  let currentEnabled = false;
  let currentDefault = '';

  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function parseProxyUrl(url) {
    if (!url) return { type: 'http', host: '', port: '5418' };
    try {
      const u = new URL(url);
      return {
        type: u.protocol.replace(':', '') || 'http',
        host: u.hostname || '',
        port: u.port || (u.protocol === 'https:' ? '443' : '80'),
      };
    } catch { return { type: 'http', host: url, port: '5418' }; }
  }

  function buildProxyUrl(type, host, port) {
    if (!host) return '';
    return type + '://' + host + ':' + port;
  }

  // ── 渲染 ──
  function renderCard() {
    const p = parseProxyUrl(currentDefault);
    const onCls = currentEnabled ? 'proxy-on' : 'proxy-off';

    return `
      <div class="config-row" style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px">
        <div style="width:100%">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <div>
              <strong style="font-size:15px">🌐 代理</strong>
              <div style="font-size:11px;margin-top:2px;color:var(--text2)">
                填写代理地址 → 点击保存 → 浏览器自动走代理
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span id="proxy-status-label" style="font-size:13px;font-weight:500;color:${currentEnabled ? 'var(--green)' : 'var(--text2)'}">${currentEnabled ? '已启用' : '已禁用'}</span>
              <button id="proxy-toggle-btn" class="${onCls}" style="width:42px;height:22px;border-radius:22px;border:none;position:relative;cursor:pointer;background:${currentEnabled ? 'var(--green)' : 'var(--border)'};transition:0.2s;padding:0;outline:none" onclick="window.__proxyToggle()">
                <span style="position:absolute;height:18px;width:18px;left:${currentEnabled ? '22px' : '2px'};top:2px;background:#fff;border-radius:50%;transition:0.2s"></span>
              </button>
            </div>
          </div>

          <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px">
            <select id="proxy-type" style="padding:7px 6px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;width:80px;flex-shrink:0">
              <option value="http" ${p.type === 'http' ? 'selected' : ''}>HTTP</option>
              <option value="https" ${p.type === 'https' ? 'selected' : ''}>HTTPS</option>
              <option value="socks5" ${p.type === 'socks5' ? 'selected' : ''}>SOCKS5</option>
            </select>
            <input type="text" id="proxy-host" value="${escHtml(p.host)}" placeholder="127.0.0.1"
              style="flex:1;padding:7px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;min-width:0">
            <span style="color:var(--text2);font-size:14px;flex-shrink:0">:</span>
            <input type="text" id="proxy-port" value="${escHtml(p.port)}" placeholder="5418"
              style="width:70px;padding:7px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;flex-shrink:0">
          </div>

          <div style="display:flex;gap:8px;align-items:center">
            <button onclick="window.__saveProxy(this)" style="padding:8px 20px;background:var(--accent);color:var(--window-bg);border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500">💾 保存</button>
          </div>
        </div>
      </div>
    `;
  }

  // ── 加载 ──
  async function loadProxySettings() {
    const cards = Array.from(document.querySelectorAll('#proxy-settings-card'));
    if (cards.length === 0) return;
    try {
      const r = await api('GET', '/proxy-settings');
      if (r && r.config) {
        currentEnabled = !!r.config.enabled;
        currentDefault = r.config.default || '';
      }
    } catch (e) {
      console.warn('[proxy] load failed:', e.message);
    }
    cards.forEach(c => { c.innerHTML = renderCard(); });
  }

  // ── 切换开关 ──
  window.__proxyToggle = function () {
    currentEnabled = !currentEnabled;
    const cards = Array.from(document.querySelectorAll('#proxy-settings-card'));
    cards.forEach(c => { c.innerHTML = renderCard(); });
    if (typeof toast === 'function') toast(currentEnabled ? '代理已开启，点保存生效' : '代理已关闭，点保存生效', 'info', 2000);
  };

  // ── 保存 ──
  window.__saveProxy = async function (btn) {
    // 从点击的按钮向上找所属的卡片容器，避免 hidden 模板 ID 冲突
    var card = btn && btn.closest ? btn.closest('#proxy-settings-card') : null;
    if (!card) card = document;
    function val(id) { var el = card.querySelector('#' + id); return el ? el.value : ''; }

    const host = val('proxy-host').trim();
    const port = val('proxy-port').trim();
    const type = val('proxy-type') || 'http';
    const defaultUri = host ? buildProxyUrl(type, host, port || '5418') : '';

    const cfg = {
      enabled: currentEnabled,
      default: defaultUri,
      rules: [],
      bypassLocal: true,
      sslBypass: [],
      respectEnv: false,
      puppeteer: { enabled: true, bypassLocal: true },
    };

    try {
      const r = await api('PUT', '/proxy-settings', cfg);
      if (r && r.error) {
        if (typeof toast === 'function') toast('❌ ' + (r.message || r.error), 'error', 3000);
        return;
      }
      currentEnabled = !!(r && r.config ? r.config.enabled : cfg.enabled);
      currentDefault = (r && r.config ? r.config.default : cfg.default) || '';
      const cards = Array.from(document.querySelectorAll('#proxy-settings-card'));
      cards.forEach(c => { c.innerHTML = renderCard(); });
      if (typeof toast === 'function') toast('✅ 代理设置已保存，' + (currentEnabled ? '已启用' : '已关闭'), 'success', 2500);
    } catch (e) {
      if (typeof toast === 'function') toast('❌ 保存失败: ' + e.message, 'error', 4000);
      console.error('[proxy] save failed:', e);
    }
  };

  // ── 暴露加载函数给 admin.js ──
  if (typeof window !== 'undefined') {
    window.loadProxySettings = loadProxySettings;
  }
})();
