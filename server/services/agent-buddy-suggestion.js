// ACMS Agent 小吉 — 主动建议系统（v0.80）
// 基于 LLM 生成智能建议，定期推送给用户

const { callLLM } = require('./llm-adapter');
const modelStore = require('../stores/model-store');
const reqStore = require('../stores/requirement-store');
const taskStore = require('../stores/task-store');
const bugStore = require('../stores/bug-store');
const { collection } = require('../db/connection');

// 建议生成 Prompt
const SUGGESTION_PROMPT = `你是 ACMS 智能协同管理平台的助手，负责根据用户行为和系统状态，生成有用的主动建议。

## 建议生成原则
1. **实用性**：建议必须具体可操作，不要泛泛而谈
2. **及时性**：优先处理紧急/重要的事项
3. **个性化**：根据用户角色（PM/开发/测试）给出针对性建议
4. **简洁性**：每条建议 ≤50 字，最多 3 条

## 分析维度
- **需求状态**：待澄清、待审批、进行中、已完成
- **任务状态**：待认领、进行中、待审核、已完成
- **缺陷状态**：新发现、处理中、待验证、已关闭
- **项目健康**：进度偏差、风险预警、资源瓶颈
- **用户习惯**：高频操作、重复行为、使用偏好

## 输出格式（严格 JSON）
{
  "suggestions": [
    {
      "type": "requirement|task|bug|project|habit",
      "priority": "high|medium|low",
      "title": "建议标题（≤20字）",
      "content": "建议内容（≤50字）",
      "action": "view_requirement|view_task|view_bug|open_dashboard|do_something",
      "actionTarget": "可选的目标 ID"
    }
  ],
  "reason": "生成建议的原因（≤30字）"
}

## 注意事项
- 如果当前没有值得建议的事项，返回 {"suggestions": [], "reason": "当前状态良好，无需建议"}
- 优先推荐高优先级、紧急的事项
- 避免重复推荐用户已经处理过的事项`;

/**
 * 生成主动建议
 * @param {string} userId - 用户 ID
 * @returns {Promise<object>} 建议列表
 */
async function generateSuggestions(userId) {
  const user = collection('users').findOne(u => u.id === userId);
  if (!user) return { suggestions: [], reason: '用户不存在' };

  // 获取项目上下文
  const userProjects = collection('projects').find(p => p.owner === userId || 
    collection('project_members').findOne(m => m.project_id === p.id && m.member_id === userId));

  if (!userProjects || userProjects.length === 0) {
    return { suggestions: [], reason: '用户暂无项目' };
  }

  // 收集近期数据
  const recentRequirements = reqStore.list({ 
    projectId: userProjects[0].id, 
    limit: 10 
  }).filter(r => {
    const created = new Date(r.created_at);
    return Date.now() - created.getTime() < 7 * 24 * 60 * 60 * 1000; // 7 天内
  });

  const recentTasks = taskStore.list({ 
    projectId: userProjects[0].id, 
    limit: 20 
  }).filter(t => {
    const created = new Date(t.created_at);
    return Date.now() - created.getTime() < 7 * 24 * 60 * 60 * 1000;
  });

  // 分析状态
  const pendingRequirements = recentRequirements.filter(r => 
    r.status === 'idea' || r.status === 'clarifying');
  
  const pendingTasks = recentTasks.filter(t => 
    t.status === 'backlog' && t.assigned_to === userId);
  
  const inProgressTasks = recentTasks.filter(t => 
    t.status === 'in_progress' && t.assigned_to === userId);
  
  const reviewTasks = recentTasks.filter(t => 
    t.status === 'review' && t.assigned_to === userId);

  const recentBugs = bugStore ? bugStore.list({ 
    projectId: userProjects[0].id, 
    limit: 10 
  }).filter(b => {
    const created = new Date(b.created_at);
    return Date.now() - created.getTime() < 3 * 24 * 60 * 60 * 1000; // 3 天内
  }) : [];

  // 构建上下文
  const context = {
    userName: user.displayName || user.username,
    userRole: user.role,
    projectCount: userProjects.length,
    recentRequirements: recentRequirements.length,
    pendingRequirements: pendingRequirements.length,
    pendingTasks: pendingTasks.length,
    inProgressTasks: inProgressTasks.length,
    reviewTasks: reviewTasks.length,
    recentBugs: recentBugs.length,
    recentEvents: _getRecentEvents(userId, 10)
  };

  // 调用 LLM 生成建议
  const model = modelStore.getDefaultGenModel();
  if (!model) {
    return _generateRuleBasedSuggestions(context);
  }

  try {
    const messages = [
      { role: 'system', content: SUGGESTION_PROMPT },
      { role: 'user', content: `请分析以下系统状态并生成建议：\n${JSON.stringify(context, null, 2)}` }
    ];

    const result = await callLLM(model.id, messages, {
      maxTokens: 500,
      temperature: 0.3,
      jsonMode: true
    });

    const parsed = _parseSuggestionResponse(result);
    if (parsed && parsed.suggestions && parsed.suggestions.length > 0) {
      return parsed;
    }
  } catch (e) {
    console.warn('[suggestion] LLM 生成失败，降级到规则模式:', e.message);
  }

  // 降级到规则生成
  return _generateRuleBasedSuggestions(context);
}

