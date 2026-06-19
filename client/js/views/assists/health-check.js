// ACMS · 需求体检 前端组件（v0.13 B4）
//   6 维度评分：完整性 / 模糊词 / 风险 / 干系人 / 假设 / 痛点
//   每条发现可持久化驳回 / 撤销
//   有专项卡片的维度（假设/干系人/风险/痛点）点击图标跳转
//   注册为 health_check

// ── 维度图标映射（点击跳转专项卡片） ──
const DIM_ICON_MAP = {
  '假设清晰度': { icon: '💭', method: 'assumptions', hasCard: true },
  '干系人覆盖': { icon: '👥', method: 'stakeholders', hasCard: true },
  '风险识别':   { icon: '⚠️', method: 'risks', hasCard: true },
  '痛点明确度': { icon: '😖', method: 'pains', hasCard: true },
  '完整性':     { icon: '📝', method: null, hasCard: false },
  '模糊词检测': { icon: '🔍', method: null, hasCard: false },
};
const DIM_FALLBACK = [
  { keyword: '假设', icon: '💭', method: 'assumptions', hasCard: true },
  { keyword: '干系人', icon: '👥', method: 'stakeholders', hasCard: true },
  { keyword: '风险', icon: '⚠️', method: 'risks', hasCard: true },
  { keyword: '痛点', icon: '😖', method: 'pains', hasCard: true },
  { keyword: '完整', icon: '📝', method: null, hasCard: false },
  { keyword: '模糊', icon: '🔍', method: null, hasCard: false },
];

function getDimInfo(name) {
  if (!name) return { icon: '📊', method: null, hasCard: false };
  const exact = DIM_ICON_MAP[name];
  if (exact) return exact;
  for (const f of DIM_FALLBACK) {
    if (name.includes(f.keyword)) return f;
  }
  return { icon: '📊', method: null, hasCard: false };
}

function scoreColor(s) {
  if (s >= 8) return '#6bcb6b';
  if (s >= 5) return '#ffd93d';
  return '#ff6b6b';
}

(function () {
  function render(reqId, data) {
    if (!data) return '';
    if (data.status === 'generating' || data.status === 'pending')
      return '<div class="insight-loading">⏳ 体检中，正在分析 6 维度…</div>';
    if (data.status === 'failed')
      return `<div class="insight-error">❌ 体检失败：${escHtml(data.error || '')}</div>`;

    const dims = Array.isArray(data.dimensions) ? data.dimensions : [];
    const totalScore = typeof data.overallScore === 'number' ? data.overallScore : 0;
    const summary = data.summary || '';
    const tColor = scoreColor(totalScore / 10);

    const dimsHtml = dims.map((d, idx) => {
      const di = getDimInfo(d.name);
      const findings = Array.isArray(d.findings) ? d.findings : [];
      const score = typeof d.score === 'number' ? d.score : 5;
      const barPct = score * 10;
      const barColor = scoreColor(score);

      const iconBtn = di.hasCard
        ? `<button class="hc-icon-btn" data-hc-jump="${escHtml(reqId)}|${di.method}" title="查看完整 ${d.name} 分析" style="background:none;border:none;cursor:pointer;font-size:17px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:6px;flex-shrink:0;color:var(--text2);transition:background 0.15s">${di.icon}</button>`
        : `<span style="font-size:17px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--text3)">${di.icon}</span>`;

      const findingsHtml = findings.map(f => {
        const ft = escHtml(f.text || '');
        const ev = f.evidence ? escHtml(f.evidence) : '';
        return `<div class="hc-finding" style="padding:6px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:10.5px;color:var(--text2);margin-bottom:2px">${ft}</div>
          ${ev ? `<div style="background:var(--bg3);padding:4px 8px;border-radius:4px;margin:4px 0;font-size:11px;color:var(--text3);border-left:2px solid var(--border);font-size:10px;color:var(--text3)">原文：${ev}</div>` : ''}
          <div style="margin-top:4px;display:flex;gap:6px;align-items:center">
            <button data-hc-dismiss="${escHtml(ft)}" style="padding:2px 8px;font-size:10px;background:transparent;border:1px solid var(--border);color:var(--text2);border-radius:4px;cursor:pointer">✕ 不认同</button>
            <button data-hc-restore="${escHtml(ft)}" style="display:none;padding:2px 8px;font-size:10px;background:transparent;border:1px solid var(--border);color:var(--text2);border-radius:4px;cursor:pointer">↩ 撤销</button>
            <span class="hc-persist-tag" style="display:none;font-size:9px;color:var(--text3)">💾 已驳回</span>
          </div>
        </div>`;
      }).join('');

      return `<div class="hc-dim">
        <div class="hc-dim-row" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg3);border-radius:6px;cursor:pointer;transition:background 0.15s" onclick="hcToggleDetail(event, this, ${idx})">
          ${iconBtn}
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:500;color:var(--text1);margin-bottom:2px">${escHtml(d.name)}</div>
            <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden">
              <div style="height:100%;width:${barPct}%;background:${barColor};border-radius:2px;transition:width 0.4s,background 0.4s"></div>
            </div>
            <div style="font-size:10px;color:var(--text3);margin-top:3px">${findings.length} 个发现</div>
          </div>
          <span class="hc-score" style="font-size:13px;font-weight:600;width:28px;text-align:right;flex-shrink:0;color:${barColor}">${score}</span>
          <span class="hc-chevron" style="font-size:10px;color:var(--text3);flex-shrink:0;transition:transform 0.2s">▾</span>
        </div>
        <div class="hc-dim-detail" style="display:none;padding:10px 12px 10px 52px;background:var(--bg2);border:1px solid var(--border);border-top:none;border-radius:0 0 6px 6px;margin:-4px 0 0;font-size:12px;line-height:1.7;color:var(--text2)">
          ${findingsHtml}
        </div>
      </div>`;
    }).join('');

    return `<div class="hc-card" style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:16px;margin:8px 0">
      <div style="display:flex;align-items:center;gap:16px;padding-bottom:14px;border-bottom:1px solid var(--border);margin-bottom:14px">
        <div style="width:72px;height:72px;border-radius:50%;background:conic-gradient(#ff6b6b 0deg ${Math.max(36, totalScore*3.6)}deg, #ffd93d ${Math.max(36, totalScore*3.6)}deg ${Math.min(360, totalScore*3.6+72)}deg, #6bcb6b ${Math.min(360, totalScore*3.6+72)}deg 360deg);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <div style="width:62px;height:62px;border-radius:50%;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center">
            <span style="font-size:24px;font-weight:700;color:${tColor};line-height:1">${totalScore}</span>
            <span style="font-size:9px;color:var(--text2);margin-top:1px">/ 100</span>
          </div>
        </div>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:2px">${totalScore >= 75 ? '状态良好' : totalScore >= 50 ? '需要补充，再想想' : '问题较多，建议先补充'}</div>
          <div style="font-size:11.5px;color:var(--text2);line-height:1.5">${escHtml(summary)}</div>
        </div>
      </div>
      <div class="hc-dims" style="display:flex;flex-direction:column;gap:4px">${dimsHtml}</div>
      <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <button class="btn-small" data-hc-regen="${escHtml(reqId)}" style="padding:5px 12px;font-size:12px">↻ 重新体检</button>
        <span style="margin-left:auto;font-size:10px;color:var(--text3)">💡 点击▾展开详情 · 点击图标跳转专项</span>
      </div>
    </div>`;
  }

  window.ACMSAssists.register('health_check', { name: '需求体检', render });
})();

