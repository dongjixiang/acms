// 需求管理视图 — 列表 + 详情 + 澄清 + SRS + 审核 + 分解
// 依赖: core/state.js, core/utils.js, js/api.js, views/kanban.js

async function loadRequirements() {
  if (!App.currentProjectId) return;
  try {
    const status = document.getElementById('status-filter')?.value || '';
    const reqs = await Requirements.list({ projectId: App.currentProjectId, status: status || undefined, rootOnly: true });
    const container = document.getElementById('req-list');
    if (!reqs.length) { container.innerHTML = '<div class="empty">暂无需求</div>'; return; }
    container.innerHTML = reqs.map(r => `
      <div class="req-card" onclick="openRequirement('${r.id}')">
        <div class="title">${escHtml(r.title)}<span class="status-badge badge-${r.status}">${App.statusLabels[r.status] || r.status}</span></div>
        <div class="meta"><span>${r.id}</span><span>P${r.priority}</span><span>${fmtDate(r.created_at)}</span></div>
      </div>`).join('');
  } catch (e) { toast('加载失败: ' + e.message, 'error'); }
}

function showCreateReq() { document.getElementById('create-req-panel').style.display = 'block'; }
function hideCreateReq() { document.getElementById('create-req-panel').style.display = 'none'; }

async function doCreateReq() {
  const title = document.getElementById('create-title').value.trim();
  if (!title) return toast('请输入标题', 'error');
  try {
    const req = await Requirements.create({
      projectId: App.currentProjectId, title,
      description: document.getElementById('create-desc').value.trim(),
      priority: parseInt(document.getElementById('create-priority').value),
      deadline: document.getElementById('create-deadline').value,
      tags: document.getElementById('create-tags').value.split(',').map(t => t.trim()).filter(Boolean),
    });
    toast('需求创建成功！', 'success');
    hideCreateReq(); loadRequirements(); loadDashboard();
    // 创建后直接打开需求详情
    openRequirement(req.id);
  } catch (e) { toast('创建失败: ' + e.message, 'error'); }
}

// ===== 需求详情 =====
async function openRequirement(id) {
  showWorkspaceView('detail');
  try {
    const req = await Requirements.get(id);
    document.getElementById('detail-title').textContent = `${req.id}: ${escHtml(req.title)}`;
    document.getElementById('detail-status').innerHTML = `
      <span class="status-badge badge-${req.status}">${App.statusLabels[req.status]}</span>
      <button class="btn-small" style="background:rgba(78,205,196,0.15);color:var(--green);border-color:rgba(78,205,196,0.3)" onclick="exportRequirement('${req.id}')">📥 导出 Word</button>`;
    const srs = safeParse(req.srs);
    document.getElementById('detail-content').innerHTML = `
      <div class="section"><strong>描述:</strong></div>
      <div class="md-content">${renderMarkdown(req.structured_description || req.description)}</div>
      <div class="section"><strong>优先级:</strong> P${req.priority} | <strong>截止:</strong> ${req.deadline || '未设置'}</div>
      ${req.status === 'idea' || req.status === 'clarifying' ? renderAiClarifyPanel(req) : ''}
      ${req.status === 'review' ? renderReviewPanel(req) : ''}
      ${req.status === 'approved' ? renderAiDecomposePanel(req) + '<div style="margin-top:8px"><button class="btn-small" style="background:rgba(78,205,196,0.1);color:var(--green)" onclick="openSplitPanel(\'' + id + '\')">🔧 拆分需求</button></div>' : ''}
      ${req.status === 'in_execution' ? `<div id="change-btn-row" style="margin-top:12px"><button class="btn-primary" onclick="showWorkspaceView('kanban');refreshKanban('${req.id}');">📌 查看看板</button><button class="btn-small" style="margin-left:8px;background:rgba(255,217,61,0.15);color:var(--accent3);border-color:rgba(255,217,61,0.3)" onclick="showChangePanel('${id}')">📝 需求变更</button></div>` : ''}
      ${req.status === 'change_requested' ? `<div id="change-btn-row" style="margin-top:12px;padding:12px;background:rgba(255,217,61,0.08);border:1px dashed var(--accent3);border-radius:8px"><span style="color:var(--accent3)">⏳ 变更分析中，请稍候...</span><button class="btn-small" style="margin-left:12px;background:rgba(255,100,100,0.15);color:#f44" onclick="cancelChangePanel('${id}')">取消变更</button></div>` : ''}
      ${req.status === 'impact_analysis' ? `<div id="change-btn-row" style="margin-top:12px;padding:12px;background:rgba(78,205,196,0.08);border:1px dashed var(--green);border-radius:8px"><span style="color:var(--green)">📊 变更影响分析已完成</span><button class="btn-accept" style="margin-left:12px" onclick="confirmChangeSimple('${id}')">✅ 确认变更</button><button class="btn-small" style="margin-left:8px;background:rgba(255,100,100,0.15);color:#f44" onclick="cancelChangePanel('${id}')">取消变更</button></div>` : ''}
      ${req.wiki_path ? `<div class="section"><span class="wiki-link">📚 Wiki: ${escHtml(req.wiki_path)}</span></div>` : ''}
      <div style="margin-top:16px;display:flex;gap:8px">
        <button class="btn-small btn-reject" onclick="deleteRequirement('${id}')">🗑 删除需求</button>
      </div>
      <h3>📋 SRS</h3><div class="srs-preview"><pre>${escHtml(JSON.stringify(srs, null, 2))}</pre></div>
      ${renderArchSpec(req)}
      ${renderChangeHistory(req)}
      <div id="req-children" style="margin-top:16px"></div>`;
  } catch (e) { toast('加载失败: ' + e.message, 'error'); }
  setTimeout(() => loadAiModels(id), 100);
  setTimeout(() => loadDecomposeModels(id), 100);
  setTimeout(() => loadRequirementChildren(id), 150);
}

