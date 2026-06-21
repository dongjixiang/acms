// 浏览器辅助抓取 — puppeteer headless Chromium（v0.14，2026-06-21）
//
// 使用场景：
//   - url-fetch.js 的 fetch + curl fallback 都遇到反爬时（百度安全验证等）
//   - 浏览器能执行 JS，绕过 Cloudflare / 百度云 WAF 的 JS challenge
//   - 比 puppeteer 轻 1000 倍? 不，puppeteer 重 (~150MB Chromium)。
//     但百度等网站必须有 JS 执行能力才放行，这是最轻的"能跑 JS"的方案。
//
// 架构：
//   - 单例 browser（lazy init），第一次 fetch 时启动
//   - 后续 fetch 复用 browser（冷启动 3-5s，复用后 < 1s）
//   - 每个 fetch 开新 tab + 关 tab（不关闭 browser）
//   - 进程退出时 cleanup（close browser）
//
// 安全：
//   - 30s 超时（防 Puppeteer 卡死）
//   - `--no-sandbox`（Linux 服务器必须）
//   - 页面关闭 + 异常处理（不泄漏 page 实例）

const puppeteer = require('puppeteer');

const BROWSER_TIMEOUT_MS = 45000;  // 45s（百度百科 JS 渲染慢 + 冷启动 3-5s）
const PAGE_WAIT_SECONDS = 5;  // 等 JS 执行 + 反爬验证完成

let _browser = null;
let _launching = null;  // Promise，防并发启动

async function launchBrowser() {
  // 检查 _browser 是否有效（typeof + try/catch 防御）
  let isValid = false;
  if (_browser && typeof _browser.isConnected === 'function') {
    try {
      isValid = _browser.isConnected();
    } catch (e) {
      // isConnected 抛异常说明对象已损坏，重新启动
      console.warn('[browser-fetch] _browser 状态异常，重新启动:', e.message);
      _browser = null;
    }
  } else if (_browser) {
    // _browser 存在但没有 isConnected 方法（旧实例/损坏）
    console.warn('[browser-fetch] _browser 无 isConnected 方法，重置');
    _browser = null;
  }
  if (isValid) return _browser;
  if (_launching) return _launching;

  _launching = (async () => {
    try {
      // 尝试 puppeteer 默认路径找 chrome.exe，如果缺文件则试 chrome-headless-shell
      const launchOpts = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-sync',
        ],
        timeout: 30000,
      };

      // 自动检测 chrome-headless-shell（当 chrome.exe 缺失时用）
      let exePath;
      try {
        exePath = await puppeteer.executablePath();
        // 验证文件存在
        try { require('fs').accessSync(exePath); } catch (e) { exePath = null; }
      } catch (e) { exePath = null; }

      if (!exePath) {
        // 找到 chrome-headless-shell 路径
        const baseDir = require('path').join(
          require('os').homedir(),
          '.cache', 'puppeteer', 'chrome-headless-shell'
        );
        const { readdirSync } = require('fs');
        const entries = readdirSync(baseDir, { withFileTypes: true });
const verDir = entries.find(d => d.isDirectory() && d.name.startsWith('win64-'));
        if (verDir) {
          exePath = require('path').join(baseDir, verDir.name, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
        }
      }

      if (exePath) {
        launchOpts.executablePath = exePath;
        console.log(`[browser-fetch] 使用浏览器: ${exePath}`);
      } else {
        console.warn('[browser-fetch] 未找到浏览器可执行文件');
      }

      _browser = await puppeteer.launch(launchOpts);
      return _browser;
    } finally {
      _launching = null;
    }
  })();

  return _launching;
}

/**
 * 通过浏览器抓取 URL 纯文本内容
 * @param {string} url
 * @returns {Promise<{title: string, text: string, htmlLength: number} | {error: string}>}
 */
