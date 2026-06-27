# Round 0: Chat 模式切换器（澄清 vs 自由对话）

> **Date**: 2026-06-27
> **Trigger**: 用户反馈 ACMS 的"对话式想法澄清"对"让 LLM 总结文件"场景不适用，需要一种通用对话模式
> **方案**: 在 chat 顶部加 mode chip，'clarify' | 'free'，后端按 mode 切 system prompt

---

## 现状（已验证）

### 用户痛点

用户上传文件后想让 LLM 总结，但 LLM 仍按"需求澄清"角色回复 → 答非所问。

### LLM prompt 调用链（v0.15 后）

```
chatSend(reqId)
  → chatBuildSupplementText(reqId, text)  // 拼附件内容到 user text
  → chatSendDetect(reqId, finalText)
  → POST /api/chat/detect-and-respond  { reqId, text }
    → buildIntentSystemPrompt(req)  // ← 当前 prompt 锁定为"需求澄清对话助手"
    → runToolLoop(...)  // LLM 用该 prompt + user text（含附件内容）
    → appendChatEntry(assistantEntry)
    → runBriefJob(reqId)  // brief 重生（澄清流）
```

**根因**：system prompt `buildIntentSystemPrompt` 把 LLM 锁定为"需求澄清助手"，看到附件也不会切到总结模式。

### 关键文件路径

| 文件 | 角色 |
|---|---|
| `server/routes/chat-intent.js` | LLM prompt 入口（`buildIntentSystemPrompt`，L23-59） |
| `server/services/thinking-brief.js` | brief 重生入口（`runBriefJob`，L214+） |
| `server/routes/requirements.js` L1043 | `POST /:id/supplement`（assist pick 后调，触发 brief） |
| `client/js/views/requirements/chat.js` L657 | `chatSend` → `chatSendDetect`（L693） |
| `client/js/views/requirements/chat.js` L636 | `chatBuildSupplementText`（附件拼到 message） |
| `client/js/views/requirements/idea-panel.js` L19 | `renderIdeaPanel`（chat 顶部入口） |
| `client/js/views/requirements/idea-panel.js` L90-98 | chat-extras 按钮行（澄清专用 7 个） |
| `client/js/views/requirements/ai-state.js` L16-67 | 已有 AI mode 切换器（off/draft/auto）的 UI pattern 参考 |
| `server/stores/requirement-store.js` L51 | `update(id, updates)` — 动态字段，无 schema 迁移 |
| `client/js/i18n/zh.json` | i18n 现状（顶层 key：`requirements.clarify` 等） |

### 现有 mode 切换 UI pattern（参考）

`ai-state.js` L16-67 已有 off/draft/auto 切换器实现：
- 全局状态对象 `_aiReplyState[reqId]`
- popover 选择器 + popover 关闭（document click + Esc）
- `_aiRenderBtn(reqId)` 同步 UI 状态
- toast 提示用户
- `_aiSetState` → `_aiRenderBtn` 双向

**chat-mode 切换器将复用此 pattern，但 chip 是常驻显示（不是 popover）**。

---

## 方案 B 设计

### 数据模型

- `requirement.chat_mode`: `'clarify' | 'free'`（默认 `'clarify'`，向后兼容）
- NeDB 风格动态字段，无需 schema 迁移
- 旧 req 缺字段 → 视为 `'clarify'`

### 后端改动

#### 1. `server/routes/chat-intent.js`

```js
function buildIntentSystemPrompt(req) {
  if (req.chat_mode === 'free') return buildFreeChatSystemPrompt(req);
  // 现有 clarify prompt 不变
}

function buildFreeChatSystemPrompt(req) {
  return `你是 ACMS 通用对话助手。基于用户消息 + 附件内容 + 简单需求上下文回答。

# 任务
- 用户可能在问问题、让你总结附件、解读内容、对比资料
- 优先基于附件/参考资料/对话历史回答
- 不要追问澄清需求
- 如果附件包含参考资料，结构化输出（Markdown 标题/列表/粗体）

# 回复要求
- Markdown 格式（### 标题、**粗体**、- 列表）
- 200-800 字（比澄清 prompt 略长，方便总结）
- 不要重复读需求标题/描述（用户已经知道）
- 信息不足直接说，不要反问澄清`;
}
```

**为什么只改一个文件**：v0.15 后 LLM 实际响应走 `detect-and-respond`，brief 只在 `runBriefJob` 走。

#### 2. `server/services/thinking-brief.js` + `server/routes/requirements.js`

`runBriefJob` 是 brief 重生入口。free 模式下：
- **不应触发 brief 重生**（避免澄清问题污染 chat 流）
- 由调用方判断：`runBriefJob(reqId, { skipIfFree: true })` 或在调用处 if 分支

调用点（已确认）：
- `chat-intent.js` L152-156：`detect-and-respond` 末尾 `setImmediate runBriefJob` → 加 `if (req.chat_mode !== 'free')`
- `requirements.js` L1069：`/supplement` 路由 `setImmediate runBriefJob` → 加 mode 判断

