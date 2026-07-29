// ACMS 桌面配置同步路由 — 让用户的桌面配置（壁纸、图标位置、固定项、自动排列）
// 从纯 localStorage 升级为「localStorage 优先 + 服务端可选同步」模式。
//
// 存储：复用 system_configs 表，key 形如 `user_desktop_<userId>`，value 是 JSON 完整文档。
// 为什么用 userId 而不是 username：避免 username 中特殊字符（中文、空格、emoji）污染 key。
//
// 鉴权：依赖 authMiddleware（已经在 /api/* 上挂载），但本路由额外要求是真实用户而非 system。
//
// 数据契约：
//   GET /api/desktop-config
//     200 → { config: {version,wallpaper,pinned,autoArrange,iconOverrides,wallpaperPresets,updatedAt} | null,
//             hasLocal: false }   // hasLocal 给前端判断要不要弹冲突对话框
//   POST /api/desktop-config   body: 上述 config 对象
//     200 → { success: true, savedAt: ISO }
//   DELETE /api/desktop-config
//     200 → { success: true }    // 清空服务端记录，下次 GET 返回 null
const express = require('express');
const { collection } = require('../db/connection');

const router = express.Router();

function desktopKey(userId) {
  return `user_desktop_${userId}`;
}

// 真用户过滤：API Key 登录的 'system' 账号不能写桌面同步（桌面同步一定跟某个真人走）
function requireRealUser(req, res, next) {
  const u = req.user;
  if (!u || u.id === 'system' || !u.id) {
    return res.status(403).json({
      error: 'AUTH_REQUIRED_REAL_USER',
      message: '桌面同步需要登录用户，API Key 不支持',
    });
  }
  next();
}

// GET — 拉取当前用户的桌面配置
router.get('/', requireRealUser, (req, res) => {
  try {
    const cfg = collection('system_configs').findOne(c => c.key === desktopKey(req.user.id));
    if (!cfg) return res.json({ config: null });
    // cfg 是 { key, value, created_at, updated_at }，value 是真正的桌面配置 JSON 字符串
    const value = cfg.value;
    let parsed = null;
    if (typeof value === 'string') {
      try { parsed = JSON.parse(value); } catch { parsed = null; }
    } else if (value && typeof value === 'object') {
      parsed = value;
    }
    res.json({
      config: parsed,
      updatedAt: cfg.updated_at || cfg.created_at || null,
    });
  } catch (e) {
    res.status(500).json({ error: 'READ_FAILED', message: String(e && e.message || e) });
  }
});

// POST — 保存当前用户的桌面配置（覆盖写）
router.post('/', requireRealUser, (req, res) => {
  try {
    const body = req.body || {};
    // 接受任意形状的 config（前端未来扩展字段不破），但要求是对象
    const configToSave = body.config && typeof body.config === 'object'
      ? body.config
      : body;   // 兼容直接 POST 桌面对象

    if (!configToSave || typeof configToSave !== 'object') {
      return res.status(400).json({ error: 'BAD_PAYLOAD', message: 'config 必须是对象' });
    }

    const jsonStr = JSON.stringify(configToSave);
    if (jsonStr.length > 5 * 1024 * 1024) {
      // 5MB 上限 — wallpaper 数据 URL 可能很大，预留缓冲
      return res.status(413).json({ error: 'TOO_LARGE', message: '桌面配置超过 5MB 上限' });
    }

    const now = new Date().toISOString();
    const sysConfigs = collection('system_configs');
    const key = desktopKey(req.user.id);
    const existing = sysConfigs.findOne(c => c.key === key);

    if (existing) {
      sysConfigs.update(c => c.key === key, {
        ...existing,
        value: jsonStr,
        updated_at: now,
      });
    } else {
      sysConfigs.insert({
        key,
        value: jsonStr,
        created_at: now,
        updated_at: now,
      });
    }
    res.json({ success: true, savedAt: now });
  } catch (e) {
    res.status(500).json({ error: 'WRITE_FAILED', message: String(e && e.message || e) });
  }
});

// DELETE — 清空服务端记录（用于「停止云同步 / 解绑」）
router.delete('/', requireRealUser, (req, res) => {
  try {
    collection('system_configs').remove(c => c.key === desktopKey(req.user.id));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'DELETE_FAILED', message: String(e && e.message || e) });
  }
});

module.exports = router;
