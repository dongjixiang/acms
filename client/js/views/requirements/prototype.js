// ===== 原型界面/流程示意图（v0.13 抽公共，2026-06-21）=====
// 抽自 client/js/views/requirements.js（原 L981-1133，152 行）
// 跨文件依赖：api / escHtml / toast（全局）
// 自带：sanitizeWireframe（HTML 清洗 10 行小函数，仅 prototype 区域使用）

// HTML 清洗：剥 script / on* 事件 / javascript: / link / @import
function sanitizeWireframe(html) {
  if (!html) return '';
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript\s*:/gi, 'blocked:')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/@import/gi, 'import-blocked');
}

async function checkPrototypeSketches(reqId, feedback) {
  const sketchesDiv = document.getElementById(`ai-clarify-sketches-${reqId}`);
  if (!sketchesDiv) return;
  const wasGenerated = sketchesDiv.dataset.generated;
  if (wasGenerated === 'loading') return;

  sketchesDiv.dataset.generated = 'loading';
  sketchesDiv.innerHTML = `<div class="review-panel" style="border-left:3px solid var(--accent3);padding:12px">
    <h3>🎨 界面线框图</h3>
    <div style="display:flex;align-items:center;gap:8px;padding:8px 0">
      <span style="font-size:13px;color:var(--text2)">⏳ ${feedback ? '根据反馈调整界面...' : 'AI 正在生成界面线框图...'}</span>
    </div>
    <div style="font-size:10px;color:var(--text3)">需要 30-60 秒，请稍候</div>
  </div>`;

  try {
    const modelId = document.getElementById(`ai-model-select-${reqId}`)?.value || '';
    const body = feedback ? { feedback, modelId } : { modelId };
    const result = await api('POST', `/ai/requirements/${reqId}/prototype-sketches`, body);
    if (!result.pages || result.pages.length === 0) {
      sketchesDiv.innerHTML = `<div class="review-panel" style="border-left:3px solid var(--accent3);padding:12px">
        <h3>🎨 界面线框图</h3>
        <div style="padding:8px;font-size:12px;color:var(--text2)">${result.message || '需求信息不足以生成线框图，请先进行澄清。'}</div>
      </div>`;
      sketchesDiv.dataset.generated = 'true';
      return;
    }
    sketchesDiv.innerHTML = renderPrototypeSketches(reqId, result.pages, result.flowDescription || '');
    sketchesDiv.dataset.generated = 'true';
  } catch (e) {
    console.error('[sketches] 生成示意图失败:', e.message);
    sketchesDiv.innerHTML = `<div class="review-panel" style="border-left:3px solid var(--accent3);padding:12px">
      <h3>🎨 界面线框图</h3>
      <div style="padding:8px;font-size:12px;color:var(--text2)">
        ⚠️ 生成超时，请稍后重试。<br>
        <button class="btn-small" style="margin-top:4px" onclick="checkPrototypeSketches('${reqId}')">🔄 重新生成</button>
      </div>
    </div>`;
    delete sketchesDiv.dataset.generated;
  }
}

function renderPrototypeSketches(reqId, pages, flowDescription) {
  let html = `<div class="review-panel" style="border-left:3px solid var(--accent3)">
    <h3>🎨 界面线框图 <span style="font-size:11px;font-weight:normal;color:var(--text2)">（${pages.length} 个页面，点击线框图可放大查看）</span></h3>
    <div style="font-size:11px;color:var(--text2);margin-bottom:8px">🤖 根据需求生成的界面布局示意，请确认是否符合预期</div>
    <div style="margin-bottom:10px;display:flex;gap:6px">
      <button class="btn-small" style="background:rgba(78,205,196,0.1);color:var(--green);font-size:11px" onclick="checkPrototypeSketches('${reqId}')">🔄 重新生成</button>
      <button class="btn-small" style="background:rgba(255,217,61,0.1);color:var(--accent3);font-size:11px" onclick="document.getElementById('sketch-feedback-${reqId}').style.display='block'">✏️ 提意见调整</button>
    </div>
    <div id="sketch-feedback-${reqId}" style="display:none;margin-bottom:10px">
      <div style="display:flex;gap:6px">
        <input type="text" id="sketch-feedback-input-${reqId}" placeholder="输入调整意见，如：列表页增加筛选栏、详情页把图放大..." style="flex:1;padding:6px 8px;font-size:12px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)">
        <button class="btn-small btn-accept" onclick="submitSketchFeedback('${reqId}')">提交调整</button>
      </div>
    </div>
    <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:6px">`;

  for (let pi = 0; pi < pages.length; pi++) {
    const p = pages[pi];
    const wireframe = sanitizeWireframe(p.wireframe || '');
    const arrow = pi < pages.length - 1
      ? `<div style="flex-shrink:0;display:flex;align-items:center;padding:0 2px;font-size:24px;color:var(--text3)">→</div>`
      : '';
    html += `
      <div style="flex-shrink:0;text-align:center;cursor:pointer" onclick="expandWireframe('${reqId}', ${pi})">
        <div style="font-size:10px;font-weight:bold;color:var(--text1);margin-bottom:2px">📄 ${escHtml(p.name)}</div>
        <div style="font-size:9px;color:var(--text2);margin-bottom:4px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.purpose || '')}</div>
        <div style="border:1px solid var(--border);border-radius:4px;overflow:hidden;background:#fafafa;width:200px;height:280px;position:relative">
          <div style="transform:scale(0.7);transform-origin:0 0;width:280px;">${wireframe}</div>
          <div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.4);color:#fff;font-size:9px;padding:1px 6px;border-radius:3px">🔍 放大</div>
        </div>
      </div>${arrow}`;
  }

  html += '</div>';

  if (flowDescription) {
    html += `<div style="margin-top:8px;font-size:11px;background:rgba(78,205,196,0.06);border:1px solid rgba(78,205,196,0.15);border-radius:4px;padding:8px;line-height:1.5">
      <strong style="color:var(--green)">🔄 操作流程</strong><br>${escHtml(flowDescription)}</div>`;
  }

  html += '</div>';
  return html;
}

