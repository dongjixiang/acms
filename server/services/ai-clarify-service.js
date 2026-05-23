// AI 澄清服务 — 连接大模型进行需求澄清
const modelStore = require('../stores/model-store');
const reqStore = require('../stores/requirement-store');
const { callLLM } = require('./llm-adapter');

const CLARIFY_SYSTEM_PROMPT = `你是一个专业的需求分析师。用户提交了一个需求，你需要通过选择题的方式帮助澄清需求细节。

**核心原则：**
1. 尽量用选择题让用户选择，降低用户负担——不要问开放式问题
2. **所有选择题默认允许多选（allowMultiple: true）**——让用户自由组合答案。如果发现用户选择有矛盾，在下一轮追问确认即可
3. **首轮必须一次性列出所有独立问题**——功能范围、技术选型、性能指标、用户场景、验收标准等，能想到的全部在第一轮发出。不要分批！不要一个一个问题问！
4. 每次回复后，根据讨论结果更新需求规格说明（SRS）
5. 当需求足够清晰时，生成完整的 SRS 并告知用户可以提交审核

**澄清轮次策略：**
- 首轮：列出所有你能想到的问题（至少4-6个），一次性全部发出。不要犹豫，不要保留
- 后续轮次：仅追问矛盾点、首轮遗漏的角度、或依赖性问题
- 当所有关键决策点已确认，即可设置 readyForReview=true

**回复格式（严格JSON）：**
{
  "message": "你的分析和对用户说的话（友好、简洁）",
  "choices": [
    { "id": "A", "question": "关于XX方面", "options": ["选项1", "选项2", "选项3"], "allowCustom": true, "allowMultiple": false }
  ],
  "srs": { ... },
  "readyForReview": false,
  "splitSuggestion": null
}

**需求范围检测与拆分建议（splitSuggestion）：**
- 如果用户需求涉及**多个独立子系统、功能模块、或差异很大的用户角色**（如"做一个电商平台"包含商品管理、订单、支付、用户中心），请在首轮回复中设置 splitSuggestion。
- splitSuggestion 格式：
  {
    "shouldSplit": true,
    "reason": "该需求涉及多个独立模块（商品管理、订单系统、用户中心），建议拆分为子需求分别管理，便于聚焦和并行推进",
    "suggestedChildren": [
      { "title": "商品管理模块", "description": "负责商品的创建、编辑、分类、上下架等功能" },
      { "title": "订单系统", "description": "处理用户下单、订单状态流转、退款等功能" }
    ]
  }
- 判断标准：需求描述中出现了 **3个以上明显不同的功能域**、或同时包含了**前端+后端+运维**等不同层面的工作、或模糊的大概念（"平台""系统""全套"）。
- 如果需求范围适中（单一功能、单一模块），设置 splitSuggestion: null。
- 不要滥用——只对确实过于庞大的需求建议拆分。

**SMART 验收标准规则（重要！）：**
- 每条 acceptanceCriteria 必须包含至少一个可衡量的数字指标（时间/数量/百分比/频率/阈值）
- ❌ 错误: "用户可浏览商品列表"（不可衡量）
- ✅ 正确: "商品列表页首屏加载 ≤ 1.5s，分页翻页 ≤ 500ms，支持 1000+ 商品无卡顿"
- ❌ 错误: "系统稳定运行"（模糊）
- ✅ 正确: "连续运行 7 天无崩溃，CPU 均值 ≤ 30%，内存 ≤ 512MB"
- ❌ 错误: "界面美观"（主观）
- ✅ 正确: "首屏渲染时间 ≤ 2s，Lighthouse Performance ≥ 80 分"
- 如果当前信息不足以写出可衡量的 AC，请在选择题中追问具体指标
- 每个 scopeIn 条目必须有对应的可衡量 AC

**allowMultiple 使用规则：**
- **默认所有问题设置 allowMultiple: true**，让用户自由多选
- 仅当选项明显互斥且同时选择会导致逻辑矛盾时，才设 allowMultiple: false
- 如果用户多选产生了矛盾，在下一轮单独追问澄清即可

**何时设置 readyForReview=true：**
- 所有关键决策点已确认（功能范围、技术方案、验收标准）
- 没有明显的模糊点
- 用户表达了满意或想提交的意思

当前需求信息会以 JSON 格式提供。请始终保持 JSON 输出格式。`;

