// 缺陷管理视图 — 缺陷列表 + AI 澄清提交
// 依赖: core/state.js, core/utils.js, js/api.js

var bugState = {
  projectId: null,
  modelId: null,
  bugDescription: '',
  conversationHistory: [],
  readyToCreate: false,
  analysis: null,
};

// The desktop window passes its .aw-content HTMLElement as the view root.
var _bugRoot = null;
function _bugFindById(id) {
  if (_bugRoot && _bugRoot !== document) {
    var scoped = _bugRoot.querySelector('#' + id);
    if (scoped) return scoped;
  }
  return document.getElementById(id);
}
function _bugQueryAll(selector) {
  if (_bugRoot && _bugRoot !== document) return _bugRoot.querySelectorAll(selector);
  return document.querySelectorAll(selector);
}

// ========== 入口：默认加载缺陷列表 ==========
function loadBugView(root) {
  if (root) _bugRoot = root;
  else if (!_bugRoot) _bugRoot = document;
  if (!App.currentProjectId) return;
  bugState.projectId = App.currentProjectId;
  bugState.conversationHistory = [];
  bugState.readyToCreate = false;
  bugState.analysis = null;
  bugState.bugDescription = '';

  // 隐藏表单，显示列表
  _bugFindById('bug-form-panel').style.display = 'none';
  return loadBugList();
}

// ========== 缺陷列表 ==========
async function loadBugList() {
  var statusFilter = _bugFindById('bug-status-filter').value;
  var severityFilter = _bugFindById('bug-severity-filter').value;

  var query = 'projectId=' + encodeURIComponent(bugState.projectId);
  if (statusFilter) query += '&status=' + encodeURIComponent(statusFilter);

  try {
    var resp = await fetch('/api/bugs?' + query, {
      headers: { 'X-API-Key': 'dev-key-001' }
    });
    var bugs = await resp.json();

    // 前端按严重级二次筛选
    if (severityFilter) {
      bugs = bugs.filter(function(b) { return b.bug_severity === severityFilter; });
    }

    renderBugList(bugs);
  } catch(e) {
    _bugFindById('bug-list').innerHTML =
      '<div style="padding:32px;text-align:center;color:var(--text2)">❌ 加载失败: ' + escHtml(e.message) + '</div>';
  }
  // v0.62: 如果没传 root（刷了隐藏模板），同时刷新所有打开的 bugs 窗口
  if (_bugRoot === document && window.ACMSWin && ACMSWin.refreshView) {
    ACMSWin.refreshView('bugs');
  }
}

function renderBugList(bugs) {
  var el = _bugFindById('bug-list');

  if (!bugs || bugs.length === 0) {
    el.innerHTML = '<div class="bug-empty">' +
      '<div class="bug-empty-icon">🐛</div>' +
      '<p>暂无缺陷记录</p>' +
      '<p style="font-size:12px;color:var(--text2)">点击"提交缺陷"报告新问题</p>' +
      '</div>';
    return;
  }

  // 表头 + 表格
  var html = '<div class="bug-table-wrap">' +
    '<table class="bug-table">' +
    '<thead><tr>' +
    '<th>缺陷</th>' +
    '<th style="width:90px">严重级</th>' +
    '<th style="width:90px">状态</th>' +
    '<th>关联需求</th>' +
    '<th>关联任务</th>' +
    '<th style="width:70px">来源</th>' +
    '<th style="width:100px">更新时间</th>' +
    '</tr></thead>' +
    '<tbody>';

  bugs.forEach(function(bug) {
    var severityBadge = getSeverityBadge(bug.bug_severity || 'major');
    var statusBadge = getStatusBadge(bug.status || 'backlog');
    var sourceLabel = getSourceLabel(bug.bug_source || 'manual');
    var updated = formatDate(bug.updated_at || bug.created_at);

    var reqLink = bug.parent_id && bug.requirementTitle
      ? '<a href="#" class="bug-link" onclick="openRequirementDetail(\'' + bug.parent_id + '\');return false" title="' + escHtml(bug.requirementTitle) + '">' + escHtml(truncate(bug.requirementTitle, 20)) + '</a>'
      : (bug.parent_id ? '<span class="bug-link-dim">' + bug.parent_id + '</span>' : '<span class="bug-link-none">—</span>');

    var taskLink = bug.source_task_id && bug.sourceTaskTitle
      ? '<a href="#" class="bug-link" onclick="openTaskInWindow(\'' + bug.source_task_id + '\');return false" title="' + escHtml(bug.sourceTaskTitle) + '">' + escHtml(truncate(bug.sourceTaskTitle, 20)) + '</a>'
      : (bug.source_task_id ? '<span class="bug-link-dim">' + bug.source_task_id + '</span>' : '<span class="bug-link-none">—</span>');

    html += '<tr class="bug-row" onclick="openTaskInWindow(\'' + bug.id + '\');return false" style="cursor:pointer">' +
      '<td><div class="bug-row-title">' + escHtml(bug.title || '🐛 缺陷') + '</div></td>' +
      '<td>' + severityBadge + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + reqLink + '</td>' +
      '<td>' + taskLink + '</td>' +
      '<td>' + sourceLabel + '</td>' +
      '<td style="font-size:11px;color:var(--text2);white-space:nowrap">' + updated + '</td>' +
      '</tr>';
  });

  html += '</tbody></table></div>';

  // 统计摘要
  var openCount = bugs.filter(function(b) { return b.status === 'backlog' || b.status === 'in_progress'; }).length;
  var resolvedCount = bugs.filter(function(b) { return b.status === 'done'; }).length;
  var criticalCount = bugs.filter(function(b) { return b.bug_severity === 'critical' && b.status !== 'done' && b.status !== 'archived'; }).length;
  html += '<div class="bug-summary">' +
    '共 <strong>' + bugs.length + '</strong> 个缺陷 · ' +
    '未解决 <strong style="color:var(--accent3)">' + openCount + '</strong> · ' +
    '已解决 <strong style="color:var(--green)">' + resolvedCount + '</strong>' +
    (criticalCount > 0 ? ' · 🔴 紧急 <strong style="color:#ff4444">' + criticalCount + '</strong>' : '') +
    '</div>';

  el.innerHTML = html;
}

