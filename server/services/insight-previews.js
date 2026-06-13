// 洞察类需求预览服务（30 文档「一放一收」第一步）
// 流程：
//   1. 同步：LLM 评估 input_clarity（high/medium/low）
//   2. 异步：fire-and-forget 启动 3 张视觉预览图生成
//   3. 状态写回 requirement 文档，前端轮询查询
// 字段：
//   requirement.input_clarity: 'high' | 'medium' | 'low' | null
//   requirement.insight_previews: {
//     status: 'pending' | 'generating' | 'done' | 'failed' | 'skipped',
//     variants: [{ id, label, rationale, prompt, asset_path, mime, model, picked }],
//     started_at, completed_at, error, picked_variant_id
//   }
const { callLLM } = require('./llm-adapter');
const { safeParseJSON } = require('./json-extractor');
const modelStore = require('../stores/model-store');
const genAdapter = require('./gen-adapter');
const reqStore = require('../stores/requirement-store');
const projectStore = require('../stores/project-store');
const { collection } = require('../db/connection');

const PROVIDER_ID = null; // null = genStore.getBestMatch 自动选

// ===== Prompt 1: 明确度判定 =====
// v0.3.3 B 方案补丁（2026-06-13）：调松判定门槛 — 多多反馈"开放问题太多是思维负担"
// 旧标准：high 要"具体场景+边界+输入输出示例+验收点"4 项全有，medium 要"意图+大致方向"
// 新标准：high "主要要素都有"（用户+场景+核心功能），medium "意图明确+至少 1 个具体维度"
// 目的：让重整后的需求更容易评到 medium → 路由器优先选具象化手段（scenarios/tradeoff/arch）而不是 diagnosis
const CLARITY_SYSTEM_PROMPT = `你是 ACMS 系统的「需求明确度评估员」。根据用户给出的需求标题和描述，判断其明确程度。

评估标准（**调松版**，避免过度挑刺）：
- **high**: 描述里有明确的**用户群体** + **使用场景** + **核心功能/价值** 三个要素（不一定都全，但至少有用户和场景），意图清晰、可以直接进入细化。
- **medium**: 描述里有**明确意图**（用户知道大概要什么）+ 至少一个**具体维度**（场景/功能/数据/界面任一有具体描述），但还有空白可以填充。这是大多数需求的状态。
- **low**: 描述只有标题、极短的一句话、或纯抽象形容词（"做个好用的"、"高效的"等），用户自己也不太清楚要什么。

判定原则：
- **宁松勿严**：如果描述里有任何具体要素（具体角色名、具体功能名、具体场景），优先评 medium 而不是 low
- **关注"意图清晰度"**而不是"细节完整度"——用户知道要做 A 给 B 用，意图就清晰，即使没说边界也算 medium

输出严格 JSON，格式：
{"clarity":"high|medium|low","reason":"一句话说明（≤30字）"}

不要任何额外文字、markdown 代码块、解释。`;

// ===== Prompt 2: 3 变体 prompt 生成 =====
const VARIANTS_SYSTEM_PROMPT = `你是 ACMS 系统的「需求可视化助手」。把一个模糊需求拆成 3 个**互不重叠的具象化方向**，每个方向给：
1. 一个中文 label（≤12 字，描述这个方向是什么）
2. 一段英文 image generation prompt（详细、具体、可视觉化的画面描述）

要求：
- 3 个方向必须**互不重叠**（不重复的具象化角度）
- 每个方向都应该**视觉化**（不是抽象描述）
- image prompt 用中文（≤80字），包含主体、环境、风格、光线、构图（Z-Image/Qwen-Image 对中文实体保真度更好，无需翻译）
- 不要包含"3D/2D"等限制词前缀（让模型自由发挥）
- 输出严格 JSON，格式：
{"variants":[
  {"label":"方向A","rationale":"为什么选这个角度（≤20字）","prompt":"English image prompt..."},
  {"label":"方向B","rationale":"...","prompt":"..."},
  {"label":"方向C","rationale":"...","prompt":"..."}
]}
不要任何额外文字、markdown 代码块、解释。`;

// 默认模型选择：找第一个启用的 chat/text 模型
function pickDefaultLlm() {
  const all = modelStore.list();
  // 优先 text → chat
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0]
      || null;
}

// 默认图片生成模型：优先 MiniMax（与 modelRef 自动复用 key），避免走 DALL-E 假 key
function pickDefaultImageProvider() {
  try {
    const all = collection('generators').find(g => g.type === 'image' && g.status === 'active');
    // 优先级：minimax > comfyui > 其他（dalle 默认有假 key）
    const preferred = all.find(g => g.provider === 'minimax-image')
                  || all.find(g => g.provider === 'comfyui')
                  || all[0];
    return preferred?.id || null;
  } catch { return null; }
}

