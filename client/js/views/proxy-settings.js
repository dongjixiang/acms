// ACMS · 代理设置前端（v0.XX Phase 1）
//
// UI 嵌入 admin.js 高级 tab（#proxy-settings-card 容器），
// 全局函数：loadProxySettings() / saveProxyConfig() / testProxyUrl() / addProxyRule() / removeProxyRule()
//          addSSLBypass() / removeSSLBypass() / resetProxy()
//
// 与后端 /api/proxy-settings 交互（routes/proxy-settings.js）

(function () {
  'use strict';

  // ── 当前内存里的配置（避免反复 GET）────────────────────────────────

  let currentConfig = {
    enabled: false,
    default: '',
    rules: [],
    bypassLocal: true,
    sslBypass: [],
    respectEnv: true,
  };

  function escHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── 卡片 HTML 渲染 ──────────────────────────────────────────────

  function renderCard() {
    const c = currentConfig;
    const enabled = c.enabled;
    const rulesHtml = (c.rules && c.rules.length)
      ? c.rules.map((r, idx) => `
        <div class="proxy-rule-row" style="display:flex;gap:6px;margin-top:6px;align-items:center">
          <input type="text" data-key="match" data-idx="${idx}" value="${escHtml(r.match)}"
            style="flex:1;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px"
            placeholder="*.openai.com">
          <span style="color:var(--text2)">→</span>
          <input type="text" data-key="via" data-idx="${idx}" value="${escHtml(r.via || '')}"
            style="flex:1;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px"
            placeholder="http://proxy:8080（留空=直连）">
          <button class="btn-small btn-reject" data-rule-remove="${idx}">✕</button>
        </div>
      `).join('')
      : '<div style="color:var(--text2);font-size:12px;margin-top:6px">（暂无规则）</div>';

    const sslHtml = (c.sslBypass && c.sslBypass.length)
      ? c.sslBypass.map((h, idx) => `
        <span class="proxy-ssl-chip" style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;margin:2px;background:var(--bg);border:1px solid var(--border);border-radius:12px;font-size:11px">
          ${escHtml(h)}
          <button data-ssl-remove="${idx}" style="background:none;border:none;color:var(--text2);cursor:pointer;font-size:14px;padding:0 2px">×</button>
        </span>
      `).join('')
      : '';

    return `
      <div class="config-row" style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px">
        <div style="width:100%">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong>🌐 网络代理</strong>
              <div style="font-size:11px;margin-top:3px;color:var(--text2)">
                全局出站 HTTP 代理（LLM / 图像生成 / 视频 / URL 抓取 等）。
                支持按域名规则 + 兜底代理。保存到 <code>config.json</code>，立即生效无需重启。
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
              <span id="proxy-status-label" style="font-size:13px;color:${enabled ? 'var(--green)' : 'var(--text2)'}">${enabled ? '已启用' : '已禁用'}</span>
              <label style="position:relative;display:inline-block;width:42px;height:22px;cursor:pointer">
                <input type="checkbox" id="proxy-enabled-toggle" ${enabled ? 'checked' : ''} onchange="window.__proxyOnToggle(this)" style="opacity:0;width:0;height:0">
                <span id="proxy-knob-track" style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${enabled ? 'var(--green)' : 'var(--border)'};border-radius:22px;transition:0.2s"></span>
                <span id="proxy-knob" style="position:absolute;cursor:pointer;height:18px;width:18px;left:${enabled ? '22px' : '2px'};top:2px;background:#fff;border-radius:50%;transition:0.2s"></span>
              </label>
            </div>
          </div>

          <!-- 默认代理 + 行为开关 -->
          <div style="margin-top:12px;display:grid;grid-template-columns:1fr;gap:8px">
            <div>
              <div style="font-size:12px;color:var(--text2);margin-bottom:4px">兜底代理（没匹配到规则的 URL 走这里，留空=直连）</div>
              <input type="text" id="proxy-default" value="${escHtml(c.default || '')}" placeholder="http://127.0.0.1:7890"
                style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px">
            </div>
            <div style="display:flex;gap:18px;font-size:12px;color:var(--text2)">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                <input type="checkbox" id="proxy-bypass-local" ${c.bypassLocal !== false ? 'checked' : ''}> ✅ 绕过本地（127/10/192.168/172.16-31）
              </label>
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                <input type="checkbox" id="proxy-respect-env" ${c.respectEnv !== false ? 'checked' : ''}> 🌍 启动时读 <code>HTTPS_PROXY</code> 环境变量
              </label>
            </div>
          </div>

          <!-- URL 规则列表 -->
          <div style="margin-top:14px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div style="font-size:12px;color:var(--text2)">规则（按声明顺序匹配，第一条命中即生效；via 留空=强制直连）</div>
              <button class="btn-small btn-primary" onclick="addProxyRule()">➕ 添加规则</button>
            </div>
            <div id="proxy-rules-list" style="margin-top:6px">${rulesHtml}</div>
          </div>

          <!-- SSL Bypass -->
          <div style="margin-top:14px">
            <div style="font-size:12px;color:var(--text2);margin-bottom:4px">SSL Bypass（自签证书主机名白名单，TLS verify=false）</div>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="text" id="proxy-ssl-input" placeholder="self-signed.local 或 *.internal"
                style="flex:1;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px">
              <button class="btn-small btn-primary" onclick="addSSLBypass()">➕</button>
            </div>
            <div id="proxy-ssl-chips" style="margin-top:4px">${sslHtml}</div>
          </div>

          <!-- 测试连接 -->
          <div style="margin-top:14px;display:flex;gap:8px;align-items:center;padding-top:10px;border-top:1px dashed var(--border)">
            <input type="text" id="proxy-test-url" value="https://api.openai.com/v1/models" placeholder="https://example.com"
              style="flex:1;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px">
            <button class="btn-small" onclick="testProxyUrl(false)">🧪 测试当前配置</button>
            <button class="btn-small" onclick="testProxyUrl(true)">🧪 强制直连测试</button>
          </div>
          <div id="proxy-test-result" style="margin-top:8px;font-size:12px;color:var(--text2);white-space:pre-wrap;word-break:break-word;max-height:200px;overflow:auto"></div>

          <!-- 操作按钮 -->
          <div style="margin-top:14px;display:flex;gap:8px">
            <button class="btn-small btn-primary" onclick="saveProxyConfig()">💾 保存到 config.json</button>
            <button class="btn-small btn-reject" onclick="resetProxy()">🗑 重置为默认</button>
          </div>
        </div>
      </div>
    `;
  }

  // ── 卡片挂载 + 加载 ───────────────────────────────────────────────

  async function loadProxySettings() {
    const cardEl = document.getElementById('proxy-settings-card');
    if (!cardEl) return;  // 当前 admin tab 不可见时不渲染
    try {
      const r = await api('GET', '/proxy-settings');
      if (r && r.config) currentConfig = r.config;
    } catch (e) {
      console.warn('[proxy-settings] load failed:', e.message);
    }
    cardEl.innerHTML = renderCard();
    // 绑定子元素（用 delegation，rule 行重复渲染也得有）
    bindCardEvents();
  }

  function bindCardEvents() {
    // 等所有 row render 完后挂上去
    const cardEl = document.getElementById('proxy-settings-card');
    if (!cardEl) return;

    cardEl.querySelectorAll('[data-rule-remove]').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.getAttribute('data-rule-remove'), 10);
        removeProxyRule(idx);
      };
    });
    cardEl.querySelectorAll('[data-ssl-remove]').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.getAttribute('data-ssl-remove'), 10);
        removeSSLBypass(idx);
      };
    });
    // rule match/via 输入实时更新本地 config
    cardEl.querySelectorAll('.proxy-rule-row input').forEach(input => {
      input.oninput = () => {
        const idx = parseInt(input.getAttribute('data-idx'), 10);
        const key = input.getAttribute('data-key');
        if (!currentConfig.rules[idx]) return;
        currentConfig.rules[idx][key] = input.value;
      };
    });
  }

  // ── 全局交互（挂到 window 上以供 inline onclick 调用）─────────────

  window.__proxyOnToggle = function (cb) {
    currentConfig.enabled = cb.checked;
    const lbl = document.getElementById('proxy-status-label');
    const knob = document.getElementById('proxy-knob');
    const track = document.getElementById('proxy-knob-track');
    if (lbl) { lbl.textContent = cb.checked ? '已启用' : '已禁用'; lbl.style.color = cb.checked ? 'var(--green)' : 'var(--text2)'; }
    if (knob) knob.style.left = cb.checked ? '22px' : '2px';
    if (track) track.style.background = cb.checked ? 'var(--green)' : 'var(--border)';
  };

  window.addProxyRule = function () {
    currentConfig.rules = currentConfig.rules || [];
    currentConfig.rules.push({ match: '', via: '' });
    const cardEl = document.getElementById('proxy-settings-card');
    if (cardEl) { cardEl.innerHTML = renderCard(); bindCardEvents(); }
  };

  window.removeProxyRule = function (idx) {
    if (!currentConfig.rules || !currentConfig.rules[idx]) return;
    currentConfig.rules.splice(idx, 1);
    const cardEl = document.getElementById('proxy-settings-card');
    if (cardEl) { cardEl.innerHTML = renderCard(); bindCardEvents(); }
  };

  window.addSSLBypass = function () {
    const input = document.getElementById('proxy-ssl-input');
    if (!input) return;
    const v = input.value.trim();
    if (!v) return toast('请输入主机名', 'error');
    currentConfig.sslBypass = currentConfig.sslBypass || [];
    if (!currentConfig.sslBypass.includes(v)) currentConfig.sslBypass.push(v);
    input.value = '';
    const cardEl = document.getElementById('proxy-settings-card');
    if (cardEl) { cardEl.innerHTML = renderCard(); bindCardEvents(); }
  };

  window.removeSSLBypass = function (idx) {
    if (!currentConfig.sslBypass || !currentConfig.sslBypass[idx]) return;
    currentConfig.sslBypass.splice(idx, 1);
    const cardEl = document.getElementById('proxy-settings-card');
    if (cardEl) { cardEl.innerHTML = renderCard(); bindCardEvents(); }
  };

  window.saveProxyConfig = async function () {
    // 收集当前 UI 值
    const defInput = document.getElementById('proxy-default');
    const bypassLocal = document.getElementById('proxy-bypass-local');
    const respectEnv = document.getElementById('proxy-respect-env');
    const cfg = {
      enabled: !!(document.getElementById('proxy-enabled-toggle') || {}).checked,
      default: defInput ? defInput.value.trim() : '',
      rules: (currentConfig.rules || []).filter(r => r.match && r.match.length > 0),
      bypassLocal: bypassLocal ? bypassLocal.checked : true,
      sslBypass: currentConfig.sslBypass || [],
      respectEnv: respectEnv ? respectEnv.checked : true,
    };
    try {
      const r = await api('PUT', '/proxy-settings', cfg);
      if (r && r.error) return toast('保存失败: ' + (r.message || r.error), 'error');
      currentConfig = r.config || cfg;
      toast('✅ 代理设置已保存，立即生效', 'success');
    } catch (e) {
      toast('保存失败: ' + e.message, 'error');
    }
  };

  window.testProxyUrl = async function (forceDirect) {
    const urlInput = document.getElementById('proxy-test-url');
    const resultEl = document.getElementById('proxy-test-result');
    if (!urlInput || !resultEl) return;
    const url = urlInput.value.trim();
    if (!url) return toast('请输入测试 URL', 'error');
    resultEl.textContent = '测试中...';
    try {
      const r = await api('POST', '/proxy-settings/test', { url, forceDirect });
      resultEl.textContent = JSON.stringify(r, null, 2);
    } catch (e) {
      resultEl.textContent = '测试失败: ' + e.message;
    }
  };

  window.resetProxy = async function () {
    if (!(await showConfirm('确认重置所有代理设置？将清空规则 + 默认值，恢复为 config.json 默认配置。'))) return;
    try {
      const r = await api('DELETE', '/proxy-settings');
      if (r && r.config) currentConfig = r.config;
      const cardEl = document.getElementById('proxy-settings-card');
      if (cardEl) { cardEl.innerHTML = renderCard(); bindCardEvents(); }
      toast('已重置为默认', 'success');
    } catch (e) {
      toast('重置失败: ' + e.message, 'error');
    }
  };

  // ── 挂入 admin.js 渲染流程：每次 admin 渲染后调一次 ──────────────
  //
  // 视图切到 admin 后，「高级」tab 的 .tab-content 会被填充一次；
  // loadAdminPage 里我们在初始化后调一次 loadProxySettings 来 hydrate 卡片。
  if (typeof window !== 'undefined') {
    window.loadProxySettings = loadProxySettings;
  }
})();
