// ACMS · 方法论驱动的"整理"功能（v0.13）
//   按 ECSR 模型（Elicitation → Clarification → Structuring → Representation）
//   输入：requirement 对象 + supplement_history + currentDescription + srs
//   输出：结构化 JSON { assumptions, businessCases, userCases, systemCases, summary }
//   存储：req.structured_requirements（中间结果）
//   apply 端点把旧 description + 旧 structured_requirements 进 history，写入新值
//
// v0.13 仅实现 4 个工具中的「Use Case（用例）」—— 适合"零散吐槽/想法"上下文
// v0.14+ 再扩展：事件响应表 / 质量属性场景 / 决策表

// v0.13 B3 fix (5th): 完全照搬多多的实际输出格式
//   - 5 段 (删"待验证假设"段, 多多样例没)
//   - section header 用 `###` markdown 标记 (不是裸文本)
//   - 关键功能点 bullet title 加粗 (`- **xxx**：描述`)
//   - 其他段不加粗
//
// v0.17c 修复：待验证假设段改为条件输出
//   之前硬要求"6 段式严格输出"+ 假设段必须写 → confirmedAssumptions 为空时 LLM 编造默认假设
//   现在：候选假设清单无 ✅ 条目时整段省略不写
const PREVIEW_SYSTEM_PROMPT = `你是 ACMS 系统的「需求结构化助手」。你的工作是把「原始需求 + 用户聊天补充 + 用户勾选的结构化条目」整理成结构化的需求文档，让 PM/技术一眼能看懂并能直接拿去做开发。

## 5-6 段式结构（必须严格遵守，section header 一字不差）

### 一句话需求
**单段陈述**，200-300 字，详细描述：核心定位（谁在什么场景下）+ 主要能力 + 关键边界。**开头「概要」部分加粗**（冒号前的概要短语用双星号包裹，冒号后保持普通文本）。**不写 bullet 列表**。

### 用户场景
按角色列 bullet（销售/客户经理/管理员/...），每条 bullet 1-2 行。**bullet 开头「概要/角色定位」部分加粗**（冒号前的定位短语用双星号包裹，冒号后保持普通文本）。

### 关键功能点
**bullet 列表**（每条 1-3 行），描述功能细节。**bullet 开头「功能名/概要」部分加粗**（冒号前的功能名用双星号包裹，冒号后保持普通文本）。例如：
- **详情页首屏主动推送 AI 洞察**：销售打开客户详情页加载完成的瞬间，系统将续约风险评分、待回访次数等管理员配置的洞察项以首屏卡片呈现。
- **对话召唤轻量临时视图**：用户可用自然语言召唤临时筛选视图/列表/表单/卡片，系统从三类上下文中自动抽取并预填可识别字段。

### 体验/技术倾向
**bullet 列表**（每条 1-2 行），描述产品形态策略、设计原则、技术实现倾向。**bullet 开头「策略/倾向名称」部分加粗**（冒号前的名称用双星号包裹，冒号后保持普通文本）。

### 验收关注点
**bullet 列表**（每条 1-2 行），描述关键验收点。**bullet 开头「验收点名称」部分加粗**（冒号前的名称用双星号包裹，冒号后保持普通文本）。

### 待验证假设（条件段 — 仅在候选假设清单里有 ✅ 已确认条目时才输出）
**bullet 列表**（每条 1 行），从「候选假设清单」里只复述 ✅ 已确认的条目，⛔ 未确认/丢弃的**不要写**进描述。**开头「假设编号」部分用双星号加粗**，风险等级用方括号标记。例如：
- **A-001** [低风险] 固定页面指传统的列表、看板、表单等结构化页面，AI 对话层叠加其上而非替换
- **A-005** [中风险] 高/低风险动作由管理员配置的清单动态定义

## 硬要求
1. **段式输出**——每段之间空一行；假设段**仅在候选假设清单里有 ✅ 已确认条目时**才输出（无 ✅ 时整段省略，**不要写"无/默认/待补充"占位**，不要编造默认假设）
2. **section header 必须是 \`### 一句话需求\` 格式**（用 markdown ### 标记，一字不差）
3. **所有段的 bullet 都用冒号前概要加粗**：每个 bullet 开头定位短语用双星号 **xxx** 包裹，冒号后保持普通文本
4. **假设段**（如果输出）：带编号 **A-NNN** 加粗 + 风险等级 [低/中/高] + 复述原话
5. 不要 markdown 代码块包裹（最外层不要 \`\`\`）
6. 目标长度 1500-3000 字（不被 1500 限制）
7. 段落流畅（像 PM 写的需求文档，不结构化堆叠）
8. 一句话需求用 **单段陈述**（不写 bullet）

## 输出格式（严格 JSON）
{
  "description": "完整 5-6 段式需求文档（按上述结构；假设段视候选假设清单里的 ✅ 数量而定）"
}

不要任何额外文字、markdown 代码块、解释。`;

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

