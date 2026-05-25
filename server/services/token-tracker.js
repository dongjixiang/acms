// Token 用量追踪服务
const { collection } = require('../db/connection');

class TokenTracker {
  /**
   * 记录一次 LLM 调用用量
   * @param {string} projectId
   * @param {string} modelName
   * @param {object} usage - { promptTokens, completionTokens, totalTokens }
   * @param {string} caller - 调用场景 (clarify / generateDoc / decompose)
   */
  record(projectId, modelName, usage, caller = '') {
    const now = new Date().toISOString();
    const entry = {
      id: `tok_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      project_id: projectId,
      model: modelName,
      caller: caller,
      prompt_tokens: usage.promptTokens || 0,
      completion_tokens: usage.completionTokens || 0,
      total_tokens: usage.totalTokens || 0,
      created_at: now,
    };
    collection('token_usage').insert(entry);
  }

  /**
   * 获取调用明细（最近 N 条）
   * @param {string} projectId
   * @param {number} limit
   * @returns {Array}
   */
  getLogs(projectId, limit = 50) {
    const entries = projectId
      ? collection('token_usage').find(e => e.project_id === projectId)
      : collection('token_usage').all();
    entries.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return entries.slice(0, limit).map(e => ({
      id: e.id,
      model: e.model,
      caller: e.caller || '',
      promptTokens: e.prompt_tokens,
      completionTokens: e.completion_tokens,
      totalTokens: e.total_tokens,
      time: e.created_at,
    }));
  }

  /**
   * 获取项目累计 Token 用量
   */
  getProjectStats(projectId) {
    const entries = collection('token_usage').find(e => e.project_id === projectId);

    const byModel = {};
    let totalTokens = 0;
    let totalCalls = entries.length;

    for (const e of entries) {
      totalTokens += e.total_tokens || 0;
      const key = e.model || 'unknown';
      if (!byModel[key]) byModel[key] = { model: key, calls: 0, tokens: 0 };
      byModel[key].calls++;
      byModel[key].tokens += e.total_tokens || 0;
    }

    return { totalTokens, totalCalls, byModel: Object.values(byModel) };
  }

  /**
   * 获取全局统计（所有项目）
   */
  getGlobalStats() {
    const entries = collection('token_usage').all();
    const byProject = {};
    let grandTotal = 0;
    let grandCalls = entries.length;

    for (const e of entries) {
      grandTotal += e.total_tokens || 0;
      const pid = e.project_id || 'unknown';
      if (!byProject[pid]) byProject[pid] = { projectId: pid, calls: 0, tokens: 0 };
      byProject[pid].calls++;
      byProject[pid].tokens += e.total_tokens || 0;
    }

    return { totalTokens: grandTotal, totalCalls: grandCalls, byProject: Object.values(byProject) };
  }

  /**
   * 清理旧记录（保留最近 90 天）
   */
  cleanup(maxAgeDays = 90) {
    const cutoff = new Date(Date.now() - maxAgeDays * 86400000).toISOString();
    const removed = collection('token_usage').remove(e => e.created_at < cutoff);
    return { removed };
  }
}

module.exports = new TokenTracker();