// ── 全局交互函数 ──
function hcToggleDetail(e, row, idx) {
  // 如果点击了图标跳转按钮，不展开
  if (e.target.closest('[data-hc-jump]')) return;
  if (e.target.closest('[data-hc-dismiss]')) return;
  if (e.target.closest('[data-hc-restore]')) return;
  const detail = row.parentElement.querySelector('.hc-dim-detail');
  const chevron = row.querySelector('.hc-chevron');
  if (!detail) return;
  const isOpen = detail.style.display === 'block';
  detail.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}

document.addEventListener('click', function (e) {
  const t = e.target;

  // 图标跳转专项卡片
  const jump = t.closest('[data-hc-jump]');
  if (jump) {
    const [reqId, method] = jump.dataset.hcJump.split('|');
    if (reqId && method && typeof chatAssist === 'function') {
      chatAssist(reqId, method);
    }
    return;
  }

  // 驳回
  if (t.dataset.hcDismiss) {
    const findingText = t.dataset.hcDismiss;
    const findingEl = t.closest('[data-hc-finding]') || t.closest('.hc-finding') || t.parentElement.parentElement;
    const card = t.closest('.hc-card');
    const regenBtn = card ? card.querySelector('[data-hc-regen]') : null;
    const reqId = regenBtn ? regenBtn.dataset.hcRegen : '';
    if (!reqId) return;

    fetch(`/api/requirements/${reqId}/assist/health_check/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
      body: JSON.stringify({ findingText }),
    }).then(r => r.json()).then(data => {
      if (data.ok && findingEl) {
        findingEl.style.opacity = '0.35';
        const ds = findingEl.querySelector('[data-hc-dismiss]');
        const rs = findingEl.querySelector('[data-hc-restore]');
        const tag = findingEl.querySelector('.hc-persist-tag');
        if (ds) ds.style.display = 'none';
        if (rs) rs.style.display = 'inline-block';
        if (tag) tag.style.display = 'inline';
        if (typeof toast === 'function') toast('✕ 已驳回 · 下次体检不出现', 'info', 2000);
      }
    }).catch(() => {});
    return;
  }

  // 撤销驳回
  if (t.dataset.hcRestore) {
    const findingText = t.dataset.hcRestore;
    const findingEl = t.closest('[data-hc-finding]') || t.closest('.hc-finding') || t.parentElement.parentElement;
    const card = t.closest('.hc-card');
    const regenBtn = card ? card.querySelector('[data-hc-regen]') : null;
    const reqId = regenBtn ? regenBtn.dataset.hcRegen : '';
    if (!reqId) return;

    fetch(`/api/requirements/${reqId}/assist/health_check/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001' },
      body: JSON.stringify({ findingText }),
    }).then(r => r.json()).then(data => {
      if (data.ok && findingEl) {
        findingEl.style.opacity = '1';
        const ds = findingEl.querySelector('[data-hc-dismiss]');
        const rs = findingEl.querySelector('[data-hc-restore]');
        const tag = findingEl.querySelector('.hc-persist-tag');
        if (ds) ds.style.display = 'inline-block';
        if (rs) rs.style.display = 'none';
        if (tag) tag.style.display = 'none';
        if (typeof toast === 'function') toast('↩ 已撤销 · 下次体检可恢复', 'info', 2000);
      }
    }).catch(() => {});
    return;
  }

  // regen 重新体检
  if (t.dataset.hcRegen) {
    if (typeof chatAssistRegen === 'function') {
      chatAssistRegen(t.dataset.hcRegen, 'health_check');
    }
    return;
  }
}, true);
