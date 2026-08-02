# ACMS 优化清单（可执行）

**生成时间**: 2026-08-02  
**状态**: 待执行

---

## ✅ 已完成

- [x] P0: 流式响应 `accumulated` 作用域修复
- [x] P0: 服务器重启

---

## 🔲 P1 级（本周执行）

### 1. 日志系统升级
- [ ] 创建 `server/services/logger.js`
- [ ] 替换 361 处 console.log
- [ ] 加 DEBUG 环境变量控制

**预估**: 2小时  
**文件**: `server/services/logger.js`, `server/**/*.js`, `client/js/**/*.js`

---

### 2. Timer 统一管理
- [ ] 创建 `client/js/core/timer-manager.js`
- [ ] 修改 `agent-buddy.js` 轮询
- [ ] 修改 `kanban.js` 轮询
- [ ] 修改 `desktop-icons.js` 拖拽

**预估**: 4小时  
**文件**: `client/js/core/timer-manager.js`, `agent-buddy.js`, `kanban.js`, `desktop-icons.js`

---

### 3. 错误边界统一
- [ ] 创建 `client/js/core/error-boundary.js`
- [ ] 修改前端 fetch 调用
- [ ] 修改后端 route handler

**预估**: 3小时  
**文件**: `client/js/core/error-boundary.js`, `server/routes/*.js`, `client/js/**/*.js`

---

## 🔲 P2 级（下周执行）

### 4. 前端缓存策略
- [ ] 创建 `client/js/core/cache.js`
- [ ] 缓存 dashboard 数据
- [ ] 缓存项目列表
- [ ] 缓存需求列表

**预估**: 4小时  
**文件**: `client/js/core/cache.js`, `views/dashboard.js`, `views/projects.js`, `views/requirements.js`

---

### 5. 后端请求限流
- [ ] 安装 express-rate-limit
- [ ] 配置 chat 端点限流
- [ ] 配置 search 端点限流

**预估**: 2小时  
**文件**: `server/index.js`, `server/routes/agent-buddy.js`, `server/routes/chat-intent.js`

---

### 6. 工具描述补全
- [ ] 检查所有工具描述
- [ ] 补全 DON'T WHEN 说明
- [ ] 统一描述格式

**预估**: 6小时  
**文件**: `server/tools/*.js`

---

## 🔲 P3 级（下月执行）

### 7. 单元测试覆盖
- [ ] 配置 Jest
- [ ] 写 tool-registry 测试
- [ ] 写 llm-adapter 测试
- [ ] 写 agent-buddy-action 测试
- [ ] 写 requirement-service 测试

**预估**: 20小时  
**文件**: `server/__tests__/*.test.js`

---

### 8. 搜索质量优化
- [ ] 扩展 SYNONYM_MAP
- [ ] 加搜索失败率统计
- [ ] 部署 BGE 模型

**预估**: 8小时  
**文件**: `server/services/tool-retriever.js`, `server/services/agent-buddy-skill.js`

---

### 9. 内存泄漏排查
- [ ] 排查 agent-buddy.js 轮询
- [ ] 排查 kanban.js SSE
- [ ] 排查 desktop-icons.js 事件
- [ ] 加页面 unload 清理

**预估**: 4小时  
**文件**: `client/js/core/agent-buddy.js`, `client/js/views/kanban.js`, `client/js/views/desktop-icons.js`

---

## 📊 统计

| 级别 | 项目数 | 预估工时 |
|------|--------|----------|
| P1 | 3 | 9小时 |
| P2 | 3 | 12小时 |
| P3 | 3 | 32小时 |
| **总计** | **9** | **53小时** |

---

## 🎯 建议执行顺序

1. **Day 1-2**: P1 日志 + Timer（高收益，低风险）
2. **Day 3**: P1 错误边界
3. **Day 4-5**: P2 缓存 + 限流
4. **Week 2**: P2 工具描述补全
5. **Month 1**: P3 单元测试
6. **Month 2**: P3 搜索优化 + 内存排查

---

*清单生成时间: 2026-08-02 16:50*
