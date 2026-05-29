// 项目报告服务 — 数据聚合 + HTML模板渲染
const { collection } = require('../db/connection');
const taskStore = require('../stores/task-store');
const agentStore = require('../stores/agent-store');
const projectStore = require('../stores/project-store');

/**
 * 生成项目报告
 * @param {string} projectId
 * @param {object} params — { type, timeRange, agents, focusAreas, detailLevel }
 * @returns {{ title, summary, contentHtml }}
 */
function generate(projectId, params = {}) {
  const project = projectStore.getById(projectId);
  const projectName = project ? project.name : projectId;

  // 数据聚合
  const data = aggregateData(projectId, params);

  // 选模板渲染
  const template = params.type || 'comprehensive';
  const contentHtml = renderTemplate(template, { ...data, projectName, params });

  // 生成摘要
  const summary = buildSummary(template, data);

  const titleMap = {
    comprehensive: `${projectName} — 综合项目报告`,
    quality: `${projectName} — 质量审查报告`,
    agent: `${projectName} — Agent 绩效报告`,
    progress: `${projectName} — 进度报告`,
    security: `${projectName} — 安全审查报告`,
  };

  return {
    title: titleMap[template] || `${projectName} — 项目报告`,
    summary,
    contentHtml,
  };
}

/** 聚合所有数据 */
function aggregateData(projectId, params) {
  const allTasks = taskStore.list({ projectId, limit: 500 });
  const normalTasks = allTasks.filter(t => t.type !== 'bug');
  const bugs = allTasks.filter(t => t.type === 'bug');

  // 时间过滤
  const { start, end } = params.timeRange || {};
  const inRange = (t) => {
    if (!start && !end) return true;
    const d = new Date(t.created_at);
    if (start && d < new Date(start)) return false;
    if (end && d > new Date(end + 'T23:59:59')) return false;
    return true;
  };
  const tasks = normalTasks.filter(inRange);
  const bugsInRange = bugs.filter(inRange);

  // Agent过滤
  const agentFilter = params.agents && params.agents.length > 0
    ? (t) => params.agents.includes(t.assigned_to)
    : () => true;

  // 状态统计
  const statusCounts = {};
  for (const t of tasks) {
    statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
  }

  // 审核数据聚合
  let totalReviews = 0, approvedReviews = 0;
  let totalCritical = 0, totalWarnings = 0, totalSuggestions = 0, totalPassed = 0;
  const reviewTasks = [];
  const securityIssues = [];
  const contractResults = [];

  for (const t of tasks.filter(agentFilter)) {
    const revs = safeParse(t.reviews);
    for (const r of revs) {
      totalReviews++;
      if (r.verdict === 'approved') approvedReviews++;

      // 尝试解析4-phase报告数据
      if (r.feedback) {
        const scores = extractScores(r.feedback);
        if (scores) {
          totalCritical += scores.critical || 0;
          totalWarnings += scores.warnings || 0;
          totalSuggestions += scores.suggestions || 0;
          totalPassed += scores.passed || 0;
        }
        const sec = extractSecurityIssues(r.feedback);
        securityIssues.push(...sec);
      }
      reviewTasks.push({
        taskId: t.id, title: t.title,
        verdict: r.verdict,
        reviewer: r.reviewedBy,
        date: r.reviewedAt,
        scores: extractScores(r.feedback),
      });
    }
  }

  // Agent统计
  const agentStats = {};
  for (const t of tasks.filter(agentFilter)) {
    const agentId = t.assigned_to || 'unassigned';
    if (!agentStats[agentId]) {
      agentStats[agentId] = { agentId, total: 0, done: 0, rejected: 0, reviewed: 0, approved: 0 };
    }
    const as = agentStats[agentId];
    as.total++;
    if (t.status === 'done') as.done++;
    const revs = safeParse(t.reviews);
    for (const r of revs) {
      as.reviewed++;
      if (r.verdict === 'approved') as.approved++;
      else as.rejected++;
    }
  }
  // 计算比率
  for (const a of Object.values(agentStats)) {
    a.approveRate = a.reviewed > 0 ? Math.round((a.approved / a.reviewed) * 100) : 0;
    a.completionRate = a.total > 0 ? Math.round((a.done / a.total) * 100) : 0;
  }

  // 类型分布
  const typeCounts = {};
  for (const t of tasks) {
    typeCounts[t.type] = (typeCounts[t.type] || 0) + 1;
  }

  return {
    tasks,
    bugs: bugsInRange,
    statusCounts,
    totalTasks: tasks.length,
    totalBugs: bugsInRange.length,
    reviewStats: {
      totalReviews, approvedReviews,
      approveRate: totalReviews > 0 ? Math.round((approvedReviews / totalReviews) * 100) : 0,
      totalCritical, totalWarnings, totalSuggestions, totalPassed,
    },
    reviewTasks,
    securityIssues,
    contractResults,
    agentStats: Object.values(agentStats).sort((a, b) => b.approveRate - a.approveRate),
    typeCounts,
    generatedAt: new Date().toISOString(),
  };
}

