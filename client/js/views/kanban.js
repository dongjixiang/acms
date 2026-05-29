// 任务看板视图 — 五列 Kanban + 任务详情 + 操作
// 依赖: core/state.js, core/utils.js, js/api.js

let _kanbanFilterLoaded = false;

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
  let agentOpts = '<option value="">选择智能体</option>';
  try {
    const r = await fetch('/api/agents', { headers: { 'X-API-Key': 'dev-key-001' } });
    (await r.json()).forEach(a => { agentOpts += '<option value="' + a.id + '">' + (a.name || a.id) + '</option>'; });
  } catch(e) {}
  if (!_kanbanFilterLoaded) { await loadKanbanReqFilter(); _kanbanFilterLoaded = true; }
  try {
    const board = await Tasks.board(App.currentProjectId, filterVal || undefined);
    for (const col of ['backlog', 'in_progress', 'review', 'done', 'archived']) {
      const tasks = board[col] || [];
      document.getElementById('count-' + col).textContent = tasks.length;
      document.getElementById('col-' + col).innerHTML = tasks.map(t => {
        const blocked = t.blocked === 1 || t.blocked === '1' || t.blocked === true;
        const blockedClass = blocked ? ' task-blocked' : '';
        const bugClass = t.type === 'bug' ? ' bug-card' : '';
        // Bug 卡片额外显示关联任务信息
        const bugMeta = t.type === 'bug' && t.source_task_id
          ? '<div style="font-size:10px;color:var(--accent3);margin-top:2px">关联: ' + escHtml(t.source_task_id) + '</div>'
          : '';
        return `<div class="task-card priority-${t.priority || 3}${blockedClass}${bugClass}" onclick="openTask('${t.id}')">
          <div class="task-title">${blocked ? '🔒 ' : ''}${escHtml(t.title)}</div>
          ${bugMeta}
          <div class="task-meta"><span>${t.id}</span><span class="type-tag type-${t.type}">${App.typeLabels[t.type] || ''} ${t.type}</span><span>P${t.priority}</span>${t.assigned_to ? '<span>Agent: ' + escHtml(t.assigned_to) + '</span>' : ''}${t.status === 'in_progress' ? '<span>' + (t.progress || 0) + '%</span>' : ''}</div>
          ${t.status === 'in_progress' ? '<div class="progress-bar"><div class="progress-fill" style="width:' + (t.progress || 0) + '%"></div></div>' : ''}
          ${blocked && t.status === 'backlog' ? '<div class="task-actions"><span style="font-size:11px;color:var(--accent3)">⏳ ' + escHtml(t.block_reason || '等待依赖') + '</span></div>' : ''}
          ${!blocked && t.status === 'backlog' ? '<div class="task-actions" style="display:flex;gap:6px;align-items:center"><select value="' + (t.assigned_to||'') + '" onclick="event.stopPropagation()" onchange="event.stopPropagation();assignTaskCard(\'' + t.id + '\',this.value)" style="font-size:11px;padding:2px 4px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:3px;max-width:130px">' + agentOpts + '</select><button class="btn-small btn-accept" onclick="event.stopPropagation();claimTask(\'' + t.id + '\')">认领</button></div>' : ''}
          ${t.status === 'in_progress' ? '<div class="task-actions"><button class="btn-small btn-accept" onclick="event.stopPropagation();submitTask(\'' + t.id + '\')">提交</button></div>' : ''}
          ${t.status === 'review' ? '<div class="task-actions"><button class="btn-small btn-accept" onclick="event.stopPropagation();reviewTask(\'' + t.id + '\',\'approved\')">通过</button><button class="btn-small btn-reject" onclick="event.stopPropagation();reviewTask(\'' + t.id + '\',\'rejected\')">驳回</button></div>' : ''}
        </div>`;
      }).join('') || '<div class="empty" style="padding:12px">-</div>';
    }
  } catch (e) { toast('加载看板失败: ' + e.message, 'error'); }
}

