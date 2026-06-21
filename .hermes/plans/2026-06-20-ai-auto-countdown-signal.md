# v0.13 B5 续：AI 自动回复倒计时信号重写

## 背景

多多 6/20 反馈（auto-reply 仍有问题）：
1. 当 AI 刚开始第二次回复，倒计时立刻启动（应等回复真正结束）
2. 当第二次自动发送完成后，无论 AI 后面怎么返回，都不再自动回复

## 真因（已确认）

### Bug 1：polling 竞争窗口

`client/js/views/requirements.js:3489` 当前判定：
```js
if (brief && brief.status === 'done' && !streamingBubble) {
```

时间线：
- T0 后端 brief 完成 (status: done)
- T1 前端 SSE 收到首个 token → streamingBubble 显示

T0→T1 之间存在 100-500ms 窗口。后端已 done + 前端 streamingBubble 未建 → polling 误判「AI 完成」 → 倒计时提前启动。

### Bug 2：SSE error 不清理 streamingBubble

`connectStreamingBrief` L4101-4106：
```js
es.addEventListener('error', () => {
  es.close();
  if (streamingBubble?.dataset?.streaming !== 'done') {
    contentEl.textContent += '\n⚠️ 连接中断';  // ← 只追加文字
  }
});                                                  // ← 不改 className
```

SSE 中途断开 → bubble 仍带 `.chat-streaming-bubble` class → polling 每次都查到 streamingBubble → `!streamingBubble` 永远 false → 永远不启动倒计时 → auto 卡死。

## 修法

### A：SSE done 作为主信号（治 Bug 1）

在 SSE `data.type === 'done'` handler 末尾（L4092 `loadStreamAssist` 之后）插入：

```js
// v0.13 B5 fix: SSE done 是「AI 这一轮回复真正结束」的唯一可靠信号
//   取代 polling 的 brief.status==='done' && !streamingBubble 竞态检测
window._aiSseDone = window._aiSseDone || {};
const sseDoneRound = data.brief.chat_round || 0;
window._aiSseDone[reqId] = sseDoneRound;
if (_aiGetState(reqId) === 'auto'
    && sseDoneRound > (window._aiAutoLastRound[reqId] || 0)
    && !_aiAutoCountdowns[reqId]) {
  const input = document.getElementById(`chat-input-${reqId}`);
  if (input && !input.value.trim()) {
    console.log(`[ai-auto] ${reqId} SSE done 触发倒计时（round=${sseDoneRound}）`);
    toast('🤖 AI 提问完成 · 10 秒后自动回复 · 点 ↻ 跳过 / 选「关闭」停止', 'info', 4000);
    _aiStartAutoCountdown(reqId, sseDoneRound);
  }
}
```

polling L3494-3509 保留作为 SSE 失败的兜底（如果 SSE 连接建不起来，polling 仍能触发）。

### B：SSE error 拆掉 streamingBubble（治 Bug 2）

修改 error handler L4101-4106：

```js
es.addEventListener('error', () => {
  es.close();
  if (streamingBubble?.dataset?.streaming !== 'done') {
    contentEl.textContent += '\n⚠️ 连接中断';
    // v0.13 B5 fix: SSE 错误也算「AI 这一轮结束」（虽然失败）
    //   不然 streamingBubble 永远卡在 DOM → polling 永不启动倒计时 → auto 卡死
    streamingBubble.className = 'chat-bubble chat-bubble-ai chat-bubble-error';
    streamingBubble.dataset.streaming = 'done';
    window._aiSseDone = window._aiSseDone || {};
    window._aiSseDone[reqId] = _chatState[reqId]?.briefRound || 0;
  }
});
```

## 改的文件

- `client/js/views/requirements.js`（仅 1 个文件，2 处修改）

## 验证步骤

1. `node -c client/js/views/requirements.js` 语法检查
2. 重启 server（多多手动）
3. 浏览器硬刷（Cmd+Shift+R）
4. 复现脚本：
   - 启用 auto 模式
   - 等 AI 完成 round 1 → 观察倒计时是否在 SSE done 后才启动
   - 等 AI 完成 round 2 → 观察 round 3 倒计时是否正常启动
5. DevTools Network tab 模拟 SSE 断开（offline）→ 验证 error handler 触发后下一轮 auto 不卡死

## 不在本 plan 范围

- health_check loading 真因排查（之前挂着的）
- ACMS 2.0 tool-use spike
- 12 个 commit + deploy（封口 A/B/C）

## 风险点

- 触发倒计时的两个入口（SSE done + polling）可能短暂重叠 → SSE done 路径加 `_aiAutoCountdowns[reqId]` 检查，与 polling 互斥（_aiStartAutoCountdown L4514 已有 `if (_aiAutoCountdowns[reqId]) return;` 防御）
- SSE error 后兜底倒计时可能与真实 brief 倒计时竞争 → 加 round 比对，新 SSE done 来时自然覆盖