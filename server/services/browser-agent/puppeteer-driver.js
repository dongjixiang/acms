// ACMS 浏览器智能体 — Puppeteer driver（v0.119）
// ============================================================
// Web机器人「远程预览」模式专用执行层：agent 的 web_* 动作直接驱动
// app-runtime 的稳定 Puppeteer 会话 —— 与用户实时观看的是**同一个浏览器**，
// 人可随时上手（app-runtime input 双向控制），agent 下一轮操作自然感知。
//
// 接口对齐 browser-agent/index.js（CLI ba.*），第一个参数统一 appSessionId：
//   open(sessionId, url) / snapshot(sessionId) / click(sessionId, selector)
//   typeText(sessionId, selector, text) / press(sessionId, key)
//   readText(sessionId) / evalJs(sessionId, expr) / find(sessionId, locator, value, action)
//   screenshotToFile(sessionId, path) / pageInfo(sessionId)
//
// snapshot 格式与 CLI 引擎对齐（LLM prompt 不变）：可交互元素带 [ref=eN]，
// web_click / web_type 用 '@eN' 引用。ref = 收集器顺序下标（1-based）。
// 收集器在点击时**重新执行**（取最新 rect），避免 snapshot 后页面滚动/位移点错。

const appRuntime = require('../app-runtime');

// 可交互元素收集器脚本（页面上下文执行，返回数组）
// 每项: { tag, text, ph, type, href, role, kind, rect:{x,y,w,h} }
function collectorScript() {
  return `(() => {
    const SEL = [
      'a[href]', 'button', 'input', 'textarea', 'select', 'summary',
      '[role="button"]', '[role="link"]', '[role="textbox"]', '[role="searchbox"]',
      '[role="checkbox"]', '[role="radio"]', '[role="tab"]', '[role="menuitem"]',
      '[contenteditable="true"]', '[contenteditable=""]', 'label'
    ];
    const els = [];
    document.querySelectorAll(SEL.join(',')).forEach((el) => {
      if (els.indexOf(el) !== -1) return;
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'label') return; // label 只做 input 的文案提示，不单独可点
      const r = el.getBoundingClientRect();
      if (!r || r.width < 2 || r.height < 2) return;
      if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return;
      if (el.disabled || el.getAttribute('aria-hidden') === 'true') return;
      const item = { tag, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        item.kind = 'input';
        item.type = el.type || '';
        item.ph = el.placeholder || '';
        item.val = (el.value || '').toString().slice(0, 60);
        let labelText = '';
        if (el.id) {
          const lb = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
          if (lb) labelText = (lb.innerText || '').trim().slice(0, 60);
        }
        item.text = labelText || item.ph || item.val || el.name || '';
      } else {
        item.text = (el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
        if (tag === 'a') item.href = (el.getAttribute('href') || '').slice(0, 120);
        item.kind = el.getAttribute('role') || tag;
      }
      els.push(item);
    });
    return { url: location.href, title: document.title, items: els.slice(0, 80) };
  })()`;
}

// 找元素脚本：kind ∈ text/placeholder/label/title/alt/testid/href/role
function findScript(value) {
  const v = String(value || '').toLowerCase();
  return `(() => {
    const SEL = ['a[href]','button','input','textarea','select','[role="button"]','[role="link"]','[role="textbox"]','[role="searchbox"]','[role="checkbox"]','[role="radio"]','[role="tab"]','[role="menuitem"]','[contenteditable="true"]','[contenteditable=""]'];
    const hits = [];
    document.querySelectorAll(SEL.join(',')).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r || r.width < 2 || r.height < 2) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return;
      const texts = [
        (el.innerText || ''), (el.textContent || ''), (el.getAttribute('aria-label') || ''),
        (el.getAttribute('placeholder') || ''), (el.getAttribute('title') || ''),
        (el.getAttribute('alt') || ''), (el.getAttribute('data-testid') || ''),
        (el.getAttribute('role') || ''), (el.getAttribute('href') || '')
      ].map(t => (t || '').toLowerCase());
      if (texts.some(t => t.indexOf(v) !== -1)) {
        hits.push({ rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } });
      }
    });
    return hits.slice(0, 5);
  })()`;
}

function serialize(v) {
  try { return JSON.parse(JSON.stringify(v)); } catch (e) { return String(v).slice(0, 500); }
}

