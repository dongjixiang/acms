// ACMS · HTTP/1.1 fetch 工具
// 历史：Node 内置 fetch 默认用 HTTP/2，导致 120 服务器（阿里云）连 Cloudflare 的 Agnes API 握手后永久挂死
// 本工具用 Node https/http（HTTP/1.1）实现，避免此问题（v0.22.16）
//
// v0.XX 代理 Phase 1：保留 http1Fetch 函数（向后兼容 agnes-video 等老调用点），但内部改走 proxy-fetch 的 HTTP/1.1 标志位
//   - 新代码应当用 proxyFetch(url, opts, { http1: true })
//   - 老代码 require('./http1-fetch').http1Fetch(...) 自动获得代理支持（白嫖）

const { proxyFetch } = require('../services/proxy-fetch');

/**
 * HTTP/1.1 请求（替代 Node fetch，避免 HTTP/2 + Cloudflare 握手挂死）
 * opts: { method, headers, body, timeout, binary }
 * 返回: { ok, status, headers, body, _binary? } | { ok:false, error, status_code }
 *
 * 兼容老 API（{ok, status, body, headers, error, status_code} 扁平结构）。
 * 新代码请直接用 proxyFetch(url, opts, { http1: true }) + Response。
 */
async function http1Fetch(urlStr, opts = {}) {
  const fetchOpts = {
    method: opts.method || 'GET',
    headers: opts.headers || {},
    signal: opts.timeout ? AbortSignal.timeout(opts.timeout) : undefined,
  };
  if (opts.body) fetchOpts.body = opts.body;

  try {
    const resp = await proxyFetch(urlStr, fetchOpts, { http1: true });
    return await _consume(resp, opts);
  } catch (e) {
    // v0.113f: 共享连接池（_http1Agent keep-alive）偶发坏连接 → undici 抛无 message 错误。
    //   用全新 Agent 重试一次（不共享池），治 Agnes API 间歇性"无 message"失败。
    console.error(`[http1Fetch] ${urlStr} 首次异常:`, e.name, e.code, e.message || '(无message)', '| cause:', e.cause?.message, '| 换新连接重试...');
    try {
      const { Agent } = require('undici');
      const freshResp = await globalThis.fetch(urlStr, { ...fetchOpts, dispatcher: new Agent({ allowH2: false }) });
      return await _consume(freshResp, opts);
    } catch (e2) {
      console.error(`[http1Fetch] ${urlStr} 重试也失败:`, e2.name, e2.code, e2.message || '(无message)', '| cause:', e2.cause?.message);
      const detailed = e2.cause?.message || e2.message || `${e2.name || 'Error'}: 无 message`;
      return { ok: false, error: detailed, status_code: e2.name === 'AbortError' ? 408 : 0 };
    }
  }
}

async function _consume(resp, opts) {
  const buf = await resp.arrayBuffer();
  const buffer = Buffer.from(buf);
  const headers = {};
  resp.headers.forEach((v, k) => { headers[k] = v; });
  if (opts.binary) {
    return { ok: resp.ok, status: resp.status, headers, body: buffer.toString('base64'), _binary: true };
  }
  return { ok: resp.ok, status: resp.status, headers, body: buffer.toString('utf-8') };
}

module.exports = { http1Fetch };
