// scripts/inspect-qwen-config.js
const Database = require('better-sqlite3');
const db = new Database('./data/acms.db', { readonly: true });
const rows = db.prepare("SELECT * FROM system_configs WHERE id LIKE 'qwen%' OR doc LIKE 'qwen%'").all();
console.log('count:', rows.length);
console.log(JSON.stringify(rows.slice(0, 5), null, 2));
db.close();