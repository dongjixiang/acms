// 需求管理视图 — 列表 + 详情 + 澄清 + SRS + 审核 + 分解
// 依赖: core/state.js, core/utils.js, js/api.js, views/kanban.js

// 将数组项安全转为字符串（兼容 LLM 返回对象数组的情况）
function fmtArr(arr, sep) {
  if (!arr || !Array.isArray(arr)) return '';
  return arr.map(item => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      return item.item || item.title || item.description || JSON.stringify(item);
    }
    return String(item);
  }).join(sep || ', ');
}

async function loadRequirements() {
  if (!App.currentProjectId) return;
  try {
    const status = document.getElementById('status-filter')?.value || '';
    const reqs = await Requirements.list({ projectId: App.currentProjectId, status: status || undefined, rootOnly: true });
    const container = document.getElementById('req-list');
    if (!reqs.length) { container.innerHTML = '<div class="empty">暂无需求</div>'; return; }
    container.innerHTML = reqs.map(r => `
      <div class="req-card" onclick="openRequirement('${r.id}')">
        <div class="title">${escHtml(r.title)}<span class="status-badge badge-${r.status}">${App.statusLabels[r.status] || r.status}</span></div>
        <div class="meta"><span>${r.id}</span><span>P${r.priority}</span><span>${fmtDate(r.created_at)}</span></div>
      </div>`).join('');
  } catch (e) { toast('加载失败: ' + e.message, 'error'); }
}

function showCreateReq() { document.getElementById('create-req-panel').style.display = 'block'; }
function hideCreateReq() { document.getElementById('create-req-panel').style.display = 'none'; }

async function doCreateReq() {
  const title = document.getElementById('create-title').value.trim();
  const description = document.getElementById('create-desc').value.trim();
  if (!title) return toast('请输入标题', 'error');

  // 高级选项只在用户展开时才读取
  const advancedOpen = document.querySelector('.create-req-advanced')?.open;
  const priorityRaw = document.getElementById('create-priority').value;
  const priority = priorityRaw ? parseInt(priorityRaw, 10) : null;  // 空=系统推断
  const deadline = document.getElementById('create-deadline').value || undefined;

  // 软引导：title 极短（<5 字）且没描述，提示用户考虑走想法池
  if (title.length < 5 && !description) {
    const goIdea = await showConfirm('标题很短还没描述 — 听起来更像一个想法？\n\n点击"去想法池"会把内容转到轻量入口，AI 会帮你展开。\n点击"继续"仍提交为需求。', {
      title: '💡 这可能是个想法',
      confirmText: '去想法池',
      cancelText: '继续',
      type: 'info',
    });
    if (goIdea) {
      // 关闭当前面板 → 打开想法池弹窗并预填
      hideCreateReq();
      document.getElementById('create-title').value = '';
      document.getElementById('create-desc').value = '';
      if (typeof showIdeaDialog === 'function') {
        showIdeaDialog();
        setTimeout(() => {
          const t = document.getElementById('idea-title');
          const c = document.getElementById('idea-content');
          if (t) t.value = title;
          if (c) c.value = '（从「提个需求」转来 — 用户感觉这更像想法）';
        }, 100);
      } else {
        toast('想法池功能未加载', 'error');
      }
      return;
    }
  }

  try {
    const data = {
      projectId: App.currentProjectId, title, description,
      tags: document.getElementById('create-tags').value.split(',').map(t => t.trim()).filter(Boolean),
    };
    if (priority !== null) data.priority = priority;
    if (deadline) data.deadline = deadline;
    // 30 文档「角色感知」Step 3：带当前用户角色，影响后续澄清提问方向
    if (App.currentRole) {
      data.userRole = App.currentRole;
      data.role = App.currentRole;  // 兼容老字段
    }

    const req = await Requirements.create(data);
    toast(advancedOpen ? '需求创建成功！' : '需求已记录 — AI 会在规划阶段自动定优先级', 'success');
    hideCreateReq(); loadRequirements(); loadDashboard();
    // 创建后直接打开需求详情
    openRequirement(req.id);
  } catch (e) { toast('创建失败: ' + e.message, 'error'); }
}

// ===== 需求详情 =====
async function openRequirement(id) {
  showWorkspaceView('detail');
  try {
    const req = await Requirements.get(id);
    document.getElementById('detail-title').textContent = `${req.id}: ${escHtml(req.title)}`;
    const roleLabels = { pm: '👤 PM', tech: '🛠 技术', design: '🎨 设计', test: '🧪 测试', 'agent:小吉': '🤖 Agent', system: '⚙️ 系统', anonymous: '👻 匿名' };
    const roleTag = req.user_role
      ? `<span class="role-tag-inline" title="提交时选中的角色">${escHtml(roleLabels[req.user_role] || req.user_role)}</span>`
      : '';
    document.getElementById('detail-status').innerHTML = `
      <span class="status-badge badge-${req.status}">${App.statusLabels[req.status]}</span>
      ${roleTag}
      ${req.clarifications && req.clarifications.length > 0 ? `<button class="btn-small" style="background:rgba(100,149,237,0.15);color:#6495ED;border-color:rgba(100,149,237,0.3)" onclick="showClarifyThread('${req.id}')">💬 查看澄清过程</button>` : ''}
      <button class="btn-small" style="background:rgba(78,205,196,0.15);color:var(--green);border-color:rgba(78,205,196,0.3)" onclick="exportRequirement('${req.id}')">📥 导出 Word</button>`;
    const srs = safeParse(req.srs);
    document.getElementById('detail-content').innerHTML = `
      <div class="section" style="display:flex;justify-content:space-between;align-items:center">
        <strong>描述:</strong>
        <button class="btn-small" onclick="showDescriptionHistory('${id}')" title="查看历史版本" style="font-size:10px">📜 历史</button>
      </div>
      <div class="md-content" id="description-content-${id}">${renderMarkdown(req.structured_description || req.description)}</div>
      <div id="existing-md-editor-${id}" style="margin-top:12px"></div>
      <div class="section"><strong>优先级:</strong> P${req.priority} | <strong>截止:</strong> ${req.deadline || '未设置'}</div>
    ${(req.status === 'idea') ? renderIdeaPanel(req) : ''}
    ${req.status === 'clarifying' ? renderAiClarifyPanel(req) : ''}
    ${req.status === 'review' ? renderReviewPanel(req) : ''}
    ${['clarifying', 'review', 'approved'].includes(req.status) ? `<div id="data-model-panel-${id}" style="margin-top:12px"></div>` : ''}
      ${req.status === 'approved' ? renderAiDecomposePanel(req) + '<div style="margin-top:8px"><button class="btn-small" style="background:rgba(78,205,196,0.1);color:var(--green)" onclick="openSplitPanel(\'' + id + '\')">🔧 拆分需求</button></div>' : ''}
      ${req.status === 'in_execution' ? `<div id="change-btn-row" style="margin-top:12px"><button class="btn-primary" onclick="showWorkspaceView('kanban');refreshKanban('${req.id}');">📌 查看看板</button><button class="btn-small" style="margin-left:8px;background:rgba(255,217,61,0.15);color:var(--accent3);border-color:rgba(255,217,61,0.3)" onclick="showChangePanel('${id}')">📝 需求变更</button></div>` : ''}
      ${req.status === 'change_requested' ? `<div id="change-btn-row" style="margin-top:12px;padding:12px;background:rgba(255,217,61,0.08);border:1px dashed var(--accent3);border-radius:8px"><span style="color:var(--accent3)">⏳ 变更分析中，请稍候...</span><button class="btn-small" style="margin-left:12px;background:rgba(255,100,100,0.15);color:#f44" onclick="cancelChangePanel('${id}')">取消变更</button></div>` : ''}
      ${req.status === 'impact_analysis' ? `<div id="change-btn-row" style="margin-top:12px;padding:12px;background:rgba(78,205,196,0.08);border:1px dashed var(--green);border-radius:8px"><span style="color:var(--green)">📊 变更影响分析已完成</span><button class="btn-accept" style="margin-left:12px" onclick="confirmChangeSimple('${id}')">✅ 确认变更</button><button class="btn-small" style="margin-left:8px;background:rgba(255,100,100,0.15);color:#f44" onclick="cancelChangePanel('${id}')">取消变更</button></div>` : ''}
      ${req.wiki_path ? `<div class="section"><span class="wiki-link">📚 Wiki: ${escHtml(req.wiki_path)}</span></div>` : ''}
      ${req.status !== 'idea' ? `<div id="req-knowledge-panel-${id}" style="margin-top:12px;padding:8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:12px;color:var(--text2)">⏳ 加载关联知识...</div>` : ''}
      <div style="margin-top:16px;display:flex;gap:8px">
        <button class="btn-small btn-reject" onclick="deleteRequirement('${id}')">🗑 删除需求</button>
      </div>
      ${req.status !== 'idea' ? `<h3>📋 SRS</h3><div class="srs-preview"><pre>${escHtml(JSON.stringify(srs, null, 2))}</pre></div>` : ''}
      ${renderArchSpec(req)}
      ${renderChangeHistory(req)}
      ${req.role === 'container' && (req.child_ids && JSON.parse(req.child_ids||'[]').length > 0) ? '<div style="margin-top:12px;display:flex;gap:8px"><button class="btn-small" style="background:rgba(78,205,196,0.1);color:var(--green)" onclick="refreshParent(\'' + id + '\')">📊 刷新父需求</button></div>' : ''}
      <div id="req-children" style="margin-top:16px"></div>`;
    if (req.status === 'clarifying') setTimeout(() => loadAiModels(id), 100);
    setTimeout(() => loadDecomposeModels(id), 100);
    setTimeout(() => loadRequirementChildren(id), 150);
    setTimeout(() => loadExistingMdEditor(id), 200);
    if (req.status !== 'idea') setTimeout(() => loadRequirementKnowledge(id), 250);
    if (req.status !== 'idea') setTimeout(() => generateDataModelPreview(id), 300);
    // v0.3.6 对话式想法澄清：替换旧 brief/assist 加载
    if (req.status === 'idea') {
      setTimeout(() => loadChatStream(id), 350);
    } else {
      // 非 idea 状态仍然加载旧的 brief（只读展示）
      setTimeout(() => ACMSThinkingBrief.load(id), 350);
    }
    // 页面加载后，如果存在 SRS，按需展示预览按钮
    setTimeout(() => updateMediaPreviewButtons(id), 350);
  } catch (e) { toast('加载失败: ' + e.message, 'error'); }
}

function renderThread(cl) {
  if (!cl.length) return '<div class="empty">暂无对话</div>';
  return cl.map(c => `<div class="clarify-msg ${c.role}"><div class="role">${c.role === 'user' ? '👤 用户' : '🤖 ' + escHtml(c.agent_id || '')}</div><div>${escHtml(c.content)}</div></div>`).join('');
}

function renderReviewPanel(req) {
  const s = safeParse(req.srs);
  return `<div class="review-panel"><h3>📋 需求审核</h3><div>范围: ${fmtArr(s.scopeIn, ', ')}</div><div>验收: ${fmtArr(s.acceptanceCriteria, '; ')}</div><div class="review-actions"><button class="btn-accept" onclick="approveReq('${req.id}')">✅ 确认通过</button><button class="btn-reject" onclick="rejectReq('${req.id}')">❌ 驳回</button></div></div>`;
}

// ===== 审核操作 =====
async function approveReq(id) { try { await Requirements.approve(id); toast('已确认 ✅', 'success'); openRequirement(id); loadRequirements(); loadDashboard(); if (typeof loadKanbanReqFilter === 'function') loadKanbanReqFilter(); } catch (e) { toast('失败: ' + e.message, 'error'); } }
// P0 v0.X: 驳回必填理由（min 10 字）— 用 ACMS 标准 showPrompt 弹窗
async function rejectReq(id) {
  const r = await showPrompt({
    title: '驳回需求',
    message: '说清楚哪里不对 / 期望怎么改。',
    placeholder: '例如：范围模糊 / 验收标准缺失 / 跟现有功能冲突...',
    minLength: 10,
    confirmText: '驳回',
  });
  if (r === null) return;
  try { await Requirements.reject(id, r); toast('已驳回', 'success'); openRequirement(id); loadRequirements(); } catch (e) { toast('失败: ' + e.message, 'error'); }
}


async function deleteRequirement(id) {
  if (!(await showConfirm('确认删除此需求？关联的子需求、任务和对话也将被级联删除。'))) return;
  try {
    await api('DELETE', `/requirements/${id}`);
    toast('需求已删除', 'success');
    showWorkspaceView('requirements'); loadRequirements(); loadDashboard();
  } catch (e) { toast('删除失败: ' + e.message, 'error'); }
}


// ===== AI 澄清对话 =====
let aiClarifyHistory = {}; // reqId → [{role, content}]
let aiSplitSuggestion = {}; // reqId → splitSuggestion（持久保留，不随轮次消失）

function renderAiClarifyPanel(req) {
  return `<div class="review-panel" id="ai-clarify-panel">
    <h3>🤖 AI 智能澄清</h3>
    <!-- v0.3.6 可追溯之前对话 -->
    <div class="clarify-history-toggle" onclick="toggleClarifyHistory('${req.id}')">
      💬 查看之前的讨论 <span class="supplement-history-toggle">▷</span>
    </div>
    <div id="clarify-history-${req.id}" class="clarify-history-content" style="display:none">
      <div class="insight-loading">⏳ 加载对话历史…</div>
    </div>
    <div class="form-inline" style="margin-bottom:12px;margin-top:8px">
      <select id="ai-model-select-${req.id}" class="filter-select" style="flex:1">
        <option value="">选择大模型...</option>
      </select>
      <button class="btn-primary" onclick="startAiClarify('${req.id}')">开始对话</button>
    </div>
    <div id="ai-clarify-messages-${req.id}" style="max-height:350px;overflow-y:auto;margin-bottom:12px"></div>
    <div id="ai-clarify-choices-${req.id}"></div>
    <div id="ai-clarify-srs-${req.id}" style="margin-top:12px"></div>
    <div id="ai-clarify-media-actions-${req.id}" style="margin-top:8px"></div>
    <div id="ai-clarify-sketches-${req.id}" style="margin-top:12px"></div>
    <div id="ai-clarify-actions-${req.id}" style="display:none;margin-top:12px">
      <button class="btn-accept" onclick="submitAiSrs('${req.id}')">✅ 满意，提交审核</button>
      <button class="btn-back" onclick="continueAiClarify('${req.id}')">继续澄清</button>
    </div>
    <div class="form-inline" style="margin-top:8px">
      <input type="text" id="ai-clarify-input-${req.id}" placeholder="补充说明或选择后发送..." style="flex:1" onkeydown="if(event.key==='Enter')sendAiClarify('${req.id}')">
      <button class="btn-primary" onclick="sendAiClarify('${req.id}')">发送</button>
    </div>
  </div>`;
}

// 打开面板时加载可用模型
async function loadAiModels(reqId) {
  try {
    const models = await api('GET', '/models/active');
    const sel = document.getElementById(`ai-model-select-${reqId}`);
    if (sel) sel.innerHTML = '<option value="">选择大模型...</option>' + models.map(m => `<option value="${m.id}">${escHtml(m.name)} (${m.model})</option>`).join('');
  } catch(e) {}
}


