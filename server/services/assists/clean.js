// ACMS · 对话清理辅助（v0.19，2026-06-27）
//   用户按角色清理 supplement_history，清理后重置 brief
//
// 字段：requirement.assist_clean（status / action / entries_removed / note）

const reqStore = require('../../stores/requirement-store');

function getBriefInfo(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return {};
  try {
    const history = JSON.parse(req.supplement_history || '[]');
    const counts = { all: 0, user: 0, assistant: 0, system: 0 };
    if (Array.isArray(history)) {
      history.forEach(e => { counts.all++; if (counts[e.role] !== undefined) counts[e.role]++; });
    }
    return {
      total_entries: counts.all,
      user_entries: counts.user,
      assistant_entries: counts.assistant,
      system_entries: counts.system,
      last_entry_at: history.length > 0 ? (history[history.length - 1]?.at || '') : '',
    };
  } catch { return {}; }
}

async function runAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return { error: 'REQ_NOT_FOUND' };

  const mode = opts.mode || 'all'; // all | user | assistant | system | ai | selected
  let removed = 0;

  try {
    const history = JSON.parse(req.supplement_history || '[]');
    if (!Array.isArray(history)) return { error: 'HISTORY_INVALID', entries_removed: 0 };

    // 角色映射表
    const rolesToRemove = {
      all: ['user', 'assistant', 'system'],
      user: ['user'],
      assistant: ['assistant'],
      system: ['system'],
      ai: ['assistant', 'system'],   // AI 相关（助理+系统参考）
    };

    let filtered;
    let label;

    if (mode === 'selected' && Array.isArray(opts.indices) && opts.indices.length > 0) {
      // 精确索引删除：opts.indices 是 supplement_history 中的实际数组下标
      const idxSet = new Set(opts.indices.map(Number).filter(i => i >= 0 && i < history.length));
      filtered = history.filter((_, i) => !idxSet.has(i));
      removed = history.length - filtered.length;
      label = `选中条目 ${opts.indices.length} 条`;
    } else {
      const targets = rolesToRemove[mode];
      if (!targets) return { error: `未知清理模式: ${mode}`, entries_removed: 0 };
      filtered = history.filter(e => {
        if (targets.includes(e.role)) { removed++; return false; }
        return true;
      });
      label = { all: '全部', user: '用户', assistant: 'AI 回答', system: '系统参考', ai: 'AI 回答+系统参考' }[mode] || mode;
    }

    reqStore.update(requirementId, {
      supplement_history: JSON.stringify(filtered),
      assist_clean: JSON.stringify({
        status: 'done',
        action: mode,
        entries_removed: removed,
        note: `已清理 ${label[mode] || mode} 共 ${removed} 条对话记录${filtered.length > 0 ? `，剩余 ${filtered.length} 条` : ''}`,
        cleared_at: new Date().toISOString(),
      }),
    });

    // 重置 brief（让 AI 重新理解上下文）
    reqStore.update(requirementId, {
      thinking_brief: JSON.stringify({
        status: 'idle', opening: '', ai_understanding: '',
        followup_question: '', chat_round: 0,
        diagnosis: null, clarity: null,
        generated_at: new Date().toISOString(),
      }),
    });

    console.log(`[assist:clean] ${requirementId} ${mode} → 清理 ${removed} 条，剩余 ${filtered.length} 条`);
    return { entries_removed: removed, history_remaining: filtered.length };
  } catch (e) {
    console.error(`[assist:clean] ${requirementId} 失败:`, e.message);
    reqStore.update(requirementId, {
      assist_clean: JSON.stringify({ status: 'failed', error: e.message, cleared_at: new Date().toISOString() }),
    });
    return { error: e.message };
  }
}

function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try { return JSON.parse(req.assist_clean || 'null'); } catch { return null; }
}

module.exports = {
  name: '对话清理',
  field: 'assist_clean',
  runAssistJob,
  getAssist,
  getBriefInfo,
};
