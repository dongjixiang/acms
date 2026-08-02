const puppeteer = require('puppeteer-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
puppeteer.use(stealth());

const chromePath = 'C:/Users/swede/.cache/puppeteer/chrome/win64-149.0.7827.22/chrome-win64/chrome.exe';

async function test() {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: chromePath,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  
  const page = await browser.newPage();
  await page.goto('https://baike.baidu.com/item/卧龙传/865215', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));
  const title = await page.title();
  console.log('Puppeteer Chrome Title:', title);
  await browser.close();
}

test().catch(e => console.error('Error:', e.message));
