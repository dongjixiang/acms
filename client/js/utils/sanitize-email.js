'use strict';

// ACMS · sanitize-email.js v1.11
// v1.10 修复「邮件图片和格式展示不出来」(2026-09-02)：
//   ① INLINE_CONFIG.ALLOWED_ATTR 补回 'src' — v1.00 时代漏写导致 DOMPurify 把 <img src=...> 的 src 全过滤掉，
//      招商证券对账单这类带远程图/内联图(table1x + QR码 + brand banner)的邮件全部破碎
//   ② sanitizeEmailHtmlForIframe 改顺序：先 inlineCidImages 再 sanitize，让 cid → data: URL 替换在
//      DOMPurify 过滤之前完成；旧顺序「sanitize 后 inline」永远匹配不到 src，v1.02 cid 修复实际从未生效
// v1.11 修复「表格样式不生效」(2026-09-02)：
//   ① IFRAME 模式开 WHOLE_DOCUMENT:true — DOMPurify 默认 text/html 模式下会把 <style> 标签当「body 里
//      的样式」主动剥掉（防 CSS 注入/视觉欺骗）。开 WHOLE_DOCUMENT 后 DOMPurify 把邮件当成完整 HTML 文档
//      解析（自动包 html/head/body），<style> 进入 head 不被剥 → 表格配色/字号/斑马纹 nth-child 全回来
//   ② ALLOWED_ATTR 补 'class' — 邮件 CSS 选择器（.table1x th { background:#c00403 }）靠 class 匹配元素，
//      class 不在白名单就被剥 → 即使 <style> 还在，CSS 也匹配不到元素
//   ③ 不再二次 sanitize 包 html/head/body — WHOLE_DOCUMENT 模式 DOMPurify 已经返回完整 <html> 文档，
//      再包一遍会触发再次剥 <style>。直接用 sanitizeEmailHtml 的输出 + 注入 <base target="_blank"> 即可
//   （PARSER_MEDIA_TYPE=xhtml 路线已废弃 — 严格 XHTML 解析会因邮件结构不规范而截断后段表格内容）
// 浏览器端运行（通过 <script src> 加载），依赖 window.DOMPurify（由 dompurify.min.js 提供）
// 也可被 Node 端打包工具处理（保留 require 兼容）

