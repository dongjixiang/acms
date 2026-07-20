// 系统管理视图 — 独立全屏页面
async function loadAdminPage() {
  try {
    const status = await api('GET', '/admin/status');
    const events = await api('GET', '/admin/events?limit=50');
    const models = await api('GET', '/models');
    const generators = await api('GET', '/generate');
    const defaultGen = await api('GET', '/admin/default-gen-model');
    const elicitorState = await api('GET', '/admin/elicitor-enabled');
    const webhooks = await api('GET', '/webhooks');  // v0.17f：事件 webhook 订阅列表
    const agnesKeyState = await api('GET', '/admin/agnes-key');  // v0.19：Agnes AI Video Key 状态

    // v0.17d 状态卡片配色阈值（uptime / memory %）
    const uptimeH = status.uptime / 3600;
    const uptimeCls = uptimeH > 72 ? 'stat-card-danger' : uptimeH > 24 ? 'stat-card-warning' : '';
    const memUsed = parseInt(String(status.memory.used || '0').match(/(\d+)/)?.[1] || '0', 10);
    const memTotal = parseInt(String(status.memory.total || '0').match(/(\d+)/)?.[1] || '1', 10);
    const memPct = memTotal > 0 ? Math.round(memUsed / memTotal * 100) : 0;
    const memCls = memPct > 80 ? 'stat-card-danger' : memPct > 60 ? 'stat-card-warning' : '';

    document.getElementById('admin-content').innerHTML = `
      <div class="settings-tabs" id="admin-tabs">
        <button class="tab-btn" data-tab="admin-tab-overview">📊 概览</button>
        <button class="tab-btn active" data-tab="admin-tab-models">🤖 模型</button>
        <button class="tab-btn" data-tab="admin-tab-generators">🖼️ 生成器</button>
        <button class="tab-btn" data-tab="admin-tab-advanced">⚙️ 高级</button>
        <button class="tab-btn" data-tab="admin-tab-data">🛠 数据</button>
        <button class="tab-btn" data-tab="admin-tab-events">📋 事件</button>
        <button class="tab-btn" data-tab="admin-tab-webhooks">🔔 Webhooks</button>
        <button class="tab-btn" data-tab="admin-tab-ops">🛠 运营工具</button>
        <button class="tab-btn" data-tab="admin-tab-users">👥 用户管理</button>
      </div>

      <!-- Tab 1 · 概览 — 系统状态卡片（uptime / memory 超阈值变色警示） -->
      <div class="tab-content" id="admin-tab-overview">
        <h3>📊 系统状态</h3>
        <div class="stats-row" style="grid-template-columns:repeat(4,1fr);margin:12px 0">
          <div class="stat-card ${uptimeCls}" title="${uptimeH > 72 ? '运行时间 > 72 小时，建议重启' : uptimeH > 24 ? '运行时间 > 24 小时' : ''}">
            <div class="num">${Math.floor(status.uptime/3600)}h${Math.floor((status.uptime%3600)/60)}m</div>
            <div class="label">运行时间 ${uptimeH > 24 ? (uptimeH > 72 ? '🚨' : '⚠️') : ''}</div>
          </div>
          <div class="stat-card ${memCls}" title="${memPct > 80 ? '内存占用 > 80%' : memPct > 60 ? '内存占用 > 60%' : ''}">
            <div class="num">${memPct}%</div>
            <div class="label">内存 ${status.memory.used} / ${status.memory.total}</div>
          </div>
          <div class="stat-card"><div class="num">${status.node}</div><div class="label">Node.js</div></div>
          <div class="stat-card"><div class="num">${status.counts.projects}P / ${status.counts.requirements}R / ${status.counts.tasks}T</div><div class="label">数据量</div></div>
        </div>
      </div>

      <!-- Tab 2 · 模型 — 列表 + 添加/编辑表单（默认折叠，点 ➕ 或 ✏️ 展开） -->
      <div class="tab-content active" id="admin-tab-models">
        <h3>🤖 大模型配置 <span style="font-size:12px;font-weight:400;color:var(--text2)">⭐ 默认思路: ${defaultGen.name || '未设置'}</span></h3>
        <div id="model-list" style="margin:8px 0">
          ${models.map(m => renderModelRow(m, defaultGen.id)).join('') || '<div class="empty" style="padding:12px">暂无模型，请在下方添加</div>'}
        </div>

        <details id="model-form-details" style="margin-top:16px">
          <summary class="admin-form-toggle">➕ 添加 / 编辑模型</summary>
          <div class="panel-form" style="margin-top:12px">
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
        </details>
      </div>

      <!-- Tab 3 · 生成器 — 列表 + 添加/编辑表单（默认折叠） -->
      <div class="tab-content" id="admin-tab-generators">
        <h3>🖼️ 生成器配置</h3>
        <p style="color:var(--text2);font-size:13px;margin:4px 0 8px">图片/音频/视频生成器，可在系统运行时增删改，<code>gen-adapter</code> 根据 provider 字段自动路由</p>
        <div id="gen-list" style="margin:8px 0">
          ${renderGenList(generators)}
        </div>

        <details id="gen-form-details" style="margin-top:16px">
          <summary class="admin-form-toggle">➕ 添加 / 编辑生成器</summary>
          <div class="panel-form" style="margin-top:12px">
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
                    <option value="agnes-image">Agnes Image 2.0 Flash</option>
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
        </details>
      </div>

      <!-- Tab 4 · 高级 — Elicitor 等实验开关 -->
      <div class="tab-content" id="admin-tab-advanced">
        <h3>⚙️ 高级设置</h3>
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
        <!-- v0.19：Agnes AI Video API Key 配置 -->
        <div class="config-row" style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px">
          <div>
            <strong>🎬 Agnes AI Video API Key</strong>
            <div style="font-size:11px;margin-top:3px;color:var(--text2)">
              用于视频生成工具 <code>agnes_generate_video</code> / <code>agnes_query_video</code>。<br>
              保存后立即生效，无需重启服务。
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
            <span id="agnes-key-status" style="font-size:12px;color:var(--text2)">
              ${agnesKeyState.key_set ? '✅ 已配置' : '❌ 未配置'}
            </span>
            <input type="password" id="agnes-key-input" placeholder="sk-..." style="width:200px;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px">
            <button class="btn-small btn-primary" onclick="saveAgnesKey()">💾 保存</button>
            <button class="btn-small btn-reject" onclick="clearAgnesKey()">🗑 清除</button>
          </div>
        </div>
      </div>

      <!-- Tab 5 · 数据 — 备份 + 清理 -->
      <div class="tab-content" id="admin-tab-data">
        <h3>🛠 数据管理</h3>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn-small" onclick="doBackup()">💾 备份数据</button>
          <button class="btn-small" onclick="doCleanup('events')">🧹 清理旧事件</button>
        </div>
      </div>

      <!-- Tab 6 · 事件 — 最近 event log（前 50 条 + 按 type/target_id 过滤） -->
      <div class="tab-content" id="admin-tab-events">
        <h3>📋 最近事件 <span style="font-size:11px;font-weight:400;color:var(--text3)">（前 50 条）</span></h3>
        <input type="text" id="events-search" placeholder="🔍 按类型 / target_id 过滤（实时筛选）"
               style="width:100%;padding:6px 10px;margin-bottom:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;box-sizing:border-box"
               oninput="filterAdminEvents(this.value)">
        <div id="admin-events-list" style="max-height:400px;overflow-y:auto;font-size:12px;background:var(--bg2);border-radius:8px;padding:12px">
          ${events.map(e => `<div class="log-entry"><strong>${e.type}</strong> ${e.actor_name||''} → ${e.target_type||''}/${e.target_id||''} <span style="color:var(--text2)">${new Date(e.timestamp).toLocaleString('zh-CN', {hour12:false})}</span></div>`).join('')}
        </div>
      </div>

      <!-- Tab 7 · Webhooks — 事件订阅管理（v0.17f：复用 /api/webhooks 已有 CRUD） -->
      <div class="tab-content" id="admin-tab-webhooks">
        <h3>🔔 Webhook 订阅 <span style="font-size:11px;font-weight:400;color:var(--text3)">（${webhooks.length} 个）</span></h3>
        <p style="color:var(--text2);font-size:13px;margin:4px 0 12px">
          ACMS 事件触发时 POST 到订阅 URL，HMAC-SHA256 签名 (<code>X-Hub-Signature-256</code>)。
          <br>典型用法：<strong>分配任务到 Hermes agent</strong> → 任务.claimed 事件 → 推送到 <code>hermes webhook subscribe</code> 拿到的 URL → Hermes 自动调 acms-kanban 跑全生命周期。
        </p>

        <!-- 创建订阅表单 -->
        <details open style="margin-bottom:16px">
          <summary class="admin-form-toggle">➕ 创建新订阅</summary>
          <div class="panel-form" style="margin-top:12px">
            <div class="form-two-col">
              <div class="form-group">
                <label>名称 *</label>
                <input type="text" id="wh-name" placeholder="hermes-acms-tasks">
              </div>
              <div class="form-group">
                <label>接收 URL *</label>
                <input type="text" id="wh-url" placeholder="https://hermes.local:8644/hook/...">
              </div>
            </div>
            <div class="form-group">
              <label>事件类型（多选）</label>
              <div id="wh-events" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
                ${['task.created', 'task.claimed', 'task.submitted', 'task.completed', 'task.review_rejected',
                   'requirement.decomposed', 'requirement.approved', 'requirement.review_submitted', 'requirement.changed',
                   'agent.registered'].map(ev => `
                  <label class="cap-check"><input type="checkbox" value="${ev}"> ${ev}</label>
                `).join('')}
              </div>
            </div>
            <div class="form-two-col">
              <div class="form-group">
                <label>Secret（留空则自动生成 32 位 hex）</label>
                <input type="text" id="wh-secret" placeholder="可选 — 跟 Hermes webhook 订阅的 secret 保持一致">
              </div>
              <div class="form-group">
                <label>说明（备注这个订阅的用途）</label>
                <input type="text" id="wh-description" placeholder="例如：推送到 Hermes 触发 acms-kanban 自动执行">
              </div>
            </div>
            <div class="form-actions">
              <button class="btn-primary" onclick="createWebhook()">💾 创建订阅</button>
              <button class="btn-back" onclick="document.getElementById('wh-name').value='';document.getElementById('wh-url').value='';document.getElementById('wh-secret').value='';document.getElementById('wh-description').value='';document.querySelectorAll('#wh-events input').forEach(c=>c.checked=false);">取消</button>
            </div>
          </div>
        </details>

        <!-- 订阅列表 -->
        <div id="webhooks-list">
          ${webhooks.length === 0 ? '<div class="empty" style="padding:20px;text-align:center;color:var(--text2)">📭 暂无订阅 — 在上方表单创建第一个</div>' :
            webhooks.map(w => `
              <div class="config-row" style="padding:10px 12px;margin-bottom:6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;flex-direction:column;align-items:stretch">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                  <div>
                    <strong>${w.active ? '🟢' : '⚫'} ${escHtml(w.name)}</strong>
                    <span style="color:var(--text3);font-size:11px;margin-left:6px">${escHtml(w.id)}</span>
                    ${w.error_count > 0 ? `<span style="color:#f55;font-size:11px;margin-left:6px">⚠️ 失败 ${w.error_count} 次</span>` : ''}
                  </div>
                  <div style="display:flex;gap:6px">
                    <button class="btn-small" onclick="testWebhook('${w.id}')" title="发送测试 payload">🧪 测试</button>
                    <button class="btn-small" onclick="toggleWebhook('${w.id}', ${!w.active})" title="${w.active ? '暂停' : '启用'}">${w.active ? '⏸️' : '▶️'}</button>
                    <button class="btn-small btn-reject" onclick="deleteWebhook('${w.id}')">🗑</button>
                  </div>
                </div>
                <div style="font-size:11px;color:var(--text2);word-break:break-all;margin-bottom:4px">🔗 ${escHtml(w.url)}</div>
                <div style="font-size:11px;color:var(--text3);margin-bottom:4px">📨 ${w.events.join(', ')}</div>
                <div style="font-size:11px;color:var(--text3);display:flex;gap:12px;flex-wrap:wrap">
                  ${w.secret ? `<span>🔐 secret: <code style="background:var(--bg3);padding:1px 4px;border-radius:3px">${w.secret.slice(0,8)}…${w.secret.slice(-4)}</code></span>` : '<span>🔐 无 secret</span>'}
                  <span>📅 ${new Date(w.created_at).toLocaleString('zh-CN', {hour12:false})}</span>
                  ${w.last_triggered ? `<span>🕐 最近触发: ${new Date(w.last_triggered).toLocaleString('zh-CN', {hour12:false})}</span>` : '<span>🕐 尚未触发</span>'}
                  ${w.description ? `<span>💬 ${escHtml(w.description)}</span>` : ''}
                </div>
</div>
            `).join('')}
        </div>
      </div>

      <!-- Tab · 运营工具 — 想法池 + 自我改进（之前 header 上的 💡/🔄 入口移到这里） -->
      <div class="tab-content" id="admin-tab-ops">
        <h3>🛠 运营工具</h3>
        <p class="hint" style="color:var(--text2);font-size:12px;margin:4px 0 12px">
          管理 ACMS 自身的反馈渠道：随手记录想法、跟进自动生成的改进报告。所有按钮都与下面"完整看板"双向同步。
        </p>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:16px;margin-top:8px">
          <!-- 想法池 -->
          <div class="panel-form" style="display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <h4 style="margin:0">💡 想法池</h4>
              <button class="btn-primary" onclick="showIdeaDialog()" style="font-size:12px">+ 记录想法</button>
            </div>
            <div id="ops-idea-stats" style="font-size:11px;color:var(--text2);min-height:48px">
              <span>⏳ 加载中…</span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn-secondary" onclick="openOpsTabToImprovements('reports')" style="font-size:12px">📋 打开完整看板</button>
              <button class="btn-secondary" onclick="openOpsTabToImprovements('reports','idea')" style="font-size:12px">💭 仅看想法</button>
            </div>
          </div>

          <!-- 自我改进 -->
          <div class="panel-form" style="display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <h4 style="margin:0">🔄 自我改进</h4>
            </div>
            <div id="ops-improvement-stats" style="font-size:11px;color:var(--text2);min-height:48px">
              <span>⏳ 加载中…</span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn-secondary" onclick="openOpsTabToImprovements('board')" style="font-size:12px">📊 任务看板</button>
              <button class="btn-secondary" onclick="openOpsTabToImprovements('reports')" style="font-size:12px">📋 改进报告</button>
            </div>
          </div>
        </div>

        <div style="margin-top:16px;padding:10px 12px;background:var(--bg2);border-radius:6px;font-size:11px;color:var(--text2)">
          💡 快捷键：<kbd style="background:var(--bg3);padding:1px 6px;border-radius:3px;border:1px solid var(--border)">Ctrl</kbd> +
          <kbd style="background:var(--bg3);padding:1px 6px;border-radius:3px;border:1px solid var(--border)">I</kbd>
          （Mac: <kbd style="background:var(--bg3);padding:1px 6px;border-radius:3px;border:1px solid var(--border)">⌘</kbd> +
          <kbd style="background:var(--bg3);padding:1px 6px;border-radius:3px;border:1px solid var(--border)">I</kbd>）
          在任意页面快速打开"记录想法"对话框
        </div>
      </div>

      <!-- Tab · 用户管理 -->
      <div class="tab-content" id="admin-tab-users">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 style="margin:0">👥 用户管理</h3>
          <button class="btn-primary" onclick="showCreateUserDialog()" style="font-size:12px">+ 创建用户</button>
        </div>
        <div id="user-list" style="font-size:13px">
          <span style="color:var(--text2)">⏳ 加载中…</span>
        </div>
      </div>
    `;
    setupAdminTabs();
    // 加载"运营工具"tab 的统计（异步）
    loadOpsTabStats();
  } catch (e) { document.getElementById('admin-content').innerHTML = `<div class="empty">加载失败: ${e.message}</div>`; }
}

