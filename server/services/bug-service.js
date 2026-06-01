// 缺陷管理服务 — AI 澄清缺陷 + 自动关联 + 生成 bug task
const reqStore = require('../stores/requirement-store');
const taskStore = require('../stores/task-store');
const modelStore = require('../stores/model-store');
const { callLLM } = require('./llm-adapter');
const { collection } = require('../db/connection');

const BUG_CLARIFY_SYSTEM_PROMPT = `你是一个专业的缺陷分析师（Bug Triage Specialist）。用户报告了一个缺陷，你需要通过选择题澄清缺陷细节，然后给出结构化分析。

**核心原则：**
1. 用选择题降低用户负担——不要问开放式问题
2. **首轮必须一次性列出所有独立问题**——什么现象、怎么触发、期望是什么、影响范围、严重程度。最少 3-4 个问题
3. 根据回答自动分析严重级别和关联信息
4. 如果是用户主动报告的缺陷（非 verify 失败），设置 source: "manual"

**严重级别判断：**
- critical: 核心功能不可用、数据丢失、安全漏洞
- major: 主要功能异常，但有 workaround
- minor: 边缘情况、UI 瑕疵、性能不达标但可用

**🔍 根因分析要求（critical / major 必填）：**
对于 critical 和 major 级别的缺陷，在 analysis 中必须分析 root_cause：
1. **表层原因** — 代码层面的直接错误（如空指针、逻辑短路）
2. **深层原因** — 流程/设计层面的系统性原因（如需求分析漏了入口、验收标准没覆盖边界、任务分解缺了集成任务）
3. **可预防性评估** — 该缺陷是否可以通过改进需求澄清/任务分解/验收标准来预防？具体缺少什么检查？

**回复格式（严格 JSON）：**
{
  "message": "你的分析和友好的回复",
  "choices": [
    { "id": "A", "question": "关于XX", "options": ["选项1","选项2"], "allowCustom": true, "allowMultiple": false }
  ],
  "analysis": {
    "severity": "major",
    "reproduce_steps": "1. 打开页面 → 2. 点击XX → 3. 观察到YY",
    "expected_behavior": "应该显示ZZ",
    "actual_behavior": "实际显示的是YY",
    "possible_cause": "可能是XX模块的状态管理问题",
    "suggested_fix": "检查 XX 函数的状态更新逻辑",
    "root_cause": {
      "surface": "代码层面: XX函数中state未初始化导致空指针",
      "deep": "流程层面: 需求澄清时未定义加载中状态，验收标准只测了正常路径",
      "preventable": "是。如果验收标准包含「空数据态」「加载态」「错误态」三个场景的测试用例，该缺陷可在验收阶段被发现"
    }
  },
  "linked_requirement_title": "需求标题（用于自动关联，可留空）",
  "linked_task_title": "关联任务标题（用于自动关联，可留空）",
  "readyToCreate": false
}

**何时设置 readyToCreate=true：**
- 缺陷的复现步骤已清晰
- 期望行为和实际行为已明确
- 严重级别已确定
- 可以给出修复建议

**重要：不要猜测具体的 requirement ID 或 task ID。** 只需要给出标题关键词，系统会自动匹配。

当前缺陷信息会以 JSON 格式提供。请始终保持 JSON 输出格式。`;

// JSON 修复工具（从 ai-clarify-service 复用）
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

/**
 * AI 澄清缺陷
 */
