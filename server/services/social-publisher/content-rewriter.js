// ACMS social-publisher — content-rewriter.js
// =============================================
// AI 改写：按平台风格把素材改写为爆款风格
// 复用 modelStore（P165 教训：跨应用复用 key，不另存）
//
// 5 平台 prompt 模板，每个平台独立风格：
//   - toutiao: 1500-3000 字长文，标题党，开头直入主题
//   - xiaohongshu: 300-800 字短段，多 emoji，故事化
//   - wechat_oa: 1500-2500 字，标题党，故事化开头
//   - zhihu: 1000-2000 字，亮观点，引用数据/案例
//   - douyin: 30-100 字短文案，钩子开头，结尾有互动
//
// PR 2 实现：基本改写
// PR 3 增强：加历史爆款库 + few-shot

'use strict';

const modelStore = require('../../stores/model-store');

// ── 平台 prompt 模板 ──
const PLATFORM_PROMPTS = {
  toutiao: `你是今日头条爆款写手，擅长把任何素材改写成头条爆款文章。

要求：
- 长度 1500-3000 字
- 标题吸引人（数字 + 冲突 + 悬念，三段式最佳）
- 开头直入主题，前 100 字必须有钩子
- 段落清晰，多用短句（每段不超过 4 行）
- 适当加 3-5 个小标题分节
- 结尾有观点或行动引导
- 不要"首先/其次/最后"等套路化连接词
- 风格：理性 + 有数据 + 有态度

请改写以下素材：

{content}

{tone_hint}{length_hint}
返回 JSON：{title, content}`,

  xiaohongshu: `你是小红书爆款写手，擅长把素材改写成小红书爆款笔记。

要求：
- 标题 20 字内，多 emoji（1-2 个最佳）
- 开头 1 段钩子（悬念/反转/痛点/惊喜）
- 短段落，每段 1-2 行
- 大量 emoji 分隔内容（每个 emoji 占独立短段）
- 中间有具体细节/故事/对比
- 末尾 5-8 个标签（#话题）
- 字数 300-800
- 风格：真诚 + 故事化 + 有画面感

请改写以下素材：

{content}

{tone_hint}{length_hint}
返回 JSON：{title, content, tags: string[]}`,

  wechat_oa: `你是公众号爆款编辑，擅长把素材改写成公众号爆款文章。

要求：
- 标题党（情感 + 反差 + 数字）
- 开头故事化（场景描写引入）
- 中间有金句（加粗/独立段）
- 有干货/方法论/案例
- 排版清晰，每段 3-4 行
- 结尾有互动引导（"你怎么看？"/"评论区聊聊"）
- 字数 1500-2500
- 风格：情感 + 故事 + 干货

请改写以下素材：

{content}

{tone_hint}{length_hint}
返回 JSON：{title, content, summary}`,

  zhihu: `你是知乎优秀答主，擅长把素材改写成知乎高赞回答。

要求：
- 开头亮观点（先给结论）
- 引用数据/案例/文献（真实可靠）
- 逻辑清晰，分点论述
- 客观但不冷漠
- 字数 1000-2000
- 风格：专业 + 严谨 + 有理有据

请改写以下素材：

{content}

{tone_hint}{length_hint}
返回 JSON：{title, content}`,

  douyin: `你是抖音爆款文案写手，擅长把素材改写成抖音视频文案。

要求：
- 30-100 字（视频文案要短）
- 开头 1 句钩子（悬念/反转/惊讶）
- 中间有反转/高潮
- 结尾有互动引导（"评论区告诉我"/"点赞关注"）
- 配 3-5 个 #话题 标签
- 风格：口语化 + 有节奏 + 有画面
请改写以下素材：

{content}

{tone_hint}{length_hint}返回 JSON：{title, content, hashtags: string[]}`,
  };

  // v0.118 PR 6: 富文本改写专用 prompt（保留图片占位符 {{IMG_N}}）
  //   5 平台都用占位符 prompt，规则统一（占位符保留），风格沿用各平台 PLATFORM_PROMPTS
  const RICH_PROMPTS = {
    toutiao: `${PLATFORM_PROMPTS.toutiao.split('请改写以下素材')[0]}

⚠️ 图片占位符规则（关键）：
- 文中 {{IMG_1}}、{{IMG_2}} 等是图片占位符，**必须原样保留**在文本中的原位置
- 禁止删除占位符、禁止移动占位符位置、禁止改写占位符
- 在占位符前后写文，让图片和文字自然衔接
- 占位符数量和顺序必须完全一致

请改写以下素材：

{content}

{tone_hint}{length_hint}返回 JSON：{title, content}`,
    xiaohongshu: `${PLATFORM_PROMPTS.xiaohongshu.split('请改写以下素材')[0]}

⚠️ 图片占位符规则（关键）：
- 文中 {{IMG_1}}、{{IMG_2}} 等是图片占位符，**必须原样保留**在文本中的原位置
- 禁止删除占位符、禁止移动占位符位置、禁止改写占位符
- 在占位符前后写文，让图片和文字自然衔接
- 占位符数量和顺序必须完全一致

请改写以下素材：

{content}

{tone_hint}{length_hint}返回 JSON：{title, content, tags: string[]}`,
    wechat_oa: `${PLATFORM_PROMPTS.wechat_oa.split('请改写以下素材')[0]}

⚠️ 图片占位符规则（关键）：
- 文中 {{IMG_1}}、{{IMG_2}} 等是图片占位符，**必须原样保留**在文本中的原位置
- 禁止删除占位符、禁止移动占位符位置、禁止改写占位符
- 在占位符前后写文，让图片和文字自然衔接
- 占位符数量和顺序必须完全一致

请改写以下素材：

{content}

{tone_hint}{length_hint}返回 JSON：{title, content, summary}`,
    zhihu: `${PLATFORM_PROMPTS.zhihu.split('请改写以下素材')[0]}

⚠️ 图片占位符规则（关键）：
- 文中 {{IMG_1}}、{{IMG_2}} 等是图片占位符，**必须原样保留**在文本中的原位置
- 禁止删除占位符、禁止移动占位符位置、禁止改写占位符
- 在占位符前后写文，让图片和文字自然衔接
- 占位符数量和顺序必须完全一致

请改写以下素材：

{content}

{tone_hint}{length_hint}返回 JSON：{title, content}`,
    douyin: `${PLATFORM_PROMPTS.douyin.split('请改写以下素材')[0]}

⚠️ 图片占位符规则（关键）：
- 文中 {{IMG_1}}、{{IMG_2}} 等是图片占位符，**必须原样保留**在文本中的原位置
- 禁止删除占位符、禁止移动占位符位置、禁止改写占位符
- 在占位符前后写文，让图片和文字自然衔接
- 占位符数量和顺序必须完全一致

请改写以下素材：

{content}

{tone_hint}{length_hint}返回 JSON：{title, content, hashtags: string[]}`,
  };

