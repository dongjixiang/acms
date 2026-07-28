// Quick verification script (will be deleted after test)
const pr = require('../server/services/proxy-resolver');
const pf = require('../server/services/proxy-fetch');
const r = require('../server/routes/proxy-settings');

console.log('resolver exports:', Object.keys(pr).slice(0, 8));
console.log('fetch exports:', Object.keys(pf));
console.log('routes type:', typeof r);

console.log('\n-- Initial config --');
console.log(JSON.stringify(pr.getConfig(), null, 2));

console.log('\n-- Disabled state --');
pr.setConfig({ enabled: false });
console.log('openai.com:', JSON.stringify(pr.resolveProxy('https://api.openai.com/v1/test')));
console.log('localhost:', JSON.stringify(pr.resolveProxy('http://127.0.0.1:3300/health')));
console.log('example.com:', JSON.stringify(pr.resolveProxy('https://example.com/')));

console.log('\n-- Enabled with rule --');
pr.setConfig({
  enabled: true,
  default: 'http://127.0.0.1:7890',
  rules: [
    { match: '*.openai.com', via: 'http://proxy-a:8080' },
    { match: 'api.agnes.com.cn', via: 'direct' },
  ],
  bypassLocal: true,
});
console.log('openai.com:', JSON.stringify(pr.resolveProxy('https://api.openai.com/v1/test')));
console.log('localhost:', JSON.stringify(pr.resolveProxy('http://127.0.0.1:3300/health')));
console.log('example.com (uses default):', JSON.stringify(pr.resolveProxy('https://example.com/')));
console.log('api.agnes.com.cn (direct):', JSON.stringify(pr.resolveProxy('https://api.agnes.com.cn/v1/x')));
console.log('anthropic glob match:', JSON.stringify(pr.resolveProxy('https://api.anthropic.com/v1/messages')));

console.log('\n-- Reset --');
pr.setConfig({ enabled: false, default: '', rules: [], bypassLocal: true, sslBypass: [], respectEnv: true });
console.log(JSON.stringify(pr.getConfig(), null, 2));