// ECSR + 5 要素 + 假设清单 + 三层次过滤 完整 prompt
const USE_CASE_PROMPT = `你是 ACMS 系统的「方法论整理助手」。你的工作是把零散的上下文（用户聊天补充 + 当前需求描述）按专业需求分析方法论整理成**结构化的需求条目**。

## 方法论：ECSR 模型（按顺序）

### E（Elicitation 抽丝剥茧）
不要只看表面需求，要挖掘"上下文"背后的痛点和目标。从 supplement_history 里找出所有"动作 / 愿望 / 痛点 / 想法"。

### C（Clarification 消除歧义）
将模糊的上下文转化为可验证的陈述。识别所有"潜规则"——上下文里没明说但你脑补的假设，**单独列出**。

### S（Structuring 结构化拆解）
按"三层次过滤"分类：
- 业务层：为什么要做？（商业价值 / 目的）
- 用户层：谁会用？怎么用？（按角色拆分：admin / user / 等）
- 系统层：依赖什么数据？前后台逻辑？性能/安全/接口？

每条需求条目必须包含**5 要素**：
- ID：唯一编号（UC-001 / UCA-001 / SYS-001 / A-001，A 表示假设）
- 描述：必须采用"系统应..."或"用户能够..."的句式（**禁止模糊词如"大概/差不多/灵活"**）
- AC（验收条件）：用 Given/When/Then 格式：
  - Given：给定什么上下文/前提
  - When：当执行什么动作
  - Then：那么系统应该给出什么结果
  - **禁止"系统应正确处理"这种废话 AC**
- 优先级：MoSCoW 法则四选一（Must-Have / Should-Have / Could-Have / Won't-Have），缩写为 must/should/could/wont
- 依赖项：这条需求依赖哪些其他条目（用 ID 数组，没有则空数组 []）

### R（Representation 可视化呈现）
输出严格 JSON，**不写 markdown 代码块**，不写解释。

## 输入
- 需求标题
- 当前需求描述
- 用户历次补充（按时间顺序，AI 提问 + 用户回答）
- SRS（结构化需求规格）

## 输出格式（严格 JSON）

{
  "assumptions": [
    { "id": "A-001", "text": "假设用户已登录", "risk": "low" },
    { "id": "A-002", "text": "'评论'指文字评论（非语音/视频）", "risk": "medium" }
  ],
  "businessCases": [
    {
      "id": "UC-001",
      "desc": "用户能够发布文字评论",
      "ac": {
        "given": "用户已登录且在内容详情页",
        "when": "点击'评论'按钮并输入文字后点击'发送'",
        "then": "评论出现在内容下方评论区"
      },
      "priority": "must",
      "deps": []
    }
  ],
  "userCases": {
    "admin": [...],
    "user": [...]
  },
  "systemCases": [
    {
      "id": "SYS-001",
      "desc": "评论数据存储到数据库",
      "ac": { "given": "...", "when": "...", "then": "..." },
      "priority": "must",
      "deps": ["UC-001"]
    }
  ],
  "summary": "基于 8 条补充整理出 5 条用例（3 业务 + 2 系统）"
}

## 硬约束

1. **必须输出至少 1 条假设**——如果识别不到假设，说明你没挖够
2. **业务层用例至少 1 条**——业务用例为零说明没理解需求
3. **AC 必须严格 Given/When/Then**——禁止"系统应..."开头的 AC
4. **优先级必须 4 分类之一**——must/should/could/wont
5. **三层次分类边界**：业务=商业价值/目的；用户=角色+动作；系统=数据/接口/性能
6. **ID 编号规则**：假设=A-NNN；业务用例=UC-NNN；用户用例=UCA-NNN（admin）/UCU-NNN（user）等；系统用例=SYS-NNN
7. **deps 数组**：依赖其他条目 ID，没有则 []
8. **summary**：1-2 句，说明整理依据（基于几条补充 / 覆盖几个角色）

不要任何额外文字、markdown、解释。**只输出 JSON。**`;