function renderThread(cl) {
  if (!cl.length) return '<div class="empty">暂无对话</div>';
  return cl.map(c => `<div class="clarify-msg ${c.role}"><div class="role">${c.role === 'user' ? '👤 用户' : '🤖 ' + escHtml(c.agent_id || '')}</div><div>${escHtml(c.content)}</div></div>`).join('');
}

function renderReviewPanel(req) {
  const s = safeParse(req.srs);
  return `<div class="review-panel"><h3>📋 需求审核</h3><div>范围: ${(s.scopeIn||[]).join(',')}</div><div>验收: ${(s.acceptanceCriteria||[]).join(';')}</div><div class="review-actions"><button class="btn-accept" onclick="approveReq('${req.id}')">✅ 确认通过</button><button class="btn-reject" onclick="rejectReq('${req.id}')">❌ 驳回</button></div></div>`;
}

// ===== 审核操作 =====
async function approveReq(id) { try { await Requirements.approve(id); toast('已确认 ✅', 'success'); openRequirement(id); loadRequirements(); loadDashboard(); if (typeof loadKanbanReqFilter === 'function') loadKanbanReqFilter(); } catch (e) { toast('失败: ' + e.message, 'error'); } }
async function rejectReq(id) { const r = prompt('驳回原因:'); try { await Requirements.reject(id, r || '需完善'); toast('已驳回', 'success'); openRequirement(id); loadRequirements(); } catch (e) { toast('失败: ' + e.message, 'error'); } }

// ===== 需求变更管理 =====
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

