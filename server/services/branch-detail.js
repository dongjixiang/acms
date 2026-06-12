// 决策树分支详情服务（v0.3.2 极简思路区 增量）
// 用户点开决策树分支的「类比徽章」→ 后端调 LLM 生成 3-5 个该分支/类比的「设计特色」
// 每个特色：{ title, desc, image_prompt, image_asset?, image_status }
// 流程：先调 LLM 出 3-5 特色（带 image_prompt），再异步批量生图
// 缓存：requirement.thinking_brief.branch_details[idx] = { status, features, started_at, completed_at, error }
const { callLLM } = require('./llm-adapter');
const modelStore = require('../stores/model-store');
const reqStore = require('../stores/requirement-store');
const genAdapter = require('./gen-adapter');
const projectStore = require('../stores/project-store');
const { collection } = require('../db/connection');

// ===== Prompt =====
const FEATURES_SYSTEM_PROMPT = `你是 ACMS 系统的「产品特色分析助手」。给定一个需求和一个决策树分支（带类比产品），你的工作是从该类比产品中**提炼出 3-5 个独特的设计特色**——这些特色是该产品**独有**的，不是通用维度。

每个特色结构：
- title (≤ 15 字): 特色的简短名称（用户一眼能看懂）
- desc (≤ 30 字): 一句话说明它是什么 / 怎么用
- image_prompt (≤ 80 字中文): 用于生图的 prompt，描述该特色的**视觉场景**（界面截图风格）

要求：
1. **特色要具体到产品**——不要「界面美观」「流程顺畅」这种空话；要「AI 自动填字段」「Pipeline 多阶段看板」这种该产品独有的
2. **涵盖不同维度**——不要全是功能点；可以有交互细节、视觉处理、数据展示、协作方式等
3. **image_prompt 要中文**（MiniMax 中文实体保真度更好）——描述一个具体场景，例如「一个看板界面，多列卡片表示销售线索的不同阶段」
4. **特色数量 3-5 个**——不要少于 3 个，也不要超过 5 个

输出严格 JSON，格式：
{
  "features": [
    {"title": "AI 自动填字段", "desc": "从邮件/会议上下文自动抽取客户信息并填入 CRM", "image_prompt": "一个 CRM 客户详情页面，AI 正在自动填充邮箱和职位字段"},
    ...
  ]
}

不要任何额外文字、markdown 代码块、解释。`;

function pickDefaultLlm() {
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0]
      || null;
}

// 优选 minimax-image > comfyui（与 insight-previews 保持一致）
function pickDefaultImageProvider() {
  try {
    const all = collection('generators').find(g => g.type === 'image' && g.status === 'active');
    const preferred = all.find(g => g.provider === 'minimax-image')
                  || all.find(g => g.provider === 'comfyui')
                  || all[0];
    return preferred ? preferred.id : null;
  } catch (e) {
    return null;
  }
}

/**
 * 调 LLM 生成特色（3-5 个）
 * @param {string} title 需求标题
 * @param {string} description 需求描述
 * @param {object} branch 分支 { label, desc, examples, pros, cons }
 * @param {string} [role]
 * @param {string} [modelId]
 * @returns {Promise<{features: Array, modelId}>}
 */
async function generateFeatures(title, description, branch, role, modelId) {
  const model = modelId ? modelStore.getById(modelId) : pickDefaultLlm();
  if (!model) throw new Error('NO_LLM_AVAILABLE');

  const examples = branch.examples || '';
  const messages = [
    { role: 'system', content: FEATURES_SYSTEM_PROMPT },
    { role: 'user', content: [
      `需求标题: ${title || '(空)'}`,
      `需求描述: ${description || '(空)'}`,
      `决策树分支: ${branch.label || ''}`,
      `分支说明: ${branch.desc || ''}`,
      `类比产品: ${examples}`,
      role ? `用户角色: ${role}` : '',
    ].filter(Boolean).join('\n') },
  ];

  const result = await callLLM(model.id, messages, {
    temperature: 0.7,
    maxTokens: 1500,
    jsonMode: true,
  });

  // 多层 JSON 提取（兼容 markdown 包裹 / 深度嵌套 / 中文思考前缀）
  let content = (result.content || '').trim();
  // 诊断：把原始 content 落盘（解析失败时排查用）
  try { require('fs').writeFileSync('/tmp/branch-detail-last-llm.txt', content, 'utf8'); } catch {}
  if (content.startsWith('```')) {
    content = content.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  }
  const jsonStart = content.indexOf('{');
  if (jsonStart >= 0) content = content.substring(jsonStart);
  const jsonEnd = content.lastIndexOf('}');
  if (jsonEnd > jsonStart) content = content.substring(0, jsonEnd + 1);
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    // 把诊断快照 + 错误位置一并写日志
    const ctx = content.substring(Math.max(0, 916 - 50), Math.min(content.length, 916 + 50));
    console.error(`[branch-detail] JSON parse failed: ${e.message}\n  content length: ${content.length}\n  context @916: ...${ctx}...`);
    throw e;
  }

  const features = Array.isArray(parsed.features) ? parsed.features : [];
  // 校验：每个 feature 至少有 title/desc/image_prompt
  const valid = features.filter(f => f && f.title && f.desc && f.image_prompt);
  return { features: valid, modelId: model.id };
}

/**
 * 异步：生成详情（LLM 特色 + 配图）
 * 写入 requirement.thinking_brief.branch_details[idx]
 * @param {string} requirementId
 * @param {number} branchIdx
 * @param {object} opts { modelId, role }
 */
