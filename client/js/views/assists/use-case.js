// ACMS · 方法论驱动的"整理"功能前端渲染组件（v0.13）
//   按 ECSR 模型 + 5 要素 + 三层次过滤 + 假设清单 渲染
//   假设清单单独灰底区块、每条目独立 checkbox + 优先级 + 编辑/丢弃
//   底部 3 按钮：提交采纳 / 重整 / 全部丢弃

// v0.13 B3 fix (4th): escHtml 提到 IIFE 外部
//   bug: escHtml 在 IIFE 内部, 外部所有 renderMarkdownContent/renderAssumptionList/switchToEditMode/ucConfirm
//        等调它时闭包失效 throw "escHtml is not defined", 弹层半渲染 → 之前"内容被割裂"的真因之一
//   修: 提到 IIFE 外部 (顶层), render 闭包仍能引用, 外部函数也能引用
function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// v0.13 B3 fix (4th): **xxx** → <strong>xxx</strong> 解析 (段内加粗)
//   多多要求: 每段重要概要信息加粗
//   修: renderMarkdownBold 转义后替换 **xxx** 为 <strong>
//        注意: 必须先 escHtml (避免 XSS), 再替换 **xxx** (避免 ** 内 HTML 被破坏)
function renderMarkdownBold(text) {
  if (text == null) return '';
  return escHtml(text).replace(/\*\*([^*]+)\*\*/g, '<strong style="color:var(--accent)">$1</strong>');
}

