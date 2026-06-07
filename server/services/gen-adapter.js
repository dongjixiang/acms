// 统一生成适配层 — 多 provider 路由，仿 llm-adapter.js 模式
// 支持: openai-dalle (图片), comfyui (图片), elevenlabs (音频), suno (音频)
const genStore = require('../stores/gen-store');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const WORKSPACE_ROOT = path.join(__dirname, '..', '..', 'workspaces');

// ===== 统一返回格式 =====
// { success, assetPath, mime, metadata: { prompt, model, ... } }

/**
 * 生成图片
 * @param {string} projectSlug - 项目标识
 * @param {string} providerId - 生成器 ID（可选，不传则自动匹配）
 * @param {string} prompt - 图片描述
 * @param {object} params - 额外参数 { size, n, negative_prompt, style }
 * @returns {object}
 */
async function generateImage(projectSlug, providerId, prompt, params = {}) {
  let provider;
  if (providerId) {
    provider = genStore.getDecryptedConfig(providerId);
    if (!provider) throw Object.assign(new Error('生成器不存在'), { status: 404 });
  } else {
    provider = genStore.getBestMatch('image', params.tags || []);
    if (!provider) throw Object.assign(new Error('无可用图片生成器，请先注册'), { status: 400 });
  }

  console.log(`[gen] generateImage: provider=${provider.provider} prompt="${prompt.substring(0, 60)}..."`);

  switch (provider.provider) {
    case 'openai-dalle':
      return await generateDalle(projectSlug, provider, prompt, params);
    case 'minimax-image':
      return await generateMinimaxImage(projectSlug, provider, prompt, params);
    case 'comfyui':
      return await generateComfyUI(projectSlug, provider, prompt, params);
    default:
      throw Object.assign(new Error(`不支持的图片生成 provider: ${provider.provider}`), { status: 400 });
  }
}

/**
 * 生成音频
 * @param {string} projectSlug - 项目标识
 * @param {string} providerId - 生成器 ID（可选）
 * @param {string} text - 文本内容（TTS）或描述（音乐）
 * @param {object} params - 额外参数 { voice, speed, genre, duration }
 * @returns {object}
 */
async function generateAudio(projectSlug, providerId, text, params = {}) {
  let provider;
  if (providerId) {
    provider = genStore.getDecryptedConfig(providerId);
    if (!provider) throw Object.assign(new Error('生成器不存在'), { status: 404 });
  } else {
    provider = genStore.getBestMatch('audio', params.tags || []);
    if (!provider) throw Object.assign(new Error('无可用音频生成器，请先注册'), { status: 400 });
  }

  console.log(`[gen] generateAudio: provider=${provider.provider} text="${text.substring(0, 60)}..."`);

  switch (provider.provider) {
    case 'elevenlabs':
      return await generateElevenLabs(projectSlug, provider, text, params);
    case 'minimax-tts':
      return await generateMinimaxTTS(projectSlug, provider, text, params);
    case 'suno':
      return await generateSuno(projectSlug, provider, text, params);
    default:
      throw Object.assign(new Error(`不支持的音频生成 provider: ${provider.provider}`), { status: 400 });
  }
}

// ===== 保存文件到 Workspace Assets =====
function saveAsset(projectSlug, buffer, ext, mime, metadata) {
  const dateStr = new Date().toISOString().split('T')[0];
  const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 8);
  const assetsDir = path.join(WORKSPACE_ROOT, projectSlug, 'assets', dateStr);
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  const safePrompt = (metadata.prompt || 'gen')
    .replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').substring(0, 40);
  const fileName = `${safePrompt}_${hash}${ext}`;
  const filePath = path.join(assetsDir, fileName);
  fs.writeFileSync(filePath, buffer);

  const assetPath = `assets/${dateStr}/${fileName}`;
  console.log(`[gen] 已保存: ${assetPath} (${(buffer.length / 1024).toFixed(1)}KB)`);

  return { success: true, assetPath, mime, metadata };
}

