// 系统管理视图
async function showAdmin() {
  document.getElementById('admin-overlay').style.display = 'flex';
  try {
    const status = await api('GET', '/admin/status');
    const events = await api('GET', '/admin/events?limit=10');
    document.getElementById('admin-content').innerHTML = `
      <h3>📊 系统状态</h3>
      <div class="stats-row" style="grid-template-columns:repeat(4,1fr);margin:12px 0">
        <div class="stat-card"><div class="num">${Math.floor(status.uptime/3600)}h${Math.floor((status.uptime%3600)/60)}m</div><div class="label">运行时间</div></div>
        <div class="stat-card"><div class="num">${status.memory.used}</div><div class="label">内存 (${status.memory.total})</div></div>
        <div class="stat-card"><div class="num">${status.node}</div><div class="label">Node.js</div></div>
        <div class="stat-card"><div class="num">${status.platform}</div><div class="label">平台</div></div>
      </div>

      <h3>📦 数据统计</h3>
      <div class="stats-row" style="grid-template-columns:repeat(5,1fr);margin:12px 0">
        <div class="stat-card"><div class="num">${status.counts.projects}</div><div class="label">项目</div></div>
        <div class="stat-card"><div class="num">${status.counts.requirements}</div><div class="label">需求</div></div>
        <div class="stat-card"><div class="num">${status.counts.tasks}</div><div class="label">任务</div></div>
        <div class="stat-card"><div class="num">${status.counts.agents}</div><div class="label">智能体</div></div>
        <div class="stat-card"><div class="num">${status.counts.events}</div><div class="label">事件</div></div>
      </div>

      <h3>📋 最近事件</h3>
      <div style="max-height:200px;overflow-y:auto;font-size:12px">
        ${events.map(e => `<div class="log-entry"><strong>${e.type}</strong> ${e.actor_name||''} → ${e.target_type||''}/${e.target_id||''} <span style="color:var(--text2)">${new Date(e.timestamp).toLocaleString('zh-CN')}</span></div>`).join('')}
      </div>

      <h3>🛠 数据管理</h3>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn-small" onclick="doBackup()">💾 备份数据</button>
        <button class="btn-small" onclick="doCleanup('events')">🧹 清理旧事件</button>
        <button class="btn-small btn-reject" onclick="doCleanup('abandoned')">🗑 清理废弃需求</button>
      </div>
    `;
  } catch (e) { document.getElementById('admin-content').innerHTML = `<div class="empty">加载失败: ${e.message}</div>`; }
}

function hideAdmin() { document.getElementById('admin-overlay').style.display = 'none'; }

async function doBackup() {
  try { const r = await api('POST', '/admin/backup'); toast('备份完成: ' + r.backup, 'success'); }
  catch (e) { toast('备份失败: ' + e.message, 'error'); }
}

async function doCleanup(type) {
  if (!confirm(`确认清理 ${type}？`)) return;
  try { const r = await api('POST', '/admin/cleanup', { type }); toast(`已清理 ${r.cleaned} 条`, 'success'); showAdmin(); }
  catch (e) { toast('清理失败: ' + e.message, 'error'); }
}
