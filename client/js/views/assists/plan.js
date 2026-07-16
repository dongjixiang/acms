// ACMS plan renderer (v0.48, 2026-07-16)
// chat 流内的 plan 进度卡（极简 UI）
//
// 数据源：服务端 system entry (plan_loading / plan_step_update / plan_done / plan_validation_error)
//   每条 entry 含完整 plan 快照: { plan_id, summary, total_steps, steps:[{id,tool,status,error}] }
//
// 设计原则（多多偏好：弱化 UI 冲击）：
//   - 默认渲染极简 ⏳ 卡 + "AI 正在帮你处理 N 步骤" + ▼ 折叠
//   - ▼ 展开看步骤列表（每步 icon + 工具名 + 状态）
//   - 用户不主动点 ▼ 看不到细节（跟现有 chat-thinking 折叠模式一致）
//   - 失败步骤在 ▼ 内显示错误信息（不强提示）
//
// 调用方：chat.js renderPlanBubblesFromHistory（聚合 + 渲染）
//   不通过 ACMSAssists.register，因为 plan-bubble 需要聚合（每个 plan_id 只渲染一次最新 entry）

(function () {
  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  const STATUS_ICON = {
    pending: '⏸',
    running: '⏳',
    done: '✅',
    failed: '❌',
    skipped: '⏭',
  };

  const OVERALL_TEXT = {
    loading: 'AI 正在帮你处理',
    running: 'AI 正在帮你处理',
    done: 'AI 已完成',
    partial_failed: '部分步骤失败',
    validation_error: '计划无效',
  };

  const OVERALL_ICON = {
    loading: '⏳',
    running: '⏳',
    done: '✅',
    partial_failed: '⚠️',
    validation_error: '❌',
  };

  function countStepStatus(steps) {
    const c = { pending: 0, running: 0, done: 0, failed: 0, skipped: 0 };
    for (const s of steps) c[s.status] = (c[s.status] || 0) + 1;
    return c;
  }

  function computeOverallStatus(data, counts) {
    // validation_error: data.type 标记
    if (data.type === 'plan_validation_error') return 'validation_error';
    // final status: plan_done entry 写了 status
    if (data.status === 'done' || data.status === 'partial_failed') return data.status;
    // 还有 pending/running: 算 running
    if (counts.running > 0) return 'running';
    if (counts.pending > 0 && counts.done === 0 && counts.failed === 0 && counts.skipped === 0) return 'loading';
    return 'running';
  }

  function renderStepRow(s) {
    const icon = STATUS_ICON[s.status] || '⏸';
    const errorHtml = s.error ? `<div class="plan-step-error">${escHtml(s.error)}</div>` : '';
    const stepNum = s.id.replace(/^s/, '');
    return `
      <div class="plan-step" data-step-id="${escHtml(s.id)}">
        <span class="plan-step-icon">${icon}</span>
        <span class="plan-step-num">${escHtml(stepNum)}</span>
        <span class="plan-step-tool">${escHtml(s.tool)}</span>
        <span class="plan-step-status">${escHtml(s.status)}</span>
        ${errorHtml}
      </div>
    `;
  }

  /**
   * 渲染 plan-bubble 内部 HTML（不含 chat-bubble 包装）
   * @param {object} data - plan entry 数据（从 JSON.parse(text) 拿）
   * @returns {string} HTML 字符串
   */
  function renderPlanInner(data) {
    if (!data || !data.plan_id) return '';
    const steps = Array.isArray(data.steps) ? data.steps : [];
    const totalSteps = data.total_steps || steps.length;
    const counts = countStepStatus(steps);
    const overall = computeOverallStatus(data, counts);
    const statusText = OVERALL_TEXT[overall] || '执行计划';
    const statusIcon = OVERALL_ICON[overall] || '⏳';
    const stepsHtml = steps.map(renderStepRow).join('');
    const errorMsg = data.error ? `<div class="plan-error">${escHtml(data.error)}</div>` : '';

    return `
      <div class="plan-bubble-inner" data-plan-id="${escHtml(data.plan_id)}">
        <div class="plan-head" onclick="togglePlanDetail(this)">
          <span class="plan-status-icon">${statusIcon}</span>
          <span class="plan-status-text">${escHtml(statusText)}</span>
          <span class="plan-step-count">${totalSteps} 步骤</span>
          <span class="plan-toggle">▼</span>
        </div>
        <div class="plan-detail" style="display:none">
          ${stepsHtml || '<div class="plan-step-empty">（无步骤）</div>'}
          ${errorMsg}
        </div>
      </div>
    `;
  }

  /**
   * 聚合 + 渲染 plan bubbles
   * @param {HTMLElement} container - chat-stream-msgs container
   * @param {string} reqId
   * @param {Array} history - 所有 supplement_history entries
   */
  function aggregateAndRender(container, reqId, history) {
    if (!container || !Array.isArray(history)) return;
    // 先清掉旧的 plan-bubble（重渲染时不要留多个）
    container.querySelectorAll('.plan-bubble-inner').forEach((el) => {
      // 找到最近的 chat-bubble 父节点移除
      const bubble = el.closest('.chat-bubble');
      if (bubble) bubble.remove();
    });
    // 聚合：按 plan_id 找最新 entry
    const latestById = {};
    for (const e of history) {
      if (!e || !e.source || !e.source.startsWith('plan_')) continue;
      let data;
      try { data = JSON.parse(e.text); } catch { continue; }
      if (!data || !data.plan_id) continue;
      if (!latestById[data.plan_id] || new Date(e.at) > new Date(latestById[data.plan_id].at)) {
        latestById[data.plan_id] = { entry: e, data };
      }
    }
    // 渲染每个 plan_id 一张气泡
    for (const p of Object.values(latestById)) {
      const html = renderPlanInner(p.data);
      if (!html) continue;
      const div = document.createElement('div');
      div.className = 'chat-bubble chat-bubble-system';
      div.dataset.planId = p.data.plan_id;
      div.innerHTML = html;
      container.appendChild(div);
    }
  }

  // ▼ 折叠 toggle（暴露给 onclick）
  window.togglePlanDetail = function (headEl) {
    const detail = headEl.nextElementSibling;
    if (!detail) return;
    const isHidden = detail.style.display === 'none';
    detail.style.display = isHidden ? 'block' : 'none';
    const toggle = headEl.querySelector('.plan-toggle');
    if (toggle) toggle.textContent = isHidden ? '▲' : '▼';
  };

  // 暴露给 chat.js 调用
  window.ACMSPlanRenderer = { renderPlanInner, aggregateAndRender };
})();