// ===== OpenAI DALL-E Provider =====
async function generateDalle(projectSlug, provider, prompt, params) {
  const apiKey = provider.config.apiKey;
  if (!apiKey || apiKey === 'sk-test-placeholder') {
    throw Object.assign(new Error('DALL-E 未配置真实的 OpenAI API Key。请通过 PATCH /api/generate/gen-img-openai 更新 config.apiKey'), { status: 400 });
  }

  const model = provider.config.model || 'dall-e-3';
  const size = params.size || provider.config.defaultParams?.size || '1024x1024';
  const quality = params.quality || provider.config.defaultParams?.quality || 'standard';
  const n = params.n || 1;

  const body = { model, prompt, n, size, quality };

  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    let parsed;
    try { parsed = JSON.parse(errBody); } catch {}
    const detail = parsed?.error?.message || parsed?.error || errBody;
    throw Object.assign(new Error(`DALL-E 调用失败: ${detail}`), { status: 502, providerError: detail });
  }

  const data = await resp.json();
  const imageUrl = data.data?.[0]?.url;
  const revisedPrompt = data.data?.[0]?.revised_prompt || prompt;

  if (!imageUrl) throw new Error('DALL-E 返回无图片 URL');

  // 下载图片
  const imgResp = await fetch(imageUrl);
  const buffer = Buffer.from(await imgResp.arrayBuffer());
  const mime = 'image/png';

  return saveAsset(projectSlug, buffer, '.png', 'image/png', {
    prompt: revisedPrompt,
    model: `dall-e-${model}`,
    size,
    quality,
    revisedPrompt,
  });
}

// ===== MiniMax Image Generation Provider =====
// 文档: https://platform.minimaxi.com/docs/api-reference/image-generation-t2i
// 端点: POST https://api.minimaxi.com/v1/image_generation
// 模型: image-01, image-01-live
async function generateMinimaxImage(projectSlug, provider, prompt, params) {
  const apiKey = provider.config.apiKey;
  if (!apiKey) {
    throw Object.assign(new Error('MiniMax 图片生成需要 API Key（可通过 modelRef 复用模型配置）'), { status: 400 });
  }

  const model = provider.config.model || 'image-01';
  // 将 OpenAI 风格 size (e.g. "1024x1024") 转为 aspect_ratio
  const size = params.size || provider.config.defaultParams?.size || '1024x1024';
  const ratioMap = {
    '1024x1024': '1:1', '1280x720': '16:9', '1152x864': '4:3',
    '1248x832': '3:2', '832x1248': '2:3', '864x1152': '3:4',
    '720x1280': '9:16', '1344x576': '21:9',
  };
  const aspectRatio = ratioMap[size] || '1:1';

  const body = {
    model,
    prompt,
    n: params.n || 1,
    aspect_ratio: aspectRatio,
    response_format: 'url',
    aigc_watermark: false,
  };

  const resp = await fetch('https://api.minimaxi.com/v1/image_generation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    let parsed;
    try { parsed = JSON.parse(errBody); } catch {}
    const detail = parsed?.base_resp?.status_msg || parsed?.error?.message || parsed?.error || errBody;
    throw Object.assign(new Error(`MiniMax 图片生成失败: ${detail}`), { status: 502, providerError: detail });
  }

  const data = await resp.json();
  // 检查 MiniMax 业务状态码
  const baseResp = data.base_resp || {};
  if (baseResp.status_code && baseResp.status_code !== 0) {
    const codeMsg = {
      1002: '触发限流，请稍后再试',
      1004: '账号鉴权失败，请检查 API Key',
      1008: '账号余额不足',
      1026: '图片描述涉及敏感内容，请修改 prompt 后重试',
      2013: '传入参数异常，请检查入参',
      2049: '无效的 API Key',
    };
    throw Object.assign(new Error(`MiniMax 图片生成失败: ${codeMsg[baseResp.status_code] || baseResp.status_msg || '未知错误(代码' + baseResp.status_code + ')'}`), { status: 502 });
  }
  const imageUrl = data.data?.image_urls?.[0];
  if (!imageUrl) throw new Error('MiniMax 返回无图片 URL');

  const imgResp = await fetch(imageUrl);
  const buffer = Buffer.from(await imgResp.arrayBuffer());
  // 根据实际 HTTP Content-Type 判断图片格式
  const contentType = imgResp.headers.get('content-type') || '';
  let ext, mime;
  if (contentType.includes('jpeg') || contentType.includes('jpg')) {
    ext = '.jpg'; mime = 'image/jpeg';
  } else if (contentType.includes('webp')) {
    ext = '.webp'; mime = 'image/webp';
  } else {
    ext = '.png'; mime = 'image/png';
  }

  return saveAsset(projectSlug, buffer, ext, mime, {
    prompt,
    model: `minimax-${model}`,
    size,
    aspectRatio,
  });
}