async function evalSafe(sessionId, code) {
  const r = await appRuntime.evalJs(sessionId, code);
  if (r && r.error) return { ok: false, error: r.error };
  if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'eval 失败' };
  return { ok: true, value: r.result };
}

async function collect(sessionId) {
  const r = await evalSafe(sessionId, collectorScript());
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, value: r.value };
}

// 格式化 snapshot 文本（与 CLI 引擎同款 [ref=eN] 语法，LLM prompt 无需改）
function formatSnapshot(page) {
  const lines = [];
  lines.push(`页面标题: ${page.title || ''}`);
  lines.push(`URL: ${page.url || ''}`);
  const items = page.items || [];
  if (!items.length) {
    lines.push('（未发现可交互元素 —— 页面可能仍在加载，可稍后重试 web_snapshot）');
    return lines.join('\n');
  }
  items.forEach((it, i) => {
    const ref = `@e${i + 1}`;
    const label = it.text ? ` "${it.text}"` : '';
    const extra = [];
    if (it.tag === 'input' || it.tag === 'textarea' || it.tag === 'select') {
      if (it.type) extra.push(`type=${it.type}`);
      if (it.ph) extra.push(`placeholder="${it.ph}"`);
      if (it.val) extra.push(`value="${it.val}"`);
      if (!label && !it.ph && !it.val) extra.push('(空输入框)');
    }
    if (it.href) extra.push(`href=${it.href}`);
    lines.push(`[${ref}] <${it.tag}>${label}${extra.length ? ' ' + extra.join(' ') : ''}`);
  });
  lines.push(`（共 ${items.length} 个可交互元素）`);
  return lines.join('\n');
}

// ── 公开动作 ──

// open: 导航到 URL（about:blank 跳过 —— 会话创建即是空白起步）
async function open(sessionId, url) {
  if (!sessionId) return { ok: false, error: '缺少远程预览会话（appSessionId）' };
  const u = String(url || '').trim();
  if (!u) return { ok: false, error: '缺少 url' };
  if (u === 'about:blank') return { ok: true, url: u, title: '空白页' };
  if (!/^https?:\/\//i.test(u)) {
    const r2 = await evalSafe(sessionId, `(() => { location.href = 'http://${u.replace(/[^a-zA-Z0-9.:/_-]/g, '')}'; return 'nav'; })()`);
    return { ok: r2.ok, url: u, note: r2.ok ? '' : r2.error };
  }
  const r = await appRuntime.input(sessionId, { type: 'navigate', url: u });
  if (r && r.error) return { ok: false, error: r.error };
  const info = await appRuntime.pageInfo(sessionId).catch(() => null);
  return { ok: true, url: (info && info.url) || u, title: (info && info.title) || '' };
}

// snapshot: 无障碍式可交互元素列表（[ref=eN]）
async function snapshot(sessionId) {
  const c = await collect(sessionId);
  if (!c.ok) return { ok: false, error: c.error };
  return { ok: true, output: formatSnapshot(c.value) };
}

