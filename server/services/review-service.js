// AI 需求评审服务 — 5 维评审引擎
// 触发时机: clarifying → review 状态转移时（门控通过后）
const modelStore = require('../stores/model-store');
const { callLLM } = require('./llm-adapter');

// 获取评审用的系统提示词
function getReviewPrompt(requirement, level) {
  const baseRoles = require('./ai-clarify-service');
  const reviewPrompt = baseRoles.buildPrompt('review');
  // 如果 L1 则注入 L1 评审重点
  if (level === 'L1') {
    const l1Segment = baseRoles.PROMPT_SEGMENTS['review-level-l1'];
    return reviewPrompt.replace('review-level-l2', l1Segment);
  }
  return reviewPrompt;
}

/**
 * 执行 5 维 AI 评审
 * @param {object} requirement - 需求对象
 * @returns {Promise<object>} { passed, score, issues, modelUsed }
 */
async function performReview(requirement) {
  const srs = typeof requirement.srs === 'string' ? JSON.parse(requirement.srs) : (requirement.srs || {});

  // 如果 SRS 基本为空（刚走完澄清但没有实质性内容），跳过评审
  if (!srs.scopeIn || srs.scopeIn.length === 0) {
    return {
      passed: true, score: 5,
      issues: [{ dimension: '系统', severity: 'warning', detail: 'SRS 尚未填充·跳过评审', suggestion: '' }],
      modelUsed: null, skipped: true,
    };
  }

  // 获取第一个可用的模型
  const models = modelStore.getActive();
  const model = models[0];
  if (!model) {
    console.log('[review] 无可用模型，跳过 AI 评审');
    return {
      passed: true, score: 5,
      issues: [],
      modelUsed: null, skipped: true,
    };
  }

  // 检测层级
  const childIds = JSON.parse(requirement.child_ids || '[]');
  const level = !requirement.parent_id && childIds.length > 0 ? 'L1' : 'L2';

  const reviewPrompt = getReviewPrompt(requirement, level);

  const context = {
    title: requirement.title,
    description: requirement.description || '',
    srs: srs,
    priority: requirement.priority,
    deadline: requirement.deadline || '',
    level: level,
  };

  const messages = [
    { role: 'system', content: reviewPrompt },
    { role: 'user', content: `请评审以下需求 SRS（层级: ${level}）：\n\n${JSON.stringify(context, null, 2)}` },
  ];

  try {
    const result = await callLLM(model.id, messages, {
      temperature: 0.3,
      maxTokens: 3000,
      jsonMode: true,
      projectId: requirement.project_id,
      caller: 'requirement-review',
    });

    const content = result.content;

    // 尝试解析 JSON（从 markdown 代码块中提取）
    let parsed;
    try {
      // 先尝试直接解析
      parsed = JSON.parse(content);
    } catch {
      // 从 markdown 代码块中提取
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[1]); } catch {}
      }
    }

    if (!parsed || typeof parsed.score !== 'number') {
      console.log('[review] LLM 返回格式异常，降级处理');
      return { passed: true, score: 3, issues: [], modelUsed: result.modelUsed, skipped: true };
    }

    // 规范化: 确保每条 issue 有 dimension/severity/detail/suggestion
    const issues = (parsed.issues || []).map(i => ({
      dimension: i.dimension || '其他',
      severity: i.severity === 'error' ? 'error' : 'warning',
      detail: i.detail || '',
      suggestion: i.suggestion || '',
    })).slice(0, 8);

    const hasErrors = issues.some(i => i.severity === 'error');
    const passed = parsed.score >= 3 && !hasErrors;

    console.log(`[review] ${requirement.id}: score=${parsed.score}, issues=${issues.length}, passed=${passed} (model: ${result.modelUsed})`);

    return {
      passed,
      score: Math.min(5, Math.max(0, parsed.score)),
      issues,
      modelUsed: result.modelUsed,
      skipped: false,
    };
  } catch (e) {
    console.error(`[review] 评审调用失败: ${e.message}`);
    return { passed: true, score: 3, issues: [], modelUsed: null, skipped: true };
  }
}

module.exports = { performReview };