(function () {
  const PRIORITY_LABEL = { must: '必做', should: '应做', could: '能做', wont: '不做' };
  const PRIORITY_COLOR = { must: 'var(--green)', should: 'var(--accent)', could: 'var(--text2)', wont: 'var(--text3)' };

  function renderPrioritySelect(item, layerKey, roleKey) {
    const opts = ['must', 'should', 'could', 'wont'].map(p =>
      `<option value="${p}" ${item.priority === p ? 'selected' : ''}>${PRIORITY_LABEL[p]}</option>`
    ).join('');
    const id = `uc-prio-${item.id}`;
    return `<select id="${id}" data-uc-prio="${item.id}|${layerKey}|${roleKey || ''}" style="padding:2px 6px;font-size:11px;background:var(--bg);color:${PRIORITY_COLOR[item.priority]};border:1px solid var(--border);border-radius:3px">${opts}</select>`;
  }

  function renderCaseCard(item, layerKey, roleKey) {
    const checkId = `uc-chk-${item.id}`;
    return `
      <div class="uc-case" data-uc-case="${item.id}" style="padding:8px 10px;margin-bottom:6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <input type="checkbox" id="${checkId}" data-uc-check="${item.id}|${layerKey}|${roleKey || ''}" checked style="width:14px;height:14px;cursor:pointer">
          <span style="font-size:11px;color:var(--text2);font-family:monospace">${escHtml(item.id)}</span>
          ${renderPrioritySelect(item, layerKey, roleKey)}
          <span style="margin-left:auto;font-size:11px;color:var(--text3)">依赖: ${item.deps && item.deps.length > 0 ? item.deps.map(d => escHtml(d)).join(', ') : '无'}</span>
        </div>
        <div style="font-size:13px;line-height:1.5;color:var(--text1);margin:4px 0">
          <span data-uc-desc="${item.id}">${escHtml(item.desc || '(无描述)')}</span>
          <button class="uc-edit-btn" data-uc-edit="${item.id}" style="margin-left:8px;padding:1px 6px;font-size:10px;background:transparent;color:var(--accent);border:1px solid var(--border);border-radius:3px;cursor:pointer">编辑</button>
        </div>
        <details style="font-size:11px;color:var(--text2);margin-top:4px">
          <summary style="cursor:pointer;color:var(--text3)">📋 验收条件 (Given/When/Then)</summary>
          <div style="padding:6px 0;margin-top:4px;background:var(--bg);border-radius:4px;padding:8px">
            <div style="margin:2px 0"><strong>Given:</strong> <span data-uc-ac-given="${item.id}">${escHtml(item.ac?.given || '')}</span></div>
            <div style="margin:2px 0"><strong>When:</strong> <span data-uc-ac-when="${item.id}">${escHtml(item.ac?.when || '')}</span></div>
            <div style="margin:2px 0"><strong>Then:</strong> <span data-uc-ac-then="${item.id}">${escHtml(item.ac?.then || '')}</span></div>
          </div>
        </details>
        <div style="text-align:right;margin-top:4px">
          <button class="uc-discard-btn" data-uc-discard="${item.id}" style="padding:1px 6px;font-size:10px;background:transparent;color:var(--accent2);border:1px solid var(--border);border-radius:3px;cursor:pointer">✕ 丢弃</button>
        </div>
      </div>`;
  }

  function renderAssumptions(data) {
    if (!data.assumptions || data.assumptions.length === 0) return '';
    const items = data.assumptions.map(a => `
      <div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px">
        <input type="checkbox" data-uc-assump="${escHtml(a.id)}" checked style="width:13px;height:13px">
        <span style="font-family:monospace;color:var(--text2)">${escHtml(a.id)}</span>
        <span style="flex:1;color:var(--text1)">${escHtml(a.text)}</span>
        <span style="font-size:10px;padding:1px 6px;border-radius:3px;background:${a.risk === 'high' ? 'rgba(255,68,68,0.15)' : a.risk === 'medium' ? 'rgba(255,217,61,0.15)' : 'rgba(78,205,196,0.15)'};color:${a.risk === 'high' ? '#f44' : a.risk === 'medium' ? '#daa520' : 'var(--green)'};border:1px solid var(--border)">风险: ${a.risk === 'high' ? '高' : a.risk === 'medium' ? '中' : '低'}</span>
      </div>
    `).join('');
    return `
      <details open style="margin-bottom:12px;background:rgba(255,217,61,0.04);border:1px solid rgba(255,217,61,0.2);border-radius:6px;padding:8px 12px">
        <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--accent3);user-select:none">
          ⚠️ 假设清单（${data.assumptions.length} 条 · 待你确认）
        </summary>
        <div style="margin-top:8px">
          ${items}
        </div>
      </details>`;
  }

  function renderLayerSection(layerTitle, items, layerKey, roleKey) {
    if (!items || items.length === 0) return '';
    const cards = items.map(it => renderCaseCard(it, layerKey, roleKey)).join('');
    return `
      <details open style="margin-bottom:12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 12px">
        <summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--text1);user-select:none">
          ${layerTitle}（${items.length} 条）
        </summary>
        <div style="margin-top:8px">
          ${cards}
        </div>
      </details>`;
  }

  function render(reqId, data) {
    if (!data || data.status !== 'done' || data.tool !== 'use_case') return '';

    const summary = data.summary || '';
    const businessHtml = renderLayerSection('📊 业务层', data.businessCases, 'business');
    const userCases = data.userCases || {};
    const userHtml = Object.keys(userCases).filter(r => userCases[r] && userCases[r].length > 0).map(role =>
      renderLayerSection(`👥 用户层 · ${role}`, userCases[role], 'user', role)
    ).join('');
    const systemHtml = renderLayerSection('⚙️ 系统层', data.systemCases, 'system');

    const totalCount = (data.businessCases?.length || 0) +
      Object.values(userCases).reduce((s, arr) => s + (arr?.length || 0), 0) +
      (data.systemCases?.length || 0);

    return `
      <div class="use-case-brief" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px;margin:8px 0">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div>
            <div style="font-size:14px;font-weight:600;color:var(--text1)">✨ 方法论整理 · 用例（Use Case）</div>
            <div style="font-size:11px;color:var(--text2);margin-top:2px">${escHtml(summary)}</div>
          </div>
          <div style="font-size:11px;color:var(--text3)">${totalCount} 条建议</div>
        </div>

        ${renderAssumptions(data)}

        ${businessHtml}
        ${userHtml}
        ${systemHtml}

        <div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn-primary" data-uc-apply="${escHtml(reqId)}" style="padding:6px 14px;font-size:13px">✅ 提交采纳</button>
          <button class="btn-small" data-uc-regen="${escHtml(reqId)}" style="padding:6px 14px;font-size:13px">↻ 重整</button>
          <button class="btn-small" data-uc-discard-all="${escHtml(reqId)}" style="padding:6px 14px;font-size:13px">✕ 全部丢弃</button>
          <span style="margin-left:auto;font-size:11px;color:var(--text3)">💡 勾选要采纳的条目，点击提交</span>
        </div>
      </div>`;
  }

  window.ACMSAssists.register('use_case', { name: '方法论整理（Use Case）', render });
})();