async function resolveRect(sessionId, selector) {
  // '@eN' → 收集器最新顺序（1-based）
  const m = /^@e(\d+)$/i.exec(String(selector || '').trim());
  if (m) {
    const idx = parseInt(m[1], 10);
    const c = await collect(sessionId);
    if (!c.ok) return { ok: false, error: c.error };
    const items = (c.value && c.value.items) || [];
    if (!items.length) return { ok: false, error: '页面无可交互元素，请先 web_snapshot' };
    if (idx < 1 || idx > items.length) {
      return { ok: false, error: `ref 越界：@e${idx} 超出当前 ${items.length} 个元素，请重新 web_snapshot` };
    }
    const it = items[idx - 1];
    return { ok: true, x: it.rect.x + Math.floor(it.rect.w / 2), y: it.rect.y + Math.floor(it.rect.h / 2), element: it };
  }
  // CSS 选择器
  const css = String(selector || '').replace(/^css:/i, '').trim();
  if (!css) return { ok: false, error: 'selector 为空' };
  // v0.119.8.4: 检测 Playwright 专属语法 —— LLM 常误用（Puppeteer 不支持，会静默未命中）
  const pw = css.match(/:has-text\(|:text\(|:visible|>>\s*|\bgetByRole\b|\bgetByText\b/i);
  if (pw) {
    return {
      ok: false,
      error: `PLAYWRIGHT_SYNTAX_UNSUPPORTED: "${pw[0]}" 是 Playwright 语法，当前 Puppeteer 引擎不支持（会静默未命中）`,
      hint: '按文本定位请改用 web_find({"locator":"text","value":"<按钮文字>","action":"click"})；或用 web_snapshot 拿 @eN 编号后 web_click({"selector":"@eN"})；纯 CSS 只支持标准选择器（如 button.submit、.article-cover）',
    };
  }
  const r = await evalSafe(sessionId, `(() => {
    try {
      const el = document.querySelector(${JSON.stringify(css)});
      if (!el) return { found: false };
      const r = el.getBoundingClientRect();
      return { found: true, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    } catch (e) { return { found: false, error: String(e.message) }; }
  })()`);
  if (!r.ok) return { ok: false, error: r.error };
  if (!r.value || !r.value.found) {
    // v0.119.8.4: 未命中时给下一步线索（而不是让 LLM 反复猜选择器）
    return {
      ok: false,
      error: `CSS 选择器未命中: ${css}`,
      hint: '该 CSS 选择器当前页面找不到元素。**别继续猜选择器** —— 改用：①web_snapshot 看页面有哪些元素，用 @eN 编号点 ②按可见文字点：web_find({"locator":"text","value":"<文字>"}) ③web_eval 探查真实 class（如 [...document.querySelectorAll("button")].map(b=>b.innerText)）',
    };
  }
  return { ok: true, x: r.value.x, y: r.value.y };
}

// click: '@eN' 或 CSS 选择器 → 真实鼠标点击（React 受控组件也能响应）
async function click(sessionId, selector) {
  const t = await resolveRect(sessionId, selector);
  if (!t.ok) return { ok: false, error: t.error };
  const r = await appRuntime.input(sessionId, { type: 'click', x: t.x, y: t.y });
  if (r && r.error) return { ok: false, error: r.error };
  return { ok: true, clicked: `(${t.x},${t.y})` };
}

// typeText: 先点击聚焦（光标落位），再 Input.insertText 输入（中文/emoji OK）
async function typeText(sessionId, selector, text) {
  const t = await resolveRect(sessionId, selector);
  if (!t.ok) return { ok: false, error: t.error };
  const c = await appRuntime.input(sessionId, { type: 'click', x: t.x, y: t.y });
  if (c && c.error) return { ok: false, error: c.error };
  await new Promise((res) => setTimeout(res, 150));
  // 已有内容先清空（像人 Ctrl+A 后输入）
  const clr = await evalSafe(sessionId, `(() => {
    const el = document.activeElement;
    if (!el) return 'no-active';
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return 'cleared-input';
    }
    if (el.isContentEditable) { el.innerText = ''; return 'cleared-editable'; }
    return 'no-clear';
  })()`).catch(() => ({ ok: false }));
  const t2 = await appRuntime.input(sessionId, { type: 'type', text: String(text) });
  if (t2 && t2.error) return { ok: false, error: t2.error };
  return { ok: true, cleared: (clr && clr.value) || 'n/a' };
}

// press: 按键（Enter/Tab/Escape/ArrowDown…）
async function press(sessionId, key) {
  const k = String(key || '').trim();
  if (!k) return { ok: false, error: '缺少 key' };
  const d = await appRuntime.input(sessionId, { type: 'keydown', code: k });
  if (d && d.error) return { ok: false, error: d.error };
  await appRuntime.input(sessionId, { type: 'keyup', code: k });
  return { ok: true };
}

// ── v0.119.6: fillLogin（PP 模式自动登录）──
// 自动探测登录表单的 用户名 / 密码 输入框 → 逐个聚焦+清空+输入 → Enter 提交 → 等跳转。
// ⚠️ 密码由调用方（web-agent 的 web_auth_login）从 accountStore.getCredentials() 解密后传入；
//    本函数不接触凭据存储，**返回值绝不含密码**（只返回 filled 布尔 + URL）→ LLM context 安全。
async function fillLogin(sessionId, { username, password, timeoutMs = 15000 } = {}) {
  if (!sessionId) return { ok: false, error: '缺少远程预览会话（appSessionId）' };
  if (!username || password === undefined || password === null) return { ok: false, error: '缺少账号或密码（账号可能未保存凭据）' };

  // 1) 探测可见的用户名 / 密码输入框（含坐标）
  const probe = await evalSafe(sessionId, `(() => {
    const all = [...document.querySelectorAll('input')].filter(el => {
      if (el.type === 'hidden' || el.disabled) return false;
      const r = el.getBoundingClientRect();
      if (!r || r.width < 2 || r.height < 2) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    });
    const pass = all.find(el => String(el.type || '').toLowerCase() === 'password');
    const others = all.filter(el => el !== pass);
    const user = others.find(el => /手机|邮箱|帐号|账号|用户名|phone|mail|user|account|login/i.test(
                    (el.placeholder || '') + (el.name || '') + (el.id || '') + (el.getAttribute('aria-label') || '')))
              || others.find(el => /^(text|tel|email)$/i.test(el.type || '') && el.value && el.value.trim())
              || others.find(el => /^(text|tel|email)$/i.test(el.type || ''))
              || others[0];
    const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; };
    return {
      hasUser: !!user, hasPass: !!pass,
      userRect: rect(user), passRect: rect(pass),
      userHint: user ? String(user.placeholder || user.name || user.id || '') : null,
      passHint: pass ? String(pass.placeholder || pass.name || pass.id || '') : null,
      url: location.href,
    };
  })()`);
  if (!probe.ok) return { ok: false, error: '探测登录表单失败: ' + probe.error };
  const info = probe.value || {};
  if (!info.hasPass || !info.passRect) {
    return { ok: false, error: '未找到密码输入框（可能不在登录页 / 页面结构变化）', pageUrl: info.url };
  }

  // 2) 聚焦+清空 辅助（用原型 value setter，React 受控组件也能清）
  const clearActive = async () => {
    await evalSafe(sessionId, `(() => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        const proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return 'cleared';
      }
      return 'no-active';
    })()`).catch(() => ({ ok: false }));
  };

  // 3) 填用户名（如探测到）
  if (info.userRect) {
    await appRuntime.input(sessionId, { type: 'click', x: info.userRect.x, y: info.userRect.y });
    await new Promise((r) => setTimeout(r, 120));
    await clearActive();
    await appRuntime.input(sessionId, { type: 'type', text: String(username) });
    await new Promise((r) => setTimeout(r, 120));
  }

  // 4) 填密码
  await appRuntime.input(sessionId, { type: 'click', x: info.passRect.x, y: info.passRect.y });
  await new Promise((r) => setTimeout(r, 120));
  await clearActive();
  await appRuntime.input(sessionId, { type: 'type', text: String(password) });
  await new Promise((r) => setTimeout(r, 150));

  // 5) 提交（Enter —— 多数登录表单支持；避免点错「注册」按钮）
  await appRuntime.input(sessionId, { type: 'keydown', code: 'Enter' });
  await appRuntime.input(sessionId, { type: 'keyup', code: 'Enter' });

  // 6) 等跳转（URL 变化 = 大概率登录成功）
  const before = info.url;
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await new Promise((r) => setTimeout(r, 1000));
    const pi = await appRuntime.pageInfo(sessionId).catch(() => null);
    if (pi && pi.url && pi.url !== before) break;
  }
  const after = await appRuntime.pageInfo(sessionId).catch(() => null);
  const urlChanged = !!(after && after.url && after.url !== before);
  return {
    ok: true,
    filled: { username: !!info.userRect, password: !!info.passRect },
    userHint: info.userHint,
    passHint: info.passHint,
    urlBefore: before,
    urlAfter: after ? after.url : null,
    urlChanged,
    note: urlChanged
      ? '表单已提交且 URL 已变化（可能登录成功，请 web_snapshot 确认）'
      : '表单已填并提交但 URL 未变（可能需要验证码 / 密码错误 / 登录失败）',
  };
}

// readText: 页面正文（截断 8000）
async function readText(sessionId) {
  const r = await evalSafe(sessionId, `(() => {
    const t = (document.body && document.body.innerText) || '';
    return { title: document.title, url: location.href, text: t.replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, 12000) };
  })()`);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, output: `页面: ${r.value.title}\nURL: ${r.value.url}\n\n${r.value.text.slice(0, 8000)}` };
}