#### 3. `server/routes/requirements.js` 新路由

```js
// v0.18 切换聊天模式（clarify ↔ free）
router.post('/:id/chat-mode', (req, res, next) => {
  try {
    const { mode } = req.body || {};
    if (!['clarify', 'free'].includes(mode)) {
      return res.status(400).json({ error: 'INVALID_MODE' });
    }
    const reqRec = reqStore.getById(req.params.id);
    if (!reqRec) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
    if (reqRec.status !== 'idea') {
      return res.status(409).json({ error: 'ONLY_IDEA_STATUS' });
    }
    const updates = { chat_mode: mode };
    // 切到 free 时清空旧 brief（避免旧澄清问题污染 free 流）
    if (mode === 'free' && reqRec.thinking_brief) {
      updates.thinking_brief = null;
    }
    reqStore.update(req.params.id, updates);
    res.json({ ok: true, mode, clearedBrief: mode === 'free' });
  } catch (e) { next(e); }
});
```

### 前端改动

#### 4. `client/js/views/requirements/idea-panel.js`

加 mode chip 在 chat 顶部（替换/并排现有"💬 对话式想法澄清"标题）。

```html
<div class="insight-header">
  <span class="insight-title" id="chat-mode-title-${req.id}">💬 对话式想法澄清</span>
  <button class="chat-maximize-btn">⛶</button>
  <span class="chat-mode-chip chat-mode-${req.chat_mode || 'clarify'}"
        id="chat-mode-chip-${req.id}"
        onclick="toggleChatMode('${req.id}')"
        title="切换聊天模式">
    <span class="chat-mode-label">${modeLabel(req.chat_mode || 'clarify')}</span>
    <span class="chat-mode-icon">⇄</span>
  </span>
  <span class="insight-clarity-badge">${clarityBadge}</span>
</div>
```

`renderIdeaPanel` 末尾加按 mode 隐藏按钮行：

```js
const isFree = (req.chat_mode || 'clarify') === 'free';
const extrasHtml = isFree ? '' : `
  <div class="chat-extras">
    <button onclick="chatAssist('${req.id}', 'decision_tree')">🌳 决策树</button>
    ...
    <button onclick="chatDone('${req.id}')" style="...">✅ 够了</button>
  </div>`;
```

但 idea-panel 是渲染时一次性的，**mode 切换需要重渲染**或显式 hide/show。后者更轻：

- 在 `toggleChatMode` 里：`document.querySelectorAll('#idea-panel-${id} .chat-extras').forEach(el => el.style.display = isFree ? 'none' : 'flex');`

#### 5. 新文件 `client/js/views/requirements/chat-mode.js`