/**
 * 字段补全 + schema 校验：LLM 输出可能缺字段，统一兜底
 */
function normalizeStructuredData(raw) {
  const out = {
    assumptions: [],
    businessCases: [],
    userCases: { admin: [], user: [] },
    systemCases: [],
    summary: '',
  };

  if (!raw || typeof raw !== 'object') return out;

  // assumptions
  if (Array.isArray(raw.assumptions)) {
    out.assumptions = raw.assumptions.map((a, i) => ({
      id: a.id || `A-${String(i + 1).padStart(3, '0')}`,
      text: a.text || '',
      risk: ['low', 'medium', 'high'].includes(a.risk) ? a.risk : 'medium',
    })).filter(a => a.text);
  }

  // businessCases
  if (Array.isArray(raw.businessCases)) {
    out.businessCases = raw.businessCases.map((c, i) => normalizeCase(c, `UC-${String(i + 1).padStart(3, '0')}`, 'business'));
  }

  // userCases
  if (raw.userCases && typeof raw.userCases === 'object') {
    for (const role of Object.keys(raw.userCases)) {
      if (!Array.isArray(raw.userCases[role])) continue;
      const rolePrefix = role === 'admin' ? 'UCA' : role === 'user' ? 'UCU' : `UC${role.slice(0, 2).toUpperCase()}`;
      out.userCases[role] = raw.userCases[role].map((c, i) => normalizeCase(c, `${rolePrefix}-${String(i + 1).padStart(3, '0')}`, 'user'));
    }
    if (Array.isArray(raw.userCases.user)) out.userCases.user = raw.userCases.user.map((c, i) => normalizeCase(c, `UCU-${String(i + 1).padStart(3, '0')}`, 'user'));
    if (Array.isArray(raw.userCases.admin)) out.userCases.admin = raw.userCases.admin.map((c, i) => normalizeCase(c, `UCA-${String(i + 1).padStart(3, '0')}`, 'user'));
  }

  // systemCases
  if (Array.isArray(raw.systemCases)) {
    out.systemCases = raw.systemCases.map((c, i) => normalizeCase(c, `SYS-${String(i + 1).padStart(3, '0')}`, 'system'));
  }

  // summary
  if (typeof raw.summary === 'string') out.summary = raw.summary.slice(0, 200);

  return out;
}

function normalizeCase(c, defaultId, layer) {
  return {
    id: c.id || defaultId,
    desc: c.desc || '',
    ac: {
      given: (c.ac && typeof c.ac.given === 'string') ? c.ac.given.slice(0, 150) : '',
      when: (c.ac && typeof c.ac.when === 'string') ? c.ac.when.slice(0, 150) : '',
      then: (c.ac && typeof c.ac.then === 'string') ? c.ac.then.slice(0, 150) : '',
    },
    priority: ['must', 'should', 'could', 'wont'].includes(c.priority) ? c.priority : 'should',
    deps: Array.isArray(c.deps) ? c.deps.filter(d => typeof d === 'string').slice(0, 10) : [],
    layer,  // 内部标记 layer（不存到 req，但 apply 路由会用到）
  };
}

