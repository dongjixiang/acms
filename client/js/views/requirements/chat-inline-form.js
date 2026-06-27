// ACMS · 内联表单工具（v0.19，2026-06-27）
// 在聊天流中渲染表单卡片，取代 window.prompt 弹框
// 支持：多字段、提交→加载→结果展示
// 每个 leisure assist 使用此工具替换弹框

/**
 * 在聊天流中渲染一个内联表单卡片
 * @param {string} reqId - 需求 ID
 * @param {object} config - 表单配置
 * @param {string} config.icon - 图标，如 '🎵', '🎬', '🖼️'
 * @param {string} config.title - 卡片标题
 * @param {string} config.method - 辅助方法名（'music'|'video'|'image_gen'）
 * @param {Array} config.fields - 表单字段 [{ id, label, placeholder, type, options?, default? }]
 */
function renderInlineForm(reqId, config) {
  const stream = document.getElementById(`chat-stream-msgs-${reqId}`);
  if (!stream) return;

  const cardId = `inline-form-${reqId}-${Date.now()}`;
  const fieldsHtml = config.fields.map(f => {
    if (f.type === 'select') {
      const opts = (f.options || []).map(o =>
        `<option value="${escHtml(o)}"${o === (f.default || f.options[0]) ? ' selected' : ''}>${escHtml(o)}</option>`
      ).join('');
      return `<div class="form-group" style="margin-bottom:8px">
        <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:2px">${escHtml(f.label)}</label>
        <select id="${cardId}-${f.id}" style="width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px">${opts}</select>
      </div>`;
    }
    return `<div class="form-group" style="margin-bottom:8px">
      <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:2px">${escHtml(f.label)}</label>
      <input type="${f.type || 'text'}" id="${cardId}-${f.id}"
        placeholder="${escHtml(f.placeholder || '')}" value="${escHtml(f.default || '')}"
        style="width:100%;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;box-sizing:border-box">
    </div>`;
  }).join('');

  const html = `
    <div id="${cardId}" class="chat-inline-form" data-method="${config.method || ''}" style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;margin:6px 0">
      <div style="font-weight:600;font-size:14px;margin-bottom:10px">${config.icon} ${escHtml(config.title)}</div>
      ${fieldsHtml}
      <div style="display:flex;gap:6px;margin-top:4px">
        <button class="btn-small btn-primary" onclick="submitInlineForm('${cardId}','${reqId}')">🚀 生成</button>
        <button class="btn-small" onclick="dismissInlineForm('${cardId}')">取消</button>
      </div>
    </div>
  `;

  // 插入到聊天流末尾（但要在 typing dots 前面）
  const typing = stream.querySelector('.chat-typing');
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const card = temp.firstElementChild;
  if (typing) {
    stream.insertBefore(card, typing);
  } else {
    stream.appendChild(card);
  }
  // 滚到底
  stream.scrollTop = stream.scrollHeight;
  return cardId;
}

/**
 * 提交内联表单
 */
async function submitInlineForm(cardId, reqId) {
  const card = document.getElementById(cardId);
  if (!card) return;

  // 收集字段值
  const inputs = card.querySelectorAll('input, select');
  const values = {};
  inputs.forEach(el => {
    const key = el.id.replace(`${cardId}-`, '');
    values[key] = el.value.trim();
  });

  // 验证
  if (!values.prompt && !values.song) {
    toast('请填写描述内容', 'error');
    return;
  }

  // 获取 onSubmit 回调（挂在 card 上通过 data 属性传）
  const submitBtn = card.querySelector('.btn-primary');
  submitBtn.textContent = '⏳ 生成中…';
  submitBtn.disabled = true;

  try {
    // 根据 card 的 data-method 属性判断调哪个方法
    const method = card.dataset.method || '';
    if (method === 'video') {
      await chatAssist(reqId, 'video', {
        prompt: values.prompt,
        duration: parseFloat(values.duration) || 5,
        image_url: values.image_url || '',
      });
    } else if (method === 'image_gen') {
      await chatAssist(reqId, 'image_gen', {
        prompt: values.prompt,
        size: values.size || '1024x1024',
        image_url: values.image_url || '',
      });
    } else if (method === 'music') {
      await chatAssist(reqId, 'music', {
        song: values.song,
      });
    }

    // 表单提交成功 → 移除表单卡片（chatAssist 已自动插 loading 卡片 + SSE 流式结果）
    card.remove();
  } catch (e) {
    card.innerHTML = `<div class="chat-inline-form error" style="background:var(--bg2);border:1px solid #f55;border-radius:8px;padding:12px;margin:6px 0">
      <div style="text-align:center;padding:8px;color:#f55">❌ 失败：${escHtml(e.message || '未知错误')}</div>
      <div style="text-align:center;margin-top:4px"><button class="btn-small" onclick="this.closest('.chat-inline-form').remove()">关闭</button></div>
    </div>`;
  }
}

/**
 * 关闭内联表单
 */
function dismissInlineForm(cardId) {
  const card = document.getElementById(cardId);
  if (card) card.remove();
}

/**
 * 渲染视频生成表单
 */
function renderVideoForm(reqId) {
  renderInlineForm(reqId, {
    icon: '🎬', title: 'AI 视频生成', method: 'video',
    fields: [
      { id: 'prompt', label: '视频描述 *', placeholder: '例如：美女在海滩散步，夕阳暖光，电影质感', type: 'text' },
      { id: 'duration', label: '时长（秒）', placeholder: '默认 5 秒', type: 'number', default: '5' },
      { id: 'image_url', label: '参考图片 URL（可选，图生视频）', placeholder: '留空则文生视频', type: 'url' },
    ],
  });
}

/**
 * 渲染图片生成表单
 */
function renderImageForm(reqId) {
  renderInlineForm(reqId, {
    icon: '🖼️', title: 'AI 图片生成', method: 'image_gen',
    fields: [
      { id: 'prompt', label: '图片描述 *', placeholder: '例如：一只猫在海滩，数码插画风格', type: 'text' },
      { id: 'size', label: '尺寸', type: 'select', options: ['1024x1024', '1024x768', '768x1024', '1280x720', '720x1280'], default: '1024x1024' },
      { id: 'image_url', label: '参考图片 URL（可选，图生图）', placeholder: '留空则文生图', type: 'url' },
    ],
  });
}

/**
 * 渲染音乐播放表单
 */
function renderMusicForm(reqId) {
  renderInlineForm(reqId, {
    icon: '🎵', title: '音乐播放', method: 'music',
    fields: [
      { id: 'song', label: '歌曲名 *', placeholder: '输入你想听的歌名（中英文均可）', type: 'text' },
    ],
  });
}
