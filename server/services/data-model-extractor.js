// 数据模型/用户流程提取器
// 从需求的 SRS + 澄清对话中，提取结构化数据实体、字段、关系和用户流程
// 用于在需求审核阶段让用户提前发现数据组织和流程的偏差
const reqStore = require('../stores/requirement-store');
const { callLLM } = require('./llm-adapter');
const modelStore = require('../stores/model-store');

/**
 * 为一条需求提取数据模型 + 用户流程预览
 * @param {string} reqId
 * @returns {object} { entities, flows, pages, raw }
 */
async function extractModel(reqId) {
  const req = reqStore.getById(reqId);
  if (!req) return { error: '需求不存在' };

  const srs = safeParse(req.srs);
  const clarifications = reqStore.getClarifications(reqId);
  const archSpec = safeParse(req.arch_spec);

  const allModels = modelStore.list();
  // 优先使用 OpenAI 协议（更快），兜底任何可用模型
  const model = allModels.find(m => m.status === 'active' && m.api !== 'anthropic-messages')
    || allModels.find(m => m.status === 'active')
    || allModels[0];
  if (!model) return { error: '无可用模型' };

  const clariText = (clarifications || []).map(c => `[${c.role}] ${c.content}`).join('\n');

  const prompt = `你是一位产品架构师。请根据以下需求的完整信息，提取出该系统的数据模型和用户流程。

要求输出严格的 JSON（不要 markdown 代码块包裹），按以下结构：

{
  "entities": [
    {
      "name": "实体名称（如：用户、订单、视频）",
      "fields": [
        { "name": "字段名", "type": "string|number|boolean|date|array|object", "description": "字段含义" }
      ],
      "relations": [
        { "target": "关联实体名", "type": "one-to-many|many-to-many|belongs-to", "description": "关联说明" }
      ]
    }
  ],
  "flows": [
    {
      "name": "流程名称（如：创建预约）",
      "steps": ["步骤1描述", "步骤2描述", "..."],
      "pages": ["涉及的页面/视图名称"]
    }
  ],
  "pages": [
    {
      "name": "页面/视图名称",
      "purpose": "该页面的核心目的",
      "dataDisplay": "页面上展示哪些数据（引用上面的实体和字段）",
      "actions": ["用户可执行的操作"]
    }
  ]
}

注意：
- 如果需求中的描述存在模糊或矛盾，用 "?" 标注
- 尽量覆盖完整，宁可多列也不要遗漏
- 数据字段尽量细化，不要只写 "其他字段"

需求信息：
标题: ${req.title}
状态: ${req.status}

SRS 文档：
${JSON.stringify(srs, null, 2).slice(0, 4000)}

架构宪法：
${JSON.stringify(archSpec, null, 2).slice(0, 2000)}

澄清对话：
${clariText.slice(0, 3000)}`;

  try {
    const result = await callLLM(model.id, [
      { role: 'user', content: prompt }
    ], { temperature: 0.3, maxTokens: 5000, jsonMode: true });
    const content = result.content || '';
    let parsed = extractJSON(content);
    return parsed || { error: 'LLM 返回格式异常', raw: content.slice(0, 500) };
  } catch (e) {
    // 超时重试：去掉 jsonMode，纯靠 prompt 约束
    if (e.timeout) {
      console.log(`[data-model-extractor] 超时，降级为无 jsonMode 重试: ${e.message}`);
      try {
        const retryPrompt = prompt + '\n\n【再次提醒】请输出严格的 JSON，不要用 markdown 代码块包裹。';
        const retryResult = await callLLM(model.id, [
          { role: 'user', content: retryPrompt }
        ], { temperature: 0.3, maxTokens: 5000, jsonMode: false });
        const retryContent = retryResult.content || '';
        let parsed = extractJSON(retryContent);
        return parsed || { error: 'LLM 返回格式异常', raw: retryContent.slice(0, 500), retried: true };
      } catch (e2) {
        return { error: e2.message, retried: true };
      }
    }
    return { error: e.message };
  }
}

function extractJSON(text) {
  if (!text) return null;
  let clean = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();
  const first = clean.indexOf('{');
  const last = clean.lastIndexOf('}');
  if (first !== -1 && last > first) clean = clean.slice(first, last + 1);
  try { return JSON.parse(clean); } catch { return null; }
}

function safeParse(str) {
  if (!str) return {};
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return {}; }
}

module.exports = { extractModel };
