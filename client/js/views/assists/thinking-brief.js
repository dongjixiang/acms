// 思路区对话流渲染（v0.3.3 Phase 2）
// 从 requirements.js 拆出，独立管 brief 的轮询 + 渲染
// 思路区只显示对话气泡（opening/ai_understanding/followup_question）+ 轮次标记
// 决策树/其他辅助手段 → 由其他 assist 模块按 type 分发渲染
(function () {
  let _briefPollers = {}; // reqId → interval
  const _briefCache = {}; // reqId → brief（供其他 assist 模块读取）

  async function load(reqId) {
    if (_briefPollers[reqId]) {
      clearInterval(_briefPollers[reqId]);
      delete _briefPollers[reqId];
    }
    // v0.4 Phase 3.8：消除⏳等待感 —— fetch 前先显示用户原始描述气泡
    //   这样用户打开面板立即有内容看，不用等 LLM 返回
    try {
      const reqResp = await api('GET', `/requirements/${reqId}`);
      const userBubble = reqResp?.requirement?.description
        ? `<div class="brief-user-bubble"><span class="brief-user-bubble-label">📝 你最初的需求：</span>${escHtml(reqResp.requirement.description)}</div>`
        : '';
      const container = document.getElementById(`thinking-brief-content-${reqId}`);
      if (container && userBubble) {
        // 只在容器还没有"done"内容时才覆盖（避免覆盖已有的 brief）
        if (!container.querySelector('.brief-opening') && !container.querySelector('.insight-error')) {
          container.innerHTML = userBubble + '<div class="insight-loading">⏳ AI 正在解读你的想法…</div>';
        }
      }
    } catch (e) { /* 静默：req 读不到不影响 brief load */ }
    try {
      const resp = await api('GET', `/requirements/${reqId}/thinking-brief`);
      const brief = resp.thinkingBrief;
      _briefCache[reqId] = brief;
      render(reqId, brief);
      if (brief && (brief.status === 'generating' || brief.status === 'pending')) {
        _briefPollers[reqId] = setInterval(() => poll(reqId), 2500);
      }
    } catch (e) {
      console.warn('[brief] 加载失败:', e.message);
    }
  }

  async function poll(reqId) {
    try {
      const resp = await api('GET', `/requirements/${reqId}/thinking-brief`);
      const brief = resp.thinkingBrief;
      _briefCache[reqId] = brief;
      render(reqId, brief);
      if (!brief || (brief.status !== 'generating' && brief.status !== 'pending')) {
        clearInterval(_briefPollers[reqId]);
        delete _briefPollers[reqId];
      }
    } catch (e) {
      console.warn('[brief] 轮询失败:', e.message);
    }
  }

  function render(reqId, brief) {
    const container = document.getElementById(`thinking-brief-content-${reqId}`);
    if (!container) return;

    if (!brief) {
      container.innerHTML = '<div class="insight-loading">⏳ 思路简报待生成…</div>';
      return;
    }
    if (brief.status === 'pending' || brief.status === 'generating') {
      container.innerHTML = `<div class="insight-loading">${brief.chat_round && brief.chat_round > 1 ? '🤔 AI 在整理你的新回答…' : '🤔 AI 正在理解你的想法…'}</div>`;
      return;
    }
    if (brief.status === 'failed') {
      container.innerHTML = `<div class="insight-error">❌ 思路生成失败：${escHtml(brief.error || '未知错误')}</div>`;
      return;
    }

    // done: v0.3.3 对话式思路区
    // 只渲染对话气泡（不渲染决策树 / 追问清单 / 类比参考）
    // 那些是「辅助手段」→ 由 assist-dispatcher 在另一个区域按 type 渲染
    // v0.4 Phase 1.2：诊断标签（不可点，按 B 方案推迟到 Phase 2.6）
    const opening = brief.opening || '';
    const understanding = brief.ai_understanding || '';
    const followup = brief.followup_question || '';
    const diagnosis = brief.diagnosis || null;
    const round = brief.chat_round || 1;

    const openingBlock = (understanding || opening) ? `
      <div class="brief-opening">
        ${round > 1 ? `<div class="brief-round-tag">第 ${round} 轮对话</div>` : ''}
        ${understanding ? `<div class="brief-understanding"><strong>我的理解：</strong>${renderMarkdown(understanding)}</div>` : ''}
        ${opening ? `<div class="brief-opening-text">${renderMarkdown(opening)}</div>` : ''}
      </div>
    ` : '';

    const followupBlock = followup ? `
      <div class="brief-followup">
        <span class="brief-followup-label">💬 当前最想知道的：</span>
        <span class="brief-followup-text">${renderMarkdown(followup)}</span>
      </div>
    ` : '';

    // v0.4 Phase 1.2 + Phase 2.6：诊断标签（Phase 2c 改为可纠偏）
    const DIAGNOSIS_EMOJI = { vague: '🤔', conflicted: '🎯', blank: '👂' };
    const DIAGNOSIS_PREFIX = { vague: '已有一个大致方向', conflicted: '有几个想法在犹豫', blank: '完全开放' };
    const DIAGNOSIS_LABELS = { vague: 'vague（具体化）', conflicted: 'conflicted（多想法）', blank: 'blank（开放）' };
    // v0.4 Phase 3.9：位置指示（直接读 diagnosis.type —— 单一数据源）
    //   不存到独立字段，避免 type 变两处要同步
    //   vague → 🤔 想想其他角度 / conflicted → 🎯 敲定细节 / blank → 👂 我在听
    const POSITION_HINT = {
      vague: { emoji: '🤔', text: '想想其他角度', color: 'blue' },
      conflicted: { emoji: '🎯', text: '敲定细节', color: 'accent' },
      blank: { emoji: '👂', text: '我在听', color: 'green' },
    };
    const positionHint = (diagnosis && diagnosis.type) ? POSITION_HINT[diagnosis.type] : null;
    const positionBlock = positionHint ? `
      <div class="brief-position-hint" data-position-color="${positionHint.color}">
        <span class="brief-position-emoji">${positionHint.emoji}</span>
        <span class="brief-position-text">${positionHint.text}</span>
      </div>
    ` : '';
    const diagnosisBlock = (diagnosis && diagnosis.type) ? `
      <div class="brief-diagnosis" data-diagnosis-type="${escHtml(diagnosis.type)}" data-req-id="${escHtml(reqId)}" title="v0.4 Phase 2c：点击纠偏（影响下一轮路由）">
        <span class="brief-diagnosis-icon">${DIAGNOSIS_EMOJI[diagnosis.type] || '🔍'}</span>
        <span class="brief-diagnosis-label">AI 将你归为「${escHtml(diagnosis.label || DIAGNOSIS_PREFIX[diagnosis.type] || '')}」类</span>
        ${diagnosis.guide ? `<span class="brief-diagnosis-guide"> → ${escHtml(diagnosis.guide)}</span>` : ''}
        <select class="brief-diagnosis-correction" data-current-type="${escHtml(diagnosis.type)}" onchange="correctDiagnosis('${escHtml(reqId)}', this.value)" title="纠偏：改成你觉得更准的类型">
          <option value="">纠偏改类型</option>
          <option value="vague">🤔 vague（方向清楚想具体化）</option>
          <option value="conflicted">🎯 conflicted（有几个想法）</option>
          <option value="blank">👂 blank（完全开放）</option>
        </select>
      </div>
    ` : '';

    // v0.4 Phase 2b：诊断对话引导问题（v0.4.3 阶段：只展示，不做完整对话循环）
    //   - chosen_method 是从 toolbox 里选的方法（如『极端对比』）
    //   - guide_question 是递给用户的引导问题
    //   - expected_schema 给前端回答框 placeholder 用
    const dialog = brief.dialog || null;
    const dialogBlock = (dialog && dialog.guide_question) ? `
      <div class="brief-dialog" data-dialog-method="${escHtml(dialog.chosen_method || '')}" title="v0.4 Phase 2b：诊断对话引导问题（暂不支持完整对话循环，留待后续）">
        <span class="brief-dialog-icon">💭</span>
        <span class="brief-dialog-method">[${escHtml(dialog.chosen_method || '引导')}]</span>
        <span class="brief-dialog-text">${escHtml(dialog.guide_question)}</span>
        ${dialog.expected_schema ? `<div class="brief-dialog-schema">💡 ${escHtml(dialog.expected_schema)}</div>` : ''}
      </div>
    ` : '';

    // v0.4 Phase 4.1：固化摘要（idea → clarifying 时由 elicit-solidify 异步写入）
    const summary = brief.summary || null;
    const summaryBlock = (summary && summary.summary) ? `
      <div class="brief-summary" title="v0.4 Phase 4.1：进入澄清前的固化摘要">
        <div class="brief-summary-header">📋 我们讨论了什么</div>
        <div class="brief-summary-text">${escHtml(summary.summary)}</div>
        ${summary.boundaries && summary.boundaries.length > 0 ? `
          <div class="brief-summary-boundaries">
            <div class="brief-summary-section-title">确定的事</div>
            <ul>${summary.boundaries.slice(0, 5).map(b => `<li><strong>${escHtml(b.dimension || '?')}</strong>: ${escHtml(b.value || '')} ${b.confidence ? `<span class="brief-summary-conf">（${escHtml(b.confidence)}）</span>` : ''}</li>`).join('')}</ul>
          </div>
        ` : ''}
        ${summary.tradeoff_points && summary.tradeoff_points.length > 0 ? `
          <div class="brief-summary-tradeoffs">
            <div class="brief-summary-section-title">还在犹豫</div>
            <ul>${summary.tradeoff_points.slice(0, 3).map(t => `<li>${escHtml(t.dimension || '?')}: ${escHtml(t.user_stance || '')}</li>`).join('')}</ul>
          </div>
        ` : ''}
      </div>
    ` : '';

    container.innerHTML = `
      <div class="brief-block">
        ${positionBlock}
        ${openingBlock}
        ${followupBlock}
        ${diagnosisBlock}
        ${dialogBlock}
        ${summaryBlock}
        <div id="assist-area-${reqId}" class="assist-area"></div>
      </div>
    `;
  }

  // 暴露给全局
  window.ACMSThinkingBrief = {
    load, render, poll,
    getBrief: (reqId) => _briefCache[reqId] || null,
    setBrief: (reqId, brief) => { _briefCache[reqId] = brief; },
  };

  // v0.4 Phase 2c：诊断纠偏全局函数（被 inline onchange 调用）
  //   行为：
  //     1. POST /requirements/:id/correct-diagnosis { type }
  //     2. 成功后：toast 提示，重新调 load() 刷新 brief（让 diagnosis 标签更新 + dialog 重新生成）
  //     3. 失败：toast 错误，select 恢复原值
  //   设计取舍：
  //     - 纠偏后立刻重新触发 brief（让 dialog 基于新 type 重新生成）—— 而不是等用户触发
  //     - 但只改 type，不动其他字段（label/guide 保留原值直到 brief 重生）
  window.correctDiagnosis = async function (reqId, newType) {
    const VALID = ['vague', 'conflicted', 'blank'];
    if (!VALID.includes(newType)) return;
    try {
      const resp = await api('POST', `/requirements/${reqId}/correct-diagnosis`, { type: newType });
      if (resp && resp.ok) {
        if (typeof toast === 'function') toast(`诊断已纠偏为 ${newType}，正在重新生成…`, 'success');
        // 重新加载 brief（让 diagnosis 标签更新 + dialog 重新生成）
        setTimeout(() => window.ACMSThinkingBrief.load(reqId), 500);
      } else {
        if (typeof toast === 'function') toast(`纠偏失败：${resp?.error || '未知'}`, 'error');
      }
    } catch (e) {
      if (typeof toast === 'function') toast(`纠偏失败：${e.message}`, 'error');
      console.warn('[correctDiagnosis] error:', e.message);
    }
  };
})();