// ── 按需展示预览按钮 —— 从 SRS scopeIn 检测需求类型 ──
function detectPreviewNeeds(srs) {
  const text = JSON.stringify(srs.scopeIn || []).toLowerCase();
  return {
    prototype: /界面|页面|布局|导航|菜单|弹窗|表单|首页|列表|面板|设置|搜索|登录|注册/i.test(text),
    image: /立绘|头像|icon|图标|角色|场景|素材|配图|海报|封面|渲染图|像素|sprite|背景图|插图|角色图|图片|照片|写真|美女|摄影|拍照|画作|绘制|生成.*图/i.test(text),
    audio: /语音|配音|音效|背景音乐|旁白|朗读|播报|tts|音乐|歌曲|音色|声线|台词|对白|录音/i.test(text),
    video: /视频|动画|演示|宣传片|动态片段|特效镜头|场景动画|角色动画|过场动画|开场|片头|打斗|追逐|爆炸|飞行|奔跑|技能.*效果/i.test(text),
  };
}

function updateMediaPreviewButtons(reqId) {
  const container = document.getElementById(`ai-clarify-media-actions-${reqId}`);
  if (!container) return;

  // 优先从澄清面板的 SRS 草稿读取，其次从页面底部的 SRS 预览区读取
  let scopeInText = '';
  const srsEl = document.getElementById(`ai-clarify-srs-${reqId}`);
  if (srsEl && srsEl.textContent) {
    const match = srsEl.textContent.match(/范围:\s*(.+?)(?=验收|$)/);
    scopeInText = match ? match[1] : srsEl.textContent;
  } else {
    // 从页面底部 SRS 预览区读取
    const srsPreview = document.querySelector('.srs-preview pre');
    if (srsPreview) {
      try {
        const srs = JSON.parse(srsPreview.textContent);
        scopeInText = (srs.scopeIn || []).join(' ');
      } catch(e) {}
    }
  }

  if (!scopeInText) { container.innerHTML = ''; return; }
  const needs = detectPreviewNeeds({ scopeIn: [scopeInText] });
  const buttons = [];
  if (needs.prototype) buttons.push(`<button class="btn-small" style="background:rgba(147,112,219,0.12);color:var(--accent);border-color:rgba(147,112,219,0.25)" onclick="checkPrototypeSketches('${reqId}')">🎨 生成界面示意图</button>`);
  if (needs.image) buttons.push(`<button class="btn-small" style="background:rgba(78,205,196,0.12);color:var(--accent);border-color:rgba(78,205,196,0.25)" onclick="generateImagePreview('${reqId}')">🎨 预览生成图片</button>`);
  if (needs.audio) buttons.push(`<button class="btn-small" style="background:rgba(255,140,68,0.12);color:#ff8c44;border-color:rgba(255,140,68,0.25)" onclick="generateAudioPreview('${reqId}')">🔊 试听合成语音</button>`);
  if (needs.video) buttons.push(`<button class="btn-small" style="background:rgba(255,99,132,0.12);color:#ff6384;border-color:rgba(255,99,132,0.25)" onclick="generateVideoPreview('${reqId}')">🎬 预览生成视频</button>`);
  container.innerHTML = buttons.length > 0
    ? '<div style="display:flex;gap:6px;flex-wrap:wrap">' + buttons.join('') + '<span style="font-size:10px;color:var(--text3);align-self:center">预览仅供参考</span></div>'
    : '';
}

/**
 * 从页面提取需求描述文本（用于语音预览的内容）
 */
function getRequirementAudioText() {
  const srsPre = document.querySelector('.srs-preview pre');
  if (srsPre) {
    try {
      const srsData = JSON.parse(srsPre.textContent);
      if (srsData.summary) return srsData.summary;
    } catch(e) {}
  }
  const mdContent = document.querySelector('.md-content');
  if (mdContent) {
    const text = mdContent.textContent.replace(/\s+/g, ' ').trim();
    if (text.length > 10) return text.substring(0, 200);
  }
  const titleEl = document.getElementById('detail-title');
  if (titleEl) {
    const title = titleEl.textContent.replace(/^REQ-\w+:\s*/, '');
    if (title) return title;
  }
  return '这是一段语音预览，用于确认音色和语速是否符合需求。';
}

/**
 * 带反馈优化的图片生成 — 类似线框图反馈闭环
 * 优化意见累积叠加，不替代需求
 */
async function generateImagePreviewWithFeedback(reqId, inputId, oldPreviewId) {
  const feedback = document.getElementById(inputId);
  if (!feedback) return;
  const feedbackText = feedback.value.trim();
  if (!feedbackText) return toast('请输入优化意见', 'error');

  // 从旧卡片读取累积的 basePrompt 和反馈历史，以及上一张图的路径
  const oldPreview = document.getElementById(oldPreviewId);
  let basePrompt = '';
  let history = [];
  let prevImageUrl = '';
  let prevAssetPath = '';  // 修复：提前在 remove 之前取出 assetPath，用于降级时 img2img
  if (oldPreview) {
    basePrompt = oldPreview.getAttribute('data-base-prompt') || '';
    prevImageUrl = oldPreview.getAttribute('data-prev-image') || '';
    prevAssetPath = oldPreview.getAttribute('data-asset-path') || '';
    try { history = JSON.parse(oldPreview.getAttribute('data-feedback-history') || '[]'); } catch(e) {}
  }
  // 如果旧卡片没有数据（降级），从 DOM 提取
  if (!basePrompt) {
    const titleEl = document.getElementById('detail-title');
    const reqTitle = titleEl ? titleEl.textContent.replace(/^REQ-\w+:\s*/, '') : '';
    const srsPre = document.querySelector('.srs-preview pre');
    let scopeInText = '';
    try {
      const srsData = srsPre ? JSON.parse(srsPre.textContent) : null;
      if (srsData && srsData.scopeIn && Array.isArray(srsData.scopeIn)) {
        scopeInText = srsData.scopeIn.slice(0, 2).join('、').substring(0, 150);
      }
    } catch(e) {}
    basePrompt = [reqTitle, scopeInText].filter(Boolean).join('：').substring(0, 100);
  }

  // 累积新意见
  history.push(feedbackText);
  // 构建完整 prompt = 需求描述 + 所有累积的优化意见
  const feedbackPart = history.map((h, i) => `优化${i + 1}：${h}`).join('；');
  const enhancedPrompt = basePrompt + '，' + feedbackPart;

  const container = document.getElementById(`ai-clarify-media-actions-${reqId}`);
  if (!container) return;
  if (oldPreview) oldPreview.remove();

  const loadingEl = document.createElement('div');
  loadingEl.style.cssText = 'padding:8px;font-size:12px;color:var(--text2)';
  loadingEl.textContent = '⏳ 根据你的意见优化中...';
  container.prepend(loadingEl);

  const projectId = App.currentProjectId;
  const providers = ['gen-img-minimax', 'gen-img-minimax', 'gen-img-comfyui', 'gen-img-openai'];
  let lastError = '';
  for (const pid of providers) {
    try {
      const params = { providerId: pid, prompt: enhancedPrompt.substring(0, 400) };
      // ComfyUI 降级时传递上一张图片路径做 img2img（敏感词降级场景：拿上一张成功图重画）
      if (pid === 'gen-img-comfyui' && prevAssetPath) {
        // 修复：使用提前取出的 prevAssetPath（oldPreview 已在 line 654 被 remove），
        //       用 App.currentProjectId 拼接（修复硬编码 'sanguo' bug），与下方 asset URL 格式保持一致
        params.inputImage = App.currentProjectId + '/' + prevAssetPath;
      }
      const result = await api('POST', `/generate/image/${projectId}`, params);
      if (!result.success) { lastError = result.message || '生成失败'; continue; }
      const imgUrl = '/api/generate/assets/' + projectId + '/' + result.assetPath;
      loadingEl.remove();
      const previewId = 'img-preview-' + reqId + '-' + Date.now();
      const newInputId = 'img-feedback-' + reqId + '-' + Date.now();
      const historyHtml = history.length > 0
        ? '<div style="margin-bottom:6px;font-size:10px;color:var(--text3);padding:4px 6px;background:var(--bg3);border-radius:4px;max-height:36px;overflow-y:auto">📝 ' + history.map((h, i) => '优化' + (i + 1) + ': ' + escHtml(h)).join(' → ') + '</div>'
        : '';
      const previewEl = document.createElement('div');
      previewEl.id = previewId;
      previewEl.setAttribute('data-base-prompt', basePrompt);
      previewEl.setAttribute('data-feedback-history', JSON.stringify(history));
      previewEl.setAttribute('data-prev-image', imgUrl);
      previewEl.setAttribute('data-asset-path', result.assetPath);
      previewEl.style.cssText = 'margin-top:4px;padding:8px;background:var(--bg2);border-radius:6px;border:1px solid var(--border)';
      previewEl.innerHTML = historyHtml + '<div style="display:flex;gap:12px;align-items:flex-start"><a href="' + imgUrl + '" target="_blank"><img src="' + imgUrl + '" style="max-width:200px;max-height:200px;border-radius:4px;border:1px solid var(--border)" onerror="this.style.display=\'none\'"></a><div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0"><button class="btn-small" style="font-size:10px" onclick="document.getElementById(\'' + previewId + '\').remove()">✕ 关闭</button><button class="btn-small" style="font-size:10px" onclick="generateImagePreview(\'' + reqId + '\')">🔄 重新生成</button></div></div><div style="margin-top:6px;display:flex;gap:4px"><input id="' + newInputId + '" type="text" placeholder="继续输入优化意见..." style="flex:1;font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg3);color:var(--text)"><button class="btn-small" style="font-size:10px;background:rgba(78,205,196,0.1);color:var(--green);border-color:rgba(78,205,196,0.3)" onclick="generateImagePreviewWithFeedback(\'' + reqId + '\',\'' + newInputId + '\',\'' + previewId + '\')">✏️ 继续优化</button></div>';
      container.prepend(previewEl);
      feedback.value = '';
      return;
    } catch (e) { lastError = e.message; }
  }
  loadingEl.textContent = '❌ 优化失败: ' + escHtml(lastError);
  setTimeout(function() { loadingEl.remove(); }, 5000);
}

async function generateImagePreview(reqId) {
  const container = document.getElementById(`ai-clarify-media-actions-${reqId}`);
  if (!container) return;
  const projectId = App.currentProjectId;
  if (!projectId) return toast('请先选择项目', 'error');
  // 从页面元素提取需求标题和 SRS scopeIn 构建有意义的 prompt
  const titleEl = document.getElementById('detail-title');
  const reqTitle = titleEl ? titleEl.textContent.replace(/^REQ-\w+:\s*/, '') : '';
  const srsPre = document.querySelector('.srs-preview pre');
  let scopeInText = '';
  try {
    const srsData = srsPre ? JSON.parse(srsPre.textContent) : null;
    if (srsData && srsData.scopeIn && Array.isArray(srsData.scopeIn)) {
      scopeInText = srsData.scopeIn.join('、').substring(0, 300);
    }
  } catch(e) { /* SRS 非 JSON 或不存在 */ }
  const fullDesc = [reqTitle, scopeInText].filter(Boolean).join('：');
  const prompt = fullDesc ? fullDesc.substring(0, 200) : '生成一张预览图';
  const loadingEl = document.createElement('div');
  loadingEl.style.cssText = 'padding:8px;font-size:12px;color:var(--text2)';
  loadingEl.textContent = '⏳ 正在生成图片预览...';
  container.prepend(loadingEl);
  const providers = ['gen-img-minimax', 'gen-img-minimax', 'gen-img-comfyui', 'gen-img-openai'];
  let lastError = '';
  for (const pid of providers) {
    try {
      const result = await api('POST', `/generate/image/${projectId}`, { providerId: pid, prompt: prompt.substring(0, 200) });
      if (!result.success) { lastError = result.message || '生成失败'; continue; }
      const imgUrl = '/api/generate/assets/' + projectId + '/' + result.assetPath;
      loadingEl.remove();
      const previewId = 'img-preview-' + reqId + '-' + Date.now();
      const inputId = 'img-feedback-' + reqId + '-' + Date.now();
      const previewEl = document.createElement('div');
      previewEl.id = previewId;
      previewEl.setAttribute('data-base-prompt', prompt);
      previewEl.setAttribute('data-feedback-history', '[]');
      previewEl.setAttribute('data-prev-image', imgUrl);
      // 直接存 assetPath，避免从 URL 解析
      previewEl.setAttribute('data-asset-path', result.assetPath);
      previewEl.style.cssText = 'margin-top:4px;padding:8px;background:var(--bg2);border-radius:6px;border:1px solid var(--border)';
      previewEl.innerHTML = '<div style="display:flex;gap:12px;align-items:flex-start"><a href="' + imgUrl + '" target="_blank"><img src="' + imgUrl + '" style="max-width:200px;max-height:200px;border-radius:4px;border:1px solid var(--border)" onerror="this.style.display=\'none\'"></a><div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0"><button class="btn-small" style="font-size:10px" onclick="document.getElementById(\'' + previewId + '\').remove()">✕ 关闭</button><button class="btn-small" style="font-size:10px" onclick="generateImagePreview(\'' + reqId + '\')">🔄 重新生成</button></div></div><div style="margin-top:6px;display:flex;gap:4px"><input id="' + inputId + '" type="text" placeholder="输入优化意见（如：刘备穿白色汉服、手持双股剑）" style="flex:1;font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg3);color:var(--text)"><button class="btn-small" style="font-size:10px;background:rgba(78,205,196,0.1);color:var(--green);border-color:rgba(78,205,196,0.3)" onclick="generateImagePreviewWithFeedback(\'' + reqId + '\',\'' + inputId + '\',\'' + previewId + '\')">✏️ 优化</button></div>';
      container.prepend(previewEl);
      return;
    } catch (e) { lastError = e.message; }
  }
  loadingEl.textContent = '❌ 生成失败: ' + escHtml(lastError);
  setTimeout(function() { loadingEl.remove(); }, 5000);
}

