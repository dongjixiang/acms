// 辅助手段 dispatcher（v0.3.3 Phase 2）
// 从 /assist GET 拉数据，按 type 分发到对应组件渲染
// 也管理 trigger button（点击调 /assist/run 路由器）
(function () {
  let _assistPollers = {}; // reqId → interval

  async function loadAll(reqId) {
    if (_assistPollers[reqId]) {
      clearInterval(_assistPollers[reqId]);
      delete _assistPollers[reqId];
    }
    await poll(reqId); // 立即拉一次
    _assistPollers[reqId] = setInterval(() => poll(reqId), 2500);
  }

  async function poll(reqId) {
    try {
      const resp = await api('GET', `/requirements/${reqId}/assist`);
      render(reqId, resp.assists || {});
      // 全 idle → 停轮询
      const all = resp.assists || {};
      const generating = Object.values(all).some(v => v && (v.status === 'generating' || v.status === 'pending'));
      if (!generating && _assistPollers[reqId]) {
        clearInterval(_assistPollers[reqId]);
        delete _assistPollers[reqId];
      }
    } catch (e) {
      console.warn('[assist] 拉取失败:', e.message);
    }
  }

  function render(reqId, data) {
    const container = document.getElementById(`assist-area-${reqId}`);
    if (!container) return;
    // 按 type 顺序渲染（已生成的 + 顺序固定）
    const order = ['diagnosis', 'scenarios', 'tradeoff', 'arch', 'decision_tree'];
    const html = order
      .filter(m => data[m])
      .map(m => {
        const mod = window.ACMSAssists.get(m);
        if (!mod || !mod.render) return '';
        try {
          return `<div class="assist-block assist-${m}" data-assist-type="${m}">${mod.render(reqId, data[m])}</div>`;
        } catch (e) {
          console.error(`[assist:${m}] 渲染失败:`, e);
          return `<div class="insight-error">❌ ${m} 渲染失败: ${escHtml(e.message)}</div>`;
        }
      })
      .join('');
    container.innerHTML = html || '';
    // 触发每个组件的 afterRender 钩子
    order.filter(m => data[m]).forEach(m => {
      const mod = window.ACMSAssists.get(m);
      if (mod && mod.afterRender) {
        try { mod.afterRender(reqId, data[m]); } catch (e) { console.warn(`[assist:${m}] afterRender:`, e); }
      }
    });
  }

  async function triggerAuto(reqId) {
    toast('🤖 AI 正在选辅助手段…', 'info', 1500);
    try {
      const resp = await api('POST', `/requirements/${reqId}/assist/run`, {});
      if (resp.method) {
        toast(`✨ ${resp.reason || 'AI 选了 ' + resp.method}`, 'success', 2500);
        loadAll(reqId); // 立即轮询
      } else {
        toast(resp.reason || '暂无可推荐', 'info', 2000);
      }
    } catch (e) {
      toast('触发失败: ' + e.message, 'error');
    }
  }

  async function triggerManual(reqId, method) {
    try {
      await api('POST', `/requirements/${reqId}/assist/${method}`, {});
      toast(`✨ 已启动 ${method}`, 'success', 1500);
      loadAll(reqId);
    } catch (e) {
      toast('触发失败: ' + e.message, 'error');
    }
  }

  async function useAssist(reqId, method, payload) {
    try {
      await api('POST', `/requirements/${reqId}/assist/${method}/use`, payload || {});
      poll(reqId);
    } catch (e) {
      toast('标记失败: ' + e.message, 'error');
    }
  }

  window.ACMSAssistDispatcher = { loadAll, poll, render, triggerAuto, triggerManual, useAssist };
})();
