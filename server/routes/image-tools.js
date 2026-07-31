// ACMS Image Tools API (v0.66 PR1 + v0.77 target dims)
// 暴露 image-tools-service.coreGenerate 为 REST endpoint
//   POST /api/image-tools/ai-generate    —— 文生图（无源图）
//   POST /api/image-tools/ai-edit         —— 图生图（需要 referenceImage）
//
// 请求体:
//   ai-generate: { prompt: string, n?: 1-6, size?: '1K'|'2K'|'3K'|'4K'|'1024x1024', projectSlug? }
//   ai-edit:     { prompt, referenceImage, n?, size?, targetWidth?, targetHeight?, projectSlug? }
//     v0.77: targetWidth + targetHeight → coreGenerate 自动选最近 ratio 档位 (1:1/3:4/4:3/3:2/2:3/16:9/9:16/21:9)
//            并按像素总数选 size 档位 (1K/2K/3K/4K)。原图比例保持一致，分辨率按档位。
//
// 响应:
//   { ok: true, prompt, size, n, options: [{image_url_output, asset_path, mime, size}], picked_idx: 0, project_slug, generated_at }
//   { ok: false, error: 'NO_PROMPT' | 'AGNES_API_KEY_NOT_CONFIGURED' | 'INVALID_REFERENCE_IMAGE' | 'all_n_calls_failed: ...' | ... }
//
// 鉴权：复用 authMiddleware（已经走过）
// 限流：每个用户每分钟 10 次（v0.66 PR1 PoC 阶段简单限流，后续可换 rate-limit 库）

const express = require('express');
const router = express.Router();
// v0.66 PR1 fix: router 需要 body parser（否则 req.body 是 undefined）
router.use(express.json({ limit: '20mb' }));
const { coreGenerate } = require('../services/image-tools-service');

// 简易内存限流（PR1 PoC 用）
const _rateBuckets = new Map(); // userId → [timestamps]
function rateLimitOk(userId, maxPerMin) {
  if (!userId) return true; // system 之类不限
  var now = Date.now();
  var arr = (_rateBuckets.get(userId) || []).filter(function (t) { return now - t < 60000; });
  if (arr.length >= maxPerMin) return false;
  arr.push(now);
  _rateBuckets.set(userId, arr);
  return true;
}

// 校验 referenceImage 是合法 data URI
function validateReferenceImage(ref) {
  if (!ref || typeof ref !== 'string') return { ok: false, error: 'INVALID_REFERENCE_IMAGE', message: 'referenceImage 必须是非空字符串' };
  // 接受 data:image/{png|jpeg|webp|gif};base64,XXX 或 https://...
  if (ref.startsWith('data:image/') && ref.indexOf('base64,') > 0) return { ok: true };
  if (ref.startsWith('data:image/') && ref.indexOf(',') > 0) return { ok: true };
  if (ref.startsWith('http://') || ref.startsWith('https://')) return { ok: true };
  return { ok: false, error: 'INVALID_REFERENCE_IMAGE', message: 'referenceImage 必须是 data URI 或 http(s) URL' };
}

// ── POST /api/image-tools/ai-generate ──
router.post('/ai-generate', async function (req, res) {
  var userId = (req.user && req.user.id) || 'anonymous';
  if (!rateLimitOk(userId, 10)) {
    return res.status(429).json({ ok: false, error: 'RATE_LIMIT', message: '每分钟最多 10 次，请稍后再试' });
  }

  var prompt = (req.body && req.body.prompt) || '';
  var n = req.body && req.body.n;
  var size = req.body && req.body.size;
  var projectSlug = req.body && req.body.projectSlug;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ ok: false, error: 'NO_PROMPT', message: 'prompt 是必填字符串' });
  }

  try {
    var result = await coreGenerate({
      prompt: prompt,
      n: n,
      size: size,
      projectSlug: projectSlug || ('user-' + userId),
    });
    // coreGenerate 返回 ok:false 时仍 200（让前端能展示 error），但鉴权/输入错误 4xx
    return res.json(result);
  } catch (e) {
    console.error('[image-tools/ai-generate] error:', e);
    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR', message: e.message });
  }
});

// ── POST /api/image-tools/ai-edit ──
router.post('/ai-edit', async function (req, res) {
  var userId = (req.user && req.user.id) || 'anonymous';
  if (!rateLimitOk(userId, 10)) {
    return res.status(429).json({ ok: false, error: 'RATE_LIMIT', message: '每分钟最多 10 次，请稍后再试' });
  }

  var prompt = (req.body && req.body.prompt) || '';
  var referenceImage = req.body && req.body.referenceImage;
  var n = req.body && req.body.n;
  var size = req.body && req.body.size;
  var targetWidth = req.body && req.body.targetWidth;   // v0.77: 调用方传入的 input 宽（图生图时为原图宽）
  var targetHeight = req.body && req.body.targetHeight;
  var projectSlug = req.body && req.body.projectSlug;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ ok: false, error: 'NO_PROMPT', message: 'prompt 是必填字符串' });
  }

  var v = validateReferenceImage(referenceImage);
  if (!v.ok) return res.status(400).json(v);

  // 大小保护：data URI 长度 < 15MB（Agnes API 限制）
  if (referenceImage.startsWith('data:') && referenceImage.length > 15 * 1024 * 1024) {
    return res.status(413).json({ ok: false, error: 'REFERENCE_IMAGE_TOO_LARGE', message: 'referenceImage 太大（>15MB），请先用 image_resize 缩小' });
  }

  try {
    var result = await coreGenerate({
      prompt: prompt,
      referenceImage: referenceImage,
      n: n,
      size: size,
      targetWidth: targetWidth,
      targetHeight: targetHeight,
      projectSlug: projectSlug || ('user-' + userId),
    });
    return res.json(result);
  } catch (e) {
    console.error('[image-tools/ai-edit] error:', e);
    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR', message: e.message });
  }
});

module.exports = router;