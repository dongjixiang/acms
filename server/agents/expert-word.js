// Word Expert Agent — 处理 Word 文档类任务
// 由编排型 Agent（小吉）委托调用
const { collection } = require('../db/connection');
const llmAdapter = require('../services/llm-adapter');
const modelStore = require('../stores/model-store');

const SYSTEM_PROMPT = `你是 ACMS 的 Word 文档专家。根据用户指令操作 Word 文档，输出严格 JSON 动作。

【动作 op 类型】
- appendAll：在文档末尾追加新内容。格式 {"op":"appendAll","newText":"完整内容"}
- proposeEdit：替换指定段落。格式 {"op":"proposeEdit","blockIdx":N,"newText":"..."}
- proposeEdits：批量替换。格式 {"op":"proposeEdits","operations":[{"blockIdx":N,"newText":"..."}]}
- formatOps：批量格式调整。格式 {"op":"formatOps","operations":[{"blockIdx":N,"format":{...}}]}
- insertAfter：在某段后插入新段落。格式 {"op":"insertAfter","blockIdx":N,"newText":"..."}
- generateImage：生成插图（有选区时）。格式 {"op":"generateImage","prompt":"画面描述","summary":"说明"}
- insertImageAfterBlock：在指定段后插入图片。格式 {"op":"insertImageAfterBlock","blockIdx":N,"imageDataUrl":"data:...","summary":"说明"}

【语义决策规则】
- "写文章/作文/内容" → appendAll
- "润色/改写/翻译选中文字" → insertAfterSelection（前端已支持）
- "排版/格式调整" → formatOps
- "在第N段后加内容" → insertAfter
- "配图/插图" → appendAll + generateImage × N

输出严格 JSON，不要输出其他文字。`;

async function handle({ instruction, context, modelId, caller, agentId }) {
  console.log(`[word-expert] handle called with instruction:`, instruction?.slice(0, 50));
  try {
    // v0.110: Agent 专属技能注入（绑定/声明的技能拼进 system prompt）
    const skillLoader = require('../services/skill-loader');
    const agentStore = require('../stores/agent-store');
    const _agent = agentId ? agentStore.getById(agentId) : null;
    const _bound = _agent ? (JSON.parse(_agent.bound_skills || '[]')) : [];
    const _skillHint = skillLoader.buildAgentSkillHint(agentId, _bound);
    const _system = _skillHint ? SYSTEM_PROMPT + '\n\n' + _skillHint : SYSTEM_PROMPT;

    // 1. 获取模型
    const model = modelId ? modelStore.getById(modelId) : modelStore.getDefaultGenModel();
    if (!model) return { ok: false, error: '模型未配置' };

  // 2. 组装 docContext
  const docContext = context?.docContext || { blocks: [], selectionText: '' };

  // 3. 调 LLM 生成 action
  const result = await llmAdapter.callLLM(model.id, [
    { role: 'system', content: _system },
    { role: 'user', content: `文档摘要：\n${JSON.stringify(docContext).slice(0, 2000)}\n\n用户指令：${instruction}` }
  ], { maxTokens: 2000, temperature: 0.1 });

  const content = typeof result === 'string' ? result : (result?.content || '');
  console.log(`[word-expert] LLM output:`, content.slice(0, 500));

  // 4. 解析 JSON
  const action = parseAction(content);
  if (!action) return { ok: false, error: `LLM 未返回有效 JSON: ${content.slice(0, 200)}` };

  // 5. 检查是否需要配图
  const textLen = (action.newText || '').length;
  const hasImgKeyword = /配图|插图|插画|生图/.test(instruction);
  // 根据文字长度和关键词智能计算配图数量
  const baseCount = hasImgKeyword ? Math.max(4, Math.floor(textLen / 200)) : 0;
  if (hasImgKeyword && textLen > 100 && action.op === 'appendAll') {
    action.needImages = baseCount;
    console.log(`[word-expert] 检测到配图需求: ${baseCount} 张`);
  }

  return { ok: true, action };
} catch (e) {
  console.error(`[word-expert] error:`, e.message);
  return { ok: false, error: e.message };
}
}

function parseAction(text) {
  try {
    // 找第一个 { 到最后一个 }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    return JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

module.exports = {
  id: 'agent-word-expert',
  name: 'Word专家',
  domain: 'word',
  role: 'worker',
  systemPrompt: SYSTEM_PROMPT,
  handler: handle
};
