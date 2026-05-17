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
      <h3>💬 澄清对话</h3><div class="clarify-thread">${renderThread(req.clarifications || [])}</div>
      ${req.status === 'clarifying' ? renderClarifyInput(req) : ''}
      ${req.status === 'idea' || req.status === 'clarifying' ? renderAiClarifyPanel(req) : ''}
      ${req.status === 'review' ? renderReviewPanel(req) : ''}
      ${req.status === 'approved' ? renderDecomposePanel(req) : ''}
      ${req.status === 'in_execution' ? `<div style="margin-top:12px"><button class="btn-primary" onclick="showWorkspaceView('kanban');refreshKanban('${req.id}');">📌 查看看板</button><button class="btn-small" style="margin-left:8px;background:rgba(255,217,61,0.15);color:var(--accent3);border-color:rgba(255,217,61,0.3)" onclick="showChangePanel('${id}')">📝 需求变更</button></div>` : ''}
      ${req.status === 'idea' ? `<div style="margin-top:12px"><button class="btn-primary" onclick="transitionReq('${id}','clarifying')">▶ 开始澄清</button></div>` : ''}
      ${req.status === 'clarifying' ? `<div style="margin-top:12px"><button class="btn-primary" onclick="simulateSubmitReview('${id}')">📝 提交审核</button></div>` : ''}
      ${req.wiki_path ? `<div class="section"><span class="wiki-link">📚 Wiki: ${escHtml(req.wiki_path)}</span></div>` : ''}
      <div style="margin-top:16px;display:flex;gap:8px">
        <button class="btn-small btn-reject" onclick="deleteRequirement('${id}')">🗑 删除需求</button>
      </div>
      <h3>📋 SRS</h3><div class="srs-preview"><pre>${escHtml(JSON.stringify(srs, null, 2))}</pre></div>`;
  } catch (e) { toast('加载失败: ' + e.message, 'error'); }
  setTimeout(() => loadAiModels(id), 100);
}

function renderThread(cl) {
  if (!cl.length) return '<div class="empty">暂无对话</div>';
  return cl.map(c => `<div class="clarify-msg ${c.role}"><div class="role">${c.role === 'user' ? '👤 用户' : '🤖 ' + escHtml(c.agent_id || '')}</div><div>${escHtml(c.content)}</div></div>`).join('');
}

function renderClarifyInput(req) {
  return `<div class="clarify-input-area"><input type="text" id="clarify-input-${req.id}" placeholder="输入回答..." onkeydown="if(event.key==='Enter')sendMsg('${req.id}')"><button class="btn-primary" onclick="sendMsg('${req.id}')">发送</button></div><div style="margin-top:8px"><button class="btn-small" onclick="simAgentAsk('${req.id}')">🤖 模拟提问</button></div>`;
}

function renderReviewPanel(req) {
  const s = safeParse(req.srs);
  return `<div class="review-panel"><h3>📋 需求审核</h3><div>范围: ${(s.scopeIn || []).join(',')}</div><div>验收: ${(s.acceptanceCriteria || []).join(';')}</div><div class="review-actions"><button class="btn-accept" onclick="approveReq('${req.id}')">✅ 确认通过</button><button class="btn-reject" onclick="rejectReq('${req.id}')">❌ 驳回</button></div></div>`;
}

// ===== 分解面板 =====
function renderDecomposePanel(req) {
  const tasks = [{ title: '核心功能实现', type: 'coding', estimatedHours: 8 }, { title: '测试用例', type: 'testing', estimatedHours: 4 }, { title: '文档更新', type: 'documentation', estimatedHours: 2 }];
  return `<div class="decompose-panel"><h3>📐 任务分解</h3><div id="decompose-items">${tasks.map((t, i) => renderDecItem(i, t)).join('')}</div><div style="margin-top:8px"><button class="btn-small btn-accept" onclick="addDecItem()">+ 添加</button></div><div style="margin-top:12px"><button class="btn-primary" onclick="doDec('${req.id}')">✅ 确认分解</button><button class="btn-small" style="margin-left:8px" onclick="autoDec('${req.id}','${escHtml(req.title).replace(/'/g, "\\'")}')">🤖 智能体分解</button></div></div>`;
}

function renderDecItem(i, t) { return `<div class="decompose-item"><input type="text" value="${escHtml(t.title || '')}" placeholder="标题" class="d-title" style="flex:2"><select class="d-type">${['coding', 'design', 'documentation', 'testing', 'audio', 'modeling'].map(v => `<option ${t.type === v ? 'selected' : ''}>${v}</option>`).join('')}</select><input type="number" value="${t.estimatedHours || 4}" class="d-hours" style="width:60px" min="0.5" step="0.5"><button class="btn-remove" onclick="this.parentElement.remove()">✕</button></div>`; }

function addDecItem() { const c = document.getElementById('decompose-items'); const d = document.createElement('div'); d.innerHTML = renderDecItem(c.children.length, { title: '', type: 'coding', estimatedHours: 4 }); c.appendChild(d.firstElementChild); }

async function autoDec(rid, title) {
  const tasks = [{ title: title + ' — 核心功能', type: 'coding', estimatedHours: 8 }, { title: title + ' — 接口', type: 'coding', estimatedHours: 4 }, { title: title + ' — 测试', type: 'testing', estimatedHours: 4 }, { title: title + ' — 文档', type: 'documentation', estimatedHours: 2 }];
  document.getElementById('decompose-items').innerHTML = tasks.map((t, i) => renderDecItem(i, t)).join('');
  toast('智能体已生成任务', 'success');
}