// ===== MiniMax TTS (语音合成) Provider =====
// 文档: https://platform.minimaxi.com/docs/api-reference/speech-t2a-http
// 端点: POST https://api.minimaxi.com/v1/t2a_v2
// 模型: speech-2.8-hd, speech-2.5-turbo, speech-01
async function generateMinimaxTTS(projectSlug, provider, text, params) {
  const apiKey = provider.config.apiKey;
  if (!apiKey) {
    throw Object.assign(new Error('MiniMax TTS 需要 API Key（可通过 modelRef 复用模型配置）'), { status: 400 });
  }

  const model = provider.config.model || 'speech-2.8-hd';
  const voiceId = params.voice || provider.config.defaultParams?.voice || 'male-qn-qingse';
  const speed = params.speed ?? provider.config.defaultParams?.speed ?? 1.0;
  const volume = params.volume ?? provider.config.defaultParams?.volume ?? 1.0;
  const pitch = params.pitch ?? provider.config.defaultParams?.pitch ?? 0;

  const body = {
    model,
    text,
    stream: false,
    voice_setting: {
      voice_id: voiceId,
      speed,
      vol: volume,
      pitch,
    },
    audio_setting: {
      format: 'mp3',
      sample_rate: 32000,
      bitrate: 128000,
      channel: 1,
    },
    subtitle_enable: false,
  };

  const resp = await fetch('https://api.minimaxi.com/v1/t2a_v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    let parsed;
    try { parsed = JSON.parse(errBody); } catch {}
    const detail = parsed?.base_resp?.status_msg || parsed?.error?.message || parsed?.error || parsed?.detail?.message || errBody;
    throw Object.assign(new Error(`MiniMax TTS 调用失败: ${detail}`), { status: 502, providerError: detail });
  }

  const data = await resp.json();
  // 非流式返回 hex 编码的 audio
  const hexAudio = data.data?.audio;
  if (!hexAudio) {
    throw new Error(`MiniMax TTS 返回格式异常: ${JSON.stringify(data).substring(0, 200)}`);
  }

  const buffer = Buffer.from(hexAudio, 'hex');
  const ext = '.mp3';
  const mime = 'audio/mpeg';

  return saveAsset(projectSlug, buffer, ext, mime, {
    prompt: text,
    model: `minimax-${model}`,
    voice: voiceId || 'default',
    speed,
    audioLength: data.extra_info?.audio_length || null,
  });
}

// ===== ElevenLabs TTS Provider =====
async function generateElevenLabs(projectSlug, provider, text, params) {
  const apiKey = provider.config.apiKey;
  if (!apiKey || apiKey === 'sk-test-placeholder') {
    throw Object.assign(new Error('ElevenLabs 未配置真实的 API Key。请通过 PATCH /api/generate/gen-audio-elevenlabs 更新 config.apiKey'), { status: 400 });
  }

  const voiceId = params.voice || provider.config.defaultParams?.voice || '21m00Tcm4TlvDq8ikWAM';
  const modelId = params.model || provider.config.defaultParams?.model || 'eleven_multilingual_v2';
  const stability = params.stability ?? provider.config.defaultParams?.stability ?? 0.5;
  const similarity = params.similarity ?? provider.config.defaultParams?.similarity ?? 0.75;

  const body = {
    text,
    model_id: modelId,
    voice_settings: { stability, similarity_boost: similarity },
  };

  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    let parsed;
    try { parsed = JSON.parse(errBody); } catch {}
    const detail = parsed?.detail?.message || parsed?.detail || parsed?.error || errBody;
    throw Object.assign(new Error(`ElevenLabs 调用失败: ${detail}`), { status: 502, providerError: detail });
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  return saveAsset(projectSlug, buffer, '.mp3', 'audio/mpeg', {
    prompt: text,
    model: `elevenlabs-${modelId}`,
    voice: voiceId,
    textLength: text.length,
  });
}

