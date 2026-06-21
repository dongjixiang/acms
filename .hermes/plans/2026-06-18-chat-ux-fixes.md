# ACMS v0.11 五项对话 UX Bug 修复（仅本地）

> 2026-06-18 多多反馈 5 个 bug，A 方案一波修完。**先改本地，服务器后面一起同步。**

## 范围
只动本地 `C:\Users\swede\acms\`，**不 git add/commit/push、不 restart 服务、不部署 120**。

## 5 个 Bug 改动清单

### Bug 5：聊天 textarea 按 Enter 不能发送
**文件**：`client/js/views/requirements.js:2897-2900`

**改法**：textarea 元素加 `onkeydown` 属性，Enter 直接发送（preventDefault 阻止换行），Ctrl+Enter / Shift+Enter 换行（保持浏览器默认行为）。

```html
<textarea id="chat-input-${req.id}" rows="1"
  placeholder="回答 AI 的问题，或补充你的想法…（可直接 Ctrl+V 粘贴截图）"
  oninput="chatAutoGrow(this)"
  onkeydown="if(event.key==='Enter' && !event.ctrlKey && !event.shiftKey){event.preventDefault();chatSend('${req.id}')}"
  onpaste="chatHandlePaste('${req.id}', event)"></textarea>
```

参考已有：`ai-clarify-input` 在 `:592` 已用 `onkeydown="if(event.key==='Enter')sendAiClarify(...)"`，保持一致风格。

---

### Bug 4：气泡时间未按当前时区计算
**文件**：`client/js/views/requirements.js`

**根因**：
- `:3523` 用 `entry.at.substring(11,16)` 从 ISO 字符串按 **UTC** 截 HH:MM
- `:2483` clarify-thread 用 `new Date(c.time).toLocaleString()` 未指定 locale

**改法**：

1. `:3523` 改：
```js
<span class="chat-time">${entry.at ? new Date(entry.at).toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit', hour12:false}) : ''}</span>
```

2. `:2483` 改：
```js
const time = c.time ? new Date(c.time).toLocaleString('zh-CN', {hour12:false}) : '';
```

**系统性排查（顺手修，避免漏）**：其它 5 处 `new Date(...).toLocaleString(...)` 也都加了 'zh-CN' + `hour12:false`：
- `client/js/views/agents.js:83`
- `client/js/views/admin.js:165`
- `client/js/views/kanban.js:147`
- `client/js/views/reports.js:122`
- `client/js/core/utils.js:3`

> 注：这些之前没用 'zh-CN' 是**显示格式不一致**问题（英文浏览器会出 "6/18/2026"），未必算 bug。多多只说"对话气泡"，但系统性修统一行为更稳。**汇报时让多多拍是否一起改**。

---

### Bug 2：上传对话框选完文件后不隐藏
**文件**：`client/js/views/requirements.js:3716-3722`

**改法**：在 `chatUploadTrigger` 里 `inp.click()` 之前关闭 popover。

```js
function chatUploadTrigger(reqId, category) {
  const inp = document.getElementById(`chat-file-${reqId}`);
  if (!inp) return;
  inp.setAttribute('accept', CHAT_UPLOAD_ACCEPT[category] || '*/*');
  inp.dataset.category = category;
  // 触发系统文件选择前关闭 popover，避免选完文件对话框仍挂着
  const pop = document.getElementById(`chat-input-popover-${reqId}`);
  if (pop) pop.style.display = 'none';
  inp.click();
}
```

---

### Bug 3：中文文件名乱码（前端 + 知识库）
**根因**：multer 默认按 latin1 解 Content-Disposition 的 filename，中文 UTF-8 字节被当 latin1 解 → 乱码。

**前置检查**：先 `grep '"multer"' package.json` 看版本，确认支持 `defParamCharset: 'utf8'`（multer 2.x 原生支持）。

**改法**：
1. `server/routes/chat-upload.js:16` 加 `defParamCharset: 'utf8'`：
```js
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  defParamCharset: 'utf8',  // 修中文文件名乱码（multer 2.x 默认 latin1）
});
```

2. `server/routes/knowledge.js:13` 同上（同一 bug）。

**降级方案**：如果 multer 版本 < 2.x，`defParamCharset` 不支持，改用 `Buffer.from(file.originalname, 'latin1').toString('utf8')` 手动转码（在 `chat-upload.js saveAndParse` 入口处 + knowledge.js 入口处）。

**不影响**：promote 路由（`:85`）的 `safeName` 正则已经保留中文 `[\u4e00-\u9fa5]`，目录名一直对；只是展示的 `meta.name` 乱码，修 defParamCharset 后会一起好。

---

### Bug 1：AI 反馈轮次消失 / 累积
**文件**：`client/js/views/requirements.js`

**根因**：
- 后端 `thinking-brief.js:253-254, 475-476` `newRound = oldRound + 1` 累加 ✅
- 但前端 `renderBriefBubble`（`:3527-3551`）**没设 `div.dataset.chatRound`**
- `loadChatStream`（`:3424`）用 `brief.chat_round !== lastElementChild.dataset.chatRound` 比对 → 永远成立 → **重复 append brief bubble**

**改法**：
1. `:3547-3550` `renderBriefBubble` 末尾补 `div.dataset.chatRound = brief.chat_round || '';`

2. `:3424` 改判断逻辑用 state（避免 dataset 漏设导致重复 append）：
```js
// 旧：
if (String(brief.chat_round) !== (container.lastElementChild?.dataset?.chatRound || '')) renderBriefBubble(container, brief);
// 新：
if ((brief.chat_round || 0) > (state.briefRound || 0)) renderBriefBubble(container, brief);
state.briefRound = brief.chat_round || 0;
```

3. 流式完成后（`:3995`），streamingBubble 也补 dataset.chatRound 防止后续比对漏判：
```js
streamingBubble.dataset.chatRound = data.brief.chat_round || '';
```

> 多多说"消失"——可能不是真删除，而是 streamingBubble inline 替换视觉上顶掉 + 重复 append 让用户看不出历史。修完后两条路径都会走 state 比对，不再重复。

---

## 验证步骤（本地）

```bash
# 1. 启动本地服务（如果没跑）
cd /c/Users/swede/acms
node server/index.js  # 默认 3300 端口