// ========== 表单切换 ==========
function showBugForm() {
  var panel = _bugFindById('bug-form-panel');
  // 加载模型列表
  try {
    fetch('/api/models', { headers: { 'X-API-Key': 'dev-key-001' } })
      .then(function(r) { return r.json(); })
      .then(function(models) {
        var modelOpts = '<option value="">选择 AI 模型</option>';
        models.forEach(function(m) {
          modelOpts += '<option value="' + m.id + '">' + (m.name || m.id) + '</option>';
        });

        panel.innerHTML =
          '<div class="bug-form" style="border:1px solid var(--border);border-radius:8px;padding:20px;margin-bottom:16px;background:var(--bg3)">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
              '<h3 style="margin:0">🐛 提交缺陷</h3>' +
              '<button class="btn-small" onclick="hideBugForm()" style="font-size:12px">✕ 关闭</button>' +
            '</div>' +
            '<p style="font-size:13px;color:var(--text2);margin-bottom:12px">描述你遇到的问题，AI 将帮你澄清细节并自动生成修复任务。</p>' +
            '<textarea id="bug-desc-input" placeholder="请描述缺陷：什么页面/功能？什么操作触发的？实际结果 vs 期望结果？" style="width:100%;min-height:120px;padding:12px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:14px;resize:vertical;font-family:inherit"></textarea>' +
            '<div style="display:flex;gap:8px;margin-top:12px;align-items:center">' +
              '<select id="bug-model-select" style="padding:8px 12px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:4px;font-size:13px">' + modelOpts + '</select>' +
              '<button class="btn-accept" onclick="startBugClarify()" style="padding:8px 20px;font-size:14px">🤖 AI 澄清</button>' +
              '<button class="btn-small" onclick="createBugDirect()" style="padding:8px 16px;font-size:12px">跳过澄清，直接创建</button>' +
            '</div>' +
            '<div id="bug-clarify-area" style="margin-top:16px"></div>' +
          '</div>';
        panel.style.display = 'block';
      });
  } catch(e) {
    panel.innerHTML = '<div style="padding:16px;color:var(--red)">加载模型列表失败</div>';
    panel.style.display = 'block';
  }
}

function hideBugForm() {
  _bugFindById('bug-form-panel').style.display = 'none';
  bugState.conversationHistory = [];
  bugState.readyToCreate = false;
  bugState.analysis = null;
}

// ========== AI 澄清流程 ==========
async function startBugClarify() {
  var desc = _bugFindById('bug-desc-input').value.trim();
  var modelId = _bugFindById('bug-model-select').value;

  if (!desc) { toast('请填写缺陷描述', 'error'); return; }
  if (!modelId) { toast('请选择 AI 模型', 'error'); return; }

  bugState.bugDescription = desc;
  bugState.modelId = modelId;
  bugState.conversationHistory = [];

  var area = _bugFindById('bug-clarify-area');
  area.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text2)">🤔 AI 正在分析缺陷...</div>';

  try {
    var resp = await fetch('/api/bugs/clarify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
      body: JSON.stringify({
        projectId: bugState.projectId,
        bugDescription: desc,
        modelId: modelId,
      }),
    });
    var result = await resp.json();
    bugState.conversationHistory.push({ role: 'assistant', content: { message: result.message, choices: result.choices } });
    renderBugClarifyResult(result);
  } catch(e) {
    area.innerHTML = '<div style="padding:16px;color:var(--red)">❌ 澄清失败: ' + escHtml(e.message) + '</div>';
  }
}

