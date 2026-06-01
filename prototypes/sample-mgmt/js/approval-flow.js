/**
 * approval-flow.js — 审批流程逻辑
 * 多级审批规则匹配、加签/转交/驳回处理
 */
window.ApprovalFlow = (function() {
  let rules = [];
  let approvers = [];

  async function init() {
    try {
      const resp = await fetch('../data/approval-rules.json');
      const data = await resp.json();
      rules = data.rules || [];
      approvers = data.approvers || [];
    } catch(e) { console.warn('[Approval] 规则加载失败', e); }
  }

  /** 根据申请数据匹配审批规则 */
  function matchRules(amount, qty, origin) {
    const matched = rules.filter(r => {
      try { return eval(r.condition.replace('amount',amount).replace('qty',qty).replace("'"+origin+"'","'"+origin+"'")); }
      catch(e) { return false; }
    });
    // 按金额优先，再按level降序
    const amountRules = matched.filter(r => r.condition.includes('amount'));
    if (amountRules.length) return amountRules.sort((a,b) => b.level - a.level)[0];
    const qtyRules = matched.filter(r => r.condition.includes('qty'));
    if (qtyRules.length) return qtyRules.sort((a,b) => b.level - a.level)[0];
    return matched.sort((a,b) => b.level - a.level)[0] || { approvers: ['PM审批'] };
  }

  /** 获取审批人列表 */
  function getApprovers() { return approvers; }

  /** 获取加签人列表（排除当前审批人） */
  function getCountersignOptions(currentId) {
    return approvers.filter(a => a.id !== currentId);
  }

  /** 转交检测：A->B->A 循环检测 */
  function detectCycle(fromId, toId, transferHistory) {
    if (fromId === toId) return true;
    return transferHistory.some(h => h.from === toId && h.to === fromId);
  }

  /** 生成模拟审批历史 */
  function generateMockHistory(appId) {
    const base = [
      { time: '2026-05-20 09:30', person: '张明', action: '提交申请', comment: '' },
      { time: '2026-05-20 14:20', person: '赵强', action: '初审通过', comment: '材料齐全，同意' },
    ];
    if (Math.random() > 0.5) {
      base.push({ time: '2026-05-21 10:00', person: '张总监', action: '二审通过', comment: '金额合规，审批通过' });
    }
    return base;
  }

  /** 计算审批时长 */
  function calcDuration(createTime, approveTime) {
    const diff = new Date(approveTime) - new Date(createTime);
    return Math.round(diff / (1000 * 60 * 60) * 10) / 10;
  }

  return { init, matchRules, getApprovers, getCountersignOptions, detectCycle, generateMockHistory, calcDuration };
})();
