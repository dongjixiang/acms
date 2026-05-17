// 系统管理视图 — 状态/日志/模型管理/数据管理
async function showAdmin() {
  document.getElementById('admin-overlay').style.display = 'flex';
  try {
    const status = await api('GET', '/admin/status');
    const events = await api('GET', '/admin/events?limit=10');
    const models = await api('GET', '/models');
    document.getElementById('admin-content').innerHTML = `
      <h3>📊 系统状态</h3>
      <div class="stats-row" style="grid-template-columns:repeat(4,1fr);margin:12px 0">
        <div class="stat-card"><div class="num">${Math.floor(status.uptime/3600)}h${Math.floor((status.uptime%3600)/60)}m</div><div class="label">运行时间</div></div>
        <div class="stat-card"><div class="num">${status.memory.used}</div><div class="label">内存</div></div>
        <div class="stat-card"><div class="num">${status.node}</div><div class="label">Node.js</div></div>
        <div class="stat-card"><div class="num">${status.counts.projects}P/${status.counts.requirements}R/${status.counts.tasks}T</div><div class="label">数据量</div></div>
      </div>

      <h3>🤖 大模型配置</h3>
      <div id="model-list" style="margin:8px 0">
        ${models.map(m => `<div class="config-row">
          <span><strong>${escHtml(m.name)}</strong> <span style="color:var(--text2)">${m.provider}/${m.model}</span></span>
          <span><button class="btn-small btn-reject" onclick="deleteModel('${m.id}')" style="font-size:10px">🗑</button></span>
        </div>`).join('') || '<div class="empty" style="padding:8px">暂无模型</div>'}
      </div>
      <div class="form-inline" style="margin-top:8px">
        <input type="text" id="model-name" placeholder="名称 (如 DeepSeek)">
        <input type="text" id="model-provider" placeholder="供应商 (deepseek/openai/ollama)">
        <input type="text" id="model-model" placeholder="模型 (deepseek-v4-pro)">
        <button class="btn-small btn-accept" onclick="addModel()">添加</button>
      </div>
      <div class="form-inline" style="margin-top:4px">
        <input type="text" id="model-url" placeholder="Base URL (可选，默认用供应商的)" style="flex:2">
        <input type="password" id="model-key" placeholder="API Key" style="flex:1">
      </div>

      <h3 style="margin-top:16px">📋 最近事件</h3>
      <div style="max-height:150px;overflow-y:auto;font-size:12px">
        ${events.map(e => `<div class="log-entry"><strong>${e.type}</strong> ${e.actor_name||''} → ${e.target_type||''}/${e.target_id||''} <span style="color:var(--text2)">${new Date(e.timestamp).toLocaleString('zh-CN')}</span></div>`).join('')}
      </div>

      <h3 style="margin-top:16px">🛠 数据管理</h3>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-small" onclick="doBackup()">💾 备份</button>
        <button class="btn-small" onclick="doCleanup('events')">🧹 清理事件</button>
      </div>
    `;
  } catch (e) { document.getElementById('admin-content').innerHTML = `<div class="empty">${e.message}</div>`; }
}

function hideAdmin() { document.getElementById('admin-overlay').style.display = 'none'; }

async function addModel() {
  const name = document.getElementById('model-name').value.trim();
  const provider = document.getElementById('model-provider').value.trim();
  const model = document.getElementById('model-model').value.trim();
  if (!name || !provider || !model) return toast('请填写名称/供应商/模型', 'error');
  try {
    await api('POST', '/models', {
      name, provider, model,
      baseUrl: document.getElementById('model-url').value.trim(),
      apiKey: document.getElementById('model-key').value,
    });
    toast('模型已添加', 'success'); showAdmin();
  } catch (e) { toast('添加失败: ' + e.message, 'error'); }
}

async function deleteModel(id) {
  if (!confirm('删除此模型配置？')) return;
  try { await api('DELETE', `/models/${id}`); toast('已删除', 'success'); showAdmin(); }
  catch (e) { toast('失败: ' + e.message, 'error'); }
}

async function doBackup() {
  try { const r = await api('POST', '/admin/backup'); toast('备份: ' + r.backup, 'success'); }
  catch (e) { toast('失败: ' + e.message, 'error'); }
}

async function doCleanup(type) {
  if (!confirm(`确认清理 ${type}？`)) return;
  try { const r = await api('POST', '/admin/cleanup', { type }); toast(`已清理 ${r.cleaned} 条`, 'success'); showAdmin(); }
  catch (e) { toast('失败: ' + e.message, 'error'); }
}
