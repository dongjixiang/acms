// 决策树分支详情服务（v0.3.2 极简思路区 增量）
// 用户点开决策树分支的「类比徽章」→ 后端调 LLM 生成 3-5 个该分支/类比的「设计特色」
// 每个特色：{ title, desc }
// v0.3.6：去掉了配图（AI 概念图不真实，省 Token）
// 缓存：requirement.thinking_brief.branch_details[idx] = { status, features, started_at, completed_at, error }
const { callLLM } = require('./llm-adapter');
const modelStore = require('../stores/model-store');
const reqStore = require('../stores/requirement-store');

// ===== Prompt =====
const FEATURES_SYSTEM_PROMPT = `你是 ACMS 系统的「产品特色分析助手」。给定一个需求和一个决策树分支（带类比产品），你的工作是从该类比产品中**提炼出 3-5 个独特的设计特色**——这些特色是该产品**独有**的，不是通用维度。

每个特色结构：
- title (≤ 15 字): 特色的简短名称（用户一眼能看懂）
- desc (≤ 30 字): 一句话说明它是什么 / 怎么用

要求：
1. **特色要具体到产品**——不要「界面美观」「流程顺畅」这种空话；要「AI 自动填字段」「Pipeline 多阶段看板」这种该产品独有的
2. **涵盖不同维度**——不要全是功能点；可以有交互细节、视觉处理、数据展示、协作方式等
3. **特色数量 3-5 个**——不要少于 3 个，也不要超过 5 个

输出严格 JSON，格式：
{
  "features": [
    {"title": "AI 自动填字段", "desc": "从邮件/会议上下文自动抽取客户信息并填入 CRM"},
    ...
  ]
}

不要任何额外文字、markdown 代码块、解释。`;

function pickDefaultLlm() {
  // v0.3.6：优先使用系统配置的「默认思路模型」
  const defaultGen = modelStore.getDefaultGenModel();
  if (defaultGen) return defaultGen;
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0]
      || null;
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

  // v0.3.3 数据源切换：决策树迁出到 assist_decision_tree 独立字段（Phase 2）
  // 老 brief.decision_tree 仍作为 fallback 兼容
  let branch = null;
  let assistTree = null;
  try { assistTree = JSON.parse(req.assist_decision_tree || 'null'); } catch { /* 静默 */ }
  if (assistTree && Array.isArray(assistTree.tree) && assistTree.tree[branchIdx]) {
    branch = assistTree.tree[branchIdx];
  } else if (brief && Array.isArray(brief.decision_tree) && brief.decision_tree[branchIdx]) {
    branch = brief.decision_tree[branchIdx];
  }
  if (!branch) {
    console.error(`[branch-detail] ${requirementId}/${branchIdx} 找不到 decision_tree（已查 assist_decision_tree + thinking_brief.decision_tree）`);
    return;
  }

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

    // Step 2: 写回 LLM 结果（v0.3.6：去掉了 image_prompt 和 image 生成）
    brief.branch_details[branchIdx] = {
      ...brief.branch_details[branchIdx],
      features: features.map(f => ({
        title: f.title,
        desc: f.desc,
      })),
      model: modelId,
    };
    reqStore.update(requirementId, { thinking_brief: JSON.stringify(brief) });
    console.log(`[branch-detail] ${requirementId}/${branchIdx} LLM 返回 ${features.length} 个特色（无配图）`);
    // v0.3.6：跳过生图步骤

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

// v0.3.6：去掉了 genImageBatch（不再生成 AI 概念图）

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