// evalJs: 页面执行 JS（IIFE 写法最稳）
async function evalJs(sessionId, expression) {
  const r = await evalSafe(sessionId, String(expression || ''));
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, output: typeof r.value === 'string' ? r.value : JSON.stringify(r.value) };
}

// find: 按文本/placeholder/role 等语义定位并操作
async function find(sessionId, locator, value, action = 'click') {
  const r = await evalSafe(sessionId, findScript(value));
  if (!r.ok) return { ok: false, error: r.error };
  const hits = (r.value || []).slice(0, 5);
  if (!hits.length) return { ok: false, error: `未找到匹配「${value}」的元素` };
  const it = hits[0];
  const x = it.rect.x + Math.floor(it.rect.w / 2);
  const y = it.rect.y + Math.floor(it.rect.h / 2);
  if (action === 'focus' || action === 'click') {
    const c = await appRuntime.input(sessionId, { type: 'click', x, y });
    if (c && c.error) return { ok: false, error: c.error };
    return { ok: true, matched: hits.length, action: 'click', at: `(${x},${y})` };
  }
  if (action === 'hover') {
    await appRuntime.input(sessionId, { type: 'mousemove', x, y });
    return { ok: true, matched: hits.length, action: 'hover', at: `(${x},${y})` };
  }
  return { ok: false, error: `不支持的 action: ${action}` };
}

