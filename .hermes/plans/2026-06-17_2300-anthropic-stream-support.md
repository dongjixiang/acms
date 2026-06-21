# 给 anthropic-messages API 路径补流式输出（含 thinking_delta 折叠区）

## 背景

当前默认生成模型 `MiniMax-M3.0`（model_mp9u94rq）走 `anthropic-messages` API，
但 `callLLMStream` 对非 openai-chat 路径直接降级为非流式（llm-adapter.js:241-246），
所以 SSE 端点拿不到任何 token，前端看起来"非流式"——一次性铺满。

MiniMax 网关实测：完全兼容 Anthropic SSE 协议（`event:` + `data:` 双行格式）。
M3 capability 含 `extended-thinking`，可能触发 `thinking_delta` 事件。

**用户拍板走 B 方案**：text 流到正文，thinking 单独流到「💭 思考中」折叠区。

## Anthropic 流式协议要点（避免踩坑）

- 请求：`POST /v1/messages`，body 加 `"stream": true`
- 响应：`Content-Type: text/event-stream`，多行 SSE event
- 事件类型：
  - `message_start` — 开始（带 message id/model/usage.input_tokens）
  - `content_block_start` — 内容块开始（type=index）
  - `content_block_delta` — 增量文本，`event.delta.text` 是片段
  - `content_block_stop` — 块结束
  - `message_delta` — 消息级 delta（含 stop_reason、usage.output_tokens）
  - `message_stop` — 结束
  - `ping` / `error` — 噪音/错误
- **真正的 token 文本在 `content_block_delta.delta.text`**，其他事件可以忽略

## 改动范围（3 个文件）

### 后端：`server/services/llm-adapter.js`

#### 1. 新增 `callAnthropicStream` 函数

- 在 `callAnthropic` 旁边新增 `callAnthropicStream(model, messages, opts, apiKey)`
- 复用 `callAnthropic` 的 system/chat 拆分逻辑（不重复）
- 请求：同 `callAnthropic` + body 加 `"stream": true`，复用 AbortController
- 响应处理：
  - `resp.body.getReader()` + `TextDecoder` 逐 chunk 读
  - 用 `\n` 切分 SSE event（event 行 + data 行配对，跨 chunk 用 buffer 缓冲不完整行）
  - `event: content_block_delta` → 解析 `delta.type`：
    - `text_delta` → yield `{ type:'token', text: delta.text }`
    - `thinking_delta` → yield `{ type:'thinking', text: delta.thinking }`
  - 跳过 `message_start` / `content_block_start` / `content_block_stop` / `ping`
  - `event: message_delta` → 抓 `usage.output_tokens`（最终统计）
  - `event: message_stop` → 跳出循环
  - `event: error` → yield `{ type:'error', message }`
- async generator yield 三种类型：`token` / `thinking` / `done`

#### 2. `callLLMStream` 分支判断改造（llm-adapter.js:240-246）

当前：
```js
if (api !== 'openai-chat') {
  // 非 OpenAI 兼容 API 降级为非流式
  const result = await callLLM(modelId, messages, options);
  yield { type: 'done', content: result.content, usage: result.usage };
  return;
}
```

改为：
```js
if (api === 'openai-chat') {
  yield* callOpenAIStream(...);   // 抽出原 openai-chat 逻辑成独立函数
} else if (api === 'anthropic-messages') {
  yield* callAnthropicStream(...);
} else {
  // 未知 API 类型，保留降级路径
  const result = await callLLM(modelId, messages, options);
  yield { type: 'done', content: result.content, usage: result.usage };
}
```

#### 3. 重构：抽出 `callOpenAIStream`

为保持代码对称，把 llm-adapter.js:248-308 现有 openai-chat 流式逻辑抽成
独立函数 `callOpenAIStream`，由 `callLLMStream` 用 `yield*` 委托。
**纯重构，行为不变**——这是为 anthropic 路径做对照样板。

### 后端：`server/services/thinking-brief.js`

#### 4. `runBriefJobStream` 处理 `thinking` 事件（line 456-471）

当前：
```js
for await (const event of callLLMStream(...)) {
  if (event.type === 'token') {
    fullContent += event.text;
    yield { type: 'token', text: event.text };
  } else if (event.type === 'done') {
    // 解析 + fallback
  }
}
```

改为：
```js
for await (const event of callLLMStream(...)) {
  if (event.type === 'token') {
    fullContent += event.text;          // 累加正文，供 JSON 解析用
    yield { type: 'token', text: event.text };
  } else if (event.type === 'thinking') {
    yield { type: 'thinking', text: event.text };  // 只转发，不累加（避免污染 JSON）
  } else if (event.type === 'done') {
    // 不变
  }
}
```

**关键**：thinking 不进 `fullContent`，否则模型在思考里提一句 JSON 模板会污染解析。

### 前端：`client/js/views/requirements.js`

