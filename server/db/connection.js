// SQLite 数据库 — 替换 JSON 文件存储
// 接口完全兼容旧 collection() API，上层代码零改动

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'acms.db');
const JSON_PATH = path.join(DATA_DIR, 'acms.json');

// 已知集合名列表（用于自动建表）
const KNOWN_COLLECTIONS = [
  'projects', 'project_members', 'project_environments', 'project_repos',
  'project_configs', 'requirements', 'clarification_threads', 'tasks',
  'agents', 'events', 'llm_models', 'skills', 'webhooks', 'knowledge_files',
  'requirement_knowledge', 'generators', 'system_configs',
  'users',
  // v0.55 自由对话多窗口：会话 + 消息历史（独立 collection，软删/回收站）
  'chat_sessions', 'chat_messages',
];

// === 初始化 ===
let db;
function init() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  db = new Database(DB_PATH);

  // 性能优化
  db.pragma('journal_mode = WAL');       // 写不阻塞读
  db.pragma('synchronous = NORMAL');     // 平衡安全与性能
  db.pragma('cache_size = -64000');      // 64MB 缓存（DB 13.6MB 整库可驻留，避免冷查询回盘卡 Node 主线程）
  db.pragma('wal_autocheckpoint = 2000'); // 默认 1000 → 2000，少 checkpoint 抖动
  db.pragma('temp_store = MEMORY');      // 临时表/排序走内存，避免临时文件落盘
  db.pragma('foreign_keys = ON');

  // 每 5 分钟 TRUNCATE 一次 WAL，避免 WAL 累积导致读路径变重
  setInterval(() => {
    try {
      const r = db.pragma('wal_checkpoint(TRUNCATE)');
      // r: [busy, log_pages, checkpointed_pages]
      if (r && r[1] > 100) console.log(`[DB] WAL checkpoint: ${r[1]} pages → ${r[2]} pages`);
    } catch (e) { console.error('[DB] WAL truncate failed:', e.message); }
  }, 5 * 60 * 1000);

  // 预建所有已知集合的表
  for (const name of KNOWN_COLLECTIONS) {
    ensureTable(name);
  }

  // 从 JSON 文件自动迁移（仅首次）
  migrateFromJSON();

  console.log('[DB] SQLite loaded');
}

// 确保表存在
function ensureTable(name) {
  db.exec(`CREATE TABLE IF NOT EXISTS "${name}" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc TEXT NOT NULL
  )`);
  // 为常用查询字段建索引
  const indexFields = {
    projects: ['id'],
    tasks: ['id', 'project_id', 'status', 'type', 'assigned_to', 'parent_id'],
    requirements: ['id', 'project_id', 'status'],
    agents: ['id'],
    webhooks: ['id'],
  };
  const fields = indexFields[name];
  if (fields) {
    for (const field of fields) {
      db.exec(`CREATE INDEX IF NOT EXISTS "idx_${name}_${field}" ON "${name}"(
        json_extract(doc, '$.${field}')
      )`);
    }
  }
}

// 从旧 JSON 文件迁移（仅当 SQLite 为空且有 JSON 文件时）
function migrateFromJSON() {
  if (!fs.existsSync(JSON_PATH)) return;

  // 检查 SQLite 是否已有数据
  const count = db.prepare('SELECT COUNT(*) as cnt FROM projects').get();
  if (count.cnt > 0) return;

  try {
    const jsonData = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
    let migrated = 0;

    // 遍历 JSON 中的集合
    for (const [name, docs] of Object.entries(jsonData)) {
      if (!Array.isArray(docs) || docs.length === 0) continue;
      ensureTable(name);

      const insert = db.prepare(`INSERT INTO "${name}" (doc) VALUES (?)`);
      const tx = db.transaction(() => {
        for (const doc of docs) {
          insert.run(JSON.stringify(doc));
          migrated++;
        }
      });
      tx();
    }

    console.log(`[DB] Migrated ${migrated} documents from JSON → SQLite`);

    // 重命名旧文件做备份
    fs.renameSync(JSON_PATH, JSON_PATH.replace('.json', '.json.bak'));
    console.log('[DB] Old JSON backed up to acms.json.bak');
  } catch (e) {
    console.error('[DB] Migration failed:', e.message);
    console.log('[DB] Starting with empty SQLite database');
  }
}

// === Collection API（完全兼容旧接口）===
function collection(name) {
  ensureTable(name);

  const parseDoc = (row) => {
    try { return JSON.parse(row.doc); } catch { return row.doc; }
  };

  return {
    /** 过滤文档，返回匹配数组 */
      find(predicate) {
        const rows = db.prepare(`SELECT id, doc FROM "${name}"`).all();
        return rows.map(r => parseDoc(r)).filter(predicate);
      },

      /** 查找第一个匹配文档 */
      findOne(predicate) {
        const rows = db.prepare(`SELECT id, doc FROM "${name}"`).all();
        for (const row of rows) {
          const doc = parseDoc(row);
          if (predicate(doc)) return doc;
        }
        return null;
      },

      /** 插入文档 */
      insert(doc) {
        const stmt = db.prepare(`INSERT INTO "${name}" (doc) VALUES (?)`);
        stmt.run(JSON.stringify(doc));
        return doc;
      },

      /** 更新第一个匹配的文档 */
      update(predicate, updates) {
        const rows = db.prepare(`SELECT id, doc FROM "${name}"`).all();
        for (const row of rows) {
          const doc = parseDoc(row);
          if (predicate(doc)) {
            Object.assign(doc, updates);
            db.prepare(`UPDATE "${name}" SET doc = ? WHERE id = ?`)
              .run(JSON.stringify(doc), row.id);
            return doc;
          }
        }
        return null;
      },

      /** 删除所有匹配的文档 */
      remove(predicate) {
        const rows = db.prepare(`SELECT id, doc FROM "${name}"`).all();
        let deleted = 0;
        for (const row of rows) {
          const doc = parseDoc(row);
          if (predicate(doc)) {
            db.prepare(`DELETE FROM "${name}" WHERE id = ?`).run(row.id);
            deleted++;
          }
        }
        return deleted > 0;
      },

    /** 返回所有文档（浅拷贝，防止调用者 mutate 影响缓存）*/
    all() {
      return db.prepare(`SELECT id, doc FROM "${name}"`).all().map(r => parseDoc(r));
    },

    /** 计数 */
    count(predicate) {
      if (!predicate) {
        return db.prepare(`SELECT COUNT(*) as cnt FROM "${name}"`).get().cnt;
      }
      return this.find(predicate).length;
    },
  };
}

// 关闭数据库（进程退出时）
function close() {
  if (db) db.close();
}

process.on('exit', close);
process.on('SIGINT', () => { close(); process.exit(); });

init();

module.exports = { collection, close };
