// 智能体管理页面 v0.2 — Agent / 工具 / 调用日志 三页签
// v0.2 重写：
//  - 修复 CSS 裸奔（样式移到独立 agent-admin.css 由 index.html 加载）
//  - 修复模态框挂 document.body 被窗口盖住 → 改为窗口内容区内渲染
//  - 修复双 DOM：全量渲染写 hidden 模板 + ACMSWin.refreshView 同步浮窗
//  - 补全功能：新建/编辑/删除 Agent、工具增删改、调用日志、搜索、统计

var agentsCache = [];
var toolsCache = [];
var runtimeToolsCache = [];
var callsCache = [];
var currentTab = 'agents';
var searchQuery = '';
var bindAgentId = null;
var editAgentId = null;
var editToolId = null;
var runtimeExpanded = {};  // 运行时工具域展开状态 {domain: bool}

function loadAgentAdminPage() {
  return new Promise(function(resolve) {
    refreshAgentAdmin().then(function() {
      resolve();
    }).catch(function(e) {
      console.error('loadAgentAdminPage error:', e);
      resolve();
    });
  });
}

async function refreshAgentAdmin() {
  try {
    var agentsReq = api('GET', '/agents').catch(function() { return { agents: [] }; });
    var toolsReq = api('GET', '/tools').catch(function() { return { tools: [] }; });
    var runtimeReq = api('GET', '/tools/runtime').catch(function() { return { tools: [] }; });
    var callsReq = api('GET', '/agents/calls?limit=100').catch(function() { return { calls: [] }; });

    var results = await Promise.all([agentsReq, toolsReq, runtimeReq, callsReq]);
    agentsCache = results[0].agents || [];
    toolsCache = results[1].tools || [];
    runtimeToolsCache = results[2].tools || [];
    callsCache = results[3].calls || [];

    renderPage();
  } catch (e) {
    console.error('refreshAgentAdmin error:', e);
  }
}

/* 刷新所有已打开的智能体管理浮窗（写 hidden 模板后重新克隆） */
function refreshAgentWindows() {
  if (typeof ACMSWin !== 'undefined' && ACMSWin.refreshView) {
    ACMSWin.refreshView('agent-admin');
  }
}

function renderPage() {
  // 独立窗口模式：模板来自 fetch 的 views/agent-admin.html，渲染目标是 visible 窗口副本（_byId 优先）
  var container = _byId('agent-admin-content');
  if (!container) return;

  var stats = renderStats();
  var toolbar = renderToolbar();
  var tabsHtml = renderTabs();
  var agentsHtml = renderAgentsTab();
  var toolsHtml = renderToolsTab();
  var callsHtml = renderCallsTab();

  var html = stats + toolbar + tabsHtml + agentsHtml + toolsHtml + callsHtml;
  // 同时写 hidden 模板（保持一致性）+ 所有浮窗副本
  var allContainers = document.querySelectorAll('#agent-admin-content');
  for (var i = 0; i < allContainers.length; i++) {
    allContainers[i].innerHTML = html;
  }
}

/* ── 统计横条 ── */
function renderStats() {
  var online = agentsCache.filter(function(a) { return a.status === 'online'; }).length;
  var orch = agentsCache.filter(function(a) { return a.role === 'orchestrator'; }).length;
  var bound = agentsCache.reduce(function(n, a) { return n + (a.boundTools || []).length; }, 0);
  var runtimeN = runtimeToolsCache.length || 0;
  return '<div class="aa-stats">' +
    '<span class="aa-stat">🤖 <b>' + agentsCache.length + '</b> Agent</span>' +
    '<span class="aa-stat">✅ <b>' + online + '</b> 在线</span>' +
    '<span class="aa-stat">🎛 <b>' + orch + '</b> 编排者</span>' +
    '<span class="aa-stat">🔧 <b>' + toolsCache.length + '</b> 可绑定工具</span>' +
    '<span class="aa-stat">⚙️ <b>' + runtimeN + '</b> 运行时工具</span>' +
    '<span class="aa-stat">🔗 <b>' + bound + '</b> 绑定</span>' +
    '<span class="aa-stat">📞 <b>' + callsCache.length + '</b> 调用记录</span>' +
  '</div>';
}

/* ── 工具栏（搜索 + 新建） ── */
function renderToolbar() {
  var newBtn = '';
  if (currentTab === 'agents') {
    newBtn = '<button class="aa-btn aa-btn-save" onclick="openAgentForm()">＋ 新建 Agent</button>';
  } else if (currentTab === 'tools') {
    newBtn = '<button class="aa-btn aa-btn-save" onclick="openToolForm()">＋ 新建工具</button>';
  }
  return '<div class="aa-toolbar">' +
    '<input class="aa-search" id="aa-search-input" placeholder="搜索名称 / ID / 领域..." value="' + escHtml(searchQuery) + '" oninput="onSearch(this.value)">' +
    newBtn +
    '<button class="aa-btn" onclick="refreshAgentAdmin()">⟳ 刷新</button>' +
  '</div>';
}