/**
 * 后处理：Must 数量过多自动降级
 *   如果 must > 5 条，保留前 5 条 must，其余 must 降级为 should
 *   这避免 LLM "全部标 must" 的常见偷懒
 */
function downgradeMustIfTooMany(data) {
  const allMust = [
    ...data.businessCases.filter(c => c.priority === 'must'),
    ...Object.values(data.userCases).flat().filter(c => c.priority === 'must'),
    ...data.systemCases.filter(c => c.priority === 'must'),
  ];
  if (allMust.length <= 5) return data;

  const downgrade = (arr) => arr.map(c => {
    if (c.priority !== 'must') return c;
    // 保留最早 5 条 must；其余降级为 should
    const mustIndex = allMust.findIndex(m => m.id === c.id);
    if (mustIndex >= 5) return { ...c, priority: 'should' };
    return c;
  });

  return {
    ...data,
    businessCases: downgrade(data.businessCases),
    userCases: Object.fromEntries(Object.entries(data.userCases).map(([k, v]) => [k, downgrade(v)])),
    systemCases: downgrade(data.systemCases),
  };
}

/**
 * 异步：生成结构化整理结果 → 写回 req.structured_requirements
 */
async function runUseCaseAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  // 标记 generating
  //   v0.13 fix: 同步写入 generated_at_round（保持与 done 状态契约一致，前端 afterRender 能 round 匹配）
  reqStore.update(requirementId, {
    structured_requirements: JSON.stringify({
      status: 'generating',
      tool: 'use_case',
      assumptions: [],
      businessCases: [],
      userCases: {},
      systemCases: [],
      summary: '',
      started_at: new Date().toISOString(),
      generated_at: null,
      generated_at_round: opts.chatRound || 1,
      error: null,
      model: null,
    }),
  });
  console.log(`[assist:use_case] ${requirementId} 开始按 ECSR 整理`);

  try {
    const model = opts.modelId ? modelStore.getById(opts.modelId) : pickDefaultLlm();
    if (!model) throw new Error('NO_LLM_AVAILABLE');

    // 读 supplement_history（v0.3.5 修复：让 LLM 看到用户的历次补充）
    let supplementHistory = [];
    try {
      supplementHistory = JSON.parse(req.supplement_history || '[]');
      if (!Array.isArray(supplementHistory)) supplementHistory = [];
    } catch { supplementHistory = []; }

    // 拼 user message
    const userParts = [
      `需求标题: ${req.title || '(空)'}`,
      `当前需求描述: ${req.description || '(空)'}`,
    ];

    if (supplementHistory.length > 0) {
      userParts.push('---');
      userParts.push('【需求对话历史】（按时间顺序，包含 AI 提问和用户回答）:');
      supplementHistory.forEach((h, i) => {
        const sourceTag = h.source ? ` [${h.source}]` : '';
        const atTag = h.at ? ` @${h.at.substring(11, 16)}` : '';
        if (h.role === 'assistant') {
          const aiText = h.opening ? `AI: ${h.opening}` : '';
          const followup = h.followup_question ? ` 追问: ${h.followup_question}` : '';
          if (aiText || followup) userParts.push(`#${i + 1}${sourceTag}${atTag} ${aiText}${followup}`.trim());
        } else {
          const userText = h.text ? `用户: ${h.text}` : '';
          if (userText) userParts.push(`#${i + 1}${sourceTag}${atTag} ${userText}`.trim());
        }
      });
    }

    let srs = null;
    try { srs = JSON.parse(req.srs || 'null'); } catch { srs = null; }
    if (srs && typeof srs === 'object') {
      userParts.push('---');
      userParts.push('【SRS】:');
      userParts.push(JSON.stringify(srs, null, 2));
    }

    const messages = [
      { role: 'system', content: USE_CASE_PROMPT },
      { role: 'user', content: userParts.join('\n') },
    ];

    // 调 LLM（jsonMode + retry）
    const raw = await callLLMWithRetry(model, messages, {
      temperature: 0.4,
      maxTokens: 20000,
      jsonMode: true,
      serviceName: 'assist:use_case',
    });

    // 规范化 + Must 降级
    let normalized = normalizeStructuredData(raw);
    normalized = downgradeMustIfTooMany(normalized);

    // 写回 req.structured_requirements
    //   v0.13 fix: 写入 generated_at_round（与 decision_tree 等其他 assist 对齐契约）
    //     触发端点 L760 已传 chatRound，但 runUseCaseAssistJob 之前直接丢了
    //     → 前端 renderAssistLayer L3593 `if (d.generated_at_round !== cr) continue` 永远跳过
    //     → loading 卡片没人替换，前端永远显示"加载中"（GET 轮询却能看到 done）
    reqStore.update(requirementId, {
      structured_requirements: JSON.stringify({
        status: 'done',
        tool: 'use_case',
        ...normalized,
        generated_at: new Date().toISOString(),
        generated_at_round: opts.chatRound || 1,  // 兜底 1（路由 /assist/run 没传时）
        model: model.id,
        error: null,
      }),
    });

    // v0.13 调试：写入后立即 re-read 验证（排查前端轮询 36s 才看到 done 的问题）
    try {
      const verify = reqStore.getById(requirementId);
      const verifyData = verify ? JSON.parse(verify.structured_requirements || 'null') : null;
      const verifyStatus = verifyData?.status || 'MISSING';
      const verifyLen = verify?.structured_requirements?.length || 0;
      console.log(`[assist:use_case] ${requirementId} 写入后立即验证 status=${verifyStatus} len=${verifyLen}B`);
      if (verifyStatus !== 'done') {
        console.error(`[assist:use_case] ${requirementId} ⚠️ 写入后立即 re-read 不是 done！可能 SQLite 写入失败或缓存问题`);
        console.error(`[assist:use_case] ${requirementId} structured_requirements 字段实际值:`, verify?.structured_requirements?.slice(0, 200));
      }
    } catch (e) {
      console.error(`[assist:use_case] ${requirementId} 验证 re-read 失败:`, e.message);
    }

    console.log(`[assist:use_case] ${requirementId} 整理完成（assumptions=${normalized.assumptions.length}, business=${normalized.businessCases.length}, system=${normalized.systemCases.length}）`);
  } catch (e) {
    console.error(`[assist:use_case] ${requirementId} 整理失败:`, e.message);
    reqStore.update(requirementId, {
      structured_requirements: JSON.stringify({
        status: 'failed',
        tool: 'use_case',
        error: e.message || '未知错误',
        generated_at: new Date().toISOString(),
      }),
    });
  }
}

