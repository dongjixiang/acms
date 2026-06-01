/**
 * ai-detector.js — AI 异常检测模拟逻辑
 * 模拟异常判断规则、风险评分、趋势分析
 */
window.AIDetector = (function() {
  /** 异常判断规则（模拟） */
  const rules = [
    { id: 'R01', name: '频繁申请检测', desc: '同一申请人30天内申请次数超过阈值', weight: 0.3 },
    { id: 'R02', name: '同型号累积异常', desc: '同一型号30天内被申请总量超过阈值', weight: 0.25 },
    { id: 'R03', name: '审批时长异常短', desc: '大额申请审批时间异常短（<1小时）', weight: 0.2 },
    { id: 'R04', name: '客户重复申请', desc: '同一客户短时间多次申请同型号', weight: 0.15 },
    { id: 'R05', name: '型号需求突变', desc: '型号月申请量环比增长>200%', weight: 0.1 }
  ];

  /** 模拟风险评分 */
  function calculateRiskScore(application) {
    const base = Math.random();
    if (base > 0.85) return { score: 85 + Math.floor(Math.random()*15), level: '高', matchedRules: ['R01','R02'] };
    if (base > 0.6) return { score: 60 + Math.floor(Math.random()*25), level: '中', matchedRules: ['R03'] };
    return { score: Math.floor(Math.random()*40), level: '低', matchedRules: [] };
  }

  /** 生成 AI 分析结论 */
  function generateAnalysis(appId, risk) {
    const conclusions = {
      '高': `高风险申请单 ${appId}：检测到频繁申请模式（规则R01）和同型号累积数量异常（规则R02）。建议立即人工复核该客户的近期申请记录。`,
      '中': `中风险申请单 ${appId}：审批处理时间异常短（规则R03），大额申请在1小时内完成审批，可能存在合规风险。`,
      '低': `低风险申请单 ${appId}：未触发显著异常规则，风险等级在正常范围内。`
    };
    return conclusions[risk.level] || `申请单 ${appId} 常规检测通过。`;
  }

  /** 生成模拟趋势数据 */
  function generateTrendData() {
    const days = 14;
    const data = [];
    for (let i = days; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      data.push({
        date: `${d.getMonth()+1}/${d.getDate()}`,
        high: Math.floor(Math.random() * 5),
        medium: Math.floor(Math.random() * 8),
        low: Math.floor(Math.random() * 10),
        total: 0
      });
      data[data.length-1].total = data[data.length-1].high + data[data.length-1].medium + data[data.length-1].low;
    }
    return data;
  }

  /** 处理操作 */
  function processAction(action, alertId, note) {
    console.log(`[AI] ${action} ${alertId}: ${note}`);
    return { success: true, alertId, action, note, timestamp: new Date().toISOString() };
  }

  return { rules, calculateRiskScore, generateAnalysis, generateTrendData, processAction };
})();