// ── 全局交互函数 ──

/** 编辑某条用例的描述（inline textarea） */
function ucEditCase(itemId) {
  const descSpan = document.querySelector(`[data-uc-desc="${itemId}"]`);
  if (!descSpan) return;
  const current = descSpan.textContent;
  const ta = document.createElement('textarea');
  ta.value = current;
  ta.style.cssText = 'width:100%;min-height:40px;padding:4px 6px;font-size:13px;background:var(--bg);color:var(--text1);border:1px solid var(--accent);border-radius:3px;font-family:inherit';
  descSpan.replaceWith(ta);
  ta.focus();
  // 失焦保存
  const save = () => {
    const span = document.createElement('span');
    span.dataset.ucDesc = itemId;
    span.style.cssText = '';
    span.textContent = ta.value;
    ta.replaceWith(span);
  };
  ta.addEventListener('blur', save);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.blur(); }
    if (e.key === 'Escape') { ta.value = current; ta.blur(); }
  });
}

/** 收集当前卡片的所有用户操作 */
function ucCollectActions(layer, cardEl, reqId) {
  const actions = { acceptedItems: [], confirmedAssumptions: [], discardedItems: [] };

  // 1. 假设清单
  const assumps = document.querySelectorAll('[data-uc-assump]');
  assumps.forEach(cb => {
    const id = cb.dataset.ucAssump;
    if (cb.checked) actions.confirmedAssumptions.push({ id });
  });

  // 2. 用例条目
  const caseEls = document.querySelectorAll('[data-uc-case]');
  caseEls.forEach(el => {
    const id = el.dataset.ucCase;
    const check = el.querySelector(`[data-uc-check^="${id}|"]`);
    if (!check) return;
    const isChecked = check.checked;
    const meta = check.dataset.ucCheck.split('|');
    const layer = meta[1];
    const role = meta[2] || null;
    const prioSelect = el.querySelector(`[data-uc-prio^="${id}|"]`);
    const priority = prioSelect ? prioSelect.value : 'should';
    const descEl = el.querySelector(`[data-uc-desc="${id}"]`);
    const desc = descEl ? descEl.textContent : '';
    const acGiven = (el.querySelector(`[data-uc-ac-given="${id}"]`) || {}).textContent || '';
    const acWhen = (el.querySelector(`[data-uc-ac-when="${id}"]`) || {}).textContent || '';
    const acThen = (el.querySelector(`[data-uc-ac-then="${id}"]`) || {}).textContent || '';
    const item = { id, layer, role, desc, priority, deps: [], ac: { given: acGiven, when: acWhen, then: acThen } };
    if (isChecked) actions.acceptedItems.push(item);
    else actions.discardedItems.push(item);
  });

  return actions;
}

/** 提交采纳 — v0.13 B1: 改成调 /apply/preview 触发 5 段式 preview 弹层
 *  v0.13 B4: 加 loading 界面（LLM 生成预览需要 30-60s，不能只靠 toast） */
