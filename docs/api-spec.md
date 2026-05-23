# GET /api/current-time — 接口规范

> 需求: REQ-MPAFLGAW | 设计任务: T-MPBBMQ65 | 版本: 1.0

---

## 概述

获取当前 UTC 时间的简单接口，返回 ISO 8601 格式时间及对应星期几。

## 端点

```
GET /api/current-time
```

## 请求

| 项目 | 说明 |
|------|------|
| Method | `GET` |
| Path | `/api/current-time` |
| Headers | 无特殊要求 |
| Query Parameters | 无 |
| Body | 无 |
| Authentication | 无需认证 |

### 请求示例

```http
GET /api/current-time HTTP/1.1
Host: localhost:3300
```

## 响应

### 200 OK — 成功

返回纯文本，格式为 `<ISO 8601 UTC秒级时间> <星期几英文全称>`。

```
Content-Type: text/plain; charset=utf-8
```

**响应示例:**

```
2026-05-18T14:30:00Z Monday
```

**格式说明:**

| 部分 | 格式 | 示例 |
|------|------|------|
| ISO 8601 时间 | `YYYY-MM-DDTHH:mm:ssZ` | `2026-05-18T14:30:00Z` |
| 星期几 | 英文全称，首字母大写 | `Monday` |

**字段约束:**

- 时间精确到**秒**，不含毫秒
- 固定 UTC 时区（末尾 `Z`）
- 月/日/时/分/秒不足两位时自动补零
- 星期取值: Sunday / Monday / Tuesday / Wednesday / Thursday / Friday / Saturday

### 500 Internal Server Error — 服务端异常

返回简要错误信息（纯文本）。

```
Content-Type: text/plain; charset=utf-8
```

**响应示例:**

```
Internal Server Error
```

> 注: 错误响应格式待后续统一规范，当前版本仅返回 500 状态码及简短说明。

## 状态码一览

| 状态码 | 含义 | 场景 |
|--------|------|------|
| `200` | OK | 正常返回时间字符串 |
| `500` | Internal Server Error | 服务端处理异常 |

## CORS

允许跨域访问:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
```

## Rate Limiting

| 项目 | 值 |
|------|-----|
| 限制策略 | 固定窗口 |
| 限额 | 100 次/分钟 |
| 超限响应 | `429 Too Many Requests`（后续版本实现） |

## 实现模块

时间格式化逻辑封装在独立工具模块中:

```
src/utils/timeUtils.js
  ├── getCurrentUTC()      → { iso, weekday }
  └── getFormattedTime()   → "YYYY-MM-DDTHH:mm:ssZ Weekday"
```

路由处理在:

```
server/routes/time.js  (新增)
```

## 变更记录

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-05-18 | 1.0 | 初始版本，定义基本接口规范 |
