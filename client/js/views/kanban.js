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
        return `<div class="task-card priority-${t.priority || 3}${blockedClass}${bugClass}" data-task-id="${t.id}" onclick="openTask('${t.id}')">
          <div class="task-title">${blocked ? '🔒 ' : ''}${escHtml(t.title)}</div>
          ${bugMeta}
          <div class="task-meta"><span>${t.id}</span><span class="type-tag type-${t.type}">${App.typeLabels[t.type] || ''} ${t.type}</span><span>P${t.priority}</span>${t.assigned_to ? '<span>Agent: ' + escHtml(t.assigned_to) + '</span>' : ''}${t.status === 'in_progress' ? '<span>' + (t.progress || 0) + '%</span>' : ''}</div>
          ${t.status === 'in_progress' ? '<div class="progress-bar"><div class="progress-fill" style="width:' + (t.progress || 0) + '%"></div></div>' : ''}
          ${blocked && t.status === 'backlog' ? '<div class="task-actions"><span style="font-size:11px;color:var(--accent3)">⏳ ' + escHtml(t.block_reason || '等待依赖') + '</span></div>' : ''}
          ${!blocked && t.status === 'backlog' ? '<div class="task-actions" style="display:flex;gap:6px;align-items:center"><select value="' + (t.assigned_to||'') + '" onclick="event.stopPropagation()" onchange="event.stopPropagation();assignTaskCard(\'' + t.id + '\',this.value)" style="font-size:11px;padding:2px 4px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:3px;max-width:130px">' + agentOpts + '</select><button class="btn-small btn-accept" onclick="event.stopPropagation();claimTask(\'' + t.id + '\')">认领</button></div>' : ''}
          ${t.status === 'in_progress' ? '<div class="task-actions"><button class="btn-small btn-accept" onclick="event.stopPropagation();submitTask(\'' + t.id + '\')">提交</button></div>' : ''}
          ${t.status === 'in_progress' ? '<div class="task-progress-mini" style="margin-top:4px;font-size:10px;color:var(--accent);cursor:pointer" onmouseenter="showProgressTooltip(\'' + t.id + '\', this.closest(\'.task-card\'))" onmouseleave="window._kanbanTipCardLeaveTimer = setTimeout(hideProgressTooltip, 300)">' + (t.progress_note ? escHtml(t.progress_note).slice(0, 40) : '') + ' ' + (t.progress || 0) + '%</div>' : ''}
          ${t.status === 'review' ? '<div class="task-actions"><button class="btn-small btn-accept" onclick="event.stopPropagation();reviewTask(\'' + t.id + '\',\'approved\')">通过</button><button class="btn-small btn-reject" onclick="event.stopPropagation();reviewTask(\'' + t.id + '\',\'rejected\')">驳回</button></div>' : ''}
          ${t.status === 'failed' ? '<div class="task-actions" style="display:flex;gap:6px"><button class="btn-small btn-accept" onclick="event.stopPropagation();reactivateTask(\'' + t.id + '\')" title="把失败任务拉回 backlog 重跑">↻ 重激活</button><button class="btn-small btn-reject" onclick="event.stopPropagation();archiveTask(\'' + t.id + '\')" title="放弃这个失败任务">归档</button></div>' : ''}
        </div>`;
      }).join('') || '<div class="empty" style="padding:12px">-</div>';
    }
    // v0.35: 初始化拖拽支持
    initKanbanDragDrop();
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

    document.getElementById('task-detail-content').innerHTML = '<div id="task-detail-progress-container"></div>' + bugInfo +
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
      // v0.46 Plan mode: 显示 plan 区块（如果存在）
      renderPlanSection(t) +
      (Object.keys(skills).length ? '<h3>🎯 技能</h3><div class="skills">' + Object.entries(skills).map(function(e) { return '<span class="skill-tag">' + e[0] + ':' + e[1] + '</span>'; }).join('') + '</div>' : '') +
      // v0.42: in_progress 状态下隐藏这个"📝 日志"section — 进度窗口下边已经实时展示
      (t.status === 'in_progress' ? '' : '<h3>📝 日志</h3><div>' + (log.length ? log.map(function(l) { return '<div class="log-entry">' + new Date(l.time).toLocaleString('zh-CN', {hour12:false}) + ' — ' + l.action + ': ' + escHtml(l.note || '') + '</div>'; }).join('') : '<div class="empty">暂无</div>') + '</div>') +
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
  // v0.35: 如果任务正在执行，启动进度查看器
  if (t.status === 'in_progress') {
    // v0.37 fix: 用 task.last_progress_update（agent 最近一次更新）作为计时起点
    //   之前 fallback 到 updated_at；最差情况用 Date.now()
    //   这样详情页时间显示"agent 已跑 X 秒"，而不是"刚开页面 3s"
    const startedTs = t.last_progress_update ? new Date(t.last_progress_update).getTime()
                     : t.updated_at ? new Date(t.updated_at).getTime()
                     : Date.now();
    startProgressViewer(taskId, startedTs);
  }
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