// ===== Suno Music Provider =====
async function generateSuno(projectSlug, provider, text, params) {
  const apiKey = provider.config.apiKey;
  if (!apiKey || apiKey === 'sk-test-placeholder') {
    throw Object.assign(new Error('Suno 未配置真实的 API Key。请先注册生成器并配置 config.apiKey'), { status: 400 });
  }

  const baseUrl = provider.config.baseUrl || 'https://api.suno.ai';
  const isV4 = (provider.config.apiVersion || 'v4') === 'v4';

  let generationId;
  if (isV4) {
    // Suno V4 API: POST /v4/chat/songs
    const customMode = params.custom || false;
    const body = {
      prompt: text,
      model: params.model || 'chirp-v4',
      style: params.style || '',
      title: params.title || '',
      instrumental: params.instrumental || false,
      continuation: params.continuation || false,
      custom: customMode,
    };

    const resp = await fetch(`${baseUrl}/v4/chat/songs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw Object.assign(new Error(`Suno 调用失败: ${resp.status} ${err}`), { status: 502 });
    }

    const data = await resp.json();
    generationId = data.id || (data.data && data.data[0]?.id);
    if (!generationId) throw new Error('Suno 返回无 generation ID');
  } else {
    // Suno V3 API (fallback)
    const body = {
      prompt: text,
      tags: params.tags || params.style || '',
      title: params.title || '',
      make_instrumental: params.instrumental || false,
      wait_audio: false,
    };

    const resp = await fetch(`${baseUrl}/v3/chat/songs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw Object.assign(new Error(`Suno 调用失败: ${resp.status} ${err}`), { status: 502 });
    }

    const data = await resp.json();
    generationId = data.id;
    if (!generationId) throw new Error('Suno 返回无 generation ID');
  }

  // 轮询等待生成完成
  const maxPolls = 60; // 最多等 2 分钟
  const pollUrl = isV4
    ? `${baseUrl}/v4/chat/songs/${generationId}`
    : `${baseUrl}/v3/chat/songs/${generationId}`;

  for (let i = 0; i < maxPolls; i++) {
    await sleep(2000);
    const pollResp = await fetch(pollUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!pollResp.ok) continue;

    const pollData = await pollResp.json();
    const songs = pollData.data || pollData.songs || (pollData.results ? [pollData.results] : []);
    const doneSong = songs.find(s => s.status === 'complete' || s.audio_url);

    if (doneSong && doneSong.audio_url) {
      // 下载生成的音频
      const audioResp = await fetch(doneSong.audio_url);
      const buffer = Buffer.from(await audioResp.arrayBuffer());
      const ext = '.mp3';
      const mime = 'audio/mpeg';

      // 如果有封面图也下载
      let coverArt = null;
      if (doneSong.image_url) {
        try {
          const imgResp = await fetch(doneSong.image_url);
          const imgBuf = Buffer.from(await imgResp.arrayBuffer());
          const imgDateStr = new Date().toISOString().split('T')[0];
          const imgHash = crypto.createHash('md5').update(imgBuf).digest('hex').substring(0, 8);
          const imgDir = path.join(WORKSPACE_ROOT, projectSlug, 'assets', imgDateStr);
          if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
          const imgPath = path.join(imgDir, `suno_cover_${imgHash}.png`);
          fs.writeFileSync(imgPath, imgBuf);
          coverArt = `assets/${imgDateStr}/suno_cover_${imgHash}.png`;
        } catch (e) { /* 封面图不是必须的 */ }
      }

      return saveAsset(projectSlug, buffer, ext, mime, {
        prompt: text,
        model: `suno-${doneSong.model || 'chirp-v4'}`,
        title: doneSong.title || '',
        style: doneSong.style || params.style || '',
        duration: doneSong.duration || null,
        coverArt,
        generationId,
        lyrics: doneSong.lyric || doneSong.lyrics || '',
      });
    }
  }

  throw new Error('Suno 生成超时（2 分钟），请稍后查看 Suno 账户确认结果');
}

