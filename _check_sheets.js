const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const officeDir = 'C:/Users/swede/acms/server/public/office';
const generateDir = 'C:/Users/swede/acms/server/public/generate/assets';

function listSheets(dir, pattern) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx') && f.match(pattern || /.*/));
  for (const f of files) {
    const p = path.join(dir, f);
    try {
      const zip = new AdmZip(p);
      const wb = zip.readAsText('xl/workbook.xml');
      const sheets = wb.match(/sheet name="([^"]+)"/g) || [];
      console.log(f + ':', sheets.map(s => s.match(/name="([^"]+)"/)[1]).join(', '));
    } catch(e) {}
  }
}

console.log('=== office/ ===');
listSheets(officeDir, null);
console.log('\n=== generate/assets/ ===');
listSheets(generateDir, null);
