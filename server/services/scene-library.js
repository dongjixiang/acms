// P199/P200: 场景档案库服务（CRUD + 持久化到 data/scene-library.json）
//   数据模型对称 character-library — 含 sourceDocId/sourceDocName/shared（P200 按文档隔离）
//   归属三态：① 本文档 ② 通用（shared=true）③ 未绑定（文档内不可见）
//   scope: 'doc'（本文档+通用）/ 'all' / 'unassigned'

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LIB_FILE = path.join(__dirname, '..', '..', 'data', 'scene-library.json');

function load() {
  try {
    var d = JSON.parse(fs.readFileSync(LIB_FILE, 'utf-8'));
    if (!Array.isArray(d.scenes)) d.scenes = [];
    return d;
  } catch (e) {
    return { version: 1, scenes: [] };
  }
}

function save(data) {
  const tmp = LIB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, LIB_FILE);
}

function isVisibleInDoc(s, docId) {
  if (s.shared === true) return true;
  return !!docId && s.sourceDocId === docId;
}

function list(opts) {
  opts = opts || {};
  var data = load();
  var items = data.scenes || [];
  var docId = String(opts.docId || '').trim();
  var scope = opts.scope || (docId ? 'doc' : 'all');
  if (scope === 'all') return { version: data.version, scenes: items };
  if (scope === 'unassigned') {
    return { version: data.version, scenes: items.filter(function (s) { return !s.sourceDocId && !s.shared; }) };
  }
  return {
    version: data.version,
    scenes: items.filter(function (s) { return isVisibleInDoc(s, docId); })
  };
}

function get(id) { return load().scenes.find(function (s) { return s.id === id; }) || null; }

function create(payload) {
  var data = load();
  var name = String((payload && payload.name) || '').trim();
  if (!name) throw new Error('场景名必填');
  var scene = {
    id: 'scene-' + crypto.randomBytes(4).toString('hex'),
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
  data.scenes.push(scene);
  save(data);
  return scene;
}

function update(id, patch) {
  var data = load();
  var idx = data.scenes.findIndex(function (s) { return s.id === id; });
  if (idx < 0) throw new Error('场景不存在: ' + id);
  var allowed = ['name', 'aliases', 'description', 'referenceImage', 'tags', 'sourceDocId', 'sourceDocName', 'shared'];
  var updated = Object.assign({}, data.scenes[idx]);
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
  data.scenes[idx] = updated;
  save(data);
  return updated;
}

function remove(id) {
  var data = load();
  var before = data.scenes.length;
  data.scenes = data.scenes.filter(function (s) { return s.id !== id; });
  if (data.scenes.length === before) throw new Error('场景不存在: ' + id);
  save(data);
  return { ok: true };
}

function assignDoc(ids, docId, docName) {
  var data = load();
  var idSet = (Array.isArray(ids) && ids.length) ? {} : null;
  if (idSet) ids.forEach(function (i) { idSet[i] = true; });
  var n = 0;
  data.scenes = data.scenes.map(function (s) {
    var hit = idSet ? idSet[s.id] : (!s.sourceDocId && !s.shared);
    if (!hit) return s;
    s.sourceDocId = String(docId || '').trim();
    s.sourceDocName = String(docName || '').trim();
    if (s.sourceDocId) s.shared = false;
    s.updatedAt = new Date().toISOString();
    n++;
    return s;
  });
  save(data);
  return { ok: true, assigned: n };
}

function setShared(ids, shared) {
  var data = load();
  var idSet = (Array.isArray(ids) && ids.length) ? {} : null;
  if (idSet) ids.forEach(function (i) { idSet[i] = true; });
  var n = 0;
  data.scenes = data.scenes.map(function (s) {
    if (!idSet || !idSet[s.id]) return s;
    s.shared = shared === true;
    s.updatedAt = new Date().toISOString();
    n++;
    return s;
  });
  save(data);
  return { ok: true, updated: n };
}

function findByText(text, opts) {
  if (!text) return [];
  opts = opts || {};
  var scopeList = list(opts);
  var lower = String(text).toLowerCase();
  var scenes = scopeList.scenes || [];
  var hits = [];
  for (var i = 0; i < scenes.length; i++) {
    var s = scenes[i];
    var names = [s.name].concat(s.aliases || []);
    var matched = false;
    for (var j = 0; j < names.length; j++) {
      var n = String(names[j] || '').trim();
      if (n && lower.indexOf(n.toLowerCase()) >= 0) { matched = true; break; }
    }
    if (matched) hits.push(s);
  }
  return hits;
}

module.exports = {
  list: list, get: get, create: create, update: update, remove: remove,
  assignDoc: assignDoc, setShared: setShared, findByText: findByText
};