/** 选模板渲染HTML */
function renderTemplate(template, data) {
  const { projectName, params } = data;
  const now = new Date().toLocaleDateString('zh-CN');
  const timeLabel = params.timeRange?.start
    ? `${params.timeRange.start} ~ ${params.timeRange.end || '至今'}`
    : '全部时间';

  const header = html`
    <div class="report-header">
      <h1>${projectName}</h1>
      <div class="report-meta">
        <span>📅 ${now}</span>
        <span>⏱ ${timeLabel}</span>
        <span>📋 ${data.totalTasks} 任务</span>
      </div>
    </div>
  `;

  const overview = renderOverview(data);

  switch (template) {
    case 'comprehensive': return header + overview + renderAgentSection(data) + renderQualitySection(data) + renderSecuritySection(data);
    case 'quality':      return header + overview + renderQualitySection(data) + renderTaskList(data);
    case 'agent':        return header + overview + renderAgentSection(data);
    case 'progress':     return header + overview + renderProgressSection(data);
    case 'security':     return header + overview + renderSecuritySection(data);
    default:             return header + overview + renderQualitySection(data);
  }
}

/** 总览卡片 */
function renderOverview(data) {
  const s = data.reviewStats;
  return html`
    <div class="report-section">
      <h2>📊 总览</h2>
      <div class="report-cards">
        <div class="rpt-card"><div class="rpt-num">${data.totalTasks}</div><div class="rpt-label">任务总数</div></div>
        <div class="rpt-card ${s.approveRate >= 80 ? 'good' : s.approveRate >= 50 ? 'warn' : 'bad'}"><div class="rpt-num">${s.approveRate}%</div><div class="rpt-label">审核通过率</div></div>
        <div class="rpt-card"><div class="rpt-num">${s.totalReviews}</div><div class="rpt-label">审核次数</div></div>
        <div class="rpt-card"><div class="rpt-num">${data.totalBugs}</div><div class="rpt-label">缺陷数</div></div>
      </div>
      <div class="report-cards" style="margin-top:8px">
        <div class="rpt-card ${s.totalCritical > 0 ? 'bad' : 'good'}"><div class="rpt-num">${s.totalCritical}</div><div class="rpt-label">🔴 Critical</div></div>
        <div class="rpt-card ${s.totalWarnings > 10 ? 'warn' : 'good'}"><div class="rpt-num">${s.totalWarnings}</div><div class="rpt-label">🟡 Warnings</div></div>
        <div class="rpt-card"><div class="rpt-num">${s.totalSuggestions}</div><div class="rpt-label">💡 Suggestions</div></div>
        <div class="rpt-card good"><div class="rpt-num">${s.totalPassed}</div><div class="rpt-label">✅ Passed</div></div>
      </div>
    </div>
  `;
}

