// 借鉴卡片辅助手段（v0.3.6）
// LLM 根据用户提及的产品 + 上下文，自主决定输出拆解角度或推荐产品
// 核心原则：多而全，让用户有足够的选择空间
// 字段：requirement.assist_reference

const { callLLMWithRetry } = require('../json-extractor');
const modelStore = require('../../stores/model-store');
const reqStore = require('../../stores/requirement-store');

function pickDefaultLlm() {
  const defaultGen = modelStore.getDefaultGenModel();
  if (defaultGen) return defaultGen;
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
      || all[0]
      || null;
}

const REFERENCE_PROMPT = `你是 ACMS 系统的「借鉴灵感助手」。用户提到了某个产品/系统值得参考，你需要根据该产品和需求上下文，给出**多而全**的可借鉴内容。

## 输入说明
- 需求标题/描述：当前需求的背景
- 对话焦点：用户最新的关注点（包含提到的产品名）
- 用户补充历史：用户说过的所有话（从中提取目标产品名）

## 任务
1. 从用户对话中提取出用户提到的**目标产品名**（如 ModelN、飞书、Notion 等）
2. 判断输出模式：
   - 如果用户明确提到了**一个具体产品**→ 拆解该产品的**功能/流程/特色/理念/架构**等维度，给出 6-10 个具体可借鉴的角度
   - 如果用户只是模糊说"参考类似产品" → 推荐 3-5 个相关产品，每个 2-3 个借鉴点
3. **多而全**：每个角度/产品都要具体可操作

## 拆解模式输出格式
当用户提到具体产品时使用此格式：
{
  "mode": "decompose",
  "target_product": "ModelN",
  "aspects": [
    {
      "name": "角度名称（≤15字）",
      "category": "功能/流程/特色/架构/理念",
      "desc": "具体描述这个角度是什么（≤40字）",
      "why_helpful": "为什么这个角度对当前需求有借鉴意义（≤30字）"
    }
  ]
}
- aspects 6-10 个，覆盖至少 3 个不同 category
- category 只能是：功能、流程、特色、架构、理念

## 推荐模式输出格式
当用户没有指定具体产品时使用此格式：
{
  "mode": "recommend",
  "target_product": null,
  "references": [
    {
      "name": "产品名（≤15字）",
      "category": "直接参考/跨领域参考/经典模式",
      "why": "为什么值得借鉴（≤30字）",
      "inspirations": ["具体借鉴点1（≤20字）", "借鉴点2", "借鉴点3"]
    }
  ]
}
- references 3-5 个
- 每个 product 2-3 个 inspirations

不要任何额外文字、markdown 代码块、解释。`;

// 深钻 prompt：用户点某个角度 → 进一步拆解，输出 aspects（同 level1 格式，支持无限递归）
const DEEP_DIVE_PROMPT = `你是 ACMS 系统的「借鉴深钻助手」。用户正在逐层深入拆解一个参考产品，现在需要你**进一步拆解当前角度**，给出 4-6 个更细的可借鉴方向。

## 输入
- 产品名：要参考的产品
- 角度路径：用户一路点过来的角度链（如 "Pipeline 看板 > 阶段定义"）
- 需求背景：当前需求

## 输出要求
每个方向要**具体可操作**，覆盖多个不同角度类型。

## 输出格式
{
  "mode": "deepdive",
  "target_product": "ModelN",
  "aspects": [
    {
      "name": "方向名称（≤12字）",
      "category": "功能/流程/特色/架构/理念/细节",
      "desc": "具体说明这个方向是什么（≤30字）",
      "why_helpful": "对当前需求的借鉴意义（≤25字）"
    }
  ]
}

- aspects 4-6 个
- category 同上层的分类体系
- 不要任何额外文字、markdown 代码块、解释。`;

