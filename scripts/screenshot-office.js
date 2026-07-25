// ACMS Office 编辑器 OO 风格截图脚本
// 用 puppeteer-core + 系统 Chrome, 注入 token + 打开三个 office 窗口截图
// v0.62.5: 截图 PR-A OO 风格改造效果, 给多多 review

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const TOKEN = fs.readFileSync('/tmp/acms_token.txt', 'utf-8').trim();
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://localhost:3300';
const OUT_DIR = 'C:\\Users\\swede\\acms\\data\\office-screenshots-v0.62.5';

async function main() {
  // 确保输出目录
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });

  // 1. 注入 token (在加载任何页面之前)
  await page.evaluateOnNewDocument((tok) => {
    localStorage.setItem('acms-token', tok);
    localStorage.setItem('acms-user', JSON.stringify({
      id: 'guest_office-screenshot-tool',
      username: 'guest_t-tool',
      displayName: '游客',
      role: 'guest',
      isGuest: true,
    }));
  }, TOKEN);

  // 2. 加载主界面
  console.log('[1/4] loading main UI...');
  await page.goto(`${BASE}/client/index.html`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000)); // 等组件加载

  // 3. 截图桌面（看登录后 + 主题）
  await page.screenshot({ path: path.join(OUT_DIR, '01-desktop.png'), fullPage: false });
  console.log('  saved 01-desktop.png');

  // 4. 打开 office-word / xlsx / pptx 三个窗口
  const editors = [
    { id: 'office-word', title: 'Word 文档', out: '02-word.png' },
    { id: 'office-xlsx', title: 'Excel 表格', out: '03-xlsx.png' },
    { id: 'office-pptx', title: 'PPT 演示', out: '04-pptx.png' },
  ];

  for (const ed of editors) {
    console.log(`[${ed.id}] opening via ACMSWin...`);
    await page.evaluate((pkgId) => {
      if (typeof ACMSWin !== 'undefined' && typeof ACMSWin.open === 'function') {
        ACMSWin.open(pkgId);
      } else if (typeof window.ACMSWin !== 'undefined' && typeof window.ACMSWin.open === 'function') {
        window.ACMSWin.open(pkgId);
      } else if (window.launchView) {
        window.launchView(pkgId);
      } else {
        console.log('no ACMSWin API, fallback click');
      }
    }, ed.id);
    await new Promise(r => setTimeout(r, 3000)); // 等窗口开 + 编辑器 mount

    await page.screenshot({ path: path.join(OUT_DIR, ed.out), fullPage: false });
    console.log(`  saved ${ed.out}`);
  }

  // 5. 看每个窗口 DOM 是否应用了 OO class
  console.log('\n=== DOM 验证 ===');
  for (const ed of editors) {
    const info = await page.evaluate((pkgId) => {
      // 找带 .oo-editor-* 的所有元素
      var allOo = document.querySelectorAll('[class*="oo-editor-"]');
      var found = null;
      allOo.forEach(el => {
        if (el.className.includes(pkgId.replace('office-',''))) found = el;
      });
      if (!found) return { found: false, allClasses: Array.from(allOo).map(e => e.className) };
      var dot = found.querySelector('.oo-modified-dot');
      var titlebar = found.querySelector('.oo-titlebar');
      var titleInput = found.querySelector('.oo-titlebar-name input');
      var bg = titlebar ? window.getComputedStyle(titlebar).backgroundColor : null;
      return {
        found: true,
        className: found.className,
        hasTitlebar: !!titlebar,
        hasDot: !!dot,
        hasInput: !!titleInput,
        titleBg: bg,
        titleValue: titleInput ? titleInput.value : null,
      };
    }, ed.id);
    console.log(`${ed.id}:`, JSON.stringify(info));
  }

  await browser.close();
  console.log('\n✓ 完成. 输出目录:', OUT_DIR);
}

main().catch(e => { console.error(e); process.exit(1); });