/**
 * 解析 LLM 响应
 */
function _parseSuggestionResponse(result) {
  let text = typeof result === 'string' ? result : (result && result.content) || '';
  
  // 提取 JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    return null;
  }
}

/**
 * 基于规则的 suggestion 生成（降级方案）
 */
function _generateRuleBasedSuggestions(context) {
  const suggestions = [];

  // 高优先级：待审核任务
  if (context.reviewTasks > 0) {
    suggestions.push({
      type: 'task',
      priority: 'high',
      title: '有待审核任务',
      content: `你有 ${context.reviewTasks} 个任务等待审核，请及时处理。`,
      action: 'view_task',
      actionTarget: 'review'
    });
  }

  // 中优先级：待认领任务
  if (context.pendingTasks > 0) {
    suggestions.push({
      type: 'task',
      priority: 'medium',
      title: '有待认领任务',
      content: `你有 ${context.pendingTasks} 个任务待认领，点击查看。`,
      action: 'view_task',
      actionTarget: 'backlog'
    });
  }

  // 中优先级：待澄清需求
  if (context.pendingRequirements > 0) {
    suggestions.push({
      type: 'requirement',
      priority: 'medium',
      title: '有待澄清需求',
      content: `有 ${context.pendingRequirements} 个需求需要澄清， helping 推进项目。`,
      action: 'view_requirement',
      actionTarget: 'clarifying'
    });
  }

  // 低优先级：进行中的任务
  if (context.inProgressTasks > 0) {
    suggestions.push({
      type: 'task',
      priority: 'low',
      title: '任务进度提醒',
      content: `你有 ${context.inProgressTasks} 个任务进行中，记得更新进度。`,
      action: 'view_task',
      actionTarget: 'in_progress'
    });
  }

  return {
    suggestions: suggestions.slice(0, 3),
    reason: '基于当前任务和需求状态生成'
  };
}

/**
 * 获取近期系统事件
 */
function _getRecentEvents(userId, limit) {
  const events = collection('events').find(e => 
    e.actor && (e.actor.id === userId || e.target && e.target.id === userId)
  ).sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, limit);
  
  return events.map(e => ({
    type: e.type,
    ts: e.ts,
    summary: e.payload && e.payload.summary
  }));
}

/**
 * 检查是否需要生成建议
 */
function shouldGenerate(userId) {
  const key = `suggestion_last_gen:${userId}`;
  const mem = collection('buddy_memory').findOne(m => m.user_id === userId && m.key === key);
  
  if (!mem) return true;
  
  try {
    const lastGen = JSON.parse(mem.value);
    const hoursSince = (Date.now() - new Date(lastGen.ts).getTime()) / (60 * 60 * 1000);
    return hoursSince >= 2; // 至少间隔 2 小时
  } catch {
    return true;
  }
}

/**
 * 记录建议生成时间
 */
function recordSuggestionGen(userId) {
  const key = `suggestion_last_gen:${userId}`;
  const mem = collection('buddy_memory').findOne(m => m.user_id === userId && m.key === key);
  
  const value = JSON.stringify({ ts: new Date().toISOString() });
  
  if (mem) {
    collection('buddy_memory').update(m => m.key === key, { value });
  } else {
    collection('buddy_memory').insert({ 
      user_id: userId, 
      key, 
      value, 
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
}

module.exports = {
  generateSuggestions,
  shouldGenerate,
  recordSuggestionGen
};
