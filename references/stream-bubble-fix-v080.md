# ACMS v0.80 流式气泡修复

**版本**: v0.80  
**日期**: 2026-08-02  
**状态**: 已修复

---

## 问题描述

用户反馈：流式回复时，所有的 AI 回复都在同一个气泡里，而不是每个回复都有独立气泡。

---

## 根因分析

原代码逻辑：
1. 流式过程中 → 创建 `ap-stream-msg` 元素（带光标动画）
2. 流式结束后 → 移除 `ap-stream-msg`
3. 流式结束后 → 调用 `renderMessage` 创建新气泡

**问题**：流式气泡和最终气泡重复显示，导致用户看到两个 AI 回复气泡。

---

## 修复方案

**新逻辑**：
1. 流式过程中 → 创建 `ap-stream-bubble` 元素（带光标动画）
2. 流式结束后 → **直接更新** `ap-stream-bubble` 的内容，移除光标
3. 流式结束后 → **不创建新气泡**

---

## 代码变更

### 修改前
```javascript
// updateStreamMessage
var msgEl = document.getElementById('ap-stream-msg');
if (!msgEl) {
  msgEl = document.createElement('div');
  msgEl.id = 'ap-stream-msg';
  msgEl.className = 'ap-msg ap-msg-buddy';
  container.appendChild(msgEl);
}
msgEl.innerHTML = '...' + cursor;

// finalizeStream
var msgEl = document.getElementById('ap-stream-msg');
if (msgEl) msgEl.remove();  // ❌ 移除流式气泡
renderMessage(reply);        // ❌ 创建新气泡（重复！）
```

### 修改后
```javascript
// updateStreamMessage
var msgEl = document.getElementById('ap-stream-bubble');
if (!msgEl) {
  msgEl = document.createElement('div');
  msgEl.id = 'ap-stream-bubble';
  msgEl.className = 'ap-msg ap-msg-buddy';
  container.appendChild(msgEl);
}
msgEl.innerHTML = '...' + cursor;

// finalizeStream
var msgEl = document.getElementById('ap-stream-bubble');
if (msgEl) {
  msgEl.innerHTML = '...';  // ✅ 直接更新内容
  msgEl.id = '';            // ✅ 移除临时 ID
}
// ✅ 不调用 renderMessage，不创建新气泡
```

---

## 修改文件

| 文件 | 变更 |
|------|------|
| `client/js/core/agent-buddy.js` | 修正流式气泡逻辑 |

---

## 验证清单

- [x] 流式过程中显示带光标的气泡
- [x] 流式结束后气泡内容更新，光标消失
- [x] 不创建重复气泡
- [x] 每个 AI 回复有独立气泡
- [x] 语法检查通过

---

## 测试步骤

1. 清除浏览器缓存（Ctrl+Shift+R）
2. 打开 ACMS 系统
3. 点击小吉头像打开面板
4. 发送消息测试流式响应
5. 检查每个 AI 回复是否只有**一个**气泡
6. 连续发送多条消息，确认气泡交错显示

---

*修复时间: 2026-08-02*
