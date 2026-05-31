你正在为一个**主需求**（可能拆分为多个子需求）进行架构澄清。在深入功能细节之前，先确认以下跨模块边界。

**⚠️ 优先规则**：如果检测到需求范围过大、涉及多个独立模块，**必须先完成架构宪法定义，再建议拆分**。不要在宪法为空时设置 splitSuggestion.shouldSplit=true。宪法确认后，splitSuggestion 的 suggestedChildren 应直接对应 domain.boundaries 中定义的模块。

## 一、业务架构（domain）

### 1.1 模块边界（boundaries）
- 这个需求涉及哪些业务模块？每个模块的职责边界是什么？
- 什么**不属于**这个模块？避免子需求越界
- 示例：「商品管理的 owns: Product/Category/SKU/Inventory，doesNotOwn: 定价规则 → 归营销模块」

### 1.2 共享术语表（glossary）
- 哪些核心术语需要统一定义？（如「订单」是已支付记录还是包含待付款？）
- 列出3-5个最容易歧义的关键词，给出准确定义
- 示例：「订单 = 用户已支付且确认的购买记录（区别于购物车/待付款）」

### 1.3 跨模块业务规则（businessRules）
- 哪些业务逻辑需要多个模块协同？（如「下单时锁定库存，支付后扣减」涉及订单+商品+支付）
- 每条规则明确：owner 是谁，involves 哪些模块
- 示例：「退款超500元需人工审核 → owner: 订单系统, involves: [支付模块, 客服系统]」

### 1.4 端到端业务流程（processes）
- 用户的一次完整操作经过哪些模块？顺序是什么？
- 失败时的回滚路径是什么？
- 示例：「下单流程: 商品管理(校验库存) → 订单系统(创建订单) → 支付模块(发起支付) → 支付回调 → 商品管理(扣减库存) → 用户中心(发送通知)」

## 二、技术架构（technical）

### 2.1 全局技术选型（decisions）
- 前端框架、后端语言、数据库、API 风格
- 注意：这是宪法级别的决策，子需求不可推翻
- 示例：`{ "frontend": "React 18 + TypeScript", "backend": "Node.js + Express", "database": "PostgreSQL 15" }`

### 2.2 共享数据模型（sharedSchemas）
- 哪些数据模型被多个子需求共享？
- 每个 Schema 的核心字段是什么？
- 示例：`User { id: uuid, email: string, role: enum }`, `Product { id: uuid, name: string, price: number }`

### 2.3 交付目录规划（repository）
- 代码仓库结构是什么？（monorepo / multirepo）
- 每个模块代码放在哪个路径？
- 共享代码放在哪？
- 示例：`/services/product`, `/services/order`, `/packages/shared`

### 2.4 全局非功能约束（constraints）
- API 延迟、测试覆盖率、文档要求等
- 示例：`{ "apiLatencyP95": "200ms", "testCoverage": "80%" }`

## 三、模块契约（contracts）

### 3.1 模块调用关系
- 子需求之间的依赖关系：谁提供什么能力给谁？
- 每个承诺的业务 SLA 是什么？
- 示例：「商品管理 → 提供给 → 订单系统: 商品详情查询(含实时库存), SLA: P95 ≤ 50ms, 99.9%可用」

## 格式要求

确认后请在 SRS 中输出 archSpec，格式如下：

```json
{
  "domain": {
    "boundaries": [{ "module": "模块名", "owns": ["概念1"], "dependsOn": ["依赖的模块"] }],
    "glossary": [{ "term": "术语", "definition": "准确定义", "owner": "归属模块" }],
    "businessRules": [{ "rule": "规则描述", "owner": "主责模块", "involves": ["参与模块"] }],
    "processes": [{ "name": "流程名", "steps": [{ "seq": 1, "module": "模块", "action": "动作" }], "rollback": "回滚策略" }]
  },
  "technical": {
    "decisions": { "frontend": "技术栈", "backend": "技术栈" },
    "sharedSchemas": [{ "name": "Schema名", "fields": { "field1": "type" } }],
    "repository": { "strategy": "monorepo", "layout": { "/services/xxx": "模块名", "/packages/shared": "共享代码" } },
    "constraints": { "key": "value" }
  },
  "contracts": [{ "from": "提供方", "to": "消费方", "commitment": "承诺内容", "sla": "SLA指标" }]
}
```

如果需求范围不大、不需要拆分，说明「不需要架构宪法」并直接进入功能澄清。
