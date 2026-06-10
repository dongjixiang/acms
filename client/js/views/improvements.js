// 自我改进视图 — 改进报告 + 任务看板
// 依赖: core/state.js, core/utils.js, js/api.js

let _improvementsProject = null;
let _currentTab = 'reports';
let _selectedReportId = null;

function showImprovements() {
  App.currentProject = null;
  document.getElementById('view-improvements').style.display = 'block';
  loadImprovements();
}

function hideImprovements() {
  document.getElementById('view-improvements').style.display = 'none';
}

async function loadImprovements() {
  try {
    // 加载自我改进项目信息
    const projResp = await fetch('/api/improvements/project', { headers: { 'X-API-Key': 'dev-key-001' } });
    if (!projResp.ok) {
      document.getElementById('imp-project-info').innerHTML = '<div class="empty-state" style="padding:40px;text-align:center;color:var(--text2)">⚠️ 自我改进项目未初始化，请重启服务器</div>';
      return;
    }
    _improvementsProject = await projResp.json();
    document.getElementById('imp-project-info').innerHTML =
      '<span style="font-size:11px;color:var(--text2)">' +
      '📊 任务总计: <strong>' + _improvementsProject.taskStats.total + '</strong> · ' +
      '🔄 进行中: <strong>' + _improvementsProject.taskStats.inProgress + '</strong> · ' +
      '✅ 已完成: <strong>' + _improvementsProject.taskStats.done + '</strong>' +
      '</span>';

    if (_currentTab === 'reports') loadReports();
    else loadBoard();
  } catch (e) {
    document.getElementById('imp-project-info').textContent = '加载失败: ' + e.message;
  }
}

