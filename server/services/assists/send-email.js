// ACMS · 邮件发送辅助（v0.47，2026-07-15）
//   用户在聊天流里点 📧 邮件 按钮 → 弹内联表单填收件人/主题/正文
//   → 后端用 SMTP（nodemailer）发出 → 写入 requirement.assist_send_email 留痕
//
// 字段：requirement.assist_send_email
//   status / to / subject / body / sent_at / message_id / accepted / rejected / error
//
// SMTP 配置从 server/config.js 的 smtp 字段读（环境变量或 config.json.smtp）；
// 未配置时返回友好错误（前端显示「未配置 SMTP」），不崩溃。

const nodemailer = require('nodemailer');
const reqStore = require('../../stores/requirement-store');
const config = require('../../config');
const chatUploadSvc = require('../chat-upload'); // 复用文件上传:getFilePath(id) → { filePath, meta }

const name = '邮件发送';

// 简单邮箱校验（够用即可，复杂的留后端 SMTP 拒信提示）
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 把 to 字段解析成数组（支持分号、逗号、中文逗号分隔）
 *   "a@x.com; b@x.com, c@x.com、d@x.com" → ["a@x.com", "b@x.com", "c@x.com", "d@x.com"]
 */
function parseRecipients(to) {
  if (Array.isArray(to)) return to.map(s => String(s).trim()).filter(Boolean);
  return String(to || '')
    .split(/[;,,、\s]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * 把附件 ID 列表解析成 nodemailer attachments
 *   复用 chat-upload 服务的 getFilePath(id)，文件已在磁盘上不复制
 * @returns {Array<{filename, path, contentType}>} 解析失败的会抛出
 */
function resolveAttachments(fileIds) {
  if (!fileIds) return [];
  const ids = Array.isArray(fileIds) ? fileIds : [fileIds];
  const atts = [];
  for (const id of ids) {
    if (!id) continue;
    const found = chatUploadSvc.getFilePath(id);
    if (!found) throw new Error(`附件不存在或已过期: ${id}`);
    const meta = found.meta || {};
    atts.push({
      filename: meta.name || '附件',
      path: found.filePath,
      contentType: meta.mime || undefined,
    });
  }
  return atts;
}

/**
 * 跑邮件发送任务
 * @param {string} requirementId
 * @param {object} opts { to, subject, body, isHtml? }
 */
async function runAssistJob(requirementId, opts = {}) {
  try {
    const req = reqStore.getById(requirementId);
    if (!req) return;

    // ── 0. 校验 SMTP 配置 ──
    const smtp = config.smtp;
    if (!smtp || !smtp.host) {
      reqStore.update(requirementId, {
        assist_send_email: JSON.stringify({
          status: 'failed',
          error: 'SMTP_NOT_CONFIGURED',
          to: opts.to || '',
          subject: opts.subject || '',
          generated_at: new Date().toISOString(),
        }),
      });
      return;
    }

    // ── 1. 解析 + 校验入参 ──
    const recipients = parseRecipients(opts.to);
    if (recipients.length === 0) {
      reqStore.update(requirementId, {
        assist_send_email: JSON.stringify({
          status: 'failed', error: 'NO_RECIPIENT',
          to: opts.to || '', subject: opts.subject || '',
          generated_at: new Date().toISOString(),
        }),
      });
      return;
    }
    const invalid = recipients.filter(r => !EMAIL_RE.test(r));
    if (invalid.length > 0) {
      reqStore.update(requirementId, {
        assist_send_email: JSON.stringify({
          status: 'failed', error: `INVALID_EMAIL: ${invalid.join(', ')}`,
          to: opts.to, subject: opts.subject || '',
          generated_at: new Date().toISOString(),
        }),
      });
      return;
    }
    const subject = String(opts.subject || '').trim();
    if (!subject) {
      reqStore.update(requirementId, {
        assist_send_email: JSON.stringify({
          status: 'failed', error: 'NO_SUBJECT',
          to: opts.to, subject: '',
          generated_at: new Date().toISOString(),
        }),
      });
      return;
    }
    const body = String(opts.body || '').trim();
    if (!body) {
      reqStore.update(requirementId, {
        assist_send_email: JSON.stringify({
          status: 'failed', error: 'NO_BODY',
          to: opts.to, subject,
          generated_at: new Date().toISOString(),
        }),
      });
      return;
    }

    // ── 2. 解析附件（可选，错误直接 failed 不发空）──
    let attachments = [];
    try {
      attachments = resolveAttachments(opts.file_ids);
    } catch (e) {
      reqStore.update(requirementId, {
        assist_send_email: JSON.stringify({
          status: 'failed', error: e.message,
          to: opts.to, subject,
          generated_at: new Date().toISOString(),
        }),
      });
      return;
    }

    // ── 3. 标记 sending ──
    reqStore.update(requirementId, {
      assist_send_email: JSON.stringify({
        status: 'sending',
        to: recipients.join(', '),
        subject,
        body_preview: body.slice(0, 200),
        attachment_names: attachments.map(a => a.filename),
        error: null,
        generated_at: new Date().toISOString(),
      }),
    });

    // ── 4. 发信 ──
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    });

    const fromAddr = smtp.fromName
      ? `"${smtp.fromName}" <${smtp.from}>`
      : smtp.from;

    const info = await transporter.sendMail({
      from: fromAddr,
      to: recipients.join(', '),
      subject,
      text: body,
      attachments,
    });

    // ── 5. 写 done ──
    reqStore.update(requirementId, {
      assist_send_email: JSON.stringify({
        status: 'done',
        to: recipients.join(', '),
        subject,
        body_preview: body.slice(0, 200),
        attachment_names: attachments.map(a => a.filename),
        message_id: info.messageId || '',
        accepted: info.accepted || recipients,
        rejected: info.rejected || [],
        response: info.response || '',
        error: null,
        sent_at: new Date().toISOString(),
        generated_at: new Date().toISOString(),
      }),
    });

    console.log(`[assist.send_email] ${requirementId} 发送成功 → ${recipients.join(', ')} | subject="${subject}"`);
  } catch (e) {
    console.error(`[assist.send_email] ${requirementId} 异常:`, e.message);
    reqStore.update(requirementId, {
      assist_send_email: JSON.stringify({
        status: 'failed',
        error: e.message || String(e),
        to: opts.to || '',
        subject: opts.subject || '',
        generated_at: new Date().toISOString(),
      }),
    });
  }
}

/**
 * 读当前 send_email 数据
 */
function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try { return JSON.parse(req.assist_send_email || 'null'); } catch { return null; }
}

module.exports = { name, runAssistJob, getAssist };