// ===== 架构宪法展示 =====
function renderArchSpec(req) {
  const archSpec = safeParse(req.arch_spec);
  const childIds = safeParse(req.child_ids || '[]');
  const hasArch = archSpec && (archSpec.domain || archSpec.technical || archSpec.contracts || archSpec.decisions);
  if (!hasArch && childIds.length === 0) return '';

  const s = [];
  s.push('<div class="arch-spec-panel" style="margin-top:16px;padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:8px">');
  s.push('<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">');
  s.push('<h3 style="margin:0">🏛️ 架构宪法</h3>');
  s.push(`<button class="btn-small" onclick="toggleArchSpecEdit('${req.id}')" style="background:rgba(78,205,196,0.1);color:var(--green)">✏️ 编辑</button>`);
  s.push('</div>');

  if (!hasArch) {
    s.push('<div style="color:var(--text2);font-size:13px">尚未定义架构宪法。拆分需求前建议先定义跨模块边界、技术决策和接口契约。</div>');
    s.push(`<div id="arch-spec-edit-${req.id}" style="display:none;margin-top:12px">${archSpecEditor(req.id, archSpec)}</div>`);
    s.push('</div>');
    return s.join('');
  }

  // 业务架构
  if (archSpec.domain) {
    const d = archSpec.domain;
    if (d.boundaries && d.boundaries.length > 0) {
      s.push('<div style="margin-bottom:8px"><strong>📐 模块边界</strong></div>');
      d.boundaries.forEach(b => {
        s.push(`<div style="font-size:12px;padding:4px 8px;margin:2px 0;background:var(--bg);border-radius:4px">`);
        s.push(`<strong>${escHtml(b.module)}</strong>`);
        if (b.owns) s.push(` — 管辖: ${escHtml(b.owns.join(', '))}`);
        if (b.dependsOn) s.push(`<br>↳ 依赖: ${escHtml(b.dependsOn.join(', '))}`);
        s.push('</div>');
      });
    }
    if (d.glossary && d.glossary.length > 0) {
      s.push('<div style="margin-top:8px"><strong>📖 术语表</strong></div>');
      d.glossary.forEach(g => s.push(`<div style="font-size:12px;color:var(--text2)">• <strong>${escHtml(g.term)}</strong>: ${escHtml(g.definition)}</div>`));
    }
    if (d.businessRules && d.businessRules.length > 0) {
      s.push('<div style="margin-top:8px"><strong>📋 业务规则</strong></div>');
      d.businessRules.forEach(r => s.push(`<div style="font-size:12px;color:var(--text2)">• ${escHtml(r.rule)} (主责: ${escHtml(r.owner)})</div>`));
    }
  }

  // 技术架构
  if (archSpec.technical || archSpec.decisions) {
    const tech = archSpec.technical || archSpec;
    s.push('<div style="margin-top:8px"><strong>🔧 技术决策</strong></div>');
    if (tech.decisions) {
      Object.entries(tech.decisions).forEach(([k, v]) => s.push(`<div style="font-size:12px;color:var(--text2)">• ${escHtml(k)}: ${escHtml(v)}</div>`));
    }
    if (tech.sharedSchemas && tech.sharedSchemas.length > 0) {
      s.push('<div style="margin-top:4px"><strong>🗄 共享 Schema</strong></div>');
      tech.sharedSchemas.forEach(sc => s.push(`<div style="font-size:12px;color:var(--text2)">• ${escHtml(sc.name)}</div>`));
    }
    if (tech.repository) {
      s.push('<div style="margin-top:4px"><strong>📂 目录规划</strong></div>');
      s.push(`<div style="font-size:12px;color:var(--text2)">策略: ${tech.repository.strategy || '-'}</div>`);
      if (tech.repository.layout) {
        Object.entries(tech.repository.layout).forEach(([k, v]) => s.push(`<div style="font-size:12px;color:var(--text2)">  ${k} → ${v}</div>`));
      }
    }
    if (tech.constraints) {
      s.push('<div style="margin-top:4px"><strong>📏 全局约束</strong></div>');
      Object.entries(tech.constraints).forEach(([k, v]) => s.push(`<div style="font-size:12px;color:var(--text2)">• ${escHtml(k)}: ${escHtml(v)}</div>`));
    }
  }

  // 模块契约
  if (archSpec.contracts || archSpec.interfaceRegistry) {
    const contracts = archSpec.contracts || archSpec.interfaceRegistry || [];
    if (contracts.length > 0) {
      s.push('<div style="margin-top:8px"><strong>🤝 模块契约</strong></div>');
      contracts.forEach(c => {
        const commitment = c.commitment || c.contract || '';
        s.push(`<div style="font-size:12px;color:var(--text2)">• ${escHtml(c.from)} → ${escHtml(c.to)}: ${escHtml(commitment)}${c.sla ? ' (SLA:'+c.sla+')' : ''}</div>`);
      });
    }
  }

  s.push(`<div id="arch-spec-edit-${req.id}" style="display:none;margin-top:12px">${archSpecEditor(req.id, archSpec)}</div>`);
  s.push('</div>');
  return s.join('');
}

function archSpecEditor(reqId, archSpec) {
  return `<textarea id="arch-spec-textarea-${reqId}" style="width:100%;min-height:200px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:12px;font-size:12px;font-family:monospace;resize:vertical">${escHtml(JSON.stringify(archSpec, null, 2))}</textarea>
    <div style="margin-top:8px;display:flex;gap:8px">
      <button class="btn-accept" onclick="saveArchSpec('${reqId}')">💾 保存宪法</button>
      <button class="btn-back" onclick="toggleArchSpecEdit('${reqId}')">取消</button>
    </div>`;
}

