// 竞品分析辅助手段（v0.3.6）
// AI 识别竞品并生成对比分析，帮用户明确市场定位
// 字段：requirement.assist_competitive

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

const COMPETITIVE_PROMPT = `你是 ACMS 系统的「竞品分析助手」。给定一个需求/产品概念，进行专业的竞品分析。

## 任务
1. 识别 2-4 个最相关的竞品（包含直接竞品和间接竞品）
2. 对每个竞品做优劣势分析
3. 生成功能/定价对比矩阵
4. 给出「停止做 / 开始做 / 保持做」的行动建议

## 输出格式
输出严格 JSON，不要任何额外文字：
{
  "competitors": [
    {
      "name": "竞品名称",
      "category": "直接竞品/间接竞品/参考竞品",
      "description": "一句话描述（≤20字）",
      "strengths": ["优势1（≤15字）", "优势2", "优势3"],
      "weaknesses": ["劣势1（≤15字）", "劣势2"],
      "key_features": ["特色功能1", "特色功能2", "特色功能3"],
      "target_users": "核心用户群（≤15字）",
      "pricing_model": "定价模式（≤15字）"
    }
  ],
  "comparison_table": [
    {
      "dimension": "比较维度（如定价/核心功能/用户体验）",
      "our_status": "我们的现状",
      "gap": "差距描述（我们的优势或不足）",
      "priority": "高/中/低"
    }
  ],
  "suggestions": {
    "stop_doing": ["停止做的事情1（具体行动）", "停止做的事情2"],
    "start_doing": ["开始做的事情1（具体行动）", "开始做的事情2", "开始做的事情3"],
    "keep_doing": ["保持做的事情1（具体行动）", "保持做的事情2"]
  },
  "market_positioning": "一句话市场定位建议（≤30字）",
  "risk_assumptions": ["假设1（信息缺口说明）", "假设2"]
}

## 约束
- 竞品名称必须是真实存在的产品
- 优劣势每条 ≤15 字，精炼
- 行动建议必须具体可执行，不要"提高用户体验"这种空话
- comparison_table 固定 3-5 行
- 信息缺口要在 risk_assumptions 里明确指出来`;

async function runAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  reqStore.update(requirementId, {
    assist_competitive: JSON.stringify({
      status: 'generating',
      competitors: [],
      comparison_table: [],
      suggestions: null,
      market_positioning: '',
      risk_assumptions: [],
      started_at: new Date().toISOString(),
      generated_at: null,
      error: null,
      model: null,
      used: false,
    }),
  });
  console.log(`[assist:competitive] ${requirementId} 开始生成`);

  try {
    const model = opts.modelId ? modelStore.getById(opts.modelId) : pickDefaultLlm();
    if (!model) throw new Error('NO_LLM_AVAILABLE');

    const messages = [
      { role: 'system', content: COMPETITIVE_PROMPT },
      {
        role: 'user',
        content: [
          `产品名/项目名: ${req.title || '(空)'}`,
          `需求描述: ${req.description || '(空)'}`,
          opts.followupQuestion ? `当前对话焦点: ${opts.followupQuestion}` : '',
          `注意：竞品分析应基于上述产品概念的真实市场空间来识别竞品，不要虚构不存在的产品。`,
        ].filter(Boolean).join('\n'),
      },
    ];

    const parsed = await callLLMWithRetry(model, messages, {
      temperature: 0.5, maxTokens: 2500, jsonMode: true, serviceName: 'assist:competitive',
    });
    if (!Array.isArray(parsed.competitors)) throw new Error('LLM 返回缺少 competitors 字段');

    reqStore.update(requirementId, {
      assist_competitive: JSON.stringify({
        status: 'done',
        competitors: parsed.competitors.slice(0, 4),
        comparison_table: (parsed.comparison_table || []).slice(0, 5),
        suggestions: parsed.suggestions || null,
        market_positioning: parsed.market_positioning || '',
        risk_assumptions: parsed.risk_assumptions || [],
        generated_at: new Date().toISOString(),
        generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
        model: model.id,
        error: null,
        used: false,
      }),
    });
    console.log(`[assist:competitive] ${requirementId} 完成, ${parsed.competitors.length} 个竞品`);
  } catch (e) {
    console.error(`[assist:competitive] ${requirementId} 失败:`, e.message);
    reqStore.update(requirementId, {
      assist_competitive: JSON.stringify({
        status: 'failed',
        competitors: [],
        error: e.message,
        generated_at: new Date().toISOString(),
        used: false,
      }),
    });
  }
}

function markUsed(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  let assist;
  try { assist = JSON.parse(req.assist_competitive || 'null'); } catch { assist = null; }
  if (!assist) return null;
  assist.used = true;
  assist.used_at = new Date().toISOString();
  reqStore.update(requirementId, { assist_competitive: JSON.stringify(assist) });
  return assist;
}

function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try { return JSON.parse(req.assist_competitive || 'null'); } catch { return null; }
}

module.exports = {
  name: '竞品分析（对标竞品，明确市场定位）',
  field: 'assist_competitive',
  runAssistJob,
  markUsed,
  getAssist,
};
