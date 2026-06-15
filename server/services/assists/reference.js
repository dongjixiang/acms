// 借鉴卡片 v2 — 产品简报模式（2026-06-14）
// 三步骤：profile（产品全景）→ diagrams（可视化图表）→ insights（核心理念）
// 替代旧版表格选择器模式
// 字段：requirement.assist_reference

const { callLLMWithRetry } = require('../json-extractor');
const modelStore = require('../../stores/model-store');
const reqStore = require('../../stores/requirement-store');
const fs = require('fs');
const path = require('path');

function pickDefaultLlm() {
  const defaultGen = modelStore.getDefaultGenModel();
  if (defaultGen) return defaultGen;
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0]
      || null;
}

// 加载 prompt 文件
function loadPrompt(name) {
  try {
    return fs.readFileSync(path.join(__dirname, '../../skills/reference-brief/prompts', `${name}.md`), 'utf-8').trim();
  } catch { return null; }
}

// Step 1: 生成产品全景
async function stepProfile(model, context) {
  const prompt = loadPrompt('profile');
  if (!prompt) throw new Error('PROMPT_PROFILE_NOT_FOUND');

  const messages = [
    { role: 'system', content: prompt },
    { role: 'user', content: context },
  ];
  const parsed = await callLLMWithRetry(model, messages, {
    temperature: 0.5, maxTokens: 4000, jsonMode: true, serviceName: 'reference:profile',
  });
  return {
    productName: parsed.产品名 || parsed.productName || parsed.产品名称 || parsed.product_name || '',
    profile: {
      定位: parsed.定位 || '',
      核心功能: parsed.核心功能 || '',
      工作流程: parsed.工作流程 || '',
      典型用户: parsed.典型用户 || '',
    },
  };
}

// 从上下文中提取产品名（兜底）
function extractProductFromContext(ctx) {
  // 匹配「类似XXX」「像XXX一样」「参考XXX」「XXX产品」等模式
  const m = ctx.match(/(?:类似|像|参考|借鉴|对标)\s*[「『""]?([^「『""」』\s,，。、]{2,20})[」』""]?\s*(?:一样|产品|平台|工具|的)/);
  return m ? m[1] : '';
}

// Step 2: 生成可视化图表
async function stepDiagrams(model, context, profile) {
  const prompt = loadPrompt('diagrams');
  if (!prompt) throw new Error('PROMPT_DIAGRAMS_NOT_FOUND');

  const messages = [
    { role: 'system', content: prompt },
    { role: 'user', content: `${context}\n## 产品全景\n${JSON.stringify(profile, null, 2)}` },
  ];
  const result = await callLLMWithRetry(model, messages, {
    temperature: 0.6, maxTokens: 4000, jsonMode: true, serviceName: 'reference:diagrams',
  });
  return Array.isArray(result.diagrams) ? result.diagrams.slice(0, 3) : [];
}

// Step 3: 生成核心理念
async function stepInsights(model, context, profile, diagrams, excludeTitles) {
  const prompt = loadPrompt('insights');
  if (!prompt) throw new Error('PROMPT_INSIGHTS_NOT_FOUND');

  const excludeNote = (excludeTitles && excludeTitles.length > 0)
    ? `\n\n## 排除已存在的理念\n以下理念已生成，请从不同角度重新提炼：\n${excludeTitles.map((t, i) => `${i+1}. ${t}`).join('\n')}`
    : '';

  const messages = [
    { role: 'system', content: prompt },
    { role: 'user', content: `${context}\nProfile: ${JSON.stringify(profile)}\nDiagrams: ${JSON.stringify(diagrams)}${excludeNote}` },
  ];
  const result = await callLLMWithRetry(model, messages, {
    temperature: 0.65, maxTokens: 4000, jsonMode: true, serviceName: 'reference:insights',
  });
  return Array.isArray(result.insights) ? result.insights.slice(0, 3) : [];
}

