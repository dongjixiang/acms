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

// 多模态生成任务 — 渲染媒体预览
function renderGenPreview(t) {
  try {
    const subs = safeParse(t.submissions);
    if (!subs || !subs.length) return '';
    const lastSub = subs[subs.length - 1];
    if (!lastSub || !lastSub.files) return '';

    const assetPath = lastSub.files[0];
    if (!assetPath) return '';

    // 从 assetPath 推断 MIME（格式: assets/2026-06-07/filename.png）
    const ext = (assetPath.split('.').pop() || '').toLowerCase();
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
    const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'flac'];
    const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];

    const projId = t.project_id;
    const assetUrl = `/api/generate/assets/${projId}/${assetPath}`;

    if (imageExts.includes(ext)) {
      return `<h3>🎨 生成结果</h3>
        <div style="margin:8px 0;text-align:center">
          <img src="${assetUrl}" style="max-width:500px;max-height:400px;border-radius:8px;border:1px solid var(--border);box-shadow:0 2px 8px rgba(0,0,0,0.15)" alt="生成图片" onclick="window.open('${assetUrl}','_blank')">
          <div style="font-size:11px;color:var(--text2);margin-top:4px">点击放大 | ${escHtml(assetPath)}</div>
        </div>`;
    }

    if (audioExts.includes(ext)) {
      return `<h3>🔊 生成结果</h3>
        <div style="margin:8px 0;padding:12px;background:var(--bg2);border-radius:8px;text-align:center">
          <audio controls style="width:100%;max-width:400px">
            <source src="${assetUrl}" type="audio/${ext === 'mp3' ? 'mpeg' : ext}">
            您的浏览器不支持音频播放
          </audio>
          <div style="font-size:11px;color:var(--text2);margin-top:4px">${escHtml(assetPath)}</div>
        </div>`;
    }

    if (videoExts.includes(ext)) {
      return `<h3>🎬 生成结果</h3>
        <div style="margin:8px 0;padding:8px;background:var(--bg2);border-radius:8px;text-align:center">
          <video controls style="max-width:480px;max-height:360px;border-radius:6px;border:1px solid var(--border)" preload="metadata">
            <source src="${assetUrl}">
            您的浏览器不支持视频播放
          </video>
          <div style="font-size:11px;color:var(--text2);margin-top:4px">${escHtml(assetPath)}</div>
        </div>`;
    }

    return `<div style="font-size:12px;padding:8px;background:var(--bg2);border-radius:6px">
      📎 交付物: <a href="${assetUrl}" target="_blank">${escHtml(assetPath)}</a></div>`;
  } catch (e) {
    return '';
  }
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
    // v0.X fix: 加 failed 列 — 之前失败任务被静默丢失，现在后端返回 failed 桶
    for (const col of ['backlog', 'in_progress', 'review', 'done', 'archived', 'failed']) {
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
          ${t.status === 'failed' ? '<div class="task-actions" style="display:flex;gap:6px"><button class="btn-small btn-accept" onclick="event.stopPropagation();reactivateTask(\'' + t.id + '\')" title="把失败任务拉回 backlog 重跑">↻ 重激活</button><button class="btn-small btn-reject" onclick="event.stopPropagation();archiveTask(\'' + t.id + '\')" title="放弃这个失败任务">归档</button></div>' : ''}
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
      '<h3>📝 日志</h3><div>' + (log.length ? log.map(function(l) { return '<div class="log-entry">' + new Date(l.time).toLocaleString('zh-CN', {hour12:false}) + ' — ' + l.action + ': ' + escHtml(l.note || '') + '</div>'; }).join('') : '<div class="empty">暂无</div>') + '</div>' +
      (subs.length ? '<h3>📦 提交</h3>' + subs.map(function(s) { return '<div class="log-entry">' + fmtDate(s.submittedAt) + ' — ' + (s.submittedBy || '') + ': ' + escHtml(s.notes || '') + '</div>'; }).join('') : '') +
      // 生成任务展示媒体预览
      ((t.type === 'image-gen' || t.type === 'audio-gen') && t.status === 'done' ? renderGenPreview(t) : '') +
      (revs.length ? '<h3>👁 审核</h3>' + revs.map(function(r) { return '<div class="log-entry">' + fmtDate(r.reviewedAt) + ' — ' + (r.verdict === 'approved' ? '✅' : '❌') + ' ' + escHtml(r.feedback || '') + '</div>'; }).join('') : '') +
      (t.review_status ? '<div class="review-status ' + t.review_status + '">' +
        (t.review_status === 'reviewing' ? '🤖 审核中…' : t.review_status === 'approved' ? '✅ 自动审核通过' : t.review_status === 'rejected' ? '❌ 自动审核驳回' : '⚠️ ' + escHtml(t.review_status)) +
      '</div>' : '') +
      '<div style="margin-top:16px;display:flex;gap:8px">' +
        (t.status === 'backlog' ? '<button class="btn-accept" onclick="claimTask(\'' + t.id + '\')">认领</button>' : '') +
        (t.status === 'in_progress' ? '<button class="btn-primary" onclick="updateTaskProgress(\'' + t.id + '\')">更新进度</button><button class="btn-accept" onclick="submitTask(\'' + t.id + '\', ' + (t.auto_review ? 'true' : 'false') + ')">提交审核</button>' : '') +
        (t.status === 'review' ? '<button class="btn-accept" onclick="reviewTask(\'' + t.id + '\',\'approved\')">通过</button><button class="btn-reject" onclick="reviewTask(\'' + t.id + '\',\'rejected\')">驳回</button>' : '') +
        // v0.X fix: failed 任务详情也提供操作按钮
        (t.status === 'failed' ? '<button class="btn-accept" onclick="reactivateTask(\'' + t.id + '\')">↻ 重激活（拉回 backlog）</button><button class="btn-reject" onclick="archiveTask(\'' + t.id + '\')">📦 归档放弃</button>' : '') +
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
// v0.X fix: failed 任务操作 — 重激活（failed → backlog 重跑）/ 归档（failed → archived）
async function reactivateTask(tid) { if (!(await showConfirm('确认把此失败任务拉回 backlog 重跑？依赖它的任务会自动解锁。'))) return; try { await api('POST', '/tasks/' + tid + '/transition', { targetStatus: 'backlog' }); toast('已重新激活 ✅', 'success'); refreshKanban(); } catch (e) { toast('失败: ' + e.message, 'error'); } }
async function archiveTask(tid) { if (!(await showConfirm('确认归档此失败任务？将不再出现在看板上。'))) return; try { await api('POST', '/tasks/' + tid + '/transition', { targetStatus: 'archived' }); toast('已归档', 'success'); refreshKanban(); } catch (e) { toast('失败: ' + e.message, 'error'); } }
async function toggleAutoReview(tid, enabled) { try { await api('PATCH', '/tasks/' + tid + '/auto-review', { enabled: enabled }); toast(enabled ? '🤖 自动审核已开启' : '自动审核已关闭', 'success'); } catch (e) { toast('切换失败: ' + e.message, 'error'); } }
async function updateTaskProgress(tid) { var p = prompt('进度 (0-100):', '50'); if (!p) return; try { await api('POST', '/tasks/' + tid + '/progress', { progress: parseInt(p), note: '手动更新' }); toast('进度已更新', 'success'); refreshKanban(); } catch (e) { toast('失败: ' + e.message, 'error'); } }
async function deleteTask(tid) { if (!(await showConfirm('确认删除此任务？'))) return; try { await api('DELETE', '/tasks/' + tid); toast('已删除', 'success'); refreshKanban(); } catch (e) { toast('失败: ' + e.message, 'error'); } }

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

// ═══════════════════════════════════════
// 全局自动审核 — 面板级轮询 review 列
// ═══════════════════════════════════════
let _autoReviewTimer = null;
let _autoReviewBusy = false;

function toggleGlobalAutoReview(enabled) {
  if (enabled) {
    if (_autoReviewTimer) return;
    toast('🤖 Reviewer Agent 已启动，正在扫描待审核任务…', 'info');
    _autoReviewTimer = setInterval(autoReviewPoll, 5000);
    autoReviewPoll(); // 立即执行一次
  } else {
    clearInterval(_autoReviewTimer);
    _autoReviewTimer = null;
    toast('自动审核已停止', 'info');
  }
}

async function autoReviewPoll() {
  if (_autoReviewBusy) return;
  _autoReviewBusy = true;
  try {
    // 获取 review 列所有待审任务
    var resp = await fetch('/api/tasks?status=review&limit=20', { headers: { 'X-API-Key': 'dev-key-001' } });
    var tasks = await resp.json();
    if (!Array.isArray(tasks) || tasks.length === 0) { _autoReviewBusy = false; return; }

    for (var t of tasks) {
      // 跳过已由 Reviewer Agent 审核过的（避免重复）
      var revs = safeParse(t.reviews);
      if (Array.isArray(revs) && revs.some(function(r) { return r.reviewedBy === 'agent-reviewer-001'; })) continue;
      // 跳过 Reviewer 自己执行的任务（SELF_REVIEW_FORBIDDEN）
      if (t.assigned_to === 'agent-reviewer-001') continue;

      try {
        var result = await api('POST', '/tasks/' + t.id + '/review', {
          verdict: 'approved',
          reviewedBy: 'agent-reviewer-001',
          autoReview: true
        });
        var verdict = result.reviewReport ? result.reviewReport.verdict : (result.verdict || 'approved');
        console.log('🤖 Auto-reviewed', t.id, '→', verdict);
      } catch(e) {
        console.warn('Auto-review failed for', t.id, ':', e.message);
      }
    }
    refreshKanban();
  } catch(e) { /* */ }
  _autoReviewBusy = false;
}
