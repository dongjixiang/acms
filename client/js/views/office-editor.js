// ACMS Office 编辑器 — 全局注册入口
// 依赖加载顺序：
//   1. office-common.js (escHtml, showCtxMenu)
//   2. office-word.js (Word 编辑器)
//   3. office-excel.js (Excel 编辑器)
//   4. office-ppt.js (PPT 编辑器)

window.openWordEditor = openWordEditor;
window.openExcelEditor = openExcelEditor;
window.openPptEditor = openPptEditor;
