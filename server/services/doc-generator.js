// ACMS AI 工具层 — 生成 MD 需求文档（v0.23 L2 拆分）
// 原 ai-tools-service.js L73-114 提取
const modelStore = require('../stores/model-store');
const reqStore = require('../stores/requirement-store');
const { callLLM } = require('./llm-adapter');
const { safeArr } = require('./ai-tools-utils');

const DOC_SYSTEM_PROMPT = `你是一个专业的需求文档撰写专家。请根据以下需求信息，生成一份结构清晰、用户友好的 Markdown 格式需求文档。

**要求：**

1. 使用中文撰写，语言简洁专业

2. **章节结构（按顺序，不可省略任何章节）：**
   - 需求概述（必须能用一句话说清核心价值，如果说不清 → 需要拆分成多个需求）
   - 版本信息（文档版本号、创建日期、作者、变更记录）
   - 功能范围（按优先级 P0/P1/P2 分级，并明确标注不包含功能）
   - 共享接口（标记哪些数据模型/API 会被多个模块依赖）
   - 验收标准（合并指标+目标值+测量方式+验收命令，一行搞定）
   - 技术约束（做决策，不说"或"）
   - Mermaid 图表（放在相关章节内，不要堆在"补充说明"）
   - 补充说明（仅限边界情况、风险、假设——不要放图表或接口定义）

3. **功能范围按优先级分级：**
   - P0 (必须): MVP 不可或缺的功能
   - P1 (应该): 重要但可首版延后
   - P2 (可以): 锦上添花，资源允许时做

4. **共享接口必须包含：** 接口名称、关键字段、被哪些模块依赖
   | 接口名 | 关键字段 | 被依赖模块 |
   |--------|---------|-----------|
   | Unit | ownerId(string), weapons(Weapon[]), currentWounds(int) | 规则引擎、AI、渲染、军队构建器 |

5. **验收标准必须每行包含 4 列：**
   | 指标项 | 目标值 | 测量方式 | 验收命令 |
   |--------|--------|----------|----------|
   注意：测量方式优先选择可自动化执行的方案（命令行、CI、脚本），只有在确实无法自动化时才使用手动方式。

6. **技术约束必须做出明确决策：**
   - ❌ 错误: "使用 Canvas 或 DOM+CSS" (这是选择题，不是约束)
   - ✅ 正确: "使用 Canvas 2D（决策理由：大量棋子绘制性能优于 DOM+CSS）"

7. **Mermaid 图表必须放在相关章节内**（ER 图放共享接口、流程图放对应功能描述、时序图放模块交互说明）

8. 输出纯 Markdown 文本，不要用 JSON 包裹`;

async function generateDoc(reqId, modelId) {
  const requirement = reqStore.getById(reqId);
  if (!requirement) throw Object.assign(new Error('需求不存在'), { status: 404 });

  let docPrompt = null;
  try {
    const skillStore = require('../stores/skill-store');
    docPrompt = skillStore.loadPrompt('skill-requirement-doc');
    if (docPrompt) console.log(`[generateDoc] 从 Skill 加载提示词`);
  } catch (e) { /* */ }

  const srs = JSON.parse(requirement.srs || '{}');

  const messages = [
    { role: 'system', content: docPrompt || DOC_SYSTEM_PROMPT },
    { role: 'user', content: `请为以下需求生成 Markdown 文档：

需求标题: ${requirement.title}
原始描述: ${requirement.description || ''}
当前 SRS:
- 功能范围: ${safeArr(srs.scopeIn).join('、') || '待定'}
- 排除范围: ${safeArr(srs.scopeOut).join('、') || '无'}
- 验收标准: ${safeArr(srs.acceptanceCriteria).join('；') || '待定'}
- 技术约束: ${safeArr(srs.technicalConstraints).join('、') || '无'}
- 需求摘要: ${srs.summary || ''}` },
  ];

  const result = await callLLM(modelId, messages, { temperature: 0.5, maxTokens: 6000, projectId: requirement.project_id, caller: 'generateDoc' });

  try {
    const workspace = require('./workspace-service');
    const projectStore = require('../stores/project-store');
    const project = projectStore.getById(requirement.project_id);
    if (project) {
      workspace.saveRequirementDoc(project.slug || project.name, requirement.id, requirement.title, result.content);
    }
  } catch (e) { /* 非关键 */ }

  return { content: result.content, modelUsed: result.modelUsed };
}

module.exports = { generateDoc };
