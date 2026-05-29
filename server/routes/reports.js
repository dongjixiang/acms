// 项目报告 API 路由
const express = require('express');
const router = express.Router();
const reportStore = require('../stores/report-store');
const reportService = require('../services/report-service');
const projectStore = require('../stores/project-store');
const workspaceService = require('../services/workspace-service');
const taskStore = require('../stores/task-store');
const path = require('path');
const fs = require('fs');

// 列出报告
router.get('/', (req, res) => {
  const projectId = req.query.projectId || req.query.project_id;
  if (!projectId) return res.status(400).json({ error: 'MISSING_PROJECT_ID' });
  const reports = reportStore.list(projectId);
  // 不返回完整HTML（太大），只返回元数据
  res.json(reports.map(r => ({
    id: r.id, project_id: r.project_id, title: r.title, type: r.type,
    template: r.template, params: JSON.parse(r.params || '{}'),
    summary: r.summary, created_at: r.created_at, updated_at: r.updated_at,
  })));
});

// 获取报告详情（含HTML）
router.get('/:id', (req, res) => {
  const report = reportStore.getById(req.params.id);
  if (!report) return res.status(404).json({ error: 'REPORT_NOT_FOUND' });
  res.json({ ...report, params: JSON.parse(report.params || '{}') });
});

// 预览报告HTML
router.get('/:id/html', (req, res) => {
  const report = reportStore.getById(req.params.id);
  if (!report) return res.status(404).json({ error: 'REPORT_NOT_FOUND' });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(wrapHtml(report.title, report.content_html));
});

// 生成新报告
router.post('/generate', (req, res) => {
  const { projectId, params = {} } = req.body;
  if (!projectId) return res.status(400).json({ error: 'MISSING_PROJECT_ID' });

  try {
    const result = reportService.generate(projectId, params);

    // 保存HTML到workspace
    const project = projectStore.getById(projectId);
    const slug = project ? (project.slug || project.name) : projectId;
    workspaceService.init(slug);
    const reportsDir = path.join('reports');
    const filename = `${result.title.replace(/[/\\:*?"<>|]/g, '_')}.html`;
    const relPath = path.join(reportsDir, filename);
    workspaceService.writeFile(slug, relPath, wrapHtml(result.title, result.contentHtml));

    // 存入DB
    const record = reportStore.create({
      projectId, title: result.title,
      type: params.type || 'comprehensive',
      template: params.type || 'comprehensive',
      params,
      contentHtml: result.contentHtml,
      summary: result.summary,
      filePath: `${slug}/${relPath}`,
    });

    res.json({
      ...record,
      params: JSON.parse(record.params || '{}'),
      summary: result.summary,
    });
  } catch (e) {
    res.status(500).json({ error: 'GENERATE_FAILED', message: e.message });
  }
});

// 删除报告
router.delete('/:id', (req, res) => {
  const result = reportStore.remove(req.params.id);
  if (!result) return res.status(404).json({ error: 'REPORT_NOT_FOUND' });
  res.json({ success: true });
});

// 导出为Markdown
router.get('/:id/export/md', (req, res) => {
  const report = reportStore.getById(req.params.id);
  if (!report) return res.status(404).json({ error: 'REPORT_NOT_FOUND' });

  const md = htmlToMarkdown(report.content_html);
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${report.id}.md"`);
  res.send(`# ${report.title}\n\n> ${report.summary}\n\n---\n\n${md}`);
});

