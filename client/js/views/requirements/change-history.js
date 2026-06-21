// ===== 需求变更管理 + 变更历史（v0.13 抽公共，2026-06-21）=====
// 抽自 client/js/views/requirements.js（原 L168-321，154 行）
// 跨文件依赖：api / escHtml / toast / fmtDate / safeParse / loadDashboard（全局）
//              openRequirement / loadRequirements（主文件，script 顺序保证已加载）

let _currentChangeAnalysis = null;
let _taskDecisions = {};

// 步骤1: 显示结构化变更输入表单（插入在需求变更按钮下方）
function showChangePanel(reqId) {
  // 移除已有的变更面板
  const oldForm = document.getElementById('change-form-panel');
  if (oldForm) oldForm.remove();
  const oldImpact = document.getElementById('change-impact-panel');
  if (oldImpact) oldImpact.remove();

  const btnRow = document.getElementById('change-btn-row');
  if (!btnRow) return;
  btnRow.insertAdjacentHTML('afterend', `
    <div class="change-form-panel" id="change-form-panel">
      <h3>📝 需求变更</h3>
      <div class="form-row">
        <label>变更类型</label>
        <select id="change-type">
          <option value="scope_add">🔵 范围增加 — 新增功能/模块</option>
          <option value="scope_modify" selected>🟠 范围修改 — 调整已有逻辑</option>
          <option value="scope_reduce">🔴 范围缩减 — 砍功能/简化</option>
          <option value="text_only">🟢 纯文案/配置 — 不涉及代码逻辑</option>
        </select>
      </div>
      <div class="form-row">
        <label>变更描述</label>
        <textarea id="change-desc" placeholder="描述具体变更内容，例如：增加难度选择（初级9×9、中级16×16、高级30×16），需新增难度切换UI和调整地雷生成算法" rows="3"></textarea>
      </div>
      <div class="review-actions">
        <button class="btn-reject" onclick="cancelChangePanel('${reqId}')">取消</button>
        <button class="btn-accent" onclick="doAnalyzeChange('${reqId}')">🔍 分析影响</button>
      </div>
    </div>`);
}

// 步骤2: 调用分析API并渲染带任务开关的影响报告
async function doAnalyzeChange(reqId) {
  const desc = document.getElementById('change-desc')?.value.trim();
  if (!desc) { toast('请输入变更描述', 'error'); return; }
  const changeType = document.getElementById('change-type')?.value || 'scope_modify';
  try {
    const analysis = await api('POST', `/changes/${reqId}/change/analyze`, { description: desc, changeType });
    _currentChangeAnalysis = analysis;
    _taskDecisions = {};

    // 默认决策：系统建议值
    for (const t of analysis.impact.adjusted || []) _taskDecisions[t.id] = 'freeze';
    for (const t of analysis.impact.discarded || []) _taskDecisions[t.id] = 'discard';

    // 移除表单面板，准备渲染影响报告
    const oldForm = document.getElementById('change-form-panel');
    if (oldForm) oldForm.remove();
    const oldImpact = document.getElementById('change-impact-panel');
    if (oldImpact) oldImpact.remove();

    const btnRow = document.getElementById('change-btn-row');
    if (!btnRow) return;
    const ch = analysis.impact;

    function renderTaskRow(t, cssClass, defaultAction, keepLabel, actionLabel) {
      let progressHtml = t.currentProgress !== undefined ? '<span class="task-progress">' + t.currentProgress + '%</span>' : '';
      return '<div class="impact-row ' + cssClass + '">' +
        '<select onchange="setTaskDecision(' + t.id + ', this.value)" class="task-decision">' +
          '<option value="' + defaultAction + '" selected>' + actionLabel + '</option>' +
          '<option value="keep">' + keepLabel + '</option>' +
        '</select>' +
        '<span class="task-title">' + escHtml(t.title) + '</span>' +
        progressHtml +
      '</div>';
    }

    function renderLockedRow(t) {
      return '<div class="impact-row locked"><span class="lock-icon">🔒</span><span class="task-title">' + escHtml(t.title) + '</span></div>';
    }

    let unchangedHtml = ch.unchanged && ch.unchanged.length ?
      '<div class="impact-group"><h4>✅ 无影响 (' + ch.unchanged.length + ')</h4>' + ch.unchanged.map(renderLockedRow).join('') + '</div>' : '';

    let adjustedHtml = ch.adjusted && ch.adjusted.length ?
      '<div class="impact-group"><h4>⚠️ 需评估 (' + ch.adjusted.length + ')</h4>' + ch.adjusted.map(function(t) { return renderTaskRow(t, 'adjustable', 'freeze', '✅ 保持不变', '🧊 冻结调整'); }).join('') + '</div>' : '';

    let discardedHtml = ch.discarded && ch.discarded.length ?
      '<div class="impact-group"><h4>❌ 建议重做 (' + ch.discarded.length + ')</h4>' + ch.discarded.map(function(t) { return renderTaskRow(t, 'discardable', 'discard', '✅ 保持待办', '🗑 归档重做'); }).join('') + '</div>' : '';

    btnRow.insertAdjacentHTML('afterend', `
      <div class="change-impact-panel" id="change-impact-panel">
        <h3>📊 变更影响报告</h3>
        <p class="change-desc-line">变更: ${escHtml(analysis.changeDescription)}</p>
        ${unchangedHtml}${adjustedHtml}${discardedHtml}
        <p class="extra-hours">⏱ 预估额外工时: <strong>${analysis.estimatedExtraHours}h</strong></p>
        <div class="review-actions">
          <button class="btn-reject" onclick="cancelChangePanel('${reqId}')">取消</button>
          <button class="btn-accept" onclick="confirmChange('${reqId}')">✅ 确认变更</button>
        </div>
      </div>`);

  } catch (e) { toast('分析失败: ' + e.message, 'error'); }
}