async function generateAudioPreview(reqId, customText) {
  const container = document.getElementById(`ai-clarify-media-actions-${reqId}`);
  if (!container) return;
  const projectId = App.currentProjectId;
  if (!projectId) return toast('请先选择项目', 'error');
  const audioText = customText || getRequirementAudioText();
  const loadingEl = document.createElement('div');
  loadingEl.style.cssText = 'padding:8px;font-size:12px;color:var(--text2)';
  loadingEl.textContent = '⏳ 正在生成语音试听...';
  container.prepend(loadingEl);
  const providers = ['gen-audio-minimax', 'gen-audio-elevenlabs'];
  let lastError = '';
  for (const pid of providers) {
    try {
      const result = await api('POST', `/generate/audio/${projectId}`, { providerId: pid, text: audioText, params: {} });
      if (!result.success) { lastError = result.message || '生成失败'; continue; }
      const audioUrl = '/api/generate/assets/' + projectId + '/' + result.assetPath;
      loadingEl.remove();
      const previewId = 'audio-preview-' + reqId + '-' + Date.now();
      const textInputId = 'audio-text-' + reqId + '-' + Date.now();
      const previewEl = document.createElement('div');
      previewEl.id = previewId;
      previewEl.style.cssText = 'margin-top:4px;padding:8px;background:var(--bg2);border-radius:6px;border:1px solid var(--border)';
      previewEl.innerHTML = '<div style="margin-bottom:6px;font-size:11px;color:var(--text2);padding:4px 6px;background:var(--bg3);border-radius:4px;max-height:48px;overflow-y:auto">📄 ' + escHtml(audioText.substring(0, 100)) + '</div><div style="display:flex;gap:12px;align-items:flex-start"><audio controls style="max-width:240px"><source src="' + audioUrl + '" type="' + (result.mime || 'audio/mpeg') + '"></audio><div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0"><button class="btn-small" style="font-size:10px" onclick="document.getElementById(\'' + previewId + '\').remove()">✕ 关闭</button><button class="btn-small" style="font-size:10px" onclick="generateAudioPreview(\'' + reqId + '\')">🔄 重新生成</button></div></div><div style="margin-top:6px;display:flex;gap:4px"><input id="' + textInputId + '" type="text" placeholder="输入自定义文本朗读..." style="flex:1;font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg3);color:var(--text)"><button class="btn-small" style="font-size:10px;background:rgba(255,140,68,0.1);color:#ff8c44;border-color:rgba(255,140,68,0.3)" onclick="generateAudioPreviewWithText(\'' + reqId + '\',\'' + textInputId + '\',\'' + previewId + '\')">🔊 自定义朗读</button></div>';
      container.prepend(previewEl);
      return;
    } catch (e) { lastError = e.message; }
  }
  loadingEl.textContent = '❌ 生成失败: ' + escHtml(lastError);
  setTimeout(function() { loadingEl.remove(); }, 5000);
}

/**
 * 自定义文本语音合成 — 用户输入任意文本进行语音试听
 */
async function generateAudioPreviewWithText(reqId, inputId, oldPreviewId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const customText = input.value.trim();
  if (!customText) return toast('请输入要朗读的文本', 'error');
  const oldPreview = document.getElementById(oldPreviewId);
  if (oldPreview) oldPreview.remove();
  await generateAudioPreview(reqId, customText);
}

/**
 * 视频预览生成 — 从需求描述提取 prompt，走 MiniMax → ComfyUI 降级链
 */
async function generateVideoPreview(reqId) {
  const container = document.getElementById(`ai-clarify-media-actions-${reqId}`);
  if (!container) return;
  const projectId = App.currentProjectId;
  if (!projectId) return toast('请先选择项目', 'error');
  // 从页面元素提取需求标题和 SRS scopeIn 构建 prompt
  const titleEl = document.getElementById('detail-title');
  const reqTitle = titleEl ? titleEl.textContent.replace(/^REQ-\w+:\s*/, '') : '';
  const srsPre = document.querySelector('.srs-preview pre');
  let scopeInText = '';
  try {
    const srsData = srsPre ? JSON.parse(srsPre.textContent) : null;
    if (srsData && srsData.scopeIn && Array.isArray(srsData.scopeIn)) {
      scopeInText = srsData.scopeIn.join('、').substring(0, 300);
    }
  } catch(e) { /* SRS 非 JSON 或不存在 */ }
  const fullDesc = [reqTitle, scopeInText].filter(Boolean).join('：');
  const prompt = fullDesc ? fullDesc.substring(0, 200) : '生成一段预览视频';
  const loadingEl = document.createElement('div');
  loadingEl.style.cssText = 'padding:8px;font-size:12px;color:var(--text2)';
  loadingEl.textContent = '⏳ 正在生成视频预览（云端生成约需 1-3 分钟）...';
  container.prepend(loadingEl);
  const providers = ['gen-video-minimax', 'gen-video-comfyui'];
  let lastError = '';
  for (const pid of providers) {
    try {
      const result = await api('POST', `/generate/video/${projectId}`, { providerId: pid, prompt: prompt.substring(0, 200), params: {} });
      if (!result.success) { lastError = result.message || '生成失败'; continue; }
      const videoUrl = '/api/generate/assets/' + projectId + '/' + result.assetPath;
      loadingEl.remove();
      const previewId = 'video-preview-' + reqId + '-' + Date.now();
      const inputId = 'video-feedback-' + reqId + '-' + Date.now();
      const previewEl = document.createElement('div');
      previewEl.id = previewId;
      previewEl.setAttribute('data-base-prompt', prompt);
      previewEl.setAttribute('data-feedback-history', '[]');
      previewEl.setAttribute('data-prev-video', videoUrl);
      previewEl.setAttribute('data-asset-path', result.assetPath);
      previewEl.style.cssText = 'margin-top:4px;padding:8px;background:var(--bg2);border-radius:6px;border:1px solid var(--border)';
      const mime = result.mime || 'video/mp4';
      previewEl.innerHTML = '<div style="display:flex;gap:12px;align-items:flex-start"><video controls style="max-width:280px;max-height:200px;border-radius:4px;border:1px solid var(--border)" preload="metadata"><source src="' + videoUrl + '" type="' + mime + '"></video><div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0"><button class="btn-small" style="font-size:10px" onclick="document.getElementById(\'' + previewId + '\').remove()">✕ 关闭</button><button class="btn-small" style="font-size:10px" onclick="generateVideoPreview(\'' + reqId + '\')">🔄 重新生成</button></div></div><div style="margin-top:6px;display:flex;gap:4px"><input id="' + inputId + '" type="text" placeholder="输入优化意见（如：增加动态效果、调整色调）" style="flex:1;font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg3);color:var(--text)"><button class="btn-small" style="font-size:10px;background:rgba(255,99,132,0.1);color:#ff6384;border-color:rgba(255,99,132,0.3)" onclick="generateVideoPreviewWithFeedback(\'' + reqId + '\',\'' + inputId + '\',\'' + previewId + '\')">✏️ 优化</button></div>';
      container.prepend(previewEl);
      return;
    } catch (e) { lastError = e.message; }
  }
  loadingEl.textContent = '❌ 生成失败: ' + escHtml(lastError);
  setTimeout(function() { loadingEl.remove(); }, 5000);
}

/**
 * 带反馈优化的视频生成 — 优化意见累积叠加
 */
async function generateVideoPreviewWithFeedback(reqId, inputId, oldPreviewId) {
  const feedback = document.getElementById(inputId);
  if (!feedback) return;
  const feedbackText = feedback.value.trim();
  if (!feedbackText) return toast('请输入优化意见', 'error');

  const oldPreview = document.getElementById(oldPreviewId);
  let basePrompt = '';
  let history = [];
  let prevVideoUrl = '';
  if (oldPreview) {
    basePrompt = oldPreview.getAttribute('data-base-prompt') || '';
    prevVideoUrl = oldPreview.getAttribute('data-prev-video') || '';
    try { history = JSON.parse(oldPreview.getAttribute('data-feedback-history') || '[]'); } catch(e) {}
  }
  if (!basePrompt) {
    const titleEl = document.getElementById('detail-title');
    const reqTitle = titleEl ? titleEl.textContent.replace(/^REQ-\w+:\s*/, '') : '';
    const srsPre = document.querySelector('.srs-preview pre');
    let scopeInText = '';
    try {
      const srsData = srsPre ? JSON.parse(srsPre.textContent) : null;
      if (srsData && srsData.scopeIn && Array.isArray(srsData.scopeIn)) {
        scopeInText = srsData.scopeIn.slice(0, 2).join('、').substring(0, 150);
      }
    } catch(e) {}
    basePrompt = [reqTitle, scopeInText].filter(Boolean).join('：').substring(0, 100);
  }

  history.push(feedbackText);
  const feedbackPart = history.map((h, i) => `优化${i + 1}：${h}`).join('；');
  const enhancedPrompt = basePrompt + '，' + feedbackPart;

  const container = document.getElementById(`ai-clarify-media-actions-${reqId}`);
  if (!container) return;
  if (oldPreview) oldPreview.remove();

  const loadingEl = document.createElement('div');
  loadingEl.style.cssText = 'padding:8px;font-size:12px;color:var(--text2)';
  loadingEl.textContent = '⏳ 根据你的意见优化中...';
  container.prepend(loadingEl);

  const projectId = App.currentProjectId;
  const providers = ['gen-video-minimax', 'gen-video-comfyui'];
  let lastError = '';
  for (const pid of providers) {
    try {
      const params = { providerId: pid, prompt: enhancedPrompt.substring(0, 400) };
      const result = await api('POST', `/generate/video/${projectId}`, params);
      if (!result.success) { lastError = result.message || '生成失败'; continue; }
      const videoUrl = '/api/generate/assets/' + projectId + '/' + result.assetPath;
      loadingEl.remove();
      const previewId = 'video-preview-' + reqId + '-' + Date.now();
      const newInputId = 'video-feedback-' + reqId + '-' + Date.now();
      const historyHtml = history.length > 0
        ? '<div style="margin-bottom:6px;font-size:10px;color:var(--text3);padding:4px 6px;background:var(--bg3);border-radius:4px;max-height:36px;overflow-y:auto">📝 ' + history.map((h, i) => '优化' + (i + 1) + ': ' + escHtml(h)).join(' → ') + '</div>'
        : '';
      const previewEl = document.createElement('div');
      previewEl.id = previewId;
      previewEl.setAttribute('data-base-prompt', basePrompt);
      previewEl.setAttribute('data-feedback-history', JSON.stringify(history));
      previewEl.setAttribute('data-prev-video', videoUrl);
      previewEl.setAttribute('data-asset-path', result.assetPath);
      previewEl.style.cssText = 'margin-top:4px;padding:8px;background:var(--bg2);border-radius:6px;border:1px solid var(--border)';
      const mime = result.mime || 'video/mp4';
      previewEl.innerHTML = historyHtml + '<div style="display:flex;gap:12px;align-items:flex-start"><video controls style="max-width:280px;max-height:200px;border-radius:4px;border:1px solid var(--border)" preload="metadata"><source src="' + videoUrl + '" type="' + mime + '"></video><div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0"><button class="btn-small" style="font-size:10px" onclick="document.getElementById(\'' + previewId + '\').remove()">✕ 关闭</button><button class="btn-small" style="font-size:10px" onclick="generateVideoPreview(\'' + reqId + '\')">🔄 重新生成</button></div></div><div style="margin-top:6px;display:flex;gap:4px"><input id="' + newInputId + '" type="text" placeholder="继续输入优化意见..." style="flex:1;font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg3);color:var(--text)"><button class="btn-small" style="font-size:10px;background:rgba(255,99,132,0.1);color:#ff6384;border-color:rgba(255,99,132,0.3)" onclick="generateVideoPreviewWithFeedback(\'' + reqId + '\',\'' + newInputId + '\',\'' + previewId + '\')">✏️ 继续优化</button></div>';
      container.prepend(previewEl);
      feedback.value = '';
      return;
    } catch (e) { lastError = e.message; }
  }
  loadingEl.textContent = '❌ 优化失败: ' + escHtml(lastError);
  setTimeout(function() { loadingEl.remove(); }, 5000);
}

async function startAiClarify(reqId) {
  const modelId = document.getElementById(`ai-model-select-${reqId}`)?.value;
  if (!modelId) return toast('请先选择大模型', 'error');
  // 仅在 idea 状态时推进到 clarifying，避免从 review 等状态回退
  try {
    const req = await Requirements.get(reqId);
    if (req && req.status === 'idea') {
      await Requirements.transition(reqId, 'clarifying');
    }
  } catch(e) { /* 已是指定状态则忽略 */ }
  aiClarifyHistory[reqId] = [];
  aiSelections[reqId] = {};
  aiSplitSuggestion[reqId] = null;
  await sendAiClarify(reqId);
}

