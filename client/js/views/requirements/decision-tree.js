// ===== Decision Tree 渲染（v0.13 抽公共，2026-06-21）=====
// 抽自 client/js/views/requirements.js（原 L2204-2336，133 行）
//
// 跨文件依赖（重要！）：
//   - api / escHtml / toast（全局）
//   - aiClarifyHistory（主文件，AI 澄清对话 section 定义）
//   - sendAiClarify（主文件，AI 澄清对话 section 定义）
//   - HTML 字符串引用是延迟触发（用户点 decision tree 卡片时），主文件已加载 → OK
//
// AI 在 strategy='decision_tree' 时输出 3 个互斥分支
// 用户点击卡片 = 选中预览；点击「✓ 确认采用这个方向」= 拼成自然语言回答 + 调 sendAiClarify 推进
// 注意：idea 阶段的决策树走 ACMSAssists 注册（client/js/views/assists/decision-tree.js）
// 需求阶段保留在主文件（走老架构：渲染到 #ai-clarify-choices-${reqId}，提交后调 sendAiClarify）

function renderDecisionTree(reqId, branches) {
  const choicesDiv = document.getElementById(`ai-clarify-choices-${reqId}`);
  if (!choicesDiv) return;

  if (!Array.isArray(branches) || branches.length === 0) {
    choicesDiv.innerHTML = '<div style="color:var(--text2);padding:8px">决策树数据为空，请直接在输入框中描述你的想法</div>';
    return;
  }

  // 渲染分支卡片（用 CSS class，无 inline style）
  const cards = branches.map((b, i) => {
    const label = b.label || `方向 ${String.fromCharCode(65 + i)}`;
    return `
    <div class="dt-branch" data-branch-idx="${i}">
      <div class="dt-branch-head">
        <span class="dt-branch-letter">${String.fromCharCode(65 + i)}</span>
        <span class="dt-branch-label">${escHtml(label)}</span>
      </div>
      <div class="dt-branch-desc">${escHtml(b.desc || '')}</div>
      ${b.examples ? `<div class="dt-branch-analogy">💡 ${escHtml(b.examples)}</div>` : ''}
      <div class="dt-proscons">
        ${b.pros ? `<div class="dt-pc dt-pc-pro"><span class="dt-pc-mark">+</span>${escHtml(b.pros)}</div>` : ''}
        ${b.cons ? `<div class="dt-pc dt-pc-con"><span class="dt-pc-mark">−</span>${escHtml(b.cons)}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  choicesDiv.innerHTML = `
    <div class="dt-block">
      <div class="dt-title">🌳 决策树 · 3 个互斥方向</div>
      <div class="dt-tree">${cards}</div>
      <div class="dt-footer">
        <span>点卡片切换选中 · 也可直接在输入框里补充自己的想法</span>
        <div class="dt-footer-actions">
          <button class="dt-btn" onclick="skipDecisionTree('${reqId}')">↩ 我想说点别的</button>
          <button class="dt-btn dt-btn-primary" id="dt-req-submit-${reqId}" disabled onclick="submitDecisionBranch('${reqId}')">✓ 确认采用这个方向</button>
        </div>
      </div>
    </div>
  `;

  // 卡片 click → 切换 selected + 启用提交按钮
  choicesDiv.querySelectorAll('.dt-branch').forEach(card => {
    card.addEventListener('click', () => {
      const wasSelected = card.classList.contains('selected');
      choicesDiv.querySelectorAll('.dt-branch').forEach(c => c.classList.remove('selected'));
      if (!wasSelected) {
        card.classList.add('selected');
        const submitBtn = document.getElementById(`dt-req-submit-${reqId}`);
        if (submitBtn) submitBtn.disabled = false;
      } else {
        const submitBtn = document.getElementById(`dt-req-submit-${reqId}`);
        if (submitBtn) submitBtn.disabled = true;
      }
    });
  });
}

// 提交：把分支信息拼成自然语言回答 → 写进 input → 调 sendAiClarify 推进
async function submitDecisionBranch(reqId) {
  const choicesDiv = document.getElementById(`ai-clarify-choices-${reqId}`);
  if (!choicesDiv) return;
  const selected = choicesDiv.querySelector('.dt-branch.selected');
  if (!selected) {
    toast('请先选一个方向', 'info', 1500);
    return;
  }
  const idx = parseInt(selected.dataset.branchIdx);

  // 拿当前轮 AI 回复里的 branches
  const last = (aiClarifyHistory[reqId] || []).filter(h => h.role === 'assistant').slice(-1)[0];
  const branches = last?.content?.branches || [];
  const b = branches[idx];
  if (!b) return;

  // 拼一句自然语言回答（保留原 pickDecisionBranch 行为）
  const parts = [];
  parts.push(`我倾向「${b.label}」方向`);
  if (b.desc) parts.push(`(${b.desc})`);
  if (b.examples) parts.push(`参考 ${b.examples} 的体验`);
  const input = document.getElementById(`ai-clarify-input-${reqId}`);
  const custom = input?.value?.trim();
  if (custom) parts.push(`补充：${custom}`);

  // 写进 input + 锁住卡片 + 禁用提交按钮（即时视觉反馈）
  if (input) {
    input.value = parts.join('，');
    input.focus();
  }
  choicesDiv.querySelectorAll('.dt-branch').forEach(c => {
    c.classList.remove('selected');
    c.style.cursor = 'default';
  });
  const submitBtn = document.getElementById(`dt-req-submit-${reqId}`);
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '✓ 已提交';
  }

  await sendAiClarify(reqId);
}

// 「我想说点别的」→ 提示用户直接在输入框里说（保留原 skipDecisionTree 行为）
function skipDecisionTree(reqId) {
  const input = document.getElementById(`ai-clarify-input-${reqId}`);
  if (input) {
    input.value = '';
    input.placeholder = '说说你的想法（不限方向，AI 会接着问）';
    input.focus();
  }
  toast('👉 直接在输入框里说你的想法，AI 会接着问', 'info', 2500);
}

// 兼容旧 onclick 引用：pickDecisionBranch(reqId, idx)
// 老 HTML 模板可能仍调用此名（chat-assist-layer 注入的旧模板），重定向到 submitDecisionBranch
async function pickDecisionBranch(reqId, idx) {
  // 先选中对应卡片
  const choicesDiv = document.getElementById(`ai-clarify-choices-${reqId}`);
  if (choicesDiv) {
    const card = choicesDiv.querySelector(`.dt-branch[data-branch-idx="${idx}"]`);
    if (card) {
      choicesDiv.querySelectorAll('.dt-branch').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    }
  }
  return await submitDecisionBranch(reqId);
}