async function claimTask(tid) { var a = prompt('智能体ID:', 'agent-scholar-001'); if (!a) return; try { await Tasks.claim(tid, a); toast('已认领 ✅', 'success'); refreshKanban(); openTask(tid); } catch (e) { toast('失败: ' + e.message, 'error'); } }
async function submitTask(tid) { var n = prompt('提交说明:') || '完成'; try { await Tasks.submit(tid, 'agent-scholar-001', [], n); toast('已提交', 'success'); refreshKanban(); } catch (e) { toast('失败: ' + e.message, 'error'); } }
async function reviewTask(tid, verdict) { try { await Tasks.review(tid, verdict); toast(verdict === 'approved' ? '已通过 ✅' : '已驳回', 'success'); refreshKanban(); } catch (e) { toast('失败: ' + e.message, 'error'); } }
// v0.35: Kanban 悬浮进度提示框 — hover 卡片进度区域显示实时终端风格日志
let _progressTooltip = null;
let _progressTooltipSSE = null;
let _progressTooltipPollTimer = null;

function showProgressTooltip(taskId, cardEl) {
  // 如果已有悬浮窗，先清除
  hideProgressTooltip();
  
  // 创建悬浮窗
  _progressTooltip = document.createElement('div');
  _progressTooltip.className = 'progress-tooltip';
  _progressTooltip.style.cssText = `
    position: fixed;
    z-index: 9999;
    width: 420px;
    max-height: 480px;
    overflow: hidden;
    background: rgba(10, 10, 20, 0.97);
    border: 1px solid rgba(78, 205, 196, 0.3);
    border-radius: 8px;
    font-family: 'Courier New', 'Menlo', monospace;
    font-size: 12px;
    line-height: 1.6;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    pointer-events: auto;
    backdrop-filter: blur(8px);
    display: flex;
    flex-direction: column;
  `;
  
  // 顶部栏：任务 ID + 状态
  const header = document.createElement('div');
  header.style.cssText = 'padding:8px 12px;background:rgba(78,205,196,0.1);border-bottom:1px solid rgba(78,205,196,0.2);flex-shrink:0';
  header.innerHTML = `
    <span style="color:#4ecdc4;font-weight:bold">▸</span>
    <span style="color:#ccc">${escHtml(taskId)}</span>
    <span id="tooltip-status" style="float:right;color:#888">执行中...</span>
  `;
  _progressTooltip.appendChild(header);
  
  // 日志区域
  const logArea = document.createElement('div');
  logArea.style.cssText = 'padding:8px 12px;overflow-y:auto;flex:1;color:#aaa';
  logArea.id = 'tooltip-log-area';
  _progressTooltip.appendChild(logArea);
  
  document.body.appendChild(_progressTooltip);
  
  // 定位
  const rect = cardEl.getBoundingClientRect();
  let left = rect.right + 8;
  let top = rect.top;
  if (left + 420 > window.innerWidth) {
    left = rect.left - 428;
  }
  if (top + 480 > window.innerHeight) {
    top = window.innerHeight - 488;
  }
  _progressTooltip.style.left = left + 'px';
  _progressTooltip.style.top = Math.max(8, top) + 'px';
  
  // 初始日志条目
  _appendLog(logArea, '> 任务已启动，等待执行...', '#666');
  
  // SSE 连接
  try {
    _progressTooltipSSE = new EventSource(`/api/tasks/${taskId}/progress/stream?api_key=dev-key-001`);
    
    _progressTooltipSSE.addEventListener('connected', (e) => {
      const data = JSON.parse(e.data);
      setStatus(data.status, data.note);
      _appendLog(logArea, '> 连接已建立', '#4ecdc4');
    });
    
    _progressTooltipSSE.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      setStatus(data.status, data.note);
      // v0.37 fix: progress 事件也写日志区，否则 hover tooltip 永远只有"任务已启动"+"连接已建立"两条
      // server 端 SSE 只在 progress 数字变化时推 progress 事件（prevProgress !== currentProgress），频率可控
      _appendLog(logArea, `> 进度 ${data.progress}%${data.note ? ' — ' + escHtml(data.note) : ''}`, '#4ecdc4');
    });
    
    _progressTooltipSSE.addEventListener('log', (e) => {
      const data = JSON.parse(e.data);
      if (data.entry) {
        // v0.42: 复用 formatLogEntry helper，跟详情页一致的小图标分类
        _appendLog(logArea, formatLogEntry(data.entry), '#ccc');
      }
    });
    
    _progressTooltipSSE.addEventListener('done', (e) => {
      setStatus('done', '✅ 执行完成');
      _appendLog(logArea, '> 任务完成', '#4ecdc4');
      setTimeout(hideProgressTooltip, 5000);
    });
    
    _progressTooltipSSE.addEventListener('failed', (e) => {
      const data = JSON.parse(e.data);
      setStatus('failed', '❌ ' + (data.notes || '执行失败'));
      _appendLog(logArea, '> 任务失败: ' + (data.notes || '未知错误'), '#ff4444');
    });
    
    _progressTooltipSSE.addEventListener('timeout', (e) => {
      setStatus('timeout', '⏱ 超时');
      _appendLog(logArea, '> 执行超时', '#ffaa00');
    });
    
    _progressTooltipSSE.addEventListener('error', () => {
      // SSE 断连，回退到轮询
      if (_progressTooltipSSE) {
        _progressTooltipSSE.close();
        _progressTooltipSSE = null;
      }
      _appendLog(logArea, '> SSE 断连，切换到轮询模式', '#ffaa00');
      
      // 轮询
      _progressTooltipPollTimer = setInterval(async () => {
        try {
          const task = await Tasks.get(taskId);
          if (task.status === 'done') {
            setStatus('done', '✅ 执行完成');
            _appendLog(logArea, '> 任务完成', '#4ecdc4');
            hideProgressTooltip();
            return;
          }
          if (task.status === 'failed') {
            setStatus('failed', '❌ 失败');
            _appendLog(logArea, '> 任务失败', '#ff4444');
            return;
          }
          if (task.progress_note) {
            setStatus(task.status, task.progress_note);
            const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
            _appendLog(logArea, `${time} [更新] ${escHtml(task.progress_note)}`, '#888');
          }
        } catch (e) { /* silent */ }
      }, 3000);
    });
  } catch (e) {
    _appendLog(logArea, '> 连接失败: ' + e.message, '#ff4444');
  }
  
  // 鼠标移出 2s 后关闭
  let leaveTimeout = null;
  _progressTooltip.addEventListener('mouseleave', () => {
    leaveTimeout = setTimeout(hideProgressTooltip, 2000);
  });
  _progressTooltip.addEventListener('mouseenter', () => {
    if (leaveTimeout) { clearTimeout(leaveTimeout); leaveTimeout = null; }
    // v0.40 fix: 鼠标进入 tooltip 时同时 clear progress-mini 的延迟 hide timer
    //   之前 progress-mini 的 onmouseleave 立即触发 hideProgressTooltip，鼠标快速移到 tooltip 时 tooltip 立即被销毁
    //   现在 progress-mini 的 leave 加 300ms delay，进入 tooltip 时 clear 这个 timer 让 tooltip 持续显示
    if (window._kanbanTipCardLeaveTimer) { clearTimeout(window._kanbanTipCardLeaveTimer); window._kanbanTipCardLeaveTimer = null; }
  });
}