// 导出为PDF（通过Pandoc）
router.get('/:id/export/pdf', async (req, res, next) => {
  try {
    const report = reportStore.getById(req.params.id);
    if (!report) return res.status(404).json({ error: 'REPORT_NOT_FOUND' });

    const md = `# ${report.title}\n\n> ${report.summary}\n\n---\n\n${htmlToMarkdown(report.content_html)}`;
    const tmpDir = path.join(__dirname, '..', '..', 'workspaces', '_temp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const mdPath = path.join(tmpDir, `${report.id}.md`);
    const pdfPath = path.join(tmpDir, `${report.id}.pdf`);
    fs.writeFileSync(mdPath, md, 'utf-8');

    const { execSync } = require('child_process');
    try {
      execSync(`pandoc "${mdPath}" -o "${pdfPath}" --pdf-engine=wkhtmltopdf 2>&1 || pandoc "${mdPath}" -o "${pdfPath}" 2>&1`, { timeout: 30000 });
    } catch (e) {
      return res.status(500).json({ error: 'PDF_EXPORT_FAILED', message: 'Pandoc未安装或转换失败' });
    }

    if (fs.existsSync(pdfPath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${report.id}.pdf"`);
      res.sendFile(pdfPath);
    } else {
      res.status(500).json({ error: 'PDF_NOT_GENERATED' });
    }
  } catch (e) { next(e); }
});

function htmlToMarkdown(html) {
  return (html || '')
    .replace(/<h1>(.*?)<\/h1>/g, '# $1\n\n')
    .replace(/<h2>(.*?)<\/h2>/g, '## $1\n\n')
    .replace(/<h3>(.*?)<\/h3>/g, '### $1\n\n')
    .replace(/<div class="report-cards">/g, '\n')
    .replace(/<\/div>/g, '\n')
    .replace(/<div class="rpt-card[^"]*"><div class="rpt-num">(.*?)<\/div><div class="rpt-label">(.*?)<\/div><\/div>/g, '- **$1** $2\n')
    .replace(/<table[^>]*>/g, '\n')
    .replace(/<\/table>/g, '\n')
    .replace(/<tr>/g, '| ')
    .replace(/<th>(.*?)<\/th>/g, '**$1** |')
    .replace(/<td>(.*?)<\/td>/g, '$1 |')
    .replace(/<\/tr>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

function wrapHtml(title, content) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${title}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', sans-serif; max-width: 960px; margin: 40px auto; padding: 0 20px; background: #0d1117; color: #c9d1d9; line-height: 1.6; }
  .report-header { border-bottom: 2px solid #4ecdc4; padding-bottom: 16px; margin-bottom: 24px; }
  .report-header h1 { color: #4ecdc4; font-size: 24px; margin: 0 0 8px; }
  .report-meta { display: flex; gap: 16px; color: #8b949e; font-size: 13px; }
  .report-section { margin: 24px 0; }
  .report-section h2 { color: #e6edf3; font-size: 18px; border-bottom: 1px solid #21262d; padding-bottom: 8px; }
  .report-cards { display: flex; gap: 12px; flex-wrap: wrap; }
  .rpt-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px 20px; min-width: 120px; text-align: center; }
  .rpt-card.good { border-color: #4ecdc4; }
  .rpt-card.warn { border-color: #ffc107; }
  .rpt-card.bad { border-color: #ff6b6b; }
  .rpt-num { font-size: 28px; font-weight: 700; }
  .rpt-label { font-size: 12px; color: #8b949e; margin-top: 4px; }
  .rpt-table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
  .rpt-table th { background: #161b22; color: #8b949e; text-align: left; padding: 8px 12px; border-bottom: 1px solid #30363d; }
  .rpt-table td { padding: 8px 12px; border-bottom: 1px solid #21262d; }
  .progress-bar-lg { display: flex; height: 32px; border-radius: 6px; overflow: hidden; margin: 12px 0; }
  .progress-seg { display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; min-width: 40px; }
  .progress-seg.done { background: #4ecdc4; color: #0d1117; }
  .progress-seg.review { background: #ffc107; color: #0d1117; }
  .progress-seg.inprog { background: #58a6ff; color: #fff; }
  .progress-seg.backlog { background: #30363d; color: #8b949e; }
  .status-legend { display: flex; gap: 16px; font-size: 12px; color: #8b949e; }
  .status-badge { padding: 1px 6px; border-radius: 3px; font-size: 11px; }
  .status-badge.done { background: rgba(78,205,196,0.15); color: #4ecdc4; }
  .status-badge.in_progress { background: rgba(88,166,255,0.15); color: #58a6ff; }
  .status-badge.review { background: rgba(255,193,7,0.15); color: #ffc107; }
  .status-badge.backlog { background: rgba(139,148,158,0.15); color: #8b949e; }
</style></head><body>${content}</body></html>`;
}

module.exports = router;
