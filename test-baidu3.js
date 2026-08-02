const puppeteer = require('puppeteer');  // 不用 stealth 插件

const chromePath = 'C:/Users/swede/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';

async function test() {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: chromePath,
    args: ['--no-sandbox'],
  });
  
  const page = await browser.newPage();
  await page.goto('https://baike.baidu.com/item/卧龙传/865215', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));
  const title = await page.title();
  console.log('Plain Puppeteer Title:', title);
  await browser.close();
}

test().catch(e => console.error('Error:', e.message));