// ── 改写主函数 ──
async function rewrite({ content, rich_content, rich_images, platform, tone, length }) {
  if (!content && !rich_content) return { ok: false, error: 'missing_content' };
  if (!PLATFORM_PROMPTS[platform]) {
    return { ok: false, error: `unsupported_platform: ${platform}`, supported: Object.keys(PLATFORM_PROMPTS) };
  }

  // 0. 富文本改写：当 rich_content 有图片时用占位符版本 prompt
  let useRichPrompt = false;
  let rewriteContent = content;
  let rewriteImages = null;  // 占位符 → image 映射
  if (Array.isArray(rich_content) && rich_content.length) {
    const richContentMod = require('./rich-content');
    const sub = richContentMod.toPlaceholders(rich_content);
    rewriteContent = sub.blocks.map(b => b.type === 'text' ? (b.text || '') : '').filter(Boolean).join('\n\n');
    rewriteImages = sub.images;
    useRichPrompt = true;  // 5 平台都用占位符 prompt
  }

  // 1. 选模型：复用 modelStore 找有 text + function-calling 能力的
  let model;
  try {
    // 优先 text 能力
    const textModels = modelStore.getActiveWithCapability('text') || [];
    model = textModels[0];
    if (!model) {
      // 兜底：任意 active 模型
      const allActive = modelStore.getActive() || [];
      model = allActive[0];
    }
  } catch (e) {
    return { ok: false, error: `model_lookup_failed: ${e.message}` };
  }
  if (!model) {
    return { ok: false, error: 'no_active_model', message: '没有 active 状态的 LLM 模型，去系统管理→AI 模型管理配置' };
  }

  // 2. 拿 key
  const apiKey = modelStore.getDecryptedKey(model.id);
  if (!apiKey) {
    return { ok: false, error: 'no_api_key', message: `模型 ${model.name} 没有 API key` };
  }

  // 3. 构造 prompt
  const toneHint = tone ? `语气偏好：${tone}\n` : '';
  const lengthHint = length ? `长度偏好：${length}\n` : '';
  const systemPrompt = PLATFORM_PROMPTS[promptKey]
    .replace('{content}', rewriteContent || '')
    .replace('{tone_hint}', toneHint)
    .replace('{length_hint}', lengthHint);

  // 4. 调 LLM（直接 HTTP，跟 GEO 改写同模式）
  try {
    const result = await callLLM({ model, apiKey, systemPrompt, content: rewriteContent || '' });
    // 富文本模式：把 LLM 输出合并回 rich_content（占位符替换）
    if (useRichPrompt && rewriteImages && rewriteImages.length) {
      const richContentMod = require('./rich-content');
      // LLM 输出 content 含占位符（或者 LLM 删了占位符 — 兜底）
      let outContent = result.content || '';
      // 收集 LLM 输出中实际出现的占位符
      const phRegex = /\{\{IMG_(\d+)\}\}/g;
      const foundPlaceholders = new Set();
      let m;
      while ((m = phRegex.exec(outContent)) !== null) foundPlaceholders.add(parseInt(m[1], 10));
      phRegex.lastIndex = 0;
      // 如果 LLM 删了占位符 — 把缺失的占位符插入到合适位置（最后段落后）
      const expectedIds = rewriteImages.map((_, i) => i + 1);
      const missingIds = expectedIds.filter(id => !foundPlaceholders.has(id));
      if (missingIds.length > 0) {
        // 追加到末尾，每张图一段
        missingIds.forEach(id => {
          outContent += (outContent ? '\n\n' : '') + '{{IMG_' + id + '}}';
        });
      }
      // 构造 LLM 改写后的 rich_content（用 LLM 输出文本按段落 + 占位符重新解析）
      const llmBlocks = parseContentWithPlaceholders(outContent, rewriteImages);
      return Object.assign({}, result, {
        content: outContent,  // 保留占位符的文本
        rich_content: llmBlocks,  // 含 image block
        rich_images: rewriteImages,  // 图片数组（下游 provider 用）
        has_images: true,
      });
    }
    return result;
  } catch (e) {
    return { ok: false, error: `llm_call_failed: ${e.message}` };
  }
}