/**
 * 应用整理结果：旧 description + 旧 structured_requirements 进 history，写入新值
 * @param {string} requirementId
 * @param {object} payload
 *   - acceptedItems: [{ id, layer: 'business'|'user'|'system', role?, desc, ac, priority, deps }]
 *   - confirmedAssumptions: [{ id, text, risk }]
 *   - structuredData: 完整结构化数据（持久化）
 *   - description: 可选 — B1 新流程由 preview 端点生成后传入；旧调用不传（走 buildDescriptionFromAccepted）
 */
function applyUseCaseResult(requirementId, payload) {
  const req = reqStore.getById(requirementId);
  if (!req) return { error: 'REQ_NOT_FOUND' };

  const { acceptedItems = [], confirmedAssumptions = [], structuredData = null, description: providedDescription = null } = payload || {};

  // 1. 旧 description 进 history
  let descHistory = [];
  try { descHistory = JSON.parse(req.description_history || '[]'); } catch { descHistory = []; }
  if (req.description) {
    descHistory.push({ description: req.description, saved_at: new Date().toISOString(), source: 'use_case_apply' });
    descHistory = descHistory.slice(-5);  // 保留最近 5 份
  }

  // 2. 旧 structured_requirements 进 history
  let structHistory = [];
  try { structHistory = JSON.parse(req.structured_requirements_history || '[]'); } catch { structHistory = []; }
  try {
    const oldStruct = JSON.parse(req.structured_requirements || 'null');
    if (oldStruct && oldStruct.status === 'done') {
      structHistory.push({ structured_requirements: oldStruct, saved_at: new Date().toISOString(), source: 'use_case_apply' });
      structHistory = structHistory.slice(-5);  // 保留最近 5 份
    }
  } catch { /* 静默 */ }

  // 3. 生成新 description：B1 新流程传 description（preview 阶段 LLM 生成 + 用户编辑过）
  //    旧调用不传 → 走 buildDescriptionFromAccepted 拼 4 段式 bullet（兼容兜底）
  const newDescription = providedDescription || buildDescriptionFromAccepted(acceptedItems, confirmedAssumptions);

  // 4. 更新 req
  reqStore.update(requirementId, {
    description: newDescription,
    description_history: JSON.stringify(descHistory),
    structured_requirements: structuredData ? JSON.stringify({
      ...structuredData,
      status: 'applied',
      applied_at: new Date().toISOString(),
      accepted_count: acceptedItems.length,
      confirmed_assumption_count: confirmedAssumptions.length,
    }) : req.structured_requirements,
    structured_requirements_history: JSON.stringify(structHistory),
  });

  return {
    ok: true,
    newDescription,
    applied: acceptedItems.length,
    discarded: (payload.discardedItems || []).length,
    confirmedAssumptions: confirmedAssumptions.length,
  };
}

