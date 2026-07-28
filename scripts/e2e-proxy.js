// E2E 验证：mock proxy + ACMS proxyFetch 集成
//   1. 起 mock HTTP proxy 在 18888
//   2. 模拟 ACMS 启用代理 + default 指向 mock
//   3. 通过 proxyFetch 发几个出站请求（httpbin.org / google / localhost）
//   4. 验证：mock proxy 日志里能看到请求 + proxyFetch 自己日志里能看到 via='rule/default/bypass-local'

process.env.MOCK_PROXY_PORT = '18888';

// 启动 mock proxy
const { spawn } = require('child_process');
const path = require('path');
const proxy = spawn(process.execPath, [path.join(__dirname, 'mock-proxy.js')], { stdio: 'pipe' });
let proxyLog = '';
proxy.stdout.on('data', d => { proxyLog += d.toString(); process.stdout.write(`[proxy] ${d}`); });
proxy.stderr.on('data', d => { proxyLog += d.toString(); process.stderr.write(`[proxy!] ${d}`); });

// 等 mock proxy 起来
setTimeout(async () => {
  try {
    const pr = require('../server/services/proxy-resolver');
    const pf = require('../server/services/proxy-fetch');

    console.log('\n==== 配置代理：mock proxy at 127.0.0.1:18888 ====');
    pr.setConfig({
      enabled: true,
      default: 'http://127.0.0.1:18888',
      rules: [
        { match: '*.githubusercontent.com', via: 'direct' },  // GitHub 资源强制直连
      ],
      bypassLocal: true,
    });

    console.log('\n==== 测试 1：httpbin.org/get (HTTPS，预期走 default 代理) ====');
    try {
      const r1 = await pf.testProxy('https://httpbin.org/get?abc=123');
      console.log('  status:', r1.status, 'via:', r1.decision.via, 'proxy:', r1.decision.proxy);
      console.log('  body sample:', r1.bodySample?.slice(0, 200));
    } catch (e) {
      console.log('  ERR:', e.message);
    }

    console.log('\n==== 测试 2：raw.githubusercontent.com (HTTPS，预期 rule → direct) ====');
    try {
      const r2 = await pf.testProxy('https://raw.githubusercontent.com/acms/test/main/README.md', { forceDirect: true });
      console.log('  status:', r2.status, 'via:', r2.decision.via, 'proxy:', r2.decision.proxy);
    } catch (e) {
      console.log('  ERR:', e.message);
    }

    console.log('\n==== 测试 3：localhost (HTTP，预期 bypass-local) ====');
    try {
      const r3 = await pf.testProxy('http://127.0.0.1:3300/health');
      console.log('  status:', r3.status, 'via:', r3.decision.via, 'proxy:', r3.decision.proxy);
    } catch (e) {
      console.log('  ERR:', e.message);
    }

    console.log('\n==== 测试 4：带 bypassLocal=false 的内部请求 ====');
    pr.setConfig({ enabled: true, default: 'http://127.0.0.1:18888', rules: [], bypassLocal: false });
    try {
      const r4 = await pf.testProxy('http://127.0.0.1:3300/health');
      console.log('  status:', r4.status, 'via:', r4.decision.via, 'proxy:', r4.decision.proxy);
    } catch (e) {
      console.log('  ERR:', e.message);
    }

    console.log('\n==== 测试 5：disabled 状态 ====');
    pr.setConfig({ enabled: false });
    try {
      const r5 = await pf.testProxy('https://httpbin.org/get');
      console.log('  status:', r5.status, 'via:', r5.decision.via, 'proxy:', r5.decision.proxy);
    } catch (e) {
      console.log('  ERR:', e.message);
    }

  } catch (e) {
    console.error('FATAL', e);
  } finally {
    setTimeout(() => { proxy.kill(); process.exit(0); }, 1500);
  }
}, 800);
