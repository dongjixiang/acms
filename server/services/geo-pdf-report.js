// ACMS GEO PDF 报告服务（v0.1 — Phase 1 Week 6）
// 用途：将 Markdown 周报 / 月报 / 审计报告渲染成 PDF
// 路径：server/services/geo-pdf-report.js
//
// 设计：
//   - 复用 ACMS 已有 puppeteer（app-runtime.js 同款）
//   - Markdown → HTML（内置简易转换器）→ puppeteer → PDF
//   - 输出到 data/geo/reports/<brand>_<type>_<date>.pdf
//   - 返回 saved_path + bytes + page_count
//
// 已知风险：puppeteer 启动慢（~2-3s），首次调用耗时较大
//   优化：复用 browser 实例（lazy singleton）

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;
const REPORTER = require('./geo-reporter-agent');

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'data', 'geo', 'reports');

// 复用 browser 实例
let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }).catch(e => {
      browserPromise = null;
      throw e;
    });
  }
  return browserPromise;
}

// 极简 Markdown → HTML 转换（够用就行，覆盖 reporter 输出的格式）
function markdownToHtml(md) {
  const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = md.split('\n');
  const html = [];
  let inTable = false;
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 表格
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) { html.push('<table class="gtable">'); inTable = true; }
      const cells = line.slice(1, -1).split('|').map(c => c.trim());
      const isHeader = i + 1 < lines.length && lines[i + 1].match(/^\|[\s\-:|]+\|$/);
      const tag = isHeader ? 'th' : 'td';
      html.push(`<tr>${cells.map(c => `<${tag}>${formatInline(c)}</${tag}>`).join('')}</tr>`);
      continue;
    } else if (inTable) {
      html.push('</table>');
      inTable = false;
    }

    // 标题
    if (line.startsWith('# ')) {
      html.push(`<h1>${formatInline(line.slice(2))}</h1>`);
    } else if (line.startsWith('## ')) {
      html.push(`<h2>${formatInline(line.slice(3))}</h2>`);
    } else if (line.startsWith('### ')) {
      html.push(`<h3>${formatInline(line.slice(4))}</h3>`);
    }
    // 分隔线
    else if (line.startsWith('---')) {
      html.push('<hr>');
    }
    // 列表
    else if (line.match(/^- /)) {
      if (!inList) { html.push('<ul>'); inList = true; }
      html.push(`<li>${formatInline(line.slice(2))}</li>`);
      continue;
    } else if (inList && line.trim() === '') {
      html.push('</ul>');
      inList = false;
      continue;
    }
    // 引用（关键发现块）
    else if (line.startsWith('> ')) {
      html.push(`<blockquote>${formatInline(line.slice(2))}</blockquote>`);
    }
    // 普通段落
    else if (line.trim() !== '') {
      html.push(`<p>${formatInline(line)}</p>`);
    } else {
      html.push('');
    }
  }
  if (inTable) html.push('</table>');
  if (inList) html.push('</ul>');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif; max-width: 800px; margin: 30px auto; padding: 20px; color: #222; line-height: 1.6; }
  h1 { color: #4f46e5; border-bottom: 3px solid #4f46e5; padding-bottom: 8px; }
  h2 { color: #6366f1; margin-top: 24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  h3 { color: #6b7280; margin-top: 16px; }
  table.gtable { border-collapse: collapse; width: 100%; margin: 12px 0; }
  table.gtable th, table.gtable td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; font-size: 13px; }
  table.gtable th { background: #f3f4f6; font-weight: 600; }
  blockquote { border-left: 3px solid #4f46e5; padding-left: 12px; color: #4f46e5; font-style: italic; margin: 12px 0; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
  ul { padding-left: 20px; }
  em { color: #6b7280; }
  strong { color: #111827; }
  code { background: #f3f4f6; padding: 2px 4px; border-radius: 3px; font-family: monospace; }
</style></head><body>${html.join('\n')}</body></html>`;
}

function formatInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
}

async function generatePDF({ markdown, brand, reportType = 'weekly', week = null }) {
  if (!markdown) {
    return { ok: false, error: 'NO_MARKDOWN', message: 'markdown 不能为空' };
  }

  const startTs = Date.now();
  const html = markdownToHtml(markdown);

  let browser;
  try {
    browser = await getBrowser();
  } catch (e) {
    return { ok: false, error: 'PUPPETEER_LAUNCH_FAILED', message: e.message };
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    });
    await page.close();

    // 写文件
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const brandSlug = (brand || 'all').replace(/[^a-z0-9]/gi, '_');
    const filename = `${brandSlug}_${reportType}_${week || date}.pdf`;
    const savedPath = path.join(OUTPUT_DIR, filename);
    await fs.writeFile(savedPath, pdfBuffer);

    return {
      ok: true,
      saved_path: savedPath,
      bytes: pdfBuffer.length,
      report_type: reportType,
      brand: brand || 'all',
      week,
      generated_at: new Date().toISOString(),
      duration_ms: Date.now() - startTs,
    };
  } catch (e) {
    return { ok: false, error: 'PDF_GENERATE_FAILED', message: e.message };
  }
}

async function generateWeeklyPDF(brandId, options = {}) {
  const md = REPORTER.generateWeeklyReport(brandId, options);
  return generatePDF({
    markdown: md,
    brand: brandId,
    reportType: 'weekly',
    week: options.week,
  });
}

async function generateComparisonPDF(brandIds) {
  const md = REPORTER.generateComparisonReport(brandIds);
  return generatePDF({
    markdown: md,
    brand: 'comparison',
    reportType: 'comparison',
    week: new Date().toISOString().slice(0, 10),
  });
}

async function shutdownBrowser() {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      await browser.close();
    } catch (_) {}
    browserPromise = null;
  }
}

module.exports = {
  generatePDF,
  generateWeeklyPDF,
  generateComparisonPDF,
  shutdownBrowser,
  OUTPUT_DIR,
  markdownToHtml,
};