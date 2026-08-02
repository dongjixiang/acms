# ACMS 小吉回复不显示问题修复报告

**版本**: v0.81  
**日期**: 2026-08-02  
**状态**: ✅ 已修复

---

## 问题描述

用户反馈：小吉的回复没有体现在聊天框里面。

---

## 根因分析

### 主要问题：JS 文件缓存

**症状**:
- 后端 SSE 响应正常（curl 测试通过）
- LLM 正确返回内容
- 但前端聊天框不显示回复

**根因**:
```html
<!-- 旧版本 -->
<script src="/client/js/core/agent-buddy.js?v=0.59"></script>
```

浏览器缓存了旧版本 `v=0.59` 的 JS 文件，而我们修复的代码在更新版本中。

**P98 陷阱复现**:
> 修改 JS 文件后必须同步 bump `index.html` 里的 `?v=N`，否则浏览器 ETag 缓存命中 304，不会拉新代码。

---

## 修复方案

### 1. 更新版本号

```html
<!-- 修复后 -->
<script src="/client/js/core/agent-buddy.js?v=0.81"></script>
```

### 2. 变量作用域修复（已在前一版本完成）

```javascript
// agent-buddy.js line 1237-1238
var accumulated = '';      // 提升到 sendMessage 作用域
var actionData = null;     // 提升到 sendMessage 作用域
```

---

## 验证结果

### 后端 SSE 测试
```bash
curl -s -X POST 'http://localhost:3300/api/agent-buddy/chat?stream=1' \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: dev-key-001' \
  -d '{"message":"测试","context":{"currentView":"_default","userName":"test"}}'
```

**输出**:
```
data: {"type":"text","chunk":"您好！我是小"}
data: {"type":"text","chunk":"吉，ACMS"}
...
```
✅ SSE 响应正常

### 版本号检查
```bash
grep "agent-buddy.js" client/index.html
# <script src="/client/js/core/agent-buddy.js?v=0.81"></script>
```
✅ 版本号已更新

---

## 用户操作步骤

### 强制刷新浏览器
```
Ctrl + Shift + R
```
或
```
Ctrl + F5
```

### 验证版本
打开浏览器控制台，输入：
```javascript
// 检查是否加载了新版本
document.querySelector('script[src*="agent-buddy"]').src
// 应返回: http://localhost:3300/client/js/core/agent-buddy.js?v=0.81
```

---

## 相关陷阱

| 陷阱 | 描述 | 状态 |
|------|------|------|
| P98 | 修改 JS 后必须 bump 版本号 | ✅ 已修复 |
| P0-1 | 流式响应变量作用域错误 | ✅ 已修复 |

---

## 技术要点

### 浏览器缓存机制

| 缓存方式 | 触发条件 | 解决方案 |
|----------|----------|----------|
| ETag | 文件内容未变 | 更新版本号 |
| Cache-Control | max-age 未过期 | 强制刷新 |
| Service Worker | 有 SW 注册 | 卸载 SW |

### ACMS 缓存策略

- 静态资源：`?v=N` 版本号控制
- API 数据：无缓存（每次请求）
- localStorage：手动管理

---

## 后续优化建议

1. **自动化版本号管理**
   - 使用 git commit hash 作为版本号
   - 或在构建时自动 bump

2. **Service Worker 清理**
   - 检查是否有 SW 注册
   - 必要时提示用户清除 SW

3. **开发环境禁用缓存**
   - 开发时加 `Cache-Control: no-store`
   - 生产环境再启用缓存

---

*修复时间: 2026-08-02 17:00*  
*修复人: Agnes*