(function (global) {
  // ===== 获取 DOMPurify =====
  function getDOMPurify() {
    // 浏览器端：window.DOMPurify（由 dompurify.min.js 全局注册）
    if (typeof window !== 'undefined' && window.DOMPurify) return window.DOMPurify;
    // Node 端兜底
    try { return require('dompurify'); } catch (e) { throw new Error('DOMPurify not available'); }
  }

  // ===== 配置 =====
  const INLINE_CONFIG = {
    ALLOWED_TAGS: [
      'p', 'br', 'span', 'div', 'b', 'strong', 'i', 'em', 'u', 's', 'strike',
      'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'col', 'colgroup',
      'hr', 'mark', 'small', 'sub', 'sup', 'del', 'ins'
    ],
ALLOWED_ATTR: [
      'href', 'name', 'target', 'rel', 'title', 'alt', 'width', 'height',
      'style', 'colspan', 'rowspan', 'align', 'valign', 'border', 'cellpadding', 'cellspacing',
      // v1.10: 补回 'src' — 否则 <img src> / <video src> / <source src> / <iframe src> 全部失效
      // （招商证券对账单这类「表格 + 远程图 + 内联图」邮件全坏）。DOMPurify 默认就允许 src + 会过滤 javascript: 等危险 scheme，安全无虞
      'src',
      // v1.10: 顺带补几个常见 mail HTML 属性（部分银行/券商对账单会用 inline style + bgcolor 兜底）
      'bgcolor', 'color', 'face', 'size',
      // v1.11: 补 'class' — 邮件 CSS 选择器（.table1x th { background:#c00403 }）靠 class 匹配元素
      // class 不在白名单就被剥 → 即使 <style> 还在，CSS 选择器也匹配不到元素
      'class'
    ],
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    SANITIZE_DOM: true
  };
  const IFRAME_CONFIG = {
    ...INLINE_CONFIG,
    ALLOWED_TAGS: [...INLINE_CONFIG.ALLOWED_TAGS, 'style', 'link', 'base', 'meta', 'html', 'head', 'body', 'title', '!doctype'],
    ALLOWED_ATTR: [...INLINE_CONFIG.ALLOWED_ATTR, 'rel', 'media', 'href', 'type', 'charset', 'http-equiv', 'content', 'xmlns'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select'],
    FORBID_ATTR: ['on*'],
    // v1.11: IFRAME 模式开 WHOLE_DOCUMENT — 把邮件片段当完整 HTML 文档解析，让 <style> 进 head 不被剥
    // （DOMPurify 默认 text/html 模式会把 <style> 主动剥掉，是防 CSS 注入的硬编码行为）
    WHOLE_DOCUMENT: true
  };

  // ===== 过滤函数 =====
  function sanitizeEmailHtml(html, mode) {
    if (!html) return '';
    var DOMPurify = getDOMPurify();
    var config = (mode === 'iframe') ? IFRAME_CONFIG : INLINE_CONFIG;
    return DOMPurify.sanitize(html, config);
  }

  function inlineCidImages(html, email) {
    if (!html || !email || !email.attachments) return html;
    var cidMap = {};
    var cidImages = email.cidImages || {};
    Object.keys(cidImages).forEach(function (partID) {
      cidMap[partID] = cidImages[partID];
      var att = email.attachments.find(function (a) { return a.partID === partID; });
      if (att && att.cid) {
        var cid = att.cid.replace(/[<>]/g, '');
        cidMap[cid] = cidImages[partID];
      }
    });
    return html.replace(/src\s*=\s*["']cid:([^"']+)["']/gi, function (match, cid) {
      var cleanCid = cid.replace(/[<>]/g, '');
      return cidMap[cleanCid] ? 'src="' + cidMap[cleanCid] + '"' : 'src=""';
    });
  }

  function sanitizeEmailHtmlForIframe(html, email) {
    if (!html) return '';
    // v1.10 修复：必须先 inlineCidImages 再 sanitize ——
    // 旧顺序「sanitize 后 inline」会因 DOMPurify ALLOWED_ATTR 不含 src（旧版 bug）
    // 把 <img src="cid:xxx"> 的 src 全剥光，导致 inlineCidImages 的 /src=["']cid:[^"']+["']/ 正则
    // 永远匹配不到，cid → data: URL 替换从未真正生效
    // 现在先 inline 把 src="cid:xxx" 替换成 src="data:image/png;base64,..."，
    // 再让 DOMPurify 过滤，data: URL 命中 ALLOWED_URI_REGEXP 默认值，src 保留
    var inlined = inlineCidImages(html, email);
    // v1.11: IFRAME 模式走 xhtml — DOMPurify 直接返回完整 <html xmlns="..."> 文档（含 <style>）
    // 不再二次 sanitize（再包一遍 <html><body> 会触发再次剥 <style>）
    var cleaned = sanitizeEmailHtml(inlined, 'iframe');
    // 注入 <base target="_blank"> 让邮件里的 <a> 默认新窗口打开（不影响 img 加载）
    return cleaned.replace('<head>', '<head><base target="_blank">');
  }

  // ===== 注册到全局（浏览器）或导出（Node 打包）=====
  var exports = {
    sanitizeEmailHtml: sanitizeEmailHtml,
    inlineCidImages: inlineCidImages,
    sanitizeEmailHtmlForIframe: sanitizeEmailHtmlForIframe,
    INLINE_CONFIG: INLINE_CONFIG,
    IFRAME_CONFIG: IFRAME_CONFIG
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  // 浏览器端：注册到 window.EmailSanitize，供 email-inbox.js 的 getSanitizeModule() 使用
  global.EmailSanitize = exports;
  if (typeof window !== 'undefined') window.EmailSanitize = exports;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
