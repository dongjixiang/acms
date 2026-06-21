// ===== 数据模型/流程预览（v0.13 抽公共，2026-06-21）=====
// 抽自 client/js/views/requirements.js（原 L288-406，118 行）
// 跨文件依赖：api / escHtml（全局）

let _cachedDataModel = {};

async function generateDataModelPreview(reqId) {
  const panel = document.getElementById(`data-model-panel-${reqId}`);
  if (!panel) return;

  // 检查是否已缓存
  if (_cachedDataModel[reqId]) {
    panel.innerHTML = renderDataModelView(reqId, _cachedDataModel[reqId]);
    return;
  }

  panel.innerHTML = '<div style="padding:8px;font-size:12px;color:var(--text2);display:flex;align-items:center"><button class="btn-small btn-accept" onclick="doGenerateDataModel(\'' + reqId + '\')">🔍 生成数据模型与流程预览</button><span style="margin-left:8px">—— 在审核前检查系统的数据组织和用户流程是否符合预期</span></div>';
}

async function doGenerateDataModel(reqId) {
  const panel = document.getElementById(`data-model-panel-${reqId}`);
  if (!panel) return;
  let step = 0;
  const loadingTexts = ['⏳ LLM 正在分析需求...', '⏳ 提取数据实体和字段关系...', '⏳ 梳理用户操作流程...'];
  const loadingInterval = setInterval(() => {
    step = (step + 1) % loadingTexts.length;
    const div = panel.querySelector('.loading-text');
    if (div) div.textContent = loadingTexts[step];
  }, 3000);
  panel.innerHTML = `<div style="padding:12px;font-size:13px;color:var(--text2)"><span class="loading-text">${loadingTexts[0]}</span><div style="font-size:10px;color:var(--text3);margin-top:4px">（模型响应通常需要 15-60 秒）</div></div>`;

  try {
    const result = await api('POST', `/requirements/${reqId}/data-model-preview`);
    clearInterval(loadingInterval);
    if (result.error) {
      if (result.retried) {
        panel.innerHTML = `<div style="padding:8px;font-size:12px;color:var(--red)">❌ ${escHtml(result.error)}<br><button class="btn-small" style="margin-top:4px" onclick="doGenerateDataModel('${reqId}')">🔄 重试</button></div>`;
      } else {
        panel.innerHTML = `<div style="padding:8px;font-size:12px;color:var(--red)">❌ ${escHtml(result.error)}</div>`;
      }
      return;
    }
    _cachedDataModel[reqId] = result;
    panel.innerHTML = renderDataModelView(reqId, result);
  } catch (e) {
    clearInterval(loadingInterval);
    const isTimeout = e.message && (e.message.includes('超时') || e.message.includes('timeout') || e.message.includes('504'));
    panel.innerHTML = `<div style="padding:8px;font-size:12px;color:var(--red)">❌ ${escHtml(e.message)}<br><button class="btn-small" style="margin-top:4px" onclick="doGenerateDataModel('${reqId}')">🔄 重试</button></div>`;
  }
}

function renderDataModelView(reqId, model) {
  let html = '<div class="review-panel" style="border-left:3px solid var(--accent3)"><h3>📊 数据模型与流程预览</h3>';
  html += '<div style="font-size:11px;color:var(--text2);margin-bottom:8px">🤖 AI 根据 SRS 和澄清对话提取，用于在审核前发现数据组织和流程偏差</div>';

  // 实体
  if (model.entities && model.entities.length) {
    html += '<h4 style="font-size:14px;margin:12px 0 8px">📦 数据实体</h4>';
    for (const e of model.entities) {
      html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px">`;
      html += `<div style="font-weight:bold;font-size:13px;margin-bottom:4px">📄 ${escHtml(e.name)}</div>`;
      if (e.fields && e.fields.length) {
        html += '<table style="width:100%;font-size:11px;border-collapse:collapse">';
        html += '<tr style="border-bottom:1px solid var(--border)"><th style="text-align:left;padding:2px 4px;color:var(--text2)">字段</th><th style="text-align:left;padding:2px 4px;color:var(--text2)">类型</th><th style="text-align:left;padding:2px 4px;color:var(--text2)">说明</th></tr>';
        for (const f of e.fields) {
          html += `<tr><td style="padding:2px 4px;font-family:monospace">${escHtml(f.name)}</td><td style="padding:2px 4px"><code>${escHtml(f.type)}</code></td><td style="padding:2px 4px">${escHtml(f.description || '')}</td></tr>`;
        }
        html += '</table>';
      }
      if (e.relations && e.relations.length) {
        html += '<div style="margin-top:4px;font-size:11px;color:var(--accent)">🔗 关联: ';
        html += e.relations.map(r => `${escHtml(r.target)} (${r.type})${r.description ? ': ' + escHtml(r.description) : ''}`).join(' | ');
        html += '</div>';
      }
      html += '</div>';
    }
  }

  // 页面/视图
  if (model.pages && model.pages.length) {
    html += '<h4 style="font-size:14px;margin:12px 0 8px">🖥️ 页面/视图</h4>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px">';
    for (const p of model.pages) {
      html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px;flex:1;min-width:200px">`;
      html += `<div style="font-weight:bold;font-size:12px;margin-bottom:4px">📄 ${escHtml(p.name)}</div>`;
      html += `<div style="font-size:11px;color:var(--text2);margin-bottom:4px">${escHtml(p.purpose || '')}</div>`;
      if (p.dataDisplay) html += `<div style="font-size:10px;color:var(--text);margin-bottom:4px"><strong>数据:</strong> ${escHtml(p.dataDisplay)}</div>`;
      if (p.actions && p.actions.length) html += `<div style="font-size:10px;color:var(--green)"><strong>操作:</strong> ${p.actions.map(a => escHtml(a)).join(' · ')}</div>`;
      html += '</div>';
    }
    html += '</div>';
  }

  // 流程
  if (model.flows && model.flows.length) {
    html += '<h4 style="font-size:14px;margin:12px 0 8px">🔄 用户流程</h4>';
    for (const f of model.flows) {
      html += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px">`;
      html += `<div style="font-weight:bold;font-size:12px;margin-bottom:4px">${escHtml(f.name)}</div>`;
      html += '<ol style="margin:0;padding-left:20px;font-size:11px;line-height:1.6">';
      for (const step of f.steps || []) {
        html += `<li>${escHtml(step)}</li>`;
      }
      html += '</ol>';
      if (f.pages && f.pages.length) {
        html += `<div style="font-size:10px;color:var(--accent);margin-top:4px">📌 涉及页面: ${f.pages.map(p => escHtml(p)).join(' → ')}</div>`;
      }
      html += '</div>';
    }
  }

  // 无数据
  if ((!model.entities || !model.entities.length) && (!model.pages || !model.pages.length) && (!model.flows || !model.flows.length)) {
    html += '<div style="padding:8px;font-size:12px;color:var(--text2)">AI 未提取到数据实体和流程信息，需求信息可能不足。</div>';
  }

  html += '<div style="margin-top:8px;font-size:11px;color:var(--text2);text-align:right">';
  html += `<button class="btn-small" onclick="doGenerateDataModel('${reqId}')" style="font-size:10px">🔄 重新生成</button>`;
  html += '</div></div>';
  return html;
}
