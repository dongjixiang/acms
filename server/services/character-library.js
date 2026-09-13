// P199/P200: 角色档案库服务（CRUD + 持久化到 data/character-library.json）
//   每个角色：id / name / aliases[] / description / referenceImage / tags[]
//             + sourceDocId / sourceDocName / shared（P200：按文档隔离）
//
// P200 数据隔离设计（2026-09-12 多多报「换文章还看到之前的人物」后加）：
//   三条归属状态，互斥：
//     ① 本文档   — sourceDocId === 当前文档 docId
//     ② 通用     — shared === true（显式标记，所有文档可见，适合跨作品复用的角色）
//     ③ 未绑定   — 既非本文档也非通用（历史数据/尚未归属）→ 在文档里**不显示**
//
//   ★ 关键：未绑定的历史数据在 'doc' 视图下不返回。
//     早期实现把「未绑定」当通用 → 换文档仍看到上一篇文章的角色（就是用户报的 bug）。
//
//   list(scope)：
//     'doc'（带 docId 时的默认）→ 本文档的 + 通用的
//     'all'                     → 全部（管理视图用）
//     'unassigned'              → 仅未绑定的（提示条 + 管理视图整理用）
//   assignDoc(ids, docId, docName) — 归到某文档（docId 空 = 退回未绑定）
//   setShared(ids, true/false)     — 设为/取消通用

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LIB_FILE = path.join(__dirname, '..', '..', 'data', 'character-library.json');

function load() {
  try {
    var d = JSON.parse(fs.readFileSync(LIB_FILE, 'utf-8'));
    if (!Array.isArray(d.characters)) d.characters = [];
    return d;
  } catch (e) {
    return { version: 1, characters: [] };
  }
}

function save(data) {
  // 原子写：先写 .tmp 再 rename，避免并发写半截文件
  const tmp = LIB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, LIB_FILE);
}

function isVisibleInDoc(c, docId) {
  if (c.shared === true) return true;
  return !!docId && c.sourceDocId === docId;
}

function list(opts) {
  opts = opts || {};
  var data = load();
  var items = data.characters || [];
  var docId = String(opts.docId || '').trim();
  var scope = opts.scope || (docId ? 'doc' : 'all');
  if (scope === 'all') return { version: data.version, characters: items };
  if (scope === 'unassigned') {
    return { version: data.version, characters: items.filter(function (c) { return !c.sourceDocId && !c.shared; }) };
  }
  // scope === 'doc'：本文档的 + 通用的（未绑定的**不**返回）
  return {
    version: data.version,
    characters: items.filter(function (c) { return isVisibleInDoc(c, docId); })
  };
}

function get(id) {
  var data = load();
  return data.characters.find(function (c) { return c.id === id; }) || null;
}

function create(payload) {
  var data = load();
  var name = String((payload && payload.name) || '').trim();
  if (!name) throw new Error('角色名必填');
  var char = {
    id: 'char-' + crypto.randomBytes(4).toString('hex'),
    name: name,
    aliases: Array.isArray(payload.aliases) ? payload.aliases.map(function (s) { return String(s).trim(); }).filter(Boolean) : [],
    description: String((payload && payload.description) || '').trim(),
    referenceImage: (payload && payload.referenceImage) || null,
    tags: Array.isArray(payload.tags) ? payload.tags.map(function (s) { return String(s).trim(); }).filter(Boolean) : [],
    sourceDocId: String((payload && payload.sourceDocId) || '').trim(),
    sourceDocName: String((payload && payload.sourceDocName) || '').trim(),
    shared: payload && payload.shared === true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  data.characters.push(char);
  save(data);
  return char;
}

function update(id, patch) {
  var data = load();
  var idx = data.characters.findIndex(function (c) { return c.id === id; });
  if (idx < 0) throw new Error('角色不存在: ' + id);
  var allowed = ['name', 'aliases', 'description', 'referenceImage', 'tags', 'sourceDocId', 'sourceDocName', 'shared'];
  var updated = Object.assign({}, data.characters[idx]);
  for (var i = 0; i < allowed.length; i++) {
    var key = allowed[i];
    if (patch && patch[key] !== undefined) updated[key] = patch[key];
  }
  if (Array.isArray(updated.aliases)) updated.aliases = updated.aliases.map(function (s) { return String(s).trim(); }).filter(Boolean);
  if (Array.isArray(updated.tags)) updated.tags = updated.tags.map(function (s) { return String(s).trim(); }).filter(Boolean);
  updated.sourceDocId = String(updated.sourceDocId || '').trim();
  updated.sourceDocName = String(updated.sourceDocName || '').trim();
  updated.shared = updated.shared === true;
  updated.updatedAt = new Date().toISOString();
  data.characters[idx] = updated;
  save(data);
  return updated;
}

function remove(id) {
  var data = load();
  var before = data.characters.length;
  data.characters = data.characters.filter(function (c) { return c.id !== id; });
  if (data.characters.length === before) throw new Error('角色不存在: ' + id);
  save(data);
  return { ok: true };
}

// 归到某文档；docId 传空 = 退回「未绑定」
function assignDoc(ids, docId, docName) {
  var data = load();
  var idSet = (Array.isArray(ids) && ids.length) ? {} : null;
  if (idSet) ids.forEach(function (i) { idSet[i] = true; });
  var n = 0;
  data.characters = data.characters.map(function (c) {
    var hit = idSet ? idSet[c.id] : (!c.sourceDocId && !c.shared); // 空 ids → 全部未绑定的
    if (!hit) return c;
    c.sourceDocId = String(docId || '').trim();
    c.sourceDocName = String(docName || '').trim();
    if (c.sourceDocId) c.shared = false; // 归到具体文档 → 取消通用标记
    c.updatedAt = new Date().toISOString();
    n++;
    return c;
  });
  save(data);
  return { ok: true, assigned: n };
}

// 设为 / 取消「通用」（跨文档复用）
function setShared(ids, shared) {
  var data = load();
  var idSet = (Array.isArray(ids) && ids.length) ? {} : null;
  if (idSet) ids.forEach(function (i) { idSet[i] = true; });
  var n = 0;
  data.characters = data.characters.map(function (c) {
    if (!idSet || !idSet[c.id]) return c;
    c.shared = shared === true;
    c.updatedAt = new Date().toISOString();
    n++;
    return c;
  });
  save(data);
  return { ok: true, updated: n };
}

// 按 name 或 alias 匹配（选中文字智能识别用）— 只匹配该文档可见的档案
function findByText(text, opts) {
  if (!text) return [];
  opts = opts || {};
  var scopeList = list(opts);
  var lower = String(text).toLowerCase();
  var hits = [];
  var chars = scopeList.characters || [];
  for (var i = 0; i < chars.length; i++) {
    var c = chars[i];
    var allNames = [c.name].concat(c.aliases || []);
    var matched = false;
    for (var j = 0; j < allNames.length; j++) {
      var n = String(allNames[j] || '').trim();
      if (!n) continue;
      if (lower.indexOf(n.toLowerCase()) >= 0) { matched = true; break; }
    }
    if (matched) hits.push(c);
  }
  return hits;
}

module.exports = {
  list: list, get: get, create: create, update: update, remove: remove,
  assignDoc: assignDoc, setShared: setShared, findByText: findByText
};
