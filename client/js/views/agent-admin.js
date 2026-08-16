// Agent Registry 管理页面 — 独立全屏页面
// 管理 Agent、工具、委托关系

function _isVisible(el) {
  let n = el.parentElement;
  while (n && n !== document.body) {
    const s = getComputedStyle(n);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    n = n.parentElement;
  }
  return true;
}

function _byId(id) {
  const all = document.querySelectorAll('#' + (window.CSS && CSS.escape ? CSS.escape(id) : id));
  for (const el of all) {
    if (_isVisible(el)) return el;
  }
  return all[0] || null;
}

let agentsCache = [];
let toolsCache = [];

async function loadAgentAdminPage() {
  try {
    const [agentsRes, toolsRes] = await Promise.all([
      api('GET', '/agents'),
      api('GET', '/tools')
    ]);
    
    agentsCache = agentsRes.agents || [];
    toolsCache = toolsRes.tools || [];
    
    renderAgentList();
    renderToolList();
  } catch (e) {
    toast('加载失败: ' + e.message, 'error');
  }
}

function renderAgentList() {
  const container = _byId('agent-list');
  if (!container) return;
  
  const html = agentsCache.map(a => `
    <div class="agent-card" data-id="${a.id}">
      <div class="agent-header">
        <span class="agent-name">${a.name}</span>
        <span class="agent-role ${a.role}">${a.role === 'orchestrator' ? '🎯 编排者' : '⚙️ 执行者'}</span>
      </div>
      <div class="agent-info">
        <span>领域: ${a.domain || 'general'}</span>
        <span>状态: ${a.status === 'online' ? '✅ 在线' : '⭘ 离线'}</span>
      </div>
      <div class="agent-actions">
        <button onclick="testAgentCall('${a.id}')" class="btn-test">测试委托</button>
        <button onclick="editAgent('${a.id}')" class="btn-edit">编辑</button>
      </div>
    </div>
  `).join('');
  
  container.innerHTML = html || '<p class="empty">暂无 Agent</p>';
}

function renderToolList() {
  const container = _byId('tool-list');
  if (!container) return;
  
  const html = toolsCache.map(t => `
    <div class="tool-card">
      <span class="tool-name">${t.name}</span>
      <span class="tool-id">${t.id}</span>
      <span class="tool-category">${t.category || 'general'}</span>
    </div>
  `).join('');
  
  container.innerHTML = html || '<p class="empty">暂无工具</p>';
}

async function testAgentCall(agentId) {
  const agent = agentsCache.find(a => a.id === agentId);
  if (!agent) return;
  
  // 找一个小吉作为发起者
  const xiaoji = agentsCache.find(a => a.id === 'agent-xiaoji');
  if (!xiaoji) {
    toast('找不到小吉 Agent', 'error');
    return;
  }
  
  toast(`测试: ${agent.name} → 等待响应...`, 'info');
  
  try {
    const res = await api('POST', `/agents/${xiaoji.id}/call`, {
      toAgentId: agentId,
      instruction: '回复"测试成功"',
      context: {}
    });
    
    if (res.ok && res.result?.ok) {
      toast(`✅ ${agent.name} 响应成功`, 'success');
      console.log('Agent response:', res.result);
    } else {
      toast(`❌ ${agent.name} 响应失败: ${res.result?.error || res.error}`, 'error');
    }
  } catch (e) {
    toast(`❌ 调用失败: ${e.message}`, 'error');
  }
}

function editAgent(agentId) {
  const agent = agentsCache.find(a => a.id === agentId);
  if (!agent) return;
  
  const newRole = agent.role === 'orchestrator' ? 'worker' : 'orchestrator';
  if (confirm(`确认将 ${agent.name} 改为 ${newRole === 'orchestrator' ? '编排者' : '执行者'}？`)) {
    api('PUT', `/agents/${agentId}`, { role: newRole }).then(() => {
      toast('已更新', 'success');
      loadAgentAdminPage();
    }).catch(e => toast('更新失败: ' + e.message, 'error'));
  }
}

// 初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadAgentAdminPage);
} else {
  loadAgentAdminPage();
}