/* ── 页签 ── */
function renderTabs() {
  return '<div class="aa-tabs">' +
    '<button class="aa-tab' + (currentTab === 'agents' ? ' active' : '') + '" data-tab="agents" onclick="switchTab(\'agents\')">🤖 Agents (' + agentsCache.length + ')</button>' +
    '<button class="aa-tab' + (currentTab === 'tools' ? ' active' : '') + '" data-tab="tools" onclick="switchTab(\'tools\')">🔧 Tools (' + toolsCache.length + ')</button>' +
    '<button class="aa-tab' + (currentTab === 'calls' ? ' active' : '') + '" data-tab="calls" onclick="switchTab(\'calls\')">📞 调用日志 (' + callsCache.length + ')</button>' +
  '</div>';
}

function switchTab(tab) {
  currentTab = tab;
  renderPage();
}

function onSearch(q) {
  searchQuery = q;
  // 只重渲染列表内容，保持输入框焦点（同时更新 hidden + 浮窗副本，P88）
  var htmlAgents = buildAgentsListHtml();
  var htmlTools = buildToolsListHtml();
  var allTabAgents = document.querySelectorAll('#tab-agents');
  var allTabTools = document.querySelectorAll('#tab-tools');
  for (var i = 0; i < allTabAgents.length; i++) allTabAgents[i].innerHTML = htmlAgents;
  for (var j = 0; j < allTabTools.length; j++) allTabTools[j].innerHTML = htmlTools;
}

/* ── Agents Tab ── */
function renderAgentsTab() {
  return '<div id="tab-agents" class="aa-tab-content' + (currentTab === 'agents' ? ' active' : '') + '">' + buildAgentsListHtml() + '</div>';
}

function buildAgentsListHtml() {
  var filtered = filterAgents();
  if (!filtered.length) {
    return '<div class="aa-empty">' + (agentsCache.length ? '没有匹配的 Agent' : '暂无 Agent，点击右上角「＋ 新建 Agent」') + '</div>';
  }
  var html = '<div class="aa-grid">';
  filtered.forEach(function(a) {
    html += renderAgentCard(a);
  });
  return html + '</div>';
}

function filterAgents() {
  if (!searchQuery) return agentsCache;
  var q = searchQuery.toLowerCase();
  return agentsCache.filter(function(a) {
    return (a.name || '').toLowerCase().indexOf(q) >= 0 ||
           (a.id || '').toLowerCase().indexOf(q) >= 0 ||
           (a.domain || '').toLowerCase().indexOf(q) >= 0 ||
           (a.model_id || '').toLowerCase().indexOf(q) >= 0;
  });
}

function renderAgentCard(a) {
  var roleLabel = a.role === 'orchestrator' ? '编排者' : '执行者';
  var roleClass = a.role === 'orchestrator' ? 'orch' : 'worker';
  var statusIcon = a.status === 'online' ? '✅' : '⭘';
  var statusClass = a.status === 'online' ? 'aa-status-online' : 'aa-status-offline';

  // 工具 tags
  var toolsHtml = '';
  if (a.boundTools && a.boundTools.length) {
    toolsHtml = a.boundTools.map(function(t) {
      // 运行时工具加 ⚙️ 标记，可绑定工具保持原样
      var mark = t.isRuntime ? ' ⚙️' : '';
      return '<span class="aa-tag">' + escHtml(t.name || t.id) + mark + '</span>';
    }).join('');
  } else {
    toolsHtml = '<span class="aa-none">未绑定工具</span>';
  }

  // 可调用 Agent
  var allowedHtml = '';
  var allowed = a.allowedToCall || [];
  if (allowed.length) {
    allowedHtml = '<div class="aa-allowed"><span>↳ 可调用:</span>' + allowed.map(function(id) {
      var nm = (agentsCache.find(function(x) { return x.id === id; }) || {}).name || id;
      return '<span class="aa-tag">' + escHtml(nm) + '</span>';
    }).join('') + '</div>';
  }

  // 系统提示词
  var promptHtml = '';
  if (a.system_prompt) {
    promptHtml = '<div class="aa-prompt" title="' + escAttr(a.system_prompt) + '">' + escHtml(a.system_prompt) + '</div>';
  }

  // 模型
  var modelHtml = '';
  if (a.model_id) {
    modelHtml = '<div class="aa-model">🧠 模型 <span class="aa-model-tag">' + escHtml(a.model_id) + '</span></div>';
  }

  return '<div class="aa-card' + (editAgentId === a.id ? ' aa-card-edit' : '') + '" data-id="' + escAttr(a.id) + '">' +
    '<div class="aa-card-header">' +
      '<span class="aa-card-name">' + escHtml(a.name) + '</span>' +
      '<span class="aa-badge aa-' + roleClass + '">' + roleLabel + '</span>' +
    '</div>' +
    '<div class="aa-card-id">' + escHtml(a.id) + '</div>' +
    '<div class="aa-card-meta">' +
      '<span>📁 ' + escHtml(a.domain || 'general') + '</span>' +
      '<span class="' + statusClass + '">' + statusIcon + ' ' + (a.status === 'online' ? '在线' : '离线') + '</span>' +
    '</div>' +
    modelHtml +
    allowedHtml +
    promptHtml +
    '<div class="aa-card-tools">' +
      '<div class="aa-tools-label">工具 (' + (a.boundTools || []).length + ')</div>' +
      toolsHtml +
    '</div>' +
    '<div class="aa-card-actions">' +
      '<button class="aa-btn aa-btn-test" onclick="testCall(\'' + escAttr(a.id) + '\')">📞 测试</button>' +
      '<button class="aa-btn aa-btn-bind" onclick="openBindModal(\'' + escAttr(a.id) + '\')">🔗 工具</button>' +
      '<button class="aa-btn" onclick="openAgentForm(\'' + escAttr(a.id) + '\')">✏️ 编辑</button>' +
      '<button class="aa-btn aa-btn-danger" onclick="deleteAgent(\'' + escAttr(a.id) + '\')">🗑 删除</button>' +
    '</div>' +
  '</div>';
}

