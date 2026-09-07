/**
 * v0.39 5 分钟自查 onboarding — state machine + localStorage 读写
 * 纯函数，不依赖 DOM，node:test 可直接跑。
 * 注意：node 无原生 localStorage，用 Map mock。
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// ---- Mock localStorage (node 环境没有) ----
const _store = new Map();
global.localStorage = {
  getItem: (key) => _store.has(key) ? _store.get(key) : null,
  setItem: (key, value) => _store.set(key, value),
  removeItem: (key) => _store.delete(key),
  clear: () => _store.clear(),
};

// ---- 纯状态机（从 geo-dashboard.js 复制算法，避免 require 浏览器模块）----
function obKey(brandId) { return 'acms-geo-onboarding-' + brandId; }
function _obResolveView(brandId, state) {
  if (!brandId) return 'hidden';
  if (state && state.completedAt) return 'mini';
  if (state && state.dismissed) return 'hidden';
  if (state && state.currentStep) return 'workflow';
  return 'banner';
}
function readObState(brandId) {
  try {
    const raw = localStorage.getItem(obKey(brandId));
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}
function writeObState(brandId, state) {
  try { localStorage.setItem(obKey(brandId), JSON.stringify(state)); } catch (_) {}
}
function clearObState(brandId) {
  try { localStorage.removeItem(obKey(brandId)); } catch (_) {}
}

// ---- 每个测试前清空 localStorage ----
test.afterEach(function () {
  _store.clear();
});

// ---- 测试 ----
test('v0.39 _obResolveView: hidden when no brandId', function () {
  assert.strictEqual(_obResolveView('', null), 'hidden');
  assert.strictEqual(_obResolveView(null, null), 'hidden');
  assert.strictEqual(_obResolveView(undefined, null), 'hidden');
});

test('v0.39 _obResolveView: banner when no state', function () {
  assert.strictEqual(_obResolveView('b1', null), 'banner');
  assert.strictEqual(_obResolveView('b1', undefined), 'banner');
  assert.strictEqual(_obResolveView('b1', {}), 'banner');
});

test('v0.39 _obResolveView: workflow when currentStep set', function () {
  assert.strictEqual(_obResolveView('b1', { currentStep: 1 }), 'workflow');
  assert.strictEqual(_obResolveView('b1', { currentStep: 2 }), 'workflow');
  assert.strictEqual(_obResolveView('b1', { currentStep: 3 }), 'workflow');
});

test('v0.39 _obResolveView: mini when completedAt present (overrides dismissed)', function () {
  const completed = { currentStep: 3, dismissed: false, completedAt: '2026-09-01T00:00:00.000Z' };
  assert.strictEqual(_obResolveView('b1', completed), 'mini');

  // 即使 dismissed=true，completedAt 优先
  const dismissedAndCompleted = { currentStep: 3, dismissed: true, completedAt: '2026-09-01T00:00:00.000Z' };
  assert.strictEqual(_obResolveView('b1', dismissedAndCompleted), 'mini');
});

test('v0.39 _obResolveView: hidden when dismissed (no completedAt)', function () {
  assert.strictEqual(_obResolveView('b1', { dismissed: true }), 'hidden');
  assert.strictEqual(_obResolveView('b1', { currentStep: 1, dismissed: true }), 'hidden');
});

test('v0.39 localStorage: write + read roundtrip', function () {
  const brandId = 'test_brand_001';
  writeObState(brandId, { currentStep: 1, dismissed: false });
  const got = readObState(brandId);
  assert.deepStrictEqual(got, { currentStep: 1, dismissed: false });
  clearObState(brandId);
});

test('v0.39 localStorage: read returns null for missing key', function () {
  const brandId = 'nonexistent_brand_xyz_999';
  assert.strictEqual(readObState(brandId), null);
});

test('v0.39 localStorage: completedAt renders mini', function () {
  const brandId = 'test_brand_complete_999';
  const now = new Date().toISOString();
  writeObState(brandId, { currentStep: 3, dismissed: false, completedAt: now });
  const state = readObState(brandId);
  assert.ok(typeof state.completedAt === 'string');
  assert.strictEqual(_obResolveView(brandId, state), 'mini');
  clearObState(brandId);
});

test('v0.39 localStorage: clear removes key', function () {
  const brandId = 'test_brand_clear_999';
  writeObState(brandId, { currentStep: 1 });
  assert.notStrictEqual(readObState(brandId), null);
  clearObState(brandId);
  assert.strictEqual(readObState(brandId), null);
});

test('v0.39 localStorage: malformed JSON returns null', function () {
  const brandId = 'test_brand_corrupt_999';
  try { localStorage.setItem(obKey(brandId), '{bad json'); } catch (_) {}
  assert.strictEqual(readObState(brandId), null);
  try { localStorage.removeItem(obKey(brandId)); } catch (_) {}
});

test('v0.39 localStorage: step progression', function () {
  const brandId = 'test_brand_progression_999';
  writeObState(brandId, { currentStep: 1 });
  assert.strictEqual(_obResolveView(brandId, readObState(brandId)), 'workflow');

  writeObState(brandId, { currentStep: 2 });
  assert.strictEqual(_obResolveView(brandId, readObState(brandId)), 'workflow');

  writeObState(brandId, { currentStep: 3, completedAt: new Date().toISOString() });
  assert.strictEqual(_obResolveView(brandId, readObState(brandId)), 'mini');

  clearObState(brandId);
});