/** 质量审查section */
function renderQualitySection(data) {
  const tasks = data.reviewTasks || [];
  return html`
    <div class="report-section">
      <h2>🔍 审核质量</h2>
      ${tasks.length === 0 ? '<p style="color:var(--text2)">暂无审核数据</p>' : html`
        <table class="rpt-table">
          <thead><tr><th>任务</th><th>判定</th><th>审核者</th><th>日期</th><th>打分</th></tr></thead>
          <tbody>
            ${tasks.slice(0, 20).map(t => html`
              <tr>
                <td>${esc(t.title)}</td>
                <td>${t.verdict === 'approved' ? '✅' : '❌'}</td>
                <td>${t.reviewer || ''}</td>
                <td>${(t.date || '').substring(0, 10)}</td>
                <td>${t.scores ? `🔴${t.scores.critical||0} 🟡${t.scores.warnings||0} 💡${t.scores.suggestions||0} ✅${t.scores.passed||0}` : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;
}

/** Agent绩效section */
function renderAgentSection(data) {
  const agents = data.agentStats || [];
  return html`
    <div class="report-section">
      <h2>🤖 Agent 绩效</h2>
      ${agents.length === 0 ? '<p style="color:var(--text2)">暂无Agent数据</p>' : html`
        <table class="rpt-table">
          <thead><tr><th>Agent</th><th>任务数</th><th>完成率</th><th>审核通过率</th><th>驳回数</th></tr></thead>
          <tbody>
            ${agents.map(a => html`
              <tr>
                <td>${a.agentId}</td>
                <td>${a.total}</td>
                <td>${bar(a.completionRate)}</td>
                <td>${bar(a.approveRate)}</td>
                <td>${a.rejected > 0 ? `❌ ${a.rejected}` : '✅ 0'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;
}

/** 安全审查section */
function renderSecuritySection(data) {
  const issues = data.securityIssues || [];
  return html`
    <div class="report-section">
      <h2>🔐 安全发现</h2>
      ${issues.length === 0 ? '<p style="color:var(--text2)">✅ 未发现安全问题</p>' : html`
        <table class="rpt-table">
          <thead><tr><th>任务</th><th>类型</th><th>详情</th></tr></thead>
          <tbody>
            ${issues.slice(0, 30).map(i => html`
              <tr><td>${i.taskId||''}</td><td>${i.category||''}</td><td>${i.detail||''}</td></tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;
}

/** 进度section */
function renderProgressSection(data) {
  const total = data.totalTasks || 1;
  const done = data.statusCounts.done || 0;
  const inProg = data.statusCounts.in_progress || 0;
  const review = data.statusCounts.review || 0;
  const backlog = data.statusCounts.backlog || 0;
  return html`
    <div class="report-section">
      <h2>📈 进度</h2>
      <div class="progress-bar-lg">
        <div class="progress-seg done" style="width:${(done/total*100)}%">✅ ${done}</div>
        <div class="progress-seg review" style="width:${(review/total*100)}%">👀 ${review}</div>
        <div class="progress-seg inprog" style="width:${(inProg/total*100)}%">🔄 ${inProg}</div>
        <div class="progress-seg backlog" style="width:${(backlog/total*100)}%">📥 ${backlog}</div>
      </div>
      <div class="status-legend">
        <span>✅ 完成: ${done}</span>
        <span>👀 待审核: ${review}</span>
        <span>🔄 进行中: ${inProg}</span>
        <span>📥 待认领: ${backlog}</span>
      </div>
    </div>
  `;
}

/** 任务明细列表 */
function renderTaskList(data) {
  const tasks = data.tasks || [];
  return html`
    <div class="report-section">
      <h2>📋 任务明细 (${tasks.length})</h2>
      <table class="rpt-table">
        <thead><tr><th>ID</th><th>标题</th><th>状态</th><th>Agent</th><th>类型</th></tr></thead>
        <tbody>
          ${tasks.map(t => html`
            <tr>
              <td>${t.id}</td><td>${esc(t.title)}</td>
              <td><span class="status-badge badge-${t.status}">${t.status}</span></td>
              <td>${t.assigned_to || '-'}</td><td>${t.type}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/** 生成摘要 */
function buildSummary(template, data) {
  const s = data.reviewStats;
  const parts = [];
  parts.push(`${data.totalTasks}个任务`);
  if (s.totalReviews > 0) parts.push(`审核通过率${s.approveRate}%`);
  if (s.totalCritical > 0) parts.push(`🔴${s.totalCritical}个严重问题`);
  return parts.join('，') + '。';
}

// ====== 工具函数 ======

function safeParse(s) {
  if (!s) return [];
  if (typeof s === 'object') return Array.isArray(s) ? s : [];
  try { const r = JSON.parse(s); return Array.isArray(r) ? r : []; } catch { return []; }
}

/** 从review feedback中提取score信息 */
function extractScores(feedback) {
  if (!feedback) return null;
  const m = feedback.match(/🔴(\d+).*?🟡(\d+).*?💡(\d+).*?✅(\d+)/);
  if (m) return { critical: +m[1], warnings: +m[2], suggestions: +m[3], passed: +m[4] };

  const m2 = feedback.match(/"critical":\s*(\d+).*?"warnings":\s*(\d+).*?"suggestions":\s*(\d+).*?"passed":\s*(\d+)/);
  if (m2) return { critical: +m2[1], warnings: +m2[2], suggestions: +m2[3], passed: +m2[4] };
  return null;
}

/** 从review feedback中提取安全问题 */
function extractSecurityIssues(feedback) {
  if (!feedback) return [];
  const issues = [];
  const lines = feedback.split('\n');
  for (const l of lines) {
    if (l.includes('security') || l.includes('密钥') || l.includes('secret') || l.includes('sql') || l.includes('注入')) {
      issues.push({ detail: l.trim().substring(0, 120) });
    }
  }
  return issues.slice(0, 10);
}

function bar(pct) {
  const color = pct >= 80 ? '#4ecdc4' : pct >= 50 ? '#ffc107' : '#ff6b6b';
  return `<span style="display:inline-flex;align-items:center;gap:4px"><span style="display:inline-block;width:60px;height:8px;background:var(--bg3);border-radius:4px;overflow:hidden"><span style="display:block;height:100%;width:${pct}%;background:${color};border-radius:4px"></span></span>${pct}%</span>`;
}

function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/** 简易模板字符串 */
function html(strings, ...values) {
  let result = '';
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) result += values[i] === undefined || values[i] === null ? '' : String(values[i]);
  }
  return result;
}

module.exports = { generate, aggregateData };