// ===== ComfyUI Provider (本地 Stable Diffusion) =====
async function generateComfyUI(projectSlug, provider, prompt, params) {
  const baseUrl = provider.config.baseUrl || 'http://127.0.0.1:8000';
  const apiKey = provider.config.apiKey || '';
  const workflowFile = params.inputImage ? (provider.config.defaultWorkflow || 'img2img.json') : 'txt2img.json';
  // 检测 prompt 是否含中文，是则翻译为英文（SDXL CLIP 对中文支持极差）
  prompt = await ensureEnglishPrompt(prompt);
  if (params.negative_prompt) params.negative_prompt = await ensureEnglishPrompt(params.negative_prompt);

  // 读取预设 workflow
  let workflow;
  try {
    const workflowPath = path.join(__dirname, '..', '..', 'workflows', workflowFile);
    if (fs.existsSync(workflowPath)) {
      workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
    } else {
      // 兜底：基本 txt2img workflow
      workflow = {
        "3": { "class_type": "KSampler", "inputs": { "seed": randomSeed(), "steps": params.steps || 20, "cfg": params.cfg || 7, "sampler_name": "euler", "scheduler": "normal", "denoise": params.denoise ?? 1, "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": params.inputImage ? ["5", 0] : ["5", 0] } },
        "4": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": params.checkpoint || "sd_xl_base_1.0.safetensors" } },
        "5": params.inputImage
          ? { "class_type": "VAEEncode", "inputs": { "pixels": ["9", 0], "vae": ["4", 2] } }
          : { "class_type": "EmptyLatentImage", "inputs": { "width": params.width || 1024, "height": params.height || 1024, "batch_size": 1 } },
        "6": { "class_type": "CLIPTextEncode", "inputs": { "text": prompt, "clip": ["4", 1] } },
        "7": { "class_type": "CLIPTextEncode", "inputs": { "text": params.negative_prompt || "blurry, low quality, distorted, deformed, ugly, bad anatomy, watermark, text, signature", "clip": ["4", 1] } },
        "8": { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["4", 2] } },
        "9": params.inputImage ? { "class_type": "LoadImage", "inputs": { "image": "" } } : null,
        "10": { "class_type": "SaveImage", "inputs": { "filename_prefix": "acms_gen", "images": ["8", 0] } },
      };
      // 移除 null 节点
      Object.keys(workflow).forEach(k => { if (workflow[k] === null) delete workflow[k]; });
    }
  } catch (e) {
    throw Object.assign(new Error(`ComfyUI workflow 解析失败: ${e.message}`), { status: 400 });
  }

  // 如果有 inputImage，复制到 ComfyUI input 目录并设置 LoadImage 节点
  if (params.inputImage) {
    const WORKSPACE_ROOT = path.join(__dirname, '..', '..', 'workspaces');
    const srcPath = path.join(WORKSPACE_ROOT, params.inputImage);
    if (!fs.existsSync(srcPath)) {
      throw Object.assign(new Error(`原图不存在: ${params.inputImage}`), { status: 400 });
    }
    // 复制到 ComfyUI input 目录
    const comfyInputDir = 'D:\\Users\\swede\\AppData\\Local\\Programs\\ComfyUI\\resources\\ComfyUI\\input';
    const ext = path.extname(srcPath) || '.png';
    const inputFileName = `acms_input_${Date.now()}${ext}`;
    const destPath = path.join(comfyInputDir, inputFileName);
    fs.copyFileSync(srcPath, destPath);
    console.log(`[ComfyUI] 已复制原图到: ${destPath}`);

    // 设置 workflow 中的 LoadImage 节点 (node 9)
    if (workflow["9"] && workflow["9"].class_type === "LoadImage") {
      workflow["9"].inputs.image = inputFileName;
    } else {
      // 尝试在其他位置找 LoadImage 节点
      for (const [nodeId, node] of Object.entries(workflow)) {
        if (node.class_type === "LoadImage") {
          node.inputs.image = inputFileName;
          break;
        }
      }
    }
  }

  // 替换 prompt 占位符
  workflow = replaceWorkflowPrompt(workflow, prompt, params);

  const body = { prompt: workflow };

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  // 提交到 ComfyUI
  const resp = await fetch(`${baseUrl}/prompt`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw Object.assign(new Error(`ComfyUI 调用失败: ${resp.status} ${err}`), { status: 502 });
  }

  const data = await resp.json();
  const promptId = data.prompt_id;
  if (!promptId) throw new Error('ComfyUI 返回无 prompt_id');

  console.log(`[ComfyUI] 已提交 prompt: ${promptId}`);

  // 轮询等待完成
  const maxPolls = 300; // 最多等 5 分钟
  for (let i = 0; i < maxPolls; i++) {
    await sleep(1000);
    const histResp = await fetch(`${baseUrl}/history/${promptId}`, { headers });
    if (histResp.ok) {
      const history = await histResp.json();
      const outputs = history[promptId]?.outputs;
      if (outputs) {
        // 找到 SaveImage 节点的输出
        for (const [nodeId, nodeOutput] of Object.entries(outputs)) {
          if (nodeOutput.images && nodeOutput.images.length > 0) {
            const img = nodeOutput.images[0];
            const imgUrl = `${baseUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${img.type || 'output'}`;

            // 下载图片
            const imgResp = await fetch(imgUrl);
            if (imgResp.ok) {
              const buffer = Buffer.from(await imgResp.arrayBuffer());
              const mime = `image/${img.filename.endsWith('.png') ? 'png' : 'jpeg'}`;
              const ext = img.filename.endsWith('.png') ? '.png' : '.jpg';

              return saveAsset(projectSlug, buffer, ext, mime, {
                prompt,
                model: `comfyui-${params.checkpoint || 'default'}`,
                steps: params.steps || 20,
                cfg: params.cfg || 7,
                seed: data.number || 0,
                comfyuiPromptId: promptId,
              });
            }
          }
        }
      }
    }
  }

  throw new Error(`ComfyUI 生成超时（5 分钟）promptId: ${promptId}`);
}

