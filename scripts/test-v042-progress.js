// 长时间等 tool call log
const puppeteer = require('puppeteer-core');
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  await page.setCacheEnabled(false);
  await page.goto('http://localhost:3300/client/index.html', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));
  await page.evaluate(() => { if (typeof openTask === 'function') openTask('T-MRDO0EE1'); });
  await new Promise(r => setTimeout(r, 90000));  // 90s

  const final = await page.evaluate(() => {
    const c = document.getElementById('task-detail-progress-container');
    if (!c) return { error: 'no container' };
    const logEl = c.querySelector('.progress-log');
    return {
      progressFillWidth: c.querySelector('.progress-fill')?.style.width,
      logElChildren: logEl?.children.length,
      allLines: Array.from(logEl?.children || []).map(c => c.textContent?.slice(0, 200)),
    };
  });
  console.log('=== final state (90s) ===');
  console.log(JSON.stringify(final, null, 2));

  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
