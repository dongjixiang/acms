// ACMS · HTTP/1.1 fetch 工具
// Node 内置 fetch 默认用 HTTP/2，导致 120 服务器（阿里云）连 Cloudflare 的 Agnes API 握手后永久挂死
// 本工具用 Node https/http（HTTP/1.1）实现，避免此问题
// v0.22.16

const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * HTTP/1.1 请求（替代 Node fetch，避免 HTTP/2 + Cloudflare 握手挂死）
 * opts: { method, headers, body, timeout }
 * 返回: { ok, status, headers, body } | { ok:false, error, status_code }
 */
function http1Fetch(urlStr, opts = {}) {
  return new Promise((resolve) => {
    try {
      const url = new URL(urlStr);
      const isHttps = url.protocol === 'https:';
      const mod = isHttps ? https : http;
      const bodyData = opts.body ? Buffer.from(opts.body) : null;

      const reqOpts = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: opts.method || 'GET',
        headers: Object.assign({
          'Host': url.hostname,
          'User-Agent': 'ACMS/1.0',
        }, opts.headers || {}),
        rejectUnauthorized: false,
        timeout: opts.timeout || 60000,
      };

      if (bodyData) {
        reqOpts.headers['Content-Length'] = bodyData.length;
      }

      const req = mod.request(reqOpts, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          resolve({ ok: true, status: res.statusCode, headers: res.headers, body });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: '请求超时', status_code: 408 });
      });

      req.on('error', (e) => {
        resolve({ ok: false, error: e.message, status_code: 0 });
      });

      if (bodyData) req.write(bodyData);
      req.end();
    } catch (e) {
      resolve({ ok: false, error: e.message, status_code: 0 });
    }
  });
}

module.exports = { http1Fetch };