async function clarifyBug(projectId, bugDescription, modelId, userMessage, conversationHistory) {
  const context = {
    projectId,
    bugDescription,
  };

  const messages = [
    { role: 'system', content: BUG_CLARIFY_SYSTEM_PROMPT },
    { role: 'system', content: `当前缺陷上下文:\n${JSON.stringify(context, null, 2)}` },
    ...(conversationHistory || []).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.role === 'user' ? m.content : (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)),
    })),
  ];

  if (userMessage) {
    messages.push({ role: 'user', content: userMessage });
  } else if (!conversationHistory || conversationHistory.length === 0) {
    messages.push({ role: 'user', content: `请分析以下缺陷报告:\n\n${bugDescription}\n\n请用选择题帮助我澄清细节。` });
  }

  const result = await callLLM(modelId, messages, {
    temperature: 0.7, maxTokens: 4000, jsonMode: true,
    projectId, caller: 'bug-clarify',
  });
  const content = result.content;

  // 提取 JSON
  const extracted = extractJSON(content);
  if (!extracted) {
    console.error('[bug-clarify] 未找到 JSON，原始内容前200字:', content.substring(0, 200));
    return { message: content, choices: [], analysis: null, readyToCreate: false };
  }

  let parsed;
  try { parsed = JSON.parse(extracted); } catch {}
  if (!parsed) {
    try { parsed = JSON.parse(repairJSON(extracted)); } catch (e2) {
      console.error('[bug-clarify] JSON 修复后仍失败:', e2.message);
      return { message: content, choices: [], analysis: null, readyToCreate: false };
    }
  }

  return {
    message: parsed.message || '',
    choices: parsed.choices || [],
    analysis: parsed.analysis || null,
    linkedRequirementTitle: parsed.linked_requirement_title || '',
    linkedTaskTitle: parsed.linked_task_title || '',
    readyToCreate: parsed.readyToCreate || false,
    modelUsed: result.modelUsed,
  };
}

/**
 * 在项目中搜索匹配的需求和任务
 */
function findLinkedEntities(projectId, analysis) {

  let linkedRequirement = null;
  let linkedTask = null;

  // 搜索需求（优先匹配 analysis 中的标题关键词）
  if (analysis && analysis.linked_requirement_title) {
    const keyword = analysis.linked_requirement_title.toLowerCase();
    linkedRequirement = collection('requirements').findOne(r =>
      r.project_id === projectId &&
      (r.title || '').toLowerCase().includes(keyword)
    );
  }
  // 兜底：用 bug description 中的关键词搜索
  if (!linkedRequirement && analysis && analysis.linked_task_title) {
    const keyword = analysis.linked_task_title.toLowerCase();
    linkedTask = collection('tasks').findOne(t =>
      t.project_id === projectId &&
      (t.title || '').toLowerCase().includes(keyword)
    );
    if (linkedTask) {
      linkedRequirement = collection('requirements').findOne(r =>
        r.id === linkedTask.parent_id
      );
    }
  }

  return { linkedRequirement, linkedTask };
}

/**
 * 从澄清结果创建 bug 任务
 */
function createBugTask(projectId, analysis, linkedRequirement, linkedTask, source) {

  // 严重级 → 优先级映射
  const severityToPriority = { critical: 1, major: 2, minor: 4, trivial: 5 };
  const priority = severityToPriority[analysis.severity] || 3;
  const severity = analysis.severity || 'major';

  const description = [
    `## 缺陷报告`,
    ``,
    `**严重级别**: ${severity}`,
    `**来源**: ${source || 'manual'}`,
    ``,
    `### 复现步骤`,
    analysis.reproduce_steps || '待补充',
    ``,
    `### 期望行为`,
    analysis.expected_behavior || '待补充',
    ``,
    `### 实际行为`,
    analysis.actual_behavior || '待补充',
    ``,
    `### 可能原因`,
    analysis.possible_cause || '待分析',
    ``,
    `### 根因分析`,
    analysis.root_cause ? [
      `**表层原因**: ${analysis.root_cause.surface || '未分析'}`,
      `**深层原因**: ${analysis.root_cause.deep || '未分析'}`,
      `**可预防性**: ${analysis.root_cause.preventable || '未分析'}`,
    ].join('\n') : '待分析',
    ``,
    `### 建议修复方案`,
    analysis.suggested_fix || '待补充',
  ].join('\n');

  // source_task_id 只存 ID（如果有关联任务）
  const sourceTaskId = linkedTask ? linkedTask.id : (source === 'verify_failure' ? '' : '');

  const task = taskStore.create({
    projectId,
    parentId: linkedRequirement ? linkedRequirement.id : '',
    title: `🐛 ${analysis.actual_behavior ? analysis.actual_behavior.substring(0, 60) : '缺陷修复'}`,
    description,
    type: 'bug',
    priority,
    estimatedHours: severity === 'critical' ? 4 : (severity === 'major' ? 3 : 2),
    requiredSkills: { coding: 1.0 },
  });

  // 写入 bug 专用字段（JSON store 允许动态字段）
  collection('tasks').update(t => t.id === task.id, {
    bug_severity: severity,
    reproduce_steps: analysis.reproduce_steps || '',
    expected_behavior: analysis.expected_behavior || '',
    actual_behavior: analysis.actual_behavior || '',
    bug_source: source || 'manual',
    source_task_id: linkedTask ? linkedTask.id : (source === 'verify_failure' ? analysis.source_task_id || '' : ''),
    root_cause: analysis.root_cause ? JSON.stringify(analysis.root_cause) : '',
  });

  return task;
}

