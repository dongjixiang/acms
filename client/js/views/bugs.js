// 缺陷管理视图 — 提交缺陷 + AI 澄清 + 生成 bug task
// 依赖: core/state.js, core/utils.js, js/api.js

var bugState = {
  projectId: null,
  modelId: null,
  bugDescription: '',
  conversationHistory: [],
  readyToCreate: false,
  analysis: null,
};

async function loadBugView() {
  if (!App.currentProjectId) return;
  bugState.projectId = App.currentProjectId;
  bugState.conversationHistory = [];
  bugState.readyToCreate = false;
  bugState.analysis = null;
  bugState.bugDescription = '';

  // 加载模型列表
  try {
    var modelsResp = await fetch('/api/models', { headers: { 'X-API-Key': 'dev-key-001' } });
    var models = await modelsResp.json();
    var modelOpts = '<option value="">选择 AI 模型</option>';
    models.forEach(function(m) {
      modelOpts += '<option value="' + m.id + '">' + (m.name || m.id) + '</option>';
    });
    document.getElementById('bug-model-select').innerHTML = modelOpts;
  } catch(e) {}

  // 渲染表单
  document.getElementById('bug-panel').innerHTML =
    '<div class="bug-form">' +
      '<h3>🐛 提交缺陷</h3>' +
      '<p style="font-size:13px;color:var(--text2);margin-bottom:12px">描述你遇到的问题，AI 将帮你澄清细节并自动生成修复任务。</p>' +
      '<textarea id="bug-desc-input" placeholder="请描述缺陷：什么页面/功能？什么操作触发的？实际结果 vs 期望结果？" style="width:100%;min-height:120px;padding:12px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:14px;resize:vertical;font-family:inherit"></textarea>' +
      '<div style="display:flex;gap:8px;margin-top:12px;align-items:center">' +
        '<select id="bug-model-select" style="padding:8px 12px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:4px;font-size:13px">' + modelOpts + '</select>' +
        '<button class="btn-accept" onclick="startBugClarify()" style="padding:8px 20px;font-size:14px">🤖 AI 澄清</button>' +
        '<button class="btn-small" onclick="createBugDirect()" style="padding:8px 16px;font-size:12px">跳过澄清，直接创建</button>' +
      '</div>' +
      '<div id="bug-clarify-area" style="margin-top:16px"></div>' +
    '</div>';
}

// 启动 AI 澄清
async function startBugClarify() {
  var desc = document.getElementById('bug-desc-input').value.trim();
  var modelId = document.getElementById('bug-model-select').value;

  if (!desc) { toast('请填写缺陷描述', 'error'); return; }
  if (!modelId) { toast('请选择 AI 模型', 'error'); return; }

  bugState.bugDescription = desc;
  bugState.modelId = modelId;
  bugState.conversationHistory = [];

  var area = document.getElementById('bug-clarify-area');
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

// 渲染 AI 澄清结果（选择题 + 分析）
function renderBugClarifyResult(result) {
  var area = document.getElementById('bug-clarify-area');
  var html = '';

  if (result.phase === 'created') {
    // 缺陷已创建
    html += '<div class="bug-result-success">' +
      '<h4>✅ 缺陷已创建为修复任务</h4>' +
      '<p>' + escHtml(result.message) + '</p>';

    if (result.analysis) {
      html += '<div style="margin:8px 0;padding:10px;background:var(--bg3);border-radius:4px;font-size:13px">' +
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
        '<a href="#" onclick="openTask(\'' + result.task.id + '\');return false" style="color:var(--accent)">📋 查看任务: ' + result.task.id + '</a>' +
        ' &nbsp; ' +
        '<a href="#" onclick="showWorkspaceView(\'kanban\');refreshKanban();return false" style="color:var(--accent)">📌 查看看板</a>' +
        '</p>';
    }
    html += '<button class="btn-small" onclick="loadBugView()" style="margin-top:12px">➕ 提交新缺陷</button></div>';
  } else {
    // 澄清中，显示选择题
    html += '<div class="bug-clarify-message">' +
      '<p style="font-size:14px;margin-bottom:12px">' + escHtml(result.message) + '</p>';

    if (result.analysis) {
      html += '<div style="margin:8px 0;padding:8px 10px;background:var(--bg3);border-radius:4px;font-size:12px;color:var(--text2)">' +
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
        '<button class="btn-small" onclick="loadBugView()">取消</button>' +
        '</div>';
    }

    html += '</div>';
  }

  area.innerHTML = html;
}

function getSeverityColor(severity) {
  if (severity === 'critical') return '#ff4444';
  if (severity === 'major') return '#ff8c44';
  if (severity === 'minor') return '#ffd93d';
  return '#9090a0';
}

// 切换选项选中
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

// 提交选择
async function submitBugChoices() {
  var answers = [];
  document.querySelectorAll('.bug-choice-opts').forEach(function(group) {
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

  // 保存用户消息到历史
  bugState.conversationHistory.push({ role: 'user', content: answerMsg });

  var area = document.getElementById('bug-clarify-area');
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

// 跳过澄清直接创建
async function createBugDirect() {
  var desc = document.getElementById('bug-desc-input').value.trim();
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
    var area = document.getElementById('bug-clarify-area');
    area.innerHTML = '<div class="bug-result-success">' +
      '<h4>✅ 缺陷已创建</h4>' +
      '<p>任务: <a href="#" onclick="openTask(\'' + result.task.id + '\');return false">' + result.task.id + '</a></p>' +
      '<button class="btn-small" onclick="loadBugView()" style="margin-top:12px">➕ 提交新缺陷</button>' +
      '</div>';
    toast('缺陷任务已创建 ✅', 'success');
  } catch(e) {
    toast('创建失败: ' + e.message, 'error');
  }
}
