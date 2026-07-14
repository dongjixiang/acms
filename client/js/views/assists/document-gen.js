// ACMS · 文档生成辅助（v0.46，2026-07-15）
//   Method: document_gen | Name: 文档生成
//
// 渲染：
//   - pending_input：输入指令文本框 + 提交按钮
//   - generating：⏳ 生成中
//   - done：预览内容 + 📥 .md 下载 + 📥 .docx 下载
//   - failed：错误提示
//
// 全局函数：
//   - chatDocumentPrompt(reqId)：渲染内联表单 → 调 chatAssist('document_gen', ...)
//   - submitPendingDocumentGen(reqId)：提交 pending 输入 → 开始生成
//
(function () {
  function render(reqId, data) {
    if (!data) return '';
    if (data.status === 'pending_input') {
      return renderPendingInput(reqId, data);
    }
    if (data.status === 'generating') {
      return '<div class="insight-loading">⏳ 正在生成文档…</div>';
    }
    if (data.status === 'failed') {
      const errMsg = data.error === 'NO_INSTRUCTION'
        ? '❌ 请输入指令。点击 📄 文档 按钮重新尝试。'
        : `❌ 生成失败：${escHtml(data.error || '未知错误')}`;
      return `<div class="insight-error">${errMsg}</div>`;
    }
    if (data.status === 'done') {
      const previewMd = (data.md_content || '').slice(0, 500);
      const hasMore = (data.md_content || '').length > 500;
      const docxHtml = data.docx_url
        ? `<a href="${escHtml(data.docx_url)}" target="_blank" class="btn-small" style="text-decoration:none;display:inline-flex;align-items:center;gap:3px;font-size:11px">📥 下载 .docx</a>`
        : '<span style="font-size:11px;color:var(--text3)">Pandoc 不可用，仅提供 .md</span>';
      return `
        <div class="assist-section-title">📄 文档生成</div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:6px">
          指令：${escHtml(data.user_instruction || '')}
        </div>
        <div style="font-size:12px;background:var(--bg2);padding:8px;border-radius:6px;max-height:300px;overflow-y:auto;font-family:monospace;white-space:pre-wrap;margin-bottom:6px">
          ${escHtml(previewMd)}${hasMore ? '\n...' : ''}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a href="${escHtml(data.md_url || '')}" target="_blank" class="btn-small btn-primary" style="text-decoration:none;display:inline-flex;align-items:center;gap:3px;font-size:11px">📥 下载 .md</a>
          ${docxHtml}
        </div>
      `;
    }
    return '';
  }

  window.ACMSAssists.register('document_gen', { name: '文档生成', render });
})();

/** 全局函数：渲染内联表单 → 调 chatAssist 触发 document assist */
async function chatDocumentPrompt(reqId) {
  if (!reqId) return;
  renderDocumentForm(reqId);
}

/** 提交 pending 状态的表单 → 真正调用后端生成 */
async function submitPendingDocumentGen(reqId) {
  const ta = document.getElementById('doc-gen-instruction-' + reqId);
  const instruction = ta?.value?.trim() || '';
  if (!instruction) {
    toast('请输入文档指令', 'warning');
    return;
  }
  try {
    toast('📄 开始生成文档', 'info', 2000);
    await chatAssist(reqId, 'document_gen', { instruction });
  } catch (e) {
    toast('生成失败: ' + e.message, 'error');
  }
}

/** pending_input 表单渲染 */
function renderPendingInput(reqId, data) {
  const prevInstruction = data?.user_instruction || '';
  return `
    <div class="assist-section-title">📄 文档生成</div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:6px">
      输入指令，AI 将根据对话历史生成 Markdown 文档并转为 Word 文件
    </div>
    <textarea id="doc-gen-instruction-${reqId}"
      placeholder="例如：把讨论内容整理成需求文档"
      style="width:100%;min-height:60px;padding:6px;border:1px solid var(--border);border-radius:4px;font-size:12px;box-sizing:border-box"
    >${escHtml(prevInstruction)}</textarea>
    <div style="margin-top:6px">
      <button class="btn-small btn-primary" onclick="submitPendingDocumentGen('${reqId}')">🚀 生成文档</button>
    </div>
  `;
}

/** 内联表单配置（供 chat-inline-form.js 调用） */
function renderDocumentForm(reqId) {
  renderInlineForm(reqId, {
    icon: '📄',
    title: '文档生成',
    method: 'document_gen',
    fields: [
      { id: 'instruction', label: '文档指令 *', placeholder: '例如：把讨论内容整理成需求文档', type: 'text' },
    ],
  });
}
