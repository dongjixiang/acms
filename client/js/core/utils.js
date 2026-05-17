// 工具函数
function escHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtDate(s) { if (!s) return ''; return new Date(s).toLocaleDateString('zh-CN'); }
function safeParse(s) { if (!s) return {}; if (typeof s === 'object') return s; try { return JSON.parse(s); } catch { return {}; } }
function toast(msg, type = 'success') {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}
