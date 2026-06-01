/**
 * dashboard-charts.js — 数据看板图表引擎
 * 管理 5 种图表：趋势折线、审批效率、库存对比、成本分析、导出
 */
window.DashboardCharts = (function() {
  let charts = {};

  function destroy(key) { if (charts[key]) { charts[key].destroy(); delete charts[key]; } }

  /** 申请趋势图（折线/柱状切换，时间维度筛选） */
  function renderTrend(canvasId, period) {
    destroy('trend');
    const ctx = document.getElementById(canvasId).getContext('2d');
    const dataMap = {
      week: { labels: ['周一','周二','周三','周四','周五','周六','周日'], data: [12,18,8,22,15,5,3] },
      month: { labels: ['第1周','第2周','第3周','第4周'], data: [45,62,58,72] },
      quarter: { labels: ['1月','2月','3月','4月','5月'], data: [98,76,112,105,132] },
      year: { labels: ['Q1','Q2','Q3','Q4'], data: [280,350,310,290] }
    };
    const d = dataMap[period] || dataMap.month;
    charts.trend = new Chart(ctx, {
      type: 'line',
      data: { labels: d.labels, datasets: [{
        label: '申请数', data: d.data, borderColor: '#1890FF', backgroundColor: 'rgba(24,144,255,0.1)', fill: true, tension: 0.3
      }]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } } }
    });
  }

  /** 审批效率（通过率饼图+平均时长柱状） */
  function renderEfficiency(canvasId) {
    destroy('eff');
    const ctx = document.getElementById(canvasId).getContext('2d');
    const pieCanvas = document.createElement('canvas');
    pieCanvas.id = 'pieEff';
    ctx.canvas.parentNode.appendChild(pieCanvas);
    // 饼图
    charts.effPie = new Chart(pieCanvas.getContext('2d'), {
      type: 'pie',
      data: { labels: ['已通过','已驳回','待审批'], datasets: [{ data: [86, 8, 6], backgroundColor: ['#52C41A','#FF4D4F','#FA8C16'] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });
    // 时长柱状
    const barCanvas = document.createElement('canvas');
    barCanvas.id = 'barEff';
    ctx.canvas.parentNode.appendChild(barCanvas);
    charts.effBar = new Chart(barCanvas.getContext('2d'), {
      type: 'bar',
      data: { labels: ['赵强','刘洋','陈静'], datasets: [{ label: '平均审批时长(h)', data: [4.2, 6.8, 3.5], backgroundColor: '#1890FF80', borderColor: '#1890FF', borderWidth: 1 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } } } }
    });
  }

  /** 库存与需求对比（双轴折线图） */
  function renderInventoryCompare(canvasId) {
    destroy('inv');
    const ctx = document.getElementById(canvasId).getContext('2d');
    charts.inv = new Chart(ctx, {
      type: 'line',
      data: { labels: ['STM32','ESP32','LM358','AMS1117','ATmega','DS18B20'],
        datasets: [
          { label: '库存量', data: [1250, 800, 3000, 5000, 600, 2000], borderColor: '#1890FF', yAxisID: 'y', tension: 0.3 },
          { label: '需求量', data: [186, 142, 98, 72, 55, 84], borderColor: '#FF4D4F', yAxisID: 'y1', tension: 0.3 }
        ]},
      options: { responsive: true, maintainAspectRatio: false,
        scales: { y: { type: 'linear', position: 'left', grid: { color: 'rgba(0,0,0,0.05)' } },
                  y1: { type: 'linear', position: 'right', grid: { display: false } } },
        plugins: { legend: { position: 'top' } } }
    });
  }

  /** 运营成本分析（堆叠柱状图） */
  function renderCostAnalysis(canvasId) {
    destroy('cost');
    const ctx = document.getElementById(canvasId).getContext('2d');
    charts.cost = new Chart(ctx, {
      type: 'bar',
      data: { labels: ['华南','华东','华北','华中'],
        datasets: [
          { label: '采购成本', data: [120, 95, 68, 45], backgroundColor: '#1890FF80' },
          { label: '物流成本', data: [32, 28, 22, 18], backgroundColor: '#52C41A80' },
          { label: '管理成本', data: [18, 15, 12, 10], backgroundColor: '#FA8C1680' }
        ]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } },
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } } } }
    });
  }

  /** Excel 导出功能 */
  function exportToExcel(data, filename) {
    // 生成 CSV 并下载（浏览器兼容）
    if (!data || !data.length) return;
    const headers = Object.keys(data[0]);
    const csv = '\ufeff' + headers.join(',') + '\n' + data.map(r => headers.map(h => r[h]).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (filename || '样片数据') + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return { renderTrend, renderEfficiency, renderInventoryCompare, renderCostAnalysis, exportToExcel };
})();
