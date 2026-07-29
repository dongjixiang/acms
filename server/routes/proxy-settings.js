// ACMS · 代理设置 API（v0.XX Phase 1）
//
// 路由：
//   GET    /api/proxy-settings         获取当前代理配置 + 解析预览
//   PUT    /api/proxy-settings         写入配置（持久化到 config.json）
//   POST   /api/proxy-settings/test    用当前规则对一个 URL 试出（不走真实业务流）
//   DELETE /api/proxy-settings         重置为 config.json 默认（清空用户覆盖）

const express = require('express');
const router = express.Router();
const proxyResolver = require('../services/proxy-resolver');
const proxyFetch = require('../services/proxy-fetch');

// ─── 安全：白名单字段 + 协议白名单校验 ──────────────────────────────

const ALLOWED_FIELDS = ['enabled', 'default', 'rules', 'bypassLocal', 'sslBypass', 'respectEnv', 'allowSocks5', 'puppeteer'];

function sanitize(body) {
  const out = {};
  for (const k of ALLOWED_FIELDS) if (k in body) out[k] = body[k];
  // rules 必须是数组，每条 {match, via}
  if (Array.isArray(out.rules)) {
    out.rules = out.rules.filter(r => r && typeof r === 'object' && typeof r.match === 'string').map(r => ({
      match: String(r.match).slice(0, 200),
      via: typeof r.via === 'string' ? r.via.slice(0, 500) : '',
    }));
  }
  if (typeof out.sslBypass !== 'undefined' && !Array.isArray(out.sslBypass)) {
    out.sslBypass = [];
  }
  return out;
}

// ─── GET ─────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const cfg = proxyResolver.getConfig();
  // 决策预览：拿 3 个示例 URL 演示（OpenAI / 兜底域名 / 本地）
  const samples = ['https://api.openai.com/v1/models', 'https://example.com', 'http://127.0.0.1:3300/health'];
  const preview = samples.map(u => ({ url: u, decision: proxyResolver.resolveProxy(u) }));
  res.json({
    config: cfg,
    preview,
    source: 'config.json',
  });
});

// ─── PUT ─────────────────────────────────────────────────────────────

router.put('/', (req, res) => {
  const sanitized = sanitize(req.body || {});
  // v0.XX Phase 2.A: 验证 proxy URL 合法性（拒绝非允许协议）
  const validationErrs = proxyResolver.validateConfig(sanitized);
  if (validationErrs.length > 0) {
    return res.status(400).json({ error: 'INVALID_PROXY_URI', errors: validationErrs });
  }
  try {
    const saved = proxyResolver.setConfig(sanitized);
    // 清 dispatcher 缓存，让新规则立即生效
    proxyFetch._clearCache();
    res.json({ success: true, config: saved });
  } catch (e) {
    res.status(500).json({ error: 'PERSIST_FAILED', message: e.message });
  }
});

// ─── POST /test：dry-run 一次出站 ─────────────────────────────────────

router.post('/test', async (req, res) => {
  const { url, forceDirect, http1 } = req.body || {};
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL_REQUIRED' });
  try {
    const decision = proxyResolver.resolveProxy(url, { direct: !!forceDirect });
    if (decision.via === 'disabled') {
      return res.json({ ok: true, skipped: true, reason: '代理未启用', decision });
    }
    if (!/^https?:/i.test(url)) {
      return res.json({ ok: true, skipped: true, reason: '非 http(s) 协议，不经过代理', decision });
    }
    const result = await proxyFetch.testProxy(url, { forceDirect, http1: !!http1 });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'TEST_FAILED', message: e.message });
  }
});

// ─── DELETE：重置为默认 ───────────────────────────────────────────────

router.delete('/', (req, res) => {
  try {
    proxyResolver.setConfig({
      enabled: false,
      default: '',
      rules: [],
      bypassLocal: true,
      sslBypass: [],
      respectEnv: true,
    });
    proxyFetch._clearCache();
    res.json({ success: true, config: proxyResolver.getConfig() });
  } catch (e) {
    res.status(500).json({ error: 'RESET_FAILED', message: e.message });
  }
});

// ─── GET /proxy-browse — 通过代理浏览网页（web-browser iframe 用）───
// 用 Node 内置 http/https 模块直连 Squid（不依赖 undici ProxyAgent）
router.get('/proxy-browse', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('缺少 url 参数');

  try {
    const cfg = proxyResolver.getConfig();
    const decision = proxyResolver.resolveProxy(targetUrl);
    const proxyUri = decision && decision.proxy;
    
    let resp;
    if (proxyUri && cfg.enabled) {
      // 走代理：通过 Squid HTTP 端口转发
      resp = await proxyFetchViaHttpProxy(targetUrl, proxyUri);
    } else {
      // 直连
      resp = await simpleFetch(targetUrl);
    }

    // 透传关键头
    const passHeaders = ['content-type', 'content-length'];
    for (const h of passHeaders) {
      const val = resp.headers && typeof resp.headers.get === 'function' ? resp.headers.get(h) : resp.headers?.[h];
      if (val) res.setHeader(h, val);
    }
    // 去掉 X-Frame-Options 和 CSP 限制（让 iframe 能加载）
    res.removeHeader('x-frame-options');
    res.removeHeader('content-security-policy');

    const body = typeof resp.text === 'function' ? await resp.text() : resp.body;
    res.status(resp.status).send(body);
  } catch (e) {
    res.status(502).send(`代理请求失败: ${e.message}${e.cause ? ' (' + e.cause.message + ')' : ''}`);
  }
});

