// 任务看板视图 — 五列 Kanban + 任务详情 + 操作
// 依赖: core/state.js, core/utils.js, js/api.js

async function loadKanbanReqFilter() {
  if (!App.currentProjectId) return;
  try {
    const reqs = await Requirements.list({ projectId: App.currentProjectId });
    document.getElementById('kanban-req-filter').innerHTML = '<option value="">全部需求</option>' + reqs.filter(r => ['approved', 'in_execution', 'done'].includes(r.status)).map(r => `<option value="${r.id}">${escHtml(r.title)}</option>`).join('');
  } catch (e) { /* */ }
}

async function refreshKanban(parentId) {
  if (!App.currentProjectId) return;
  const filterVal = parentId || document.getElementById('kanban-req-filter')?.value || '';
  try {
    const board = await Tasks.board(App.currentProjectId, filterVal || undefined);
    for (const col of ['backlog', 'in_progress', 'review', 'done', 'archived']) {
      const tasks = board[col] || [];
      document.getElementById(`count-${col}`).textContent = tasks.length;
      document.getElementById(`col-${col}`).innerHTML = tasks.map(t => `
        <div class="task-card priority-${t.priority || 3}" onclick="openTask('${t.id}')">
          <div class="task-title">${escHtml(t.title)}</div>
          <div class="task-meta"><span>${t.id}</span><span class="type-tag type-${t.type}">${App.typeLabels[t.type] || ''} ${t.type}</span><span>P${t.priority}</span>${t.assigned_to ? '<span>🐕</span>' : ''}${t.status === 'in_progress' ? `<span>${t.progress || 0}%</span>` : ''}</div>
          ${t.status === 'in_progress' ? `<div class="progress-bar"><div class="progress-fill" style="width:${t.progress || 0}%"></div></div>` : ''}
          ${t.status === 'backlog' ? `<div class="task-actions"><button class="btn-small btn-accept" onclick="event.stopPropagation();claimTask('${t.id}')">认领</button></div>` : ''}
          ${t.status === 'in_progress' ? `<div class="task-actions"><button class="btn-small btn-accept" onclick="event.stopPropagation();submitTask('${t.id}')">提交</button></div>` : ''}
          ${t.status === 'review' ? `<div class="task-actions"><button class="btn-small btn-accept" onclick="event.stopPropagation();reviewTask('${t.id}','approved')">通过</button><button class="btn-small btn-reject" onclick="event.stopPropagation();reviewTask('${t.id}','rejected')">驳回</button></div>` : ''}
        </div>`).join('') || '<div class="empty" style="padding:12px">-</div>';
    }
  } catch (e) { toast('加载看板失败: ' + e.message, 'error'); }
}

// ===== 任务详情 =====
async function openTask(taskId) {
  showWorkspaceView('task-detail');
  try {
    const t = await Tasks.get(taskId);
    document.getElementById('task-detail-title').textContent = `${t.id}: ${escHtml(t.title)}`;
    document.getElementById('task-detail-status').innerHTML = `<span class="status-badge badge-${t.status === 'in_progress' ? 'in_execution' : t.status === 'done' ? 'done' : 'clarifying'}">${t.status}</span>`;
    const skills = safeParse(t.required_skills), log = safeParse(t.execution_log), subs = safeParse(t.submissions), revs = safeParse(t.reviews);
    document.getElementById('task-detail-content').innerHTML = `
      <div class="detail-grid"><div><span class="label">类型:</span> ${t.type}</div><div><span class="label">优先级:</span> P${t.priority}</div><div><span class="label">预估:</span> ${t.estimated_hours}h</div><div><span class="label">执行者:</span> ${t.assigned_to || '未分配'}</div><div><span class="label">进度:</span> ${t.progress || 0}%</div><div><span class="label">父需求:</span> ${t.parent_id || '无'}</div></div>
      ${t.status === 'in_progress' ? `<div class="progress-bar" style="margin-top:8px"><div class="progress-fill" style="width:${t.progress || 0}%"></div></div>` : ''}
      <h3>📝 任务描述</h3>
      <div class="md-content">${renderMarkdown(t.description || '无详细描述')}</div>
      ${Object.keys(skills).length ? `<h3>🎯 技能</h3><div class="skills">${Object.entries(skills).map(([k, v]) => `<span class="skill-tag">${k}:${v}</span>`).join('')}</div>` : ''}
      <h3>📝 日志</h3><div>${log.length ? log.map(l => `<div class="log-entry">${new Date(l.time).toLocaleString('zh-CN')} — ${l.action}: ${escHtml(l.note || '')}</div>`).join('') : '<div class="empty">暂无</div>'}</div>
      ${subs.length ? `<h3>📦 提交</h3>${subs.map(s => `<div class="log-entry">${fmtDate(s.submittedAt)} — ${s.submittedBy}: ${escHtml(s.notes || '')}</div>`).join('')}` : ''}
      ${revs.length ? `<h3>👁 审核</h3>${revs.map(r => `<div class="log-entry">${fmtDate(r.reviewedAt)} — ${r.verdict === 'approved' ? '✅' : '❌'} ${escHtml(r.feedback || '')}</div>`).join('')}` : ''}
      <div style="margin-top:16px;display:flex;gap:8px">
        ${t.status === 'backlog' ? `<button class="btn-accept" onclick="claimTask('${t.id}')">认领</button>` : ''}
        ${t.status === 'in_progress' ? `<button class="btn-primary" onclick="updateTaskProgress('${t.id}')">更新进度</button><button class="btn-accept" onclick="submitTask('${t.id}')">提交审核</button>` : ''}
        ${t.status === 'review' ? `<button class="btn-accept" onclick="reviewTask('${t.id}','approved')">通过</button><button class="btn-reject" onclick="reviewTask('${t.id}','rejected')">驳回</button>` : ''}
        <button class="btn-small btn-reject" style="margin-left:auto" onclick="deleteTask('${t.id}')">🗑 删除</button>
      </div>`;
  } catch (e) { toast('加载失败: ' + e.message, 'error'); }
}

// ===== 任务操作 =====
async function claimTask(tid) { const a = prompt('智能体ID:', 'agent-scholar-001'); if (!a) return; try { await Tasks.claim(tid, a); toast('已认领 ✅', 'success'); refreshKanban(); } catch (e) { toast('失败: ' + e.message, 'error'); } }
async function submitTask(tid) { const n = prompt('提交说明:') || '完成'; try { await Tasks.submit(tid, 'agent-scholar-001', [], n); toast('已提交', 'success'); refreshKanban(); } catch (e) { toast('失败: ' + e.message, 'error'); } }
async function reviewTask(tid, verdict) { const fb = verdict === 'rejected' ? prompt('驳回原因:') || '需修改' : '通过'; try { await Tasks.review(tid, verdict, fb); toast(verdict === 'approved' ? '通过 ✅' : '驳回 ↩', 'success'); refreshKanban(); } catch (e) { toast('失败: ' + e.message, 'error'); } }
async function updateTaskProgress(tid) { const p = prompt('进度(0-100):', '50'); if (p === null) return; try { await Tasks.progress(tid, parseInt(p)); toast('已更新', 'success'); openTask(tid); refreshKanban(); } catch (e) { toast('失败: ' + e.message, 'error'); } }

async function deleteTask(id) {
  if (!confirm('确认删除此任务？')) return;
  try { await api('DELETE', `/tasks/${id}`); toast('任务已删除', 'success'); showWorkspaceView('kanban'); refreshKanban(); }
  catch (e) { toast('删除失败: ' + e.message, 'error'); }
}