#### 5. `connectStreamingBrief` 改 SSE handler + 创建 thinking 区（line 3957）

**(a) 创建 streaming 气泡时加 thinking 区（line 3963）**

当前：
```js
streamingBubble.innerHTML = '<div class="chat-bubble-meta">...</div><div class="chat-streaming-content"></div>';
```

改为：
```js
streamingBubble.innerHTML = `
  <div class="chat-bubble-meta">
    <span class="chat-label">🤖 AI</span>
    <span class="chat-thinking-btn" onclick="toggleChatThinking(this)" style="opacity:0.5">💭</span>
  </div>
  <div class="chat-thinking" style="display:none">
    <div class="chat-thinking-inner"></div>
  </div>
  <div class="chat-streaming-content"></div>
`;
```
- `display:none` 默认折叠，不抢戏
- 💭 按钮 opacity 0.5 灰显，知道可点

**(b) SSE handler 增加 `thinking` 分支（line 3975 附近）**

```js
es.addEventListener('message', (e) => {
  const data = JSON.parse(e.data);
  if (data.type === 'thinking') {
    // 追加到 thinking 区
    const thinkInner = streamingBubble.querySelector('.chat-thinking-inner');
    if (thinkInner) {
      thinkInner.textContent += data.text;
      // 第一次出现 thinking → 自动展开（让用户知道在思考）
      const thinkBlock = streamingBubble.querySelector('.chat-thinking');
      if (thinkBlock && thinkBlock.style.display === 'none') {
        thinkBlock.style.display = 'block';
        const btn = streamingBubble.querySelector('.chat-thinking-btn');
        if (btn) btn.style.opacity = '1';
      }
      chatScrollToBottom(container);
    }
  } else if (data.type === 'token') {
    // 现有逻辑不变
    contentEl.textContent += data.text;
    chatScrollToBottom(container);
  } else if (data.type === 'done' && data.brief) {
    // ★ 新增：把流式 thinking 内容带到 done 后的气泡（否则整 innerHTML 重写就丢了）
    const streamedThinking = streamingBubble.querySelector('.chat-thinking-inner')?.textContent || '';
    es.close();
    // ... 现有逻辑 ...
    const thinkingHtml = streamedThinking
      ? `<div class="chat-thinking" style="display:none"><div class="chat-thinking-inner">${escHtml(streamedThinking)}</div></div>`
      : (data.brief.ai_understanding
          ? `<div class="chat-thinking" style="display:none"><div class="chat-thinking-inner">${renderMarkdown(data.brief.ai_understanding)}</div></div>`
          : '');
    // ...
  }
});
```

**(c) done 时 meta 行也要带 💭 按钮**（line 3996 现有逻辑已带，复用）

### CSS

**不动**。`.chat-thinking`、`.chat-thinking-inner`、`.chat-thinking-btn` 样式都现成
（style.css:1989-2021）。

## 文件改动清单

| 文件 | 改动类型 | 改动量 |
|------|---------|--------|
| `server/services/llm-adapter.js` | 重构 + 新增 | ~100 行新增 + ~40 行调整 |
| `server/services/thinking-brief.js` | 5 行调整 | 1 个新分支 |
| `client/js/views/requirements.js` | SSE handler + bubble init | ~20 行新增 + ~10 行调整 |
| `client/css/style.css` | 不动 | 0 |

## 验证步骤（不重启服务器——按规矩不动）

改完后由用户自己 restart 服务（记忆硬约束）。我交付：

1. **代码自检**：用 node syntax check（`node -c`）确认无语法错
2. **diff 报告**：把改动清单列清楚，方便用户扫一眼
3. **不主动** git add/commit/push，不主动 restart server
4. 用户重启后：
   - 打开需求详情页 → 点"新想法"
   - 预期：聊天气泡里字符**逐字浮现**（不再是几秒后一次性铺满）
   - 预期：流式期间是 raw JSON（这是已知遗留问题，不在本次 scope）
5. **回归检查**：切到 DeepSeek V4-Flash 模型测一遍，确认 openai-chat 路径不受影响

## 风险与回退

- **风险 1**：minimaxi 网关（`https://api.minimaxi.com/anthropic`）未必严格遵循
  Anthropic Messages SSE 协议，可能事件名差异或 `delta` 结构差异。
  应对：先抓一段实际响应验证；如果协议不同，调字段名即可，主体结构不动。

- **风险 2**：超时与 abort 行为差异。openai-chat 路径有 `DEFAULT_TIMEOUT` 的
  AbortController，anthropic 路径要复用同一套。

- **回退**：万一流式不稳定，把分支判断改回"anthropic-messages 走非流式"即可，
  与现状一致，无副作用。

## 显式不做的事

- 不改前端
- 不改 SSE 端点
- 不改 thinking-brief 第二层 fallback
- 不重启服务
- 不 git 任何操作
- 不动 callLLM 自身（非流式路径，thinking-brief.js 非流式调用还依赖它）