async function sendAiClarify(reqId, choiceAnswer) {
  const modelId = document.getElementById(`ai-model-select-${reqId}`)?.value;
  if (!modelId) return toast('请先选择大模型', 'error');

  const input = document.getElementById(`ai-clarify-input-${reqId}`);
  const userMsg = choiceAnswer || (input?.value?.trim() || '');
  if (input && !choiceAnswer) input.value = '';

  // 收集当前所有已选择的选项
  const selections = collectSelections(reqId);
  const hasHistory = (aiClarifyHistory[reqId] || []).length > 0;
  let batchMsg = selections.length > 0 ? selections.join('；') : userMsg;
  // 首次对话：没有选择也没有输入时，发送初始提示
  if (!batchMsg && !hasHistory) {
    batchMsg = '请开始分析这个需求，用选择题帮助我澄清细节。';
  }
  if (!batchMsg) return;

  const msgsDiv = document.getElementById(`ai-clarify-messages-${reqId}`);
  const choicesDiv = document.getElementById(`ai-clarify-choices-${reqId}`);
  const srsDiv = document.getElementById(`ai-clarify-srs-${reqId}`);
  const actionsDiv = document.getElementById(`ai-clarify-actions-${reqId}`);

  aiClarifyHistory[reqId] = aiClarifyHistory[reqId] || [];
  aiClarifyHistory[reqId].push({ role: 'user', content: batchMsg });

  msgsDiv.innerHTML = '<div style="color:var(--text2);text-align:center;padding:12px">⏳ 正在思考...</div>';
  choicesDiv.innerHTML = '';

  try {
    const result = await api('POST', `/ai/requirements/${reqId}/clarify-ai`, {
      modelId,
      message: batchMsg,
      history: aiClarifyHistory[reqId].filter(h => h.role === 'user' || h.role === 'assistant'),
      // 30 文档「角色感知」Step 3：把当前顶栏选中的角色带给后端
      role: App.currentRole || 'pm',
    });

    // 展示对话历史
    const displayHistory = aiClarifyHistory[reqId] || [];
    msgsDiv.innerHTML = displayHistory.map(h =>
      `<div class="clarify-msg ${h.role === 'user' ? 'user' : 'agent'}">
        <div class="role">${h.role === 'user' ? '👤 你' : '🤖 AI'}</div>
        <div>${escHtml(typeof h.content === 'string' ? h.content : h.content.message || '')}</div>
      </div>`
    ).join('') + `<div class="clarify-msg agent"><div class="role">🤖 AI (${escHtml(result.modelUsed)})</div><div>${escHtml(result.message)}</div></div>`;

    // 渲染 Progress Memo（每轮的状态摘要）
    if (result.progressMemo && result.progressMemo.round) {
      const pm = result.progressMemo;
      const coverageColor = pm.flowCoverage < 60 ? 'var(--red)' : pm.flowCoverage < 90 ? 'var(--yellow)' : 'var(--green)';
      const memoHtml = `<div style="margin:8px 0;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:12px">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <strong style="color:var(--text1)">📊 第 ${pm.round} 轮 Memo</strong>
          <span style="color:${coverageColor};font-weight:bold">流程覆盖: ${pm.flowCoverage}%</span>
        </div>
        ${pm.confirmedScope ? `<div style="color:var(--text2);margin-bottom:2px">✅ 已确认: ${escHtml(pm.confirmedScope)}</div>` : ''}
        ${pm.pendingDecisions && pm.pendingDecisions.length > 0 ? `<div style="color:var(--yellow)">⏳ 待定: ${pm.pendingDecisions.map(d => escHtml(d)).join('、')}</div>` : '<div style="color:var(--green)">🎯 待定项: 无</div>'}
        ${pm.userFlow ? `<div style="color:var(--text2);margin-top:2px;font-family:monospace">🔄 流程: ${escHtml(pm.userFlow)}</div>` : ''}
        ${pm.changesSinceLast ? `<div style="color:var(--blue);margin-top:2px">📝 变化: ${escHtml(pm.changesSinceLast)}</div>` : ''}
      </div>`;
      msgsDiv.insertAdjacentHTML('beforeend', memoHtml);
    }

    aiClarifyHistory[reqId].push({ role: 'assistant', content: result });

    // 渲染交互组件：按 strategy 分发（v0.3.1 思路先于画面 增量）
    // - choices: 原有的 4-6 个选择题
    // - decision_tree: 3 个互斥分支卡片（点击=选中预览，提交按钮=拼回答送 AI；v0.4 暖橙描边）
    if (result.strategy === 'decision_tree' && result.content && result.content.branches) {
      renderDecisionTree(reqId, result.content.branches);
    } else if (result.choices && result.choices.length > 0) {
      renderChoicesWithSubmit(reqId, result.choices);
    }

        // 渲染拆分建议（存入持久变量，放在 actions 区域保持可见）
    if (result.splitSuggestion && result.splitSuggestion.shouldSplit) {
      aiSplitSuggestion[reqId] = result.splitSuggestion;
    }
    const ss = aiSplitSuggestion[reqId];
    if (ss && ss.shouldSplit) {
      actionsDiv.innerHTML = `
        <div style="margin:12px 0;padding:12px;background:rgba(78,205,196,0.08);border:1px dashed var(--green);border-radius:6px">
          <div style="font-weight:bold;color:var(--green);margin-bottom:6px">💡 拆分建议（先确认架构宪法再拆分）</div>
          <div style="font-size:13px;color:var(--text2);margin-bottom:8px">${escHtml(ss.reason)}</div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:4px">建议拆分为 ${(ss.suggestedChildren||[]).length} 个子需求：</div>
          ${(ss.suggestedChildren||[]).map(c => `
            <div style="font-size:12px;padding:4px 8px;margin:2px 0;background:var(--bg);border-radius:4px">
              <strong>${escHtml(c.title)}</strong>
              ${c.description ? `<span style="color:var(--text2)"> — ${escHtml(c.description)}</span>` : ''}
            </div>`).join('')}
          <div style="margin-top:8px;display:flex;gap:8px">
            <button class="btn-primary btn-sm" onclick="openSplitPanel('${reqId}', ${JSON.stringify(ss.suggestedChildren || []).replace(/"/g, '&quot;')})">🔧 先定宪法再拆分</button>
          </div>
        </div>` + actionsDiv.innerHTML;
    }

// 渲染 SRS 草稿
    if (result.srs) {
      srsDiv.innerHTML = `<h4>📋 当前 SRS 草稿</h4>
        <div style="font-size:12px;margin:4px 0"><strong>范围:</strong> ${fmtArr(result.srs.scopeIn, ', ')||'待确认'}</div>
        <div style="font-size:12px;margin:4px 0"><strong>验收:</strong> ${fmtArr(result.srs.acceptanceCriteria, '; ')||'待确认'}</div>
        <div style="font-size:12px;margin:4px 0;color:var(--text2)">${result.srs.summary||''}</div>`;
      // SRS 更新后 → 按需展示预览按钮
      updateMediaPreviewButtons(reqId);
    }

    // 是否可以提交审核
    if (result.readyForReview) {
      actionsDiv.style.display = 'block';
      actionsDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 自动生成 MD 文档
      generateMdDoc(reqId, modelId);
    } else if (result.strategy !== 'decision_tree' && (!result.choices || result.choices.length === 0)) {
      // 逃生口: readyForReview=false 且无选择题时，仍展示"继续澄清"按钮
      // 让用户可以直接在输入框中打字推进，而不是卡死在无交互组件状态
      // 注意：decision_tree 模式天然没 choices，不触发此逃生口
      actionsDiv.style.display = 'block';
      const acceptBtn = document.querySelector('#ai-clarify-actions-' + reqId + ' .btn-accept');
      if (acceptBtn) acceptBtn.style.display = 'none';
      actionsDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      actionsDiv.style.display = 'none';
    }

  } catch (e) {
    msgsDiv.innerHTML = `<div style="color:var(--accent2);padding:12px">❌ ${escHtml(e.message)}</div>`;
  }
}

// ===== HTML 清洗 =====

function sanitizeWireframe(html) {
  if (!html) return '';
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript\s*:/gi, 'blocked:')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/@import/gi, 'import-blocked');
}

// 追踪每个问题的选择状态
let aiSelections = {};

function collectSelections(reqId) {
  const sel = aiSelections[reqId] || {};
  return Object.entries(sel)
    .filter(([_, v]) => v.values && v.values.length > 0)
    .map(([k, v]) => v.values.join('，'));
}

function renderChoicesWithSubmit(reqId, choices) {
  const choicesDiv = document.getElementById(`ai-clarify-choices-${reqId}`);
  if (!choicesDiv) return;

  if (!aiSelections[reqId]) aiSelections[reqId] = {};

  choicesDiv.innerHTML = choices.map((c, qi) => {
    const current = aiSelections[reqId][qi] || { values: [], multiple: true };
    current.multiple = true; // 全部多选
    aiSelections[reqId][qi] = current;
    const selectedSet = new Set(current.values);

    return `<div style="margin:8px 0;padding:8px;background:var(--bg3);border-radius:6px">
      <strong>${escHtml(c.question)}</strong>
      ${current.multiple ? '<span style="font-size:10px;color:var(--accent);margin-left:6px">[可多选]</span>' : ''}
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px" id="choice-group-${reqId}-${qi}">
        ${c.options.map((opt, oi) => {
          const val = `${String.fromCharCode(65+oi)}: ${opt}`;
          const selected = selectedSet.has(val);
          return `<button class="btn-small choice-btn ${selected ? 'choice-selected' : ''}"
            style="font-size:12px;transition:all 0.15s"
            data-val="${escHtml(val)}" onclick="toggleChoice(this,'${reqId}',${qi})">${String.fromCharCode(65+oi)}. ${escHtml(opt)}</button>`;
        }).join('')}
        ${c.allowCustom ? `<button class="btn-small" style="font-size:12px;background:rgba(78,205,196,0.1)" onclick="document.getElementById('ai-clarify-input-${reqId}').focus()">✏️ 自定义</button>` : ''}
      </div>
    </div>`;
  }).join('');

  choicesDiv.innerHTML += `
    <div style="margin-top:12px;text-align:center">
      <button class="btn-primary btn-lg" onclick="submitAllChoices('${reqId}')"
        style="padding:10px 32px;font-size:15px">
        ✅ 确认所有选择，发送给 AI
      </button>
    </div>`;
}

function toggleChoice(btn, reqId, qi) {
  // 从 data-val 属性读取，避免引号问题
  const val = btn.dataset.val;
  if (!val) return;
  // 确保 aiSelections 存在
  if (!aiSelections[reqId]) aiSelections[reqId] = {};
  const current = aiSelections[reqId][qi];
  // 如果 renderChoicesWithSubmit 还没设置，默认多选
  if (!current) {
    aiSelections[reqId][qi] = { values: [], multiple: true };
  }
  const sel = aiSelections[reqId][qi];
  const idx = sel.values.indexOf(val);

  if (idx >= 0) {
    // 取消选择
    sel.values.splice(idx, 1);
    btn.classList.remove('choice-selected');
  } else {
    if (!sel.multiple) {
      // 单选：清除同组其他选择
      sel.values = [];
      const group = document.getElementById(`choice-group-${reqId}-${qi}`);
      if (group) group.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('choice-selected'));
    }
    sel.values.push(val);
    btn.classList.add('choice-selected');
  }
}

// 评审建议的点击选择/取消
function toggleReviewSuggestion(btn, reqId, si) {
  const val = btn.dataset.val;
  if (!val) return;
  if (!aiSelections[reqId]) aiSelections[reqId] = {};
  const key = `_review_${reqId}`;
  if (!aiSelections[reqId][key]) aiSelections[reqId][key] = { values: [], multiple: true };
  const sel = aiSelections[reqId][key];
  const idx = sel.values.indexOf(val);
  if (idx >= 0) {
    sel.values.splice(idx, 1);
    btn.classList.remove('choice-selected');
  } else {
    sel.values.push(val);
    btn.classList.add('choice-selected');
  }
}

async function submitAllChoices(reqId) {
  const selections = collectSelections(reqId);
  if (selections.length === 0) {
    const input = document.getElementById(`ai-clarify-input-${reqId}`);
    const custom = input?.value?.trim();
    if (!custom) return toast('请至少选择一个选项或输入自定义内容', 'error');
  }
  // 合并所有选择 + 自定义输入
  const input = document.getElementById(`ai-clarify-input-${reqId}`);
  const customMsg = input?.value?.trim() || '';
  if (customMsg) {
    aiClarifyHistory[reqId] = aiClarifyHistory[reqId] || [];
    // custom input will be added as user message in sendAiClarify
  }
  await sendAiClarify(reqId);
  // 清除选择状态
  aiSelections[reqId] = {};
}

async function submitAiSrs(reqId) {
  // 显示加载状态
  const actionsDiv = document.getElementById(`ai-clarify-actions-${reqId}`);
  if (actionsDiv) {
    actionsDiv.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text2)">⏳ AI 正在评审需求，请稍候...</div>';
  }

  // 先保存编辑后的 MD 文档（容错：失败不阻塞）
  try {
    const mdEditor = document.getElementById(`md-editor-${reqId}`);
    if (mdEditor) {
      await Requirements.updateSrs(reqId, { description: mdEditor.value });
    }
  } catch (e) {
    console.warn('[submitAiSrs] 保存 MD 文档失败:', e.message);
  }
  try {
    await Requirements.submitReview(reqId);
    toast('需求已提交审核 ✅', 'success');
    openRequirement(reqId); loadRequirements(); loadDashboard();
  } catch (e) {
    // 处理 AI 评审不通过的情况
    if (e.data && e.data.review) {
      const review = e.data.review;
      const issuesHtml = review.issues.map((i, idx) =>
        `<div style="padding:8px;margin:4px 0;border-left:3px solid ${i.severity === 'error' ? 'var(--red)' : 'var(--yellow)'};background:var(--bg);border-radius:4px;font-size:12px">
          <strong style="color:${i.severity === 'error' ? 'var(--red)' : 'var(--yellow)'}">[${i.dimension}]</strong>
          <span style="color:var(--text1)">${escHtml(i.detail)}</span>
          ${i.suggestion ? `<div style="color:var(--green);margin-top:2px">💡 ${escHtml(i.suggestion)}</div>` : ''}
        </div>`
      ).join('');

      // 为每个问题的建议生成可点击的选择按钮
      const suggestionChoices = review.issues.filter(i => i.suggestion).map((i, idx) => ({
        id: `review-choice-${idx}`,
        text: `[${i.dimension}] ${i.suggestion}`,
      }));
      const reviewSuggestionKey = `_review_${reqId}`;
      if (!aiSelections[reqId]) aiSelections[reqId] = {};
      aiSelections[reqId][reviewSuggestionKey] = { values: [], multiple: true };

      const suggestionsHtml = suggestionChoices.length > 0
        ? `<div style="margin:10px 0;padding:10px;background:var(--bg);border:1px dashed var(--border);border-radius:6px">
            <div style="font-weight:bold;color:var(--green);margin-bottom:6px;font-size:13px">💡 建议修改方案（可多选，点击采纳）</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap" id="review-choices-${reqId}">
              ${suggestionChoices.map((sc, si) => {
                const val = `S${si}: ${sc.text}`;
                return `<button class="btn-small choice-btn"
                  style="font-size:12px;transition:all 0.15s;max-width:100%;text-align:left"
                  data-val="${escHtml(val)}" onclick="toggleReviewSuggestion(this,'${reqId}',${si})">📌 ${escHtml(sc.text.substring(0,80))}${sc.text.length>80?'...':''}</button>`;
              }).join('')}
              <button class="btn-small" style="font-size:12px;background:rgba(78,205,196,0.1)" onclick="document.getElementById('ai-clarify-input-${reqId}').focus()">✏️ 自定义</button>
            </div>
          </div>`
        : '';

      document.getElementById(`ai-clarify-actions-${reqId}`).innerHTML =
        `<div style="margin:12px 0;padding:12px;border:1px solid var(--red);border-radius:6px;background:rgba(255,107,107,0.06)">
          <div style="font-weight:bold;color:var(--red);margin-bottom:8px">🔍 AI 评审发现 ${review.issues.length} 个问题（评分 ${review.score}/5）</div>
          ${issuesHtml}
          ${suggestionsHtml}
          <div style="margin-top:10px;color:var(--text2);font-size:12px">选择上面的建议方案，或在下方输入澄清内容，解决后再提交审核</div>
          <div style="margin-top:8px">
            <input type="text" id="ai-clarify-input-${reqId}" placeholder="输入对评审问题的回复..." style="flex:1;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);width:calc(100% - 100px);margin-right:4px">
            <button class="btn-primary" onclick="sendAiClarify('${reqId}')">继续澄清</button>
          </div>
          <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px;text-align:center">
            <button class="btn-small" style="background:rgba(255,217,61,0.12);color:var(--accent3);border-color:rgba(255,217,61,0.3);font-size:12px" onclick="forceSubmitReview('${reqId}')">⏭ 忽略评审意见，直接提交审核</button>
            <div style="font-size:10px;color:var(--text3);margin-top:4px">AI 评审仅供参考，不阻塞流程</div>
          </div>
        </div>`;
      toast(`AI 评审未通过（${review.score}/5），请解决 ${review.issues.length} 个问题后重试`, 'error');
    } else {
      toast('提交失败: ' + e.message, 'error');
    }
  }
}


// ===== 忽略 AI 评审意见，直接提交 =====
async function forceSubmitReview(reqId) {
  if (!confirm('AI 评审发现的问题尚未解决，确认跳过评审直接提交审核？')) return;
  const actionsDiv = document.getElementById(`ai-clarify-actions-${reqId}`);
  if (actionsDiv) actionsDiv.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text2)">\u23f3 \u6b63\u5728\u8df3\u8fc7\u8bc4\u5ba1\u63d0\u4ea4...</div>';
  try {
    await api('POST', `/requirements/${reqId}/transition`, { targetStatus: 'review' });
    toast('\u5df2\u8df3\u8fc7 AI \u8bc4\u5ba1\uff0c\u9700\u6c42\u8fdb\u5165\u5f85\u5ba1\u6838\u72b6\u6001 \u2705', 'success');
    openRequirement(reqId); loadRequirements(); loadDashboard();
  } catch (e) {
    toast('\u63d0\u4ea4\u5931\u8d25: ' + (e.data?.message || e.message), 'error');
    openRequirement(reqId);
  }
}

// ===== 分段卡片式 MD 需求文档编辑器 =====
let _mdSections = {}; // reqId → [{title, content, original}]
let _pendingRefineContent = {}; // `${reqId}-${idx}` → AI 润色后内容

