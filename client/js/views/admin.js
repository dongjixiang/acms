// 系统管理视图 — 独立全屏页面
async function loadAdminPage() {
  try {
    const status = await api('GET', '/admin/status');
    const events = await api('GET', '/admin/events?limit=10');
    const models = await api('GET', '/models');
    const generators = await api('GET', '/generate');
    const defaultGen = await api('GET', '/admin/default-gen-model');
    const elicitorState = await api('GET', '/admin/elicitor-enabled');

    document.getElementById('admin-content').innerHTML = `
      <h3>📊 系统状态</h3>
      <div class="stats-row" style="grid-template-columns:repeat(4,1fr);margin:12px 0">
        <div class="stat-card"><div class="num">${Math.floor(status.uptime/3600)}h${Math.floor((status.uptime%3600)/60)}m</div><div class="label">运行时间</div></div>
        <div class="stat-card"><div class="num">${status.memory.used}</div><div class="label">内存</div></div>
        <div class="stat-card"><div class="num">${status.node}</div><div class="label">Node.js</div></div>
        <div class="stat-card"><div class="num">${status.counts.projects}P / ${status.counts.requirements}R / ${status.counts.tasks}T</div><div class="label">数据量</div></div>
      </div>

      <h3>🤖 大模型配置 <span style="font-size:12px;font-weight:400;color:var(--text2)">⭐ 默认思路: ${defaultGen.name || '未设置'}</span></h3>
      <div id="model-list" style="margin:8px 0">
        ${models.map(m => renderModelRow(m, defaultGen.id)).join('') || '<div class="empty" style="padding:12px">暂无模型，请在下方添加</div>'}
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

      <h3 style="margin-top:24px">🖼️ 生成器配置</h3>
      <p style="color:var(--text2);font-size:13px;margin:4px 0 8px">图片/音频/视频生成器，可在系统运行时增删改，<code>gen-adapter</code> 根据 provider 字段自动路由</p>
      <div id="gen-list" style="margin:8px 0">
        ${renderGenList(generators)}
      </div>

      <div class="panel-form" style="margin-top:16px">
        <h4>添加/编辑生成器</h4>
        <div class="form-two-col">
          <div class="form-group">
            <label>ID *</label><input type="text" id="gen-id" placeholder="gen-img-minimax（唯一标识，不可重复）">
          </div>
          <div class="form-group">
            <label>类型 *</label>
            <select id="gen-type">
              <option value="image">🖼️ 图片</option>
              <option value="audio">🎵 音频</option>
              <option value="video">🎬 视频</option>
            </select>
          </div>
        </div>
        <div class="form-two-col">
          <div class="form-group">
            <label>Provider *</label>
            <select id="gen-provider">
              <optgroup label="图片">
                <option value="minimax-image">MiniMax Image</option>
                <option value="openai-dalle">OpenAI DALL-E</option>
                <option value="comfyui">ComfyUI</option>
              </optgroup>
              <optgroup label="音频">
                <option value="elevenlabs">ElevenLabs TTS</option>
                <option value="suno">Suno Music</option>
                <option value="minimax-audio">MiniMax Audio</option>
              </optgroup>
              <optgroup label="视频">
                <option value="minimax-video">MiniMax Video</option>
                <option value="animatediff">AnimateDiff (ComfyUI)</option>
              </optgroup>
            </select>
          </div>
          <div class="form-group">
            <label>名称 *</label><input type="text" id="gen-name" placeholder="MiniMax 图片生成">
          </div>
        </div>
        <div class="form-two-col">
          <div class="form-group">
            <label>Base URL</label><input type="text" id="gen-url" placeholder="留空使用默认">
          </div>
          <div class="form-group">
            <label>API Key</label><input type="password" id="gen-key" placeholder="sk-...（留空则不修改）">
          </div>
        </div>
        <div class="form-two-col">
          <div class="form-group">
            <label>关联模型引用</label>
            <select id="gen-model-ref"><option value="">— 不使用模型 API Key —</option>${models.map(m => `<option value="${escHtml(m.id)}">${escHtml(m.name)} (${escHtml(m.provider)}/${escHtml(m.model)})</option>`).join('')}</select>
            <span style="font-size:11px;color:var(--text2)">如果选择了关联模型，生成器将复用该模型的 API Key</span>
          </div>
          <div class="form-group">
            <label>优先级</label><input type="number" id="gen-priority" value="99" min="1" max="999" style="width:80px">
            <span style="font-size:11px;color:var(--text2)">数字越小越优先（自动匹配时使用）</span>
          </div>
        </div>
        <input type="hidden" id="gen-edit-id" value="">
        <div class="form-actions">
          <button class="btn-primary" onclick="saveGenerator()">💾 保存</button>
          <button class="btn-back" onclick="resetGenForm()">取消</button>
        </div>
      </div>

      <h3 style="margin-top:24px">⚙️ 高级设置</h3>
      <p style="color:var(--text2);font-size:13px;margin:4px 0 8px">实验性 / 阶段性功能开关。DB 未配置时回退到环境变量 <code>ELICITOR_ENABLED</code></p>
      <div class="config-row">
        <div>
          <strong>🎯 需求启发师 (Elicitor)</strong>
          <div style="font-size:11px;margin-top:3px;color:var(--text2)">
            启用后，clarify 阶段会走 elicit 路径（诊断 + 工具箱）；未启用走 fallback（旧行为）。
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span id="elicitor-enabled-label" style="font-size:13px;color:${elicitorState.enabled ? 'var(--green)' : 'var(--text2)'}">${elicitorState.enabled ? '已启用' : '已禁用'}</span>
          <label style="position:relative;display:inline-block;width:42px;height:22px;cursor:pointer">
            <input type="checkbox" id="elicitor-enabled-toggle" ${elicitorState.enabled ? 'checked' : ''} onchange="setElicitorEnabled(this)" style="opacity:0;width:0;height:0">
            <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${elicitorState.enabled ? 'var(--green)' : 'var(--border)'};border-radius:22px;transition:0.2s"></span>
            <span style="position:absolute;cursor:pointer;height:18px;width:18px;left:${elicitorState.enabled ? '22px' : '2px'};top:2px;background:#fff;border-radius:50%;transition:0.2s"></span>
          </label>
        </div>
      </div>

      <h3 style="margin-top:24px">📋 最近事件</h3>
      <div style="max-height:200px;overflow-y:auto;font-size:12px;background:var(--bg2);border-radius:8px;padding:12px">
        ${events.map(e => `<div class="log-entry"><strong>${e.type}</strong> ${e.actor_name||''} → ${e.target_type||''}/${e.target_id||''} <span style="color:var(--text2)">${new Date(e.timestamp).toLocaleString('zh-CN', {hour12:false})}</span></div>`).join('')}
      </div>

      <h3 style="margin-top:24px">🛠 数据管理</h3>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-small" onclick="doBackup()">💾 备份数据</button>
        <button class="btn-small" onclick="doCleanup('events')">🧹 清理旧事件</button>
      </div>
    `;
  } catch (e) { document.getElementById('admin-content').innerHTML = `<div class="empty">加载失败: ${e.message}</div>`; }
}