function setTaskDecision(taskId, value) {
  _taskDecisions[taskId] = value;
}

// 步骤3: 确认变更（携带用户的任务决策）
async function confirmChange(reqId) {
  try {
    const payload = {
      changeDescription: _currentChangeAnalysis?.changeDescription || (document.querySelector('.change-desc-line')?.textContent || '').replace('变更: ', ''),
      impact: _currentChangeAnalysis?.impact || {},
      taskDecisions: _taskDecisions || {},
    };
    await api('POST', `/changes/${reqId}/change/confirm`, payload);
    _currentChangeAnalysis = null;
    _taskDecisions = {};
    toast('变更已生效，需求回到完善阶段', 'success');
    openRequirement(reqId); loadRequirements(); loadDashboard();
  } catch (e) { toast('确认失败: ' + e.message, 'error'); }
}

// 页面刷新后简化确认（无前端任务决策数据，使用服务端已存储的影响分析）
async function confirmChangeSimple(reqId) {
  try {
    await api('POST', `/changes/${reqId}/change/confirm`, { changeDescription: '', impact: {}, taskDecisions: {} });
    _currentChangeAnalysis = null;
    _taskDecisions = {};
    toast('变更已生效，需求回到完善阶段', 'success');
    openRequirement(reqId); loadRequirements(); loadDashboard();
  } catch (e) { toast('确认失败: ' + e.message, 'error'); }
}

function cancelChangePanel(reqId) {
  _currentChangeAnalysis = null;
  _taskDecisions = {};
  api('POST', `/changes/${reqId}/change/cancel`).catch(() => {});
  openRequirement(reqId);
}

// ===== 变更历史 =====
function renderChangeHistory(req) {
  const history = safeParse(req.change_history);
  if (!history || !history.length) return '';
  return '<div class="change-history">' +
    '<h3>📜 变更历史 (共 ' + history.length + ' 次)</h3>' +
    history.slice().reverse().map(function(h) {
      return '<div class="change-history-item">' +
        '<div class="ch-version">v' + h.version + '</div>' +
        '<div class="ch-reason">' + escHtml(h.reason) + '</div>' +
        '<div class="ch-meta">' + fmtDate(new Date(h.time)) + ' · ' + (h.impact?.summary || '') + '</div>' +
      '</div>';
    }).join('') +
  '</div>';
}