async function browserFetch(url) {
  let browser;
  try {
    browser = await launchBrowser();
  } catch (e) {
    return { error: `浏览器启动失败: ${e.message}（需要 Chromium，首次 npm install 会自动下载）` };
  }

  let page = null;
  try {
    page = await browser.newPage();
    // 设置超时
    await page.setDefaultNavigationTimeout(BROWSER_TIMEOUT_MS);
    // 设置 User-Agent（与 url-fetch.js 保持一致）
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    // 设置额外 header
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': 'https://baike.baidu.com/',
    });

    // 导航（使用 domcontentloaded，不等全部资源加载）
    //   networkidle0 在百度百科等带持续轮询/广告的页面会超时
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: BROWSER_TIMEOUT_MS,
    });

    // 额外等几秒让 JS 执行 + 反爬验证完成
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 移除噪声元素（更完整的 CSS selector，覆盖百度百科/rss 等常见网站）
    await page.evaluate(() => {
      document.querySelectorAll('script, style, iframe, noscript, ' +
        'nav, header, footer, aside, ' +
        '.ad, .ads, .advertisement, .banner, .promo, .promotion, ' +
        '.sidebar, .aside, .menu, .navigation, .navbar, .nav, .top-nav, .bottom-nav, ' +
        '.comment, .comment-area, .comment-list, .social, .share, .share-box, .share-bar, ' +
        '.search, .search-box, .search-bar, .search-form, ' +
        '.recommend, .recommend-list, .related, .related-article, ' +
        '.breadcrumb, .pagination, .toolbar, .tool-box, ' +
        '.footer-bar, .copyright, .copyright-bar, .copyright-footer, ' +
        '.login, .login-box, .register, .register-box, .user-info, .user-panel, ' +
        '.tips, .notice, .alert, .hot, .hot-topic, .hot-article, ' +
        '#header, #footer, #nav, #menu, ' +
        '[class*=ad-], [class*=banner], [class*=promo], [class*=recommend], ' +
        '[class*=sidebar], [class*=toolbar], [class*=copyright], ' +
        '[id*=ad], [id*=banner], [id*=sidebar], [id*=toolbar]')
        .forEach(el => el.remove());
    });

    // 提取 title + 纯文本
    const title = await page.title();
    const bodyText = await page.evaluate(() => document.body?.textContent?.replace(/\s+/g, ' ').trim() || '');

    // v0.14：取原始 HTML（保存到知识库用）
    const rawHtml = await page.content();

    // v0.14：全页截图（base64 PNG，保存到知识库用）
    let screenshot = null;
    try {
      screenshot = await page.screenshot({ fullPage: true, encoding: 'base64', type: 'png' });
    } catch (e) {
      console.warn('[browser-fetch] screenshot failed:', e.message);
    }

    return {
      title: title.slice(0, 200),
      text: bodyText,
      html: rawHtml,
      screenshot: screenshot,
      screenshotFormat: 'base64',
      finalUrl: url,
      htmlLength: bodyText.length,
    };
  } catch (e) {
    // 超时 / 重定向 / 其它异常
    const msg = e.message?.slice(0, 100) || String(e);
    return { error: `浏览器抓取失败: ${msg}` };
  } finally {
    if (page) {
      try { await page.close(); } catch (e) { /* 静默 */ }
    }
  }
}

// 进程退出时清理 browser（防僵尸进程）
process.on('exit', () => { if (_browser) _browser.close().catch(() => {}); });
process.on('SIGINT', () => { if (_browser) _browser.close().catch(() => {}); process.exit(0); });
process.on('SIGTERM', () => { if (_browser) _browser.close().catch(() => {}); process.exit(0); });

/**
 * 通过浏览器搜索网页
 * 打开搜狗搜索，等待 JS 渲染完成，提取搜索结果
 * @param {string} query - 搜索关键词
 * @param {number} [maxResults=8] - 最大结果数
 * @returns {Promise<{results: Array, error?: string}>}
 */
