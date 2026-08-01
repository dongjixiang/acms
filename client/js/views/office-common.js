// ACMS Office 编辑器 — Word / Excel / PPT 统一前端
// 不依赖外部 CDN，纯原生实现

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ─── 右键菜单组件 (学 OO DocumentHolderExt 模式) ───
var activeCtxMenu = null;
function showCtxMenu(items, x, y) {
  if (activeCtxMenu) { document.body.removeChild(activeCtxMenu); activeCtxMenu = null; }
  var menu = document.createElement('div');
  menu.className = 'oo-ctx-menu';
  menu.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;z-index:99999;' +
    'background:var(--bg,#fff);border:1px solid var(--border,#ddd);border-radius:4px;' +
    'box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:4px 0;min-width:120px;';
  items.forEach(function (item) {
    if (item === '-') {
      menu.appendChild(document.createElement('hr'));
      return;
    }
    var btn = document.createElement('button');
    btn.textContent = item.label;
    btn.style.cssText = 'display:block;width:100%;padding:6px 16px;border:none;background:transparent;' +
      'text-align:left;font-size:13px;cursor:pointer;color:var(--text,#333);';
    btn.onmouseenter = function () { this.style.background = 'var(--office-tab-hover-bg,rgba(0,0,0,0.05))'; };
    btn.onmouseleave = function () { this.style.background = 'transparent'; };
    btn.onclick = function (e) {
      e.stopPropagation();
      item.action();
      if (activeCtxMenu) { document.body.removeChild(activeCtxMenu); activeCtxMenu = null; }
    };
    menu.appendChild(btn);
  });
  function closeMenu(e) {
    if (menu && !menu.contains(e.target)) {
      if (activeCtxMenu) { document.body.removeChild(activeCtxMenu); activeCtxMenu = null; }
      document.removeEventListener('mousedown', closeMenu);
    }
  }
  setTimeout(function () { document.addEventListener('mousedown', closeMenu); }, 0);
  document.body.appendChild(menu);
  activeCtxMenu = menu;
}
// 阻止浏览器默认右键菜单
document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

// ===== Word 编辑器（v0.62.5 OO 风格标题栏 + 块编辑器）=====
// 改用自研 office-doc-editor 替代 Quill
// 依赖：window.OfficeDoc + window.OfficeDocEditor（由 index.html 在 office-editor.js 之前加载）
// v0.62.4: 支持 (w, fileId, name) 加载现有 .docx
// v0.62.5: OO 风格标题栏（学 OO FileMenu.js 设计）— 文件名 + ●已修改点 + 右上角保存按钮
