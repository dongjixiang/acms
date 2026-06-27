// ACMS · AI 图片生成辅助（v0.19，2026-06-27）
//   Method: image_gen | Name: AI 图片生成（Agnes Image）
//
// 卡片渲染：
//   - generating：⏳ 生成中
//   - done：显示图片 + 下载链接
//   - failed：错误提示
//
// 全局函数：
//   - chatImagePrompt(reqId)：弹输入框 → 调 chatAssist('image_gen', {...})

(function () {
  function render(reqId, data) {
    if (!data) return '';
    if (data.status === 'generating') {
      return '<div class="insight-loading">⏳ 正在生成图片…</div>';
    }
    if (data.status === 'done') {
      const isImg2Img = data.image_url ? true : false;
      // 尝试构造图片 URL：asset_path 是 workspace 内路径
      const imgSrc = data.image_url_output
        || (data.asset_path ? '/api/workspace/serve/' + data.asset_path : '');
      return `
        <div class="assist-section-title">🖼️ AI 图片生成 ✅</div>
        <div style="margin:8px 0">
          <div style="font-size:13px;margin-bottom:4px">描述：${escHtml(data.prompt || '')}</div>
          ${isImg2Img ? `<div style="font-size:11px;color:var(--text2);margin-bottom:4px">🔄 图生图（有参考图）</div>` : ''}
          <div style="font-size:11px;color:var(--text2);margin-bottom:8px">尺寸：${escHtml(data.size || '1024x1024')}</div>
          ${imgSrc ? `
            <div style="margin:8px 0">
              <img src="${escHtml(imgSrc)}" alt="生成的图片" style="max-width:100%;border-radius:8px;border:1px solid var(--border)">
            </div>
            <a href="${escHtml(imgSrc)}" target="_blank" rel="noopener noreferrer" class="btn-small btn-primary" style="text-decoration:none;display:inline-flex;align-items:center;gap:4px">
              🔗 查看原图
            </a>
          ` : '<div style="color:var(--warn);font-size:12px">图片 URL 不可用</div>'}
        </div>
      `;
    }
    if (data.status === 'failed') {
      const errMsg = data.error === 'NO_PROMPT'
        ? '❌ 请输入图片描述。点击 🖼️ 图片 按钮重新尝试。'
        : `❌ 生成失败：${escHtml(data.error || '未知错误')}`;
      return `<div class="insight-error">${errMsg}</div>`;
    }
    return '';
  }

  window.ACMSAssists.register('image_gen', { name: 'AI 图片生成（Agnes Image）', render });
})();

/**
 * 全局函数：渲染内联表单 → 调 chatAssist 触发 image assist
 */
async function chatImagePrompt(reqId) {
  if (!reqId) return;
  renderImageForm(reqId);
}