// ===== ComfyUI 辅助函数 =====
function randomSeed() {
  return Math.floor(Math.random() * 2147483647);
}

function replaceWorkflowPrompt(workflow, prompt, params) {
  // 遍历 workflow 节点，替换 CLIPTextEncode 的 text 字段
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (node.class_type === 'CLIPTextEncode' && node.inputs) {
      if (node.inputs.text === '{prompt}' || node.inputs.text === prompt || prompt) {
        // 如果是 positive prompt 节点（没有 negative 关键词）
        if (!node.inputs.text?.toLowerCase().includes('negative') &&
            !node.inputs.text?.toLowerCase().includes('bad quality')) {
          node.inputs.text = prompt;
        }
      }
    }
    if (node.class_type === 'KSampler' && node.inputs) {
      if (params.steps) node.inputs.steps = params.steps;
      if (params.cfg) node.inputs.cfg = params.cfg;
      if (params.seed !== undefined) node.inputs.seed = params.seed;
      if (params.width) {
        // 找到 EmptyLatentImage 节点
        const latentNode = workflow[Object.keys(workflow).find(k => workflow[k].class_type === 'EmptyLatentImage')];
        if (latentNode) {
          if (params.width) latentNode.inputs.width = params.width;
          if (params.height) latentNode.inputs.height = params.height;
        }
      }
    }
  }
  return workflow;
}

// 检测文本是否含中文，如有则用 DeepSeek 翻译为英文
async function ensureEnglishPrompt(text) {
  if (!text || !/[\u4e00-\u9fff]/.test(text)) return text;  // 无中文直接返回
  const modelStore = require('../stores/model-store');
  try {
    const model = modelStore.getDecryptedKey('model_mps18nz9');
    if (!model) return text;  // 无 DeepSeek 模型配置
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + model },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: '你是一个翻译助手。将用户输入的中文翻译为英文，只输出翻译结果，不要有任何额外说明。保留技术术语、人名和品牌名不变。' },
          { role: 'user', content: text }
        ],
        max_tokens: 500,
        temperature: 0,
      })
    });
    if (!resp.ok) return text;
    const data = await resp.json();
    const translated = data.choices?.[0]?.message?.content?.trim();
    if (!translated) return text;
    console.log(`[Translate] "${text.substring(0, 50)}..." → "${translated.substring(0, 50)}..."`);
    return translated;
  } catch (e) {
    console.warn(`[Translate] 翻译失败: ${e.message}`);
    return text;
  }
}

// 小睡函数
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { generateImage, generateAudio };