async function browserSearch(query, maxResults = 8) {
  let browser;
  try {
    browser = await launchBrowser();
  } catch (e) {
    return { error: `浏览器启动失败: ${e.message}`, results: [] };
  }

  let page = null;
  try {
    page = await browser.newPage();
    await page.setDefaultNavigationTimeout(30000);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9' });

const url = `https://www.sogou.com/web?query=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 等 JS 渲染 + 反爬验证
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 提取搜索结果（同时解码 sogou.com/link 重定向 URL）
    const results = await page.evaluate((max) => {
      const items = [];
      const seen = new Set();

      // 解码 sogou 重定向链接，提取真实 URL
      const resolveSogouLink = (rawUrl) => {
        const cleanUrl = (u) => {
          // 去掉 URL 末尾不该出现的标点（markdown 链接闭合 / 中文括号 / 等）
          return u.replace(/[\)\]）】」』.,;:!?。，；：！？]+$/, '');
        };

        try {
          // sogou 链接格式: https://www.sogou.com/link?url=BASE64&query=...&...
          const u = new URL(rawUrl);
          if (u.hostname.includes('sogou.com') && u.pathname === '/link') {
            const encoded = u.searchParams.get('url');
            if (encoded) {
              // 尝试 base64 解码
              try {
                // sogou 使用标准 base64，但可能带 URL-safe 字符
                let normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
                while (normalized.length % 4) normalized += '=';
                const decoded = atob(normalized);
                if (decoded.startsWith('http')) return cleanUrl(decoded);
              } catch {}
              // 退化：URL 解码
              try {
                const decoded = decodeURIComponent(encoded);
                if (decoded.startsWith('http')) return cleanUrl(decoded);
              } catch {}
            }
          }
        } catch {}
        return cleanUrl(rawUrl);
      };

      // 方法1：找标准结果块
      const blocks = document.querySelectorAll('.vrwrap, .rb-wrap, .vr5_wrap, [class*="result"], .vr-title');
      for (const block of blocks) {
        if (items.length >= max) break;
        const link = block.querySelector('a[href^="http"]');
        if (!link) continue;
        const rawUrl = link.href;
        const url = resolveSogouLink(rawUrl);
        const title = (link.textContent || '').trim();
        if (!title || seen.has(url)) continue;
        if (url.includes('sogou.com') && !url.includes('/web')) continue;
        seen.add(url);

        // 找摘要
        const snippetEl = block.querySelector('.str-text, .str_info, p, .str-summary, .des, .des_h');
        const snippet = snippetEl ? (snippetEl.textContent || '').trim() : '';

        items.push({ title: title.slice(0, 200), url, snippet: snippet.slice(0, 300) });
      }

      // 方法2：找页面所有 h3 > a
      if (items.length < max) {
        const h3Links = document.querySelectorAll('h3 a[href^="http"], h2 a[href^="http"]');
        for (const link of h3Links) {
          if (items.length >= max) break;
          const rawUrl = link.href;
          const url = resolveSogouLink(rawUrl);
          const title = (link.textContent || '').trim();
          if (!title || seen.has(url) || url.includes('sogou.com')) continue;
          seen.add(url);
          items.push({ title: title.slice(0, 200), url, snippet: '' });
        }
      }

      // 方法3：所有带文本的链接
      if (items.length < max) {
        const allLinks = document.querySelectorAll('a[href^="http"]');
        for (const link of allLinks) {
          if (items.length >= max) break;
          const rawUrl = link.href;
          const url = resolveSogouLink(rawUrl);
          const title = (link.textContent || '').trim();
          if (!title || title.length < 5 || seen.has(url)) continue;
          if (url.includes('sogou.com') || url.includes('bing.com')) continue;
          seen.add(url);
          items.push({ title: title.slice(0, 200), url, snippet: '' });
        }
      }

      return items;
    }, maxResults);

    return { results };
  } catch (e) {
    return { error: `浏览器搜索失败: ${e.message}`, results: [] };
  } finally {
    if (page) { try { await page.close(); } catch {} }
  }
}

/** 测试用：清理浏览器实例 */
async function cleanup() {
  if (_browser) { try { await _browser.close(); } catch (e) {} _browser = null; }
}

module.exports = { browserFetch, launchBrowser, cleanup, browserSearch };
