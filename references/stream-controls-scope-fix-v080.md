# ACMS v0.80 流式控制作用域修复

**版本**: v0.80  
**日期**: 2026-08-02  
**状态**: 已修复

---

## 问题描述

用户报告以下错误：

```
Uncaught ReferenceError: streamPaused is not defined
    at window.buddyStreamPause (agent-buddy.js?v=0.59:458:20)
Uncaught (in promise) ReferenceError: streamDone is not defined
    at agent-buddy.js?v=0.59:1245:46
```

---

## 根因分析

### 问题 1: `streamPaused` 未定义

**原因**: 在 `ensurePanel` 中定义的 `window.buddyStreamPause` 函数尝试访问 `streamPaused` 变量，但该变量只在 `sendMessage` 函数作用域内定义。

**代码位置**:
```javascript
// ensurePanel 中（行 456-459）
window.buddyStreamPause = function() {
  _streamPaused = true;
  streamPaused = true;  // ❌ streamPaused 只在 sendMessage 作用域定义
};
```

### 问题 2: `streamDone` 未定义

**原因**: 在 `sendMessage` 的 catch 块中引用 `streamDone`，但该变量在某些路径下未正确初始化。

---

## 修复方案

### 1. 添加模块级流式状态变量

```javascript
var _streamSpeed = 30;           // v0.80: 流式速度（ms/块）
var _streamPaused = false;       // v0.80: 流式暂停状态
var _streamDone = false;         // v0.80: 流式完成状态
var _streamAbortController = null; // v0.80: 流式中止控制器
```

### 2. 修正 window 函数

```javascript
window.buddyStreamPause = function() {
  _streamPaused = true;  // ✅ 只修改模块级变量
};
window.buddyStreamResume = function() {
  _streamPaused = false;
};
window.buddyStreamStop = function() {
  if (_streamAbortController) {
    _streamAbortController.abort();
  }
  _streamDone = true;
  _streamPaused = false;
};
```

### 3. 在 sendMessage 中同步局部变量

```javascript
var streamPaused = _streamPaused;  // 局部副本
var streamDone = false;            // 局部变量
var streamAbortController = null;  // 局部变量
```

---

## 修改文件

| 文件 | 变更 |
|------|------|
| `client/js/core/agent-buddy.js` | 添加模块级变量 + 修正函数引用 |

---

## 验证清单

- [x] `_streamPaused` 在模块作用域定义
- [x] `_streamDone` 在模块作用域定义
- [x] `_streamAbortController` 在模块作用域定义
- [x] `window.buddyStreamPause` 只引用模块级变量
- [x] `window.buddyStreamStop` 正确引用 `_streamAbortController`
- [x] 语法检查通过

---

## 测试步骤

1. 清除浏览器缓存（Ctrl+Shift+R）
2. 打开 ACMS 系统
3. 点击小吉头像打开面板
4. 发送消息测试流式响应
5. 点击 ⏸ 按钮测试暂停/继续
6. 点击 ⚡ 按钮测试速度调节
7. 检查控制台无错误

---

*修复时间: 2026-08-02*