/* ── Tools Tab ── */
function renderToolsTab() {
  return '<div id="tab-tools" class="aa-tab-content' + (currentTab === 'tools' ? ' active' : '') + '">' + buildToolsListHtml() + '</div>';
}

function buildToolsListHtml() {
  var html = '';
  // 区 1：可绑定工具（tool-store，可增删改）
  html += '<div class="aa-section-title">🔗 可绑定工具 (' + toolsCache.length + ') — 用于 Agent 工具绑定</div>';
  var filtered = filterTools();
  if (!filtered.length) {
    html += '<div class="aa-empty">' + (toolsCache.length ? '没有匹配的可绑定工具' : '暂无可绑定工具，点击右上角「＋ 新建工具」') + '</div>';
  } else {
    html += '<div class="aa-grid">';
    filtered.forEach(function(t) {
      html += renderToolCard(t);
    });
    html += '</div>';
  }

  // 区 2：运行时工具全览（tool-registry，只读）
  html += '<div class="aa-section-title" style="margin-top:20px">⚙️ 运行时工具全览 (' + runtimeToolsCache.length + ') — LLM 实际可调用的全部能力</div>';
  html += buildRuntimeToolsHtml();
  return html;
}

function buildRuntimeToolsHtml() {
  if (!runtimeToolsCache.length) {
    return '<div class="aa-empty">运行时工具加载失败或为空</div>';
  }
  // 按 category（pool domain）分组
  var groups = {};
  runtimeToolsCache.forEach(function(t) {
    var cat = t.category || 'general';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(t);
  });
  var cats = Object.keys(groups).sort();
  var html = '';
  cats.forEach(function(cat) {
    var list = groups[cat];
    var open = runtimeExpanded[cat] === true;
    // 搜索时强制展开
    if (searchQuery) open = true;
    html += '<div class="aa-rt-group">' +
      '<div class="aa-rt-group-head" onclick="toggleRuntimeGroup(\'' + escAttr(cat) + '\')">' +
        '<span class="aa-rt-arrow">' + (open ? '▾' : '▸') + '</span>' +
        '<span class="aa-rt-cat">' + escHtml(cat) + '</span>' +
        '<span class="aa-rt-count">' + list.length + '</span>' +
      '</div>' +
      (open ? '<div class="aa-rt-list">' + list.map(function(t) {
        return '<div class="aa-rt-item">' +
          '<span class="aa-rt-name">' + escHtml(t.name) + '</span>' +
          (t.risk ? '<span class="aa-rt-risk" data-risk="' + escAttr(t.risk) + '">' + escHtml(t.risk) + '</span>' : '') +
          (t.description ? '<span class="aa-rt-desc" title="' + escAttr(t.description) + '">' + escHtml(t.description) + '</span>' : '') +
        '</div>';
      }).join('') + '</div>' : '') +
    '</div>';
  });
  return html;
}

function toggleRuntimeGroup(cat) {
  runtimeExpanded[cat] = !runtimeExpanded[cat];
  // 只重渲染 Tools tab 内容（hidden + 浮窗副本）
  var html = buildToolsListHtml();
  var allTabTools = document.querySelectorAll('#tab-tools');
  for (var j = 0; j < allTabTools.length; j++) allTabTools[j].innerHTML = html;
}

function filterTools() {
  if (!searchQuery) return toolsCache;
  var q = searchQuery.toLowerCase();
  return toolsCache.filter(function(t) {
    return (t.name || '').toLowerCase().indexOf(q) >= 0 ||
           (t.id || '').toLowerCase().indexOf(q) >= 0 ||
           (t.category || '').toLowerCase().indexOf(q) >= 0 ||
           (t.description || '').toLowerCase().indexOf(q) >= 0;
  });
}