// admin Tab 切换：scope 到 #admin-tabs + #admin-content（默认），也支持传入克隆窗口根节点
//   区别于 setupSettingsTabs（settings 全局 .tab-btn），避免 admin 容器 + settings 容器同时在 DOM 时相互干扰
//   当 admin HTML 被克隆进浮窗时（taskbar.js showAdminWindow），DOM 里会出现两份 #admin-tabs / #admin-content，
//   共享同一份 handler 逻辑但只命中第一份，浮窗里的 tab 点不动。修复：传入 root 后仅 scope 到该 root。
function setupAdminTabs(root) {
  const tabBar = root ? root.querySelector('#admin-tabs') : document.getElementById('admin-tabs');
  const adminRoot = root || document.getElementById('admin-content');
  if (!tabBar || !adminRoot) return;
  tabBar.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      tabBar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      adminRoot.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      const tabEl = adminRoot.querySelector('#' + btn.dataset.tab);
      if (tabEl) tabEl.classList.add('active');
    };
  });
}

// v0.17d：事件 Tab 实时过滤（按 type / actor_name / target_type / target_id 子串匹配）
function filterAdminEvents(query) {
  const q = (query || '').toLowerCase().trim();
  document.querySelectorAll('#admin-events-list .log-entry').forEach(el => {
    el.style.display = !q || el.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

// v0.17f：Webhook 订阅 CRUD（复用 server/routes/webhooks.js 已有 REST API）
async function createWebhook() {
  const name = document.getElementById('wh-name').value.trim();
  const url = document.getElementById('wh-url').value.trim();
  const secret = document.getElementById('wh-secret').value.trim();
  const description = document.getElementById('wh-description').value.trim();
  const events = Array.from(document.querySelectorAll('#wh-events input[type=checkbox]:checked')).map(c => c.value);
  if (!name || !url) return toast('名称和 URL 是必填项', 'error');
  if (events.length === 0) return toast('至少选一个事件类型', 'error');
  try {
    const body = { name, url, events, description };
    if (secret) body.secret = secret;
    const r = await api('POST', '/webhooks', body);
    if (r.error) return toast('创建失败: ' + (r.message || r.error), 'error');
    toast(`✅ 订阅已创建：${r.subscription.id}\n${r.message || ''}`, 'success', 4000);
    loadAdminPage();
  } catch (e) { toast('创建失败: ' + e.message, 'error'); }
}

async function testWebhook(id) {
  try {
    toast('发送测试 payload…', 'info', 1500);
    const r = await api('POST', `/webhooks/${id}/test`);
    if (r.error) return toast('测试失败: ' + (r.message || r.error), 'error');
    toast('✅ 测试成功 — 目标 URL 已收到', 'success', 2000);
  } catch (e) { toast('测试失败: ' + e.message, 'error'); }
}

async function toggleWebhook(id, newActive) {
  try {
    const r = await api('PATCH', `/webhooks/${id}`, { active: newActive });
    if (r.error) return toast('更新失败: ' + (r.message || r.error), 'error');
    toast(`订阅已${newActive ? '启用' : '暂停'}`, 'success', 1500);
    loadAdminPage();
  } catch (e) { toast('更新失败: ' + e.message, 'error'); }
}

async function deleteWebhook(id) {
  if (!(await showConfirm('确认删除此 webhook 订阅？'))) return;
  try {
    const r = await api('DELETE', `/webhooks/${id}`);
    if (r.error) return toast('删除失败: ' + (r.message || r.error), 'error');
    toast('订阅已删除', 'success', 1500);
    loadAdminPage();
  } catch (e) { toast('删除失败: ' + e.message, 'error'); }
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
    // v0.17d：编辑时自动展开折叠的表单
    const formDetails = document.getElementById('model-form-details');
    if (formDetails) formDetails.open = true;
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
  // v0.17d：保存/取消后自动折叠表单
  const formDetails = document.getElementById('model-form-details');
  if (formDetails) formDetails.open = false;
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
    'agnes-image': 'Agnes Image',
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
    // v0.17d：编辑时自动展开折叠的表单
    const formDetails = document.getElementById('gen-form-details');
    if (formDetails) formDetails.open = true;
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
  // v0.17d：保存/取消后自动折叠表单
  const formDetails = document.getElementById('gen-form-details');
  if (formDetails) formDetails.open = false;
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

// v0.19：Agnes AI Video API Key 配置
async function saveAgnesKey() {
  const input = document.getElementById('agnes-key-input');
  const key = input ? input.value.trim() : '';
  if (!key) return toast('请粘贴 Agnes AI API Key', 'error');
  try {
    const r = await api('POST', '/admin/agnes-key', { apiKey: key });
    if (r.error) return toast('保存失败: ' + (r.message || r.error), 'error');
    input.value = '';
    const statusEl = document.getElementById('agnes-key-status');
    if (statusEl) statusEl.textContent = '✅ 已配置';
    toast('🎬 Agnes API Key 已保存，立即生效', 'success');
  } catch (e) {
    toast('保存失败: ' + e.message, 'error');
  }
}

async function clearAgnesKey() {
  if (!(await showConfirm('确认清除 Agnes API Key？工具将无法生成视频。'))) return;
  try {
    await api('POST', '/admin/agnes-key', { apiKey: '' });
    const statusEl = document.getElementById('agnes-key-status');
    if (statusEl) statusEl.textContent = '❌ 未配置';
    toast('Agnes API Key 已清除', 'success');
    loadAdminPage();
  } catch (e) {
    toast('清除失败: ' + e.message, 'error');
  }
}

// ═══ 运营工具 Tab 辅助（想法池 + 自我改进快捷入口，从 header 移到此） ═══

// 加载"运营工具"tab 内的统计摘要（独立失败容忍，避免阻塞 admin 主流程）
// ── 用户管理 ──
async function loadUsers() {
  var el = document.getElementById('user-list');
  if (!el) return;
  el.innerHTML = '<span style="color:var(--text2)">⏳ 加载中…</span>';
  try {
    var token = localStorage.getItem('acms-token');
    var res = await fetch('/api/auth/users', {
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
    });
    var data = await res.json();
    if (!res.ok) {
      el.innerHTML = '<div style="color:var(--accent2);padding:12px">⚠️ ' + (data.message || '无权访问') + '</div>';
      return;
    }
    var users = data.users || [];
    if (!users.length) {
      el.innerHTML = '<div style="color:var(--text2);padding:12px">📭 暂无用户</div>';
      return;
    }
    var html = '<table style="width:100%;border-collapse:collapse">' +
      '<thead><tr style="color:var(--text2);font-size:11px;text-transform:uppercase;border-bottom:1px solid var(--border)">' +
      '<th style="padding:6px 8px;text-align:left">用户名</th>' +
      '<th style="padding:6px 8px;text-align:left">显示名</th>' +
      '<th style="padding:6px 8px;text-align:left">角色</th>' +
      '<th style="padding:6px 8px;text-align:left">创建时间</th>' +
      '<th style="padding:6px 8px;text-align:left">最后登录</th>' +
      '</tr></thead><tbody>';
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      html += '<tr style="border-bottom:1px solid var(--bg3)">' +
        '<td style="padding:8px">' + escHtml(u.username) + '</td>' +
        '<td style="padding:8px">' + escHtml(u.displayName || '') + '</td>' +
        '<td style="padding:8px"><span class="badge" style="background:color-mix(in srgb, var(--accent) 15%, transparent);color:var(--accent);padding:2px 8px;border-radius:4px;font-size:11px">' + escHtml(u.role) + '</span></td>' +
        '<td style="padding:8px;font-size:12px;color:var(--text2)">' + (u.createdAt ? u.createdAt.slice(0, 10) : '-') + '</td>' +
        '<td style="padding:8px;font-size:12px;color:var(--text2)">' + (u.lastLogin ? u.lastLogin.slice(0, 10) : '-') + '</td>' +
        '</tr>';
    }
    html += '</tbody></table>';
    el.innerHTML = html;
  } catch(e) {
    el.innerHTML = '<div style="color:var(--accent2);padding:12px">⚠️ 加载失败: ' + e.message + '</div>';
  }
}

function showCreateUserDialog() {
  // 简单 prompt 式创建（后续可改成内联表单）
  var username = prompt('请输入新用户名：');
  if (!username || !username.trim()) return;
  var password = prompt('请输入密码（至少4位）：');
  if (!password || password.length < 4) { alert('密码至少4位'); return; }
  var displayName = prompt('请输入显示名称（可选）：') || username.trim();

  api('POST', '/auth/register', { username: username.trim(), password: password, displayName: displayName })
    .then(function(data) {
      alert('✅ 用户 ' + data.user.displayName + ' 创建成功');
      loadUsers();
    })
    .catch(function(err) {
      alert('❌ 创建失败: ' + (err.data ? err.data.message : err.message));
    });
}

// 触发加载用户列表（当用户切到该 tab 时）
function setupUsersTab() {
  var tab = document.querySelector('#admin-tabs .tab-btn[data-tab="admin-tab-users"]');
  if (tab) {
    tab.addEventListener('click', function() {
      setTimeout(loadUsers, 100);
    });
  }
}

// 在 loadAdminPage 末尾调用 setupUsersTab
var origSetupAdminTabs = setupAdminTabs;
setupAdminTabs = function(root) {
  origSetupAdminTabs(root);
  setupUsersTab();
};

async function loadOpsTabStats() {
  // 想法池：取 /ideas/stats
  try {
    const stats = await api('GET', '/improvements/ideas/stats');
    const el = document.getElementById('ops-idea-stats');
    if (!el) return;
    const total = stats.total || 0;
    const byStatus = stats.byStatus || {};
    const pending = byStatus.pending || 0;
    const merged = byStatus.merged || 0;
    const declined = byStatus.declined || 0;
    if (total === 0) {
      el.innerHTML = '<div style="padding:6px 0">📭 还没有想法记录<br><span style="color:var(--text2)">点击右上"+ 记录想法"开始第一条</span></div>';
    } else {
      const roleParts = Object.entries(stats.byRole || {})
        .slice(0, 3)
        .map(([k, v]) => `${k} · ${v}`)
        .join(' · ');
      el.innerHTML =
        '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
          `<div><strong>${total}</strong> 总数</div>` +
          `<div><strong style="color:${pending ? 'var(--accent)' : 'inherit'}">${pending}</strong> 待处理</div>` +
          `<div><strong>${merged}</strong> 已并入改进</div>` +
          (declined ? `<div><strong>${declined}</strong> 已忽略</div>` : '') +
        '</div>' +
        (roleParts ? `<div style="margin-top:6px;color:var(--text2)">来源角色: ${escHtml(roleParts)}</div>` : '');
    }
  } catch (e) {
    const el = document.getElementById('ops-idea-stats');
    if (el) el.innerHTML = '<span style="color:var(--accent2)">加载失败: ' + escHtml(e.message) + '</span>';
  }

  // 自我改进：取 /improvements/project（拿到 taskStats）
  try {
    const proj = await api('GET', '/improvements/project');
    const el = document.getElementById('ops-improvement-stats');
    if (!el) return;
    const ts = proj.taskStats || {};
    const total = ts.total || 0;
    const inProgress = ts.inProgress || 0;
    const done = ts.done || 0;
    if (total === 0) {
      el.innerHTML = '<div style="padding:6px 0">📭 改进看板为空<br><span style="color:var(--text2)">critical/major 缺陷修复后会自动生成</span></div>';
    } else {
      const pct = total ? Math.round(done / total * 100) : 0;
      el.innerHTML =
        '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
          `<div><strong>${total}</strong> 改进任务</div>` +
          `<div><strong style="color:${inProgress ? 'var(--accent)' : 'inherit'}">${inProgress}</strong> 进行中</div>` +
          `<div><strong>${done}</strong> 已完成 · ${pct}%</div>` +
        '</div>' +
        `<div style="margin-top:6px;color:var(--text2)">完成率 ${pct}%${pct < 30 && inProgress > 0 ? ' · 建议跟进积压' : ''}</div>`;
    }
  } catch (e) {
    const el = document.getElementById('ops-improvement-stats');
    if (el) el.innerHTML = '<span style="color:var(--accent2)">加载失败: ' + escHtml(e.message) + '</span>';
  }
}

// 从"运营工具"卡片跳到完整看板（带可选的 sourceType 过滤）
function openOpsTabToImprovements(tab, sourceType) {
  showView('view-improvements');
  // 切到目标 tab
  if (typeof switchImprovementTab === 'function') {
    switchImprovementTab(tab || 'reports');
  }
  // 若需要 sourceType 过滤，调用 loadReports 时传参
  if (tab === 'reports' && sourceType && typeof loadReports === 'function') {
    loadReports(undefined, sourceType);
  } else {
    loadImprovements();
  }
}

// ═══ 全局快捷键：Ctrl/Cmd + I 打开"记录想法" ═══
// 灵感来自 header 的 💡 按钮下移后不能丢失高频动作
document.addEventListener('keydown', function (e) {
  // 必须是 Ctrl（Win/Linux）或 Cmd（Mac）+ I，且没有 Shift/Alt 干扰
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.key !== 'i' && e.key !== 'I') return;
  if (e.shiftKey || e.altKey) return;
  // 用户正在输入框/可编辑区域里打字 → 不抢快捷键
  var t = e.target;
  if (t) {
    var tag = (t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || t.isContentEditable) return;
  }
  e.preventDefault();
  if (typeof showIdeaDialog === 'function') {
    showIdeaDialog();
  }
});

// ═══ 从 view-improvements 返回运营工具 tab（替换之前的"返回项目"） ═══
// 入口迁移后，自我改进页的唯一上游入口就是 admin → 🛠 运营工具
function backToOpsTab() {
  showView('view-admin');
  // loadAdminPage 是 async；等它填充完 admin-tabs，再点运营工具 tab
  Promise.resolve(loadAdminPage()).then(function () {
    var opsTabBtn = document.querySelector('#admin-tabs .tab-btn[data-tab="admin-tab-ops"]');
    if (opsTabBtn) opsTabBtn.click();
  });
}

// ═══ 智能返回：admin 记录来路，返回时还原 ═══
// 来源包括：projects 列表、project workspace（含子 tab）、self-improvements
let _adminEntryContext = null;

function _captureAdminEntryContext() {
  const pages = ['view-workspace', 'view-admin', 'view-improvements'];
  let visibleView = null;
  for (const p of pages) {
    const el = document.getElementById(p);
    if (el && getComputedStyle(el).display !== 'none') {
      visibleView = p;
      break;
    }
  }
  if (!visibleView || visibleView === 'view-admin') return null;
  const ctx = { view: visibleView };
  if (visibleView === 'view-workspace') {
    ctx.projectId = window.App && App.currentProjectId;
    ctx.projectName = window.App && App.currentProject && App.currentProject.name;
    // P0 v0.X: 也记录最近打开的 taskId — 返回时用于 openTask 重新加载
    ctx.lastTaskId = window.App && App.lastTaskId;
    const activeSub = document.querySelector('#content .view.active');
    if (activeSub) ctx.workspaceActiveTab = activeSub.id.replace(/^view-/, '');
  }
  return ctx;
}

// 从 header ⚙️ 进入 admin — 替换之前的直接 showView+loadAdminPage 调用
function navigateToAdmin() {
  _adminEntryContext = _captureAdminEntryContext();
  showView('view-admin');
  loadAdminPage();
}

// admin 页面"返回"按钮 — 按入口上下文还原
function backFromAdmin() {
  const ctx = _adminEntryContext;
  _adminEntryContext = null;
  if (!ctx || !ctx.view) {
    // 没记录到上下文（直接刷新页面等情况）— 兜底回项目列表（桌面窗口）
    goToProjects();
    return;
  }
  switch (ctx.view) {
    case 'view-workspace':
      // 重新进入项目 → enterProject 会默认切到 dashboard，再用 setTimeout 还原原 tab
      if (ctx.projectId && typeof enterProject === 'function') {
        enterProject({ id: ctx.projectId, name: ctx.projectName || '' });
        if (ctx.workspaceActiveTab && ctx.workspaceActiveTab !== 'dashboard' && typeof showWorkspaceView === 'function') {
          setTimeout(function () {
            showWorkspaceView(ctx.workspaceActiveTab);
            // P0 v0.X: 如果返回到 task-detail，重新调 openTask 加载最新内容（避免陈旧内容）
            if (ctx.workspaceActiveTab === 'task-detail' && ctx.lastTaskId && typeof openTask === 'function') {
              openTask(ctx.lastTaskId);
            }
          }, 30);
        }
      } else {
        showView('view-workspace');
      }
      break;
    case 'view-improvements':
      showView('view-improvements');
      if (typeof loadImprovements === 'function') loadImprovements();
      break;
    default:
      goToProjects();
  }
}