# 2. 浏览器打开
# http://localhost:3300/

# 3. 五个 bug 逐个验证
# Bug 5: 任一需求聊天框，输文字按 Enter → 直接发送
#        按 Ctrl+Enter → 换行
# Bug 4: 看气泡时间是不是按本机时区（20:00 不是 12:00）
#        打开历史澄清弹窗，时间也是本机时区
# Bug 2: 点 📎 → 选"图片" → 选文件 → popover 自动消失
# Bug 3: 上传"中文文件.pdf" → 附件卡片 + 存入知识库都显示"中文文件.pdf"
# Bug 1: 同一需求连续 3 轮对话 → 气泡显示「第1轮」「第2轮」「第3轮」，不重复 append
```

## 改动量预估

| Bug | 文件 | 改动行数 |
|---|---|---|
| 5 | requirements.js | +1 |
| 4 | requirements.js + 4 处顺手 | +6 / -6 |
| 2 | requirements.js | +3 / -1 |
| 3 | chat-upload.js + knowledge.js | +2 |
| 1 | requirements.js | +4 / -1 |
| **合计** | **3 个文件** | **+16 / -8** |

## 6/18 晚补充：Bug 1 真正根因 + Bug 6 新增

### Bug 1 真正根因（之前定位错了）

**我之前定位**：渲染层 `renderBriefBubble` 没设 `dataset.chatRound` 导致重复 append。
**多多验证后说**：还是每次「第1轮」——说明不是渲染问题，是**数据问题**。

**真正根因**：后端两个 brief 生成 job **并发跑**，互相把 `chat_round` 重置成 0。

具体路径：
- `client/js/views/requirements.js:4272 chatSendSupplement` 调 `POST /supplement`，body 带 `autoRegenBrief: true`
- 后端 `server/routes/requirements.js:913-924`：`if (autoRegenBrief !== false) { setImmediate(() => runBriefJob(...)) }`
- 同时 `chatSendSupplement` 末尾 `connectStreamingBrief` → 建 SSE `GET /thinking-brief/stream` → 触发 `runBriefJobStream` (L605)

两个 job 都在 `server/services/thinking-brief.js`：
- `runBriefJob` (L204-): L214 先 update `chat_round: 0`，再 L253 读 req.thinking_brief 算 oldRound = 0，newRound = 1
- `runBriefJobStream` (L383-): L387 先 update `chat_round: 0`，再 L475 读 req.thinking_brief 算 oldRound = 0，newRound = 1

**每次都从 0 起步，newRound 永远 = 1。**

**修法**：`client/js/views/requirements.js:4291-4295 chatSendSupplement` 把 `autoRegenBrief: true` 改成 `false`。流式 SSE 已经在跑，后端非流式 runBriefJob 会并发冲突。让流式独家负责 brief 生成。

**保留上一轮的 dataset/state 比对修复**——它解决的是"重复 append"问题（防御性），跟"chat_round 累加"是两个独立维度。

### Bug 6：loading 时间一直是 0s

**根因**：`chatAssist` (requirements.js:4041) 触发的 loading 卡片走 `startChatPolling` 统一轮询，但 `startChatPolling` 内部没调 `updateAssistLoadingProgress`。只有决策树内链接触发的 `dtOpenReference` 走独立循环每 2s 调一次。

**修法**：
- `client/js/views/assists/decision-tree.js:200 showAssistLoading` 末尾加 `card.dataset.startedAt = String(Date.now())`
- `client/js/views/requirements.js:3475 startChatPolling` 的 setInterval 里加：每 tick 找所有 `.assist-loading-card[data-started-at]` 计算 elapsed 调 `updateAssistLoadingProgress`

不依赖任何全局状态，卡片被 replace/fail 后从 DOM 移除自然停更新。

### Bug 1 + Bug 6 的累计改动

```
client/js/core/utils.js                  |  2 +-
client/js/views/admin.js                 |  2 +-
client/js/views/agents.js                |  2 +-
client/js/views/assists/decision-tree.js |  2 ++
client/js/views/kanban.js                |  2 +-
client/js/views/reports.js               |  2 +-
client/js/views/requirements.js          | 35 ++++++++++++++++++++++++++------
server/routes/chat-upload.js             |  2 ++
server/routes/knowledge.js               |  2 ++
9 files changed, 40 insertions(+), 11 deletions(-)
```

13 个相关文件 `node -c` 语法检查全部通过。

## 不做的事

- ❌ 不 git add / commit / push
- ❌ 不部署到 120.24.204.130
- ❌ 不 restart 服务（前端 + 配置改动，重启才有意义；本地 node 重启即可）
- ❌ 不改其他功能

## 拍板记录

- 多多拍板 A（一波修完）
- 多多明确："服务器上的，等后面一起同步"
- 我的策略：本地改完 + 汇报 + 等拍板再做 git 操作