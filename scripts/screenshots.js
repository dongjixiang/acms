const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:3300/client/index.html';
const OUT = path.join(__dirname, '..', 'screenshots');
const VIEWPORT = { width: 1400, height: 900 };

const pages = [
  { name: 'kanban', route: 'kanban', desc: 'AI Task Kanban Board' },
  { name: 'requirements', route: 'requirements', desc: 'Requirement Management' },
  { name: 'projects', route: 'projects', desc: 'Project Dashboard' },
  { name: 'delivery', route: 'delivery', desc: 'Delivery Management' },
  { name: 'reports', route: 'reports', desc: 'Reports & Analytics' },
  { name: 'admin', route: 'admin', desc: 'Admin Settings' },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  // Load the app first, wait for SPA to bootstrap
  console.log('🚀 Loading SPA...');
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));

  // Check if the app loaded
  const appState = await page.evaluate(() => ({
    hasApp: typeof window.App !== 'undefined',
    hasRouter: typeof window.showView !== 'undefined',
    title: document.querySelector('#header-title')?.textContent?.trim(),
  }));
  console.log(`   App loaded: ${JSON.stringify(appState)}`);

  for (const p of pages) {
    const outPath = path.join(OUT, p.name + '.png');
    console.log(`\n📸 ${p.name} — ${p.desc}`);

    // Navigate via SPA router
    await page.evaluate((route) => {
      window.location.hash = '#' + route;
      if (typeof window.showView === 'function') {
        const viewMap = {
          kanban: 'view-kanban', requirements: 'view-req', projects: 'view-projects',
          delivery: 'view-delivery', reports: 'view-reports', admin: 'view-admin',
        };
        window.showView(viewMap[route] || 'view-' + route);
      }
    }, p.route);

    await new Promise(r => setTimeout(r, 2000));

    await page.screenshot({ path: outPath, fullPage: false });
    const stats = fs.statSync(outPath);
    console.log(`   → ${(stats.size / 1024).toFixed(0)} KB written`);
  }

  await browser.close();

  // Verify uniqueness
  console.log('\n🔍 MD5 check:');
  const hashResults = {};
  for (const p of pages) {
    const pPath = path.join(OUT, p.name + '.png');
    if (fs.existsSync(pPath)) {
      const crypto = require('crypto');
      const hash = crypto.createHash('md5').update(fs.readFileSync(pPath)).digest('hex');
      hashResults[p.name] = hash;
    }
  }
  const unique = new Set(Object.values(hashResults));
  console.log(`   Unique screenshots: ${unique.size} / ${pages.length}`);
  if (unique.size > 1) console.log('✅ Different content captured!');
  else console.log('⚠️ All screenshots identical — SPA routing may need adjustment');
}

main().catch(err => {
  console.error('❌', err);
  process.exit(1);
});