/**
 * v0.13 B1: 生成 5 段式 description 预览（不写库）
 *   调 LLM (PREVIEW_SYSTEM_PROMPT) 把 [原始需求 + 聊天上下文 + 勾选项] 整合成 5 段式文本
 *   返回给前端做 inline 编辑, 用户编辑后调 confirm 端点写库
 * @param {string} requirementId
 * @param {object} payload
 *   - acceptedItems: [{ id, layer, role?, desc, ac, priority, deps }]
 *   - confirmedAssumptions: [{ id, text, risk }]
 *   - discardedItems: [{ id, ... }]
 * @returns {Promise<{description, modelId} | {error}>}
 */
async function previewUseCaseResult(requirementId, payload) {
  const req = reqStore.getById(requirementId);
  if (!req) return { error: 'REQ_NOT_FOUND' };

  const { acceptedItems = [], confirmedAssumptions = [], discardedItems = [] } = payload || {};

  // 读 supplement_history (cap 最近 15 条, 避免长对话 token 爆炸)
  let supplementHistory = [];
  try { supplementHistory = JSON.parse(req.supplement_history || '[]'); } catch { supplementHistory = []; }
  if (!Array.isArray(supplementHistory)) supplementHistory = [];
  if (supplementHistory.length > 15) supplementHistory = supplementHistory.slice(-15);

  // 拼 userParts = 原始需求 + 聊天上下文 + 勾选项
  const userParts = [
    `需求标题: ${req.title || '(空)'}`,
    `当前需求描述: ${req.description || '(空)'}`,
  ];

  if (supplementHistory.length > 0) {
    userParts.push('---');
    userParts.push('【需求对话历史】（按时间顺序，包含 AI 提问和用户回答）:');
    supplementHistory.forEach((h, i) => {
      const sourceTag = h.source ? ` [${h.source}]` : '';
      const atTag = h.at ? ` @${h.at.substring(11, 16)}` : '';
      if (h.role === 'assistant') {
        const aiText = h.opening ? `AI: ${h.opening}` : '';
        const followup = h.followup_question ? ` 追问: ${h.followup_question}` : '';
        if (aiText || followup) userParts.push(`#${i + 1}${sourceTag}${atTag} ${aiText}${followup}`.trim());
      } else {
        const userText = h.text ? `用户: ${h.text}` : '';
        if (userText) userParts.push(`#${i + 1}${sourceTag}${atTag} ${userText}`.trim());
      }
    });
  }

  userParts.push('---');
  userParts.push('【用户勾选的结构化条目】:');
  if (acceptedItems.length > 0) {
    userParts.push('采纳项:');
    acceptedItems.forEach(it => {
      userParts.push(`- ${it.id} [${it.priority || 'should'}] layer=${it.layer}${it.role ? '/role=' + it.role : ''}: ${it.desc}`);
      if (it.ac) {
        const acStr = `  AC: Given "${it.ac.given || ''}", When "${it.ac.when || ''}", Then "${it.ac.then || ''}"`;
        userParts.push(acStr);
      }
      if (it.deps && it.deps.length > 0) {
        userParts.push(`  依赖: ${it.deps.join(', ')}`);
      }
    });
  }
  if (confirmedAssumptions.length > 0) {
    userParts.push('已确认假设:');
    confirmedAssumptions.forEach(a => {
      userParts.push(`- ${a.id} [${a.risk || 'low'}] ${a.text || ''}`);
    });
  }

  // v0.17c：把 req.structured_requirements.assumptions 全量传给 LLM（带 ✅/⛔ 状态）
  //   之前只传 confirmedAssumptions → 0 已确认时 LLM 完全不知道存在哪些假设
  //   → 被 prompt 强约束"必须写假设段" → 只能编造"默认假设"占位
  //   现在即使 0 确认也告诉 LLM 全部候选，让 LLM 据此决定是否省略 section
  let allCandidates = [];
  try {
    const structReq = JSON.parse(req.structured_requirements || 'null');
    if (structReq && Array.isArray(structReq.assumptions)) allCandidates = structReq.assumptions;
  } catch { /* 静默 */ }
  if (allCandidates.length > 0) {
    const confirmedIds = new Set(confirmedAssumptions.map(a => a.id));
    const confirmedCount = allCandidates.filter(a => confirmedIds.has(a.id)).length;
    userParts.push('---');
    userParts.push(`【候选假设清单】（共 ${allCandidates.length} 条；✅=${confirmedCount} 已确认 · ⛔=${allCandidates.length - confirmedCount} 未确认/丢弃；⚠️ 描述里只写 ✅ 的，⛔ 不要写）:`);
    allCandidates.forEach(a => {
      const isConfirmed = confirmedIds.has(a.id);
      const status = isConfirmed ? '✅' : '⛔';
      userParts.push(`- ${status} ${a.id} [${a.risk || 'low'}] ${a.text || ''}`);
    });
  }

  if (discardedItems.length > 0) {
    userParts.push(`丢弃项: ${discardedItems.length} 条（不进入描述）`);
  }

  // 调 LLM
  const model = pickDefaultLlm();
  if (!model) return { error: 'NO_LLM_AVAILABLE' };

  const messages = [
    { role: 'system', content: PREVIEW_SYSTEM_PROMPT },
    { role: 'user', content: userParts.join('\n') },
  ];

  try {
    const parsed = await callLLMWithRetry(model, messages, {
      temperature: 0.3,
      maxTokens: 20000,
      jsonMode: true,
      serviceName: 'use_case_preview',
    });
    if (!parsed) return { error: 'LLM_PARSE_FAILED' };
    if (!parsed.description || typeof parsed.description !== 'string') return { error: 'LLM_MISSING_DESCRIPTION' };
    console.log(`[use_case_preview] ${requirementId} 5 段式预览生成 (${parsed.description.length}字, model=${model.id})`);
    return { description: parsed.description, modelId: model.id };
  } catch (e) {
    console.error(`[use_case_preview] ${requirementId} 失败:`, e.message);
    return { error: 'LLM_CALL_FAILED', message: e.message };
  }
}

