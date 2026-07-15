// ACMS · 邮件发送辅助（v0.47，2026-07-15）
//   Method: send_email | Name: 邮件发送
//
// 渲染：
//   - sending：⏳ 正在发送…
//   - done：✅ 发送成功 + 收件人/主题/正文预览 + 重新发送按钮
//   - failed：错误提示（含 SMTP_NOT_CONFIGURED 等）

(function () {
  function render(reqId, data) {
    if (!data) return '';
    if (data.status === 'sending') {
      return '<div class="insight-loading">⏳ 正在发送邮件…</div>';
    }
    if (data.status === 'failed') {
      const errMap = {
        'SMTP_NOT_CONFIGURED': '❌ 后端未配置 SMTP。请在 server/config.json 加 smtp 字段（或设置 SMTP_HOST 等环境变量）',
        'NO_RECIPIENT': '❌ 请填写收件人邮箱',
        'NO_SUBJECT': '❌ 请填写邮件主题',
        'NO_BODY': '❌ 请填写邮件正文',
      };
      let errMsg = errMap[data.error] || `❌ 发送失败：${escHtml(data.error || '未知错误')}`;
      if (data.error && data.error.startsWith('INVALID_EMAIL:')) {
        errMsg = `❌ 邮箱格式不正确：${escHtml(data.error.slice('INVALID_EMAIL:'.length).trim())}`;
      }
      return `<div class="insight-error">${errMsg}</div>`;
    }
    if (data.status === 'done') {
      const rejectedHtml = (data.rejected && data.rejected.length > 0)
        ? `<div style="font-size:11px;color:#e74c3c;margin-top:4px">⚠ 被拒收：${escHtml(data.rejected.join(', '))}</div>`
        : '';
      const attachmentsHtml = (data.attachment_names && data.attachment_names.length > 0)
        ? `<div style="font-size:11px;color:var(--text2);margin-top:2px">
            📎 ${data.attachment_names.length} 个附件:${data.attachment_names.map(n => escHtml(n)).join('、')}
          </div>`
        : '';
      return `
        <div class="assist-section-title">📧 邮件发送</div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:4px">
          ✅ 已发送至 <b>${escHtml(data.to || '')}</b>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:6px">
          主题：${escHtml(data.subject || '')}
        </div>
        ${attachmentsHtml}
        <div style="font-size:12px;background:var(--bg2);padding:8px;border-radius:6px;max-height:180px;overflow-y:auto;white-space:pre-wrap;margin-bottom:6px">
          ${escHtml(data.body_preview || '')}${data.body_preview && data.body_preview.length >= 200 ? '…' : ''}
        </div>
        ${rejectedHtml}
        <div style="display:flex;gap:8px">
          <button class="btn-small btn-primary" onclick="chatEmailPrompt('${reqId}')">📧 再发一封</button>
        </div>
      `;
    }
    return '';
  }

  window.ACMSAssists.register('send_email', { name: '邮件发送', render });
})();

/** 全局函数：渲染内联表单 → 调 chatAssist 触发 send_email assist */
async function chatEmailPrompt(reqId) {
  if (!reqId) return;
  renderEmailForm(reqId);
}