function renderToolCard(t) {
  return '<div class="aa-card' + (editToolId === t.id ? ' aa-card-edit' : '') + '">' +
    '<div class="aa-card-header">' +
      '<span class="aa-card-name">' + escHtml(t.name) + '</span>' +
      '<span class="aa-badge aa-tool-cat">' + escHtml(t.category || 'general') + '</span>' +
    '</div>' +
    '<div class="aa-card-id">' + escHtml(t.id) + '</div>' +
    (t.description ? '<div class="aa-card-desc" style="font-size:12px;color:var(--text2);margin:4px 0 8px">' + escHtml(t.description) + '</div>' : '') +
    '<div class="aa-card-actions">' +
      '<button class="aa-btn" onclick="openToolForm(\'' + escAttr(t.id) + '\')">✏️ 编辑</button>' +
      '<button class="aa-btn aa-btn-danger" onclick="deleteTool(\'' + escAttr(t.id) + '\')">🗑 删除</button>' +
    '</div>' +
  '</div>';
}

/* ── 调用日志 Tab ── */
function renderCallsTab() {
  var html = '<div id="tab-calls" class="aa-tab-content' + (currentTab === 'calls' ? ' active' : '') + '">';
  if (!callsCache.length) {
    html += '<div class="aa-empty">暂无调用记录。点击 Agent 卡片上的「📞 测试」发起一次委托调用。</div>';
  } else {
    html += '<div class="aa-calls-list">';
    callsCache.forEach(function(c) {
      html += renderCallItem(c);
    });
    html += '</div>';
  }
  return html + '</div>';
}

function renderCallItem(c) {
  var ok = c.status === 'ok' || c.status === 'success' || (c.result && c.result.ok);
  var statusClass = ok ? 'aa-call-ok' : 'aa-call-fail';
  var statusText = ok ? '✓ 成功' : '✗ ' + (c.error || c.status || '失败');
  var time = '';
  if (c.createdAt || c.timestamp) {
    try { time = new Date(c.createdAt || c.timestamp).toLocaleTimeString('zh-CN', { hour12: false }); } catch (e) {}
  }
  return '<div class="aa-call-item" onclick="showCallDetail(' + callsCache.indexOf(c) + ')">' +
    '<span class="aa-call-from">' + escHtml(c.fromAgent || '?') + '</span>' +
    '<span class="aa-call-arrow">→</span>' +
    '<span class="aa-call-to">' + escHtml(c.toAgent || '?') + '</span>' +
    '<span class="aa-call-instruction" title="' + escAttr(c.instruction || '') + '">' + escHtml(c.instruction || '') + '</span>' +
    '<span class="aa-call-status ' + statusClass + '">' + escHtml(statusText) + '</span>' +
    '<span class="aa-call-time">' + escHtml(time) + '</span>' +
  '</div>';
}

function showCallDetail(idx) {
  var c = callsCache[idx];
  if (!c) return;
  var html = '<div class="aa-modal" onclick="closeWindowModal(event)">' +
    '<div class="aa-modal-box" onclick="event.stopPropagation()">' +
    '<button class="aa-modal-close" onclick="closeWindowModal()">×</button>' +
    '<h3>📞 调用详情</h3>' +
    '<div class="aa-form-row"><label>调用方</label><span>' + escHtml(c.fromAgent || '?') + '</span></div>' +
    '<div class="aa-form-row"><label>目标</label><span>' + escHtml(c.toAgent || '?') + '</span></div>' +
    '<div class="aa-form-row"><label>时间</label><span>' + escHtml(c.createdAt || c.timestamp || '') + '</span></div>' +
    '<div class="aa-section-title">指令</div>' +
    '<div class="aa-call-detail">' + escHtml(c.instruction || '') + '</div>' +
    (c.context ? '<div class="aa-section-title">上下文</div><div class="aa-call-detail">' + escHtml(JSON.stringify(c.context, null, 2)) + '</div>' : '') +
    '<div class="aa-section-title">结果</div>' +
    '<div class="aa-call-detail">' + escHtml(JSON.stringify(c.result || c.error || {}, null, 2)) + '</div>' +
    '<div class="aa-modal-actions"><button class="aa-btn aa-btn-cancel" onclick="closeWindowModal()">关闭</button></div>' +
    '</div></div>';
  showWindowModal(html);
}

/* ── 窗口内模态框（挂当前 visible 浮窗内，不挂 document.body） ── */
/* 兜底 _byId（admin.js 已定义，这里防御重复定义） */
if (typeof window._byId !== 'function') {
  window._byId = function(id) {
    var all = document.querySelectorAll('#' + id);
    for (var i = 0; i < all.length; i++) {
      if (all[i].offsetParent !== null || (getComputedStyle(all[i]).display !== 'none' && getComputedStyle(all[i]).visibility !== 'hidden')) return all[i];
    }
    return all[0] || null;
  };
}

