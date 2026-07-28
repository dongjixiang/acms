// ACMS · 代理规则解析（v0.XX 代理设置 Phase 1）
//
// 职责：唯一权威地"决定一个 URL 该走哪个代理（或直连）"。
//   - 配置来源：config.json 的 proxy 字段 + 可选环境变量（HTTPS_PROXY / HTTP_PROXY）
//   - 行为开关：enabled=false 时全部直连（零行为变化，对现有用户透明）
//   - 匹配算法：URL 规则数组按声明顺序 → 第一条 hit 即返回，'via: "direct"' 强制直连
//   - glob 语法：'*' 匹配非 . 段（仿 Chrome proxy.bypassRules），'api.openai.com' 精确匹配，'*.openai.com' 子域通配
//   - bypassLocal：localhost/127.x/10.x/172.16-31.x/192.168.x 默认走代理绕过
//
// 设计原则：框架层零写死 — 出站 fetch 全部调这里，UI 规则编辑后通过 setConfig 覆盖 config.json
// 文件变更立刻生效（下一次 getConfig 调用 5s 内 reload，但 setConfig 强制立即生效）

const fs = require('fs');
const path = require('path');

const DEFAULT_RULE = { match: '*', via: '' }; // 兜底规则：match 全部 via 直连
const DEFAULT_CONFIG = Object.freeze({
  enabled: false,                  // 全局开关
  default: '',                     // 兜底代理 URL（例：http://127.0.0.1:7890）
  rules: [],                       // [{match:'*.openai.com', via:'http://proxy:8080'}, {match:'api.agnes.com.cn', via:'direct'}]
  bypassLocal: true,               // 内网地址默认绕过（不被代理）
  sslBypass: [],                   // 自签证书主机名白名单（客户端跳过 verify）
  respectEnv: true,                // 启动时读 HTTPS_PROXY / HTTP_PROXY 环境变量
});

let _config = null;                // 当前生效配置
let _loadedAt = 0;
const CONFIG_RELOAD_MS = 5000;     // 文件读取兜底周期（5s）

// ─── 配置加载 / 持久化 ──────────────────────────────────────────────

function _configPath() {
  return path.join(__dirname, '..', '..', 'config.json');
}

function _readFileConfig() {
  let file = {};
  try {
    const p = _configPath();
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
      file = raw.proxy || {};
    }
  } catch (e) {
    console.warn('[proxy-resolver] config.json 读取失败:', e.message);
  }
  return file;
}

function _normalize(cfg) {
  const out = {
    enabled: !!cfg.enabled,
    default: typeof cfg.default === 'string' ? cfg.default : '',
    rules: Array.isArray(cfg.rules) ? cfg.rules.filter(r => r && typeof r.match === 'string') : [],
    bypassLocal: cfg.bypassLocal !== false,
    sslBypass: Array.isArray(cfg.sslBypass) ? cfg.sslBypass.filter(x => typeof x === 'string') : [],
    respectEnv: cfg.respectEnv !== false,
    // v0.XX Phase 2.A：SOCKS + Puppeteer 维度
    //   - socks 默认允许（undici 7 ProxyAgent 原生 socks5://）
    //   - allowSocks5 默认 true；false 时拒绝 socks/socks5 scheme（向后兼容）
    allowSocks5: cfg.allowSocks5 !== false,
    //   - puppeteer：{ enabled: bool, bypassLocal: bool }
    //     - enabled: 同时让 puppeteer 启动加 --proxy-server
    //     - bypassLocal: 同 HTTP 维度，bypass 本地/内网
    puppeteer: (() => {
      const p = cfg.puppeteer;
      if (!p || typeof p !== 'object') return { enabled: false, bypassLocal: true };
      return { enabled: !!p.enabled, bypassLocal: p.bypassLocal !== false };
    })(),
  };
  return out;
}

// v0.XX Phase 2.A：proxy URI 合法性 + 协议白名单
//   支持的协议：http:// https:// socks:// socks5://
//   undici 7 ProxyAgent 原生支持前 3 个（CONNECT tunnel），socks4 不在 undici 白名单
const ALLOWED_PROXY_PROTOCOLS = ['http:', 'https:', 'socks:', 'socks5:'];

function isValidProxyUri(uri) {
  if (typeof uri !== 'string' || uri.length === 0) return { ok: false, error: 'empty URI' };
  let u;
  try { u = new URL(uri); } catch (e) { return { ok: false, error: `非法 URL: ${e.message}` }; }
  if (!ALLOWED_PROXY_PROTOCOLS.includes(u.protocol)) {
    return { ok: false, error: `不支持的协议 ${u.protocol}（支持 ${ALLOWED_PROXY_PROTOCOLS.join(' ')}）` };
  }
  if (u.protocol === 'socks:' || u.protocol === 'socks5:') {
    // 兼容 allowSocks5 配置（默认 true）
  }
  if (!u.hostname) return { ok: false, error: '缺少 hostname' };
  return { ok: true, protocol: u.protocol.replace(':', ''), hostname: u.hostname };
}

function validateConfig(cfg) {
  const errs = [];
  if (cfg.default && cfg.default.length > 0) {
    const r = isValidProxyUri(cfg.default);
    if (!r.ok) errs.push({ field: 'default', error: r.error });
  }
  if (Array.isArray(cfg.rules)) {
    cfg.rules.forEach((r, i) => {
      if (r.via && r.via.length > 0 && r.via !== 'direct') {
        const v = isValidProxyUri(r.via);
        if (!v.ok) errs.push({ field: `rules[${i}].via`, error: v.error });
      }
    });
  }
  return errs;
}

