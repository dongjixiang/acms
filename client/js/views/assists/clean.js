// ACMS · 对话清理辅助（v0.19，2026-06-27）
//   Method: clean | Name: 对话清理
//
// 显示当前对话统计 + 清理按钮
// 清理后重置 brief（AI 重新理解上下文）

(function () {
  function render(reqId, data) {
    if (!data) return '<div class="insight-loading">⏳ 加载对话统计…</div>';
    if (data.status === 'done') {
      const note = data.note || '清理完成';
      return `
        <div class="assist-section-title">🧹 对话清理 ✅</div>
        <div style="margin:8px 0;font-size:13px;color:var(--text2)">${escHtml(note)}</div>
        <button class="btn-small" onclick="loadCleanStats('${reqId}');chatCleanPrompt('${reqId}')" style="margin-top:4px">🔄 查看当前统计</button>
      `;
    }
    if (data.status === 'failed') {
      return `<div class="insight-error">❌ 清理失败：${escHtml(data.error || '未知错误')}</div>`;
    }
    return '';
  }

  window.ACMSAssists.register('clean', { name: '对话清理', render });
})();

/**
 * 加载对话统计并弹出清理选项
 */
async function loadCleanStats(reqId) {
  try {
    const stats = await api('GET', '/requirements/' + reqId + '/assist/clean/stats');
    return stats;
  } catch (e) {
    toast('加载统计失败: ' + e.message, 'error');
    return null;
  }
}

/**
 * 显示清理确认对话框
 */
async function chatCleanPrompt(reqId) {
  if (!reqId) return;
  const stats = await loadCleanStats(reqId);
  if (!stats) return;

  const total = stats.total_entries || 0;
  const user = stats.user_entries || 0;
  const assistant = stats.assistant_entries || 0;
  const system = stats.system_entries || 0;

  if (total === 0) {
    toast('当前对话没有记录可清理', 'info');
    return;
  }

  // 用 confirm + prompt 模拟简单选择（不引入复杂 UI）
  const msg = `🧹 当前对话统计：
  ─────────────────
  用户消息：${user} 条
  AI 回答：${assistant} 条
  系统参考：${system} 条
  ─────────────────
  总计：${total} 条

请选择清理模式：
  1 = 清理全部
  2 = 仅清理用户消息
  3 = 仅清理 AI 回答
  4 = 清理系统参考
  5 = 清理所有 AI 相关内容（回答+系统参考）
  0 = 取消`;

  const choice = window.prompt(msg, '1');
  if (!choice) return;

  const modeMap = { '1': 'all', '2': 'user', '3': 'assistant', '4': 'system', '5': 'ai' };
  const mode = modeMap[choice.trim()];
  if (!mode) return toast('已取消', 'info');

  const labelMap = { all: '全部', user: '用户消息', assistant: 'AI 回答', system: '系统参考', ai: 'AI 回答+系统参考' };
  if (!window.confirm(`确认清理「${labelMap[mode]}」？此操作不可撤销。`)) return;

  try {
    await chatAssist(reqId, 'clean', { mode });
    toast('🧹 清理中…', 'info', 2000);
    // 延迟刷新 chat 流（让后端完成清理 + brief 重置）
    setTimeout(() => {
      // 重置本地 state，强制全量刷新
      if (window._chatState && window._chatState[reqId]) {
        window._chatState[reqId].histCount = 0;
      }
      if (typeof loadChatStream === 'function') {
        loadChatStream(reqId);
      }
    }, 1000);
  } catch (e) {
    toast('清理失败: ' + e.message, 'error');
  }
}
