// 系统管理视图 — 独立全屏页面
async function loadAdminPage() {
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
        <div class="stat-card"><div class="num">${status.counts.projects}P / ${status.counts.requirements}R / ${status.counts.tasks}T</div><div class="label">数据量</div></div>
      </div>

      <h3>🤖 大模型配置</h3>
      <div id="model-list" style="margin:8px 0">
        ${models.map(m => renderModelRow(m)).join('') || '<div class="empty" style="padding:12px">暂无模型，请在下方添加</div>'}
      </div>

      <div class="panel-form" style="margin-top:16px">
        <h4>添加/编辑模型</h4>
        <div class="form-two-col">
          <div class="form-group">
            <label>名称 *</label><input type="text" id="model-name" placeholder="DeepSeek">
          </div>
          <div class="form-group">
            <label>供应商 *</label><input type="text" id="model-provider" placeholder="deepseek / openai / ollama">
          </div>
        </div>
        <div class="form-two-col">
          <div class="form-group">
            <label>模型名 *</label><input type="text" id="model-model" placeholder="deepseek-v4-pro">
          </div>
          <div class="form-group">
            <label>API 类型</label>
            <select id="model-api">
              <option value="openai-chat">OpenAI Chat (/v1/chat/completions)</option>
              <option value="anthropic-messages">Anthropic Messages (/v1/messages)</option>
            </select>
          </div>
        </div>
        <div class="form-two-col">
          <div class="form-group">
            <label>Base URL</label><input type="text" id="model-url" placeholder="留空使用默认">
          </div>
          <div class="form-group">
            <label>API Key</label><input type="password" id="model-key" placeholder="sk-...（留空则不修改）">
          </div>
        </div>
        <div class="form-group">
          <label>模型能力</label>
          <div id="model-capabilities" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
            <label class="cap-check"><input type="checkbox" value="text" checked disabled> 📝 文本生成</label>
            <label class="cap-check"><input type="checkbox" value="vision"> 👁️ 视觉理解</label>
            <label class="cap-check"><input type="checkbox" value="json-mode"> 📋 结构化输出</label>
            <label class="cap-check"><input type="checkbox" value="extended-thinking"> 🧠 扩展思考</label>
            <label class="cap-check"><input type="checkbox" value="audio-input"> 🎤 音频理解</label>
            <label class="cap-check"><input type="checkbox" value="function-calling"> 🔧 工具调用</label>
          </div>
        </div>
        <input type="hidden" id="model-edit-id" value="">
        <div class="form-actions">
          <button class="btn-primary" onclick="saveModel()">💾 保存</button>
          <button class="btn-back" onclick="resetModelForm()">取消</button>
        </div>
      </div>

      <h3 style="margin-top:24px">📋 最近事件</h3>
      <div style="max-height:200px;overflow-y:auto;font-size:12px;background:var(--bg2);border-radius:8px;padding:12px">
        ${events.map(e => `<div class="log-entry"><strong>${e.type}</strong> ${e.actor_name||''} → ${e.target_type||''}/${e.target_id||''} <span style="color:var(--text2)">${new Date(e.timestamp).toLocaleString('zh-CN')}</span></div>`).join('')}
      </div>

      <h3 style="margin-top:24px">🛠 数据管理</h3>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-small" onclick="doBackup()">💾 备份数据</button>
        <button class="btn-small" onclick="doCleanup('events')">🧹 清理旧事件</button>
      </div>
    `;
  } catch (e) { document.getElementById('admin-content').innerHTML = `<div class="empty">加载失败: ${e.message}</div>`; }
}

function renderModelRow(m) {
  const apiLabel = m.api === 'anthropic-messages' ? ' [Anthropic]' : '';
  const caps = Array.isArray(m.capabilities) ? m.capabilities : (typeof m.capabilities === 'string' ? JSON.parse(m.capabilities) : ['text']);
  const capIcons = { 'text': '📝', 'vision': '👁️', 'json-mode': '📋', 'extended-thinking': '🧠', 'audio-input': '🎤', 'function-calling': '🔧' };
  return `<div class="config-row" style="padding:8px 0">
    <div>
      <strong>${escHtml(m.name)}</strong>
      <span style="color:var(--text2);margin-left:8px">${m.provider} / ${m.model}</span>
      ${m.api && m.api !== 'openai-chat' ? `<span style="color:var(--accent);margin-left:4px;font-size:11px">[${m.api}]</span>` : ''}
      ${m.baseUrl ? `<span style="color:var(--text2);font-size:11px;margin-left:8px">${m.baseUrl}</span>` : ''}
      <div style="font-size:11px;margin-top:3px;color:var(--text2)">${caps.map(c => capIcons[c] || '').join(' ')} ${caps.join(', ')}</div>
    </div>
    <div style="display:flex;gap:6px">
      <button class="btn-small" onclick="editModel('${m.id}')">✏️ 编辑</button>
      <button class="btn-small btn-reject" onclick="deleteModel('${m.id}')">🗑</button>
    </div>
  </div>`;
}

async function editModel(id) {
  try {
    const models = await api('GET', '/models');
    const m = models.find(mm => mm.id === id);
    if (!m) return;
    document.getElementById('model-edit-id').value = id;
    document.getElementById('model-name').value = m.name;
    document.getElementById('model-provider').value = m.provider;
    document.getElementById('model-model').value = m.model;
    document.getElementById('model-api').value = m.api || 'openai-chat';
    document.getElementById('model-url').value = m.baseUrl || '';
    document.getElementById('model-key').value = '';
    document.getElementById('model-key').placeholder = '留空则不修改';

    // 填充能力复选框
    const caps = Array.isArray(m.capabilities) ? m.capabilities : (typeof m.capabilities === 'string' ? JSON.parse(m.capabilities) : ['text']);
    document.querySelectorAll('#model-capabilities input[type=checkbox]').forEach(cb => {
      cb.checked = caps.includes(cb.value);
    });
  } catch(e) { toast('加载失败: '+e.message, 'error'); }
}

function resetModelForm() {
  document.getElementById('model-edit-id').value = '';
  document.getElementById('model-name').value = '';
  document.getElementById('model-provider').value = '';
  document.getElementById('model-model').value = '';
  document.getElementById('model-api').value = 'openai-chat';
  document.getElementById('model-url').value = '';
  document.getElementById('model-key').value = '';
  document.getElementById('model-key').placeholder = 'sk-...';
}

async function saveModel() {
  const id = document.getElementById('model-edit-id').value;
  const name = document.getElementById('model-name').value.trim();
  const provider = document.getElementById('model-provider').value.trim();
  const model = document.getElementById('model-model').value.trim();
  if (!name || !provider || !model) return toast('请填写名称/供应商/模型', 'error');

  const body = {
    name, provider, model,
    api: document.getElementById('model-api').value,
    baseUrl: document.getElementById('model-url').value.trim(),
  };
  const keyVal = document.getElementById('model-key').value;
  if (keyVal) body.apiKey = keyVal;

  // 收集能力
  const checkedCaps = [];
  document.querySelectorAll('#model-capabilities input[type=checkbox]:not([disabled])').forEach(cb => {
    if (cb.checked) checkedCaps.push(cb.value);
  });
  body.capabilities = checkedCaps;
  // 始终包含 text 能力（基础能力，不可取消）
  if (!body.capabilities.includes('text')) body.capabilities.unshift('text');

  try {
    if (id) {
      await api('PATCH', `/models/${id}`, body);
      toast('模型已更新', 'success');
    } else {
      await api('POST', '/models', body);
      toast('模型已添加', 'success');
    }
    resetModelForm();
    loadAdminPage();
  } catch(e) { toast('保存失败: '+e.message, 'error'); }
}

async function deleteModel(id) {
  if (!(await showConfirm('确认删除此模型配置？'))) return;
  try { await api('DELETE', `/models/${id}`); toast('已删除', 'success'); loadAdminPage(); }
  catch(e) { toast('失败: '+e.message, 'error'); }
}

async function doBackup() {
  try { const r = await api('POST', '/admin/backup'); toast('备份完成: ' + r.backup, 'success'); }
  catch(e) { toast('失败: '+e.message, 'error'); }
}

async function doCleanup(type) {
  if (!(await showConfirm(`确认清理 ${type}？此操作不可撤销。`))) return;
  try { const r = await api('POST', '/admin/cleanup', { type }); toast(`已清理 ${r.cleaned} 条`, 'success'); loadAdminPage(); }
  catch(e) { toast('失败: '+e.message, 'error'); }
}