function switchImprovementTab(tab) {
  _currentTab = tab;
  document.querySelectorAll('.imp-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('imp-reports-panel').style.display = tab === 'reports' ? 'flex' : 'none';
  document.getElementById('imp-board-panel').style.display = tab === 'board' ? 'flex' : 'none';
  if (tab === 'reports') loadReports();
  else loadBoard();
}

// ═══ 报告列表 ═══

async function loadReports(statusFilter) {
  try {
    var url = '/api/improvements/reports?limit=100';
    if (statusFilter) url += '&status=' + statusFilter;
    var resp = await fetch(url, { headers: { 'X-API-Key': 'dev-key-001' } });
    var reports = await resp.json();
    var container = document.getElementById('imp-reports-list');
    _selectedReportId = null;

    if (!reports || reports.length === 0) {
      container.innerHTML = '<div class="empty-state" style="padding:40px;text-align:center;color:var(--text2)">暂无改进报告。<br>严重缺陷（critical/major）修复后会自动生成，或点击右上角 💡 记录想法。</div>';
      document.getElementById('imp-detail-panel').innerHTML = '';
      renderReportsToolbar([]);
      return;
    }

    // 统计：有多少 pending idea 用来决定是否显示「合并」按钮
    var pendingIdeaCount = reports.filter(function(r){ return r.source_type === 'idea' && r.status === 'pending'; }).length;

    container.innerHTML = reports.map(function(r) {
      var statusClass = impStatusClass(r.status);
      var sourceIcon = impSourceIcon(r.source_type);
      var severityLabel = r.severity === 'critical' ? '⚡ critical' : (r.severity === 'major' ? 'major' : 'minor');
      var sourceTitle = r.sourceTaskTitle ? '· ' + escHtml(r.sourceTaskTitle.substring(0, 30)) : '';
      var improvements = safeParse(r.improvements || '[]');
      var tags = improvements.slice(0, 2).map(function(imp) {
        return '<span class="report-tag">' + escHtml((imp.dimension || '') + ': ' + (imp.priority || '')) + '</span>';
      }).join('');
      var statusLabel = impStatusLabel(r.status);
      var userTag = impUserTag(r);
      var isMerged = r.status === 'merged';
      // idea 类型且 pending 时显示合并复选框
      var mergeCheck = (r.source_type === 'idea' && r.status === 'pending')
        ? '<input type="checkbox" class="imp-merge-check" data-id="' + r.id + '" onclick="event.stopPropagation()" title="勾选以合并" />'
        : '';
      var mergedHint = isMerged && r.merged_into
        ? '<span class="imp-merged-hint">→ 已并入 ' + escHtml(r.merged_into) + '</span>'
        : '';
      return '<div class="imp-report-card ' + statusClass + '" data-id="' + r.id + '" onclick="selectImprovementReport(\'' + r.id + '\')">' +
        '<div class="imp-report-row1">' +
          mergeCheck +
          '<span class="imp-report-title">' + escHtml(r.summary || r.id) + '</span>' +
          '<span class="imp-report-source">' + sourceIcon + ' ' + r.source_type + (statusLabel ? ' ' + statusLabel : '') + '</span>' +
        '</div>' +
        (userTag ? '<div class="imp-report-row-user">' + userTag + '</div>' : '') +
        '<div class="imp-report-row2">' +
          '<span>📅 ' + (r.created_at || '').substring(0, 10) + '</span>' +
          '<span>' + severityLabel + '</span>' +
          (sourceTitle ? '<span>' + sourceTitle + '</span>' : '') +
          (mergedHint ? mergedHint : '') +
        '</div>' +
        (tags ? '<div class="imp-report-tags">' + tags + '</div>' : '') +
      '</div>';
    }).join('');

    renderReportsToolbar(pendingIdeaCount);

    // 选中第一个
    if (reports.length > 0) selectImprovementReport(reports[0].id);
  } catch (e) {
    document.getElementById('imp-reports-list').innerHTML = '<div style="padding:20px;color:var(--accent2)">加载失败: ' + e.message + '</div>';
  }
}

// 在 reports 列表上方渲染「合并选中」按钮（仅当有 ≥2 条 pending idea 时可见）
function renderReportsToolbar(pendingIdeaCount) {
  var toolbar = document.getElementById('imp-reports-toolbar');
  if (!toolbar) return;
  if (pendingIdeaCount >= 2) {
    toolbar.innerHTML = '<span class="imp-toolbar-hint">已选 <strong id="imp-merge-count">0</strong> / ' + pendingIdeaCount + ' 条想法</span>' +
      '<button class="btn-small btn-accept" onclick="mergeSelectedIdeas()">🔗 合并选中想法</button>';
    toolbar.style.display = 'flex';
    // 同步复选框 → 计数
    document.querySelectorAll('.imp-merge-check').forEach(function(cb){
      cb.onchange = function(){
        var n = document.querySelectorAll('.imp-merge-check:checked').length;
        var el = document.getElementById('imp-merge-count');
        if (el) el.textContent = n;
      };
    });
  } else {
    toolbar.style.display = 'none';
    toolbar.innerHTML = '';
  }
}

async function selectImprovementReport(id) {
  _selectedReportId = id;
  // 高亮
  document.querySelectorAll('.imp-report-card').forEach(function(c) {
    c.classList.toggle('selected', c.dataset.id === id);
  });
  try {
    var resp = await fetch('/api/improvements/reports/' + id, { headers: { 'X-API-Key': 'dev-key-001' } });
    var r = await resp.json();
    var panel = document.getElementById('imp-detail-panel');
    var sourceIcon = r.source_type === 'bug' ? '🐛' : (r.source_type === 'clarify' ? '💡' : '📊');
    var rc = r.root_cause || {};
    var imps = r.improvements || [];

    var rcHtml = '';
    if (rc.surface || rc.deep || rc.preventable) {
      rcHtml = '<div class="imp-detail-section">' +
        '<div class="imp-detail-label">🔍 根因分析</div>' +
        '<div class="imp-detail-card" style="font-size:11px;line-height:1.6">' +
        (rc.surface ? '<div><span style="color:#c84a4a">表层:</span> ' + escHtml(rc.surface) + '</div>' : '') +
        (rc.deep ? '<div style="margin-top:4px"><span style="color:#c8a050">深层:</span> ' + escHtml(rc.deep) + '</div>' : '') +
        (rc.preventable ? '<div style="margin-top:4px"><span style="color:#4ecdc4">预防:</span> ' + escHtml(rc.preventable) + '</div>' : '') +
        '</div></div>';
    }

    var impsHtml = '';
    if (imps.length > 0) {
      impsHtml = '<div class="imp-detail-section">' +
        '<div class="imp-detail-label">💡 改进建议（' + imps.length + '条）</div>' +
        imps.map(function(imp, i) {
          var priClass = imp.priority === 'high' ? 'pri-high' : (imp.priority === 'medium' ? 'pri-medium' : 'pri-low');
          return '<div class="imp-detail-card" style="margin-bottom:6px">' +
            '<h5>' + escHtml(imp.dimension || '建议' + (i+1)) + '</h5>' +
            '<p>' + escHtml(imp.suggestion || imp.issue || '') + '</p>' +
            '<div style="margin-top:4px;display:flex;gap:6px;align-items:center">' +
              '<span class="pri-badge ' + priClass + '">' + (imp.priority || 'medium') + '</span>' +
              (imp.expectedEffect ? '<span style="font-size:10px;color:#605040">预期: ' + escHtml(imp.expectedEffect) + '</span>' : '') +
            '</div></div>';
        }).join('') +
        '</div>';
    }

    var actionsHtml = '';
    if (r.status === 'pending') {
      actionsHtml = '<div class="imp-actions">' +
        '<button class="btn btn-accept" onclick="approveImprovement(\'' + r.id + '\')">✅ 审核通过 → 提交任务</button>' +
        '<button class="btn btn-secondary" onclick="declineImprovement(\'' + r.id + '\')">✕ 忽略</button>' +
      '</div>';
    } else if (r.status === 'approved') {
      actionsHtml = '<div class="imp-actions"><span style="font-size:11px;color:#4ecdc4">✅ 已审核通过' +
        (r.task_id ? ' · 任务: ' + r.task_id : '') + '</span></div>';
    } else if (r.status === 'merged') {
      actionsHtml = '<div class="imp-actions"><span style="font-size:11px;color:#a09070">🔗 已合并到 ' +
        escHtml(r.merged_into || '?') + '</span></div>';
    } else {
      actionsHtml = '<div class="imp-actions"><span style="font-size:11px;color:#605040">✕ 已忽略</span></div>';
    }

    // 来源信息：合并展示「类型 + 用户/角色 + 来源场景」
    var sourceContextHtml = r.source_context
      ? '<div class="imp-detail-section"><div class="imp-detail-label">📍 来源场景</div>' +
        '<div class="imp-detail-card" style="font-size:11px;line-height:1.5">' + escHtml(r.source_context) + '</div></div>'
      : '';
    var sourceUserHtml = (r.source_user_name || r.source_user_id || r.source_role)
      ? '<div class="imp-detail-section"><div class="imp-detail-label">👤 来源</div>' +
        '<div class="imp-detail-card" style="font-size:11px">' +
          '<span class="imp-user-tag">' +
            (r.source_user_name || r.source_user_id || 'anonymous') +
            (r.source_role ? ' (' + escHtml(r.source_role) + ')' : '') +
          '</span>' +
        '</div></div>'
      : '';
    // 合并来源：related_ids 是 JSON 字符串，需要解析
    var relatedIds = safeParse(r.related_ids || '[]');
    var relatedHtml = relatedIds.length > 0
      ? '<div class="imp-detail-section"><div class="imp-detail-label">🔗 合并来源</div>' +
        '<div class="imp-detail-card" style="font-size:10px;line-height:1.6">' +
          relatedIds.map(function(id){ return '· ' + escHtml(id); }).join('<br>') +
        '</div></div>'
      : '';
    // 想法正文（idea 才有 content 字段显示价值）
    var ideaContentHtml = (r.source_type === 'idea' && r.content)
      ? '<div class="imp-detail-section"><div class="imp-detail-label">📝 想法详情</div>' +
        '<div class="imp-detail-card" style="font-size:11px;line-height:1.6;white-space:pre-wrap">' + escHtml(r.content) + '</div></div>'
      : '';

    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<span class="imp-detail-label">' + r.id + '</span>' +
        '<span class="imp-detail-source">' + impSourceIcon(r.source_type) + ' ' + r.source_type + '</span>' +
      '</div>' +
      '<div><div style="font-size:13px;font-weight:600">' + escHtml(r.summary || '') + '</div>' +
      '<div style="font-size:10px;color:#a09070;margin-top:2px">严重级别: ' + r.severity + '</div></div>' +
      sourceUserHtml +
      sourceContextHtml +
      ideaContentHtml +
      relatedHtml +
      rcHtml +
      impsHtml +
      actionsHtml;
  } catch (e) {
    document.getElementById('imp-detail-panel').innerHTML = '<div style="color:var(--accent2)">加载失败: ' + e.message + '</div>';
  }
}

async function approveImprovement(id) {
  if (!(await showConfirm('确认审核通过？将在自我改进项目中创建改进任务。'))) return;
  try {
    var resp = await fetch('/api/improvements/reports/' + id + '/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
      body: JSON.stringify({ verdict: 'approved' }),
    });
    var data = await resp.json();
    if (data.error) return toast('审核失败: ' + data.error, 'error');
    toast('✅ 已批准，改进任务已创建: ' + (data.task ? data.task.id : ''), 'success');
    if (_selectedReportId === id) selectImprovementReport(id);
    loadReports();
  } catch (e) { toast('失败: ' + e.message, 'error'); }
}