function showWindowModal(html) {
  closeWindowModal();
  // 模态框是交互态 → _byId 优先 visible 浮窗副本（P88），避免 append 到 hidden 模板
  var container = _byId('agent-admin-content');
  if (!container) return;
  var wrap = document.createElement('div');
  wrap.id = 'aa-window-modal';
  wrap.innerHTML = html;
  container.appendChild(wrap);
}

function closeWindowModal() {
  var m = _byId('aa-window-modal');
  if (m) m.remove();
}

/* ── Agent 新建/编辑 ── */
function openAgentForm(agentId) {
  editAgentId = agentId || null;
  var a = agentId ? (agentsCache.find(function(x) { return x.id === agentId; }) || {}) : {};
  var models = [];
  try { models = JSON.parse(localStorage.getItem('acms-llm-models') || '[]'); } catch (e) {}
  var modelOpts = '<option value="">（默认）</option>';
  if (models.length) {
    modelOpts += models.map(function(m) {
      var mid = m.id || m.name || '';
      return '<option value="' + escAttr(mid) + '"' + (a.model_id === mid ? ' selected' : '') + '>' + escHtml(mid) + '</option>';
    }).join('');
  } else {
    modelOpts += '<option value="' + escAttr(a.model_id || '') + '" selected>' + escHtml(a.model_id || '（默认）') + '</option>';
  }

  var allowed = (a.allowedToCall || []).join(', ');
  var html = '<div class="aa-modal" onclick="closeWindowModal(event)">' +
    '<div class="aa-modal-box" onclick="event.stopPropagation()">' +
    '<button class="aa-modal-close" onclick="closeWindowModal()">×</button>' +
    '<h3>' + (agentId ? '✏️ 编辑 Agent' : '＋ 新建 Agent') + '</h3>' +
    '<div class="aa-form-row"><label>ID *</label><input type="text" id="aa-f-id" value="' + escAttr(a.id || '') + '"' + (agentId ? ' disabled' : '') + ' placeholder="agent-xxx-expert"></div>' +
    '<div class="aa-form-row"><label>名称 *</label><input type="text" id="aa-f-name" value="' + escAttr(a.name || '') + '" placeholder="显示名称"></div>' +
    '<div class="aa-form-row"><label>角色</label><select id="aa-f-role">' +
      '<option value="worker"' + (a.role === 'worker' ? ' selected' : '') + '>执行者 worker</option>' +
      '<option value="orchestrator"' + (a.role === 'orchestrator' ? ' selected' : '') + '>编排者 orchestrator</option>' +
    '</select></div>' +
    '<div class="aa-form-row"><label>领域</label><input type="text" id="aa-f-domain" value="' + escAttr(a.domain || 'general') + '" placeholder="word / image / search / general"></div>' +
    '<div class="aa-form-row"><label>模型</label><select id="aa-f-model">' + modelOpts + '</select></div>' +
    '<div class="aa-form-row"><label>可调用</label><input type="text" id="aa-f-allowed" value="' + escAttr(allowed) + '" placeholder="agent-id-1, agent-id-2（编排者专属，逗号分隔）"></div>' +
    '<div class="aa-form-hint">留空则默认不能调用其他 Agent（worker）。</div>' +
    '<div class="aa-form-row"><label>系统提示词</label><textarea id="aa-f-prompt" rows="4" placeholder="该 Agent 的系统提示词...">' + escHtml(a.system_prompt || '') + '</textarea></div>' +
    '<div class="aa-modal-actions">' +
      '<button class="aa-btn aa-btn-cancel" onclick="closeWindowModal()">取消</button>' +
      '<button class="aa-btn aa-btn-save" onclick="saveAgentForm()">保存</button>' +
    '</div>' +
    '</div></div>';
  showWindowModal(html);
}

async function saveAgentForm() {
  var id = (_byId('aa-f-id') || {}).value || '';
  var name = (_byId('aa-f-name') || {}).value || '';
  var role = (_byId('aa-f-role') || {}).value || 'worker';
  var domain = (_byId('aa-f-domain') || {}).value || 'general';
  var modelId = (_byId('aa-f-model') || {}).value || '';
  var allowedRaw = (_byId('aa-f-allowed') || {}).value || '';
  var systemPrompt = (_byId('aa-f-prompt') || {}).value || '';

  if (!name) { toast('请填写名称', 'error'); return; }

  var allowedToCall = allowedRaw.split(',').map(function(s) { return s.trim(); }).filter(Boolean);

  try {
    if (editAgentId) {
      await api('PUT', '/agents/' + editAgentId, { name, role, domain, modelId, systemPrompt, allowedToCall });
      toast('✅ Agent 已更新', 'success');
    } else {
      if (!id) { toast('请填写 ID', 'error'); return; }
      await api('POST', '/agents', { id, name, role, domain, modelId, systemPrompt, allowedToCall });
      toast('✅ Agent 已创建', 'success');
    }
    closeWindowModal();
    editAgentId = null;
    await refreshAgentAdmin();
    refreshAgentWindows();
  } catch (e) {
    toast('保存失败: ' + e.message, 'error');
  }
}

