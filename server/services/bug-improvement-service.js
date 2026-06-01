// 缺陷自我改进引擎 — 严重缺陷解决后触发自我改进分析
// 触发时机: critical/major 级别的 bug 任务审核通过后
const { callLLM } = require('./llm-adapter');
const modelStore = require('../stores/model-store');
const { collection } = require('../db/connection');

const BUG_IMPROVEMENT_PROMPT = `你是一个缺陷根因分析专家。一个严重缺陷已被修复，以下是该缺陷的完整信息。请进行自我改进分析：

**分析目标：**
1. 确定该缺陷反映的系统性流程缺陷（不是代码bug本身，而是为什么这个bug会漏到生产环境）
2. 给出具体可操作的改进建议：应该修改 ACMS 的哪个环节来预防同类缺陷？
3. 评估改进建议的优先级和预期效果

**改进维度（可多选）：**
- 需求澄清阶段：scopeIn 是否缺少某类条目？领域 Skill 是否需要补充追问维度？
- 需求分解阶段：任务粒度是否合理？是否缺集成/边界类任务？
- 验收标准：验收条件是否只覆盖了正常路径？缺少哪些边界场景？
- 代码审查：审查清单是否漏掉了某类检查？
- 系统配置：是否需要新增配置参数或规则？
- 知识沉淀：是否需要补充 Wiki 文档或 Skill？

**输出格式（严格 JSON）：**
{
  "improvements": [
    {
      "dimension": "需求澄清",
      "issue": "发现的流程缺陷描述",
      "suggestion": "具体的改进建议（可操作）",
      "expectedEffect": "预期效果说明",
      "priority": "high|medium|low",
      "autoPatch": false
    }
  ],
  "summary": "本次自我改进总结",
  "shouldNotifyUser": true
}`;

/**
 * 分析已解决的严重缺陷，生成自我改进报告
 * @param {object} bugTask - 已完成的任务对象（含 bug_severity、root_cause 等字段）
 * @returns {object} 改进报告
 */
async function analyzeBugImprovement(bugTask) {
  const rootCause = (() => {
    try { return JSON.parse(bugTask.root_cause || '{}'); } catch { return {}; }
  })();

  const context = {
    title: bugTask.title,
    severity: bugTask.bug_severity,
    reproduce_steps: bugTask.reproduce_steps || '',
    expected_behavior: bugTask.expected_behavior || '',
    actual_behavior: bugTask.actual_behavior || '',
    root_cause: rootCause,
    description: (bugTask.description || '').substring(0, 2000),
  };

  const messages = [
    { role: 'system', content: BUG_IMPROVEMENT_PROMPT },
    { role: 'system', content: `## 已修复缺陷信息\n${JSON.stringify(context, null, 2)}` },
    { role: 'user', content: '请分析这个已修复的缺陷，生成自我改进报告。' },
  ];

  // 使用项目配置的模型，兜底用系统默认
  let modelId = 'model_default';
  const models = modelStore.list();
  if (models.length > 0) modelId = models[0].id;

  try {
    const result = await callLLM(modelId, messages, {
      temperature: 0.3, maxTokens: 4000, jsonMode: true,
      projectId: bugTask.project_id,
      caller: 'bug-improvement',
    });

    const content = result.content;
    // 提取 JSON
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('JSON not found in response');
    const parsed = JSON.parse(m[0]);

    const report = {
      bugId: bugTask.id,
      bugTitle: bugTask.title,
      analyzedAt: new Date().toISOString(),
      improvements: parsed.improvements || [],
      summary: parsed.summary || '',
      shouldNotifyUser: parsed.shouldNotifyUser !== false,
    };

    // 持久化改进报告到 task 的 artifacts
    const existingArtifacts = JSON.parse(bugTask.artifacts || '{}');
    existingArtifacts.bugImprovementReport = report;
    collection('tasks').update(t => t.id === bugTask.id, {
      artifacts: JSON.stringify(existingArtifacts),
    });

    // 保存到自我改进报告列表
    try {
      const reportStore = require('../stores/improvement-report-store');
      reportStore.create({
        projectId: bugTask.project_id || '',
        sourceTaskId: bugTask.id,
        sourceType: 'bug',
        severity: bugTask.bug_severity || 'major',
        rootCause,
        summary: parsed.summary || bugTask.title || '',
        improvements: parsed.improvements || [],
      });
      console.log(`[BugImprovement] ✅ 已创建改进报告: ${bugTask.id}`);
    } catch (e) { console.error('[BugImprovement] 保存报告失败:', e.message); }

    console.log(`[BugImprovement] ${bugTask.id}: ${report.improvements.length} 条改进建议`);
    return report;
  } catch (e) {
    console.error(`[BugImprovement] 分析失败: ${e.message}`);
    // 降级：生成简单的纯文本报告
    const fallback = {
      bugId: bugTask.id,
      bugTitle: bugTask.title,
      analyzedAt: new Date().toISOString(),
      improvements: [
        {
          dimension: '系统流程',
          issue: `严重缺陷 ${bugTask.title} 已修复，但自我改进分析引擎分析失败`,
          suggestion: `建议人工审查该缺陷的根因（${rootCause.deep || '未记录'}），评估是否需要补充流程规则`,
          expectedEffect: '通过人工审查确定流程改进点',
          priority: 'medium',
          autoPatch: false,
        },
      ],
      summary: `AI 自我改进分析失败（${e.message}），已降级为人工审查建议`,
      shouldNotifyUser: true,
    };
    return fallback;
  }
}

module.exports = { analyzeBugImprovement, BUG_IMPROVEMENT_PROMPT };