/**
 * 同步：评估需求明确度
 * @param {string} title
 * @param {string} description
 * @param {string} [modelId]
 * @returns {Promise<{clarity, reason, modelId}>}
 */
async function assessClarity(title, description, modelId) {
  const model = modelId ? modelStore.getById(modelId) : pickDefaultLlm();
  if (!model) {
    console.warn('[insight] 无可用 LLM 模型，跳过明确度评估');
    return { clarity: null, reason: 'NO_LLM_AVAILABLE', modelId: null };
  }
  const messages = [
    { role: 'system', content: CLARITY_SYSTEM_PROMPT },
    { role: 'user', content: `需求标题: ${title || '(空)'}\n\n需求描述: ${description || '(空)'}` },
  ];
  try {
    const result = await callLLM(model.id, messages, {
      temperature: 0.3,
      maxTokens: 200,
      jsonMode: true,
    });
    // v0.3.3 B 方案补丁：多层 JSON 提取
    const parsed = safeParseJSON(result.content);
    if (!parsed) throw new Error('LLM 返回无法解析为 JSON');
    const clarity = ['high', 'medium', 'low'].includes(parsed.clarity) ? parsed.clarity : null;
    return { clarity, reason: parsed.reason || '', modelId: model.id };
  } catch (e) {
    console.error('[insight] 明确度评估失败:', e.message);
    return { clarity: null, reason: 'LLM_ERROR: ' + e.message, modelId: model.id };
  }
}

/**
 * 同步：生成 3 个变体的 image prompt
 * @param {string} title
 * @param {string} description
 * @param {string} clarity
 * @param {string} [role] - 用户角色（PM/技术/...），用于 prompt 注入
 * @param {string} [modelId]
 * @returns {Promise<{variants, modelId}>}
 */
async function generateVariants(title, description, clarity, role, modelId) {
  const model = modelId ? modelStore.getById(modelId) : pickDefaultLlm();
  if (!model) throw new Error('NO_LLM_AVAILABLE');
  const messages = [
    { role: 'system', content: VARIANTS_SYSTEM_PROMPT },
    { role: 'user', content: [
      `需求标题: ${title || '(空)'}`,
      `需求描述: ${description || '(空)'}`,
      `明确度: ${clarity || 'unknown'}`,
      role ? `用户角色: ${role}` : '',
    ].filter(Boolean).join('\n') },
  ];
  const result = await callLLM(model.id, messages, {
    temperature: 0.9,
    maxTokens: 800,
    jsonMode: true,
  });
  // v0.3.3 B 方案补丁：多层 JSON 提取
  const parsed = safeParseJSON(result.content);
  if (!parsed) throw new Error('LLM 返回无法解析为 JSON');
  return { variants: parsed.variants || [], modelId: model.id };
}

/**
 * 异步：生成 3 张图片（并发 + 容错）
 * @param {string} projectSlug
 * @param {string} providerId
 * @param {Array<{label, prompt}>} variants
 * @returns {Promise<Array<{label, prompt, asset_path, mime, model, error}>>}
 */
async function generatePreviewImages(projectSlug, providerId, variants) {
  const tasks = variants.map(async (v, idx) => {
    try {
      const result = await genAdapter.generateImage(projectSlug, providerId, v.prompt, {
        size: '1024x1024',
        n: 1,
        tags: ['insight-preview', `variant-${idx}`],
      });
      return {
        id: `v${idx}_${Date.now().toString(36).toUpperCase()}`,
        label: v.label,
        rationale: v.rationale || '',
        prompt: v.prompt,
        asset_path: result.assetPath,
        mime: result.mime,
        model: result.metadata?.model || 'unknown',
        picked: false,
        error: null,
      };
    } catch (e) {
      console.error(`[insight] 变体 ${idx} 生成失败:`, e.message);
      return {
        id: `v${idx}_${Date.now().toString(36).toUpperCase()}`,
        label: v.label,
        rationale: v.rationale || '',
        prompt: v.prompt,
        asset_path: null,
        mime: null,
        model: null,
        picked: false,
        error: e.message,
      };
    }
  });
  return Promise.all(tasks);
}

/**
 * 异步：完整的预览生成流程（在后台跑）
 * @param {string} requirementId
 * @param {object} opts { modelId, imageProviderId, role }
 */