async function deleteAgent(agentId) {
  var a = agentsCache.find(function(x) { return x.id === agentId; });
  var confirmed = await showConfirm('确定删除 Agent「' + (a ? a.name : agentId) + '」？此操作不可恢复。', {
    title: '删除 Agent', confirmText: '删除', cancelText: '取消'
  });
  if (!confirmed) return;
  try {
    await api('DELETE', '/agents/' + agentId);
    toast('✅ Agent 已删除', 'success');
    await refreshAgentAdmin();
    refreshAgentWindows();
  } catch (e) {
    toast('删除失败: ' + e.message, 'error');
  }
}

/* ── 工具新建/编辑 ── */
function openToolForm(toolId) {
  editToolId = toolId || null;
  var t = toolId ? (toolsCache.find(function(x) { return x.id === toolId; }) || {}) : {};
  var html = '<div class="aa-modal" onclick="closeWindowModal(event)">' +
    '<div class="aa-modal-box" onclick="event.stopPropagation()">' +
    '<button class="aa-modal-close" onclick="closeWindowModal()">×</button>' +
    '<h3>' + (toolId ? '✏️ 编辑工具' : '＋ 新建工具') + '</h3>' +
    '<div class="aa-form-row"><label>ID *</label><input type="text" id="aa-t-id" value="' + escAttr(t.id || '') + '"' + (toolId ? ' disabled' : '') + ' placeholder="tool-id"></div>' +
    '<div class="aa-form-row"><label>名称 *</label><input type="text" id="aa-t-name" value="' + escAttr(t.name || '') + '" placeholder="显示名称"></div>' +
    '<div class="aa-form-row"><label>分类</label><input type="text" id="aa-t-cat" value="' + escAttr(t.category || 'general') + '" placeholder="word / image / search / general"></div>' +
    '<div class="aa-form-row"><label>描述</label><textarea id="aa-t-desc" rows="2" placeholder="工具描述...">' + escHtml(t.description || '') + '</textarea></div>' +
    '<div class="aa-form-row"><label>处理器路径</label><input type="text" id="aa-t-handler" value="' + escAttr(t.handlerPath || '') + '" placeholder="server/tools/xxx.js（可选）"></div>' +
    '<div class="aa-modal-actions">' +
      '<button class="aa-btn aa-btn-cancel" onclick="closeWindowModal()">取消</button>' +
      '<button class="aa-btn aa-btn-save" onclick="saveToolForm()">保存</button>' +
    '</div>' +
    '</div></div>';
  showWindowModal(html);
}

async function saveToolForm() {
  var id = (_byId('aa-t-id') || {}).value || '';
  var name = (_byId('aa-t-name') || {}).value || '';
  var category = (_byId('aa-t-cat') || {}).value || 'general';
  var description = (_byId('aa-t-desc') || {}).value || '';
  var handlerPath = (_byId('aa-t-handler') || {}).value || '';

  if (!name) { toast('请填写名称', 'error'); return; }

  try {
    if (editToolId) {
      await api('PUT', '/tools/' + editToolId, { name, category, description, handlerPath });
      toast('✅ 工具已更新', 'success');
    } else {
      if (!id) { toast('请填写 ID', 'error'); return; }
      await api('POST', '/tools', { id, name, category, description, handlerPath });
      toast('✅ 工具已创建', 'success');
    }
    closeWindowModal();
    editToolId = null;
    await refreshAgentAdmin();
    refreshAgentWindows();
  } catch (e) {
    toast('保存失败: ' + e.message, 'error');
  }
}

async function deleteTool(toolId) {
  var t = toolsCache.find(function(x) { return x.id === toolId; });
  var confirmed = await showConfirm('确定删除工具「' + (t ? t.name : toolId) + '」？已绑定的 Agent 将失去该工具。', {
    title: '删除工具', confirmText: '删除', cancelText: '取消'
  });
  if (!confirmed) return;
  try {
    await api('DELETE', '/tools/' + toolId);
    toast('✅ 工具已删除', 'success');
    await refreshAgentAdmin();
    refreshAgentWindows();
  } catch (e) {
    toast('删除失败: ' + e.message, 'error');
  }
}