function renderModelRow(m, defaultGenId) {
  const apiLabel = m.api === 'anthropic-messages' ? ' [Anthropic]' : '';
  const caps = Array.isArray(m.capabilities) ? m.capabilities : (typeof m.capabilities === 'string' ? JSON.parse(m.capabilities) : ['text']);
  const capIcons = { 'text': '📝', 'vision': '👁️', 'json-mode': '📋', 'extended-thinking': '🧠', 'audio-input': '🎤', 'function-calling': '🔧' };
  const isDefault = m.id === defaultGenId;
  return `<div class="config-row" style="padding:8px 0${isDefault ? ';background:rgba(255,217,61,0.06);border-radius:6px;padding:8px' : ''}">
    <div>
      <strong>${isDefault ? '⭐ ' : ''}${escHtml(m.name)}</strong>
      <span style="color:var(--text2);margin-left:8px">${m.provider} / ${m.model}</span>
      ${m.api && m.api !== 'openai-chat' ? `<span style="color:var(--accent);margin-left:4px;font-size:11px">[${m.api}]</span>` : ''}
      ${m.baseUrl ? `<span style="color:var(--text2);font-size:11px;margin-left:8px">${m.baseUrl}</span>` : ''}
      <div style="font-size:11px;margin-top:3px;color:var(--text2)">${caps.map(c => capIcons[c] || '').join(' ')} ${caps.join(', ')}</div>
    </div>
    <div style="display:flex;gap:6px;align-items:center">
      ${isDefault ? '<span style="font-size:11px;color:var(--accent3);font-weight:600">默认思路</span>' : `<button class="btn-small" onclick="setDefaultGenModel('${m.id}')" title="设为默认思路模型">⭐</button>`}
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

// ===== 生成器配置 =====

function renderGenList(generators) {
  if (!generators || generators.length === 0) {
    return '<div class="empty" style="padding:12px">暂无生成器，请在下方添加</div>';
  }
  const typeIcons = { image: '🖼️', audio: '🎵', video: '🎬' };
  const providerLabels = {
    'minimax-image': 'MiniMax', 'openai-dalle': 'DALL-E', 'comfyui': 'ComfyUI',
    'elevenlabs': 'ElevenLabs', 'suno': 'Suno', 'minimax-audio': 'MiniMax',
    'minimax-video': 'MiniMax', 'animatediff': 'AnimateDiff',
  };
  return `<div style="font-size:12px;display:flex;flex-direction:column;gap:4px">
    ${generators.map(g => {
      const cfg = g.config || {};
      return `<div class="config-row">
        <div>
          <strong>${typeIcons[g.type] || '📦'} ${escHtml(g.name)}</strong>
          <span style="color:var(--text2);margin-left:8px">${providerLabels[g.provider] || g.provider}</span>
          <span style="color:var(--text3);font-size:11px;margin-left:6px">(${g.id})</span>
          ${g.model_ref ? `<span style="color:var(--accent);font-size:11px;margin-left:6px">🔗 ${escHtml(g.model_ref)}</span>` : ''}
          ${cfg.priority ? `<span style="color:var(--text2);font-size:11px;margin-left:6px">P${cfg.priority}</span>` : ''}
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn-small" onclick="editGenerator('${g.id}')">✏️</button>
          <button class="btn-small btn-reject" onclick="deleteGenerator('${g.id}')">🗑</button>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

async function editGenerator(id) {
  try {
    const gens = await api('GET', '/generate');
    const g = gens.find(gg => gg.id === id);
    if (!g) return toast('生成器不存在', 'error');
    document.getElementById('gen-edit-id').value = id;
    document.getElementById('gen-id').value = g.id;
    document.getElementById('gen-id').disabled = true;
    document.getElementById('gen-type').value = g.type;
    document.getElementById('gen-provider').value = g.provider;
    document.getElementById('gen-name').value = g.name;
    const cfg = g.config || {};
    document.getElementById('gen-url').value = cfg.baseUrl || '';
    document.getElementById('gen-key').value = '';
    document.getElementById('gen-key').placeholder = '留空则不修改';
    document.getElementById('gen-model-ref').value = g.model_ref || '';
    document.getElementById('gen-priority').value = cfg.priority || 99;
  } catch(e) { toast('加载失败: '+e.message, 'error'); }
}

function resetGenForm() {
  document.getElementById('gen-edit-id').value = '';
  document.getElementById('gen-id').value = '';
  document.getElementById('gen-id').disabled = false;
  document.getElementById('gen-type').value = 'image';
  document.getElementById('gen-provider').value = 'minimax-image';
  document.getElementById('gen-name').value = '';
  document.getElementById('gen-url').value = '';
  document.getElementById('gen-key').value = '';
  document.getElementById('gen-key').placeholder = 'sk-...';
  document.getElementById('gen-model-ref').value = '';
  document.getElementById('gen-priority').value = 99;
}

async function saveGenerator() {
  const editId = document.getElementById('gen-edit-id').value;
  const id = document.getElementById('gen-id').value.trim();
  const type = document.getElementById('gen-type').value;
  const provider = document.getElementById('gen-provider').value;
  const name = document.getElementById('gen-name').value.trim();
  if (!id || !type || !provider || !name) return toast('请填写 ID/类型/Provider/名称', 'error');

  const config = {
    baseUrl: document.getElementById('gen-url').value.trim() || undefined,
    priority: parseInt(document.getElementById('gen-priority').value) || 99,
  };
  const keyVal = document.getElementById('gen-key').value;
  if (keyVal) config.apiKey = keyVal;

  const modelRef = document.getElementById('gen-model-ref').value || '';

  const body = { id, type, provider, name, config, modelRef };

  try {
    if (editId) {
      await api('PATCH', `/generate/${editId}`, body);
      toast('生成器已更新', 'success');
    } else {
      await api('POST', '/generate', body);
      toast('生成器已添加', 'success');
    }
    resetGenForm();
    loadAdminPage();
  } catch(e) { toast('保存失败: '+e.message, 'error'); }
}

async function deleteGenerator(id) {
  if (!(await showConfirm(`确认删除生成器「${id}」？`))) return;
  try { await api('DELETE', `/generate/${id}`); toast('已删除', 'success'); loadAdminPage(); }
  catch(e) { toast('失败: '+e.message, 'error'); }
}

// v0.3.6：设为默认思路模型
async function setDefaultGenModel(modelId) {
  try {
    await api('POST', '/admin/default-gen-model', { modelId });
    toast('默认思路模型已更新', 'success');
    loadAdminPage();
  } catch(e) { toast('设置失败: '+e.message, 'error'); }
}

// v0.4 收官后：实时切换 elicitor 软开关（无需重启）
async function setElicitorEnabled(checkbox) {
  const wantChecked = checkbox.checked;
  const original = !wantChecked;
  // 先视觉反馈（POST 成功后再定）
  const label = document.getElementById('elicitor-enabled-label');
  const track = checkbox.parentElement.querySelector('span');
  const knob = checkbox.parentElement.querySelectorAll('span')[1];
  if (label) label.textContent = wantChecked ? '已启用' : '已禁用';
  if (label) label.style.color = wantChecked ? 'var(--green)' : 'var(--text2)';
  if (track) track.style.background = wantChecked ? 'var(--green)' : 'var(--border)';
  if (knob) knob.style.left = wantChecked ? '22px' : '2px';

  try {
    await api('POST', '/admin/elicitor-enabled', { enabled: wantChecked });
    toast(wantChecked ? '需求启发师已启用' : '需求启发师已禁用', 'success');
  } catch(e) {
    // 失败回滚视觉
    checkbox.checked = original;
    if (label) { label.textContent = original ? '已启用' : '已禁用'; label.style.color = original ? 'var(--green)' : 'var(--text2)'; }
    if (track) track.style.background = original ? 'var(--green)' : 'var(--border)';
    if (knob) knob.style.left = original ? '22px' : '2px';
    toast('设置失败: '+e.message, 'error');
  }
}