// 主入口
async function runAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  // 读对话历史，让 LLM 知道用户在聊什么产品
  let supplementHistory = [];
  try { supplementHistory = JSON.parse(req.supplement_history || '[]'); } catch {}
  const userMessages = Array.isArray(supplementHistory) ? supplementHistory
    .filter(h => h.role === 'user' && h.text)
    .slice(-6)
    .map(h => h.text.slice(0, 150)) : [];
  // 构建完整上下文：合并简介 + 用户聊天历史
  const contextParts = [
    `需求标题: ${req.title || ''}`,
    `需求描述: ${req.description || ''}`,
    `对话焦点: ${opts.followupQuestion || ''}`,
  ];
  if (userMessages.length > 0) {
    contextParts.push('---');
    contextParts.push('【用户提及的内容（最新在前）】:');
    userMessages.reverse().forEach((t, i) => contextParts.push(`用户: ${t}`));
  }
  const context = contextParts.filter(Boolean).join('\n');
  // 让 LLM 从上下文推断产品名，也可从竞品点击传入
  const productName = opts.productName || '';
  // 缓存命中：同产品已完成且不是主动换一批 → 更新轮次后直接返回
  if (productName && !opts.forceRegenerate) {
    const existing = getExistingAssist(req);
    if (existing && existing.status === 'done' && existing.target_product === productName) {
      // 更新 generated_at_round 到当前轮次，避免 renderAssistLayer 的轮次检查跳过
      if (typeof opts.chatRound === 'number' && existing.generated_at_round !== opts.chatRound) {
        existing.generated_at_round = opts.chatRound;
        existing.generated_at = new Date().toISOString();
        reqStore.update(requirementId, { assist_reference: JSON.stringify(existing) });
      }
      return; // 已有缓存，无需重新生成
    }
  }
  // 如果传入了 productName，注入到 context 头部
  const productHint = productName ? `【用户指定了产品: ${productName}】\n` : '';

  const model = opts.modelId ? modelStore.getById(opts.modelId) : pickDefaultLlm();
  if (!model) {
    reqStore.update(requirementId, {
      assist_reference: JSON.stringify({
        status: 'failed', mode: 'brief', error: 'NO_LLM_AVAILABLE',
        used: false, generated_at: new Date().toISOString(),
      }),
    });
    return;
  }

  // 判断是「换一批核心理念」还是完整生成
  const existing = getExistingAssist(req);
  const isRefreshInsights = opts.refreshInsights && existing && existing.profile && existing.diagrams;

  if (isRefreshInsights) {
    // 仅刷新核心理念
    const excludeTitles = (existing.insights || []).map(i => i.title).filter(Boolean);
    const insights = await stepInsights(model, context, existing.profile, existing.diagrams, excludeTitles);

    reqStore.update(requirementId, {
      assist_reference: JSON.stringify({
        ...existing,
        status: 'done',
        insights,
        generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
        generated_at: new Date().toISOString(),
        used: false,
        refreshed: true,
      }),
    });
    return;
  }

  // 完整三步骤
  reqStore.update(requirementId, {
    assist_reference: JSON.stringify({
      status: 'generating', mode: 'brief', target_product: null,
      profile: null, diagrams: [], insights: [],
      generated_at: null, used: false,
    }),
  });

  try {
    const profileResult = await stepProfile(model, productHint + context);
    const profile = profileResult.profile;
    const resolvedProductName = productName || profileResult.productName || (productName ? '' : extractProductFromContext(context));
    const diagrams = await stepDiagrams(model, productHint + context, profile);
    const insights = await stepInsights(model, productHint + context, profile, diagrams);

    reqStore.update(requirementId, {
      assist_reference: JSON.stringify({
        status: 'done', mode: 'brief',
        target_product: resolvedProductName,
        profile,
        diagrams,
        insights,
        picked: [],
        generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
        generated_at: new Date().toISOString(),
        model: model.id,
        error: null,
        used: false,
        refreshed: false,
      }),
    });
  } catch (e) {
    reqStore.update(requirementId, {
      assist_reference: JSON.stringify({
        status: 'failed', mode: 'brief',
        target_product: productName,
        profile: null, diagrams: [], insights: [],
        error: e.message,
        generated_at: new Date().toISOString(),
        used: false,
      }),
    });
  }
}

function getExistingAssist(req) {
  try { return JSON.parse(req.assist_reference || 'null'); } catch { return null; }
}

function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  return getExistingAssist(req);
}

// togglePick 保留旧版兼容，新方案用 refreshInsights 代替 picks
function togglePick(requirementId, idx) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  const assist = getExistingAssist(req);
  if (!assist) return null;
  assist.used = true;
  assist.picked = assist.picked || [];
  const pos = assist.picked.indexOf(idx);
  if (pos >= 0) {
    assist.picked.splice(pos, 1);
  } else {
    assist.picked.push(idx);
  }
  assist.last_pick_at = new Date().toISOString();
  reqStore.update(requirementId, { assist_reference: JSON.stringify(assist) });
  return assist;
}

module.exports = {
  name: '借鉴卡片（产品简报 v2）',
  field: 'assist_reference',
  runAssistJob,
  togglePick,
  getAssist,
};