// 把 LLM 改写后的文本（含 {{IMG_N}} 占位符）解析回 rich_content 数组
function parseContentWithPlaceholders(text, images) {
  const blocks = [];
  // 按段落（\n\n 或换行）分
  const segs = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
  for (const seg of segs) {
    // 检查段是否纯占位符（如 "{{IMG_1}}"）
    const phMatch = seg.match(/^(\s*\{\{IMG_(\d+)\}\}\s*)+$/);
    if (phMatch) {
      // 多个占位符串在一起——拆开各成 image 块
      const ids = [...seg.matchAll(/\{\{IMG_(\d+)\}\}/g)].map(m => parseInt(m[1], 10));
      ids.forEach(id => {
        const img = images[id - 1];
        if (img) blocks.push(Object.assign({}, img, { type: 'image' }));
      });
      continue;
    }
    // 含占位符的段落 — 拆分（占位符独立成 image 块）
    const phRegex = /\{\{IMG_(\d+)\}\}/g;
    let lastIdx = 0;
    let m;
    let hasPlaceholder = false;
    while ((m = phRegex.exec(seg)) !== null) {
      hasPlaceholder = true;
      // 占位符前的文本
      if (m.index > lastIdx) {
        const t = seg.substring(lastIdx, m.index).trim();
        if (t) blocks.push({ type: 'text', subtype: 'paragraph', text: t, runs: [{ text: t }] });
      }
      // 占位符 → image 块
      const img = images[parseInt(m[1], 10) - 1];
      if (img) blocks.push(Object.assign({}, img, { type: 'image' }));
      lastIdx = m.index + m[0].length;
    }
    phRegex.lastIndex = 0;
    if (lastIdx < seg.length) {
      const t = seg.substring(lastIdx).trim();
      if (t) blocks.push({ type: 'text', subtype: 'paragraph', text: t, runs: [{ text: t }] });
    }
    if (!hasPlaceholder) {
      blocks.push({ type: 'text', subtype: 'paragraph', text: seg, runs: [{ text: seg }] });
    }
  }
  return blocks;
}

// ── LLM 调用（按 provider 路由）──
async function callLLM({ model, apiKey, systemPrompt, content }) {
  const { provider, model: modelName, baseUrl } = model;

  // 统一 OpenAI 兼容协议
  const url = baseUrl
    ? `${baseUrl}/chat/completions`
    : provider === 'anthropic'
    ? 'https://api.anthropic.com/v1/messages'
    : provider === 'deepseek'
    ? 'https://api.deepseek.com/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';

  let body, headers;

  if (provider === 'anthropic') {
    headers = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    };
    body = JSON.stringify({
      model: modelName,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: '请按 system prompt 改写' }],
    });
  } else {
    // OpenAI 兼容（含 deepseek/qwen/openai/moonshot/yi 等）
    headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    body = JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '请按要求改写素材' },
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' },
    });
  }

  const response = await fetch(url, { method: 'POST', headers, body });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();

  // 提取内容
  let content_text;
  if (provider === 'anthropic') {
    content_text = data.content?.[0]?.text;
  } else {
    content_text = data.choices?.[0]?.message?.content;
  }

  if (!content_text) {
    throw new Error('empty_response');
  }

  // 解析 JSON
  let parsed;
  try {
    // 尝试提取 JSON（容错：可能含 markdown code block）
    const jsonMatch = content_text.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { content: content_text };
  } catch (e) {
    // 解析失败：原样返回
    parsed = { content: content_text };
  }

  return {
    ok: true,
    content: parsed.content || content_text,
    title: parsed.title,
    summary: parsed.summary,
    tags: parsed.tags,
    hashtags: parsed.hashtags,
    model_id: model.id,
    model_name: model.name,
    tokens_used: data.usage?.total_tokens || 0,
  };
}

module.exports = {
  rewrite,
  PLATFORM_PROMPTS,
};