async function ucApply(reqId) {
  const card = document.querySelector(`.use-case-brief`);
  if (!card) return;
  const actions = ucCollectActions('use_case', card, reqId);
  if (actions.acceptedItems.length === 0) {
    if (typeof toast === 'function') toast('请至少勾选 1 条要采纳的条目', 'warning');
    return;
  }
  // 备份原卡片内容，loading 结束后恢复
  const innerBackup = card.innerHTML;
  // 显示 loading 界面（替代 toast）
  card.innerHTML = `
    <div style="padding:40px 20px;text-align:center;background:var(--bg3);border:1px solid var(--border);border-radius:8px;margin:8px 0">
      <div style="font-size:32px;margin-bottom:12px;animation:uc-spin 1.2s linear infinite">⏳</div>
      <div style="font-size:14px;color:var(--text1);margin-bottom:6px">AI 正在整理为 5 段式结构…</div>
      <div style="font-size:11px;color:var(--text3)">这一步需要调用大模型生成完整需求文档，预计 30-60 秒</div>
    </div>
    <style>
      @keyframes uc-spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
    </style>
  `;
  // 从已渲染的 card 读出 structuredData（保留完整结构化数据持久化）
  const structuredData = window._lastUseCaseStructuredData?.[reqId] || null;
  try {
    const API_KEY = 'dev-key-001';
    const r = await fetch(`/api/requirements/${reqId}/assist/use_case/apply/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify({
        acceptedItems: actions.acceptedItems,
        confirmedAssumptions: actions.confirmedAssumptions,
        discardedItems: actions.discardedItems,
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      card.innerHTML = innerBackup; // 恢复原卡片
      if (typeof toast === 'function') toast('预览生成失败: ' + (data.error || r.statusText), 'error');
      return;
    }
    // 弹 inline 编辑层（= mockup 状态 2），替换 loading
    openUcPreviewLayer(reqId, data.description, {
      applied: actions.acceptedItems.length,
      discarded: actions.discardedItems.length,
      confirmed: actions.confirmedAssumptions.length,
      structuredData,
    });
  } catch (e) {
    card.innerHTML = innerBackup; // 恢复原卡片
    if (typeof toast === 'function') toast('整理失败: ' + e.message, 'error');
  }
}

/** v0.13 B2: 弹 inline 预览层（默认只读模式：5 段式结构化卡片）
 *  3 按钮: [✏️ 编辑描述] [✅ 确认采纳] [✕ 取消]
 *  解析失败时降级到 textarea（保留 B1 行为）
 */
function openUcPreviewLayer(reqId, initialDescription, meta) {
  // 关闭已存在的（防止重复弹）
  const existing = document.getElementById(`uc-preview-layer-${reqId}`);
  if (existing) existing.remove();

  const card = document.querySelector(`.use-case-brief`);
  if (!card) return;

  // 备份原 innerHTML（取消/确认时恢复）
  const innerBackup = card.innerHTML;
  card.dataset.ucPreviewOriginal = innerBackup;
  card.dataset.ucPreviewDescription = initialDescription;  // 编辑模式用
  card.classList.add('uc-card', 'edit-mode');

  // 解析 LLM 输出 → 结构化对象
  const structuredData = meta.structuredData || null;
  const parsed = parsePreviewDescription(initialDescription);

  // 渲染 5 段式结构化卡片（解析失败时降级到 textarea）
  const body = parsed
    ? renderPreviewCards(parsed, structuredData)
    : `<textarea id="uc-preview-textarea-${reqId}" style="width:100%;min-height:380px;padding:14px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;font-family:ui-monospace,'Cascadia Code','Consolas',monospace;font-size:12.5px;line-height:1.6;resize:vertical;box-sizing:border-box">${escHtml(initialDescription)}</textarea>
       <div style="font-size:11px;color:var(--accent3);margin:8px 0">⚠️ 解析失败，已降级为纯文本编辑模式</div>`;

  card.innerHTML = `
    <div class="uc-banner" style="background:rgba(78,205,196,0.1);border:1px solid var(--accent);border-radius:6px 6px 0 0;padding:8px 14px;margin:-16px -16px 12px;font-size:12px;color:var(--accent);display:flex;align-items:center;gap:8px">
      <span>📋</span>
      <span>5 段式预览（先看完再决定改不改）</span>
      <span style="margin-left:auto;color:var(--text2)">采纳 <span style="background:var(--bg2);padding:1px 8px;border-radius:10px;font-size:11px">${meta.applied} 条</span> · 丢弃 <span style="background:var(--bg2);padding:1px 8px;border-radius:10px;font-size:11px">${meta.discarded} 条</span> · 假设 <span style="background:var(--bg2);padding:1px 8px;border-radius:10px;font-size:11px">${meta.confirmed} 条</span></span>
    </div>
    ${body}
    <div class="uc-actions" style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between">
      <div style="display:flex;gap:8px">
        <button class="btn-small" data-uc-edit-desc="${escHtml(reqId)}" style="padding:6px 14px;font-size:13px"${parsed ? '' : ' disabled'}>✏️ 编辑描述</button>
        <button class="btn-primary" data-uc-confirm="${escHtml(reqId)}" style="padding:6px 14px;font-size:13px">✅ 确认采纳</button>
        <button class="btn-small" data-uc-cancel="${escHtml(reqId)}" style="padding:6px 14px;font-size:13px">✕ 取消</button>
      </div>
      <span style="font-size:11px;color:var(--text3)">💡 默认只读预览，点"编辑描述"切换到文本编辑 · 旧版本保留在 description_history</span>
    </div>
  `;
  card.id = `uc-preview-layer-${reqId}`;

  // 滚动到可见
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** v0.13 B3: 解析 LLM 5 段式输出 → 结构化对象 (按多多样例格式)
 *  5 段: ① 一句话需求 ② 用户场景 ③ 关键功能点 ④ 体验/技术倾向 ⑤ 验收关注点
 *  header 用 ### 标记 (多多 LLM 实际输出格式)
 *  返回 null 时弹层降级到 textarea
 */
function parsePreviewDescription(text) {
  if (!text || typeof text !== 'string') return null;
  const sections = { summary: '', scenarios: '', functions: '', trends: '', validations: '', assumptions: '' };
  const sectionKeys = [
    { key: 'summary',      names: ['一句话需求', '需求摘要', '核心需求', '核心意图'] },
    { key: 'scenarios',    names: ['用户场景', '用户角色', '角色与场景'] },
    { key: 'functions',    names: ['关键功能点', '核心功能', '功能点', '功能清单'] },
    { key: 'trends',       names: ['体验/技术倾向', '体验倾向', '技术倾向', '设计原则'] },
    { key: 'validations',  names: ['验收关注点', '验收条件', '验收标准', 'AC'] },
    { key: 'assumptions',  names: ['待验证假设', '假设清单', '假设', '已确认假设'] },
  ];
  const sectionPatterns = sectionKeys.map(sk => ({
    key: sk.key,
    re: new RegExp(
      `^(?:#{1,6}\\s*)?(?:\\d+[.、)）]\\s*)?(?:${sk.names.join('|')})\\s*$`,
      'gm'
    )
  }));
  const headerPositions = [];
  sectionPatterns.forEach(p => {
    let m;
    while ((m = p.re.exec(text)) !== null) {
      headerPositions.push({ key: p.key, start: m.index, end: m.index + m[0].length });
    }
  });
  if (headerPositions.length < 4) return null;  // 5 段至少 4 个
  headerPositions.sort((a, b) => a.start - b.start);
  for (let i = 0; i < headerPositions.length; i++) {
    const cur = headerPositions[i];
    const next = headerPositions[i + 1];
    const content = text.substring(cur.end, next ? next.start : text.length).trim();
    if (!sections[cur.key]) sections[cur.key] = content;
  }
  if (!sections.summary || !sections.functions) return null;
  return sections;
}