function parseMdSections(mdContent) {
  const lines = mdContent.split('\n');
  const sections = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(/^## (.+)$/);
    if (m) {
      if (current) sections.push(current);
      current = { title: m[1], content: line, lines: [line] };
    } else if (current) {
      current.lines.push(line);
      current.content += '\n' + line;
    } else {
      // 标题前的内容（前言）
      if (!sections.length || sections[0].title !== '') {
        sections.unshift({ title: '', content: line, lines: [line] });
      } else {
        sections[0].content += '\n' + line;
        sections[0].lines.push(line);
      }
    }
  }
  if (current) sections.push(current);
  return sections;
}

function reconstructMdDoc(reqId) {
  const sections = _mdSections[reqId];
  if (!sections) return '';
  return sections.map(s => s.content).join('\n');
}

async function generateMdDoc(reqId, modelId) {
  const srsDiv = document.getElementById(`ai-clarify-srs-${reqId}`);
  if (!srsDiv) return;

  srsDiv.innerHTML += '<div style="margin-top:12px;color:var(--text2)">⏳ 正在生成需求文档...</div>';
  try {
    const result = await api('POST', `/ai-tools/requirements/${reqId}/generate-doc`, { modelId });
    const mdContent = result.content || '';
    _mdSections[reqId] = parseMdSections(mdContent);
    renderSectionCards(reqId, modelId);
  } catch(e) {
    srsDiv.innerHTML += `<div style="color:var(--accent2);margin-top:8px">文档生成失败: ${escHtml(e.message)}</div>`;
  }
}

function renderSectionCards(reqId, modelId) {
  const srsDiv = document.getElementById(`ai-clarify-srs-${reqId}`);
  if (!srsDiv) return;
  const sections = _mdSections[reqId];
  if (!sections) return;

  const cardsHtml = sections.map((s, i) => {
    const titleDisplay = s.title ? escHtml(s.title) : '📄 前言';
    const contentPreview = s.content.length > 300 ? escHtml(s.content.substring(0, 300)) + '...' : escHtml(s.content);
    return `<div class="doc-section-card" style="margin:10px 0;padding:12px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:8px" data-section-idx="${i}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <strong style="font-size:14px;color:var(--text1)">${titleDisplay}</strong>
        <div style="display:flex;gap:4px">
          <button class="btn-small" style="background:rgba(100,149,237,0.12);color:#6495ED;font-size:11px" onclick="editSection('${reqId}',${i},'${modelId}')">✏️ 编辑</button>
          <button class="btn-small" style="background:rgba(78,205,196,0.12);color:var(--green);font-size:11px" onclick="refineSectionAI('${reqId}',${i},'${modelId}')">🤖 润色</button>
        </div>
      </div>
      <div id="section-content-${reqId}-${i}" class="section-content" style="font-size:13px;line-height:1.6;color:var(--text2);white-space:pre-wrap;max-height:200px;overflow-y:auto">${contentPreview}</div>
      <div id="section-edit-${reqId}-${i}" style="display:none;margin-top:8px"></div>
      <div id="section-refine-${reqId}-${i}" style="display:none;margin-top:8px"></div>
      <div id="section-status-${reqId}-${i}" style="margin-top:4px"></div>
    </div>`;
  }).join('');

  srsDiv.innerHTML = `
    <div style="margin-top:12px">
      <h4 style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span>📝 需求文档 — 分段编辑</span>
        <span style="font-size:12px;color:var(--text2);font-weight:normal">共 ${sections.length} 段 · 点击段落可展开编辑</span>
      </h4>
      <div id="md-section-cards-${reqId}">${cardsHtml}</div>
      <div id="section-consistency-${reqId}" style="margin-top:8px"></div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-accept" onclick="saveMdDoc('${reqId}')">💾 保存文档</button>
        <button class="btn-primary" onclick="submitAiSrs('${reqId}')">✅ 确认并提交审核</button>
        <button class="btn-small" style="background:rgba(255,217,61,0.12);color:var(--yellow);font-size:11px" onclick="showRawEditor('${reqId}')">📄 查看源码</button>
      </div>
      <div id="md-raw-${reqId}" style="display:none;margin-top:8px"></div>
    </div>`;
}

// ----- 手动编辑 -----
function editSection(reqId, idx, modelId) {
  const sections = _mdSections[reqId];
  if (!sections || !sections[idx]) return;
  const editDiv = document.getElementById(`section-edit-${reqId}-${idx}`);
  if (!editDiv) return;

  editDiv.style.display = 'block';
  editDiv.innerHTML = `
    <textarea id="section-edit-textarea-${reqId}-${idx}" style="width:100%;min-height:120px;background:var(--bg);color:var(--text);border:1px solid var(--accent);border-radius:6px;padding:10px;font-size:13px;font-family:monospace;resize:vertical">${escHtml(sections[idx].content)}</textarea>
    <div style="margin-top:6px;display:flex;gap:6px">
      <button class="btn-accept btn-sm" style="font-size:12px" onclick="saveSection('${reqId}',${idx},'${modelId}')">💾 保存这段</button>
      <button class="btn-back btn-sm" style="font-size:12px" onclick="cancelEditSection('${reqId}',${idx})">取消</button>
    </div>`;
}

async function saveSection(reqId, idx, modelId) {
  const sections = _mdSections[reqId];
  if (!sections || !sections[idx]) return;
  const ta = document.getElementById(`section-edit-textarea-${reqId}-${idx}`);
  if (!ta) return;
  const oldContent = sections[idx].content;
  const newContent = ta.value;
  if (newContent === oldContent) { cancelEditSection(reqId, idx); return; }

  sections[idx].original = sections[idx].original || oldContent;
  sections[idx].content = newContent;
  const fullDoc = reconstructMdDoc(reqId);

  // 刷新预览
  const contentDiv = document.getElementById(`section-content-${reqId}-${idx}`);
  if (contentDiv) {
    contentDiv.textContent = newContent.length > 300 ? newContent.substring(0, 300) + '...' : newContent;
  }
  cancelEditSection(reqId, idx);

  // 保存到服务端
  try {
    await Requirements.updateSrs(reqId, { description: fullDoc });
    toast('✅ 段落已保存', 'success');
  } catch(e) { toast('保存失败: ' + e.message, 'error'); }

  // 自动触发一致性检查
  checkConsistencyAfterEdit(reqId, idx, modelId, oldContent, newContent);
}

function cancelEditSection(reqId, idx) {
  const editDiv = document.getElementById(`section-edit-${reqId}-${idx}`);
  if (editDiv) editDiv.style.display = 'none';
}

// ===== 行内分段编辑（替代页面顶部的 renderMarkdown）=====
var _editMode = {}; // reqId → true/false

