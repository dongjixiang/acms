// ACMS GEO 推送服务（v0.1 — Phase 2 #2 PDF 月报推送）
// 用途：月报/周报生成后自动推送到 Email / Webhook
// 路径：server/services/geo-push-service.js
//
// 配置（system_configs，admin UI 或 configure 脚本设置）：
//   geo_push_email_to    — 逗号分隔的收件人（可选，留空不发邮件）
//   geo_push_webhook_url — Webhook URL（可选，留空不发 webhook）
//
// 流程：
//   1. 生成月报 markdown（geo-monthly-report）
//   2. 转 PDF（geo-pdf-report，可选）
//   3. Email 推送（复用 email-sender.sendEmail，PDF 附件走 deps.attachments 透传）
//   4. Webhook 推送（POST JSON，含 report_url / summary）
//
// 安全：
//   - SMTP 未配置时跳过 email（返回 skipped:true 不报错）
//   - Webhook 失败不阻断（catch + log）

const { collection } = require('../db/connection');
const MONTHLY = require('./geo-monthly-report');
const PDF = require('./geo-pdf-report');

const CONFIG_EMAIL_TO = 'geo_push_email_to';
const CONFIG_WEBHOOK_URL = 'geo_push_webhook_url';

function getPushConfig() {
  try {
    const sysConfigs = collection('system_configs');
    const emailCfg = sysConfigs.findOne(c => c.key === CONFIG_EMAIL_TO);
    const webhookCfg = sysConfigs.findOne(c => c.key === CONFIG_WEBHOOK_URL);
    return {
      emailTo: emailCfg?.value || '',
      webhookUrl: webhookCfg?.value || '',
    };
  } catch (e) {
    return { emailTo: '', webhookUrl: '' };
  }
}

// 推送月报（markdown + PDF）
async function pushMonthlyReport(brandId, options = {}) {
  const { month = null, includePdf = true, force = false } = options;
  const config = getPushConfig();

  const brand = require('./geo-store').getBrand(brandId);
  if (!brand) {
    return { ok: false, error: 'BRAND_NOT_FOUND' };
  }

  const targetMonth = month || MONTHLY.currentMonth();
  const results = { brand: brand.name, month: targetMonth };

  // 1. 生成 markdown
  const md = MONTHLY.generateMonthlyReport(brandId, { month: targetMonth });
  results.markdown_bytes = md.length;

  // 2. 生成 PDF（可选）
  let pdfPath = null;
  let pdfBytes = null;
  if (includePdf) {
    const pdfResult = await PDF.generatePDF({
      markdown: md,
      brand: brand.name,
      reportType: 'monthly',
      week: targetMonth,
    });
    if (pdfResult.ok) {
      pdfPath = pdfResult.saved_path;
      pdfBytes = pdfResult.bytes;
      results.pdf_path = pdfPath;
      results.pdf_bytes = pdfBytes;
    } else {
      results.pdf_error = pdfResult.error;
    }
  }

  // 3. Email 推送
  if (config.emailTo) {
    try {
      const emailSender = require('./email-sender');
      const toList = config.emailTo.split(',').map(s => s.trim()).filter(Boolean);
      const attachments = pdfPath
        ? [{ filename: `GEO月报_${brand.name}_${targetMonth}.pdf`, path: pdfPath }]
        : [];

      const emailResult = await emailSender.sendEmail({
        to: toList,
        subject: `[GEO] ${brand.name} 月报 ${targetMonth}`,
        body: `GEO 月报已生成。\n\n${md.slice(0, 2000)}\n\n（完整报告见附件 PDF）`,
      }, {
        // 直接传 attachments（透传，绕过 file_ids 解析）
        attachments,
      });

      results.email = {
        ok: true,
        recipients: toList,
        message_id: emailResult.info?.messageId || null,
      };
    } catch (e) {
      results.email = { ok: false, error: e.message };
    }
  } else {
    results.email = { ok: true, skipped: true, reason: '未配置 geo_push_email_to' };
  }

  // 4. Webhook 推送
  if (config.webhookUrl) {
    try {
      const body = JSON.stringify({
        event: 'geo.monthly_report',
        timestamp: new Date().toISOString(),
        brand: { id: brandId, name: brand.name, domain: brand.domain },
        month: targetMonth,
        markdown_bytes: md.length,
        pdf_path: pdfPath,
        pdf_bytes: pdfBytes,
        summary: md.slice(0, 500),
      });
      const resp = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      results.webhook = { ok: resp.ok, status: resp.status };
    } catch (e) {
      results.webhook = { ok: false, error: e.message };
    }
  } else {
    results.webhook = { ok: true, skipped: true, reason: '未配置 geo_push_webhook_url' };
  }

  results.completed_at = new Date().toISOString();
  return { ok: true, ...results };
}

module.exports = {
  getPushConfig,
  pushMonthlyReport,
  CONFIG_EMAIL_TO,
  CONFIG_WEBHOOK_URL,
};