async function runAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  reqStore.update(requirementId, {
    assist_reference: JSON.stringify({
      status: 'generating',
      mode: null,
      target_product: null,
      aspects: [],
      references: [],
      picked: [],
      started_at: new Date().toISOString(),
      generated_at: null,
      error: null,
      model: null,
      used: false,
    }),
  });
  console.log(`[assist:reference] ${requirementId} 开始生成`);

  try {
    const model = opts.modelId ? modelStore.getById(opts.modelId) : pickDefaultLlm();
    if (!model) throw new Error('NO_LLM_AVAILABLE');

    // v0.3.6：deepDive 模式（用户点某个角度深入）
    if (opts.deepDiveOf) {
      await runDeepDive(requirementId, model, opts);
      return;
    }

    // 拼 supplement_history 给 LLM 看完整上下文
    let supplementHistory = [];
    try { supplementHistory = JSON.parse(req.supplement_history || '[]'); } catch {}
    const userParts = [
      `需求标题: ${req.title || '(空)'}`,
      `需求描述: ${req.description || '(空)'}`,
      `对话焦点: ${opts.followupQuestion || ''}`,
    ];
    if (Array.isArray(supplementHistory) && supplementHistory.length > 0) {
      userParts.push('---');
      userParts.push('【用户对话历史（最新在前）】:');
      supplementHistory.slice(-6).reverse().forEach((h, i) => {
        if (h.role === 'user' && h.text) {
          userParts.push(`用户说: ${h.text.slice(0, 100)}`);
        }
      });
    }

    const messages = [
      { role: 'system', content: REFERENCE_PROMPT },
      { role: 'user', content: userParts.filter(Boolean).join('\n') },
    ];

    const parsed = await callLLMWithRetry(model, messages, {
      temperature: 0.6, maxTokens: 2500, jsonMode: true, serviceName: 'assist:reference',
    });

    const mode = parsed.mode || 'recommend';
    const result = {
      status: 'done',
      mode,
      target_product: parsed.target_product || null,
      aspects: (parsed.aspects || []).slice(0, 10),
      references: (parsed.references || []).slice(0, 5),
      picked: [],
      generated_at: new Date().toISOString(),
      generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
      model: model.id,
      error: null,
      used: false,
    };

    reqStore.update(requirementId, { assist_reference: JSON.stringify(result) });

    if (mode === 'decompose') {
      console.log(`[assist:reference] ${requirementId} 拆解「${parsed.target_product}」: ${result.aspects.length} 个角度`);
    } else {
      console.log(`[assist:reference] ${requirementId} 推荐: ${result.references.length} 个产品`);
    }
  } catch (e) {
    console.error(`[assist:reference] ${requirementId} 失败:`, e.message);
    reqStore.update(requirementId, {
      assist_reference: JSON.stringify({
        status: 'failed',
        mode: null, target_product: null, aspects: [], references: [],
        error: e.message,
        generated_at: new Date().toISOString(),
        used: false,
      }),
    });
  }
}

/** deepDive：用户点某个角度进一步拆解（无限递归，输出 aspects + 支持选择） */
async function runDeepDive(requirementId, model, opts) {
  const req = reqStore.getById(requirementId);
  if (!req) return;
  const ddo = opts.deepDiveOf;
  const pathLabel = (ddo.path || []).concat([ddo.aspectName]).join(' > ');

  reqStore.update(requirementId, {
    assist_reference: JSON.stringify({
      status: 'generating', mode: 'deepdive', target_product: ddo.product,
      deepdive_path: ddo.path || [], parent_aspect: ddo.aspectName,
      aspects: [], picked: [],
      started_at: new Date().toISOString(), generated_at: null, error: null, model: null, used: false,
    }),
  });
  console.log(`[assist:reference] ${requirementId} deepDive「${pathLabel}」`);

  try {
    const messages = [
      { role: 'system', content: DEEP_DIVE_PROMPT },
      {
        role: 'user',
        content: [
          `产品名: ${ddo.product || ''}`,
          `角度路径: ${pathLabel}`,
          `需求标题: ${req.title || ''}`,
          `需求描述: ${req.description || ''}`,
        ].filter(Boolean).join('\n'),
      },
    ];
    const parsed = await callLLMWithRetry(model, messages, {
      temperature: 0.5, maxTokens: 1800, jsonMode: true, serviceName: 'assist:reference:deepdive',
    });
    const aspects = (parsed.aspects || []).slice(0, 6);
    reqStore.update(requirementId, {
      assist_reference: JSON.stringify({
        status: 'done', mode: 'deepdive',
        target_product: ddo.product,
        deepdive_path: ddo.path || [], parent_aspect: ddo.aspectName,
        aspects, picked: [],
        generated_at: new Date().toISOString(),
        generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
        model: model.id, error: null, used: false,
      }),
    });
    console.log(`[assist:reference] ${requirementId} deepDive 完成: ${aspects.length} 个方面`);
  } catch (e) {
    console.error(`[assist:reference] ${requirementId} deepDive 失败:`, e.message);
    reqStore.update(requirementId, {
      assist_reference: JSON.stringify({
        status: 'failed', mode: 'deepdive',
        target_product: ddo.product,
        deepdive_path: ddo.path || [], parent_aspect: ddo.aspectName,
        aspects: [], error: e.message,
        generated_at: new Date().toISOString(), used: false,
      }),
    });
  }
}

function togglePick(requirementId, idx) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  let assist;
  try { assist = JSON.parse(req.assist_reference || 'null'); } catch { assist = null; }
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

function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try { return JSON.parse(req.assist_reference || 'null'); } catch { return null; }
}

module.exports = {
  name: '借鉴卡片（拆解 → 选角度 / 推荐 → 选产品）',
  field: 'assist_reference',
  runAssistJob,
  togglePick,
  getAssist,
};