async function runPreviewJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;
  const project = projectStore.getById(req.project_id);
  const projectSlug = project?.slug || req.project_id;

  // 1. 标记 generating
  reqStore.update(requirementId, {
    insight_previews: JSON.stringify({
      status: 'generating',
      variants: [],
      started_at: new Date().toISOString(),
      completed_at: null,
      error: null,
      picked_variant_id: null,
    }),
  });
  console.log(`[insight] ${requirementId} 开始生成预览`);

  try {
    // 2. 生成 3 变体 prompt
    const { variants } = await generateVariants(
      req.title, req.description, req.input_clarity, opts.role, opts.modelId
    );
    if (!variants || variants.length === 0) throw new Error('LLM 未返回有效变体');

    // 3. 写回中间状态（让前端能看到 "正在准备图片..."）
    reqStore.update(requirementId, {
      insight_previews: JSON.stringify({
        status: 'generating',
        variants: variants.map((v, i) => ({
          id: `v${i}_pending`, label: v.label, prompt: v.prompt,
          asset_path: null, mime: null, model: null, picked: false, error: null,
        })),
        started_at: JSON.parse(reqStore.getById(requirementId).insight_previews || '{}').started_at,
        completed_at: null, error: null, picked_variant_id: null,
      }),
    });

    // 4. 并发生成 3 张图
    const imageProviderId = opts.imageProviderId || pickDefaultImageProvider();
    const results = await generatePreviewImages(projectSlug, imageProviderId, variants);

    // 5. 写回最终结果
    const hasAnySuccess = results.some(r => r.asset_path);
    const finalState = {
      status: hasAnySuccess ? 'done' : 'failed',
      variants: results,
      started_at: JSON.parse(reqStore.getById(requirementId).insight_previews || '{}').started_at,
      completed_at: new Date().toISOString(),
      error: hasAnySuccess ? null : '所有图片生成均失败',
      picked_variant_id: null,
    };
    reqStore.update(requirementId, { insight_previews: JSON.stringify(finalState) });
    console.log(`[insight] ${requirementId} 预览完成，${results.filter(r => r.asset_path).length}/3 成功`);
  } catch (e) {
    console.error(`[insight] ${requirementId} 预览任务失败:`, e.message);
    reqStore.update(requirementId, {
      insight_previews: JSON.stringify({
        status: 'failed',
        variants: [],
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        error: e.message,
        picked_variant_id: null,
      }),
    });
  }
}

/**
 * 用户选中某个变体：合并内容到 srs.summary + 标记 picked + 状态转 clarifying
 * @param {string} requirementId
 * @param {string} variantId
 */
function pickVariant(requirementId, variantId) {
  const req = reqStore.getById(requirementId);
  if (!req) return { error: 'REQ_NOT_FOUND' };
  if (req.status !== 'idea') return { error: 'ONLY_IDEA_STATUS', status: req.status };

  const previews = JSON.parse(req.insight_previews || '{}');
  if (!previews.variants || previews.variants.length === 0) {
    return { error: 'NO_VARIANTS' };
  }
  const variant = previews.variants.find(v => v.id === variantId);
  if (!variant) return { error: 'VARIANT_NOT_FOUND' };
  if (!variant.asset_path) return { error: 'VARIANT_NOT_GENERATED', errorMsg: variant.error };

  // 标记 picked
  previews.variants = previews.variants.map(v => ({ ...v, picked: v.id === variantId }));
  previews.picked_variant_id = variantId;
  reqStore.update(requirementId, { insight_previews: JSON.stringify(previews) });

  // 把选中的变体内容合并进 srs
  const currentSrs = JSON.parse(req.srs || '{}');
  const augmentedSummary = [
    currentSrs.summary || req.description || req.title,
    '',
    `--- AI 视觉预览（用户已选） ---`,
    `方向: ${variant.label}`,
    `描述: ${variant.prompt}`,
    `图片: ${variant.asset_path}`,
  ].join('\n');
  reqStore.updateSrs(requirementId, {
    ...currentSrs,
    summary: augmentedSummary,
  });

  // 状态机转 clarifying（idea → clarifying 合法）
  const transResult = reqStore.transition(requirementId, 'clarifying', { id: 'user', type: 'human' });
  if (transResult.error) {
    return { error: transResult.error };
  }
  console.log(`[insight] ${requirementId} 选中变体 ${variantId}，已转 clarifying`);
  return { ok: true, requirement: reqStore.getById(requirementId) };
}

/**
 * 跳过预览：标记 skipped，状态可手动转 clarifying
 */
function skipPreviews(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return { error: 'REQ_NOT_FOUND' };
  if (req.status !== 'idea') return { error: 'ONLY_IDEA_STATUS', status: req.status };
  const previews = JSON.parse(req.insight_previews || '{}');
  previews.status = previews.status === 'generating' ? 'skipped' : previews.status;
  previews.picked_variant_id = 'skipped';
  reqStore.update(requirementId, { insight_previews: JSON.stringify(previews) });
  return { ok: true, requirement: reqStore.getById(requirementId) };
}

module.exports = {
  assessClarity,
  generateVariants,
  generatePreviewImages,
  runPreviewJob,
  pickVariant,
  skipPreviews,
  // 工具导出方便测试
  pickDefaultLlm,
  pickDefaultImageProvider,
};
