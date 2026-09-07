'use strict';

// ACMS 邮件 v2.0 — Profile（身份）CRUD store
// collection: email_profiles
// doc 形状：
//   {
//     id: 'ep_xxx',
//     name: '大多多',
//     avatar: '👨',
//     color: '#4ecdc4',
//     type: 'personal' | 'family' | 'work' | 'other',
//     pin_hash: 'scrypt$16384$8$1$<salt>$<hash>',
//     settings: { lock_minutes: 30, auto_lock: true, theme: null },
//     created_at: <iso>,
//     last_active_at: <iso>,
//   }

const { collection } = require('../db/connection');
const pinService = require('./email-pin-service');

const COLL = 'email_profiles';

function makeId() {
  return 'ep_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function coll() { return collection(COLL); }

// 公开字段（不含 pin_hash）
function publicView(p) {
  if (!p) return null;
  // eslint-disable-next-line no-unused-vars
  const { pin_hash, ...rest } = p;
  return rest;
}

function list() {
  return coll().all().map(publicView).sort((a, b) =>
    (a.last_active_at || a.created_at).localeCompare(b.last_active_at || b.created_at) * -1
  );
}

function get(id) {
  return publicView(coll().findOne(p => p.id === id));
}

function getRaw(id) {
  return coll().findOne(p => p.id === id);
}

function create({ name, avatar, color, type, pin, settings }) {
  if (!name || !String(name).trim()) throw new Error('name 不能为空');
  const err = pinService.validatePin(pin);
  if (err) throw new Error(err);

  const validTypes = ['personal', 'family', 'work', 'other'];
  const t = validTypes.includes(type) ? type : 'other';

  const doc = {
    id: makeId(),
    name: String(name).trim(),
    avatar: avatar || '👤',
    color: color || '#4ecdc4',
    type: t,
    pin_hash: pinService.hash(String(pin)),
    settings: settings || { lock_minutes: 30, auto_lock: true },
    created_at: new Date().toISOString(),
    last_active_at: null,
  };
  coll().insert(doc);
  return publicView(doc);
}

function update(id, updates) {
  const existing = getRaw(id);
  if (!existing) return null;

  const allowed = ['name', 'avatar', 'color', 'type', 'settings'];
  const safeUpdates = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) safeUpdates[key] = updates[key];
  }
  if (updates.pin !== undefined) {
    const err = pinService.validatePin(updates.pin);
    if (err) throw new Error(err);
    safeUpdates.pin_hash = pinService.hash(String(updates.pin));
  }

  coll().update(p => p.id === id, safeUpdates);
  return get(id);
}

function touch(id) {
  coll().update(p => p.id === id, { last_active_at: new Date().toISOString() });
}

function remove(id) {
  return coll().remove(p => p.id === id);
}

function verifyPin(id, pin) {
  const raw = getRaw(id);
  if (!raw) return false;
  return pinService.verify(String(pin || ''), raw.pin_hash);
}

function count() {
  return coll().count();
}

module.exports = {
  list,
  get,
  create,
  update,
  remove,
  touch,
  verifyPin,
  count,
  // 内部用
  _coll: coll,
  _publicView: publicView,
};
