// 项目报告视图
async function refreshReports() {
  if (!App.currentProjectId) { document.getElementById('report-list').innerHTML = '<div class="empty">请先选择项目</div>'; return; }
  try {
    var resp = await fetch('/api/reports?projectId=' + App.currentProjectId, { headers: { 'X-API-Key': 'dev-key-001' } });
    var reports = await resp.json();
    var el = document.getElementById('report-list');
    if (!reports.length) {
      el.innerHTML = '<div class="empty" style="padding:32px;text-align:center"><div style="font-size:48px;margin-bottom:12px">📊</div><p>暂无报告</p><p style="color:var(--text2);font-size:13px">选择一个模板，点击「生成报告」</p></div>';
      return;
    }
    el.innerHTML = reports.map(function(r) {
      var params = r.params || {};
      var timeLabel = params.timeRange && params.timeRange.start ? params.timeRange.start.substring(0,10) + ' ~ ' + (params.timeRange.end || '至今').substring(0,10) : '全部时间';
      return '<div class="report-item" id="rpt-' + r.id + '">' +
        '<div class="report-item-main">' +
          '<div class="report-item-title">' + escHtml(r.title) + '</div>' +
          '<div class="report-item-meta">' +
            '<span>' + typeLabel(r.type) + '</span>' +
            '<span>📅 ' + fmtDate(r.created_at) + '</span>' +
            '<span>⏱ ' + timeLabel + '</span>' +
          '</div>' +
          '<div class="report-item-summary">' + escHtml(r.summary || '') + '</div>' +
        '</div>' +
        '<div class="report-item-actions">' +
          '<button class="btn-small btn-accept" onclick="viewReport(\'' + r.id + '\')">👁 查看</button>' +
          '<button class="btn-small" onclick="exportReport(\'' + r.id + '\',\'md\')">📥 MD</button>' +
          '<button class="btn-small btn-reject" onclick="deleteReport(\'' + r.id + '\')">🗑</button>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch(e) { toast('加载报告失败: ' + e.message, 'error'); }
}

async function generateReport() {
  if (!App.currentProjectId) { toast('请先选择项目', 'error'); return; }
  var template = document.getElementById('report-template').value;

  // 需求澄清 — 简单版
  var timeRange = prompt('时间范围（留空=全部）:\n格式: 2026-05-22 或 2026-05-22~2026-05-29', '') || '';
  var parts = timeRange.split('~');
  var params = {
    type: template,
    timeRange: parts.length === 2 ? { start: parts[0].trim(), end: parts[1].trim() } : (parts[0] ? { start: parts[0].trim() } : {}),
  };

  // Agent筛选
  if (template === 'agent' || template === 'quality') {
    var agentFilter = prompt('Agent筛选（留空=全部, 逗号分隔）:', '') || '';
    if (agentFilter) params.agents = agentFilter.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  }

  toast('正在生成报告…', 'info');
  try {
    var resp = await fetch('/api/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
      body: JSON.stringify({ projectId: App.currentProjectId, params: params })
    });
    var report = await resp.json();
    if (report.error) { toast('生成失败: ' + report.message, 'error'); return; }
    toast('报告已生成 ✅', 'success');
    refreshReports();
  } catch(e) { toast('生成失败: ' + e.message, 'error'); }
}

async function viewReport(id) {
  try {
    var resp = await fetch('/api/reports/' + id, { headers: { 'X-API-Key': 'dev-key-001' } });
    var report = await resp.json();
    document.getElementById('report-list').style.display = 'none';
    document.getElementById('report-preview').style.display = 'block';
    document.getElementById('report-preview-content').innerHTML =
      '<div class="report-preview-toolbar">' +
        '<button class="btn-small" onclick="exportReport(\'' + id + '\',\'md\')">📥 导出MD</button>' +
        '<button class="btn-small" onclick="exportReport(\'' + id + '\',\'pdf\')">📥 导出PDF</button>' +
        '<button class="btn-small btn-reject" onclick="deleteReport(\'' + id + '\')">🗑 删除</button>' +
      '</div>' +
      '<iframe srcdoc="' + escAttr(report.content_html ? wrapForIframe(report.content_html) : '') + '" style="width:100%;height:80vh;border:none;border-radius:8px;background:#0d1117"></iframe>';
  } catch(e) { toast('加载失败: ' + e.message, 'error'); }
}

function closeReportPreview() {
  document.getElementById('report-list').style.display = 'block';
  document.getElementById('report-preview').style.display = 'none';
}

async function exportReport(id, format) {
  try {
    var resp = await fetch('/api/reports/' + id + '/export/' + format, {
      headers: { 'X-API-Key': 'dev-key-001' }
    });
    if (!resp.ok) { var err = await resp.json(); toast('导出失败: ' + (err.message || ''), 'error'); return; }
    var blob = await resp.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = id + '.' + format;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('已导出 ' + format.toUpperCase() + ' ✅', 'success');
  } catch(e) { toast('导出失败: ' + e.message, 'error'); }
}

async function deleteReport(id) {
  if (!(await showConfirm('确认删除此报告？'))) return;
  try {
    await fetch('/api/reports/' + id, { method: 'DELETE', headers: { 'X-API-Key': 'dev-key-001' } });
    closeReportPreview();
    refreshReports();
    toast('已删除 ✅', 'success');
  } catch(e) { toast('删除失败: ' + e.message, 'error'); }
}

function typeLabel(type) {
  var map = { comprehensive: '📋 综合', quality: '🔍 质量', agent: '🤖 Agent', progress: '📈 进度', security: '🔐 安全' };
  return map[type] || type;
}

function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) { return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtDate(d) { if(!d) return ''; return new Date(d).toLocaleDateString('zh-CN'); }  // zh-CN OK; date 本身无时区歧义

function wrapForIframe(html) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    'body{font-family:-apple-system,"Segoe UI",sans-serif;max-width:960px;margin:40px auto;padding:0 20px;background:#0d1117;color:#c9d1d9;line-height:1.6}' +
    '.report-header{border-bottom:2px solid #4ecdc4;padding-bottom:16px;margin-bottom:24px}' +
    '.report-header h1{color:#4ecdc4;font-size:24px;margin:0 0 8px}' +
    '.report-meta{display:flex;gap:16px;color:#8b949e;font-size:13px}' +
    '.report-section{margin:24px 0}' +
    '.report-section h2{color:#e6edf3;font-size:18px;border-bottom:1px solid #21262d;padding-bottom:8px}' +
    '.report-cards{display:flex;gap:12px;flex-wrap:wrap}' +
    '.rpt-card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px 20px;min-width:120px;text-align:center}' +
    '.rpt-card.good{border-color:#4ecdc4}.rpt-card.warn{border-color:#ffc107}.rpt-card.bad{border-color:#ff6b6b}' +
    '.rpt-num{font-size:28px;font-weight:700}.rpt-label{font-size:12px;color:#8b949e;margin-top:4px}' +
    '.rpt-table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}' +
    '.rpt-table th{background:#161b22;color:#8b949e;text-align:left;padding:8px 12px;border-bottom:1px solid #30363d}' +
    '.rpt-table td{padding:8px 12px;border-bottom:1px solid #21262d}' +
    '.progress-bar-lg{display:flex;height:32px;border-radius:6px;overflow:hidden;margin:12px 0}' +
    '.progress-seg{display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;min-width:40px}' +
    '.progress-seg.done{background:#4ecdc4;color:#0d1117}.progress-seg.review{background:#ffc107;color:#0d1117}' +
    '.progress-seg.inprog{background:#58a6ff;color:#fff}.progress-seg.backlog{background:#30363d;color:#8b949e}' +
    '.status-legend{display:flex;gap:16px;font-size:12px;color:#8b949e}' +
    '.status-badge{padding:1px 6px;border-radius:3px;font-size:11px}' +
    '.status-badge.done{background:rgba(78,205,196,.15);color:#4ecdc4}' +
    '</style></head><body>' + html + '</body></html>';
}