function toggleArchSpecEdit(reqId) {
  const el = document.getElementById(`arch-spec-edit-${reqId}`);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function saveArchSpec(reqId) {
  const textarea = document.getElementById(`arch-spec-textarea-${reqId}`);
  if (!textarea) return;
  try {
    const archSpec = JSON.parse(textarea.value);
    await api('PATCH', `/requirements/${reqId}/arch-spec`, { archSpec });
    toast('架构宪法已保存 ✅', 'success');
    openRequirement(reqId);
  } catch (e) {
    toast('保存失败: ' + (e.message || 'JSON 格式错误'), 'error');
  }
}

async function deleteRequirement(id) {
  if (!(await showConfirm('确认删除此需求？关联的子需求、任务和对话也将被级联删除。'))) return;
  try {
    await api('DELETE', `/requirements/${id}`);
    toast('需求已删除', 'success');
    showWorkspaceView('requirements'); loadRequirements(); loadDashboard();
  } catch (e) { toast('删除失败: ' + e.message, 'error'); }
}

// ===== AI 澄清对话 =====
let aiClarifyHistory = {}; // reqId → [{role, content}]
let aiSplitSuggestion = {}; // reqId → splitSuggestion（持久保留，不随轮次消失）

function renderAiClarifyPanel(req) {
  return `<div class="review-panel" id="ai-clarify-panel">
    <h3>🤖 AI 智能澄清</h3>
    <div class="form-inline" style="margin-bottom:12px">
      <select id="ai-model-select-${req.id}" class="filter-select" style="flex:1">
        <option value="">选择大模型...</option>
      </select>
      <button class="btn-primary" onclick="startAiClarify('${req.id}')">开始对话</button>
    </div>
    <div id="ai-clarify-messages-${req.id}" style="max-height:350px;overflow-y:auto;margin-bottom:12px"></div>
    <div id="ai-clarify-choices-${req.id}"></div>
    <div id="ai-clarify-srs-${req.id}" style="margin-top:12px"></div>
    <div id="ai-clarify-actions-${req.id}" style="display:none;margin-top:12px">
      <button class="btn-accept" onclick="submitAiSrs('${req.id}')">✅ 满意，提交审核</button>
      <button class="btn-back" onclick="continueAiClarify('${req.id}')">继续澄清</button>
    </div>
    <div class="form-inline" style="margin-top:8px">
      <input type="text" id="ai-clarify-input-${req.id}" placeholder="补充说明或选择后发送..." style="flex:1" onkeydown="if(event.key==='Enter')sendAiClarify('${req.id}')">
      <button class="btn-primary" onclick="sendAiClarify('${req.id}')">发送</button>
    </div>
  </div>`;
}

// 打开面板时加载可用模型
async function loadAiModels(reqId) {
  try {
    const models = await api('GET', '/models/active');
    const sel = document.getElementById(`ai-model-select-${reqId}`);
    if (sel) sel.innerHTML = '<option value="">选择大模型...</option>' + models.map(m => `<option value="${m.id}">${escHtml(m.name)} (${m.model})</option>`).join('');
  } catch(e) {}
}

async function startAiClarify(reqId) {
  const modelId = document.getElementById(`ai-model-select-${reqId}`)?.value;
  if (!modelId) return toast('请先选择大模型', 'error');
  // 仅在 idea 状态时推进到 clarifying，避免从 review 等状态回退
  try {
    const req = await Requirements.get(reqId);
    if (req && req.status === 'idea') {
      await Requirements.transition(reqId, 'clarifying');
    }
  } catch(e) { /* 已是指定状态则忽略 */ }
  aiClarifyHistory[reqId] = [];
  aiSelections[reqId] = {};
  aiSplitSuggestion[reqId] = null;
  await sendAiClarify(reqId);
}

async function sendAiClarify(reqId, choiceAnswer) {
  const modelId = document.getElementById(`ai-model-select-${reqId}`)?.value;
  if (!modelId) return toast('请先选择大模型', 'error');

  const input = document.getElementById(`ai-clarify-input-${reqId}`);
  const userMsg = choiceAnswer || (input?.value?.trim() || '');
  if (input && !choiceAnswer) input.value = '';

  // 收集当前所有已选择的选项
  const selections = collectSelections(reqId);
  const hasHistory = (aiClarifyHistory[reqId] || []).length > 0;
  let batchMsg = selections.length > 0 ? selections.join('；') : userMsg;
  // 首次对话：没有选择也没有输入时，发送初始提示
  if (!batchMsg && !hasHistory) {
    batchMsg = '请开始分析这个需求，用选择题帮助我澄清细节。';
  }
  if (!batchMsg) return;

  const msgsDiv = document.getElementById(`ai-clarify-messages-${reqId}`);
  const choicesDiv = document.getElementById(`ai-clarify-choices-${reqId}`);
  const srsDiv = document.getElementById(`ai-clarify-srs-${reqId}`);
  const actionsDiv = document.getElementById(`ai-clarify-actions-${reqId}`);

  aiClarifyHistory[reqId] = aiClarifyHistory[reqId] || [];
  aiClarifyHistory[reqId].push({ role: 'user', content: batchMsg });

  msgsDiv.innerHTML = '<div style="color:var(--text2);text-align:center;padding:12px">⏳ 正在思考...</div>';
  choicesDiv.innerHTML = '';

  try {
    const result = await api('POST', `/ai/requirements/${reqId}/clarify-ai`, {
      modelId,
      message: batchMsg,
      history: aiClarifyHistory[reqId].filter(h => h.role === 'user' || h.role === 'assistant'),
    });

    // 展示对话历史
    const displayHistory = aiClarifyHistory[reqId] || [];
    msgsDiv.innerHTML = displayHistory.map(h =>
      `<div class="clarify-msg ${h.role === 'user' ? 'user' : 'agent'}">
        <div class="role">${h.role === 'user' ? '👤 你' : '🤖 AI'}</div>
        <div>${escHtml(typeof h.content === 'string' ? h.content : h.content.message || '')}</div>
      </div>`
    ).join('') + `<div class="clarify-msg agent"><div class="role">🤖 AI (${escHtml(result.modelUsed)})</div><div>${escHtml(result.message)}</div></div>`;

    aiClarifyHistory[reqId].push({ role: 'assistant', content: result });

    // 渲染选择题（带选择状态追踪）
    if (result.choices && result.choices.length > 0) {
      renderChoicesWithSubmit(reqId, result.choices);
    }

        // 渲染拆分建议（存入持久变量，放在 actions 区域保持可见）
    if (result.splitSuggestion && result.splitSuggestion.shouldSplit) {
      aiSplitSuggestion[reqId] = result.splitSuggestion;
    }
    const ss = aiSplitSuggestion[reqId];
    if (ss && ss.shouldSplit) {
      actionsDiv.innerHTML = `
        <div style="margin:12px 0;padding:12px;background:rgba(78,205,196,0.08);border:1px dashed var(--green);border-radius:6px">
          <div style="font-weight:bold;color:var(--green);margin-bottom:6px">💡 拆分建议（先确认架构宪法再拆分）</div>
          <div style="font-size:13px;color:var(--text2);margin-bottom:8px">${escHtml(ss.reason)}</div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:4px">建议拆分为 ${(ss.suggestedChildren||[]).length} 个子需求：</div>
          ${(ss.suggestedChildren||[]).map(c => `
            <div style="font-size:12px;padding:4px 8px;margin:2px 0;background:var(--bg);border-radius:4px">
              <strong>${escHtml(c.title)}</strong>
              ${c.description ? `<span style="color:var(--text2)"> — ${escHtml(c.description)}</span>` : ''}
            </div>`).join('')}
          <div style="margin-top:8px;display:flex;gap:8px">
            <button class="btn-primary btn-sm" onclick="openSplitPanel('${reqId}', ${JSON.stringify(ss.suggestedChildren || []).replace(/"/g, '&quot;')})">🔧 先定宪法再拆分</button>
          </div>
        </div>` + actionsDiv.innerHTML;
    }

// 渲染 SRS 草稿
    if (result.srs) {
      srsDiv.innerHTML = `<h4>📋 当前 SRS 草稿</h4>
        <div style="font-size:12px;margin:4px 0"><strong>范围:</strong> ${(result.srs.scopeIn||[]).join(', ')||'待确认'}</div>
        <div style="font-size:12px;margin:4px 0"><strong>验收:</strong> ${(result.srs.acceptanceCriteria||[]).join('; ')||'待确认'}</div>
        <div style="font-size:12px;margin:4px 0;color:var(--text2)">${result.srs.summary||''}</div>`;
    }

    // 是否可以提交审核
    if (result.readyForReview) {
      actionsDiv.style.display = 'block';
      actionsDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 自动生成 MD 文档
      generateMdDoc(reqId, modelId);
    } else {
      actionsDiv.style.display = 'none';
    }

  } catch (e) {
    msgsDiv.innerHTML = `<div style="color:var(--accent2);padding:12px">❌ ${escHtml(e.message)}</div>`;
  }
}

// 追踪每个问题的选择状态: { reqId: { questionIndex: { values: ["A: opt1", "B: opt2"], multiple: bool } } }
let aiSelections = {};

function collectSelections(reqId) {
  const sel = aiSelections[reqId] || {};
  return Object.entries(sel)
    .filter(([_, v]) => v.values && v.values.length > 0)
    .map(([k, v]) => v.values.join('，'));
}

function renderChoicesWithSubmit(reqId, choices) {
  const choicesDiv = document.getElementById(`ai-clarify-choices-${reqId}`);
  if (!choicesDiv) return;

  if (!aiSelections[reqId]) aiSelections[reqId] = {};

  choicesDiv.innerHTML = choices.map((c, qi) => {
    const current = aiSelections[reqId][qi] || { values: [], multiple: true };
    current.multiple = true; // 全部多选
    aiSelections[reqId][qi] = current;
    const selectedSet = new Set(current.values);

    return `<div style="margin:8px 0;padding:8px;background:var(--bg3);border-radius:6px">
      <strong>${escHtml(c.question)}</strong>
      ${current.multiple ? '<span style="font-size:10px;color:var(--accent);margin-left:6px">[可多选]</span>' : ''}
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px" id="choice-group-${reqId}-${qi}">
        ${c.options.map((opt, oi) => {
          const val = `${String.fromCharCode(65+oi)}: ${opt}`;
          const selected = selectedSet.has(val);
          return `<button class="btn-small choice-btn ${selected ? 'choice-selected' : ''}"
            style="font-size:12px;transition:all 0.15s"
            onclick="toggleChoice('${reqId}',${qi},'${val.replace(/'/g,"\\'")}',this)">${String.fromCharCode(65+oi)}. ${escHtml(opt)}</button>`;
        }).join('')}
        ${c.allowCustom ? `<button class="btn-small" style="font-size:12px;background:rgba(78,205,196,0.1)" onclick="document.getElementById('ai-clarify-input-${reqId}').focus()">✏️ 自定义</button>` : ''}
      </div>
    </div>`;
  }).join('');

  choicesDiv.innerHTML += `
    <div style="margin-top:12px;text-align:center">
      <button class="btn-primary btn-lg" onclick="submitAllChoices('${reqId}')"
        style="padding:10px 32px;font-size:15px">
        ✅ 确认所有选择，发送给 AI
      </button>
    </div>`;
}

function toggleChoice(reqId, qi, val, btn) {
  // 确保 aiSelections 存在
  if (!aiSelections[reqId]) aiSelections[reqId] = {};
  const current = aiSelections[reqId][qi];
  // 如果 renderChoicesWithSubmit 还没设置，默认多选
  if (!current) {
    aiSelections[reqId][qi] = { values: [], multiple: true };
  }
  const sel = aiSelections[reqId][qi];
  const idx = sel.values.indexOf(val);

  if (idx >= 0) {
    // 取消选择
    sel.values.splice(idx, 1);
    btn.classList.remove('choice-selected');
  } else {
    if (!sel.multiple) {
      // 单选：清除同组其他选择
      sel.values = [];
      const group = document.getElementById(`choice-group-${reqId}-${qi}`);
      if (group) group.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('choice-selected'));
    }
    sel.values.push(val);
    btn.classList.add('choice-selected');
  }
}

async function submitAllChoices(reqId) {
  const selections = collectSelections(reqId);
  if (selections.length === 0) {
    const input = document.getElementById(`ai-clarify-input-${reqId}`);
    const custom = input?.value?.trim();
    if (!custom) return toast('请至少选择一个选项或输入自定义内容', 'error');
  }
  // 合并所有选择 + 自定义输入
  const input = document.getElementById(`ai-clarify-input-${reqId}`);
  const customMsg = input?.value?.trim() || '';
  if (customMsg) {
    aiClarifyHistory[reqId] = aiClarifyHistory[reqId] || [];
    // custom input will be added as user message in sendAiClarify
  }
  await sendAiClarify(reqId);
  // 清除选择状态
  aiSelections[reqId] = {};
}

async function submitAiSrs(reqId) {
  // 先保存编辑后的 MD 文档
  const mdEditor = document.getElementById(`md-editor-${reqId}`);
  if (mdEditor) {
    await Requirements.updateSrs(reqId, { description: mdEditor.value });
  }
  try {
    await Requirements.submitReview(reqId);
    toast('需求已提交审核 ✅', 'success');
    openRequirement(reqId); loadRequirements(); loadDashboard();
  } catch (e) { toast('提交失败: ' + e.message, 'error'); }
}

// ===== AI 生成 MD 需求文档 =====
async function generateMdDoc(reqId, modelId) {
  const srsDiv = document.getElementById(`ai-clarify-srs-${reqId}`);
  if (!srsDiv) return;

  srsDiv.innerHTML += '<div style="margin-top:12px;color:var(--text2)">⏳ 正在生成需求文档...</div>';
  try {
    const result = await api('POST', `/ai-tools/requirements/${reqId}/generate-doc`, { modelId });
    const mdContent = result.content || '';

    srsDiv.innerHTML += `
      <div style="margin-top:12px">
        <h4>📝 需求文档 (Markdown) — 可编辑</h4>
        <textarea id="md-editor-${reqId}" style="width:100%;min-height:300px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:12px;font-size:13px;font-family:monospace;resize:vertical">${escHtml(mdContent)}</textarea>
        <div style="margin-top:8px;display:flex;gap:8px">
          <button class="btn-accept" onclick="saveMdDoc('${reqId}')">💾 保存文档</button>
          <button class="btn-primary" onclick="submitAiSrs('${reqId}')">✅ 确认并提交审核</button>
        </div>
      </div>`;
  } catch(e) {
    srsDiv.innerHTML += `<div style="color:var(--accent2);margin-top:8px">文档生成失败: ${escHtml(e.message)}</div>`;
  }
}

async function saveMdDoc(reqId) {
  const editor = document.getElementById(`md-editor-${reqId}`);
  if (!editor) return;
  try {
    await Requirements.updateSrs(reqId, { description: editor.value });
    toast('文档已保存 💾', 'success');
  } catch(e) { toast('保存失败: '+e.message, 'error'); }
}

// ===== AI 智能任务分解面板 =====
function renderAiDecomposePanel(req) {
  return `<div class="decompose-panel">
    <h3>🤖 AI 智能任务分解</h3>
    <p style="font-size:13px;color:var(--text2);margin-bottom:12px">选择大模型，AI 将根据需求 SRS 自动分解任务（含设计说明和 Wiki 关联）</p>
    <div class="form-inline" style="margin-bottom:12px">
      <select id="ai-decompose-model-${req.id}" class="filter-select" style="flex:1">
        <option value="">选择大模型...</option>
      </select>
      <button class="btn-primary" onclick="aiDecompose('${req.id}')">🤖 AI 分解</button>
    </div>
    <div id="ai-decompose-result-${req.id}"></div>
  </div>`;
}

async function loadDecomposeModels(reqId) {
  try {
    const models = await api('GET', '/models/active');
    const sel = document.getElementById(`ai-decompose-model-${reqId}`);
    if (sel) sel.innerHTML = '<option value="">选择大模型...</option>' + models.map(m => `<option value="${m.id}">${escHtml(m.name)} (${m.model})</option>`).join('');
  } catch(e) {}
}

async function aiDecompose(reqId) {
  const modelId = document.getElementById(`ai-decompose-model-${reqId}`)?.value;
  if (!modelId) return toast('请先选择大模型', 'error');

  const resultDiv = document.getElementById(`ai-decompose-result-${reqId}`);
  resultDiv.innerHTML = '<div style="color:var(--text2);padding:12px">⏳ AI 正在分析需求并分解任务...</div>';

  try {
    const result = await api('POST', `/ai-tools/requirements/${reqId}/decompose-ai`, { modelId });
    resultDiv.innerHTML = `
      <div style="color:var(--green);margin-bottom:8px">✅ 已创建 ${result.count} 个任务 (${escHtml(result.modelUsed)})</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:12px">${escHtml(result.summary || '')}</div>
      ${(result.tasks || []).map(t => `
        <div class="agent-card" style="margin-bottom:6px">
          <div style="display:flex;justify-content:space-between">
            <strong>${escHtml(t.title)}</strong>
            <span style="font-size:12px;color:var(--text2)">${t.estimated_hours}h · ${t.type}</span>
          </div>
          ${t.description ? `<div style="font-size:12px;color:var(--text2);margin:4px 0">${escHtml(t.description).substring(0,200)}</div>` : ''}
          <div class="skills" style="margin-top:4px">
            ${Object.entries(t.required_skills || {}).map(([k,v]) => `<span class="skill-tag">${k}:${v}</span>`).join('')}
          </div>
          ${t.linked_wiki && JSON.parse(t.linked_wiki||'[]').length ? `<div style="font-size:11px;color:var(--text2)">📚 ${JSON.parse(t.linked_wiki).map(w=>w.page).join(', ')}</div>` : ''}
        </div>
      `).join('')}
      <div style="margin-top:12px">
        <button class="btn-primary" onclick="showWorkspaceView('kanban');refreshKanban('${reqId}');">📌 查看看板</button>
        <button class="btn-back" style="margin-left:8px" onclick="openRequirement('${reqId}')">刷新</button>
      </div>`;
    loadDashboard(); loadKanbanReqFilter();
  } catch(e) {
    resultDiv.innerHTML = `<div style="color:var(--accent2)">❌ ${escHtml(e.message)}</div>`;
  }
}

function continueAiClarify(reqId) {
  document.getElementById(`ai-clarify-actions-${reqId}`).style.display = 'none';
  document.getElementById(`ai-clarify-input-${reqId}`)?.focus();
}

// ===== 需求拆分 =====

async function openSplitPanel(reqId, suggestedChildren) {
  const panel = document.getElementById('split-panel');
  if (panel) { panel.remove(); return; }

  // 检查架构宪法是否已定义
  try {
    const req = await Requirements.get(reqId);
    if (req) {
      const archSpec = safeParse(req.arch_spec);
      const hasArch = archSpec && (archSpec.domain || archSpec.technical || archSpec.decisions);
      if (!hasArch) {
        const proceed = await showConfirm(
          '⚠️ 尚未定义架构宪法。拆分前建议先确认跨模块边界、技术决策和接口契约。\n\n是否继续直接拆分？（不推荐）',
          { title: '缺少架构宪法', confirmText: '继续拆分', cancelText: '返回澄清' }
        );
        if (!proceed) return;
      }
    }
  } catch (e) { /* 如果获取失败，仍允许拆分 */ }

  const container = document.getElementById('detail-content');
  const div = document.createElement('div');
  div.id = 'split-panel';
  div.className = 'split-panel';
  div.innerHTML = `
    <h3>🔧 拆分子需求</h3>
    <p style="font-size:13px;color:var(--text2);margin-bottom:12px">将当前需求拆分为多个子需求，每个子需求独立走澄清→评审→分解流程</p>
    <div id="split-children-list">
      ${(suggestedChildren || []).map((c, i) => `
        <div class="split-child-row" style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
          <input type="text" id="split-title-${i}" name="split-title-${i}" class="split-child-title" value="${escHtml(c.title || '')}" placeholder="子需求标题" style="flex:1">
          <input type="text" id="split-desc-${i}" name="split-desc-${i}" class="split-child-desc" value="${escHtml(c.description || '')}" placeholder="简要描述（可选）" style="flex:2">
          <button class="btn-small btn-reject" onclick="this.closest('.split-child-row').remove()" style="flex-shrink:0">✕</button>
        </div>
      `).join('')}
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn-small" onclick="addSplitChildRow()" style="background:rgba(78,205,196,0.1);color:var(--green)">+ 添加子需求</button>
      <button class="btn-primary" onclick="doSplit('${reqId}')">✅ 确认拆分</button>
      <button class="btn-back" onclick="document.getElementById('split-panel').remove()">取消</button>
    </div>
  `;
  container.appendChild(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function addSplitChildRow() {
  const list = document.getElementById('split-children-list');
  if (!list) return;
  const idx = list.children.length;
  const row = document.createElement('div');
  row.className = 'split-child-row';
  row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center';
  row.innerHTML = `
    <input type="text" id="split-title-new-${idx}" name="split-title-new-${idx}" class="split-child-title" placeholder="子需求标题" style="flex:1">
    <input type="text" id="split-desc-new-${idx}" name="split-desc-new-${idx}" class="split-child-desc" placeholder="简要描述（可选）" style="flex:2">
    <button class="btn-small btn-reject" onclick="this.closest('.split-child-row').remove()" style="flex-shrink:0">✕</button>
  `;
  list.appendChild(row);
}

async function doSplit(reqId) {
  const rows = document.querySelectorAll('#split-children-list .split-child-row');
  const children = [];
  rows.forEach(row => {
    const title = row.querySelector('.split-child-title')?.value.trim();
    if (title) {
      children.push({
        title,
        description: row.querySelector('.split-child-desc')?.value.trim() || ''
      });
    }
  });
  if (!children.length) return toast('请至少添加一个子需求', 'error');
  try {
    const result = await Requirements.split(reqId, children);
    toast(`已创建 ${result.children.length} 个子需求 ✅`, 'success');
    document.getElementById('split-panel')?.remove();
    openRequirement(reqId);
    loadRequirements();
    loadDashboard();
  } catch (e) { toast('拆分失败: ' + e.message, 'error'); }
}

async function loadRequirementChildren(reqId) {
  try {
    const children = await Requirements.children(reqId);
    const progress = await Requirements.progress(reqId);
    const container = document.getElementById('req-children');
    if (!container) return;

    if (!children.length) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <div style="margin-bottom:8px">
        <strong>📦 子需求进度</strong>
        <span style="margin-left:8px;font-size:12px;color:var(--text2)">${progress.done}/${progress.total} 已完成</span>
        <div style="height:6px;background:var(--bg);border-radius:3px;margin-top:4px">
          <div style="height:100%;width:${progress.percent}%;background:var(--green);border-radius:3px;transition:width 0.3s"></div>
        </div>
      </div>
      ${children.map(c => `
        <div class="req-child-card" onclick="openRequirement('${c.id}')" style="cursor:pointer">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <span class="status-badge badge-${c.status}" style="font-size:10px;margin-right:6px">${App.statusLabels[c.status] || c.status}</span>
              <strong>${escHtml(c.title)}</strong>
            </div>
            <span style="font-size:11px;color:var(--text2)">${c.id}</span>
          </div>
        </div>
      `).join('')}
    `;
  } catch(e) {}
}

// ===== 导出需求为 Word =====
async function exportRequirement(reqId) {
  try {
    const res = await fetch(`/api/exports/requirement/${reqId}`, {
      headers: { 'X-API-Key': 'dev-key-001' }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '导出失败');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reqId}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('文档已下载 ✅', 'success');
  } catch (e) {
    toast('导出失败: ' + e.message, 'error');
  }
}
