// ACMS · 图片生成辅助（v0.19，2026-06-27）
//   用户输入 prompt + 可选参考图 → 调用 Agnes Image 2.0 Flash
//   支持：文生图 / 图生图（多图输入）
//   直接调 API（不依赖 gen-adapter 生成器注册）
//
// 字段：requirement.assist_image（status / prompt / image_url / asset_path / error）

const reqStore = require('../../stores/requirement-store');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const WORKSPACE_ROOT = path.join(__dirname, '..', '..', '..', 'workspaces');

/**
 * 读取 Agnes API Key
 */
function getAgnesApiKey() {
  const config = require('../../config');
  if (config.agnesApiKey) return config.agnesApiKey;
  if (process.env.AGNES_API_KEY) return process.env.AGNES_API_KEY;
  try {
    const { collection } = require('../../db/connection');
    const cfg = collection('system_configs').findOne(c => c.key === 'agnes_api_key');
    if (cfg && cfg.value) return cfg.value;
  } catch (e) { /* ignore */ }
  return '';
}

/**
 * 保存图片到 workspace assets
 */
function saveImageAsset(projectSlug, buffer, ext, mime, metadata) {
  const dateStr = new Date().toISOString().split('T')[0];
  const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 8);
  const assetsDir = path.join(WORKSPACE_ROOT, projectSlug, 'assets', dateStr);
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
  const safePrompt = (metadata.prompt || 'img').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').substring(0, 40);
  const fileName = `${safePrompt}_${hash}${ext}`;
  const filePath = path.join(assetsDir, fileName);
  fs.writeFileSync(filePath, buffer);
  const assetPath = `assets/${dateStr}/${fileName}`;
  return { assetPath, mime, size: buffer.length };
}

async function runAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  const prompt = (opts.prompt || '').trim();
  const imageUrl = (opts.image_url || '').trim();
  const imageFileId = (opts.image_file_id || '').trim();  // v0.19：上传文件 ID
  const size = opts.size || '1024x1024';

  if (!prompt) {
    reqStore.update(requirementId, {
      assist_image: JSON.stringify({
        status: 'failed', error: 'NO_PROMPT', prompt: '',
        generated_at: new Date().toISOString(),
      }),
    });
    return;
  }

  // 从上传文件、URL、或无图中选参考图
  let finalImage = imageUrl || null;
  if (imageFileId) {
    try {
      const chatUpload = require('../../services/chat-upload');
      finalImage = chatUpload.readImageAsDataURI(imageFileId);
    } catch (e) {
      console.warn(`[assist:image] ${requirementId} 读取上传文件失败:`, e.message);
    }
  }

  reqStore.update(requirementId, {
    assist_image: JSON.stringify({
      status: 'generating', prompt, image_url: finalImage || null, size,
      image_url_output: null, asset_path: null, error: null,
      started_at: new Date().toISOString(),
    }),
  });

  try {
    const apiKey = getAgnesApiKey();
    if (!apiKey) throw new Error('Agnes API Key 未配置，请在管理后台「高级设置」中配置');

    const body = {
      model: 'agnes-image-2.0-flash',
      prompt,
      size,
      extra_body: { response_format: 'url' },
    };

    const finalImage = imageData || imageUrl;
    if (finalImage) {
      body.extra_body.image = [finalImage];
    }

    const resp = await fetch('https://apihub.agnes-ai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      throw new Error(`Agnes API 返回 ${resp.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await resp.json();
    const imageUrlOutput = data.data?.[0]?.url;

    if (!imageUrlOutput) throw new Error('Agnes 返回无图片 URL');

    // 下载并保存
    const imgResp = await fetch(imageUrlOutput);
    if (!imgResp.ok) throw new Error(`图片下载失败: ${imgResp.status}`);
    const buffer = Buffer.from(await imgResp.arrayBuffer());
    const contentType = imgResp.headers.get('content-type') || '';
    let ext, mime;
    if (contentType.includes('jpeg') || contentType.includes('jpg')) { ext = '.jpg'; mime = 'image/jpeg'; }
    else if (contentType.includes('webp')) { ext = '.webp'; mime = 'image/webp'; }
    else { ext = '.png'; mime = 'image/png'; }

    // 找 project slug
    let projectSlug = 'default';
    try {
      const projectStore = require('../../stores/project-store');
      const proj = projectStore.getByReqId(requirementId);
      if (proj?.slug) projectSlug = proj.slug;
      else if (proj?.id) projectSlug = proj.id;
    } catch (e) { /* 用默认值 */ }

    const saved = saveImageAsset(projectSlug, buffer, ext, mime, { prompt, size, img2img: !!imageUrl });

    reqStore.update(requirementId, {
      assist_image: JSON.stringify({
        status: 'done', prompt, image_url: imageUrl || null, size,
        image_url_output: imageUrlOutput,
        asset_path: saved.assetPath,
        mime: saved.mime,
        generated_at: new Date().toISOString(),
      }),
    });
    console.log(`[assist:image] ${requirementId} 完成, path=${saved.assetPath}`);
  } catch (e) {
    console.error(`[assist:image] ${requirementId} 失败:`, e.message);
    reqStore.update(requirementId, {
      assist_image: JSON.stringify({
        status: 'failed', prompt, image_url: imageUrl || null, size,
        image_url_output: null, asset_path: null,
        error: e.message || '未知错误',
        generated_at: new Date().toISOString(),
      }),
    });
  }
}

function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try { return JSON.parse(req.assist_image || 'null'); } catch { return null; }
}

module.exports = {
  name: 'AI 图片生成（Agnes Image）',
  field: 'assist_image',
  runAssistJob,
  getAssist,
};
