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

module.exports = router;