async function declineImprovement(id) {
  if (!(await showConfirm('确认忽略此改进建议？'))) return;
  try {
    await fetch('/api/improvements/reports/' + id + '/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
      body: JSON.stringify({ verdict: 'declined' }),
    });
    toast('已忽略', 'success');
    if (_selectedReportId === id) selectImprovementReport(id);
    loadReports();
  } catch (e) { toast('失败: ' + e.message, 'error'); }
}

// ═══ 任务看板 ═══

async function loadBoard() {
  var container = document.getElementById('imp-board-content');
  container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text2)">加载中...</div>';
  try {
    var resp = await fetch('/api/improvements/board', { headers: { 'X-API-Key': 'dev-key-001' } });
    var board = await resp.json();
    var cols = [
      { key: 'backlog', label: '📥 待认领' },
      { key: 'in_progress', label: '🔄 进行中' },
      { key: 'review', label: '👀 待审核' },
      { key: 'done', label: '✅ 已完成' },
    ];
    var html = '<div class="kanban-grid">';
    for (var ci = 0; ci < cols.length; ci++) {
      var col = cols[ci];
      var tasks = board[col.key] || [];
      html += '<div class="kanban-col">' +
        '<div class="kanban-col-header"><span>' + col.label + '</span><span class="badge">' + tasks.length + '</span></div>';
      for (var ti = 0; ti < tasks.length; ti++) {
        var t = tasks[ti];
        var priBar = '█'.repeat(t.priority || 1) + '░'.repeat(5 - (t.priority || 1));
        html += '<div class="kanban-card" onclick="showTaskDetail(\'' + t.id + '\')">' +
          '<div class="k-title">' + escHtml(t.title || '') + '</div>' +
          '<div class="k-meta">' + priBar + ' ' + (t.assigned_to || '未分配') + ' [' + (t.progress || 0) + '%]</div>' +
        '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<div style="padding:20px;color:var(--accent2)">加载失败: ' + e.message + '</div>';
  }
}

// 工具函数
function safeParse(str) {
  try { return JSON.parse(str); } catch { return []; }
}

// ═══ 来源图标/标签辅助 ═══
function impSourceIcon(sourceType) {
  return { bug: '🐛', clarify: '💡', postmortem: '📊', idea: '💭' }[sourceType] || '📊';
}
function impStatusClass(status) {
  return { pending: 'pending', approved: 'approved', declined: 'declined', merged: 'merged' }[status] || 'pending';
}
function impStatusLabel(status) {
  return { approved: '✅ 已转任务', declined: '✕ 已忽略', merged: '🔗 已合并' }[status] || '';
}
function impUserTag(r) {
  if (r.source_user_name || r.source_user_id) {
    const role = r.source_role ? ` (${r.source_role})` : '';
    return `<span class="imp-user-tag">👤 ${escHtml(r.source_user_name || r.source_user_id)}${escHtml(role)}</span>`;
  }
  if (r.source_role) {
    return `<span class="imp-user-tag role-only">${escHtml(r.source_role)}</span>`;
  }
  return '';
}

// ═══ 想法提交弹窗（全局可用，从 toolbar 💡 按钮触发）═══
function showIdeaDialog() {
  // 已存在则不再开
  if (document.getElementById('idea-dialog-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'idea-dialog-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-dialog idea-dialog">
      <div class="modal-header">
        <span>💡 记录想法</span>
        <button class="modal-close" type="button">×</button>
      </div>
      <div class="modal-body">
        <p style="font-size:11px;color:var(--text2);margin:0 0 12px">
          你的想法会进入「自我改进」审核流。审核通过后自动创建任务执行。
        </p>
        <label class="idea-field">
          <span class="idea-field-label">标题 *</span>
          <input id="idea-title" type="text" placeholder="一句话描述这个想法" maxlength="120" />
        </label>
        <label class="idea-field">
          <span class="idea-field-label">详细说明</span>
          <textarea id="idea-content" rows="5" placeholder="为什么想做、怎么做、预期效果……"></textarea>
        </label>
        <div class="idea-field-row">
          <label class="idea-field">
            <span class="idea-field-label">来源场景（可选）</span>
            <input id="idea-context" type="text" placeholder="如：和老大多聊天时 / 看到 xxxx 案例" />
          </label>
        </div>
        <div class="idea-field-row">
          <label class="idea-field" style="flex:1">
            <span class="idea-field-label">你的名字</span>
            <input id="idea-username" type="text" placeholder="大大多" value="${escHtml(localStorage.getItem('acms-idea-username') || '大大多')}" />
          </label>
          <label class="idea-field" style="flex:1">
            <span class="idea-field-label">你的角色</span>
            <select id="idea-role">
              <option value="PM" ${localStorage.getItem('acms-idea-role')==='PM'?'selected':''}>PM（产品）</option>
              <option value="tech" ${localStorage.getItem('acms-idea-role')==='tech'?'selected':''}>技术</option>
              <option value="design" ${localStorage.getItem('acms-idea-role')==='design'?'selected':''}>设计</option>
              <option value="test" ${localStorage.getItem('acms-idea-role')==='test'?'selected':''}>测试</option>
              <option value="agent:小吉" ${(localStorage.getItem('acms-idea-role')||'').startsWith('agent:')?'selected':''}>🤖 Agent（智能体）</option>
              <option value="system">⚙️ 系统</option>
              <option value="anonymous">匿名</option>
            </select>
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-back" type="button" data-act="cancel">取消</button>
        <button class="btn-accept" type="button" data-act="submit">📥 提交想法</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').onclick = close;
  overlay.querySelector('[data-act="cancel"]').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
  });

  overlay.querySelector('[data-act="submit"]').onclick = async () => {
    const title = document.getElementById('idea-title').value.trim();
    const content = document.getElementById('idea-content').value.trim();
    const sourceContext = document.getElementById('idea-context').value.trim();
    const userName = document.getElementById('idea-username').value.trim() || 'anonymous';
    const role = document.getElementById('idea-role').value;

    if (!title && !content) { toast('请至少填写标题或内容', 'error'); return; }

    // 记住用户名/角色（localStorage 简单记忆，未来接真用户系统时替换）
    localStorage.setItem('acms-idea-username', userName);
    localStorage.setItem('acms-idea-role', role);

    const submitBtn = overlay.querySelector('[data-act="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = '提交中...';

    try {
      const resp = await fetch('/api/improvements/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
        body: JSON.stringify({
          title, content, sourceContext,
          sourceUserName: userName, sourceRole: role,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || '提交失败');
      toast('💡 想法已记录，进入审核池: ' + data.id, 'success');
      close();
      // 如果当前已经在自我改进页，刷新一下让新想法出现
      if (document.getElementById('view-improvements').style.display === 'block') {
        loadReports();
      }
    } catch (e) {
      toast('提交失败: ' + e.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = '📥 提交想法';
    }
  };

  // 自动聚焦标题
  setTimeout(() => document.getElementById('idea-title')?.focus(), 50);
}

// ═══ 想法合并（自我改进页内勾选多条 pending idea 时调用）═══
async function mergeSelectedIdeas() {
  const checked = Array.from(document.querySelectorAll('.imp-merge-check:checked')).map(c => c.dataset.id);
  if (checked.length < 2) { toast('请至少勾选 2 条想法才能合并', 'error'); return; }

  if (!(await showConfirm(`确认合并 ${checked.length} 条想法为一条？合并后源想法会标记为「已合并」并指向新报告。`, { type: 'info' }))) return;

  try {
    const resp = await fetch('/api/improvements/ideas/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
      body: JSON.stringify({
        sourceIds: checked,
        summary: `合并 ${checked.length} 条想法`,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '合并失败');
    toast(`🔗 已合并 ${data.merged} 条 → 新报告 ${data.report.id}`, 'success');
    loadReports();
  } catch (e) {
    toast('合并失败: ' + e.message, 'error');
  }
}