/**
 * 全流程：澄清 → 关联 → 创建 bug task
 * @param {string} projectId
 * @param {string} bugDescription - 用户的缺陷描述
 * @param {string} modelId - 模型 ID
 * @param {string} userMessage - 用户本轮消息
 * @param {Array} conversationHistory - 对话历史
 * @returns {object} { phase, message, choices, analysis, task, linkedRequirement, linkedTask, readyToCreate }
 */
async function processBugReport(projectId, bugDescription, modelId, userMessage, conversationHistory) {
  // Step 1: AI 澄清
  const clarifyResult = await clarifyBug(projectId, bugDescription, modelId, userMessage, conversationHistory);

  // Step 2: 如果 AI 认为可以创建任务了，自动关联并创建
  if (clarifyResult.readyToCreate && clarifyResult.analysis) {
    const { linkedRequirement, linkedTask } = findLinkedEntities(projectId, {
      linked_requirement_title: clarifyResult.linkedRequirementTitle,
      linked_task_title: clarifyResult.linkedTaskTitle,
    });

    const task = createBugTask(projectId, clarifyResult.analysis, linkedRequirement, linkedTask, 'manual');

    return {
      phase: 'created',
      message: clarifyResult.message,
      choices: clarifyResult.choices,
      analysis: clarifyResult.analysis,
      task,
      linkedRequirement: linkedRequirement || null,
      linkedTask: linkedTask || null,
      readyToCreate: true,
    };
  }

  return {
    phase: 'clarifying',
    message: clarifyResult.message,
    choices: clarifyResult.choices,
    analysis: clarifyResult.analysis,
    linkedRequirement: null,
    linkedTask: null,
    readyToCreate: false,
  };
}

/**
 * 直接创建 bug（跳过澄清，用于 verify 失败等自动场景）
 */
function createBugDirect(projectId, { title, description, severity, source, sourceTaskId, linkedRequirementId }) {

  const severityToPriority = { critical: 1, major: 2, minor: 4, trivial: 5 };
  const priority = severityToPriority[severity] || 3;

  const task = taskStore.create({
    projectId,
    parentId: linkedRequirementId || '',
    title: title || `🐛 缺陷修复`,
    description: description || '',
    type: 'bug',
    priority,
    estimatedHours: severity === 'critical' ? 4 : 2,
    requiredSkills: { coding: 1.0 },
  });

  collection('tasks').update(t => t.id === task.id, {
    bug_severity: severity,
    reproduce_steps: '',
    expected_behavior: '',
    actual_behavior: description || '',
    bug_source: source || 'verify_failure',
    source_task_id: sourceTaskId || '',
  });

  return task;
}

/**
 * 列出缺陷（type='bug' 的 task），增强关联需求/任务标题
 */
function listBugs(projectId, status) {
  let tasks = collection('tasks').find(t => t.project_id === projectId && t.type === 'bug');
  if (status) tasks = tasks.filter(t => t.status === status);

  // 增强：附加关联需求标题和源任务标题
  const enhanced = tasks.map(task => {
    let requirementTitle = '';
    let sourceTaskTitle = '';

    if (task.parent_id) {
      const req = collection('requirements').findOne(r => r.id === task.parent_id);
      if (req) requirementTitle = req.title || '';
    }
    if (task.source_task_id) {
      const srcTask = collection('tasks').findOne(t => t.id === task.source_task_id);
      if (srcTask) sourceTaskTitle = srcTask.title || '';
    }

    return {
      ...task,
      requirementTitle,
      sourceTaskTitle,
    };
  });

  return enhanced;
}

module.exports = { processBugReport, createBugDirect, listBugs, BUG_CLARIFY_SYSTEM_PROMPT };
