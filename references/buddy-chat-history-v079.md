# Agent 小吉历史记录持久化 + 自动摘要 (v0.79)

## 实现内容

### 1. 后端服务 (`server/services/buddy-chat-history.js`)
- 持久化存储聊天记录（最近 50 条）
- 自动摘要生成（每 10 轮对话触发）
- 摘要缓存（30 分钟内不重复生成）
- API 端点：
  - `POST /api/agent-buddy/chat-history` - 保存消息
  - `GET /api/agent-buddy/chat-history` - 获取历史和摘要
  - `POST /api/agent-buddy/chat-history/summarize` - 手动触发摘要

### 2. 后端路由 (`server/routes/agent-buddy.js`)
- 每次对话后自动保存用户消息和小吉回复
- 自动加载历史摘要注入 prompt
- 异步生成摘要（不阻塞主响应）

### 3. 前端集成 (`client/js/core/agent-buddy.js`)
- `saveChatMemory()` 同步到服务端
- `syncChatToServer()` fire-and-forget 写入
- `loadChatHistorySummary()` 启动时加载摘要

### 4. 数据库 (`server/db/connection.js`)
- 新增 `buddy_chat_history` 表（自动懒创建）
- 历史记录存储在 `buddy_memory` 表的 JSON 字段中

## 架构设计

```
用户消息 → 前端 → POST /chat-history → 服务端存储
                                    ↓
                              达到阈值(10条)
                                    ↓
                              异步调用 LLM 生成摘要
                                    ↓
                              存储摘要到 buddy_memory
                                    ↓
                              下次对话注入 system prompt
```

## 效果

- ✅ 历史消息持久化（16 条测试通过）
- ✅ 自动摘要生成（topics + summary）
- ✅ 跨会话上下文保留
- ✅ 不阻塞主响应（异步生成）

## 测试

```bash
# 保存消息
curl -X POST http://localhost:3300/api/agent-buddy/chat-history \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dev-key-001" \
  -d '{"role":"user","text":"你好"}'

# 获取历史和摘要
curl http://localhost:3300/api/agent-buddy/chat-history \
  -H "X-API-Key: dev-key-001"

# 手动触发摘要
curl -X POST http://localhost:3300/api/agent-buddy/chat-history/summarize \
  -H "X-API-Key: dev-key-001"
```
