// 视觉预览辅助手段（v0.3.3 B+++ 路由器接入）
// 与其他 5 种 assist 同等级 — 由路由器根据 focus 选择
// 复用 insight-previews 的实现：3 张方向图（LLM 生成 3 变体 prompt + 图片生成器跑 3 张）
// 字段：requirement.insight_previews（沿用原 insight-previews 端点）
const insightPreviews = require('../insight-previews');
const reqStore = require('../../stores/requirement-store');

async function runAssistJob(reqId, opts = {}) {
  const req = reqStore.getById(reqId);
  if (!req) throw new Error('REQ_NOT_FOUND');

  // 如果已经生成过且 status==='done'，不再重跑（节省 token）
  // 用户可通过"重新生成"按钮强制重跑（前端调 triggerInsightPreviews）
  let existing = null;
  try { existing = JSON.parse(req.insight_previews || '{}'); } catch {}
  if (existing && existing.status === 'done') {
    return { ok: true, skipped: 'already_done' };
  }

  // v0.3.3 B+++：写 generated_at_round 到 insight_previews JSON（dispatcher 过滤用）
  // 写一个 status=pending 的"开始标记"，让 dispatcher 立即显示"生成中"
  const chatRound = typeof opts.chatRound === 'number' ? opts.chatRound : (req.chat_round || 1);
  reqStore.update(reqId, {
    insight_previews: JSON.stringify({
      ...(existing || {}),
      status: 'pending',
      generated_at_round: chatRound,
      generated_at: new Date().toISOString(),
    }),
  });

  // 异步执行（不阻塞路由响应）
  setImmediate(async () => {
    try {
      await insightPreviews.runPreviewJob(reqId, { modelId: opts.modelId, role: opts.role });
    } catch (e) {
      console.error(`[assist:visual] ${reqId} 异步生成失败:`, e.message);
    }
  });

  return { ok: true, started: true };
}

function getAssist(reqId) {
  // insight-previews 的状态是写到 req.insight_previews 字段
  // dispatcher 期望的 schema：{ status, variants, ..., generated_at_round }
  const req = reqStore.getById(reqId);
  if (!req) return null;
  let previews = null;
  try { previews = JSON.parse(req.insight_previews || '{}'); } catch {}
  if (!previews || !previews.status) return null;

  return {
    status: previews.status,                 // pending / generating / done / failed / skipped
    variants: previews.variants || [],       // 3 个变体
    started_at: previews.started_at,
    completed_at: previews.completed_at,
    picked_variant_id: previews.picked_variant_id,
    error: previews.error,
    // v0.3.3 B+++：generated_at_round 给 dispatcher 过滤用
    generated_at_round: previews.generated_at_round || 1,
    generated_at: previews.generated_at || previews.started_at,
  };
}

module.exports = {
  name: '视觉预览（3 张方向图）',
  runAssistJob,
  getAssist,
};
