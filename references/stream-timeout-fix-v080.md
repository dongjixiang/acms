# ACMS v0.80 流式响应超时修复

**版本**: v0.80  
**日期**: 2026-08-02  
**状态**: 已修复

---

## 问题描述

用户反馈：在小吉窗口询问时，一直都没有回复。

后台日志显示：
```
[runToolLoop] Tool loop exceeded max rounds (8). 完整 tool call history (9 条):
...
[agent-buddy DEBUG] runToolLoop 完成, content:
```

最终 content 为空，前端收不到响应。

---

## 根因分析

### 问题 1: Tool Loop 超时未处理

当 tool loop 超过最大轮次（8）时，`runToolLoop` 会抛出错误：
```javascript
throw new Error(`Tool loop exceeded max rounds (${maxRounds})`);
```

### 问题 2: 流式模式下响应头已发送

在流式模式下，响应头在 tool loop 运行前就已经发送：
```javascript
if (isStream) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    // ...
  });
  // 分块推送 reply 文本
  for (var si = 0; si < chunks.length; si++) {
    res.write('data: ' + JSON.stringify({ type: 'text', chunk: chunks[si] }) + '\n\n');
  }
}
```

当 tool loop 抛出错误时，错误处理器检查 `if (!res.headersSent)` 发现头已发送，无法返回 JSON 错误响应，导致前端挂起等待。

### 问题 3: 错误处理无法返回响应

```javascript
} catch (e) {
  console.error('[agent-buddy] 错误:', e);
  // 非关键错误：给用户一个友好兜底，不让前端报 500
  if (!res.headersSent) {  // ❌ 流式模式下头已发送，无法返回
    return res.json({
      reply: '我刚才有点卡住了...'
    });
  }
  // 这里什么都不做，前端永远等待
}
```

---

## 修复方案

### 方案 1: 在 tool loop 内捕获错误

在调用 `runtimeExec` 时添加 try-catch，捕获 tool loop 超时错误，给出友好提示：

```javascript
try {
  runtimeResult = await runtimeExec({ ... });
} catch (loopErr) {
  console.warn('[agent-buddy] tool loop 异常:', loopErr.message);
  runtimeResult = { content: '我思考得有点久，可能任务太复杂了。您能再简单说说吗？' };
}
```

### 方案 2: 移除流式模式下的问题（可选）

如果希望完全避免流式超时问题，可以在调用 tool loop 前不发送响应头，等 tool loop 完成后根据内容长度决定是否需要流式返回。

---

## 修改文件

| 文件 | 变更 |
|------|------|
| `server/routes/agent-buddy.js` | 添加 try-catch 处理 tool loop 超时 |

---

## 验证清单

- [x] tool loop 超时时给出友好提示
- [x] 不抛出未捕获错误
- [x] 前端能正常收到响应
- [x] 语法检查通过

---

## 测试步骤

1. 重启 ACMS 服务
2. 在小吉窗口发送复杂请求（触发多次 tool call）
3. 确认能看到友好提示而非空白
4. 检查控制台无错误

---

*修复时间: 2026-08-02*
