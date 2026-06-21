// ===== Brief 控制 + AI 重整 + Assist 信号收集（v0.13 抽公共，2026-06-21）=====
// 抽自 client/js/views/requirements.js（原 L2205-2373，169 行）
//
// 跨文件依赖（重要！）：
//   - api / escHtml / toast / showConfirm（全局）
//   - openRequirement（主文件）
//   - window.ACMSThinkingBrief（client/js/views/assists/thinking-brief.js，全局）
//   - maybeLoadInsightPreviews（idea-panel.js，HTML onclick 延迟触发，script 顺序保证已加载）

/**
 * ✨ AI 重整描述（v0.3.5 新增）
 * 与 📤 发送相反：
 *   - 用户显式召唤 AI 重整
 *   - 调原 /rewrite-description 路由 → description 会被覆盖（旧版本进 history）
 *   - 整页 reload（因为 description 改了，需要刷新顶部）
 * @param {string} reqId
 */
async function aiRewriteDescription(reqId) {
  if (!await showConfirm('AI 会根据你的全部补充重新组织需求描述，旧版本会进历史记录，确认重整？', { type: 'info' })) return;
  toast('⏳ AI 正在重新组织…', 'info', 2000);
  try {
    // 把 supplement_history 整段喂给 LLM 重整（即使 textarea 空也走完整重整）
    const resp = await api('POST', `/requirements/${reqId}/rewrite-description`, {
      supplement: '',  // 空 supplement → 让后端走纯 history 重整
      supplementSource: 'idea_supplement',
      autoRegenBrief: true,
    });
    if (resp.error) {
      toast('重整失败: ' + resp.error, 'error');
      return;
    }
    toast('✅ 描述已重整，思路正在重生…', 'success', 2000);
    // 整页 reload（因为 description 改了，需要刷新顶部 + 历史按钮）
    setTimeout(() => openRequirement(reqId), 500);
  } catch (e) {
    toast('重整失败: ' + e.message, 'error');
  }
}

// 扫一遍 assist-area-{reqId}，汇总用户已做的表态（读 _briefCache 或用 ACMSThinkingBrief 的缓存）
// 返回简短描述用作 supplement；没有表态返回空字符串
function collectAssistSignals(reqId) {
  // 从客户端缓存的 brief 数据读 assist 状态
  // 注意：assist 状态在 dispatcher 里没暴露 cache，我们通过最近一次 GET /assist 的结果来读
  const cache = window._lastAssistCache?.[reqId] || {};
  const parts = [];

  // 决策树详情面板：勾选的设计特色（DOM 状态，confirmBranchFeatures 未被触发也能读）
  // 这一段必须放在最前 —— 即使决策树本身的 used=false，只要用户勾选了 checkbox 就视为已表态
  try {
    const checkedFeatureBoxes = Array.from(
      document.querySelectorAll(`#assist-area-${reqId} .branch-feature-check:checked`)
    );
    if (checkedFeatureBoxes.length > 0) {
      const titles = checkedFeatureBoxes.map(cb => cb.dataset.featureTitle).filter(Boolean);
      if (titles.length > 0) {
        // 拿分支信息（来自 decision_tree 的 brief 缓存或 cache）
        const brief = window.ACMSThinkingBrief?.getBrief?.(reqId);
        const detailPanel = checkedFeatureBoxes[0].closest('.branch-detail-panel');
        const branchIdx = detailPanel ? Number(detailPanel.id.match(/-(\d+)$/)?.[1]) : null;
        const tree = brief?.decision_tree || cache.decision_tree?.tree || [];
        const branch = (branchIdx !== null && !isNaN(branchIdx)) ? tree[branchIdx] : null;
        const branchLabel = branch?.label || '';
        const branchExamples = branch?.examples || branchLabel;
        const branchPart = branchLabel ? `「${branchLabel}（参考 ${branchExamples}）」方向` : '你勾选的方向';
        parts.push(`（${branchPart}的设计特色：${titles.join('、')}）`);
      }
    }
  } catch (e) { console.warn('[collectAssistSignals] 扫决策树设计特色失败:', e); }

  // 决策树：used_branch_idx 标识选了哪个分支
  if (cache.decision_tree?.used && typeof cache.decision_tree.used_branch_idx === 'number') {
    const brief = window.ACMSThinkingBrief?.getBrief?.(reqId);
    const tree = brief?.decision_tree || cache.decision_tree?.tree || [];
    const branch = tree[cache.decision_tree.used_branch_idx];
    if (branch) {
      parts.push(`（已选决策树方向「${branch.label || 'A'}」：${branch.desc || ''}）`);
    } else {
      parts.push(`（已选决策树方向 #${cache.decision_tree.used_branch_idx}）`);
    }
  }

  // 场景：picked 标识挑了哪个场景
  if (cache.scenarios?.picked !== null && cache.scenarios?.picked !== undefined && Array.isArray(cache.scenarios?.scenarios)) {
    const s = cache.scenarios.scenarios[cache.scenarios.picked];
    if (s) {
      parts.push(`（用户表示自己最像这个场景：${s.title || ''} - ${s.persona || ''} ${s.context || ''} ${s.pain || ''}）`);
    }
  }

  // 体检：used=true 表示看完了
  if (cache.diagnosis?.used && Array.isArray(cache.diagnosis?.issues)) {
    parts.push(`（用户已看完体检报告，关注 ${cache.diagnosis.issues.length} 处模糊点）`);
  }

  // 取舍：picks 字典表示在哪些维度表了态
  if (cache.tradeoff?.used && cache.tradeoff?.picks && Object.keys(cache.tradeoff.picks).length > 0) {
    const picks = cache.tradeoff.picks;
    const dims = cache.tradeoff.dimensions || [];
    const dimTexts = Object.keys(picks).map(i => {
      const d = dims[Number(i)];
      if (!d) return null;
      return `${d.axis || ('维度' + (Number(i) + 1))} → ${picks[i]}`;
    }).filter(Boolean);
    if (dimTexts.length > 0) {
      parts.push(`（用户对取舍维度的表态：${dimTexts.join('；')}）`);
    }
  }

  // 信息架构：picked 数组表示圈了哪些模块
  if (cache.arch?.used && Array.isArray(cache.arch?.picked) && cache.arch.picked.length > 0) {
    const mods = cache.arch.modules || [];
    const names = cache.arch.picked.map(i => mods[i]?.name).filter(Boolean);
    if (names.length > 0) {
      parts.push(`（用户圈出想要的模块：${names.join('、')}）`);
    }
  }

  return parts.join(' ');
}