function renderBugClarifyResult(result) {
  var area = _bugFindById('bug-clarify-area');
  var html = '';

  if (result.phase === 'created') {
    html += '<div class="bug-result-success">' +
      '<h4>✅ 缺陷已创建为修复任务</h4>' +
      '<p>' + escHtml(result.message) + '</p>';

    if (result.analysis) {
      html += '<div class="bug-analysis-panel">' +
        '<strong>分析结果:</strong><br>' +
        '严重级: <span style="color:' + getSeverityColor(result.analysis.severity) + '">' + result.analysis.severity + '</span><br>' +
        '复现步骤: ' + escHtml(result.analysis.reproduce_steps || '') + '<br>' +
        '可能原因: ' + escHtml(result.analysis.possible_cause || '') + '<br>' +
        '建议修复: ' + escHtml(result.analysis.suggested_fix || '') +
        '</div>';
    }
    if (result.linkedRequirement) {
      html += '<p>📋 关联需求: <strong>' + escHtml(result.linkedRequirement.title) + '</strong> (' + result.linkedRequirement.id + ')</p>';
    }
    if (result.linkedTask) {
      html += '<p>🔗 关联任务: <strong>' + escHtml(result.linkedTask.title) + '</strong> (' + result.linkedTask.id + ')</p>';
    }
    if (result.task) {
      html += '<p style="margin-top:12px">' +
        '<a href="#" onclick="openTaskInWindow(\'' + result.task.id + '\');return false" style="color:var(--accent)">📋 查看任务: ' + result.task.id + '</a>' +
        '</p>';
    }
    html += '<button class="btn-small" onclick="hideBugForm();loadBugList()" style="margin-top:12px">📋 返回缺陷列表</button>' +
      ' &nbsp; <button class="btn-small" onclick="showBugForm()">➕ 提交新缺陷</button></div>';
  } else {
    html += '<div class="bug-clarify-message">' +
      '<p style="font-size:14px;margin-bottom:12px">' + escHtml(result.message) + '</p>';

    if (result.analysis) {
      html += '<div class="bug-analysis-inline">' +
        '📊 当前分析: 严重级 ' + (result.analysis.severity || '待定') + ' | ' +
        '期望: ' + escHtml(result.analysis.expected_behavior || '待分析') +
        '</div>';
    }

    if (result.choices && result.choices.length > 0) {
      html += '<h4 style="margin:12px 0 8px">请选择（可多选）:</h4>';
      result.choices.forEach(function(choice, qi) {
        html += '<div class="bug-choice-group">' +
          '<div class="bug-choice-q">' + escHtml(choice.question) + (choice.allowMultiple ? ' <span style="font-size:10px;color:var(--accent3)">[可多选]</span>' : '') + '</div>' +
          '<div class="bug-choice-opts" data-qi="' + qi + '" data-multiple="' + (choice.allowMultiple !== false) + '">';
        (choice.options || []).forEach(function(opt) {
          html += '<button class="bug-choice-btn" onclick="toggleBugChoice(this)">' + escHtml(opt) + '</button>';
        });
        if (choice.allowCustom) {
          html += '<input class="bug-choice-custom" placeholder="自定义答案..." onchange="markBugChoiceSelected(this)" style="margin-top:4px;padding:4px 8px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:3px;font-size:12px;width:100%">';
        }
        html += '</div></div>';
      });

      html += '<div style="margin-top:16px;display:flex;gap:8px">' +
        '<button class="btn-accept" onclick="submitBugChoices()" style="padding:8px 20px">✅ 确认选择，发送给 AI</button>' +
        '<button class="btn-small" onclick="hideBugForm();loadBugList()">取消</button>' +
        '</div>';
    }

    html += '</div>';
  }

  area.innerHTML = html;
}

// ========== 严重级/状态/来源 辅助 ==========
function getSeverityColor(severity) {
  if (severity === 'critical') return '#ff4444';
  if (severity === 'major') return '#ff8c44';
  if (severity === 'minor') return '#ffd93d';
  return '#9090a0';
}

function getSeverityBadge(severity) {
  var color = getSeverityColor(severity);
  return '<span class="bug-severity-badge" style="background:' + color + '1a;color:' + color + ';border:1px solid ' + color + '44">' + severity + '</span>';
}

