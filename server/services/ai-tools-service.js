// AI 辅助服务 — MD文档生成 + 智能任务分解
const modelStore = require('../stores/model-store');
const reqStore = require('../stores/requirement-store');
const { callLLM } = require('./llm-adapter');

// ===== 生成 MD 需求文档 =====
const DOC_SYSTEM_PROMPT = `你是一个专业的需求文档撰写专家。请根据以下需求信息，生成一份结构清晰、用户友好的 Markdown 格式需求文档。

**要求：**
1. 使用中文撰写，语言简洁专业
2. 包含以下章节：需求概述、功能范围、验收标准、技术约束、补充说明
3. 每个章节内容具体、可执行，避免模糊描述
4. 格式规范，使用恰当的 Markdown 标题、列表、表格
5. 输出纯 Markdown 文本，不要用 JSON 包裹`;

async function generateDoc(reqId, modelId) {
  const requirement = reqStore.getById(reqId);
  if (!requirement) throw Object.assign(new Error('需求不存在'), { status: 404 });

  const srs = JSON.parse(requirement.srs || '{}');

  const messages = [
    { role: 'system', content: DOC_SYSTEM_PROMPT },
    { role: 'user', content: `请为以下需求生成 Markdown 文档：

需求标题: ${requirement.title}
原始描述: ${requirement.description || ''}
当前 SRS:
- 功能范围: ${(srs.scopeIn || []).join('、') || '待定'}
- 排除范围: ${(srs.scopeOut || []).join('、') || '无'}
- 验收标准: ${(srs.acceptanceCriteria || []).join('；') || '待定'}
- 技术约束: ${(srs.technicalConstraints || []).join('、') || '无'}
- 需求摘要: ${srs.summary || ''}` },
  ];

  const result = await callLLM(modelId, messages, { temperature: 0.5, maxTokens: 3000 });
  return { content: result.content, modelUsed: result.modelUsed };
}

// ===== 智能任务分解 =====
const DECOMPOSE_SYSTEM_PROMPT = `你是一个经验丰富的技术项目经理。请根据需求规格说明，将需求分解为可执行的任务列表。

**分解原则：**
1. 每个任务应该是独立可交付的单元，任务粒度控制在 0.5-3 天工作量
2. 识别任务间的依赖关系（用任务标题引用，稍后系统会映射为 ID）
3. 为每个任务标注所需技能和水平
4. 如有相关 Wiki 文档（技术规范、API 文档），注明引用路径

**任务类型：** coding(编码) | design(设计) | testing(测试) | documentation(文档) | review(审查) | audio(音频) | modeling(建模)

**每个任务的 description 必须包含（用 Markdown 格式）：**
1. **任务目标** — 一句话说明要完成什么
2. **实现要点** — 具体的实现思路、技术方案、关键算法或架构决策
3. **涉及文件** — 预计需要创建或修改的文件路径列表
4. **验收方式** — 如何验证任务完成（测试命令、手动测试步骤、性能指标等）
5. **注意事项** — 边界情况、性能要求、兼容性考虑
6. **参考资料** — 相关的文档、Wiki 页面、API 规范链接

**输出格式（严格JSON）：**
{
  "tasks": [
    {
      "title": "任务标题",
      "description": "## 任务目标\\n实现XXX功能\\n\\n## 实现要点\\n- 使用Three.js的PointsMaterial\\n- 粒子数量1000+，使用BufferGeometry优化\\n\\n## 涉及文件\\n- client/systems/weather/rain.js（新建）\\n- client/systems/weather/index.js（修改）\\n\\n## 验收方式\\n- npm test weather\\n- 手动验证：打开场景确认粒子效果\\n- 帧率≥30fps\\n\\n## 注意事项\\n- 注意内存泄漏，粒子回收\\n- 兼容Chrome/Edge\\n\\n## 参考资料\\n- [[技术/Three.js粒子系统]]",
      "type": "coding",
      "estimatedHours": 8,
      "priority": 1,
      "requiredSkills": { "coding": 1.5, "threejs": 1.0 },
      "dependsOn": [],
      "linkedWiki": ["技术/Three.js粒子系统.md"]
    }
  ],
  "summary": "分解说明"
}`;

async function decomposeRequirement(reqId, modelId) {
  const requirement = reqStore.getById(reqId);
  if (!requirement) throw Object.assign(new Error('需求不存在'), { status: 404 });
  if (requirement.status !== 'approved') throw Object.assign(new Error('只有已确认的需求才能分解'), { status: 400 });

  const srs = JSON.parse(requirement.srs || '{}');

  const messages = [
    { role: 'system', content: DECOMPOSE_SYSTEM_PROMPT },
    { role: 'user', content: `请分解以下需求：

标题: ${requirement.title}
描述: ${requirement.structured_description || requirement.description || ''}
功能范围: ${(srs.scopeIn || []).join('、')}
验收标准: ${(srs.acceptanceCriteria || []).join('；')}
技术约束: ${(srs.technicalConstraints || []).join('、')}
Wiki 参考: ${requirement.wiki_path || '无'}

请生成任务列表。` },
  ];

  const result = await callLLM(modelId, messages, { temperature: 0.5, maxTokens: 3000, jsonMode: true });
  try {
    return { ...JSON.parse(result.content), modelUsed: result.modelUsed };
  } catch {
    return { tasks: [], summary: '解析失败', modelUsed: result.modelUsed };
  }
}

module.exports = { generateDoc, decomposeRequirement };