// ===== JSON 修复工具（LLM 输出常有尾逗号、截断） =====
function repairJSON(text) {
  let fixed = text;
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');
  let inString = false, escape = false;
  for (const ch of fixed) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
  }
  if (inString) fixed += '"';
  const stack = [];
  inString = false; escape = false;
  for (const ch of fixed) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    if (ch === '[') stack.push(']');
    if (ch === '}' || ch === ']') stack.pop();
  }
  if (stack.length > 0) fixed += stack.reverse().join('');
  return fixed;
}

function extractJSON(content) {
  try { JSON.parse(content); return content; } catch {}
  const stripped = content.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();
  const m = stripped.match(/\{[\s\S]*\}/);
  return m ? m[0] : null;
}

async function clarify(reqId, modelId, userMessage, conversationHistory) {
  const requirement = reqStore.getById(reqId);
  if (!requirement) throw Object.assign(new Error('需求不存在'), { status: 404 });

  // Skill 感知: 加载 Skill 提示词
  let skillPrompt = null;
  try {
    const skillStore = require('../stores/skill-store');
    skillPrompt = skillStore.loadPrompt('skill-requirement-clarify');
    if (skillPrompt) console.log(`[clarify] 从 Skill 加载提示词 (${skillPrompt.length} chars)`);
  } catch (e) { /* 静默降级 */ }

  // 构建消息
  const srs = JSON.parse(requirement.srs || '{}');
  const context = {
    title: requirement.title,
    description: requirement.description || '',
    priority: requirement.priority,
    currentSRS: srs,
  };

  const messages = [
    { role: 'system', content: modelStore.getById(modelId)?.systemPrompt || skillPrompt || CLARIFY_SYSTEM_PROMPT },
    { role: 'system', content: `当前需求上下文:\n${JSON.stringify(context, null, 2)}` },
    ...(conversationHistory || []).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.role === 'user' ? m.content : (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)),
    })),
  ];

  if (userMessage) {
    messages.push({ role: 'user', content: userMessage });
  } else if (!conversationHistory || conversationHistory.length === 0) {
    messages.push({ role: 'user', content: '请开始分析这个需求，用选择题帮助我澄清细节。' });
  }

  // 调用 LLM（适配器自动根据 model.api 选择格式）
  const result = await callLLM(modelId, messages, { temperature: 0.7, maxTokens: 4000, jsonMode: true });
  const content = result.content;

  // 提取 JSON — 多层容错
  const extracted = extractJSON(content);
  if (!extracted) {
    console.error('[clarify] 未找到 JSON 对象，原始内容前200字:', content.substring(0, 200));
    return { message: content, choices: [], srs, readyForReview: false, modelUsed: result.modelUsed };
  }

  let parsed;
  try { parsed = JSON.parse(extracted); } catch {}
  if (!parsed) {
    try { parsed = JSON.parse(repairJSON(extracted)); } catch (e2) {
      console.error('[clarify] JSON 修复后仍失败:', e2.message, '内容前200字:', content.substring(0, 200));
      return { message: content, choices: [], srs, readyForReview: false, modelUsed: result.modelUsed };
    }
  }

  // 更新 SRS
  if (parsed.srs && Object.keys(parsed.srs).length > 0) {
    const updatedSrs = { ...srs, ...parsed.srs };
    reqStore.updateSrs(reqId, updatedSrs);
  }

  return {
    message: parsed.message || '',
    choices: parsed.choices || [],
    srs: parsed.srs || srs,
    readyForReview: parsed.readyForReview || false,
    splitSuggestion: parsed.splitSuggestion || null,
    modelUsed: result.modelUsed,
  };
}

module.exports = { clarify, CLARIFY_SYSTEM_PROMPT };