// ===== 任务详情 =====
async function openTask(taskId) {
  showWorkspaceView('task-detail');
  try {
    var t = await Tasks.get(taskId);
    document.getElementById('task-detail-title').textContent = (t.id || '') + ': ' + escHtml(t.title || '');
    document.getElementById('task-detail-status').innerHTML =
      '<span class="status-badge badge-' + (t.status === 'in_progress' ? 'in_execution' : t.status === 'done' ? 'done' : 'clarifying') + '">' + (t.status || '') + '</span>' +
      '<button class="btn-small" style="background:rgba(78,205,196,0.15);color:var(--green);border-color:rgba(78,205,196,0.3)" onclick="exportTask(\'' + t.id + '\')">📥 导出描述</button>';
    var skills = safeParse(t.required_skills), log = safeParse(t.execution_log), subs = safeParse(t.submissions), revs = safeParse(t.reviews);

    // Bug 额外信息
    var bugInfo = '';
    if (t.type === 'bug') {
      var sevColor = t.bug_severity === 'critical' ? '#ff4444' : t.bug_severity === 'major' ? '#ff8c44' : t.bug_severity === 'minor' ? '#ffd93d' : '#9090a0';
      bugInfo = '<div class="detail-grid" style="margin-bottom:12px;padding:10px;background:rgba(255,100,100,0.06);border-radius:6px;border:1px solid rgba(255,100,100,0.15)">' +
        '<div><span class="label">严重级:</span> <span style="color:' + sevColor + ';font-weight:bold">' + (t.bug_severity || 'major') + '</span></div>' +
        '<div><span class="label">来源:</span> ' + (t.bug_source || 'manual') + '</div>' +
        (t.source_task_id ? '<div><span class="label">关联任务:</span> ' + escHtml(t.source_task_id) + '</div>' : '') +
        '</div>';
    }

    document.getElementById('task-detail-content').innerHTML = bugInfo +
      '<div class="detail-grid">' +
        '<div><span class="label">类型:</span> ' + (App.typeLabels[t.type] || '') + ' ' + (t.type || '') + '</div>' +
        '<div><span class="label">优先级:</span> P' + (t.priority || '-') + '</div>' +
        '<div><span class="label">预估:</span> ' + (t.estimated_hours || 0) + 'h</div>' +
        '<div><span class="label">执行者:</span>' +
          '<select id="assign-agent-' + t.id + '" onchange="assignTask(\'' + t.id + '\', this.value)" style="font-size:12px;padding:2px 4px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:3px;max-width:160px">' +
            '<option value="">' + (t.assigned_to || '未分配') + '</option>' +
          '</select>' +
        '</div>' +
        '<div><span class="label">进度:</span> ' + (t.progress || 0) + '%</div>' +
        '<div><span class="label">父需求:</span> ' + (t.parent_id || '无') + '</div>' +
      '</div>' +
      (t.status === 'in_progress' ? '<div class="progress-bar" style="margin-top:8px"><div class="progress-fill" style="width:' + (t.progress || 0) + '%"></div></div>' : '') +
      '<h3>📝 任务描述</h3>' +
      '<div class="md-content">' + renderMarkdown(t.description || '无详细描述') + '</div>' +
      (Object.keys(skills).length ? '<h3>🎯 技能</h3><div class="skills">' + Object.entries(skills).map(function(e) { return '<span class="skill-tag">' + e[0] + ':' + e[1] + '</span>'; }).join('') + '</div>' : '') +
      '<h3>📝 日志</h3><div>' + (log.length ? log.map(function(l) { return '<div class="log-entry">' + new Date(l.time).toLocaleString('zh-CN') + ' — ' + l.action + ': ' + escHtml(l.note || '') + '</div>'; }).join('') : '<div class="empty">暂无</div>') + '</div>' +
      (subs.length ? '<h3>📦 提交</h3>' + subs.map(function(s) { return '<div class="log-entry">' + fmtDate(s.submittedAt) + ' — ' + (s.submittedBy || '') + ': ' + escHtml(s.notes || '') + '</div>'; }).join('') : '') +
      (revs.length ? '<h3>👁 审核</h3>' + revs.map(function(r) { return '<div class="log-entry">' + fmtDate(r.reviewedAt) + ' — ' + (r.verdict === 'approved' ? '✅' : '❌') + ' ' + escHtml(r.feedback || '') + '</div>'; }).join('') : '') +
      '<div style="margin-top:16px;display:flex;gap:8px">' +
        (t.status === 'backlog' ? '<button class="btn-accept" onclick="claimTask(\'' + t.id + '\')">认领</button>' : '') +
        (t.status === 'in_progress' ? '<button class="btn-primary" onclick="updateTaskProgress(\'' + t.id + '\')">更新进度</button><button class="btn-accept" onclick="submitTask(\'' + t.id + '\')">提交审核</button>' : '') +
        (t.status === 'review' ? '<button class="btn-accept" onclick="reviewTask(\'' + t.id + '\',\'approved\')">通过</button><button class="btn-reject" onclick="reviewTask(\'' + t.id + '\',\'rejected\')">驳回</button>' : '') +
        '<button class="btn-small btn-reject" style="margin-left:auto" onclick="deleteTask(\'' + t.id + '\')">🗑 删除</button>' +
      '</div>';
  } catch (e) { toast('加载失败: ' + e.message, 'error'); }
  setTimeout(function() { loadAgentList(taskId); }, 100);
}

