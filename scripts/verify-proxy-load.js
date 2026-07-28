// Final smoke test — verify all touched modules can require + routes register without syntax errors
const path = require('path');
process.chdir(path.join(__dirname, '..'));

const checks = [
  ['../server/services/proxy-resolver', 'proxy-resolver'],
  ['../server/services/proxy-fetch', 'proxy-fetch'],
  ['../server/routes/proxy-settings', 'proxy-settings routes'],
  ['../server/services/image-tools-service', 'image-tools-service'],
  ['../server/services/assists/music', 'assists/music'],
  ['../server/services/assists/video', 'assists/video'],
  ['../server/services/llm-adapter', 'llm-adapter'],
  ['../server/services/gen-adapter', 'gen-adapter'],
  ['../server/tools/url-fetch', 'tools/url-fetch'],
  ['../server/tools/http1-fetch', 'tools/http1-fetch (HTTP/1.1 wrapper)'],
  ['../server/tools/agnes-video', 'tools/agnes-video'],
  ['../server/mcp-tools', 'mcp-tools'],
  ['../server/app', 'Express app (with all routes registered)'],
];

let ok = 0, fail = 0;
for (const [mod, name] of checks) {
  try {
    require(mod);
    console.log(`✅ ${name}`);
    ok++;
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
    fail++;
  }
}

console.log(`\n${ok} ok, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