/* ── 绑定工具模态框 ── */
function openBindModal(agentId) {
  bindAgentId = agentId;
  var agent = agentsCache.find(function(a) { return a.id === agentId; });
  if (!agent) return;

  var boundIds = (agent.boundTools || []).map(function(t) { return t.id; });

  // 已绑定列表（可绑定 store + 运行时工具都显示）
  var boundHtml = '';
  if (boundIds.length) {
    boundHtml = boundIds.map(function(id) {
      var t = toolsCache.find(function(x) { return x.id === id; });
      var rt = runtimeToolsCache.find(function(x) { return x.id === id; });
      var name = (t && t.name) || (rt && rt.name) || id;
      var cat = (t && t.category) || (rt && rt.category) || '';
      return '<div class="aa-bound-item">' +
        '<span class="aa-tool-name">' + escHtml(name) + '</span>' +
        '<span class="aa-tool-cat">' + escHtml(cat) + (rt ? ' · 运行时' : '') + '</span>' +
        '<button class="aa-btn-remove" onclick="unbindTool(\'' + escAttr(agentId) + '\', \'' + escAttr(id) + '\')">移除</button>' +
      '</div>';
    }).join('');
  } else {
    boundHtml = '<div class="aa-none">暂无绑定工具</div>';
  }

  // 可用工具：区 1 可绑定 store + 区 2 运行时分组
  var availableHtml = '';
  // 可绑定 store
  if (toolsCache.length) {
    availableHtml += '<div class="aa-section-title" style="margin-top:8px">可绑定工具 (' + toolsCache.length + ')</div>';
    availableHtml += toolsCache.map(function(t) {
      var checked = boundIds.indexOf(t.id) >= 0 ? 'checked' : '';
      return '<label class="aa-checkbox">' +
        '<input type="checkbox" value="' + escAttr(t.id) + '" ' + checked + ' onchange="toggleTool(this, \'' + escAttr(agentId) + '\', \'' + escAttr(t.id) + '\')">' +
        '<span class="aa-checkbox-text">' + escHtml(t.name) + '</span>' +
        '<span class="aa-tool-cat">' + escHtml(t.category || '') + '</span>' +
      '</label>';
    }).join('');
  }
  // 运行时分组
  var rtGroups = groupRuntimeTools();
  if (rtGroups.length) {
    availableHtml += '<div class="aa-section-title" style="margin-top:12px">运行时工具 (' + runtimeToolsCache.length + ') — LLM 实际可调能力</div>';
    availableHtml += rtGroups.map(function(g) {
      var open = runtimeExpanded['bind_' + g.cat] === true;
      var items = g.tools.map(function(t) {
        var checked = boundIds.indexOf(t.id) >= 0 ? 'checked' : '';
        return '<label class="aa-checkbox">' +
          '<input type="checkbox" value="' + escAttr(t.id) + '" ' + checked + ' onchange="toggleTool(this, \'' + escAttr(agentId) + '\', \'' + escAttr(t.id) + '\')">' +
          '<span class="aa-checkbox-text">' + escHtml(t.name) + '</span>' +
          '<span class="aa-tool-cat">' + escHtml(t.category || '') + (t.risk ? ' · ' + t.risk : '') + '</span>' +
        '</label>';
      }).join('');
      return '<div class="aa-rt-group" style="margin-top:6px">' +
        '<div class="aa-rt-group-head" onclick="toggleBindGroup(\'' + escAttr(g.cat) + '\')">' +
          '<span class="aa-rt-arrow">' + (open ? '▾' : '▸') + '</span>' +
          '<span class="aa-rt-cat">' + escHtml(g.cat) + '</span>' +
          '<span class="aa-rt-count">' + g.tools.length + '</span>' +
        '</div>' +
        (open ? '<div class="aa-rt-list">' + items + '</div>' : '') +
      '</div>';
    }).join('');
  }
  if (!availableHtml) availableHtml = '<div class="aa-none">暂无工具可绑定</div>';

  var html = '<div class="aa-modal" onclick="closeWindowModal(event)">' +
    '<div class="aa-modal-box" onclick="event.stopPropagation()">' +
    '<button class="aa-modal-close" onclick="closeWindowModal()">×</button>' +
    '<h3>🔗 管理工具 - ' + escHtml(agent.name) + '</h3>' +

    '<div class="aa-section-title">已绑定 (' + boundIds.length + ')</div>' +
    '<div class="aa-bound-tools">' + boundHtml + '</div>' +

    availableHtml +

    '<div class="aa-modal-actions">' +
      '<button class="aa-btn aa-btn-cancel" onclick="closeWindowModal()">关闭</button>' +
      '<button class="aa-btn aa-btn-save" onclick="saveBindings(\'' + escAttr(agentId) + '\')">保存绑定</button>' +
    '</div>' +
    '</div></div>';
  showWindowModal(html);
}

function groupRuntimeTools() {
  var groups = {};
  runtimeToolsCache.forEach(function(t) {
    var cat = t.category || 'general';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(t);
  });
  return Object.keys(groups).sort().map(function(cat) {
    return { cat: cat, tools: groups[cat] };
  });
}

function toggleBindGroup(cat) {
  runtimeExpanded['bind_' + cat] = !runtimeExpanded['bind_' + cat];
  var agentId = bindAgentId;
  if (agentId) openBindModal(agentId);
}

