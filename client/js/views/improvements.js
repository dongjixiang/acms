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
      container.innerHTML = '<div class="empty-state" style="padding:40px;text-align:center;color:var(--text2)">暂无改进报告。<br>严重缺陷（critical/major）修复后会自动生成。</div>';
      document.getElementById('imp-detail-panel').innerHTML = '';
      return;
    }

    container.innerHTML = reports.map(function(r) {
      var statusClass = r.status === 'pending' ? 'pending' : (r.status === 'approved' ? 'approved' : 'declined');
      var sourceIcon = r.source_type === 'bug' ? '🐛' : (r.source_type === 'clarify' ? '💡' : '📊');
      var severityLabel = r.severity === 'critical' ? '⚡ critical' : (r.severity === 'major' ? 'major' : 'minor');
      var sourceTitle = r.sourceTaskTitle ? '· ' + escHtml(r.sourceTaskTitle.substring(0, 30)) : '';
      var improvements = safeParse(r.improvements || '[]');
      var tags = improvements.slice(0, 2).map(function(imp) {
        return '<span class="report-tag">' + escHtml((imp.dimension || '') + ': ' + (imp.priority || '')) + '</span>';
      }).join('');
      var statusLabel = r.status === 'pending' ? '' : (r.status === 'approved' ? ' ✅ 已转任务' : ' ✕ 已忽略');
      return '<div class="imp-report-card ' + statusClass + '" data-id="' + r.id + '" onclick="selectImprovementReport(\'' + r.id + '\')">' +
        '<div class="imp-report-row1">' +
          '<span class="imp-report-title">' + escHtml(r.summary || r.id) + '</span>' +
          '<span class="imp-report-source">' + sourceIcon + ' ' + r.source_type + statusLabel + '</span>' +
        '</div>' +
        '<div class="imp-report-row2">' +
          '<span>📅 ' + (r.created_at || '').substring(0, 10) + '</span>' +
          '<span>' + severityLabel + '</span>' +
          (sourceTitle ? '<span>' + sourceTitle + '</span>' : '') +
        '</div>' +
        (tags ? '<div class="imp-report-tags">' + tags + '</div>' : '') +
      '</div>';
    }).join('');

    // 选中第一个
    if (reports.length > 0) selectImprovementReport(reports[0].id);
  } catch (e) {
    document.getElementById('imp-reports-list').innerHTML = '<div style="padding:20px;color:var(--accent2)">加载失败: ' + e.message + '</div>';
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
    } else {
      actionsHtml = '<div class="imp-actions"><span style="font-size:11px;color:#605040">✕ 已忽略</span></div>';
    }

    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<span class="imp-detail-label">' + r.id + '</span>' +
        '<span class="imp-detail-source">' + sourceIcon + ' ' + r.source_type + '</span>' +
      '</div>' +
      '<div><div style="font-size:13px;font-weight:600">' + escHtml(r.summary || '') + '</div>' +
      '<div style="font-size:10px;color:#a09070;margin-top:2px">严重级别: ' + r.severity + '</div></div>' +
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
