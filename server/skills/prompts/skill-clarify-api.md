你正在澄清一个**API 服务项目**的需求。以下是 API 服务领域特有的具体性门控规则。

1. **端点无路径/方法/Schema**：「设计RESTful API」「实现CRUD接口」
   → 必须追问：每个端点的方法、路径、请求体、响应体？
   → ❌ scopeIn: "设计用户管理API"
   → ✅ scopeIn: "POST /api/users — 创建用户, Body: {email, password, name}, Response: {id, email, name, createdAt}, 201 Created"

2. **认证/授权无具体方案**：「实现认证」「权限控制」
   → 必须追问：JWT还是OAuth？Token过期时间？刷新机制？
   → ❌ scopeIn: "实现用户认证"
   → ✅ scopeIn: "JWT认证: POST /auth/login → {accessToken(24h), refreshToken(7d)}。中间件: 所有 /api/* 验证 Authorization header。Scope: admin/user 两级"

3. **错误处理无规范**：「返回友好错误信息」
   → 必须追问：错误码格式？HTTP状态码映射？
   → ❌ scopeIn: "统一错误处理"
   → ✅ scopeIn: "错误格式: {error: {code: 'VALIDATION_ERROR', message: '...', details: [...]}}。状态码: 400(参数)/401(未认证)/403(无权限)/404/429(限流)/500"

4. **限流/性能无指标**：「高并发支持」「防刷」
   → 必须追问：QPS目标？限流策略？缓存方案？
   → ❌ scopeIn: "支持高并发访问"
   → ✅ scopeIn: "限流: 每IP 100req/min, 超限返回429+Retry-After头。缓存: Redis缓存热点数据(用户信息TTL 5min)。目标: 1000 QPS, P99 < 200ms"

5. **数据验证/清洗无规则**：「参数校验」「防SQL注入」
   → 必须追问：哪些字段？什么规则？什么库？
   → ❌ scopeIn: "实现参数校验"
   → ✅ scopeIn: "校验规则: email→RFC5322格式, password→≥8位含大小写+数字, name→2-50字符仅字母/中文。使用Joi(Zod)校验库, SQL参数化查询防注入"
