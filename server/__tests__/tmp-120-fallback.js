// 120 回退路径验证：qwen_task_enabled=false → 旧引擎应正常完成
process.chdir('/root/acms');
const aiTools = require('/root/acms/server/services/task-agent');
const { collection } = require('/root/acms/server/db/connection');

(async () => {
  const now = new Date().toISOString();
  collection('tasks').insert({
    id: 'T-FALLBACK-01', project_id: 'proj_duogame', parent_id: null,
    title: '回退路径验证',
    description: '在 workspace 创建 fallback-test.txt，内容 FALLBACK-OK',
    type: 'general', priority: 'medium', status: 'pending',
    blocked: false, block_reason: null, depends_on: [], depends_contract: null,
    depended_by: [], sibling_ids: [], required_skills: '{}',
    estimated_hours: 0.5, actual_hours: 0, assigned_to: null, assigned_at: null,
    assigned_role: null, progress: 0, progress_note: '回退验证',
    last_progress_update: null, auto_review: true, review_status: null,
    wiki_context: null, linked_wiki: null, execution_log: '[]',
    submissions: [], reviews: [], artifacts: [], version: 1,
    created_at: now, updated_at: now, completed_at: null
  });
  console.log('[SETUP] T-FALLBACK-01 created');
  const t0 = Date.now();
  try {
    const result = await aiTools.executeTaskAgent('T-FALLBACK-01', { multiRole: false, lang: 'zh' });
    console.log('[RESULT] 完成 耗时', ((Date.now() - t0) / 1000).toFixed(1) + 's | model:', result.modelUsed);
    console.log('[RESULT] analysis:', (result.analysis || '').slice(0, 300));
  } catch (e) {
    console.error('[RESULT] 失败:', e.message, '| code:', e.code);
  }
  process.exit(0);
})();
