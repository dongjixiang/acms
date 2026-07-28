// ACMS · Puppeteer 代理设置（v0.XX Phase 2.B）
//
// 职责：把全局代理配置（config.json 的 proxy section）翻译成 puppeteer 启动参数。
//   - 默认 HTTP/HTTPS 代理 → --proxy-server=... + --proxy-bypass-list=...
//   - SOCKS5 代理（socks5://...）→ 同上（puppeteer/chromium 原生支持 socks）
//   - bypass-local = true 时 → 内网地址不经过代理
//
// 设计原则：
//   - 单一来源：所有 puppeteer 启动都通过 getPuppeteerLaunchArgs(opts) 拿参数
//   - 自动 fallback：代理未启用或 URL 不通时，把 caller's args 原样返回（不破坏）
//   - 与 proxy-fetch.js 一致：HTTP/HTTPS/SOCKS5 是同一个 set，URL 格式相同

const proxyResolver = require('./proxy-resolver');

// Chromium proxy args（--proxy-server + --proxy-bypass-list 标准格式）
//
// --proxy-server 接受 scheme://host:port 形式（与 HTTP proxy-resolver 的 default 字段一致）
//   http://proxy:8080        → HTTP CONNECT 隧道
//   socks5://proxy:1080      → SOCKS5 隧道
//   https://proxy:8080       → HTTPS CONNECT
//
// --proxy-bypass-list 用分号分隔的模式；空字符串表示不 bypass 任何东西

const BYPASS_LOCAL_PATTERNS = [
  '<local>',           // 匹配 localhost 等特殊 host
  '127.0.0.1',         // loopback
  '10.*',
  '172.16.*', '172.17.*', '172.18.*', '172.19.*',
  '172.20.*', '172.21.*', '172.22.*', '172.23.*',
  '172.24.*', '172.25.*', '172.26.*', '172.27.*',
  '172.28.*', '172.29.*', '172.30.*', '172.31.*',
  '192.168.*',
  '*.local',
];

/**
 * 拼出 puppeteer 的代理启动参数
 * @param {object} baseArgs  caller-provided args（不能动，被合并）
 * @returns {string[]}      合并后的 args（caller args 优先，proxy args 末尾）
 */
function getPuppeteerLaunchArgs(baseArgs = []) {
  const cfg = proxyResolver.getConfig();
  const proxyEnabled = cfg.enabled && cfg.puppeteer && cfg.puppeteer.enabled;
  if (!proxyEnabled) return baseArgs;

  // 兜底代理 URL（除非走 'direct' 强直连规则）
  const proxyUrl = cfg.default;
  if (!proxyUrl) return baseArgs;

  const out = Array.from(baseArgs);

  // 移除 caller 已有的 --proxy-server / --proxy-bypass-list，免得冲突
  for (let i = out.length - 1; i >= 0; i--) {
    if (/^--proxy-server=/.test(out[i]) || /^--proxy-bypass-list=/.test(out[i])) {
      out.splice(i, 1);
    }
  }

  out.push(`--proxy-server=${proxyUrl}`);

  if (cfg.puppeteer.bypassLocal !== false) {
    const bypass = BYPASS_LOCAL_PATTERNS.join(';');
    out.push(`--proxy-bypass-list=${bypass}`);
  }

  return out;
}

/**
 * 一次性 query：代理是否启用 + URL（供 UI 状态展示）
 */
function getPuppeteerProxyStatus() {
  const cfg = proxyResolver.getConfig();
  const proxyEnabled = cfg.enabled && cfg.puppeteer && cfg.puppeteer.enabled;
  return {
    enabled: !!proxyEnabled,
    proxyUrl: proxyEnabled ? (cfg.default || '') : '',
    bypassLocal: cfg.puppeteer ? cfg.puppeteer.bypassLocal !== false : true,
  };
}

module.exports = {
  getPuppeteerLaunchArgs,
  getPuppeteerProxyStatus,
  BYPASS_LOCAL_PATTERNS,  // 测试用
};