async function toggleTool(checkbox, agentId, toolId) {
  try {
    if (checkbox.checked) {
      await api('POST', '/agents/' + agentId + '/tools', { toolId: toolId });
    } else {
      await api('DELETE', '/agents/' + agentId + '/tools/' + toolId);
    }
    // 同步缓存中该 agent 的 boundTools，重开模态框保持打开且状态一致
    var agent = agentsCache.find(function(a) { return a.id === agentId; });
    if (agent) {
      var current = (agent.boundTools || []).map(function(t) { return t.id; });
      if (checkbox.checked) {
        if (current.indexOf(toolId) === -1) agent.boundTools.push({ id: toolId, name: toolId });
      } else {
        agent.boundTools = (agent.boundTools || []).filter(function(t) { return t.id !== toolId; });
      }
    }
    openBindModal(agentId);
  } catch (e) {
    checkbox.checked = !checkbox.checked; // 回滚
    toast('操作失败: ' + e.message, 'error');
  }
}

async function unbindTool(agentId, toolId) {
  try {
    await api('DELETE', '/agents/' + agentId + '/tools/' + toolId);
    var agent = agentsCache.find(function(a) { return a.id === agentId; });
    if (agent) agent.boundTools = (agent.boundTools || []).filter(function(t) { return t.id !== toolId; });
    openBindModal(agentId);
  } catch (e) {
    toast('移除失败: ' + e.message, 'error');
  }
}

async function saveBindings(agentId) {
  // scope 到当前模态框（浮窗副本内），避免命中 hidden 模板（P88）
  var modalBox = _byId('aa-window-modal');
  var checkboxes = modalBox ? modalBox.querySelectorAll('.aa-checkbox input[type="checkbox"]:checked') : [];
  var selectedIds = Array.from(checkboxes).map(function(cb) { return cb.value; });

  var agent = agentsCache.find(function(a) { return a.id === agentId; });
  var currentIds = (agent.boundTools || []).map(function(t) { return t.id; });

  var toAdd = selectedIds.filter(function(id) { return currentIds.indexOf(id) === -1; });
  var toRemove = currentIds.filter(function(id) { return selectedIds.indexOf(id) === -1; });

  try {
    for (var i = 0; i < toAdd.length; i++) {
      await api('POST', '/agents/' + agentId + '/tools', { toolId: toAdd[i] });
    }
    for (var j = 0; j < toRemove.length; j++) {
      await api('DELETE', '/agents/' + agentId + '/tools/' + toRemove[j]);
    }
    closeWindowModal();
    toast('✅ 绑定已保存', 'success');
    await refreshAgentAdmin();
    refreshAgentWindows();
  } catch (e) {
    toast('保存失败: ' + e.message, 'error');
  }
}

/* ── 测试委托 ── */
async function testCall(agentId) {
  var agent = agentsCache.find(function(a) { return a.id === agentId; });
  if (!agent) return;

  var xiaoji = agentsCache.find(function(a) { return a.id === 'agent-xiaoji'; });
  if (!xiaoji) {
    toast('找不到小吉（agent-xiaoji）作为调用方', 'error');
    return;
  }

  var instruction = await showPrompt({
    title: '📞 测试委托调用',
    message: '以小吉身份调用「' + agent.name + '」，输入指令：',
    defaultValue: '请用一句话介绍你自己',
    confirmText: '调用', cancelText: '取消'
  });
  if (instruction === null) return;

  toast('测试: ' + agent.name + '...', 'info');
  try {
    var res = await api('POST', '/agents/' + xiaoji.id + '/call', {
      toAgentId: agentId, instruction: instruction, context: {}
    });
    if (res.ok && res.result && res.result.ok) {
      toast('✅ ' + agent.name + ' 响应成功', 'success');
    } else {
      toast('❌ ' + agent.name + ': ' + (res.result && (res.result.error || res.result.message) || res.error), 'error');
    }
    // 刷新调用日志
    var callsReq = await api('GET', '/agents/calls?limit=100').catch(function() { return { calls: [] }; });
    callsCache = callsReq.calls || [];
    if (currentTab === 'calls') renderPage();
  } catch (e) {
    toast('❌ 调用失败: ' + e.message, 'error');
  }
}

// 全局暴露
if (typeof window !== 'undefined') {
  window.loadAgentAdminPage = loadAgentAdminPage;
  window.refreshAgentAdmin = refreshAgentAdmin;
  window.switchTab = switchTab;
  window.onSearch = onSearch;
  window.openBindModal = openBindModal;
  window.testCall = testCall;
  window.deleteAgent = deleteAgent;
  window.openAgentForm = openAgentForm;
  window.saveAgentForm = saveAgentForm;
  window.deleteTool = deleteTool;
  window.openToolForm = openToolForm;
  window.saveToolForm = saveToolForm;
  window.toggleTool = toggleTool;
  window.unbindTool = unbindTool;
  window.saveBindings = saveBindings;
  window.toggleRuntimeGroup = toggleRuntimeGroup;
  window.toggleBindGroup = toggleBindGroup;
  window.closeWindowModal = closeWindowModal;
  window.showCallDetail = showCallDetail;
}