async function doDec(rid) {
  const items = document.querySelectorAll('#decompose-items .decompose-item');
  const tasks = [];
  items.forEach(el => {
    const t = el.querySelector('.d-title')?.value?.trim();
    if (t) tasks.push({ title: t, type: el.querySelector('.d-type')?.value || 'coding', estimatedHours: parseFloat(el.querySelector('.d-hours')?.value) || 4 });
  });
  if (!tasks.length) return toast('至少添加一个任务', 'error');
  try {
    const r = await Requirements.decompose(rid, tasks);
    toast(`已创建 ${r.count} 个任务 ✅`, 'success');
    loadDashboard(); if (typeof loadKanbanReqFilter === 'function') loadKanbanReqFilter();
    openRequirement(rid);
  } catch (e) { toast('分解失败: ' + e.message, 'error'); }
}

// ===== 操作 =====
async function transitionReq(id, status) { try { await Requirements.transition(id, status); openRequirement(id); loadRequirements(); loadDashboard(); } catch (e) { toast('失败: ' + e.message, 'error'); } }
async function sendMsg(rid) { const i = document.getElementById(`clarify-input-${rid}`); if (!i?.value.trim()) return; try { await Requirements.answer(rid, -1, i.value, 'user'); i.value = ''; openRequirement(rid); } catch (e) { toast('失败: ' + e.message, 'error'); } }
async function simAgentAsk(rid) { const qs = ['需要确认用户场景？', '性能要求？', '需要和现有系统集成吗？', '验收标准可以更具体吗？']; try { await Requirements.clarify(rid, qs[Math.floor(Math.random() * qs.length)], 'agent-analyst-001'); openRequirement(rid); } catch (e) { toast('失败: ' + e.message, 'error'); } }
async function simulateSubmitReview(rid) { try { const req = await Requirements.get(rid); await Requirements.updateSrs(rid, { scopeIn: ['功能A'], acceptanceCriteria: ['正常运行'], summary: `「${req.title}」摘要`, description: req.description || '描述' }); await Requirements.submitReview(rid); openRequirement(rid); loadRequirements(); loadDashboard(); } catch (e) { toast('失败: ' + e.message, 'error'); } }
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
  // 重置历史
  aiClarifyHistory[reqId] = [];
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

    actionsDiv.style.display = result.readyForReview ? 'block' : 'none';

  } catch (e) {
    msgsDiv.innerHTML = `<div style="color:var(--accent2);padding:12px">❌ ${escHtml(e.message)}</div>`;
  }
}

// 追踪每个问题的选择状态: { reqId: { questionIndex: "选中的值" } }
let aiSelections = {};

function collectSelections(reqId) {
  const sel = aiSelections[reqId] || {};
  return Object.entries(sel)
    .filter(([_, v]) => v)
    .map(([k, v]) => v);
}

function renderChoicesWithSubmit(reqId, choices) {
  const choicesDiv = document.getElementById(`ai-clarify-choices-${reqId}`);
  if (!choicesDiv) return;

  if (!aiSelections[reqId]) aiSelections[reqId] = {};

  choicesDiv.innerHTML = choices.map((c, qi) => {
    const current = aiSelections[reqId][qi] || '';
    return `<div style="margin:8px 0;padding:8px;background:var(--bg3);border-radius:6px">
      <strong>${escHtml(c.question)}</strong>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px" id="choice-group-${reqId}-${qi}">
        ${c.options.map((opt, oi) => {
          const val = `${String.fromCharCode(65+oi)}: ${opt}`;
          const selected = current === val;
          return `<button class="btn-small choice-btn ${selected ? 'choice-selected' : ''}"
            style="font-size:12px;transition:all 0.15s"
            onclick="toggleChoice('${reqId}',${qi},'${val.replace(/'/g,"\\'")}',this)">${String.fromCharCode(65+oi)}. ${escHtml(opt)}</button>`;
        }).join('')}
        ${c.allowCustom ? `<button class="btn-small" style="font-size:12px;background:rgba(78,205,196,0.1)" onclick="document.getElementById('ai-clarify-input-${reqId}').focus()">✏️ 自定义</button>` : ''}
      </div>
    </div>`;
  }).join('');

  // 批量提交按钮
  choicesDiv.innerHTML += `
    <div style="margin-top:12px;text-align:center">
      <button class="btn-primary btn-lg" onclick="submitAllChoices('${reqId}')"
        style="padding:10px 32px;font-size:15px">
        ✅ 确认所有选择，发送给 AI
      </button>
    </div>`;
}

function toggleChoice(reqId, qi, val, btn) {
  const current = aiSelections[reqId][qi];
  if (current === val) {
    // 取消选择
    aiSelections[reqId][qi] = '';
    btn.classList.remove('choice-selected');
  } else {
    // 选择此项（单选：同一问题取消其他选项）
    aiSelections[reqId][qi] = val;
    // 更新同组按钮样式
    const group = document.getElementById(`choice-group-${reqId}-${qi}`);
    if (group) {
      group.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('choice-selected'));
    }
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
  try {
    await Requirements.submitReview(reqId);
    toast('已提交审核', 'success');
    openRequirement(reqId); loadRequirements(); loadDashboard();
  } catch (e) { toast('提交失败: ' + e.message, 'error'); }
}

function continueAiClarify(reqId) {
  document.getElementById(`ai-clarify-actions-${reqId}`).style.display = 'none';
  document.getElementById(`ai-clarify-input-${reqId}`)?.focus();
}
