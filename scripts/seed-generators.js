#!/usr/bin/env node
// 幂等注册 6 条生成器(图片 3 + 音频 3)
// 走 HTTP API,自动加密 apiKey,不直接动 SQLite
// 缺 Key 的项标记 status=inactive,不会触发实际调用
//
// 用法: node scripts/seed-generators.js
//       API_KEY=xxx BASE_URL=http://120.24.204.130:3300 node scripts/seed-generators.js

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3300';
const API_KEY  = process.env.API_KEY  || 'dev-key-001';

const GENERATORS = [
  // ===== 图片 3 条 =====
  {
    id: 'gen-img-dalle',
    type: 'image',
    provider: 'openai-dalle',
    name: 'DALL-E 3 (OpenAI)',
    config: { priority: 5, model: 'dall-e-3', size: '1024x1024', apiKey: '' }, // 留空,需手动配
    modelRef: '', // 没有 openai llm_model 注册,单独配 key
    active: false, // 占位
  },
  {
    id: 'gen-img-minimax',
    type: 'image',
    provider: 'minimax-image',
    name: 'MiniMax Image Generation',
    config: { priority: 1, model: 'image-01', aspectRatio: '1:1' },
    modelRef: 'model_mp9u94rq', // 复用 MiniMax-M3 的 apiKey
    active: true,
  },
  {
    id: 'gen-img-comfyui',
    type: 'image',
    provider: 'comfyui',
    name: 'ComfyUI 本地 (SDXL Refiner + Z-Image Turbo)',
    config: {
      priority: 2,
      baseUrl: 'http://127.0.0.1:8000',
      workflow: 'sdxl_refiner',
      defaultSampler: 'dpmpp_2m',
      defaultScheduler: 'karras',
    },
    modelRef: '',
    active: true,
  },

  // ===== 音频 3 条 (占位,需后续配 Key) =====
  {
    id: 'gen-aud-elevenlabs',
    type: 'audio',
    provider: 'elevenlabs',
    name: 'ElevenLabs TTS',
    config: { priority: 2, voice: 'Rachel', model: 'eleven_multilingual_v2', apiKey: '' },
    modelRef: '',
    active: false,
  },
  {
    id: 'gen-aud-minimax-tts',
    type: 'audio',
    provider: 'minimax-tts',
    name: 'MiniMax TTS (speech-02)',
    config: { priority: 1, model: 'speech-02', voice: 'female-shaonv' },
    modelRef: 'model_mp9u94rq',
    active: true,
  },
  {
    id: 'gen-aud-suno',
    type: 'audio',
    provider: 'suno',
    name: 'Suno Music Generation',
    config: { priority: 3, model: 'chirp-v3-5', apiKey: '' },
    modelRef: '',
    active: false,
  },
];

async function api(method, path, body) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, body: json };
}

async function exists(id) {
  const r = await api('GET', `/api/generate/${id}`);
  return r.status === 200;
}

async function ensure(g) {
  const has = await exists(g.id);
  const payload = {
    id: g.id,
    type: g.type,
    provider: g.provider,
    name: g.name,
    config: g.config,
    modelRef: g.modelRef || '',
  };

  if (has) {
    console.log(`  ↻ ${g.id.padEnd(22)} 已存在,更新中...`);
    const r = await api('PATCH', `/api/generate/${g.id}`, payload);
    if (r.status >= 400) throw new Error(`PATCH ${g.id} failed: ${r.status} ${JSON.stringify(r.body)}`);
    return 'updated';
  } else {
    console.log(`  + ${g.id.padEnd(22)} 新建中...`);
    const r = await api('POST', '/api/generate', payload);
    if (r.status >= 400) throw new Error(`POST ${g.id} failed: ${r.status} ${JSON.stringify(r.body)}`);
    return 'created';
  }
}

async function setStatus(id, status) {
  // 单独的 PATCH 只更新 status 字段(避免覆盖 config)
  const r = await api('PATCH', `/api/generate/${id}`, { status });
  if (r.status >= 400) throw new Error(`setStatus ${id} failed: ${r.status}`);
}

(async () => {
  console.log(`\n🌱  生成器种子脚本`);
  console.log(`   目标: ${BASE_URL}`);
  console.log(`   项数: ${GENERATORS.length}\n`);

  // 1. 先验证服务可达
  const health = await api('GET', '/health');
  if (health.status !== 200) {
    console.error(`❌ 服务不可达: ${health.status}`);
    process.exit(1);
  }
  console.log(`✅ 服务健康\n`);

  // 2. 注册/更新
  let created = 0, updated = 0;
  for (const g of GENERATORS) {
    try {
      const result = await ensure(g);
      if (result === 'created') created++;
      else updated++;
      // 占位的(无 Key)统一设为 inactive,避免被 getBestMatch 选中
      if (!g.active) {
        await setStatus(g.id, 'inactive');
      } else {
        await setStatus(g.id, 'active');
      }
    } catch (e) {
      console.error(`  ❌ ${g.id}: ${e.message}`);
    }
  }

  // 3. 验证
  console.log(`\n📋  最终列表:`);
  const list = await api('GET', '/api/generate');
  for (const g of list.body) {
    const marker = g.status === 'active' ? '🟢' : '⚪';
    const ref    = g.model_ref ? `  (modelRef: ${g.model_ref})` : '';
    console.log(`  ${marker} ${g.id.padEnd(22)} ${g.provider.padEnd(15)} ${g.status}${ref}`);
  }

  console.log(`\n✨  完成: 新建 ${created} 条, 更新 ${updated} 条`);
  console.log(`    活跃 ${list.body.filter(g => g.status === 'active').length} / 总计 ${list.body.length}`);
})().catch(e => { console.error(e); process.exit(1); });
