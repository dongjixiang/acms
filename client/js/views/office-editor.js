// ACMS Office 编辑器 — 全局注册入口
// 依赖加载顺序：
//   1. office-common.js (escHtml, showCtxMenu)
//   2. office-word.js (Word 编辑器)
//   3. office-excel.js (Excel 编辑器)
//   4. office-ppt.js (PPT 编辑器)

// ─── 注册全局函数供 PKG 调用 =====
window.openWordEditor = openWordEditor;
window.openExcelEditor = openExcelEditor;
window.openPptEditor = openPptEditor;

// ===== v0.62.4 全局 helper：让 chat / file-browser / delivery 等地方能一键打开文件到块编辑器 =====
// 用法：ACMS.openInOfficeEditor(fileId, fileName, source)
//   source = 'office' (默认) | 'chat'
// 行为：开 office-word PKG，把指定 fileId 的内容加载进块编辑器
window.ACMS = window.ACMS || {};
window.ACMS.openInOfficeEditor = function (fileId, fileName, source) {
  if (typeof openWordEditor !== 'function') {
    if (typeof toast === 'function') toast('块编辑器未加载', 'error');
    return;
  }
  // 构造一个 mock PKG window（复用 PKG 窗口的 $c 接口）
  var pkgWindow = {
    $c: document.createElement('div'),
    _isMock: true,
    _fileId: fileId,
    _fileName: fileName,
  };
  pkgWindow.$c.style.cssText = 'position:fixed;top:5%;left:5%;width:90%;height:90%;background:#fafaf6;border:2px solid #5b8c5a;box-shadow:0 8px 32px rgba(0,0,0,0.3);z-index:9999;display:flex;flex-direction:column';
  var header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;padding:8px 12px;background:#5b8c5a;color:white;flex-shrink:0';
  header.innerHTML = '<span style="flex:1;font-weight:600">📝 ' + fileName + '</span><button id="acms-office-close" style="background:#fff;color:#333;border:none;padding:4px 12px;cursor:pointer">✕ 关闭</button>';
  pkgWindow.$c.appendChild(header);
  var body = document.createElement('div');
  body.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column';
  pkgWindow.$c.appendChild(body);
  pkgWindow.$c = body; // 替换 $c 为实际编辑器区
  document.body.appendChild(pkgWindow.$c.parentElement); // 整个浮层
  openWordEditor(pkgWindow, fileId, fileName);
  document.getElementById('acms-office-close').onclick = function () {
    var overlay = pkgWindow.$c.parentElement;
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };
};