function getStatusBadge(status) {
  var map = {
    backlog:   { label: '📥 待修复', color: '#9090a0' },
    in_progress: { label: '🔄 修复中', color: '#4fc3f7' },
    review:    { label: '👀 待审核', color: '#ffd93d' },
    done:      { label: '✅ 已解决', color: '#4ecdc4' },
    archived:  { label: '📦 已归档', color: '#9090a0' },
  };
  var info = map[status] || { label: status, color: '#9090a0' };
  return '<span class="bug-status-badge" style="background:' + info.color + '1a;color:' + info.color + ';border:1px solid ' + info.color + '44">' + info.label + '</span>';
}

function getSourceLabel(source) {
  var map = {
    manual: '👤 人工',
    verify_failure: '🤖 验证',
    review_rejection: '👀 审核',
  };
  return map[source] || source;
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  var d = new Date(isoStr);
  var now = new Date();
  var diffMs = now - d;
  var diffH = Math.floor(diffMs / 3600000);

  if (diffH < 1) return '刚刚';
  if (diffH < 24) return diffH + 'h 前';
  if (diffH < 168) return Math.floor(diffH / 24) + 'd 前';

  var month = (d.getMonth() + 1).toString().padStart(2, '0');
  var day = d.getDate().toString().padStart(2, '0');
  return month + '-' + day;
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

// ========== 选项交互 ==========
function toggleBugChoice(btn) {
  var group = btn.parentElement;
  var multiple = group.getAttribute('data-multiple') === 'true';
  if (!multiple) {
    group.querySelectorAll('.bug-choice-btn').forEach(function(b) { b.classList.remove('selected'); });
  }
  btn.classList.toggle('selected');
}

function markBugChoiceSelected(input) {
  input.setAttribute('data-selected', input.value ? '1' : '0');
}

async function submitBugChoices() {
  var answers = [];
  _bugQueryAll('.bug-choice-opts').forEach(function(group) {
    var qi = parseInt(group.getAttribute('data-qi'));
    var selected = [];
    group.querySelectorAll('.bug-choice-btn.selected').forEach(function(btn) {
      selected.push(btn.textContent);
    });
    var customInput = group.querySelector('.bug-choice-custom');
    if (customInput && customInput.value.trim()) {
      selected.push(customInput.value.trim());
    }
    if (selected.length > 0) answers.push({ questionIndex: qi, answer: selected.join('; ') });
  });

  if (answers.length === 0) { toast('请至少选择一个选项', 'error'); return; }

  var answerMsg = answers.map(function(a) { return '问题' + (a.questionIndex + 1) + ': ' + a.answer; }).join('\n');
  bugState.conversationHistory.push({ role: 'user', content: answerMsg });

  var area = _bugFindById('bug-clarify-area');
  area.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text2)">🤔 AI 正在分析你的回答...</div>';

  try {
    var resp = await fetch('/api/bugs/clarify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
      body: JSON.stringify({
        projectId: bugState.projectId,
        bugDescription: bugState.bugDescription,
        modelId: bugState.modelId,
        userMessage: answerMsg,
        conversationHistory: bugState.conversationHistory,
      }),
    });
    var result = await resp.json();
    bugState.conversationHistory.push({ role: 'assistant', content: { message: result.message, choices: result.choices } });
    renderBugClarifyResult(result);
  } catch(e) {
    area.innerHTML = '<div style="padding:16px;color:var(--red)">❌ 提交失败: ' + escHtml(e.message) + '</div>';
  }
}

// ========== 跳过澄清直接创建 ==========
async function createBugDirect() {
  var desc = _bugFindById('bug-desc-input').value.trim();
  if (!desc) { toast('请填写缺陷描述', 'error'); return; }

  try {
    var resp = await fetch('/api/bugs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
      body: JSON.stringify({
        projectId: bugState.projectId,
        title: '🐛 ' + desc.substring(0, 60),
        description: desc,
        severity: 'major',
        source: 'manual',
      }),
    });
    var result = await resp.json();
    var area = _bugFindById('bug-clarify-area');
    area.innerHTML = '<div class="bug-result-success">' +
      '<h4>✅ 缺陷已创建</h4>' +
      '<p>任务: <a href="#" onclick="openTaskInWindow(\'' + result.task.id + '\');return false">' + result.task.id + '</a></p>' +
      '<button class="btn-small" onclick="hideBugForm();loadBugList()" style="margin-top:12px">📋 返回缺陷列表</button>' +
      ' &nbsp; <button class="btn-small" onclick="showBugForm()">➕ 提交新缺陷</button>' +
      '</div>';
    toast('缺陷任务已创建 ✅', 'success');
    loadBugList(); // 后台刷新列表
  } catch(e) {
    toast('创建失败: ' + e.message, 'error');
  }
}

// ========== 需求详情快捷跳转 ==========
function openRequirementDetail(reqId) {
  if (typeof openReq === 'function') {
    openReq(reqId);
  } else {
    // fallback: 切换到需求视图
    App.currentReqId = reqId;
    showWorkspaceView('requirements');
  }
}
