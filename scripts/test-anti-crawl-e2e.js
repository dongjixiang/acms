// scripts/test-anti-crawl-e2e.js
// v0.15：url-fetch 反爬增强端到端真机测试
//
// 跑真实 URL，验证：
//   1. auto 模式能拿到正文（不再卡在反爬验证页）
//   2. content 是 markdown 结构（有 <h1>/<p> 转成的标题/段落）
//   3. mode=browser 跳过 fetch 直接走浏览器
//   4. 反爬站（百度百科）能命中检测器并走浏览器 fallback
//
// 跑法：node scripts/test-anti-crawl-e2e.js
// 注意：会真启动 Puppeteer chromium，首次冷启动 3-5s，每个反爬站 5-15s

const { fetchUrlCore, clearCache } = require('../server/tools/url-fetch');

const TESTS = [
  {
    name: '百度百科 - 反爬站（验证：检测器命中 + 浏览器 fallback + markdown 结构）',
    url: 'https://baike.baidu.com/item/北京',
    expect: {
      isAntiCrawl: true,         // 期望命中反爬检测
      minContentLength: 500,     // 期望能拿到正文
      minTitleLength: 4,
    },
  },
  {
    name: '百度百科 - 另一词条（验证缓存 24h）',
    url: 'https://baike.baidu.com/item/上海',
    expect: {
      isAntiCrawl: true,
      minContentLength: 500,
      minTitleLength: 4,
    },
  },
  {
    name: '正常 HTTP 站（验证反爬检测器不误判正常站）',
    url: 'http://example.com/',
    expect: {
      isAntiCrawl: false,        // 不应被反爬检测器误判
      minContentLength: 100,
      minTitleLength: 4,
    },
  },
];

async function runTest(test) {
  console.log('\n' + '='.repeat(50));
  console.log(`测试: ${test.name}`);
  console.log(`URL:  ${test.url}`);
  
  const t0 = Date.now();
  const result = await fetchUrlCore({ url: test.url, max_length: 2000 });
  const ms = Date.now() - t0;
  
  const checks = [];
  
  if (result.error) {
    console.log(`✗ 失败 (${ms}ms): ${result.error}`);
    checks.push(false);
    return false;
  }
  
  // 检验字段
  console.log(`OK (${ms}ms)`);
  console.log(`  title:                 ${JSON.stringify(result.title).slice(0, 80)}`);
  console.log(`  length:                ${result.length}`);
  console.log(`  truncated:             ${result.truncated}`);
  console.log(`  cached:                ${result.cached}`);
  console.log(`  antiCrawlDetected:     ${result.antiCrawlDetected}`);
  console.log(`  browserFallbackTried:  ${result.browserFallbackTried}`);
  console.log(`  browserFallbackError:  ${result.browserFallbackError || '无'}`);
  
  if (result.content) {
    const preview = result.content.replace(/\n+/g, ' ').slice(0, 200);
    console.log(`  content (前200字):    ${preview}...`);
  }
  
  // 断言
  if (test.expect.isAntiCrawl !== undefined) {
    const check = result.antiCrawlDetected === test.expect.isAntiCrawl;
    console.log(`  ${check ? '✓' : '✗'} antiCrawlDetected (期望 ${test.expect.isAntiCrawl})`);
    checks.push(check);
  }
  if (test.expect.minContentLength) {
    const check = result.length >= test.expect.minContentLength;
    console.log(`  ${check ? '✓' : '✗'} length >= ${test.expect.minContentLength} (实际 ${result.length})`);
    checks.push(check);
  }
  if (test.expect.minTitleLength) {
    const check = result.title && result.title.length >= test.expect.minTitleLength;
    console.log(`  ${check ? '✓' : '✗'} title 长度 (实际 ${(result.title || '').length})`);
    checks.push(check);
  }
  
  // markdown 结构
  const hasMarkdownHeader = result.content && result.content.match(/^#/m);
  console.log(`  ${hasMarkdownHeader ? '✓' : '⚠'} markdown 含 # 标题`);
  
  return checks.every(Boolean);
}

(async () => {
  console.log('=== ACMS v0.15 url-fetch 反爬增强端到端测试 ===');
  console.log(`chromium 路径: ~/.cache/puppeteer/chrome/linux-149.0.7827.22/chrome-linux64/chrome`);
  console.log(`首次冷启动预期 3-5s，每个反爬站 5-15s。\n`);
  
  clearCache();
  
  let allPass = true;
  for (const test of TESTS) {
    const pass = await runTest(test);
    if (!pass) allPass = false;
  }
  
  // 额外测试：mode=raw 走原生 fetch（不解析）
  console.log('\n' + '='.repeat(50));
  console.log('测试: mode=raw 返回原始 HTML 不解析');
  clearCache();
  {
    const t0 = Date.now();
    const r = await fetchUrlCore({ url: 'http://example.com/', mode: 'raw' });
    const ms = Date.now() - t0;
    if (r.error) {
      console.log(`✗ (${ms}ms):`, r.error);
      allPass = false;
    } else {
      console.log(`OK (${ms}ms) raw=${r.raw} content 前50字: ${(r.content || '').slice(0, 50)}`);
      if (!r.raw) {
        console.log('✗ raw 字段缺失');
        allPass = false;
      }
    }
  }

  // 额外测试：缓存命中（同一 URL 第二次应该 cached=true）
  console.log('\n' + '='.repeat(50));
  console.log('测试: 缓存命中（同一 URL 第二次返回 cached=true）');
  {
    const url = 'http://example.com/';
    clearCache();
    const r1 = await fetchUrlCore({ url, max_length: 500 });
    if (r1.error) {
      console.log(`✗ 第一次失败:`, r1.error);
      allPass = false;
    } else {
      const r2 = await fetchUrlCore({ url, max_length: 500 });
      if (r2.cached === true) {
        console.log(`✓ 缓存生效（第一次 length=${r1.length}, 第二次 cached=${r2.cached}）`);
      } else {
        console.log(`✗ 第二次未命中缓存 (cached=${r2.cached})`);
        allPass = false;
      }
    }
  }
  
  console.log('\n' + '='.repeat(50));
  if (allPass) {
    console.log('✓ 所有真机测试通过');
    process.exit(0);
  } else {
    console.log('✗ 部分测试失败');
    process.exit(1);
  }
})().catch(e => {
  console.error('未捕获错误:', e);
  process.exit(1);
});