function submitSketchFeedback(reqId) {
  const input = document.getElementById(`sketch-feedback-input-${reqId}`);
  const feedback = input?.value?.trim();
  if (!feedback) return toast('请先输入调整意见', 'error');
  input.value = '';
  checkPrototypeSketches(reqId, feedback);
}

// 全尺寸放大查看线框图（单方案版）
function expandWireframe(reqId, pageIndex) {
  const sketchesDiv = document.getElementById(`ai-clarify-sketches-${reqId}`);
  if (!sketchesDiv) return;

  const pageEls = sketchesDiv.querySelectorAll('[style*="flex-shrink:0;text-align:center;cursor:pointer"]');
  const pageEl = pageEls[pageIndex];
  if (!pageEl) return;

  const nameEl = pageEl.querySelector('[style*="font-weight:bold;color:var(--text1)"]');
  const purposeEl = pageEl.querySelector('[style*="color:var(--text2);margin-bottom:4px"]');
  const name = nameEl ? nameEl.textContent.replace('📄 ', '') : '';
  const purpose = purposeEl ? purposeEl.textContent : '';

  const mockupInner = pageEl.querySelector('[style*="transform:scale(0.7)"]');
  const wireframeHtml = mockupInner ? mockupInner.innerHTML : '';

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer';
  overlay.onclick = function(e) { if (e.target === overlay) document.body.removeChild(overlay); };

  const modal = document.createElement('div');
  modal.style.cssText = 'background:#f0f0f0;border-radius:8px;padding:20px 30px 30px;max-width:92vw;max-height:92vh;overflow:auto;cursor:default;box-shadow:0 8px 32px rgba(0,0,0,0.3)';
  modal.onclick = function(e) { e.stopPropagation(); };

  const title = document.createElement('div');
  title.style.cssText = 'font-size:14px;font-weight:bold;color:#333;margin-bottom:4px;text-align:center';
  title.textContent = `📄 ${name}`;

  const desc = document.createElement('div');
  desc.style.cssText = 'font-size:11px;color:#666;margin-bottom:10px;text-align:center';
  desc.textContent = purpose;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ 关闭';
  closeBtn.style.cssText = 'position:fixed;top:20px;right:20px;background:rgba(0,0,0,0.5);color:#fff;border:none;border-radius:4px;padding:6px 12px;font-size:13px;cursor:pointer;z-index:10000';
  closeBtn.onclick = function() { document.body.removeChild(overlay); };

  const mockupDiv = document.createElement('div');
  // 放大展示：根据屏幕宽度自适应缩放（线框图原始宽 280px，最高约 360px）
  const viewportScale = Math.min(2.5, Math.max(1.2, (window.innerWidth * 0.75) / 280));
  const scaledW = Math.round(280 * viewportScale);
  const scaledH = Math.round(360 * viewportScale);
  mockupDiv.style.cssText = `width:${scaledW}px;min-height:${scaledH}px;overflow:visible`;
  const inner = document.createElement('div');
  inner.style.cssText = `transform:scale(${viewportScale});transform-origin:0 0;width:280px`;
  inner.innerHTML = wireframeHtml;
  mockupDiv.appendChild(inner);

  modal.appendChild(title);
  modal.appendChild(desc);
  modal.appendChild(mockupDiv);
  overlay.appendChild(closeBtn);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
