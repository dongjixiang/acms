// ACMS · 代理设置 API（v0.XX Phase 1）
//
// 路由：
//   GET    /api/proxy-settings         获取当前代理配置 + 解析预览
//   PUT    /api/proxy-settings         写入配置（持久化到 config.json）
//   POST   /api/proxy-settings/test    用当前规则对一个 URL 试出（不走真实业务流）
//   DELETE /api/proxy-settings         重置为 config.json 默认（清空用户覆盖）

const express = require('express');
const router = express.Router();
const proxyResolver = require('../services/proxy-resolver');
const proxyFetch = require('../services/proxy-fetch');

// ─── 安全：白名单字段，避免 API 写入乱字段污染 config.json ──────────────

const ALLOWED_FIELDS = ['enabled', 'default', 'rules', 'bypassLocal', 'sslBypass', 'respectEnv'];

function sanitize(body) {
  const out = {};
  for (const k of ALLOWED_FIELDS) if (k in body) out[k] = body[k];
  // rules 必须是数组，每条 {match, via}
  if (Array.isArray(out.rules)) {
    out.rules = out.rules.filter(r => r && typeof r === 'object' && typeof r.match === 'string').map(r => ({
      match: String(r.match).slice(0, 200),
      via: typeof r.via === 'string' ? r.via.slice(0, 500) : '',
    }));
  }
  if (typeof out.sslBypass !== 'undefined' && !Array.isArray(out.sslBypass)) {
    out.sslBypass = [];
  }
  return out;
}

// ─── GET ─────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const cfg = proxyResolver.getConfig();
  // 决策预览：拿 3 个示例 URL 演示（OpenAI / 兜底域名 / 本地）
  const samples = ['https://api.openai.com/v1/models', 'https://example.com', 'http://127.0.0.1:3300/health'];
  const preview = samples.map(u => ({ url: u, decision: proxyResolver.resolveProxy(u) }));
  res.json({
    config: cfg,
    preview,
    source: 'config.json',
  });
});

// ─── PUT ─────────────────────────────────────────────────────────────

router.put('/', (req, res) => {
  const sanitized = sanitize(req.body || {});
  try {
    const saved = proxyResolver.setConfig(sanitized);
    // 清 dispatcher 缓存，让新规则立即生效
    proxyFetch._clearCache();
    res.json({ success: true, config: saved });
  } catch (e) {
    res.status(500).json({ error: 'PERSIST_FAILED', message: e.message });
  }
});

// ─── POST /test：dry-run 一次出站 ─────────────────────────────────────

router.post('/test', async (req, res) => {
  const { url, forceDirect, http1 } = req.body || {};
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL_REQUIRED' });
  try {
    const decision = proxyResolver.resolveProxy(url, { direct: !!forceDirect });
    if (decision.via === 'disabled') {
      return res.json({ ok: true, skipped: true, reason: '代理未启用', decision });
    }
    if (!/^https?:/i.test(url)) {
      return res.json({ ok: true, skipped: true, reason: '非 http(s) 协议，不经过代理', decision });
    }
    const result = await proxyFetch.testProxy(url, { forceDirect, http1: !!http1 });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'TEST_FAILED', message: e.message });
  }
});

// ─── DELETE：重置为默认 ───────────────────────────────────────────────

router.delete('/', (req, res) => {
  try {
    proxyResolver.setConfig({
      enabled: false,
      default: '',
      rules: [],
      bypassLocal: true,
      sslBypass: [],
      respectEnv: true,
    });
    proxyFetch._clearCache();
    res.json({ success: true, config: proxyResolver.getConfig() });
  } catch (e) {
    res.status(500).json({ error: 'RESET_FAILED', message: e.message });
  }
});

module.exports = router;
