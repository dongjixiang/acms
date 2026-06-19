// 工具函数
function escHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtDate(s) { if (!s) return ''; return new Date(s).toLocaleDateString('zh-CN'); }  // zh-CN OK; date 本身无时区歧义
function safeParse(s) { if (!s) return {}; if (typeof s === 'object') return s; try { return JSON.parse(s); } catch { return {}; } }
function toast(msg, type = 'success') {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 4000);
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