// v0.13 B3: 渲染 5 段式 markdown 文档（连续流）
//  推翻 B2 的 5 卡片 + emoji: 改 h3 弱化 + <p> 段落 + <ul> bullet
//  全部不加粗（仅一句话需求段 LLM 可加粗，前端通过 renderMarkdownBold 通用解析）
//  v0.13 B4: bulletTitleBold=false for all sections
function renderPreviewCards(parsed) {
  const sectionTitles = {
    summary: '一句话需求',
    scenarios: '用户场景',
    functions: '关键功能点',
    trends: '体验/技术倾向',
    validations: '验收关注点',
    assumptions: '待验证假设',
  };
  // 每段的渲染配置: allowBullets / bulletTitleBold
  //   v0.13 B4: 所有段 bullet 冒号前加粗 (bulletTitleBold=true)
  const sectionConfig = {
    summary:     { allowBullets: false, bulletTitleBold: false },  // 单段陈述（LLM 自己的 **xxx** 通过 renderMarkdownBold 渲染）
    scenarios:   { allowBullets: true,  bulletTitleBold: true  },  // bullet 冒号前加粗
    functions:   { allowBullets: true,  bulletTitleBold: true  },  // bullet 冒号前加粗
    trends:      { allowBullets: true,  bulletTitleBold: true  },  // bullet 冒号前加粗
    validations: { allowBullets: true,  bulletTitleBold: true  },  // bullet 冒号前加粗
    assumptions: { allowBullets: true,  bulletTitleBold: true  },  // bullet 冒号前加粗
  };
  const order = ['summary', 'scenarios', 'functions', 'trends', 'validations', 'assumptions'];
  const h3Style = 'font-size:15px;font-weight:600;color:var(--accent);margin:18px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--border)';
  const h3FirstStyle = 'font-size:15px;font-weight:600;color:var(--accent);margin:0 0 8px;padding-bottom:4px;border-bottom:1px solid var(--border)';

  const html = order.map((key, idx) => {
    const content = parsed[key];
    if (!content) return '';
    const title = sectionTitles[key];
    const cfg = sectionConfig[key];
    const h3 = `<h3 style="${idx === 0 ? h3FirstStyle : h3Style}">${title}</h3>`;
    return h3 + renderMarkdownContent(content, cfg.allowBullets, cfg.bulletTitleBold);
  }).join('');

  return `<div class="uc-doc" style="font-size:13px;line-height:1.7;color:var(--text)">${html}</div>`;
}

