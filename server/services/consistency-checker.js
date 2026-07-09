// ACMS AI 工具层 — 需求文档逐段润色 + 一致性检查（v0.23 L2 拆分）
// 原 ai-tools-service.js L694-783 提取
const { callLLM } = require('./llm-adapter');

const REFINE_SECTION_PROMPT = `你是一个专业的需求文档润色专家。用户会给你一个需求文档中的**特定段落**，以及**修改指示**。

**核心原则（重要！）：保留已有内容，只做必要的增补和调整。**

**要求：**
1. **保留原有内容** — 已有文字、指标、列表、表格原则上不动，只补充缺少的部分
2. **不重写** — 除非修改指示明确要求替换某段文字，否则保持原文不变
3. 保持整体 Markdown 风格一致
4. 除非修改指示要求调整章节标题，否则保留原标题
5. 输出纯 Markdown 文本，不要用 JSON 包裹
6. 直接输出润色后的完整段落内容（包括标题），不要添加额外说明

**好与不好的例子：**
✅ 已有验收标准写了3条，缺1条 → 在末尾追加第4条，前3条不动
❌ 已有验收标准写了3条 → AI 全部推翻重写成5条（禁止）
✅ 已有指标值 "帧率 ≥30fps"，建议改为 ≥60fps → 只改数值，保留结构
❌ 已有指标值 "帧率 ≥30fps"，建议改为 ≥60fps → 把整行重写成不同格式（禁止）
✅ 已有技术约束 "Canvas 2D"，新增功能需要补充 → 在末尾追加新约束，已有不动`;

const CONSISTENCY_CHECK_PROMPT = `你是一个需求文档的一致性审查专家。用户的修改可能影响其他章节。

**你的任务：**
分析用户修改某个段落后，其他章节中是否存在**数值冲突、数据不一致、过期引用**等问题。

**重点检查方向（按优先级）：**
1. **数值一致性** — 如果修改前是"50×30"，修改后是"50×40"，检查其他章节是否还写着"50×30"
2. **内容删除级联** — **如果某段删除了某个概念/主题/功能/关键词，检查其他章节是否还在引用它**
3. **依赖关系** — 功能范围新增了条目，验收标准是否缺对应指标
4. **术语更新** — 修改前和修改后的术语/名称是否在其他章节还有旧称
5. **范围一致性** — 需求概述的概括描述是否还准确

**suggestion 必须具体到可操作的程度：**
- ✅ 正确示例: "删除验收标准中「3.7 主题切换」整条条目，因为需求概述已取消皮肤功能"
- ✅ 正确示例: "将功能范围中「战锤主题美术资源包」改为「通用美术资源包」"
- ✅ 正确示例: "删除成功指标表中「主题切换响应时间≤200ms」这一行"
- ❌ 错误示例: "请更新相关内容"（太模糊，无法操作）
- ❌ 错误示例: "建议删除相关引用"（没说明删什么）

**输出格式（严格 JSON）：**
{
  "affectedSections": [
    {
      "section": "受影响的章节标题",
      "status": "needsUpdate" 或 "ok",
      "reason": "简述为什么需要/不需要修改",
      "suggestions": ["具体、可操作的修改建议"]
    }
  ]
}

**原则：**
1. 只有真正有依赖关系的章节才标记为 needsUpdate
2. **数值必须逐项对比**——如果修改后的数值与另一章的数值不同，必须标记为 needsUpdate
3. 每条 suggestion 必须是可操作的具体修改建议，不是模糊方向
4. 如果修改无影响，所有 status 为 "ok"
5. 返回所有已知章节，不要遗漏`;

async function refineSection(modelId, sectionTitle, sectionContent, fullDoc, instruction) {
  const messages = [
    { role: 'system', content: REFINE_SECTION_PROMPT },
    { role: 'user', content: `## 完整文档（供参考上下文）\n\n${fullDoc}\n\n---\n\n## 需要润色的段落\n\n### 段落标题\n${sectionTitle}\n\n### 当前内容\n${sectionContent}\n\n### 修改指示\n${instruction || '请保持原意，优化表达，使其更清晰专业'}\n\n请输出润色后的完整段落内容（含标题）。` },
  ];
  const result = await callLLM(modelId, messages, { temperature: 0.5, maxTokens: 4000, caller: 'refineSection' });
  return { content: result.content, modelUsed: result.modelUsed };
}

async function checkConsistency(modelId, editedSection, oldContent, newContent, fullDoc) {
  const sectionTitles = [];
  const headingRegex = /^## (.+)$/gm;
  let match;
  while ((match = headingRegex.exec(fullDoc)) !== null) {
    if (match[1] !== editedSection) {
      sectionTitles.push(match[1]);
    }
  }
  const messages = [
    { role: 'system', content: CONSISTENCY_CHECK_PROMPT },
    { role: 'user', content: `## 完整文档\n\n${fullDoc}\n\n---\n\n## 被修改的章节\n标题: ${editedSection}\n\n### 修改前内容\n${oldContent}\n\n### 修改后内容\n${newContent}\n\n## 需要检查的其他章节\n${sectionTitles.map(t => `- ${t}`).join('\n')}\n\n请分析每章是否需要调整。` },
  ];
  const result = await callLLM(modelId, messages, { temperature: 0.3, maxTokens: 4000, jsonMode: true, caller: 'checkConsistency' });
  return { ...result, modelUsed: result.modelUsed };
}

module.exports = { refineSection, checkConsistency };