function loadConfig(forceReload = false) {
  if (_config && !forceReload && Date.now() - _loadedAt < CONFIG_RELOAD_MS) return _config;
  const file = _readFileConfig();
  let envProxy = '';
  if (file.respectEnv !== false) {
    envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || '';
  }
  const normalized = _normalize(file);
  // 环境变量作为 default 兜底（仅当用户没在 config 显式设置）
  if (!normalized.default && envProxy) normalized.default = envProxy;
  _config = normalized;
  _loadedAt = Date.now();
  return _config;
}

function getConfig() {
  return loadConfig();
}

function setConfig(newCfg) {
  // 写入 config.json 完整结构（保留非 proxy 字段）
  const p = _configPath();
  let full = {};
  try {
    if (fs.existsSync(p)) full = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) { /* ignore */ }
  full.proxy = _normalize(newCfg);
  fs.writeFileSync(p, JSON.stringify(full, null, 2) + '\n', 'utf-8');
  _config = full.proxy;
  _loadedAt = Date.now();
  return _config;
}

function invalidate() {
  _config = null;
  _loadedAt = 0;
}

// ─── URL pattern 匹配（glob 仿 Chrome） ─────────────────────────────

function _globToRegex(pattern) {
  // 转义点号，把 * 翻译成 [^.]*，保留 . 为字面段分隔
  // 示例：*.openai.com → /^([^.]+\.)*openai\.com$/
  // 简化：单层 * 通配；multi-level glob 不支持（够用）
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')   // 转义元字符（保留 *）
    .replace(/\*/g, '[^.]*');                 // * → 非 . 字符
  return new RegExp('^' + escaped + '$', 'i');
}

function _matchRule(hostname, rules) {
  const host = hostname.toLowerCase();
  // 第一条 hit 即返回（first-match wins）
  for (const rule of rules) {
    const m = (rule.match || '').toLowerCase();
    if (!m) continue;
    if (m === host) return rule;
    if (m.startsWith('*.') || m.includes('*')) {
      try {
        const re = _globToRegex(m);
        if (re.test(host)) return rule;
      } catch { /* malformed pattern, skip */ }
    }
  }
  return null;
}

function shouldBypassLocal(urlStr, bypassLocal) {
  if (!bypassLocal) return false;
  let u;
  try { u = new URL(urlStr); } catch { return false; }
  const h = (u.hostname || '').toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') return true;
  if (h.endsWith('.local')) return true;
  // RFC 1918 + loopback + CGNAT 简化识别
  if (/^(10|127|169\.254|172\.(1[6-9]|2\d|3[01])|192\.168|0\.0\.0\.0)\./.test(h)) return true;
  return false;
}

function isSSLBypassHost(hostname, sslBypass) {
  if (!Array.isArray(sslBypass) || sslBypass.length === 0) return false;
  const h = (hostname || '').toLowerCase();
  return sslBypass.some(p => {
    const pp = p.toLowerCase();
    if (pp === h) return true;
    if (pp.startsWith('*.')) return h.endsWith(pp.substring(1));
    if (pp.includes('*')) return _globToRegex(pp).test(h);
    return false;
  });
}

function resolveProxy(urlStr, opts = {}) {
  const cfg = loadConfig();
  if (!cfg.enabled) return { via: 'disabled', proxy: null, sslBypass: false };
  if (!urlStr || typeof urlStr !== 'string') return { via: 'invalid-url', proxy: null, sslBypass: false };
  if (!/^https?:/i.test(urlStr)) return { via: 'non-http', proxy: null, sslBypass: false };  // 只代理 http/https

  let u;
  try { u = new URL(urlStr); } catch { return { via: 'parse-failed', proxy: null, sslBypass: false }; }

  if (shouldBypassLocal(urlStr, cfg.bypassLocal)) {
    return { via: 'bypass-local', proxy: null, sslBypass: false, hostname: u.hostname };
  }

  // 强制直连选项（per-call override）
  if (opts.direct) return { via: 'opts-direct', proxy: null, sslBypass: false, hostname: u.hostname };

  const rule = _matchRule(u.hostname, cfg.rules);
  if (rule) {
    if (!rule.via || rule.via === 'direct' || rule.via === '') {
      return { via: 'rule-direct', proxy: null, sslBypass: false, hostname: u.hostname, rule };
    }
    return { via: 'rule', proxy: rule.via, sslBypass: isSSLBypassHost(u.hostname, cfg.sslBypass), hostname: u.hostname, rule };
  }

  if (cfg.default) {
    return { via: 'default', proxy: cfg.default, sslBypass: isSSLBypassHost(u.hostname, cfg.sslBypass), hostname: u.hostname };
  }

  return { via: 'no-rule', proxy: null, sslBypass: false, hostname: u.hostname };
}

module.exports = {
  DEFAULT_CONFIG,
  ALLOWED_PROXY_PROTOCOLS,
  loadConfig,
  getConfig,
  setConfig,
  invalidate,
  resolveProxy,
  shouldBypassLocal,
  isSSLBypassHost,
  isValidProxyUri,
  validateConfig,
};