/** v0.13 B3: 渲染 markdown 段落/列表混合内容
 *  v0.13 B3 fix (5th): 加 bulletTitleBold 参数 — 关键功能点 bullet 标题加粗
 *  解析 "**xxx**：描述" 格式 → <li><strong>xxx</strong>：描述</li>
 */
function renderMarkdownContent(text, allowBullets, bulletTitleBold) {
  if (!text) return '';
  // 按空行切分段落
  const paragraphs = text.split(/\n\s*\n/);
  return paragraphs.map(para => {
    const lines = para.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return '';
    // 全部是 bullet?
    const allBullets = lines.every(l => l.startsWith('- ') || l.startsWith('* '));
    if (allBullets && allowBullets) {
      const items = lines.map(l => {
        const content = l.replace(/^[-*]\s+/, '');
        // 关键功能点 bullet 标题加粗: "- **xxx**：描述"
        if (bulletTitleBold) {
          const m = content.match(/^\*\*([^*]+)\*\*\s*[:：]\s*(.*)/);
          if (m) {
            const [, title, rest] = m;
            return `<li><strong style="color:var(--accent)">${escHtml(title)}</strong>：${renderMarkdownBold(rest)}</li>`;
          }
        }
        return `<li>${renderMarkdownBold(content)}</li>`;
      }).join('');
      return `<ul style="margin:8px 0;padding-left:24px">${items}</ul>`;
    }
    // 段落: 用 <p> 渲染
    const html = lines.map(l => renderMarkdownBold(l)).join('<br>');
    return `<p style="margin:8px 0">${html}</p>`;
  }).join('');
}