function setStatus(status, text) {
  const el = document.getElementById('tooltip-status');
  if (!el) return;
  el.textContent = text;
  if (status === 'done') el.style.color = '#4ecdc4';
  else if (status === 'failed') el.style.color = '#ff4444';
  else el.style.color = '#888';
}

function _appendLog(logArea, text, color) {
  const line = document.createElement('div');
  line.style.cssText = 'padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.03)';
  line.style.color = color || '#aaa';
  line.textContent = text;
  logArea.appendChild(line);
  // 自动滚动到底部
  logArea.scrollTop = logArea.scrollHeight;
  // 最多保留 100 条
  while (logArea.children.length > 100) {
    logArea.removeChild(logArea.firstChild);
  }
}

function hideProgressTooltip() {
  if (_progressTooltip) {
    if (_progressTooltip.parentNode) {
      _progressTooltip.parentNode.removeChild(_progressTooltip);
    }
    _progressTooltip = null;
  }
  if (_progressTooltipSSE) {
    _progressTooltipSSE.close();
    _progressTooltipSSE = null;
  }
  if (_progressTooltipPollTimer) {
    clearInterval(_progressTooltipPollTimer);
    _progressTooltipPollTimer = null;
  }
}
function initKanbanDragDrop() {
  const columns = ['backlog', 'in_progress', 'review', 'done', 'archived', 'failed'];
  // 为每个泳道列添加 drop 区域
  for (const col of columns) {
    const colEl = document.getElementById('col-' + col);
    if (!colEl) continue;
    colEl.setAttribute('draggable', 'false');
    colEl.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      colEl.style.outline = '2px dashed var(--accent)';
      colEl.style.outlineOffset = '-2px';
    });
    colEl.addEventListener('dragleave', function(e) {
      colEl.style.outline = '';
      colEl.style.outlineOffset = '';
    });
    colEl.addEventListener('drop', async function(e) {
      e.preventDefault();
      colEl.style.outline = '';
      colEl.style.outlineOffset = '';
      const taskId = e.dataTransfer.getData('text/plain');
      if (!taskId) return;
      try {
        await api('POST', '/tasks/' + taskId + '/drag-drop', { targetStatus: col });
        toast('任务已移入 ' + col + ' ✅', 'success');
        refreshKanban();
      } catch(err) {
        toast('拖拽失败: ' + err.message, 'error');
      }
    });
  }
  // 为每个任务卡片添加 draggable
  const cards = document.querySelectorAll('.task-card');
  cards.forEach(function(card) {
    card.setAttribute('draggable', 'true');
    card.addEventListener('dragstart', function(e) {
      e.dataTransfer.setData('text/plain', card.getAttribute('data-task-id'));
    });
  });
}

