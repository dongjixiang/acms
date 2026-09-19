// 工具函数
function escHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function escAttr(s) { if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
/**
 * v0.118.2: 生成「点击放大播放」的内联 onclick 表达式（剧本分镜头视频 / 视频卡片共用）
 *   背景：卡片里 <video controls> 只有原生控件条上的小 ▶ 可点，点**画面**没反应
 *     → 用户报「视频展示了但无法点击播放」。图片早有 previewImage，视频补 previewVideo(全屏播放)。
 *   参数走 JSON.stringify（JS 层转义，处理引号/反斜杠/换行）+ escAttr（属性层转义，处理 " ）
 *   —— 文件名由 prompt 派生，可能含引号（如 don't），不做两层转义会截断内联 handler → SyntaxError
 */
function videoClickAttr(src, cdnFallback) {
  return 'event.stopPropagation();previewVideo(' +
    escAttr(JSON.stringify(String(src || ''))) + ',' +
    escAttr(JSON.stringify(String(cdnFallback || ''))) + ')';
}
function fmtDate(s) { if (!s) return ''; return new Date(s).toLocaleDateString('zh-CN'); }  // zh-CN OK; date 本身无时区歧义
function safeParse(s) { if (!s) return {}; if (typeof s === 'object') return s; try { return JSON.parse(s); } catch { return {}; } }
function toast(msg, type = 'success', duration = 4000) {
  // v0.118.3: 加第 3 参数 duration（默认 4000ms 保持向后兼容）——之前硬编码 4000ms，
  //   调用方传第 3 参无效 → 「清理按钮」等低频操作的反馈一闪而过被用户误判为「没反应」。
  //   ⚠️ 两个 toast hook（agent-buddy.js / notification-center.js）必须同步透传 duration。
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

/**
 * ACMS 风格确认弹窗 — 替代浏览器 confirm()
 * @param {string} message — 确认消息
 * @param {object} options — { title, confirmText, cancelText, type }
 * @returns {Promise<boolean>}
 */
function showConfirm(message, options = {}) {
  const { title = '确认操作', confirmText = '确认', cancelText = '取消', type = 'danger' } = options;
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-dialog">
        <div class="confirm-icon">${type === 'danger' ? '⚠️' : 'ℹ️'}</div>
        <h3>${escHtml(title)}</h3>
        <p>${escHtml(message)}</p>
        <div class="confirm-actions">
          <button class="btn-back confirm-cancel">${cancelText}</button>
          <button class="confirm-btn ${type === 'danger' ? 'btn-reject' : 'btn-accept'}">${confirmText}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

const cancel = () => { overlay.remove(); resolve(false); };
    const confirm = () => { overlay.remove(); resolve(true); };

    overlay.querySelector('.confirm-cancel').onclick = cancel;
    overlay.querySelector('.confirm-btn').onclick = confirm;
    overlay.addEventListener('click', e => { if (e.target === overlay) cancel(); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { cancel(); document.removeEventListener('keydown', onKey); }
    });
  });
}

/**
 * ACMS 风格输入弹窗 — 替代浏览器 prompt()
 *   解决"原生 prompt 丑 / 某些环境被拦截 / 用户不知道要点 OK"的痛点
 *   支持 minLength 实时校验，不满足时确认按钮 disabled
 * @param {object} options — { title, message, placeholder, minLength, multiline, confirmText, cancelText }
 * @returns {Promise<string|null>} null = 用户取消
 */
function showPrompt(options = {}) {
  const {
    title = '请输入',
    message = '',
    placeholder = '',
    defaultValue = '',
    minLength = 0,
    multiline = true,
    confirmText = '确认',
    cancelText = '取消',
  } = options;
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    const inputHtml = multiline
      ? `<textarea class="prompt-textarea" placeholder="${escHtml(placeholder)}" rows="4">${escHtml(defaultValue)}</textarea>`
      : `<input type="text" class="prompt-input" placeholder="${escHtml(placeholder)}" value="${escHtml(defaultValue)}" />`;
    overlay.innerHTML = `
      <div class="confirm-dialog prompt-dialog">
        <h3>${escHtml(title)}</h3>
        ${message ? `<p style="margin-bottom:12px;color:var(--text2)">${escHtml(message)}</p>` : ''}
        ${inputHtml}
        <div class="prompt-meta">
          <span class="prompt-counter">0 字</span>
          ${minLength > 0 ? `<span class="prompt-hint">至少 ${minLength} 字</span>` : ''}
        </div>
        <div class="confirm-actions">
          <button class="btn-back confirm-cancel">${cancelText}</button>
          <button class="confirm-btn btn-accept confirm-submit" disabled>${confirmText}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('.prompt-textarea, .prompt-input');
    const submitBtn = overlay.querySelector('.confirm-submit');
    const counter = overlay.querySelector('.prompt-counter');
    input.focus();
    if (multiline) input.setSelectionRange(input.value.length, input.value.length);

    const updateState = () => {
      const v = (input.value || '').trim();
      const len = v.length;
      counter.textContent = `${len} 字`;
      counter.style.color = minLength > 0 && len < minLength ? 'var(--red)' : 'var(--text2)';
      submitBtn.disabled = minLength > 0 && len < minLength;
    };
    input.addEventListener('input', updateState);
    updateState();

    const cleanup = () => { document.removeEventListener('keydown', onKey); };
    const cancel = () => { overlay.remove(); cleanup(); resolve(null); };
    const submit = () => {
      const v = (input.value || '').trim();
      if (minLength > 0 && v.length < minLength) return;  // 双重保险
      overlay.remove(); cleanup(); resolve(v);
    };

    overlay.querySelector('.confirm-cancel').onclick = cancel;
    submitBtn.onclick = submit;
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !multiline)) {
        e.preventDefault();
        if (!submitBtn.disabled) submit();
      }
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) cancel(); });

    function onKey(e) {
      if (e.key === 'Escape') { cancel(); }
    }
    document.addEventListener('keydown', onKey);
  });
}