/** v0.13 B2: 切换到编辑模式 (textarea) */
function switchToEditMode(reqId) {
  const card = document.getElementById(`uc-preview-layer-${reqId}`);
  if (!card) return;
  const initialText = card.dataset.ucPreviewDescription || '';
  const textEsc = escHtml(initialText);
  // 替换卡片中间内容为 textarea，保留 banner + 改底部按钮
  card.innerHTML = `
    <div class="uc-banner" style="background:rgba(78,205,196,0.1);border:1px solid var(--accent);border-radius:6px 6px 0 0;padding:8px 14px;margin:-16px -16px 12px;font-size:12px;color:var(--accent);display:flex;align-items:center;gap:8px">
      <span>✏️</span>
      <span>编辑模式（5 段式纯文本）</span>
      <span style="margin-left:auto;color:var(--text2)">💡 直接编辑文本，确认后写入需求 description</span>
    </div>
    <textarea id="uc-preview-textarea-${reqId}" style="width:100%;min-height:380px;padding:14px;background:var(--bg);color:var(--text);border:1px solid var(--accent);border-radius:6px;font-family:ui-monospace,'Cascadia Code','Consolas',monospace;font-size:12.5px;line-height:1.6;resize:vertical;box-sizing:border-box">${textEsc}</textarea>
    <div class="uc-actions" style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between">
      <div style="display:flex;gap:8px">
        <button class="btn-primary" data-uc-confirm="${escHtml(reqId)}" style="padding:6px 14px;font-size:13px">✅ 确认采纳</button>
        <button class="btn-small" data-uc-cancel="${escHtml(reqId)}" style="padding:6px 14px;font-size:13px">✕ 取消</button>
      </div>
      <span style="font-size:11px;color:var(--text3)">💡 旧版本保留在 description_history</span>
    </div>
  `;
  const ta = document.getElementById(`uc-preview-textarea-${reqId}`);
  if (ta) {
    ta.focus();
    ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/** v0.13 B2: 确认写入库（兼容编辑模式：textarea 没值时降级到 dataset 里的原 description） */
async function ucConfirm(reqId) {
  const ta = document.getElementById(`uc-preview-textarea-${reqId}`);
  const card = document.getElementById(`uc-preview-layer-${reqId}`);
  // 编辑模式: textarea 有值; 只读模式: 走 card.dataset.ucPreviewDescription
  const editedDescription = ta ? ta.value : (card?.dataset.ucPreviewDescription || '');
  if (!editedDescription || editedDescription.trim().length < 50) {
    if (typeof toast === 'function') toast('description 太短（最少 50 字）', 'warning');
    return;
  }
  if (typeof toast === 'function') toast('正在保存…', 'info', 1500);
  try {
    const API_KEY = 'dev-key-001';
    const structuredData = window._lastUseCaseStructuredData?.[reqId] || null;
    const r = await fetch(`/api/requirements/${reqId}/assist/use_case/apply/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify({
        description: editedDescription,
        structuredData,
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      if (typeof toast === 'function') toast('保存失败: ' + (data.error || r.statusText) + (data.currentLength ? ` (当前 ${data.currentLength} 字, 最少 ${data.minLength})` : ''), 'error');
      return;
    }
    if (typeof toast === 'function') toast(`✅ 已整理 · 采纳 ${data.applied} 条 · 丢弃 ${data.discarded} 条`, 'success', 4000);
    // 恢复原卡片 + stamp
    restoreUcCard(reqId, data);
    if (typeof openRequirement === 'function') openRequirement(reqId);
  } catch (e) {
    if (typeof toast === 'function') toast('保存失败: ' + e.message, 'error');
  }
}

/** v0.13 B1: 取消 preview — 恢复原 use_case 卡片 */
function ucCancel(reqId) {
  const card = document.getElementById(`uc-preview-layer-${reqId}`);
  if (!card) return;
  const original = card.dataset.ucPreviewOriginal;
  if (original) {
    card.innerHTML = original;
    card.classList.remove('edit-mode');
    delete card.dataset.ucPreviewOriginal;
    delete card.id;
  }
}

/** v0.13 B1: 恢复原 use_case 卡片 + 标记为已应用 */
function restoreUcCard(reqId, data) {
  const card = document.getElementById(`uc-preview-layer-${reqId}`);
  if (!card) return;
  const original = card.dataset.ucPreviewOriginal;
  if (original) {
    card.innerHTML = original;
    card.classList.remove('edit-mode');
    card.style.opacity = '0.5';
    card.style.pointerEvents = 'none';
    const stamp = document.createElement('div');
    stamp.style.cssText = 'margin-top:8px;padding:6px 10px;background:rgba(107,255,107,0.1);border:1px solid rgba(107,255,107,0.3);border-radius:4px;color:var(--green);font-size:12px;text-align:center';
    stamp.textContent = `✅ 已采纳 ${data.applied} 条 · 1 条假设已确认 · description 已更新（保留旧版在 history）`;
    card.appendChild(stamp);
    delete card.dataset.ucPreviewOriginal;
    delete card.id;
  }
}

/** 重整：重新触发 use_case 整理 */
async function ucRegen(reqId) {
  if (typeof chatAssist === 'function') {
    if (typeof toast === 'function') toast('🔄 重新整理中…', 'info', 2000);
    await chatAssist(reqId, 'use_case');
  }
}

/** 全部丢弃：关掉卡片 */
function ucDiscardAll(reqId) {
  const card = document.querySelector(`.use-case-brief`);
  if (!card) return;
  card.remove();
  if (typeof toast === 'function') toast('已丢弃整理结果', 'info', 2000);
}

// ── 事件代理（在 chat 流里渲染后挂一次性监听） ──
document.addEventListener('click', (e) => {
  const t = e.target;
  if (!t || !t.dataset) return;

  // 编辑
  if (t.dataset.ucEdit) {
    ucEditCase(t.dataset.ucEdit);
    return;
  }
  // 丢弃单条
  if (t.dataset.ucDiscard) {
    const itemId = t.dataset.ucDiscard;
    const el = document.querySelector(`[data-uc-case="${itemId}"]`);
    if (el) {
      el.style.opacity = '0.4';
      el.style.pointerEvents = 'none';
      const check = el.querySelector(`[data-uc-check^="${itemId}|"]`);
      if (check) check.checked = false;
      const banner = document.createElement('div');
      banner.style.cssText = 'font-size:10px;color:var(--accent2);text-align:center;padding:2px';
      banner.textContent = '✕ 已丢弃';
      el.appendChild(banner);
    }
    return;
  }
  // apply / regen / discard-all
  if (t.dataset.ucApply) {
    ucApply(t.dataset.ucApply);
    return;
  }
  if (t.dataset.ucRegen) {
    ucRegen(t.dataset.ucRegen);
    return;
  }
  if (t.dataset.ucDiscardAll) {
    ucDiscardAll(t.dataset.ucDiscardAll);
    return;
  }
  // v0.13 B2: preview 弹层的确认/取消按钮
  if (t.dataset.ucConfirm) {
    ucConfirm(t.dataset.ucConfirm);
    return;
  }
  if (t.dataset.ucCancel) {
    ucCancel(t.dataset.ucCancel);
    return;
  }
  if (t.dataset.ucEditDesc) {
    switchToEditMode(t.dataset.ucEditDesc);
    return;
  }
}, true);

// ── 捕获 chat 流渲染 use_case 卡片时，缓存 structuredData 供 apply 用 ──
//   通过劫持 ACMSAssists.render 实现
(function hookRender() {
  if (!window.ACMSAssists || !window.ACMSAssists.get) return;
  const origGet = window.ACMSAssists.get.bind(window.ACMSAssists);
  window.ACMSAssists.get = function (method) {
    const svc = origGet(method);
    if (method !== 'use_case' || !svc) return svc;
    const origRender = svc.render;
    if (origRender.__hooked) return svc;
    svc.render = function (reqId, data) {
      // 缓存 structuredData
      if (!window._lastUseCaseStructuredData) window._lastUseCaseStructuredData = {};
      window._lastUseCaseStructuredData[reqId] = {
        assumptions: data.assumptions || [],
        businessCases: data.businessCases || [],
        userCases: data.userCases || {},
        systemCases: data.systemCases || [],
        summary: data.summary || '',
      };
      return origRender(reqId, data);
    };
    svc.render.__hooked = true;
    return svc;
  };
})();