```js
async function toggleChatMode(reqId) {
  const cur = getChatMode(reqId);
  const next = cur === 'clarify' ? 'free' : 'clarify';
  try {
    const r = await api('POST', `/requirements/${reqId}/chat-mode`, { mode: next });
    if (r.error) { toast('切换失败: ' + r.error, 'error'); return; }
    window._chatMode = window._chatMode || {};
    window._chatMode[reqId] = next;
    // 切换时清空旧 chat 流（free → 没旧澄清气泡；clarify → free 没旧自由气泡）
    // 注：不清空 supplement_history（用户和 AI 历史可保留，但 free 下不再用）
    const c = document.getElementById(`chat-stream-msgs-${reqId}`);
    if (c) {
      c.innerHTML = '<div class="chat-typing"><span></span><span></span><span></span></div>';
      // 重新拉空状态（brief 已被清空，supplement_history 不变）
    }
    // 同步 UI
    renderChatModeUI(reqId, next);
    // 切到 free 时清掉 assist 卡片（决策树/场景等不能再用）
    if (next === 'free') {
      c?.querySelectorAll('.chat-assist-layer').forEach(el => el.remove());
    }
    toast(`已切换到 ${next === 'free' ? '💬 自由对话' : '🎯 想法澄清'} 模式`, 'info', 2500);
  } catch (e) { toast('切换失败: ' + e.message, 'error'); }
}

function getChatMode(reqId) {
  return window._chatMode?.[reqId] || 'clarify';
}

function renderChatModeUI(reqId, mode) {
  const chip = document.getElementById(`chat-mode-chip-${reqId}`);
  const title = document.getElementById(`chat-mode-title-${reqId}`);
  const extras = document.querySelectorAll(`#idea-panel-${reqId} .chat-extras`);
  if (chip) {
    chip.classList.toggle('chat-mode-clarify', mode === 'clarify');
    chip.classList.toggle('chat-mode-free', mode === 'free');
    chip.querySelector('.chat-mode-label').textContent = mode === 'free' ? '💬 自由对话' : '🎯 想法澄清';
    chip.title = mode === 'free' ? '当前：自由对话 · 点切回想法澄清' : '当前：想法澄清 · 点切到自由对话';
  }
  if (title) {
    title.textContent = mode === 'free' ? '💬 自由对话' : '💬 对话式想法澄清';
  }
  extras.forEach(el => el.style.display = mode === 'free' ? 'none' : 'flex');
}
```

#### 6. i18n 文案

`client/js/i18n/zh.json` 加：
```json
"requirements": {
  ...
  "chatMode": {
    "clarify": "想法澄清",
    "free": "自由对话",
    "clarifyHint": "AI 引导你理清需求 · 问澄清问题",
    "freeHint": "通用问答 · 附件总结 · 不整理需求",
    "toggle": "切换聊天模式",
    "switchedFree": "已切换到 💬 自由对话 · LLM 将基于附件/参考资料回答",
    "switchedClarify": "已切换到 🎯 想法澄清 · LLM 会问澄清问题"
  }
}
```

`en.json` 同 key。

#### 7. `client/index.html`

加载 chat-mode.js（在 idea-panel.js 之后）。

#### 8. `client/css/style.css`

```css
.chat-mode-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 10px; border-radius: 10px;
  background: var(--bg2); cursor: pointer; user-select: none;
  font-size: 12px; border: 1px solid var(--border);
}
.chat-mode-chip:hover { background: var(--bg3); }
.chat-mode-clarify { color: var(--accent); border-color: rgba(...); }
.chat-mode-free    { color: var(--accent2); border-color: rgba(...); }
.chat-mode-icon { opacity: 0.6; font-size: 11px; }
```

---

## Round 1 实施清单（按文件）

### 后端（4 文件）

1. `server/routes/chat-intent.js`
   - L23-59 `buildIntentSystemPrompt` 加 `chat_mode === 'free'` 分支
   - 加 `buildFreeChatSystemPrompt(req)`
   - L153 `setImmediate runBriefJob` 加 `if (req.chat_mode !== 'free')` 判断

2. `server/services/thinking-brief.js`
   - 不改行为，只接受 chatMode 透传（**或** 不改，看调用方判断）

3. `server/routes/requirements.js`
   - L1069 `setImmediate runBriefJob` 加 mode 判断
   - 新增 `POST /:id/chat-mode` 路由（约 L1130 后）

4. （无）`server/app.js` 不动，新路由在 requirements.js 内已挂载

### 前端（5 文件）

5. `client/js/views/requirements/chat-mode.js`（新文件，~50 行）
6. `client/js/views/requirements/idea-panel.js`
   - 加 chip + 按 mode 隐藏 chat-extras
   - renderIdeaPanel 顶部加 chat-mode-chip
7. `client/index.html` — 加载 chat-mode.js
8. `client/css/style.css` — chip 样式（~20 行）
9. `client/js/i18n/zh.json` + `en.json` — 各加 6 行

---

## 风险与防退化

| 风险 | 缓解 |
|---|---|
| 旧 REQ 无 chat_mode 字段 | reqStore 读 undefined → 默认 'clarify'，行为不变 |
| mode 切换丢历史 | **保留** supplement_history（user/assistant 历史），仅清空 DOM 视图；切回原模式历史还在 |
| mode 切换后 assist 卡片残留 | free 模式下 `chat-assist-layer` 全部隐藏（DOM 还在但 display:none + chip 提示） |
| brief 切到 free 时被清空 | 用户主动切，已 toast 告知"已切换" |
| LLM 行为漂移 | free prompt 强调"不要追问澄清需求"，提供强约束 |
| 路由改完 404 | **必跑 `node scripts/verify-route-registration.js` 验证**（acms-assist-framework skill SOP） |

---

## 验收清单（多多浏览器手测）

1. 打开任意 REQ → 顶部 chip 显示"🎯 想法澄清"（默认）
2. 点 chip → 切到"💬 自由对话" + toast 提示 + chat-extras 按钮行消失 + 标题改
3. 上传 PDF → 输入"总结一下" → LLM 给出 Markdown 结构化总结（不是问澄清）
4. 再点 chip → 切回"🎯 想法澄清" → 上传 PDF + 问"总结" → LLM 仍追问澄清需求（旧行为不变）
5. 切换 mode 时 console 无 404，无 js error
6. 旧 REQ（无 chat_mode 字段）打开仍走澄清（向后兼容）

---

## 不做（明确范围控制）

- ❌ chat-extras 按钮的 persist（每次刷新仍按 mode 显示）
- ❌ 自由对话模式下的"导出 Word"（chatExportWord 是导出 AI 回复，不区分模式，free 模式下也能用 — **自动可用**）
- ❌ 自由对话模式的 assist 体系（如新加"总结"按钮 — 由 mode 切换器本身覆盖）
- ❌ mode 历史记录（用户切了几次、切到哪个，记 toast 即可）
- ❌ admin 端 mode 默认值配置（前端默认值 'clarify' 硬编码足够）
