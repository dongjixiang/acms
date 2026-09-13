const AdmZip = require('adm-zip');
const fs = require('fs');

const files = [
  'C:/Users/swede/acms/server/public/office/9df8bc3b-eba9-44da-aea6-0bff4932347e.xlsx',
  'C:/Users/swede/acms/server/public/office/aee16b2b-ba6d-4692-a982-ffa86bc05846.xlsx',
];

for (const f of files) {
  console.log('\n=== ' + f.split('/').pop() + ' ===');
  const zip = new AdmZip(f);
  const wb = zip.readAsText('xl/workbook.xml');
  const sheetNames = wb.match(/sheet name="([^"]+)"/g) || [];
  console.log('Sheets:', sheetNames.map(s => s.match(/name="([^"]+)"/)[1]).join(', '));
  
  // 读每个 sheet 的前几行
  const sheets = zip.getEntries().filter(e => e.entryName.startsWith('xl/worksheets/') && e.entryName.endsWith('.xml'));
  for (const sheet of sheets) {
    const name = sheet.entryName.split('/').pop().replace('.xml', '');
    const xml = zip.readAsText(sheet.entryName);
    // 提取 cell values
    const cells = xml.match(/<c r="([A-Z]+\d+)"[^>]*>(?:<v>([^<]*)<\/v>|<f[^>]*>([^<]*)<\/f>)/g) || [];
    console.log('  [' + name + '] cells:', cells.slice(0, 20).map(c => c.match(/r="([A-Z]+\d+)"/)?.[1]).join(', '));
  }
}