// screenshotToFile: 落盘截图（步骤证据）
async function screenshotToFile(sessionId, filePath) {
  return appRuntime.screenshotToFile(sessionId, filePath);
}

async function pageInfo(sessionId) {
  return appRuntime.pageInfo(sessionId);
}

async function authLogin() {
  return { ok: false, error: '远程预览（Puppeteer）引擎不支持 auth login；遇到登录请调 request_user_help（A 我提供账号帮你填 / B 我自己在画面上操作）' };
}

// v0.119.7: web_upload —— 把本地文件上传到当前页面的 input[type=file]
//   接收 file_path（绝对路径，sanitize-content 抽 base64 写临时文件的位置）
//   可选 selector（指定具体 input，不传默认找页面第一个可见的 input[type="file"]）
async function uploadFile(sessionId, { file_path, selector } = {}) {
  if (!sessionId) return { ok: false, error: '缺少远程预览会话（appSessionId）' };
  if (!file_path) return { ok: false, error: '缺少 file_path（绝对路径）' };
  const paths = Array.isArray(file_path) ? file_path : [file_path];
  if (!paths.length) return { ok: false, error: '缺少 file_path（绝对路径）' };
  try {
    const r = await appRuntime.input(sessionId, { type: 'upload', paths, selector: selector || null });
    if (r && r.error) return { ok: false, error: r.error };
    if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'upload 失败' };
    return { ok: true, uploaded: r.uploaded, files: r.files, note: '文件已通过 Puppeteer uploadFile 传给 input[type=file]；如页面有预览/确认步骤用 web_snapshot 看' };
  } catch (e) {
    return { ok: false, error: e.message || 'upload 失败' };
  }
}

// v0.119.8: web_paste —— 读 HTML 文件 → 写剪贴板 → Ctrl+V 粘贴到编辑器
//   用于正文含图的场景（平台富文本管线自动上传图到 CDN，不用 input[type=file]）
async function pasteFile(sessionId, { file_path, selector } = {}) {
  if (!sessionId) return { ok: false, error: '缺少远程预览会话（appSessionId）' };
  if (!file_path) return { ok: false, error: '缺少 file_path（HTML 文件绝对路径）' };
  try {
    const r = await appRuntime.input(sessionId, { type: 'paste', path: file_path, selector: selector || null });
    if (r && r.error) return { ok: false, error: r.error, hint: r.hint };
    if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'paste 失败' };
    const ea = r.editorAfter || {};
    const imgInfo = (typeof ea.imgCount === 'number') ? `，编辑器现有 ${ea.imgCount} 张图` : '';
    return {
      ok: true,
      pasted: true,
      editorAfter: ea,
      note: `已写剪贴板 + Ctrl+V 粘贴（HTML ${r.htmlLen} 字符${imgInfo}）。平台富文本管线会自动把 base64 图片上传到 CDN，稍等 3-5s 后 web_snapshot 确认图片是否出现在编辑器里`,
    };
  } catch (e) {
    return { ok: false, error: e.message || 'paste 失败' };
  }
}

module.exports = {
  open, snapshot, click, typeText, press, readText, evalJs, find,
  screenshotToFile, pageInfo, authLogin, fillLogin, uploadFile, pasteFile,
};