// v0.44: 共享的日志条目格式化 — 从 action 提 round，从 note 提 tool 名 + 参数
//   v0.42 版只显示 [轮次]/[读] 等 prefix + emoji，round 数字和具体参数都丢了
//   新格式：17:50:56 R20/90 📖 读: {"path":"src/core/GameState.js"}
//   - 从 action "round_20/90" 提 "R20/90"
//   - 从 note "调用工具: 读取文件 (args)" 提 desc + args
//   - 去掉末尾冗余的 [agent_xxx] tag（prefix 已经用 emoji 表达了）
const TOOL_META = {
  agent_read_file:    { icon: '📖', label: '读' },
  agent_write_file:   { icon: '✏️', label: '写' },
  agent_exec_command: { icon: '⚙️', label: '执行' },
  agent_list_files:   { icon: '🔍', label: '列表' },
  agent_search_files: { icon: '🔎', label: '搜索' },
};

// v0.46 Plan mode: 渲染 plan section（task detail 页面）
function renderPlanSection(task) {
  const plan = task.plan;
  const planStatus = task.plan_status;

  // 1. 有 plan → 显示完整 plan + 状态徽章 + Approve/Reject
  if (plan) {
    const statusBadge = planStatus === 'pending'
      ? '<span style="background:#f59e0b;color:#000;padding:2px 8px;border-radius:3px;font-size:11px">⏳ 待审核</span>'
      : planStatus === 'approved'
        ? '<span style="background:#10b981;color:#fff;padding:2px 8px;border-radius:3px;font-size:11px">✅ 已批准</span>'
        : '<span style="background:#ef4444;color:#fff;padding:2px 8px;border-radius:3px;font-size:11px">❌ 已拒绝</span>';

    const actionButtons = planStatus === 'pending'
      ? '<div style="display:flex;gap:8px;margin-top:12px">' +
          '<button class="btn-accept" onclick="approvePlan(\'' + task.id + '\')" style="background:#10b981">✅ 批准并执行</button>' +
          '<button class="btn-small" onclick="rejectPlan(\'' + task.id + '\')" style="background:rgba(239,68,68,0.15);color:#ef4444;border-color:rgba(239,68,68,0.3)">❌ 拒绝</button>' +
        '</div>'
      : planStatus === 'rejected' && task.status === 'backlog'
        ? '<div style="margin-top:8px;color:#ef4444;font-size:11px">拒绝原因：' + escHtml(plan.rejectedReason || '(未填)') + '</div>' +
          '<div style="margin-top:8px"><button class="btn-small" onclick="generatePlan(\'' + task.id + '\')">🔄 重新生成 Plan</button></div>'
        : '';

    const filesHtml = (plan.files && plan.files.length)
      ? '<ul style="margin:6px 0;padding-left:20px">' + plan.files.map(function(f) {
          return '<li><code>' + escHtml(f.path || '?') + '</code> — ' + escHtml(f.purpose || '') +
            (f.estimatedLines ? ' <span style="color:#888;font-size:11px">(~' + f.estimatedLines + ' 行)</span>' : '') + '</li>';
        }).join('') + '</ul>'
      : '<div style="color:#888;font-size:11px">无文件清单</div>';

    const stepsHtml = (plan.steps && plan.steps.length)
      ? '<ol style="margin:6px 0;padding-left:20px">' + plan.steps.map(function(s) { return '<li>' + escHtml(s) + '</li>'; }).join('') + '</ol>'
      : '<div style="color:#888;font-size:11px">无步骤</div>';

    const risksHtml = (plan.risks && plan.risks.length)
      ? '<ul style="margin:6px 0;padding-left:20px;color:#f59e0b">' + plan.risks.map(function(r) { return '<li>' + escHtml(r) + '</li>'; }).join('') + '</ul>'
      : '<div style="color:#888;font-size:11px">无风险评估</div>';

    return '<h3>📋 实施计划 ' + statusBadge + '</h3>' +
      '<div style="background:rgba(139,92,246,0.06);padding:12px;border-radius:6px;border:1px solid rgba(139,92,246,0.2);margin-bottom:12px">' +
        '<div style="font-weight:bold;margin-bottom:8px">' + escHtml(plan.summary || '') + '</div>' +
        '<div style="font-size:11px;color:#888;margin-bottom:8px">由模型 <code>' + escHtml(plan.model || '?') + '</code> 生成 · ' + new Date(plan.createdAt).toLocaleString('zh-CN', { hour12: false }) + '</div>' +
        '<div style="margin-top:10px"><strong>📁 文件清单 (' + (plan.files || []).length + '):</strong>' + filesHtml + '</div>' +
        '<div style="margin-top:10px"><strong>🪜 执行步骤 (' + (plan.steps || []).length + '):</strong>' + stepsHtml + '</div>' +
        '<div style="margin-top:10px"><strong>⚠️ 风险 (' + (plan.risks || []).length + '):</strong>' + risksHtml + '</div>' +
        actionButtons +
      '</div>';
  }

  // 2. 无 plan 但 task 在 backlog → 显示 Generate Plan 按钮
  if (task.status === 'backlog') {
    return '<h3>📋 实施计划</h3>' +
      '<div style="background:rgba(139,92,246,0.04);padding:12px;border-radius:6px;border:1px dashed rgba(139,92,246,0.25);margin-bottom:12px">' +
        '<div style="color:#888;font-size:12px;margin-bottom:8px">还没生成 plan，先生成一个看 agent 的实施思路，再决定是否执行。</div>' +
        '<button class="btn-small" onclick="generatePlan(\'' + task.id + '\')" style="background:rgba(139,92,246,0.15);color:#8b5cf6;border-color:rgba(139,92,246,0.3)">📋 生成 Plan</button>' +
      '</div>';
  }

  return '';
}