/**
 * 从 acceptedItems 合并生成 description（不含假设清单——按方法论假设单独列出）
 * 格式：
 *   【业务层】
 *   - UC-001 [必做] 用户能够发布文字评论
 *   【用户层 · 管理员】
 *   - UCA-001 ...
 *   【系统层】
 *   - SYS-001 ...
 */
function buildDescriptionFromAccepted(acceptedItems, confirmedAssumptions) {
  const byLayer = { business: [], user: {}, system: [] };
  for (const item of acceptedItems) {
    if (item.layer === 'business') {
      byLayer.business.push(item);
    } else if (item.layer === 'user') {
      const role = item.role || 'user';
      if (!byLayer.user[role]) byLayer.user[role] = [];
      byLayer.user[role].push(item);
    } else if (item.layer === 'system') {
      byLayer.system.push(item);
    }
  }

  const PRIORITY_LABEL = { must: '必做', should: '应做', could: '能做', wont: '不做' };
  const RISK_LABEL = { low: '低风险', medium: '中风险', high: '高风险' };
  const sections = [];

  if (byLayer.business.length > 0) {
    sections.push('【业务层用例】');
    byLayer.business.forEach(c => {
      sections.push(`- ${c.id} [${PRIORITY_LABEL[c.priority] || c.priority}] ${c.desc}`);
    });
  }
  for (const role of Object.keys(byLayer.user)) {
    sections.push(`【用户层用例 · ${role}】`);
    byLayer.user[role].forEach(c => {
      sections.push(`- ${c.id} [${PRIORITY_LABEL[c.priority] || c.priority}] ${c.desc}`);
    });
  }
  if (byLayer.system.length > 0) {
    sections.push('【系统层用例】');
    byLayer.system.forEach(c => {
      sections.push(`- ${c.id} [${PRIORITY_LABEL[c.priority] || c.priority}] ${c.desc}`);
    });
  }

  // v0.17c：confirmed assumptions 也加入（之前完全忽略 → 用户看不到假设信息）
  if (Array.isArray(confirmedAssumptions) && confirmedAssumptions.length > 0) {
    sections.push('【待验证假设】');
    confirmedAssumptions.forEach(a => {
      sections.push(`- ${a.id} [${RISK_LABEL[a.risk] || a.risk || '低风险'}] ${a.text || ''}`);
    });
  }

  return sections.length > 0 ? sections.join('\n') : '';
}

// 适配 assists/index.js registry 接口（name + field + runAssistJob + getAssist）
const name = '方法论整理（Use Case）';
const field = 'structured_requirements';  // 写回到 req 的这个字段（不是默认的 assist_use_case）

// 标准 runAssistJob（registry 要求）
async function runAssistJob(requirementId, opts = {}) {
  return runUseCaseAssistJob(requirementId, opts);
}

// 标准 getAssist（registry 要求：返回该 method 在 req 上的数据）
function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try {
    const data = JSON.parse(req.structured_requirements || 'null');
    return data;
  } catch {
    return null;
  }
}

module.exports = {
  name,
  field,
  runAssistJob,
  getAssist,
  runUseCaseAssistJob,    // 保留原函数名（apply 端点用）
  applyUseCaseResult,      // apply 端点用 (B1: 接收可选 description 参数, 兼容旧调用)
  previewUseCaseResult,    // v0.13 B1: 5 段式 preview (不写库, 调 LLM)
  normalizeStructuredData, // 暴露供测试
  downgradeMustIfTooMany,  // 暴露供测试
  PREVIEW_SYSTEM_PROMPT,   // 暴露供测试
};