// ─── 通过 HTTP 代理转发请求（不用 undici ProxyAgent）───
async function proxyFetchViaHttpProxy(targetUrl, proxyUri) {
  const http = require('http');
  const https = require('https');
  const tls = require('tls');
  const net = require('net');
  const url = new URL(targetUrl);
  const proxy = new URL(proxyUri);
  const isHttps = url.protocol === 'https:';
  // 代理类型（HTTP 直连代理 / HTTPS 加密代理）
  const proxyIsHttps = proxy.protocol === 'https:';
  const proxyHost = proxy.hostname;
  const proxyPort = parseInt(proxy.port) || (proxyIsHttps ? 443 : 80);

  return new Promise((resolve, reject) => {
    // 先连代理（HTTP 直连 / HTTPS 先 TLS，TLS 失败时降级 HTTP）
    function connectToProxy(callback) {
      // 用本地 openssl 建立 TLS 隧道到 HTTPS 代理（Node.js TLS 在某些网络环境不可靠）
      if (proxyIsHttps) {
        var cp = require('child_process');
        // 查找 openssl 可执行文件
        var opensslBin = process.platform === 'win32' ? 'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe' : 'openssl';
        try { require('fs').accessSync(opensslBin); } catch (e) { opensslBin = 'openssl'; }
        var child = cp.spawn(opensslBin, [
          's_client', '-connect', proxyHost + ':' + proxyPort,
          '-quiet', '-servername', proxyHost
        ], { stdio: ['pipe', 'pipe', 'pipe'] });
        var connected = false;
        var buf = '';
        child.stdout.on('data', function (chunk) {
          buf += chunk.toString();
          if (!connected && buf.includes('---')) {
            connected = true;
            callback(child.stdin, child.stdout, child);
          }
        });
        child.on('error', function (e) {
          console.warn('[proxy-browse] openssl 失败, 降级 HTTP:', e.message);
          var fb = (proxyPort === 5419 || proxyPort === 443) ? 5418 : proxyPort;
          var sock = require('net').createConnection({ host: proxyHost, port: fb }, function () { callback(sock, sock); });
          sock.on('error', reject);
        });
        // 超时保护
        var tmr = setTimeout(function () {
          if (!connected) { child.kill(); console.warn('[proxy-browse] openssl 超时, 降级 HTTP'); }
        }, 10000);
        child.on('exit', function () { clearTimeout(tmr); });
        return;
      }
      // HTTP 代理：直连 TCP
      var sock = require('net').createConnection({ host: proxyHost, port: proxyPort }, function () { callback(sock, sock); });
      sock.on('error', reject);
    }

    connectToProxy(function(writer, reader) {
      // 发送 CONNECT 请求
      var connectReq = 'CONNECT ' + url.hostname + ':' + (url.port || (isHttps ? 443 : 80)) + ' HTTP/1.1\r\nHost: ' + url.hostname + '\r\nProxy-Connection: Keep-Alive\r\n\r\n';
      writer.write(connectReq);

      var buf = '';
      reader.on('data', function(chunk) {
        buf += chunk.toString();
        if (buf.indexOf('\r\n\r\n') >= 0) {
          var statusLine = buf.split('\r\n')[0];
          var status = parseInt(statusLine.split(' ')[1]) || 502;
          if (status !== 200) {
            return reject(new Error('代理 CONNECT 失败: ' + statusLine));
          }
          // CONNECT 成功，通过隧道发 HTTP 请求
          finishViaTunnel(isHttps, url, writer, reader, resolve, reject);
        }
      });
      reader.on('error', reject);
      writer.on('error', reject);
    });
  });
}

// ─── 通过已建立的 CONNECT 隧道发 HTTP 请求 ───
function finishViaTunnel(isHttps, url, writer, reader, resolve, reject) {
  var reqPath = url.pathname + url.search || '/';
  if (isHttps) {
    // HTTPS 目标：通过隧道做 TLS 握手
    var tls = require('tls');
    var tlsSocket = tls.connect({ socket: reader, servername: url.hostname, rejectUnauthorized: false }, function () {
      tlsSocket.write('GET ' + reqPath + ' HTTP/1.1\r\nHost: ' + url.hostname + '\r\nConnection: close\r\n\r\n');
      var data = '';
      tlsSocket.on('data', function (d) { data += d.toString(); });
      tlsSocket.on('end', function () {
        var h = data.indexOf('\r\n\r\n');
        if (h < 0) return reject(new Error('无 HTTP 响应头'));
        resolve({ status: parseInt(data.split('\r\n')[0].split(' ')[1]) || 502, headers: {}, text: function () { return Promise.resolve(data.substring(h + 4)); } });
      });
      tlsSocket.on('error', reject);
    });
    tlsSocket.on('error', reject);
  } else {
    // HTTP 目标：直接发请求
    writer.write('GET ' + reqPath + ' HTTP/1.1\r\nHost: ' + url.hostname + '\r\nConnection: close\r\n\r\n');
    var data = '';
    reader.on('data', function (d) { data += d.toString(); });
    reader.on('end', function () {
      var h = data.indexOf('\r\n\r\n');
      if (h < 0) return reject(new Error('无 HTTP 响应头'));
      resolve({ status: parseInt(data.split('\r\n')[0].split(' ')[1]) || 502, headers: {}, text: function () { return Promise.resolve(data.substring(h + 4)); } });
    });
  }
}

// ─── 直连 HTTP/HTTPS ───
async function simpleFetch(targetUrl) {
  const url = require('url');
  const http = require('http');
  const https = require('https');
  const parsed = new URL(targetUrl);
  const mod = parsed.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = mod.get(targetUrl, { timeout: 15000 }, (resp) => {
      let data = '';
      resp.on('data', chunk => { data += chunk; });
      resp.on('end', () => {
        resolve({
          status: resp.statusCode,
          headers: resp.headers,
          text: () => Promise.resolve(data),
        });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('直连超时')); });
  });
}

module.exports = router;
