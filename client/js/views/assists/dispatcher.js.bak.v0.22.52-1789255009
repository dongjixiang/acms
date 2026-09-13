// 辅助手段 dispatcher（v0.3.3 Phase 2）
// 从 /assist GET 拉数据，按 type 分发到对应组件渲染
// 也管理 trigger button（点击调 /assist/run 路由器）
(function () {
  let _assistPollers = {}; // reqId → interval
  let _pollStartedAt = {}; // reqId → timestamp（用于"强制轮询至少 N 秒"）
  // 缓存最近的 assist 数据，让 submitIdeaSupplement 能读"用户是否表态过"
  if (!window._lastAssistCache) window._lastAssistCache = {};

  const MIN_POLL_MS = 30000; // 至少轮询 30 秒（覆盖 brief + 路由器 + assist 生成时间）

  // v0.4 Phase 3.10：assist 卡片来源说明（硬编码映射表 —— 单一数据源 = diagnosis.type + method）
  //   用户改了 diagnosis.type → 下一轮重生的卡片说明也跟着变
  //   规则：vague 偏 tradeoff/decision_tree，conflicted 偏 scenarios/decision_tree，blank 不出卡片
  const SOURCE_EXPLANATIONS = {
    vague: {
      tradeoff: '你说的方向大致清楚，我们先把关键取舍摆出来 —— 选你最在意的',
      decision_tree: '你说的方向有了，我们分几条具体实现路径让你挑',
      scenarios: '我们先看看几个典型用户场景，帮定位你的真实目标',
      diagnosis: '体检一下你描述里没说清楚的地方',
      arch: '把核心页面/模块列出来，你圈出想要的',
      visual: '3 张方向图，看哪个最像你想要的',
    },
    conflicted: {
      tradeoff: '你提到的几个想法有矛盾，我们先做取舍 —— 选你最在意的',
      decision_tree: '我们分几条互斥方向让你挑一个',
      scenarios: '挑一个最像你的用户场景，我们就能往下走',
      diagnosis: '体检一下你描述里没说清楚的地方',
      arch: '把核心页面/模块列出来，你圈出想要的',
      visual: '3 张方向图，看哪个最像你想要的',
    },
    blank: {
      // blank 类型理论上不推卡片（Phase 2a 短路），但保留兜底
      tradeoff: '我们来做一些取舍练习，帮你找到在意的事',
      decision_tree: '几条可能的方向，你挑一个',
      scenarios: '挑一个最像你的用户场景',
      diagnosis: '体检一下你描述里没说清楚的地方',
      arch: '把核心页面/模块列出来',
      visual: '3 张方向图',
    },
    null: {
      // diagnosis 没产出 → 默认说明
      tradeoff: '把这个需求里关键的取舍摆出来，你表态',
      decision_tree: '给你 3 条不同的实现方向，你挑一条',
      scenarios: '挑一个最像你的用户场景，我们就能往下走',
      diagnosis: '先体检一下你描述里没说清楚的地方',
      arch: '把核心页面/模块列出来，你圈出想要的',
      visual: '3 张方向图，看哪个最像你想要的',
    },
  };

  function buildSourceExplanation(method, diagnosisType) {
    const group = SOURCE_EXPLANATIONS[diagnosisType || 'null'] || SOURCE_EXPLANATIONS.null;
    return group[method] || '';
  }

  async function loadAll(reqId) {
    if (_assistPollers[reqId]) {
      clearInterval(_assistPollers[reqId]);
      delete _assistPollers[reqId];
    }
    _pollStartedAt[reqId] = Date.now();
    await poll(reqId); // 立即拉一次
    _assistPollers[reqId] = setInterval(() => poll(reqId), 2500);
  }

async function poll(reqId) {
    try {
      const resp = await api('GET', `/requirements/${reqId}/assist`);
      render(reqId, resp.assists || {});
      window._lastAssistCache[reqId] = resp.assists || {};
      // 停轮询条件：超过最小轮询时长 + 全 idle
      //   不能在 rewrite-description 触发后立即停（brief 还在生成 → 路由器还没跑 → assist 还没起）
      //   brief + 路由器 + assist 一共要 20-40s，所以强制跑够 30s
      const all = resp.assists || {};
      const generating = Object.values(all).some(v => v && (v.status === 'generating' || v.status === 'pending'));
      // v0.22.22 fix: regenerate 触发的 explicit assist 完成 → 清掉标记（避免永远占着）
      //   跟 chat.js line 202/207 同样的清理模式，但 dispatcher.loadAll 触发的轮询需要自己清
      const explicit = window._explicitAssist?.[reqId];
      if (explicit && all[explicit] && all[explicit].status === 'done') {
        delete window._explicitAssist[reqId];
      }
      const elapsed = Date.now() - (_pollStartedAt[reqId] || 0);
      if (!generating && elapsed >= MIN_POLL_MS && _assistPollers[reqId]) {
        clearInterval(_assistPollers[reqId]);
        delete _assistPollers[reqId];
        delete _pollStartedAt[reqId];
      }
    } catch (e) {
      console.warn('[assist] 拉取失败:', e.message);
    }
  }

  function render(reqId, data) {
    const container = document.getElementById(`assist-area-${reqId}`);
    if (!container) return;
  // v0.3.3 B+++ 补丁（2026-06-13）：每轮只显示当前轮的辅助手段
  //   多多反馈"第一次辅助选择的界面一直都没有消失" → 上一轮点过 used 永远挂着干扰
  //   新规则（统一为：used 必须归属到当前轮才算"已表态"）：
  //     - 正在生成（status === 'generating' / 'pending'）→ 显示
  //     - 当前轮生成 且 当前轮已表态（used_branch_idx/picked/picks != null 且 generated_at_round === currentRound）→ 显示（让用户看到自己刚做的选择）
  //     - 当前轮生成 且 还没表态（generated_at_round === currentRound）→ 显示
  //     - 其他轮的（不管 used 没用过）→ 一律隐藏
    const brief = window.ACMSThinkingBrief?.getBrief?.(reqId);
    const currentRound = brief?.chat_round || 1;
    // v0.13 修复：动态从 ACMSAssists registry 读所有 method（避免硬编码漏注册）
    //   加新 method 不用再改 dispatcher.js — 只要 register('new_method', ...) 就自动接入
    const order = (window.ACMSAssists && window.ACMSAssists.list) ? window.ACMSAssists.list() : [];
    const html = order
      .filter(m => {
        const d = data[m];
        if (!d) return false;
        // 用户显式选了某个 assist → 只显示那个和正在生成中的
        const explicit = window._explicitAssist?.[reqId];
        if (explicit && explicit !== m && d.status !== 'generating' && d.status !== 'pending' && d.status !== 'pending_input') return false;
        // 正在生成（status 字段已写但 generated_at_round 可能还没写）→ 显示
        if (d.status === 'generating' || d.status === 'pending' || d.status === 'pending_input') return true;
        // 当前轮生成 → 整体显示（用户表态了也保留，没表态也保留）
        if (typeof d.generated_at_round === 'number' && d.generated_at_round === currentRound) return true;
        // v0.19：显式调用的 assist（如 music/video/image/clean）已完成 → 显示（可能没有 generated_at_round）
        if (d.status === 'done' && window._explicitAssist?.[reqId] === m) return true;
        // 其他轮 → 一律隐藏（v0.3.3 B+++：不再按 used===true 保留）
        return false;
      })
      .map(m => {
        const mod = window.ACMSAssists.get(m);
        if (!mod || !mod.render) return '';
        try {
          const rendered = mod.render(reqId, data[m]);
          // v0.19：跳过空渲染（避免显示空 assist-block 线条）
          if (!rendered || rendered.trim() === '' || rendered.trim() === '<div style="display:none"></div>') return '';
          // v0.4 Phase 3.10：assist 卡片来源说明（"为什么看到这个"）
          const SOURCE_EXPLAIN = buildSourceExplanation(m, diagnosisType);
          const sourceNote = SOURCE_EXPLAIN
            ? `<div class="assist-source-note">💡 ${escHtml(SOURCE_EXPLAIN)}</div>`
            : '';
          return `<div class="assist-block assist-${m}" data-assist-type="${m}">${sourceNote}${mod.render(reqId, data[m])}</div>`;
        } catch (e) {
          console.error(`[assist:${m}] 渲染失败:`, e.message);
          return `<div class="insight-error">❌ ${m} 渲染失败: ${escHtml(e.message)}</div>`;
        }
      })
      .join('');
    container.innerHTML = html || '';
    // 触发每个组件的 afterRender 钩子（和上面过滤规则保持完全一致）
    order
      .filter(m => {
        const d = data[m];
        if (!d) return false;
        if (d.status === 'generating' || d.status === 'pending' || d.status === 'pending_input') return true;
        if (typeof d.generated_at_round === 'number' && d.generated_at_round === currentRound) return true;
        return false;
      })
      .forEach(m => {
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

// v0.3.6：「都不符合，再换一批」按钮
  //   跟 triggerManual 的区别：调 /assist/:method/regenerate 路由（强制重跑 + 喂旧选择给 LLM）
  //   v0.22.22 fix: 跟 chatAssist 一样标记 _explicitAssist，否则 regenerate 完成后 dispatcher filter
  //   把新生成的剧本给隐藏掉（filter 第 115 行：`status==='done' && explicit===m` 才显示）
  async function regenerateBatch(reqId, method) {
    try {
      if (!window._explicitAssist) window._explicitAssist = {};
      window._explicitAssist[reqId] = method;
      const resp = await api('POST', `/requirements/${reqId}/assist/${method}/regenerate`, {});
      if (resp.error) {
        toast('换一批失败: ' + resp.error, 'error');
        return;
      }
      toast('🔄 正在换一批...', 'info', 1500);
      loadAll(reqId);
    } catch (e) {
      toast('换一批失败: ' + e.message, 'error');
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

  window.ACMSAssistDispatcher = { loadAll, poll, render, triggerAuto, triggerManual, regenerateBatch, useAssist };
})();