function parseMdBlocks(mdContent) {
  var lines = mdContent.split('\n');
  var blocks = [];
  var current = null;
  for (var li = 0; li < lines.length; li++) {
    var line = lines[li];
    var m = line.match(/^(#{2,4})\s+(.+)$/);
    if (m) {
      if (current) blocks.push(current);
      current = { level: m[1].length, title: m[2], content: line };
    } else if (current) {
      current.content += '\n' + line;
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function loadExistingMdEditor(reqId) {
  // v0.17e：用 reqId 锁定 md-content（之前 querySelector('.md-content') 拿 DOM 里第一个，
  //   切 REQ 后旧节点残留会错位渲染）
  var mdContentDiv = document.getElementById(`description-content-${reqId}`);
  if (!mdContentDiv) return;
  _editMode[reqId] = false;
  Requirements.get(reqId).then(function(req) {
    // v0.17e：fallback 到 req.description（之前只查 structured_description，整理流程永远空 → 编辑器不显示）
    var mdContent = req.structured_description || req.description || '';
    if (!mdContent || mdContent.length < 50) return;
    _mdSections[reqId] = parseMdBlocks(mdContent);

    // 收集可用模型列表（从 AI 面板或全量模型）
    var modelOpts = '';
    var sel = document.getElementById('ai-model-select-' + reqId);
    if (sel) {
      for (var mi = 0; mi < sel.options.length; mi++) {
        var o = sel.options[mi];
        if (o.value) modelOpts += '<option value="' + o.value + '">' + escHtml(o.text) + '</option>';
      }
    }
    // 如果 AI 面板没有模型列表，从 API 拉
    if (!modelOpts) {
      fetchModelsForInline(reqId);
    } else {
      _inlineModelOpts[reqId] = modelOpts;
    }

    renderInlineSections(reqId, mdContentDiv, req.status === 'clarifying');
  }).catch(function() {});
}

var _inlineModelOpts = {}; // reqId → HTML option 字符串

function fetchModelsForInline(reqId) {
  api('GET', '/models/active').then(function(models) {
    if (models && models.length) {
      _inlineModelOpts[reqId] = models.map(function(m) {
        return '<option value="' + m.id + '">' + escHtml(m.name) + '</option>';
      }).join('');
      // 如果已经渲染了，刷新底部工具栏
      var conDiv = document.getElementById('inline-consistency-' + reqId);
      if (conDiv) {
        var container = document.querySelector('.md-content');
        if (container) {
          var badge = document.querySelector('#detail-status .status-badge');
          var isClarifying = badge && (badge.textContent || '').indexOf('澄清') >= 0;
          renderInlineSections(reqId, container, isClarifying);
        }
      }
    }
  }).catch(function() {});
}

function renderInlineSections(reqId, container, isClarifying) {
  var blocks = _mdSections[reqId];
  if (!blocks) return;
  var editing = _editMode[reqId];

  var html = '';
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    var rendered = renderMarkdown(b.content);
    var marginLeft = ((b.level - 2) * 20) + 'px';

    // ✏️ 按钮放在 </hN> 之前（标题内部），float:right
    var editBtn = '<span class="sec-toolbar-' + reqId + '" style="' + (editing ? '' : 'display:none;') + 'float:right">' +
        '<button class="btn-small" style="font-size:10px;padding:0 5px;line-height:18px;background:rgba(100,149,237,0.12);color:#6495ED;border:none;cursor:pointer;border-radius:3px" onclick="editInlineBlock(\'' + reqId + '\',' + i + ')" title="编辑这段">✏️</button>' +
      '</span>';

    // 注入 ✏️ 到 </hN> 之前（float:right 使其靠右）
    var withToolbar = rendered.replace(
      /(<\/h[234]>)/,
      editBtn + '$1'
    );

    html += '<div class="inline-block" id="inline-block-' + reqId + '-' + i + '" style="margin-left:' + marginLeft + '">' +
      withToolbar +
      // 编辑面板紧跟在标题后（段落内容前）
      '<div id="inline-edit-' + reqId + '-' + i + '" style="display:none;margin:4px 0;padding:8px;background:var(--bg3);border:1px solid var(--accent);border-radius:6px"></div>' +
    '</div>';
  }

  // 底部工具栏
  html += '<div style="margin-top:16px;display:flex;gap:8px;align-items:center;padding:12px 0;border-top:1px solid var(--border)">' +
    '<button class="btn-small" style="background:rgba(100,149,237,0.12);color:#6495ED;font-size:12px" onclick="toggleEditMode(\'' + reqId + '\')">' + (editing ? '🔒 退出编辑' : '✏️ 编辑需求') + '</button>' +
    '<button class="btn-accept" onclick="saveInlineDoc(\'' + reqId + '\')">💾 保存文档</button>' +
    (isClarifying ? '<button class="btn-primary" onclick="submitAiSrs(\'' + reqId + '\')">✅ 确认并提交审核</button>' : '') +
    '<div id="inline-consistency-' + reqId + '" style="flex:1;font-size:12px"></div>' +
  '</div>';

  container.innerHTML = html;
}

function toggleEditMode(reqId) {
  _editMode[reqId] = !_editMode[reqId];
  var container = document.querySelector('.md-content');
  if (container) {
    var isClarifying = false;
    var badge = document.querySelector('#detail-status .status-badge');
    if (badge) isClarifying = (badge.textContent || '').indexOf('澄清') >= 0;
    renderInlineSections(reqId, container, isClarifying);
  }
}

// 编辑面板：textbox + AI 润色 + 保存/取消
function editInlineBlock(reqId, idx) {
  var blocks = _mdSections[reqId];
  if (!blocks || !blocks[idx]) return;
  var editDiv = document.getElementById('inline-edit-' + reqId + '-' + idx);
  if (!editDiv) return;

  var modelSel = document.getElementById('ai-model-select-' + reqId);
  var modelOpts = '';
  if (modelSel) {
    for (var mi = 0; mi < modelSel.options.length; mi++) {
      var o = modelSel.options[mi];
      if (o.value) modelOpts += '<option value="' + o.value + '">' + escHtml(o.text) + '</option>';
    }
  }
  // 如果 AI 面板没有模型列表，用页面加载时获取的模型列表
  if (!modelOpts && _inlineModelOpts[reqId]) {
    modelOpts = _inlineModelOpts[reqId];
  }

  editDiv.style.display = 'block';
  // 根据内容行数自动调整高度，确保尽量不滚动
  var lineCount = (blocks[idx].content || '').split('\n').length;
  var taHeight = Math.max(80, Math.min(lineCount * 20 + 30, 500));
  editDiv.innerHTML =
    '<textarea id="inline-ta-' + reqId + '-' + idx + '" style="width:100%;height:' + taHeight + 'px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:10px;font-size:13px;font-family:monospace;resize:vertical">' + escHtml(blocks[idx].content) + '</textarea>' +
    '<div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
      (modelOpts ?
        '<select id="inline-refine-model-' + reqId + '-' + idx + '" style="font-size:11px;padding:2px 4px;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:4px">' + modelOpts + '</select>' +
        '<input type="text" id="inline-refine-instr-' + reqId + '-' + idx + '" placeholder="润色指示（如：再详细点）" style="flex:1;min-width:120px;padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg3);color:var(--text);font-size:12px">' +
        '<button class="btn-small" style="background:rgba(78,205,196,0.12);color:var(--green);font-size:11px" onclick="doInlineRefine(\'' + reqId + '\',' + idx + ')">🤖 AI 润色</button>' : '') +
      '<button class="btn-accept btn-sm" style="font-size:12px" onclick="saveInlineBlock(\'' + reqId + '\',' + idx + ')">💾 保存</button>' +
      '<button class="btn-back btn-sm" style="font-size:12px" onclick="closeInlineEdit(\'' + reqId + '\',' + idx + ')">取消</button>' +
    '</div>' +
    '<div id="inline-cons-result-' + reqId + '-' + idx + '" style="margin-top:6px"></div>' +
    '<div id="inline-refine-result-' + reqId + '-' + idx + '" style="margin-top:4px"></div>';
}

function closeInlineEdit(reqId, idx) {
  var editDiv = document.getElementById('inline-edit-' + reqId + '-' + idx);
  if (editDiv) { editDiv.style.display = 'none'; editDiv.innerHTML = ''; }
  var resultDiv = document.getElementById('inline-refine-result-' + reqId + '-' + idx);
  if (resultDiv) resultDiv.innerHTML = '';
  var conDiv = document.getElementById('inline-cons-result-' + reqId + '-' + idx);
  if (conDiv) conDiv.innerHTML = '';
  // 关闭时刷新预览
  var container = document.querySelector('.md-content');
  if (container) {
    var isClarifying = false;
    var badge = document.querySelector('#detail-status .status-badge');
    if (badge) isClarifying = (badge.textContent || '').indexOf('澄清') >= 0;
    renderInlineSections(reqId, container, isClarifying);
  }
}

// AI 润色（编辑面板内调用）
function doInlineRefine(reqId, idx) {
  var blocks = _mdSections[reqId];
  if (!blocks || !blocks[idx]) return;
  var modelSel = document.getElementById('inline-refine-model-' + reqId + '-' + idx);
  var modelId = modelSel ? modelSel.value : '';
  if (!modelId) { toast('请选择模型', 'error'); return; }
  var instr = document.getElementById('inline-refine-instr-' + reqId + '-' + idx);
  var instrText = instr ? instr.value.trim() : '';
  if (!instrText) instrText = '保持原意优化表达，仅补充缺少的内容，不修改已有内容';
  var resultDiv = document.getElementById('inline-refine-result-' + reqId + '-' + idx);
  if (!resultDiv) return;

  resultDiv.innerHTML = '<div style="color:var(--text2);font-size:12px">⏳ AI 润色中...</div>';
  api('POST', '/ai-tools/requirements/' + reqId + '/refine-section', {
    modelId: modelId,
    sectionTitle: blocks[idx].title,
    sectionContent: blocks[idx].content,
    fullDoc: reconstructMdDoc(reqId),
    instruction: instrText
  }).then(function(result) {
    var newContent = (result.content || '').trim();
    _pendingRefineContent[reqId + '-' + idx] = newContent;
    resultDiv.innerHTML =
      '<div style="border:1px solid var(--green);border-radius:6px;padding:8px;margin-top:4px;background:var(--bg2)">' +
        '<div style="font-size:11px;color:var(--text2);margin-bottom:4px">🤖 AI 润色结果</div>' +
        '<div style="font-size:12px;white-space:pre-wrap;max-height:150px;overflow-y:auto;padding:6px;background:var(--bg);border-radius:4px">' + escHtml(newContent) + '</div>' +
        '<div style="margin-top:4px;display:flex;gap:6px">' +
          '<button class="btn-accept btn-sm" style="font-size:11px" onclick="acceptInlineRefine(\'' + reqId + '\',' + idx + ')">✅ 采纳（替换当前内容）</button>' +
          '<button class="btn-back btn-sm" style="font-size:11px" onclick="document.getElementById(\'inline-refine-result-' + reqId + '-' + idx + '\').innerHTML=\'\'">✕ 放弃</button>' +
        '</div></div>';
  }).catch(function(e) {
    resultDiv.innerHTML = '<div style="color:var(--accent2);font-size:12px">❌ 润色失败: ' + escHtml(e.message) + '</div>';
  });
}

function acceptInlineRefine(reqId, idx) {
  var newContent = _pendingRefineContent[reqId + '-' + idx];
  if (!newContent) return;
  delete _pendingRefineContent[reqId + '-' + idx];
  var ta = document.getElementById('inline-ta-' + reqId + '-' + idx);
  if (ta) ta.value = newContent;
  toast('✅ AI 结果已填入编辑框，请确认后保存', 'success');
}

function saveInlineBlock(reqId, idx) {
  var blocks = _mdSections[reqId];
  if (!blocks || !blocks[idx]) return;
  var ta = document.getElementById('inline-ta-' + reqId + '-' + idx);
  if (!ta) return;
  var newContent = ta.value;
  if (newContent === blocks[idx].content) { return; }

  // 获取模型 ID（优先级：编辑面板 → AI 面板 → 缓存列表 → 实时获取）
  function getModelId() {
    var sel = document.getElementById('inline-refine-model-' + reqId + '-' + idx);
    if (sel && sel.value) return sel.value;
    var aiSel = document.getElementById('ai-model-select-' + reqId);
    if (aiSel && aiSel.value) return aiSel.value;
    if (_inlineModelOpts[reqId]) {
      var m = _inlineModelOpts[reqId].match(/value="([^"]+)"/);
      if (m) return m[1];
    }
    return '';
  }

  var modelId = getModelId();
  var oldContent = blocks[idx].content;
  blocks[idx].content = newContent;

  var fullDoc = reconstructMdDoc(reqId);
  Requirements.updateSrs(reqId, { description: fullDoc }).then(function() {
    toast('✅ 已保存', 'success');
    // 如果有模型 ID，直接调用一致性检查
    if (modelId) {
      checkInlineConsistency(reqId, idx, modelId, oldContent, newContent);
    } else {
      // 尝试实时拉取模型列表
      api('GET', '/models/active').then(function(models) {
        if (models && models.length > 0) {
          _inlineModelOpts[reqId] = models.map(function(m) {
            return '<option value="' + m.id + '">' + escHtml(m.name) + '</option>';
          }).join('');
          checkInlineConsistency(reqId, idx, models[0].id, oldContent, newContent);
        }
      }).catch(function() {});
    }
  }).catch(function(e) { toast('保存失败: ' + e.message, 'error'); });
}

function saveInlineDoc(reqId) {
  var fullDoc = reconstructMdDoc(reqId);
  if (!fullDoc) return;
  Requirements.updateSrs(reqId, { description: fullDoc }).then(function() {
    toast('文档已保存 💾', 'success');
  }).catch(function(e) { toast('保存失败: ' + e.message, 'error'); });
}

// 一致性检查（结果写入编辑面板内部）
function checkInlineConsistency(reqId, idx, modelId, oldContent, newContent) {
  var blocks = _mdSections[reqId];
  if (!blocks || !blocks[idx]) return;
  // 优先写入编辑面板内的结果区域，其次底部一致性区域
  var conDiv = document.getElementById('inline-cons-result-' + reqId + '-' + idx);
  if (!conDiv) conDiv = document.getElementById('inline-consistency-' + reqId);
  if (!conDiv) return;

  conDiv.innerHTML = '<span style="color:var(--text2)">⏳ 检查关联章节...</span>';
  api('POST', '/ai-tools/requirements/' + reqId + '/check-consistency', {
    modelId: modelId, editedSection: blocks[idx].title || '前言',
    oldContent: oldContent, newContent: newContent, fullDoc: reconstructMdDoc(reqId)
  }).then(function(result) {
    var affected = result.affectedSections || [];
    var needsUpdate = affected.filter(function(s) { return s.status === 'needsUpdate'; });
    if (!needsUpdate.length) {
      conDiv.innerHTML = '<span style="color:var(--green)">✅ 一致性检查通过</span>';
      return;
    }
    conDiv.innerHTML = '<div style="border:1px solid var(--yellow);border-radius:6px;padding:8px;background:rgba(255,217,61,0.06)">' +
      '<div style="font-weight:bold;color:var(--yellow);font-size:12px;margin-bottom:4px">🔍 关联章节检查 — ' + needsUpdate.length + ' 处可能需要调整</div>' +
      needsUpdate.map(function(s, si) {
        // 找到对应段落的索引
        var targetIdx = -1;
        var allBlks = _mdSections[reqId] || [];
        for (var bi = 0; bi < allBlks.length; bi++) {
          if (allBlks[bi].title === s.section) { targetIdx = bi; break; }
        }
        var sugHtml = (s.suggestions || []).map(function(sg, sgi) {
          var cid = 'cs-' + reqId + '-' + si + '-' + sgi;
          return '<div style="display:flex;gap:4px;align-items:flex-start;padding:2px 0">' +
            '<input type="checkbox" id="' + cid + '" data-section-idx="' + targetIdx + '" data-section-title="' + escHtml(s.section) + '" style="margin-top:3px;flex-shrink:0">' +
            '<label for="' + cid + '" style="flex:1;font-size:12px;cursor:pointer">💡 ' + escHtml(sg) + '</label>' +
          '</div>';
        }).join('');
        return '<div style="margin-top:4px;font-size:12px;padding:6px 8px;background:var(--bg);border-radius:4px">' +
          '<div style="color:var(--yellow);font-weight:bold">📄 ' + escHtml(s.section) + '</div>' +
          '<div style="color:var(--text2);margin:2px 0">' + escHtml(s.reason || '') + '</div>' +
          sugHtml +
        '</div>';
      }).join('') +
      '<div style="margin-top:8px;display:flex;gap:6px">' +
        '<button class="btn-small" style="background:rgba(78,205,196,0.15);color:var(--green);font-size:12px" onclick="applyCheckedSuggestions(\'' + reqId + '\',\'' + modelId + '\')">🤖 应用选中的建议</button>' +
        '<span id="cs-count-' + reqId + '" style="font-size:12px;color:var(--text2);align-self:center">未选中</span>' +
      '</div>' +
    '</div>';
    // 动态更新选中计数
    var checkboxes = conDiv.querySelectorAll('input[type=checkbox]');
    for (var ci = 0; ci < checkboxes.length; ci++) {
      checkboxes[ci].addEventListener('change', function() {
        var count = conDiv.querySelectorAll('input[type=checkbox]:checked').length;
        var countEl = document.getElementById('cs-count-' + reqId);
        if (countEl) countEl.textContent = count > 0 ? '已选 ' + count + ' 条' : '未选中';
      });
    }
  }).catch(function() { conDiv.innerHTML = ''; });
}

// 批量应用选中的一致性检查建议
function applyCheckedSuggestions(reqId, modelId) {
  // 收集所有勾选的 checkbox（从整个 #detail-content 范围查找）
  var checkedInputs = document.querySelectorAll('#detail-content input[type=checkbox]:checked');
  if (!checkedInputs.length) { toast('请先勾选要应用的建议', 'error'); return; }

  // 按 sectionIdx 分组
  var groups = {};
  for (var ci = 0; ci < checkedInputs.length; ci++) {
    var inp = checkedInputs[ci];
    var idx = parseInt(inp.getAttribute('data-section-idx'));
    var title = inp.getAttribute('data-section-title') || '';
    var label = inp.nextElementSibling;
    var text = label ? label.textContent.replace(/^💡\s*/, '').trim() : '';
    if (idx >= 0 && text) {
      if (!groups[idx]) groups[idx] = { title: title, suggestions: [] };
      groups[idx].suggestions.push(text);
    }
  }

  var keys = Object.keys(groups);
  if (!keys.length) { toast('未找到可应用的段落', 'error'); return; }

  // 显示进度浮层
  var progDiv = document.createElement('div');
  progDiv.id = 'batch-progress';
  progDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:20px 28px;text-align:center;box-shadow:0 4px 30px rgba(0,0,0,0.5);min-width:280px';
  progDiv.innerHTML = '<div style="font-size:20px;margin-bottom:8px">⏳</div>' +
    '<div style="font-size:14px;color:var(--text1);margin-bottom:6px">正在批量应用建议...</div>' +
    '<div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden;margin:8px 0">' +
      '<div id="batch-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#4ecd, #6495ED);border-radius:3px;transition:width 0.3s"></div>' +
    '</div>' +
    '<div id="batch-progress-text" style="font-size:11px;color:var(--text2)">0/' + keys.length + ' 段</div>';
  document.body.appendChild(progDiv);

  var totalDone = 0;
  var totalErr = 0;
  var btn = document.querySelector('#detail-content button[onclick*="applyCheckedSuggestions"]');
  if (btn) btn.disabled = true;

  function updateProgress() {
    var bar = document.getElementById('batch-progress-bar');
    var txt = document.getElementById('batch-progress-text');
    if (bar) bar.style.width = ((totalDone + totalErr) / keys.length * 100) + '%';
    if (txt) txt.textContent = (totalDone + totalErr) + '/' + keys.length + ' 段' + (totalErr > 0 ? ' (' + totalErr + ' 失败)' : '');
  }

  function processNext(idxArr) {
    if (idxArr.length === 0) {
      if (btn) btn.disabled = false;
      var prog = document.getElementById('batch-progress');
      if (prog) prog.remove();
      if (totalErr > 0 && totalDone === 0) {
        toast('全部失败，请检查模型是否可用', 'error');
      } else if (totalErr > 0) {
        toast('已完成 ' + totalDone + ' 段，' + totalErr + ' 段失败', 'warning');
        // 部分成功也要保存
        var fullDoc = reconstructMdDoc(reqId);
        Requirements.updateSrs(reqId, { description: fullDoc });
      } else {
        // 全部成功：保存并刷新
        var fullDoc = reconstructMdDoc(reqId);
        Requirements.updateSrs(reqId, { description: fullDoc }).then(function() {
          toast('✅ ' + totalDone + ' 段已更新', 'success');
          var container = document.querySelector('.md-content');
          if (container) {
            var badge = document.querySelector('#detail-status .status-badge');
            var isClarifying = badge && (badge.textContent || '').indexOf('澄清') >= 0;
            renderInlineSections(reqId, container, isClarifying);
          }
        });
      }
      return;
    }
    var sectionIdx = parseInt(idxArr[0]);
    var group = groups[sectionIdx];
    var blocks = _mdSections[reqId];
    if (!blocks || !blocks[sectionIdx]) {
      totalErr++;
      updateProgress();
      processNext(idxArr.slice(1));
      return;
    }
    var instruction = '基于当前内容应用以下修改（逐条执行，不要遗漏）：\n' + group.suggestions.map(function(s, i) { return (i + 1) + '. ' + s; }).join('\n');

    api('POST', '/ai-tools/requirements/' + reqId + '/refine-section', {
      modelId: modelId,
      sectionTitle: group.title,
      sectionContent: blocks[sectionIdx].content,
      fullDoc: reconstructMdDoc(reqId),
      instruction: instruction
    }).then(function(result) {
      var newContent = (result.content || '').trim();
      if (newContent && _mdSections[reqId] && _mdSections[reqId][sectionIdx]) {
        _mdSections[reqId][sectionIdx].content = newContent;
        totalDone++;
      } else {
        totalErr++;
      }
      updateProgress();
      processNext(idxArr.slice(1));
    }).catch(function() {
      totalErr++;
      updateProgress();
      processNext(idxArr.slice(1));
    });
  }

  updateProgress();
  processNext(keys);
}

// ----- AI 润色 -----
function refineSectionAI(reqId, idx, modelId) {
  const sections = _mdSections[reqId];
  if (!sections || !sections[idx]) return;
  const refineDiv = document.getElementById(`section-refine-${reqId}-${idx}`);
  if (!refineDiv) return;

  refineDiv.style.display = 'block';
  refineDiv.innerHTML = `
    <div style="padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px">
      <div style="font-size:12px;color:var(--text2);margin-bottom:6px">🤖 AI 润色 — 输入修改指示</div>
      <div style="display:flex;gap:6px">
        <input type="text" id="refine-instruction-${reqId}-${idx}" placeholder="如：再详细一点、改成技术风格、精简表达..." style="flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:4px;background:var(--bg3);color:var(--text);font-size:13px">
        <button class="btn-primary btn-sm" style="font-size:12px" onclick="doRefineSection('${reqId}',${idx},'${modelId}')">🤖 润色</button>
        <button class="btn-back btn-sm" style="font-size:12px" onclick="cancelRefineSection('${reqId}',${idx})">取消</button>
      </div>
      <div id="refine-result-${reqId}-${idx}" style="margin-top:8px"></div>
    </div>`;
}

async function doRefineSection(reqId, idx, modelId) {
  const sections = _mdSections[reqId];
  if (!sections || !sections[idx]) return;
  const instruction = document.getElementById(`refine-instruction-${reqId}-${idx}`)?.value?.trim() || '保持原意优化表达，使其更清晰专业';
  const resultDiv = document.getElementById(`refine-result-${reqId}-${idx}`);
  if (!resultDiv) return;

  resultDiv.innerHTML = '<div style="color:var(--text2);font-size:12px">⏳ AI 正在润色...</div>';

  try {
    const result = await api('POST', `/ai-tools/requirements/${reqId}/refine-section`, {
      modelId, sectionTitle: sections[idx].title, sectionContent: sections[idx].content,
      fullDoc: reconstructMdDoc(reqId), instruction
    });
    const newContent = (result.content || '').trim();
    const key = reqId + '-' + idx;
    _pendingRefineContent[key] = newContent;

    resultDiv.innerHTML = `
      <div style="border:1px solid var(--green);border-radius:6px;padding:10px;margin-top:4px;background:var(--bg2)">
        <div style="font-size:11px;color:var(--text2);margin-bottom:4px">🤖 AI 润色结果 (${escHtml(result.modelUsed || '')})</div>
        <div style="font-size:13px;white-space:pre-wrap;max-height:200px;overflow-y:auto;padding:8px;background:var(--bg);border-radius:4px">${escHtml(newContent)}</div>
        <div style="margin-top:6px;display:flex;gap:6px">
          <button class="btn-accept btn-sm" style="font-size:12px" onclick="acceptRefine('${reqId}',${idx},'${modelId}')">✅ 采纳</button>
          <button class="btn-back btn-sm" style="font-size:12px" onclick="cancelRefineSection('${reqId}',${idx})">✕ 放弃</button>
        </div>
      </div>`;
  } catch(e) {
    resultDiv.innerHTML = `<div style="color:var(--accent2);font-size:12px">❌ 润色失败: ${escHtml(e.message)}</div>`;
  }
}

function acceptRefine(reqId, idx, modelId) {
  const sections = _mdSections[reqId];
  if (!sections || !sections[idx]) return;
  const key = reqId + '-' + idx;
  const newContent = _pendingRefineContent[key];
  if (!newContent) { toast('润色结果已过期，请重新润色', 'error'); return; }
  delete _pendingRefineContent[key];

  const oldContent = sections[idx].content;
  sections[idx].original = sections[idx].original || oldContent;
  sections[idx].content = newContent;
  const fullDoc = reconstructMdDoc(reqId);

  // 刷新预览
  const contentDiv = document.getElementById(`section-content-${reqId}-${idx}`);
  if (contentDiv) {
    contentDiv.textContent = newContent.length > 300 ? newContent.substring(0, 300) + '...' : newContent;
  }
  cancelRefineSection(reqId, idx);

  // 保存
  Requirements.updateSrs(reqId, { description: fullDoc }).then(() => {
    toast('✅ AI 润色已采纳', 'success');
  }).catch(e => { toast('保存失败: ' + e.message, 'error'); });

  // 一致性检查
  checkConsistencyAfterEdit(reqId, idx, modelId, oldContent, newContent);
}

function cancelRefineSection(reqId, idx) {
  const refineDiv = document.getElementById(`section-refine-${reqId}-${idx}`);
  if (refineDiv) refineDiv.style.display = 'none';
}

// ----- 一致性检查 -----
async function checkConsistencyAfterEdit(reqId, idx, modelId, oldContent, newContent) {
  const sections = _mdSections[reqId];
  if (!sections || !sections[idx]) return;
  const conDiv = document.getElementById(`section-consistency-${reqId}`);
  if (!conDiv) return;

  // 获取当前选中模型（回退到传入的 modelId）
  const sel = document.getElementById(`ai-model-select-${reqId}`);
  const activeModelId = modelId || (sel ? sel.value : '');
  if (!activeModelId) return;

  conDiv.innerHTML = '<div style="color:var(--text2);font-size:12px;padding:4px 0">⏳ 检查关联章节影响...</div>';

  try {
    const result = await api('POST', `/ai-tools/requirements/${reqId}/check-consistency`, {
      modelId: activeModelId, editedSection: sections[idx].title || '前言',
      oldContent, newContent, fullDoc: reconstructMdDoc(reqId)
    });
    renderConsistencyResults(reqId, result);
  } catch(e) {
    conDiv.innerHTML = '';
  }
}

function renderConsistencyResults(reqId, result) {
  const conDiv = document.getElementById(`section-consistency-${reqId}`);
  if (!conDiv) return;
  const sections = result.affectedSections || [];
  if (!sections.length) { conDiv.innerHTML = ''; return; }

  const needsUpdate = sections.filter(s => s.status === 'needsUpdate');
  if (!needsUpdate.length) {
    conDiv.innerHTML = '<div style="font-size:12px;color:var(--green);padding:6px 10px;background:rgba(78,205,196,0.08);border:1px solid rgba(78,205,196,0.2);border-radius:6px">✅ 一致性检查通过，其他章节无需调整</div>';
    return;
  }

  // 查找当前选中的模型
  const modelSel = document.getElementById(`ai-model-select-${reqId}`);
  const hasModel = modelSel && modelSel.value;

  conDiv.innerHTML = `<div style="border:1px solid var(--yellow);border-radius:8px;padding:12px;background:rgba(255,217,61,0.06)">
    <div style="font-weight:bold;color:var(--yellow);margin-bottom:8px;font-size:13px">🔍 关联章节检查 — ${needsUpdate.length} 处可能需要调整</div>
    ${needsUpdate.map(function(s) {
      var sectionIdx = -1;
      var allSecs = _mdSections[reqId] || [];
      for (var i = 0; i < allSecs.length; i++) {
        if (allSecs[i].title === s.section) { sectionIdx = i; break; }
      }
      var suggestionsHtml = (s.suggestions || []).map(function(sg, si) {
        var suggestionKey = 'cs-' + reqId + '-' + btoa(s.section).replace(/=/g,'') + '-' + si;
        return '<div style="padding:4px 0;display:flex;align-items:flex-start;gap:6px">' +
          '<span style="color:var(--text1);flex:1;font-size:12px">💡 ' + escHtml(sg) + '</span>' +
          '<div style="display:flex;gap:4px;flex-shrink:0">' +
            (hasModel ? '<button class="btn-small" style="background:rgba(78,205,196,0.12);color:var(--green);font-size:11px" onclick="applyConsistencySuggestion(\'' + reqId + '\',\'' + escHtml(s.section) + '\',' + sectionIdx + ',\'' + escHtml(sg) + '\',\'' + modelSel.value + '\')">🤖 AI 重写</button>' : '') +
            (sectionIdx >= 0 ? '<button class="btn-small" style="background:rgba(100,149,237,0.12);color:#6495ED;font-size:11px" onclick="jumpToSection(\'' + reqId + '\',' + sectionIdx + ',\'' + escHtml(sg) + '\')">✏️ 手动改</button>' : '') +
          '</div>' +
        '</div>';
      }).join('');
      return '<div style="margin-bottom:8px;padding:8px;background:var(--bg);border-radius:6px;font-size:12px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
          '<strong style="color:var(--text1)">📄 ' + escHtml(s.section) + '</strong>' +
          '<span style="color:var(--yellow);font-size:11px">建议关注</span>' +
        '</div>' +
        '<div style="color:var(--text2);margin-bottom:4px">' + escHtml(s.reason || '') + '</div>' +
        suggestionsHtml +
      '</div>';
    }).join('')}
  </div>`;
}

function applyConsistencySuggestion(reqId, sectionTitle, sectionIdx, suggestion, modelId) {
  if (sectionIdx < 0) { toast('未找到对应章节', 'error'); return; }
  var sections = _mdSections[reqId];
  if (!sections || !sections[sectionIdx]) { toast('章节数据不存在', 'error'); return; }

  var instruction = '请基于原内容，仅补充缺少的部分，不要修改已有内容。具体需要补充的内容：' + suggestion;
  var refineDiv = document.getElementById('section-refine-' + reqId + '-' + sectionIdx);

  // 自动打开润色面板并填入指令
  if (refineDiv) {
    refineSectionAI(reqId, sectionIdx, modelId);
    var instInput = document.getElementById('refine-instruction-' + reqId + '-' + sectionIdx);
    if (instInput) instInput.value = instruction;
    doRefineSection(reqId, sectionIdx, modelId);
  } else {
    // 没有润色面板（澄清流外的需求），通过 API 直接执行
    toast('⏳ AI 正在处理...', 'success');
    api('POST', '/ai-tools/requirements/' + reqId + '/refine-section', {
      modelId: modelId,
      sectionTitle: sectionTitle,
      sectionContent: sections[sectionIdx].content,
      fullDoc: reconstructMdDoc(reqId),
      instruction: instruction
    }).then(function(result) {
      var newContent = (result.content || '').trim();
      // 将结果存入 pending，类似润色流程的采纳按钮
      var key = reqId + '-' + sectionIdx;
      _pendingRefineContent[key] = newContent;
      // 显示预览供用户确认
      var refineDiv2 = document.getElementById('section-refine-' + reqId + '-' + sectionIdx);
      if (refineDiv2) {
        refineDiv2.style.display = 'block';
        refineDiv2.innerHTML =
          '<div style="border:1px solid var(--green);border-radius:6px;padding:10px;margin-top:4px;background:var(--bg2)">' +
          '<div style="font-size:11px;color:var(--text2);margin-bottom:4px">🤖 AI 补充结果 (' + escHtml(result.modelUsed || '') + ')</div>' +
          '<div style="font-size:13px;white-space:pre-wrap;max-height:200px;overflow-y:auto;padding:8px;background:var(--bg);border-radius:4px">' + escHtml(newContent) + '</div>' +
          '<div style="margin-top:6px;display:flex;gap:6px">' +
            '<button class="btn-accept btn-sm" style="font-size:12px" onclick="acceptRefine(\'' + reqId + '\',' + sectionIdx + ',\'' + modelId + '\')">✅ 采纳</button>' +
            '<button class="btn-back btn-sm" style="font-size:12px" onclick="cancelRefineSection(\'' + reqId + '\',' + sectionIdx + ')">✕ 放弃</button>' +
          '</div></div>';
      } else {
        // 连润色面板都没有 → 直接应用
        var oldContent = sections[sectionIdx].content;
        sections[sectionIdx].content = newContent;
        Requirements.updateSrs(reqId, { description: reconstructMdDoc(reqId) });
        toast('✅ 已采纳 AI 补充', 'success');
        loadExistingMdEditor(reqId);
      }
    }).catch(function(e) {
      toast('AI 处理失败: ' + e.message, 'error');
    });
  }
}

function jumpToSection(reqId, idx, suggestion) {
  var sections = _mdSections[reqId];
  if (!sections || !sections[idx]) return;
  // 在澄清流内的需求，使用澄清流的编辑面板
  var editDiv = document.getElementById('section-edit-' + reqId + '-' + idx);
  if (editDiv) {
    editSection(reqId, idx, '');
    var ta = document.getElementById('section-edit-textarea-' + reqId + '-' + idx);
    if (ta) {
      ta.value = ta.value + '\n\n' + suggestion;
      ta.focus();
      ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }
  // 在已有文档编辑器中，使用 existing 编辑面板
  var existingEditDiv = document.getElementById('existing-section-edit-' + reqId + '-' + idx);
  if (existingEditDiv) {
    editExistingSection(reqId, idx);
    var ta2 = document.getElementById('existing-section-textarea-' + reqId + '-' + idx);
    if (ta2) {
      ta2.value = ta2.value + '\n\n' + suggestion;
      ta2.focus();
      ta2.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

// ----- 源码查看（保底）-----
function showRawEditor(reqId) {
  const rawDiv = document.getElementById(`md-raw-${reqId}`);
  if (!rawDiv) return;
  const visible = rawDiv.style.display !== 'none';
  rawDiv.style.display = visible ? 'none' : 'block';
  if (!visible) {
    const fullDoc = reconstructMdDoc(reqId);
    rawDiv.innerHTML = `
      <textarea style="width:100%;min-height:250px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:12px;font-size:13px;font-family:monospace;resize:vertical">${escHtml(fullDoc)}</textarea>
      <div style="margin-top:6px;display:flex;gap:6px">
        <button class="btn-accept btn-sm" style="font-size:12px" onclick="saveRawEditor('${reqId}')">💾 保存源码</button>
        <button class="btn-back btn-sm" style="font-size:12px" onclick="document.getElementById('md-raw-${reqId}').style.display='none'">关闭</button>
      </div>`;
  }
}

function saveRawEditor(reqId) {
  const rawDiv = document.getElementById(`md-raw-${reqId}`);
  if (!rawDiv) return;
  const ta = rawDiv.querySelector('textarea');
  if (!ta) return;
  const mdContent = ta.value;
  _mdSections[reqId] = parseMdSections(mdContent);
  renderSectionCards(reqId, '');
  toast('✅ 源码已同步到分段编辑器', 'success');
}

// ----- 保存全部 -----
async function saveMdDoc(reqId) {
  const fullDoc = reconstructMdDoc(reqId);
  if (!fullDoc) return;
  try {
    await Requirements.updateSrs(reqId, { description: fullDoc });
    toast('文档已保存 💾', 'success');
  } catch(e) { toast('保存失败: '+e.message, 'error'); }
}

// ===== AI 智能任务分解面板 =====
function renderAiDecomposePanel(req) {
  return `<div class="decompose-panel">
    <h3>🤖 AI 智能任务分解</h3>
    <p style="font-size:13px;color:var(--text2);margin-bottom:12px">选择大模型，AI 将根据需求 SRS 自动分解任务（含设计说明和 Wiki 关联）</p>
    <div class="form-inline" style="margin-bottom:12px">
      <select id="ai-decompose-model-${req.id}" class="filter-select" style="flex:1">
        <option value="">选择大模型...</option>
      </select>
      <button class="btn-primary" onclick="aiDecompose('${req.id}')">🤖 AI 分解</button>
    </div>
    <div id="ai-decompose-result-${req.id}"></div>
  </div>`;
}

async function loadDecomposeModels(reqId) {
  try {
    const models = await api('GET', '/models/active');
    const sel = document.getElementById(`ai-decompose-model-${reqId}`);
    if (sel) sel.innerHTML = '<option value="">选择大模型...</option>' + models.map(m => `<option value="${m.id}">${escHtml(m.name)} (${m.model})</option>`).join('');
  } catch(e) {}
}

async function aiDecompose(reqId) {
  const modelId = document.getElementById(`ai-decompose-model-${reqId}`)?.value;
  if (!modelId) return toast('请先选择大模型', 'error');

  // ★ Guard: 检查是否已有任务，防止重复分解
  try {
    const req = await api('GET', '/requirements/' + reqId);
    const existingTasks = JSON.parse(req.task_ids || '[]');
    if (existingTasks.length > 0) {
      if (!confirm(`⚠ 该需求已有 ${existingTasks.length} 个任务。\n\nAI 分解会尝试「增量补充」而非重新创建整套，但仍可能生成少量重叠任务。\n\n确认继续分解吗？`)) {
        // 用户取消，恢复按钮UI
        const btn = document.querySelector(`[onclick="aiDecompose('${reqId}')"]`);
        if (btn) btn.disabled = false;
        const resultDiv = document.getElementById(`ai-decompose-result-${reqId}`);
        if (resultDiv) resultDiv.innerHTML = '<div style="color:var(--text2);padding:8px">已取消</div>';
        return;
      }
    }
  } catch(e) { /* 查询失败不阻塞，继续分解 */ }

  const resultDiv = document.getElementById(`ai-decompose-result-${reqId}`);
  resultDiv.innerHTML = '<div style="color:var(--text2);padding:12px">⏳ AI 正在分析需求并分解任务...</div>';

  try {
    const result = await api('POST', `/ai-tools/requirements/${reqId}/decompose-ai`, { modelId });
    resultDiv.innerHTML = `
      <div style="color:var(--green);margin-bottom:8px">✅ 已创建 ${result.count} 个任务 (${escHtml(result.modelUsed)})</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:12px">${escHtml(result.summary || '')}</div>
      ${(result.tasks || []).map(t => `
        <div class="agent-card" style="margin-bottom:6px">
          <div style="display:flex;justify-content:space-between">
            <strong>${escHtml(t.title)}</strong>
            <span style="font-size:12px;color:var(--text2)">${t.estimated_hours}h · ${t.type}</span>
          </div>
          ${t.description ? `<div style="font-size:12px;color:var(--text2);margin:4px 0">${escHtml(t.description).substring(0,200)}</div>` : ''}
          <div class="skills" style="margin-top:4px">
            ${Object.entries(t.required_skills || {}).map(([k,v]) => `<span class="skill-tag">${k}:${v}</span>`).join('')}
          </div>
          ${t.linked_wiki && JSON.parse(t.linked_wiki||'[]').length ? `<div style="font-size:11px;color:var(--text2)">📚 ${JSON.parse(t.linked_wiki).map(w=>w.page).join(', ')}</div>` : ''}
        </div>
      `).join('')}
      <div style="margin-top:12px">
        <button class="btn-primary" onclick="showWorkspaceView('kanban');refreshKanban('${reqId}');">📌 查看看板</button>
        <button class="btn-back" style="margin-left:8px" onclick="openRequirement('${reqId}')">刷新</button>
      </div>`;
    loadDashboard(); loadKanbanReqFilter();
  } catch(e) {
    resultDiv.innerHTML = `<div style="color:var(--accent2)">❌ ${escHtml(e.message)}</div>`;
  }
}

function continueAiClarify(reqId) {
  const el = document.getElementById(`ai-clarify-actions-${reqId}`);
  if (el) el.style.display = 'none';
  // 清除示意图，允许在新的澄清轮次重新生成
  const sketchesDiv = document.getElementById(`ai-clarify-sketches-${reqId}`);
  if (sketchesDiv) {
    sketchesDiv.innerHTML = '';
    delete sketchesDiv.dataset.generated;
  }
  document.getElementById(`ai-clarify-input-${reqId}`)?.focus();
}

// ===== 澄清记录弹窗 =====

function showClarifyThread(reqId) {
  if (document.getElementById('clarify-thread-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'clarify-thread-overlay';
  overlay.className = 'modal-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) closeClarifyThread(); };
  overlay.innerHTML = `
    <div class="modal-content" style="width:80vw;max-width:800px;max-height:80vh;display:flex;flex-direction:column">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0">💬 AI 澄清过程</h3>
        <button class="btn-small btn-reject" onclick="closeClarifyThread()">✕ 关闭</button>
      </div>
      <div id="clarify-thread-body" style="flex:1;overflow-y:auto;padding-right:8px">
        <div style="text-align:center;padding:20px;color:var(--text2)">⏳ 加载中...</div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  loadClarifyThread(reqId);
}

async function loadClarifyThread(reqId) {
  const body = document.getElementById('clarify-thread-body');
  if (!body) return;
  try {
    const req = await Requirements.get(reqId);
    const cls = req.clarifications || [];
    if (!cls.length) {
      body.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text2)">暂无澄清记录</div>';
      return;
    }
    body.innerHTML = cls.map(function(c) {
      const isUser = c.role === 'user';
      const roleLabel = isUser ? '👤 你' : '🤖 AI' + (c.agent_id && c.agent_id !== 'ai' ? ' (' + escHtml(c.agent_id) + ')' : '');
      const time = c.time ? new Date(c.time).toLocaleString() : '';
      return '<div style="margin-bottom:12px;padding:10px 14px;background:' + (isUser ? 'var(--bg3)' : 'var(--bg)') + ';border:1px solid var(--border);border-radius:8px">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:12px">' +
          '<strong style="color:' + (isUser ? 'var(--text1)' : 'var(--green)') + '">' + roleLabel + '</strong>' +
          '<span style="color:var(--text2)">' + time + '</span>' +
        '</div>' +
        '<div style="font-size:13px;line-height:1.5;white-space:pre-wrap">' + escHtml(c.content || '') + '</div>' +
      '</div>';
    }).join('');
    body.scrollTop = body.scrollHeight;
  } catch (e) {
    body.innerHTML = '<div style="text-align:center;padding:20px;color:var(--accent2)">❌ 加载失败: ' + escHtml(e.message) + '</div>';
  }
}

function closeClarifyThread() {
  const overlay = document.getElementById('clarify-thread-overlay');
  if (overlay) overlay.remove();
}

// ===== 需求拆分 =====

let splitProposalCache = {}; // reqId → last split proposal

async function openSplitPanel(reqId, suggestedChildren) {
  const panel = document.getElementById('split-panel');
  if (panel) { panel.remove(); return; }

  // 检查架构宪法是否已定义
  let hasArch = false;
  try {
    const req = await Requirements.get(reqId);
    if (req) {
      const archSpec = safeParse(req.arch_spec);
      hasArch = archSpec && (archSpec.domain || archSpec.technical || archSpec.decisions);
    }
  } catch (e) { /* 降级 */ }

  const container = document.getElementById('detail-content');
  const div = document.createElement('div');
  div.id = 'split-panel';
  div.className = 'split-panel';

  // 如果有 AI 建议的子需求，直接填充
  const initialChildren = suggestedChildren || [];

  div.innerHTML = `
    <h3>🔧 拆分子需求</h3>
    <p style="font-size:13px;color:var(--text2);margin-bottom:12px">将当前需求拆分为多个子需求，每个子需求独立走澄清→评审→分解流程</p>
    ${!hasArch ? '<div style="padding:8px;margin-bottom:8px;background:rgba(255,193,7,0.1);border:1px solid var(--yellow);border-radius:4px;font-size:12px;color:var(--yellow)">⚠️ 尚未定义架构宪法。建议先确认跨模块边界和技术决策。</div>' : ''}
    <div style="margin-bottom:10px">
      <button class="btn-primary btn-sm" onclick="generateSplitProposal('${reqId}')" id="split-gen-btn-${reqId}">🤖 AI 生成拆分方案</button>
      <span id="split-gen-status-${reqId}" style="font-size:12px;color:var(--text2);margin-left:8px"></span>
    </div>
    <div id="split-flow-map-${reqId}" style="margin-bottom:10px;display:none"></div>
    <div id="split-children-list">
      ${initialChildren.map((c, i) => `
        <div class="split-child-row" style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
          <input type="text" id="split-title-${i}" name="split-title-${i}" class="split-child-title" value="${escHtml(c.title || '')}" placeholder="子需求标题" style="flex:1">
          <input type="text" id="split-desc-${i}" name="split-desc-${i}" class="split-child-desc" value="${escHtml(c.description || '')}" placeholder="简要描述（可选）" style="flex:2">
          <button class="btn-small btn-reject" onclick="this.closest('.split-child-row').remove()" style="flex-shrink:0">✕</button>
        </div>
      `).join('')}
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn-small" onclick="addSplitChildRow()" style="background:rgba(78,205,196,0.1);color:var(--green)">+ 添加子需求</button>
      <button class="btn-primary" onclick="doSplit('${reqId}')">✅ 确认拆分</button>
      <button class="btn-back" onclick="document.getElementById('split-panel').remove()">取消</button>
    </div>
  `;
  container.appendChild(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function generateSplitProposal(reqId) {
  const btn = document.getElementById('split-gen-btn-' + reqId);
  const status = document.getElementById('split-gen-status-' + reqId);
  const flowDiv = document.getElementById('split-flow-map-' + reqId);
  const list = document.getElementById('split-children-list');

  btn.disabled = true;
  status.textContent = '⏳ AI 正在分析...';

  try {
    const proposal = await Requirements.splitProposal(reqId);
    splitProposalCache[reqId] = proposal;

    if (proposal.shouldSplit === false) {
      status.textContent = 'ℹ️ ' + (proposal.reason || '当前需求不需要拆分');
      btn.disabled = false;
      return;
    }

    // 显示流程地图
    if (proposal.flowMap && proposal.flowMap.length > 0) {
      flowDiv.style.display = 'block';
      flowDiv.innerHTML = `<div style="padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:12px">
        <strong style="color:var(--green)">🔄 用户流程地图</strong>
        <div style="margin-top:6px;font-family:monospace;color:var(--text1)">${escHtml(proposal.flowMap.join(' → '))}</div>
        ${proposal.shellAdded ? `<div style="margin-top:4px;color:var(--yellow)">🏗️ 自动创建: ${escHtml(proposal.shellAdded)}</div>` : ''}
        ${proposal.remainingParentScopeIn && proposal.remainingParentScopeIn.length > 0 ?
          `<div style="margin-top:4px;color:var(--text2)">📦 父需求保留: ${proposal.remainingParentScopeIn.map(s => escHtml(s)).join('、')}</div>` : ''}
      </div>`;
    }

    // 用 AI 建议的子需求替换列表
    const children = proposal.children || [];
    list.innerHTML = children.map((c, i) => {
      const scopeHint = (c.inheritedScopeIn || []).length > 0 ? '继承: ' + c.inheritedScopeIn.join('; ').substring(0, 80) : '';
      return `<div class="split-child-row" style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
        <input type="text" id="split-title-${i}" name="split-title-${i}" class="split-child-title" value="${escHtml(c.title || '')}" placeholder="子需求标题" style="flex:1">
        <input type="text" id="split-desc-${i}" name="split-desc-${i}" class="split-child-desc" value="${escHtml(c.description || scopeHint)}" placeholder="简要描述（可选）" style="flex:2">
        ${c.isShell ? '<span style="font-size:11px;color:var(--yellow);flex-shrink:0">🏗️外壳</span>' : ''}
        <button class="btn-small btn-reject" onclick="this.closest('.split-child-row').remove()" style="flex-shrink:0">✕</button>
      </div>`;
    }).join('');

    status.textContent = `✅ 建议拆分为 ${children.length} 个子需求（可编辑调整）`;
    btn.disabled = false;
    toast('AI 拆分方案已生成 ✅', 'success');
  } catch (e) {
    status.textContent = '❌ ' + e.message;
    btn.disabled = false;
  }
}

function addSplitChildRow() {
  const list = document.getElementById('split-children-list');
  if (!list) return;
  const idx = list.children.length;
  const row = document.createElement('div');
  row.className = 'split-child-row';
  row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center';
  row.innerHTML = `
    <input type="text" id="split-title-new-${idx}" name="split-title-new-${idx}" class="split-child-title" placeholder="子需求标题" style="flex:1">
    <input type="text" id="split-desc-new-${idx}" name="split-desc-new-${idx}" class="split-child-desc" placeholder="简要描述（可选）" style="flex:2">
    <button class="btn-small btn-reject" onclick="this.closest('.split-child-row').remove()" style="flex-shrink:0">✕</button>
  `;
  list.appendChild(row);
}

async function doSplit(reqId) {
  const rows = document.querySelectorAll('#split-children-list .split-child-row');
  const children = [];
  rows.forEach(row => {
    const title = row.querySelector('.split-child-title')?.value.trim();
    if (title) {
      children.push({
        title,
        description: row.querySelector('.split-child-desc')?.value.trim() || ''
      });
    }
  });
  if (!children.length) return toast('请至少添加一个子需求', 'error');
  try {
    const proposal = splitProposalCache[reqId] || null;
    const result = await Requirements.split(reqId, children, proposal);
    delete splitProposalCache[reqId];
    toast(`已创建 ${result.children.length} 个子需求 ✅`, 'success');
    document.getElementById('split-panel')?.remove();
    openRequirement(reqId);
    loadRequirements();
    loadDashboard();
  } catch (e) { toast('拆分失败: ' + e.message, 'error'); }
}

// ===== 父需求刷新 =====
async function refreshParent(reqId) {
  try {
    const report = await Requirements.refreshParent(reqId);
    const childrenHtml = report.childStatuses.map(c =>
      `<div style="display:flex;justify-content:space-between;padding:4px 8px;margin:2px 0;background:var(--bg);border-radius:4px;font-size:12px">
        <span>${escHtml(c.title)}</span>
        <span style="color:${c.status === 'done' ? 'var(--green)' : 'var(--yellow)'}">${c.status}</span>
      </div>`
    ).join('');

    const msg = `📊 父需求刷新完成
    · ${report.doneCount}/${report.childrenCount} 子需求已完成
    · 流程覆盖: ${report.flowCoverage}%
    · ${report.uncoveredParentScopeIn.length} 条父 scopeIn 未被任何子需求覆盖`;

    toast(msg.replace(/\n/g, ' '), report.flowCoverage < 100 ? 'warning' : 'success');

    // 如果有未覆盖的父 scopeIn，高亮提醒
    if (report.uncoveredParentScopeIn.length > 0) {
      const childrenDiv = document.getElementById('req-children');
      if (childrenDiv) {
        const warningDiv = document.createElement('div');
        warningDiv.style.cssText = 'padding:8px;margin-top:8px;background:rgba(255,193,7,0.1);border:1px solid var(--yellow);border-radius:4px;font-size:12px;color:var(--yellow)';
        warningDiv.innerHTML = `<strong>⚠️ 未覆盖的父需求范围:</strong><br>${report.uncoveredParentScopeIn.map(s => '· ' + escHtml(s)).join('<br>')}`;
        childrenDiv.appendChild(warningDiv);
      }
    }
  } catch (e) { toast('刷新失败: ' + e.message, 'error'); }
}

async function loadRequirementChildren(reqId) {
  try {
    const children = await Requirements.children(reqId);
    const progress = await Requirements.progress(reqId);
    const container = document.getElementById('req-children');
    if (!container) return;

    if (!children.length) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <div style="margin-bottom:8px">
        <strong>📦 子需求进度</strong>
        <span style="margin-left:8px;font-size:12px;color:var(--text2)">${progress.done}/${progress.total} 已完成</span>
        <div style="height:6px;background:var(--bg);border-radius:3px;margin-top:4px">
          <div style="height:100%;width:${progress.percent}%;background:var(--green);border-radius:3px;transition:width 0.3s"></div>
        </div>
      </div>
      ${children.map(c => `
        <div class="req-child-card" onclick="openRequirement('${c.id}')" style="cursor:pointer">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <span class="status-badge badge-${c.status}" style="font-size:10px;margin-right:6px">${App.statusLabels[c.status] || c.status}</span>
              <strong>${escHtml(c.title)}</strong>
            </div>
            <span style="font-size:11px;color:var(--text2)">${c.id}</span>
          </div>
        </div>
      `).join('')}
    `;
  } catch(e) {}
}

// ===== 导出需求为 Word =====
async function exportRequirement(reqId) {
  try {
    const res = await fetch(`/api/exports/requirement/${reqId}`, {
      headers: { 'X-API-Key': 'dev-key-001' }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '导出失败');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reqId}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('文档已下载 ✅', 'success');
  } catch (e) {
    toast('导出失败: ' + e.message, 'error');
  }
}

