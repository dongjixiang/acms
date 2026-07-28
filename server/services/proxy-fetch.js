// ACMS · 统一出站 fetch（v0.XX 代理设置 Phase 1 基础设施）
//
// 职责：ACMS 所有出站 HTTP 都过这里。一个 URL 进来 → 解析代理规则 → 决定 direct / 走代理。
//   - 不需要代理：用 globalThis.fetch（保留 H2 / 连接池 / SSE 流式最佳性能）
//   - 需要代理：用 undici.ProxyAgent 作为 dispatcher 注入 fetch（同一套底层）
//   - HTTP/1.1 强制：undici.Agent({ allowH2: false })（保持 http1-fetch.js 避 Cloudflare 握手挂死的设计）
//
// 设计原则：
//   - 透明替换：上游调用方把它当 fetch(url, opts) 用即可（与 globalThis.fetch 签名一致）
//   - 零行为变化：proxy.enabled=false 时走 globalThis.fetch，对现有用户 100% 不干扰
//   - dispatch 缓存在 Map，避免每次请求 new ProxyAgent 浪费握手
//   - sslBypass 主机名清单把 rejectUnauthorized:false 限在该主机上（避免全局降级 TLS）
//
// 不在框架层写死逻辑：调用方传 { http1 } 选项即可，不需要"agnes-video 必须用 HTTP/1.1" 这种散落硬编码

const undici = require('undici');                // 来自 puppeteer 的 transitive dep（已验证 require 成功）
const { resolveProxy } = require('./proxy-resolver');

const { ProxyAgent, Agent } = undici;

// ─── Dispatcher 缓存 ─────────────────────────────────────────────────

const _proxyAgentCache = new Map();
function _getProxyAgent(proxyUri) {
  if (_proxyAgentCache.has(proxyUri)) return _proxyAgentCache.get(proxyUri);
  const agent = new ProxyAgent({
    uri: proxyUri,
    // 一些代理（mitmproxy / 自签证书）在内部环境会用到自签 CA；sslBypass 主机名列表里的目标也接受
    requestTls: { rejectUnauthorized: true },     // 默认严格（仅 sslBypass 主机名被标 bypass）
  });
  _proxyAgentCache.set(proxyUri, agent);
  return agent;
}

// HTTP/1.1 强制 agent（Cloudflare HTTP/2 握手挂死规避，源自 http1-fetch.js）
const _http1Agent = new Agent({ allowH2: false });

// 清除缓存（setConfig 后调用，让新规则立即生效）
function _clearCache() {
  _proxyAgentCache.clear();
}

// ─── 主入口 ──────────────────────────────────────────────────────────

/**
 * 统一出站 fetch
 * @param {string} url
 * @param {object} opts - 透传给 native fetch（method/headers/body/signal/...）
 * @param {object} options - 内部选项 { http1: true } 强制 HTTP/1.1（兼容原 http1-fetch.js 行为）
 * @returns {Promise<Response>}
 */
async function proxyFetch(url, opts = {}, options = {}) {
  const decision = resolveProxy(url);

  // disabled / no-rule / 非 http(s) → 完全走 globalThis.fetch（最简，最佳性能）
  if (!decision.proxy) {
    if (options.http1) {
      return globalThis.fetch(url, { ...opts, dispatcher: _http1Agent });
    }
    return globalThis.fetch(url, opts);
  }

  // 走代理：根据 sslBypass 决定 TLS 严格度
  let proxyAgent = _proxyAgentCache.get(decision.proxy);
  if (!proxyAgent) {
    proxyAgent = _getProxyAgent(decision.proxy);
  }
  const dispatcherOpts = decision.sslBypass
    ? { dispatcher: _makeSSLBypassProxyAgent(decision.proxy) }
    : { dispatcher: proxyAgent };

  return globalThis.fetch(url, { ...opts, ...dispatcherOpts });
}

// 给 sslBypass 主机名专用：构建一个对所有目标都放行证书的 ProxyAgent
const _sslBypassCache = new Map();
function _makeSSLBypassProxyAgent(proxyUri) {
  if (_sslBypassCache.has(proxyUri)) return _sslBypassCache.get(proxyUri);
  const a = new ProxyAgent({
    uri: proxyUri,
    requestTls: { rejectUnauthorized: false },
  });
  _sslBypassCache.set(proxyUri, a);
  return a;
}

// ─── 测试用导出 ──────────────────────────────────────────────────────

/** 仅供代理测试路由调用：用 proxyFetch 把请求发出去，返回 {status, body, via, proxy} */
async function testProxy(testUrl, options = {}) {
  const decision = resolveProxy(testUrl, { direct: options.forceDirect });
  try {
    const resp = await proxyFetch(testUrl, options.fetchOpts || {}, { http1: !!options.http1 });
    const text = await resp.text().catch(() => '');
    return { ok: resp.ok, status: resp.status, bodySample: text.slice(0, 500), decision };
  } catch (e) {
    return { ok: false, error: e.message, cause: e.cause?.message, decision };
  }
}

module.exports = {
  proxyFetch,
  testProxy,
  _clearCache,
};
