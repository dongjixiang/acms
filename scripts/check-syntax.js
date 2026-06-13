// 一次性语法检查脚本（v0.3.3 B+++ 改完后 verify）
const files = [
  'server/services/assists/visual.js',
  'server/services/assists/index.js',
  'server/services/assists/router.js',
  'server/services/rewrite-description.js',
  'server/routes/requirements.js',
];
const clientFiles = [
  'client/js/views/assists/dispatcher.js',
  'client/js/views/assists/visual.js',
  'client/js/views/assists/decision-tree.js',
  'client/js/views/requirements.js',
];

let hasErr = false;
for (const f of files) {
  try {
    require('../' + f);
    console.log('OK  ' + f);
  } catch (e) {
    if (e.message.includes('OPENAI') || e.message.includes('API') || e.message.includes('ENOENT')) {
      console.log('OK(runtime-missing)  ' + f + ' :: ' + e.message.split('\n')[0]);
    } else {
      console.log('ERR ' + f + ' :: ' + e.message);
      hasErr = true;
    }
  }
}
const fs = require('fs');
for (const f of clientFiles) {
  try {
    new Function(fs.readFileSync(f, 'utf8'));
    console.log('OK  ' + f);
  } catch (e) {
    console.log('ERR ' + f + ' :: ' + e.message);
    hasErr = true;
  }
}
process.exit(hasErr ? 1 : 0);
