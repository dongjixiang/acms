// L3 — App 化 Assist：后端自动扫描器
// 扫描 apps/ 目录，自动注册 assist service
// 每个 app 目录包含 manifest.json + service.js

const fs = require('fs');
const path = require('path');

const APPS_DIR = path.join(__dirname, '..', '..', 'apps');
const APPS_DIR_LEGACY = path.join(__dirname, '..', 'assists'); // 旧路径

// 已注册的 apps
let _apps = {};
let _manifestCache = null;

/**
 * 加载所有 app manifest
 */
function loadManifests() {
  if (_manifestCache) return _manifestCache;

  const apps = {};
  const scanDir = (dir) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(dir, entry.name, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        manifest._dir = path.join(dir, entry.name);
        if (!manifest.method) manifest.method = entry.name;
        apps[manifest.method] = manifest;
      } catch (e) {
        console.warn(`[apps] ⚠️  manifest 加载失败 ${manifestPath}: ${e.message}`);
      }
    }
  };

  scanDir(APPS_DIR);
  console.log(`[apps] ✅ 扫描到 ${Object.keys(apps).length} 个 app`);

  _manifestCache = apps;
  return apps;
}

/**
 * 注册所有 app 的 service（供 assist-index 调用）
 */
function registerAll() {
  const manifests = loadManifests();
  const services = {};

  for (const [method, manifest] of Object.entries(manifests)) {
    const servicePath = path.join(manifest._dir, 'service.js');
    if (fs.existsSync(servicePath)) {
      try {
        const svc = require(servicePath);
        services[method] = svc;
        console.log(`[apps]  ✅ 注册 service: ${method} (${manifest.name})`);
      } catch (e) {
        console.error(`[apps]  ❌ service 加载失败 ${method}: ${e.message}`);
      }
    }
  }

  _apps = services;
  return services;
}

/**
 * 获取所有已注册的 app 信息（含 manifest）
 */
function getAllApps() {
  const manifests = loadManifests();
  return Object.entries(manifests).map(([method, m]) => ({
    method,
    name: m.name,
    icon: m.icon || '🧩',
    type: m.type || 'clarify',
    description: m.description || '',
    field: m.field || `assist_${method}`,
  }));
}

/**
 * 获取单个 app 的 service
 */
function getAppService(method) {
  return _apps[method] || null;
}

/**
 * 获取单个 app 的 manifest
 */
function getAppManifest(method) {
  const manifests = loadManifests();
  return manifests[method] || null;
}

/**
 * 清除缓存（开发时用于 hot-reload）
 */
function clearCache() {
  _manifestCache = null;
  _apps = {};
}

module.exports = { loadManifests, registerAll, getAllApps, getAppService, getAppManifest, clearCache };