// ===== 任务操作 =====
var _agentCache = null;
async function loadAgentList(taskId) {
  try {
    var resp = await fetch('/api/agents', { headers: { 'X-API-Key': 'dev-key-001' } });
    _agentCache = await resp.json();
    var sel = document.getElementById('assign-agent-' + taskId);
    if (!sel) return;
    sel.innerHTML = '<option value="">' + (sel.querySelector('option')?.textContent || '选择智能体') + '</option>';
    _agentCache.forEach(function(a) {
      sel.innerHTML += '<option value="' + a.id + '">' + (a.name || a.id) + '</option>';
    });
  } catch(e) {}
}
async function assignTask(taskId, agentId) {
  if (!agentId) return;
  try {
    await Tasks.claim(taskId, agentId);
    toast('已分配给 ' + agentId + ' ✅', 'success');
    refreshKanban(); openTask(taskId);
  } catch(e) { toast('分配失败: ' + e.message, 'error'); }
}

async function assignTaskCard(taskId, agentId) {
  if (!agentId) return;
  try {
    await Tasks.claim(taskId, agentId);
    toast('已分配给 ' + agentId + ' ✅', 'success');
    refreshKanban();
  } catch(e) { toast('分配失败: ' + e.message, 'error'); }
}

async function claimTask(tid) { var a = prompt('智能体ID:', 'agent-scholar-001'); if (!a) return; try { await Tasks.claim(tid, a); toast('已认领 ✅', 'success'); refreshKanban(); } catch (e) { toast('失败: ' + e.message, 'error'); } }
async function submitTask(tid) { var n = prompt('提交说明:') || '完成'; try { await Tasks.submit(tid, 'agent-scholar-001', [], n); toast('已提交', 'success'); refreshKanban(); } catch (e) { toast('失败: ' + e.message, 'error'); } }
async function reviewTask(tid, verdict) { try { await Tasks.review(tid, verdict); toast(verdict === 'approved' ? '已通过 ✅' : '已驳回', 'success'); refreshKanban(); } catch (e) { toast('失败: ' + e.message, 'error'); } }
async function updateTaskProgress(tid) { var p = prompt('进度 (0-100):', '50'); if (!p) return; try { await api('POST', '/tasks/' + tid + '/progress', { progress: parseInt(p), note: '手动更新' }); toast('进度已更新', 'success'); refreshKanban(); } catch (e) { toast('失败: ' + e.message, 'error'); } }
async function deleteTask(tid) { if (!confirm('确认删除此任务？')) return; try { await api('DELETE', '/tasks/' + tid); toast('已删除', 'success'); refreshKanban(); } catch (e) { toast('失败: ' + e.message, 'error'); } }

async function exportTask(tid) {
  try {
    var res = await fetch('/api/exports/task/' + tid, { headers: { 'X-API-Key': 'dev-key-001' } });
    if (!res.ok) throw new Error('导出失败');
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = tid + '.docx';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url); toast('文档已下载 ✅', 'success');
  } catch (e) { toast('导出失败: ' + e.message, 'error'); }
}
