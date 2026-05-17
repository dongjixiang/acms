// JSON 文件数据库 — 纯 JS，无需原生编译
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'acms.json');

// 内存数据库
let db = {
  projects: [],
  project_members: [],
  project_environments: [],
  project_repos: [],
  project_configs: [],
  requirements: [],
  clarification_threads: [],
  tasks: [],
  agents: [],
  events: [],
};

// 加载
function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); }
    catch (e) { console.log('[DB] Corrupted file, starting fresh'); }
  }
  // 确保所有集合存在
  const collections = ['projects','project_members','project_environments','project_repos','project_configs','requirements','clarification_threads','tasks','agents','events'];
  for (const c of collections) { if (!db[c]) db[c] = []; }
}

// 保存
function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 0), 'utf-8');
}

// 获取集合
function collection(name) {
  if (!db[name]) db[name] = [];
  return {
    find: (predicate) => db[name].filter(predicate),
    findOne: (predicate) => db[name].find(predicate) || null,
    insert: (doc) => { db[name].push(doc); save(); return doc; },
    update: (predicate, updates) => {
      const idx = db[name].findIndex(predicate);
      if (idx === -1) return null;
      Object.assign(db[name][idx], updates);
      save();
      return db[name][idx];
    },
    remove: (predicate) => {
      const idx = db[name].findIndex(predicate);
      if (idx === -1) return false;
      db[name].splice(idx, 1);
      save();
      return true;
    },
    all: () => db[name],
    count: (predicate) => predicate ? db[name].filter(predicate).length : db[name].length,
  };
}

// 初始化
load();
console.log('[DB] JSON store loaded');

module.exports = { collection, save, load };