async function regenerateThinkingBrief(reqId) {
  if (!await showConfirm('重新生成思路简报会消耗 token，确认？', { type: 'info' })) return;
  try {
    const resp = await api('POST', `/requirements/${reqId}/thinking-brief/regen`, {});
    if (resp.error) {
      toast('启动失败: ' + resp.error, 'error');
      return;
    }
    toast('🔄 思路简报重新生成中…', 'success');
    ACMSThinkingBrief.load(reqId);
  } catch (e) {
    toast('启动失败: ' + e.message, 'error');
  }
}

// v0.3.3 B+++ 补丁（2026-06-13）：「够了进澄清」真的切状态 + 重渲染
//   之前是死代码：toast + 滚动视觉区，需求 status 还是 idea → 永远看不到澄清面板
//   修法：调 POST /:id/transition 把 status 切到 clarifying，成功后 openRequirement 重渲染
//   状态机：idea → clarifying 合法且无 gate（state-machine.js:3）
async function skipThinkingBrief(reqId) {
  try {
    const resp = await api('POST', `/requirements/${reqId}/transition`, { targetStatus: 'clarifying' });
    if (resp.error) {
      toast('进入澄清失败: ' + resp.error, 'error');
      return;
    }
    toast('✅ 进入澄清阶段', 'success', 2000);
    // 重渲染详情页：idea 面板消失，renderAiClarifyPanel 出现
    openRequirement(reqId);
    // 滚到澄清面板顶部
    setTimeout(() => {
      const panel = document.getElementById('ai-clarify-panel');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  } catch (e) {
    toast('进入澄清失败: ' + e.message, 'error');
  }
}

// 「按需触发」视觉预览：点按钮才生成
async function triggerInsightPreviews(reqId) {
  try {
    const resp = await api('POST', `/requirements/${reqId}/insight-previews`, {});
    if (resp.error) {
      toast('启动失败: ' + resp.error, 'error');
      return;
    }
    toast('🎨 正在生成 3 张方向图…', 'success');
    // 展开视觉区让用户看到 loading
    const visualSection = document.querySelector(`#idea-panel-${reqId} .idea-section-visual`);
    if (visualSection && !visualSection.open) visualSection.open = true;
    // 启动轮询
    maybeLoadInsightPreviews(reqId);
  } catch (e) {
    toast('启动失败: ' + e.message, 'error');
  }
}
