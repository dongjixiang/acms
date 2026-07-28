// Mock HTTP proxy server — 记录所有 CONNECT + GET 请求，便于验证 ACMS 真的过代理出站
// Usage: node scripts/mock-proxy.js  (default listens on 18888)
const http = require('http');
const net = require('net');
const port = parseInt(process.env.MOCK_PROXY_PORT || '18888');

const log = (msg) => console.log(`[mock-proxy] ${new Date().toISOString()} ${msg}`);

// HTTP proxy: connect to upstream, parse request, forward
const proxy = http.createServer(async (req, res) => {
  log(`HTTP ${req.method} ${req.url} ← host=${req.headers.host}`);
  // 真正做一次 upstream 转发（验证逻辑）
  try {
    const [targetHost] = (req.headers.host || '').split(':');
    const proxyReq = http.request({
      hostname: targetHost,
      port: 80,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: req.headers.host },
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', (e) => {
      log(`  upstream error: ${e.message}`);
      res.writeHead(502).end(`upstream: ${e.message}`);
    });
    req.pipe(proxyReq);
  } catch (e) {
    log(`  proxy error: ${e.message}`);
    res.writeHead(500).end(e.message);
  }
});

// HTTPS proxy: CONNECT 隧道
proxy.on('connect', (req, clientSocket, head) => {
  const [host, port = '443'] = req.url.split(':');
  log(`CONNECT ${req.url} ← proxy=${port === '443' ? 'https' : 'tcp'}`);
  const upstream = net.connect(parseInt(port, 10), host, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  upstream.on('error', (e) => {
    log(`  CONNECT upstream error: ${e.message}`);
    clientSocket.end(`HTTP/1.1 502 Bad Gateway\r\n\r\n${e.message}`);
  });
  clientSocket.on('error', () => upstream.destroy());
  upstream.on('error', () => clientSocket.destroy());
});

proxy.listen(port, () => {
  console.log(`[mock-proxy] listening on http://127.0.0.1:${port}`);
  console.log(`[mock-proxy] logs all CONNECT + GET, forwards to real upstream for transparency`);
});
