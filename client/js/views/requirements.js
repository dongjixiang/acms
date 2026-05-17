// 需求管理视图 — 列表 + 详情 + 澄清 + SRS + 审核 + 分解
// 依赖: core/state.js, core/utils.js, js/api.js, views/kanban.js

async function loadRequirements() {
  if (!App.currentProjectId) return;
  try {
    const status = document.getElementById('status-filter')?.value || '';
    const reqs = await Requirements.list({ projectId: App.currentProjectId, status: status || undefined });
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
    document.getElementById('detail-status').innerHTML = `<span class="status-badge badge-${req.status}">${App.statusLabels[req.status]}</span>`;
    const srs = safeParse(req.srs);
    document.getElementById('detail-content').innerHTML = `
      <div class="section"><strong>描述:</strong> ${escHtml(req.structured_description || req.description || '无')}</div>
      <div class="section"><strong>优先级:</strong> P${req.priority} | <strong>截止:</strong> ${req.deadline || '未设置'}</div>
      ${req.status === 'idea' || req.status === 'clarifying' ? renderAiClarifyPanel(req) : ''}
      ${req.status === 'review' ? renderReviewPanel(req) : ''}
      ${req.status === 'approved' ? renderAiDecomposePanel(req) : ''}
      ${req.status === 'in_execution' ? `<div style="margin-top:12px"><button class="btn-primary" onclick="showWorkspaceView('kanban');refreshKanban('${req.id}');">📌 查看看板</button><button class="btn-small" style="margin-left:8px;background:rgba(255,217,61,0.15);color:var(--accent3);border-color:rgba(255,217,61,0.3)" onclick="showChangePanel('${id}')">📝 需求变更</button></div>` : ''}
      ${req.wiki_path ? `<div class="section"><span class="wiki-link">📚 Wiki: ${escHtml(req.wiki_path)}</span></div>` : ''}
      <div style="margin-top:16px;display:flex;gap:8px">
        <button class="btn-small btn-reject" onclick="deleteRequirement('${id}')">🗑 删除需求</button>
      </div>
      <h3>📋 SRS</h3><div class="srs-preview"><pre>${escHtml(JSON.stringify(srs, null, 2))}</pre></div>`;
  } catch (e) { toast('加载失败: ' + e.message, 'error'); }
  setTimeout(() => loadAiModels(id), 100);
  setTimeout(() => loadDecomposeModels(id), 100);
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
async function showChangePanel(reqId) {
  const desc = prompt('变更描述（例如：增加雷暴天气类型）:');
  if (!desc) return;
  try {
    const analysis = await api('POST', `/changes/${reqId}/change/analyze`, { description: desc });
    const content = document.getElementById('detail-content');
    const existing = content.innerHTML;
    content.innerHTML = `
      <div class="review-panel" id="change-panel">
        <h3>📊 变更影响报告</h3>
        <p style="color:var(--text2);margin-bottom:12px">变更: ${escHtml(analysis.changeDescription)}</p>
        <div style="margin-bottom:12px">
          ${analysis.impact.unchanged.length ? `<div>✅ 无影响 (${analysis.impact.unchanged.length}): ${analysis.impact.unchanged.map(t => t.title).join(', ')}</div>` : ''}
          ${analysis.impact.adjusted.length ? `<div>⚠️ 需调整 (${analysis.impact.adjusted.length}): ${analysis.impact.adjusted.map(t => t.title + '(' + t.reason + ')').join(', ')}</div>` : ''}
          ${analysis.impact.discarded.length ? `<div>❌ 需重做 (${analysis.impact.discarded.length}): ${analysis.impact.discarded.map(t => t.title).join(', ')}</div>` : ''}
        </div>
        <p><strong>预估额外工时:</strong> ${analysis.estimatedExtraHours}h</p>
        <p style="font-size:12px;color:var(--text2)">${analysis.impact.summary}</p>
        <div class="review-actions">
          <button class="btn-accept" onclick="confirmChange('${reqId}')">✅ 确认变更</button>
          <button class="btn-reject" onclick="cancelChangePanel('${reqId}')">取消</button>
        </div>
      </div>
      ${existing}`;
  } catch (e) { toast('分析失败: ' + e.message, 'error'); }
}

async function confirmChange(reqId) {
  try {
    await api('POST', `/changes/${reqId}/change/confirm`, { description: document.querySelector('#change-panel p')?.textContent?.replace('变更: ', '') || '' });
    toast('变更已生效，需求回到完善阶段', 'success');
    openRequirement(reqId); loadRequirements(); loadDashboard();
  } catch (e) { toast('确认失败: ' + e.message, 'error'); }
}

function cancelChangePanel(reqId) {
  api('POST', `/changes/${reqId}/change/cancel`).catch(() => {});
  openRequirement(reqId);
}

async function deleteRequirement(id) {
  if (!confirm('确认删除此需求？关联的任务和对话也将被删除。')) return;
  try {
    await api('DELETE', `/requirements/${id}`);
    toast('需求已删除', 'success');
    showWorkspaceView('requirements'); loadRequirements(); loadDashboard();
  } catch (e) { toast('删除失败: ' + e.message, 'error'); }
}

// ===== AI 澄清对话 =====
let aiClarifyHistory = {}; // reqId → [{role, content}]

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
  // 重置历史 + 推进到 clarifying 状态
  aiClarifyHistory[reqId] = [];
  aiSelections[reqId] = {};
  try { await Requirements.transition(reqId, 'clarifying'); } catch(e) { /* 可能已经是 clarifying */ }
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
    const current = aiSelections[reqId][qi] || { values: [], multiple: c.allowMultiple || false };
    current.multiple = c.allowMultiple || false;
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
  const current = aiSelections[reqId][qi] || { values: [], multiple: false };
  const idx = current.values.indexOf(val);

  if (idx >= 0) {
    // 取消选择
    current.values.splice(idx, 1);
    btn.classList.remove('choice-selected');
  } else {
    if (!current.multiple) {
      // 单选：清除同组其他选择
      current.values = [];
      const group = document.getElementById(`choice-group-${reqId}-${qi}`);
      if (group) group.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('choice-selected'));
    }
    current.values.push(val);
    btn.classList.add('choice-selected');
  }
  aiSelections[reqId][qi] = current;
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
