// ACMS 反爬指纹 stealth 脚本（公共模块）
// v0.119.4 抽出：app-runtime.js（远程预览）+ browser-fetch.js（web_search）共用
//
// 背景：puppeteer-extra-plugin-stealth@2.11.2（2022 年最后更新）在 chrome 149 上严重过时：
//   - navigator.webdriver 只能设成 false（真实浏览器是 undefined）
//   - window.chrome.runtime 完全没注入
//   - navigator.languages 不改中文
//   被百度等站一眼识破。
//
// 修复方案：手写 stealth（针对 chrome 149 headless 优化），用 evaluateOnNewDocument 在每个
//   新文档加载前注入。配合 puppeteer launch args 的 --disable-blink-features=AutomationControlled
//   双重保险。
//
// 局限：chrome-headless-shell 仍是 headless，部分深度指纹（栈特征/CDP noise）仍可能
//   被识别；如仍频繁触发，考虑升级 puppeteer-extra-plugin-stealth v3+ 或换 stealth 方案。
//
// 用法：
//   const { STEALTH_INIT_SCRIPT } = require('./stealth-init');
//   await page.evaluateOnNewDocument(STEALTH_INIT_SCRIPT);
//
// 注意：调用方必须保证 puppeteer launch args 含 --disable-blink-features=AutomationControlled，
//   否则 navigator.webdriver = undefined 不会生效（仍会被 Blink 层特性设回 true）。

const STEALTH_INIT_SCRIPT = `
(() => {
  try {
    // 1. navigator.webdriver = undefined（headless 默认 true 是最致命的指纹）
    if (navigator.webdriver !== undefined) {
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => undefined, configurable: true });
    }
    // 2. window.chrome.runtime 模拟（headless 默认 undefined —— Chrome 内部脚本会重置 window.chrome，
    //   所以直接给 chrome 对象加 runtime 属性，而不是替换整个 chrome 对象）
    try {
      // 等待 chrome 内部初始化（用 queueMicrotask 推到当前同步任务之后，让 chrome 内部先跑）
      queueMicrotask(() => {
        try {
          if (!window.chrome) window.chrome = {};
          // 用 defineProperty 模拟 runtime（防后续被覆盖）
          Object.defineProperty(window.chrome, 'runtime', {
            get: () => ({
              PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
              PlatformArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
              RequestUpdateCheckStatus: { THROTTLED: 'throttled', NO_UPDATE: 'no_update', UPDATE_AVAILABLE: 'update_available' },
              OnInstalledReason: { INSTALL: 'install', UPDATE: 'update', CHROME_UPDATE: 'chrome_update', SHARED_MODULE_UPDATE: 'shared_module_update' },
              OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
              connect: () => {},
              sendMessage: () => {}
            }),
            set: () => {},
            configurable: true,
            enumerable: true
          });
          // 给 window.chrome.app 添加模拟 getDetails（部分站点检测）
          if (window.chrome.app && !window.chrome.app.getDetails) {
            Object.defineProperty(window.chrome.app, 'getDetails', {
              value: () => ({}),
              writable: true, configurable: true
            });
          }
        } catch (e) { /* 已被锁定 —— 跳过 */ }
      });
    } catch (e) { /* 静默 */ }
    // 3. navigator.plugins 模拟（headless 默认 length=0，chrome 90+ 默认已有 5 项）
    Object.defineProperty(Navigator.prototype, 'plugins', {
      get: () => [
        { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Chromium PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Microsoft Edge PDF Viewer', filename: 'edge_pdf_viewer', description: '' },
        { name: 'WebKit built-in PDF', filename: 'webkit-pdf', description: '' }
      ],
      configurable: true
    });
    // 4. navigator.languages 完整化（headless 默认 ["en-US"] 或空，加 zh-CN 配合百度）
    Object.defineProperty(Navigator.prototype, 'languages', {
      get: () => ['zh-CN', 'zh', 'en-US', 'en'],
      configurable: true
    });
    // 5. navigator.platform（headless 默认 Linux，伪装 Win32 配合 UA）
    Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'Win32', configurable: true });
    // 6. WebGL vendor/renderer 伪装真实显卡（避免被识别 HeadlessChrome）
    const origGetParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(p) {
      if (p === 37445) return 'Intel Inc.';        // UNMASKED_VENDOR_WEBGL
      if (p === 37446) return 'Intel Iris OpenGL Engine'; // UNMASKED_RENDERER_WEBGL
      return origGetParameter.apply(this, arguments);
    };
    if (typeof WebGL2RenderingContext !== 'undefined') {
      const origGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function(p) {
        if (p === 37445) return 'Intel Inc.';
        if (p === 37446) return 'Intel Iris OpenGL Engine';
        return origGetParameter2.apply(this, arguments);
      };
    }
    // 7. permissions API headless 异常（默认 'denied'）→ 模拟 'prompt'
    if (navigator.permissions && navigator.permissions.query) {
      const origQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (params) => origQuery(params).catch(() => ({ state: 'prompt', onchange: null }));
    }
  } catch (e) {
    // stealth 注入失败不阻断页面加载（静默）
    console.warn('[stealth] injection 部分失败:', e.message);
  }
})();
`;

// 反爬相关 launch args（必须含，否则 stealth 注入效果打折）
const STEALTH_LAUNCH_ARGS = [
  '--disable-blink-features=AutomationControlled',
];

// 推荐的 setUserAgent（去掉 HeadlessChrome 字样，配合 stealth）
const STEALTH_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

module.exports = {
  STEALTH_INIT_SCRIPT,
  STEALTH_LAUNCH_ARGS,
  STEALTH_USER_AGENT,
};