// v0.46 Plan mode: Plan API 调用 helpers
async function generatePlan(taskId) {
  if (!confirm('确定要生成 Plan 吗？会调一次 LLM（约 10-15 秒）。')) return;
  try {
    toast('正在生成 Plan...', 'info', 3000);
    const resp = await fetch('/api/ai-tools/agent-plan/' + taskId, {
      method: 'POST',
      headers: { 'X-API-Key': 'dev-key-001', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await resp.json();
    if (data.success) {
      toast('Plan 生成成功 ✅', 'success');
      openTask(taskId); // 刷新详情页
    } else {
      toast('Plan 生成失败: ' + (data.message || data.error || '未知错误'), 'error', 5000);
    }
  } catch (e) {
    toast('请求失败: ' + e.message, 'error', 5000);
  }
}

async function approvePlan(taskId) {
  if (!confirm('批准 Plan？批准后会立即开始执行 agent（agent 会按 plan 创建/修改文件）。')) return;
  try {
    toast('正在批准并启动 agent...', 'info');
    const resp = await fetch('/api/ai-tools/agent-plan/' + taskId + '/approve', {
      method: 'POST',
      headers: { 'X-API-Key': 'dev-key-001', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await resp.json();
    if (data.success) {
      toast('Plan 已批准，agent 开始执行 ⚙️', 'success');
      refreshKanban();
      openTask(taskId); // 刷新详情页（会触发 SSE 进度监听）
    } else {
      toast('批准失败: ' + (data.message || data.error || '未知错误'), 'error', 5000);
    }
  } catch (e) {
    toast('请求失败: ' + e.message, 'error', 5000);
  }
}

async function rejectPlan(taskId) {
  const reason = prompt('拒绝 Plan 的原因（可选）：', '');
  try {
    const resp = await fetch('/api/ai-tools/agent-plan/' + taskId + '/reject', {
      method: 'POST',
      headers: { 'X-API-Key': 'dev-key-001', 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason || '' }),
    });
    const data = await resp.json();
    if (data.success) {
      toast('Plan 已拒绝，任务退回 backlog', 'info');
      refreshKanban();
      openTask(taskId);
    } else {
      toast('拒绝失败: ' + (data.message || data.error || '未知错误'), 'error', 5000);
    }
  } catch (e) {
    toast('请求失败: ' + e.message, 'error', 5000);
  }
}
function formatLogEntry(entry) {
  const time = new Date(entry.time).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const action = entry.action || '';
  const note = entry.note || '';
  // 提取 round 数字：round_20/90 → R20/90
  const roundMatch = action.match(/^round_(\d+)\/(\d+)$/);
  const round = roundMatch ? `R${roundMatch[1]}/${roundMatch[2]}` : '';
  // v0.46: 检测 LLM 分析思考（💡 开头）
  const thoughtMatch = note.match(/^💡 (.+)/);
  if (thoughtMatch) {
    const thought = thoughtMatch[1];
    // 如果还有工具调用信息，换行显示
    const toolLine = note.match(/\n调用工具:.+/);
    if (toolLine) {
      return `${time}  ${round.padEnd(7)} 💭 ${thought.slice(0, 200)}\n${time}  ${round.padEnd(7)} ${toolLine[0].replace('调用工具:', '⚙️ 调用:')}`;
    }
    return `${time}  ${round.padEnd(7)} 💭 ${thought.slice(0, 200)}`;
  }
  // 提取 [agent_xxx] tag（取最后一个，最新调用的 tool）
  const toolTags = note.match(/\[agent_\w+\]/g) || [];
  const lastTool = toolTags.length > 0 ? toolTags[toolTags.length - 1].slice(1, -1) : null;
  // 清理 note：去掉末尾 [agent_xxx, agent_yyy] tag 块（任意内容直到末尾 ]）
  const cleanNote = note.replace(/\s*\[[^\]]*\]$/g, '').trim();
  // 决定显示
  if (lastTool && TOOL_META[lastTool]) {
    // 工具调用行：提取 (args) 部分
    const argsMatch = cleanNote.match(/调用工具: [^(]+\((.+)\)$/);
    const argsStr = argsMatch ? argsMatch[1].slice(0, 100) : '';
    return `${time}  ${round.padEnd(7)} ${TOOL_META[lastTool].icon} ${TOOL_META[lastTool].label}: ${argsStr}`;
  } else if (lastTool) {
    // 未知 tool 名（fallback）
    return `${time}  ${round.padEnd(7)} 🔧 ${lastTool}: ${cleanNote}`;
  } else {
    // 轮次开始/总结（无 tool 调用）
    return `${time}  ${round.padEnd(7)} 🔄 ${cleanNote}`;
  }
}

// v0.35: SSE 进度查看器 — 在任务详情面板中显示实时执行进度
// v0.37: startedAt 参数 — 详情页用 task.last_progress_update 作起点，不是开页面瞬间
// v0.42: 进度窗口下边增加执行操作详情（按图标分类 + 倒序追加 + auto-scroll）
let _sseProgressTimer = null;
let _sseProgressConnected = false;

function startProgressViewer(taskId, startedAt) {
  // 清除之前的定时器
  if (_sseProgressTimer) {
    clearInterval(_sseProgressTimer);
    _sseProgressTimer = null;
  }
  _sseProgressConnected = false;
  
  // 创建进度卡片
  const container = document.getElementById('task-detail-progress-container');
  if (!container) return;
  
  container.innerHTML = `
    <div class="progress-card" style="padding:12px;background:rgba(78,205,196,0.08);border-radius:8px;border:1px solid rgba(78,205,196,0.2);margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-weight:bold;color:var(--accent)">⚙️ 正在执行...</span>
        <span class="progress-timer" style="font-size:12px;color:var(--text2)">0s</span>
      </div>
      <div class="progress-bar" style="margin-bottom:8px"><div class="progress-fill progress-fill-animate" style="width:0%;transition:width 0.5s"></div></div>
      <div class="progress-note" style="font-size:11px;color:var(--text2)">等待任务开始...</div>
      <div class="phase-bar" style="display:flex;gap:4px;margin:8px 0 4px 0;font-size:10px">
        <span class="phase-seg" data-phase="explore" style="flex:1;text-align:center;padding:4px;border-radius:3px;background:rgba(148,163,184,0.15);color:#94a3b8">🔍 探索</span>
        <span class="phase-seg" data-phase="design" style="flex:1;text-align:center;padding:4px;border-radius:3px;background:rgba(139,92,246,0.15);color:#8b5cf6">📝 设计</span>
        <span class="phase-seg" data-phase="write" style="flex:1;text-align:center;padding:4px;border-radius:3px;background:rgba(59,130,246,0.15);color:#3b82f6">✏️ 写</span>
        <span class="phase-seg" data-phase="test" style="flex:1;text-align:center;padding:4px;border-radius:3px;background:rgba(16,185,129,0.15);color:#10b981">🧪 测试</span>
        <span class="phase-seg" data-phase="fix" style="flex:1;text-align:center;padding:4px;border-radius:3px;background:rgba(245,158,11,0.15);color:#f59e0b">🔧 修复</span>
      </div>
      <div style="font-size:10px;color:var(--text2);margin-top:8px;margin-bottom:4px">📋 执行操作详情</div>
      <div class="progress-log" style="max-height:280px;overflow-y:auto;font-size:10px;color:var(--text2);padding:6px 8px;background:rgba(0,0,0,0.2);border-radius:4px;font-family:'Courier New',monospace;line-height:1.5"><div class="progress-log-empty" style="color:#666;font-style:italic">等待 agent 输出...</div></div>
    </div>
  `;
  
  const startTs = startedAt || Date.now();  // v0.37: fallback 到当前时间
  const timerEl = container.querySelector('.progress-timer');
  const progressFill = container.querySelector('.progress-fill');
  const noteEl = container.querySelector('.progress-note');
  const logEl = container.querySelector('.progress-log');
  // v0.46 TodoWrite: phase bar 更新函数
  const phaseSegs = container.querySelectorAll('.phase-seg');
  const PHASE_ORDER = ['explore', 'design', 'write', 'test', 'fix'];
  function updatePhaseBar(currentPhase) {
    if (!currentPhase) return;
    const idx = PHASE_ORDER.indexOf(currentPhase);
    phaseSegs.forEach((seg, i) => {
      const phase = seg.getAttribute('data-phase');
      if (i < idx) {
        // 已完成阶段 — 实色背景
        seg.style.opacity = '0.55';
        seg.style.fontWeight = 'normal';
      } else if (i === idx) {
        // 当前阶段 — 高亮 + 加粗 + 加阴影
        seg.style.opacity = '1';
        seg.style.fontWeight = 'bold';
        seg.style.boxShadow = `0 0 0 2px ${seg.style.color}`;
      } else {
        // 未开始 — 透明
        seg.style.opacity = '0.4';
        seg.style.fontWeight = 'normal';
        seg.style.boxShadow = 'none';
      }
    });
  }
  
  // 计时器更新
  const timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTs) / 1000);
    timerEl.textContent = elapsed + 's';
  }, 1000);
  
  // SSE 连接
  try {
    const es = new EventSource(`/api/tasks/${taskId}/progress/stream?api_key=dev-key-001`);
    _sseProgressConnected = true;
    
    es.addEventListener('connected', (e) => {
      const data = JSON.parse(e.data);
      noteEl.textContent = data.note || '正在执行...';
      progressFill.style.width = (data.progress || 0) + '%';
      if (data.status === 'done' || data.status === 'failed') {
        es.close();
        clearInterval(timerInterval);
        clearInterval(_sseProgressTimer);
        _sseProgressTimer = null;
        _sseProgressConnected = false;
        refreshKanban();
        openTask(taskId); // 刷新详情
      }
    });
    
    es.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      noteEl.textContent = data.note || ('Round ' + Math.round(data.progress) + '/90');
      progressFill.style.width = data.progress + '%';
      // v0.46 TodoWrite: 更新 phase bar
      if (data.phase) updatePhaseBar(data.phase);
    });
    
    es.addEventListener('log', (e) => {
      const data = JSON.parse(e.data);
      if (data.entry) {
        // v0.42: 倒序追加（最新在最下） + auto-scroll to bottom + 图标分类
        //   之前是 prepend（最新在最上），用户看 280px 区域容易看不到新内容
        //   现在倒序追加 + 滚到底，符合"根据进度滚动输出"的预期
        const empty = logEl.querySelector('.progress-log-empty');
        if (empty) empty.remove();
        const line = document.createElement('div');
        line.style.cssText = 'padding:1px 0;border-bottom:1px solid rgba(255,255,255,0.03)';
        line.textContent = formatLogEntry(data.entry);
        logEl.appendChild(line);
        // 自动滚动到底部（最新内容可见）
        logEl.scrollTop = logEl.scrollHeight;
        // 最多保留 200 条
        while (logEl.children.length > 200) {
          logEl.removeChild(logEl.firstChild);
        }
      }
    });
    
    es.addEventListener('done', (e) => {
      es.close();
      clearInterval(timerInterval);
      clearInterval(_sseProgressTimer);
      _sseProgressTimer = null;
      _sseProgressConnected = false;
      noteEl.textContent = '✅ 执行完成';
      progressFill.style.width = '100%';
      refreshKanban();
      openTask(taskId);
    });
    
    es.addEventListener('failed', (e) => {
      es.close();
      clearInterval(timerInterval);
      clearInterval(_sseProgressTimer);
      _sseProgressTimer = null;
      _sseProgressConnected = false;
      noteEl.textContent = '❌ 执行失败: ' + (JSON.parse(e.data).notes || '未知错误');
      progressFill.style.width = '100%';
      progressFill.style.background = '#ff4444';
      refreshKanban();
      openTask(taskId);
    });
    
    es.addEventListener('timeout', (e) => {
      es.close();
      clearInterval(timerInterval);
      clearInterval(_sseProgressTimer);
      _sseProgressTimer = null;
      _sseProgressConnected = false;
      noteEl.textContent = '⏱ 执行超时，请查看详情';
      refreshKanban();
    });
    
    es.addEventListener('error', () => {
      // SSE 断连，回退到轮询
      es.close();
      clearInterval(timerInterval);
      _sseProgressConnected = false;
      noteEl.textContent = 'SSE 连接断开，回退到轮询...';
      
      // 轮询模式
      _sseProgressTimer = setInterval(async () => {
        try {
          const task = await Tasks.get(taskId);
          if (task.status === 'done' || task.status === 'failed') {
            clearInterval(_sseProgressTimer);
            _sseProgressTimer = null;
            refreshKanban();
            openTask(taskId);
            return;
          }
          if (task.progress) {
            progressFill.style.width = task.progress + '%';
            noteEl.textContent = task.progress_note || ('Round ' + task.progress + '/90');
          }
        } catch (e) { /* silent */ }
      }, 3000);
    });
  } catch (e) {
    noteEl.textContent = '连接进度流失败: ' + e.message;
  }
}

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
