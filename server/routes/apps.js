// Apps API — 列出已注册的 app
const express = require('express');
const router = express.Router();
const appManager = require('../services/app-manager');

// 获取所有已注册的 app
router.get('/', (req, res) => {
  const apps = appManager.getAllApps();
  res.json({ apps });
});

// 获取单个 app 的 manifest
router.get('/:method', (req, res) => {
  const manifest = appManager.getAppManifest(req.params.method);
  if (!manifest) return res.status(404).json({ error: 'APP_NOT_FOUND' });
  const { _dir, ...safe } = manifest;
  res.json({ app: safe });
});

// 更新 app 图标
router.patch('/:method/icon', (req, res) => {
  const { icon } = req.body;
  if (!icon || typeof icon !== 'string') {
    return res.status(400).json({ error: 'INVALID_ICON' });
  }
  const result = appManager.updateAppIcon(req.params.method, icon);
  if (result.error) {
    return res.status(result.error === 'APP_NOT_FOUND' ? 404 : 500).json(result);
  }
  res.json({ success: true });
});

module.exports = router;