async function runBranchDetailJob(requirementId, branchIdx, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  let brief;
  try { brief = JSON.parse(req.thinking_brief || 'null'); }
  catch { brief = null; }
  if (!brief || !Array.isArray(brief.decision_tree) || !brief.decision_tree[branchIdx]) {
    console.error(`[branch-detail] ${requirementId}/${branchIdx} 找不到 decision_tree`);
    return;
  }

  const branch = brief.decision_tree[branchIdx];

  // 初始化 branch_details[idx]
  brief.branch_details = brief.branch_details || [];
  brief.branch_details[branchIdx] = {
    status: 'generating',
    features: [],
    started_at: new Date().toISOString(),
    completed_at: null,
    error: null,
    model: null,
  };
  reqStore.update(requirementId, { thinking_brief: JSON.stringify(brief) });
  console.log(`[branch-detail] ${requirementId}/${branchIdx} 开始生成特色+配图`);

  try {
    // Step 1: LLM 生成特色（3-5 个）
    const { features, modelId } = await generateFeatures(
      req.title, req.description, branch, opts.role, opts.modelId
    );

    // Step 2: 立即把 LLM 结果写回（features 已就绪，image_status=generating）
    brief.branch_details[branchIdx] = {
      ...brief.branch_details[branchIdx],
      features: features.map(f => ({
        title: f.title,
        desc: f.desc,
        image_prompt: f.image_prompt,
        image_asset: null,
        image_status: 'generating',
        image_error: null,
      })),
      model: modelId,
    };
    reqStore.update(requirementId, { thinking_brief: JSON.stringify(brief) });
    console.log(`[branch-detail] ${requirementId}/${branchIdx} LLM 返回 ${features.length} 个特色`);

    // Step 3: 异步生图（不阻塞主流程）
    const project = projectStore.getById(req.project_id);
    const projectSlug = project?.slug || req.project_id;
    const imageProviderId = pickDefaultImageProvider();
    console.log(`[branch-detail] ${requirementId}/${branchIdx} 选 image provider: ${imageProviderId || '(null=自动)'}`);
    genImageBatch(requirementId, branchIdx, projectSlug, imageProviderId).catch(e =>
      console.error(`[branch-detail] ${requirementId}/${branchIdx} 批量生图异常:`, e.message)
    );

  } catch (e) {
    console.error(`[branch-detail] ${requirementId}/${branchIdx} 生成失败:`, e.message);
    brief.branch_details[branchIdx] = {
      ...brief.branch_details[branchIdx],
      status: 'failed',
      error: e.message,
      completed_at: new Date().toISOString(),
    };
    reqStore.update(requirementId, { thinking_brief: JSON.stringify(brief) });
  }
}

/**
 * 异步批量生图（更新 branch_details[idx].features[i].image_*）
 */
async function genImageBatch(requirementId, branchIdx, projectSlug, providerId) {
  const req = reqStore.getById(requirementId);
  if (!req) return;
  let brief;
  try { brief = JSON.parse(req.thinking_brief || 'null'); }
  catch { brief = null; }
  if (!brief?.branch_details?.[branchIdx]) return;
  const detail = brief.branch_details[branchIdx];
  const features = detail.features || [];

  // 并发生图（最多 3 个同时，避免过载）
  const CONCURRENT = 3;
  for (let i = 0; i < features.length; i += CONCURRENT) {
    const slice = features.slice(i, i + CONCURRENT);
    await Promise.all(slice.map(async (_, j) => {
      const idx = i + j;
      const f = features[idx];
      if (!f) return;
      try {
        const result = await genAdapter.generateImage(projectSlug, providerId, f.image_prompt, {
          size: '512x512',  // 详情面板小图
          n: 1,
          tags: ['branch-detail', `req-${requirementId}`, `branch-${branchIdx}`],
        });
        features[idx].image_asset = result.assetPath;
        features[idx].image_status = 'done';
        features[idx].image_mime = result.mime;
      } catch (e) {
        features[idx].image_status = 'failed';
        features[idx].image_error = e.message;
        console.error(`[branch-detail] ${requirementId}/${branchIdx} 特色 ${idx} 生图失败:`, e.message);
      }
    }));
    // 每批写回一次
    brief.branch_details[branchIdx].features = features;
    reqStore.update(requirementId, { thinking_brief: JSON.stringify(brief) });
  }

  // 全部完成，标 status=done
  const fresh = reqStore.getById(requirementId);
  if (fresh) {
    try {
      const fb = JSON.parse(fresh.thinking_brief || 'null');
      if (fb?.branch_details?.[branchIdx]) {
        fb.branch_details[branchIdx].status = 'done';
        fb.branch_details[branchIdx].completed_at = new Date().toISOString();
        reqStore.update(requirementId, { thinking_brief: JSON.stringify(fb) });
      }
    } catch (e) { /* 静默 */ }
  }
  console.log(`[branch-detail] ${requirementId}/${branchIdx} 全部完成`);
}

/**
 * 读取详情（前端轮询用）
 */
function getBranchDetail(requirementId, branchIdx) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try {
    const brief = JSON.parse(req.thinking_brief || 'null');
    return brief?.branch_details?.[branchIdx] || null;
  } catch {
    return null;
  }
}

module.exports = { generateFeatures, runBranchDetailJob, getBranchDetail };
