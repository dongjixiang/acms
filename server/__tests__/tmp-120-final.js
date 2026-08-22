// 120 完整链路验证：task-agent → Qwen 内核（修复后）
process.chdir('/root/acms');
const aiTools = require('/root/acms/server/services/task-agent');
const { collection } = require('/root/acms/server/db/connection');

(async () => {
  // 清理旧测试任务
  const old = collection('tasks').find((x) => x.id === 'T-QWEN-120-02');
  if (old.length) collection('tasks').remove((x) => x.id === 'T-QWEN-120-02');

  const now = new Date().toISOString();
  collection('tasks').insert({
    id: 'T-QWEN-120-02', project_id: 'proj_duogame', parent_id: null,
    title: 'Qwen内核120终验：创建并验证文件',
    description: '在 workspace 创建 qwen-120-final.txt，内容 QWEN-120-FINAL-OK，然后用 git status 确认它出现在 untracked 列表',
    type: 'general', priority: 'medium', status: 'pending',
    blocked: false, block_reason: null, depends_on: [], depends_contract: null,
    depended_by: [], sibling_ids: [], required_skills: '{}',
    estimated_hours: 0.5, actual_hours: 0, assigned_to: null, assigned_at: null,
    assigned_role: null, progress: 0, progress_note: 'Qwen 内核 120 终验',
    last_progress_update: null, auto_review: true, review_status: null,
    wiki_context: null, linked_wiki: null, execution_log: '[]',
    submissions: [], reviews: [], artifacts: [], version: 1,
    created_at: now, updated_at: now, completed_at: null
  });
  console.log('[SETUP] 任务已创建 T-QWEN-120-02');

  const t0 = Date.now();
  try {
    const result = await aiTools.executeTaskAgent('T-QWEN-120-02', { multiRole: false, lang: 'zh' });
    console.log('[RESULT] 完成 耗时', ((Date.now() - t0) / 1000).toFixed(1) + 's | model:', result.modelUsed);
    console.log('[RESULT] analysis:', (result.analysis || '').slice(0, 400));
  } catch (e) {
    console.error('[RESULT] 失败:', e.message, '| code:', e.code);
  }
  process.exit(0);
})();
