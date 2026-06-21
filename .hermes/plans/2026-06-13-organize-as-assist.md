# ACMS v0.13 方法论驱动的"整理"功能（一次性做完）

> 2026-06-18 晚，多多给完整方法论（ECSR + 4 工具 + 三层次过滤 + 5 要素 + 假设清单），拍板"一次性做完"，**不先 mock 直接动实机**。

## 多多拍板要点
1. 一次性做完（不分步走）
2. 旧 description 进 history 同时，**5 要素结构化数据也要存**
3. 假设清单确认机制：**直接显示在整理结果里让用户确认**

## 范围
- v0.13 只实现 4 个工具里的 **Use Case（用例）**——聊天补充最常见是"零散吐槽"
- v0.14+ 再扩展其他工具

## 改动清单

### 1. 后端：use-case service（新文件）
**路径**：`server/services/assists/use-case.js`

**核心**：按 ECSR 顺序的 LLM prompt + JSON schema 校验

```js
// 输入：requirement 对象 + supplement_history
// 输出：结构化 JSON
{
  assumptions: [
    { id: 'A-001', text: '假设用户已登录', risk: 'low'|'medium'|'high' }
  ],
  businessCases: [
    { id: 'UC-001', desc: '用户能够发布文字评论',
      ac: { given: '...', when: '...', then: '...' },
      priority: 'must'|'should'|'could'|'wont',
      deps: ['UC-003'] }
  ],
  userCases: {
    admin: [...],
    user: [...]
  },
  systemCases: [
    { id: 'SYS-001', desc: '...', ac: {...}, priority: ..., deps: [...] }
  ],
  summary: 'AI 整理小结（1-2 句）'
}
```

**prompt 关键约束**：
- AC 必须用 Given/When/Then 格式，**禁止"系统应正确处理"这种废话**
- 优先级强制 4 分类（如果 LLM 全标 Must，后处理降级）
- 假设清单**必须输出至少 1 条**（如果识别不到假设，说明 LLM 没挖够）
- 5 要素字段缺失则降级显示

**JSON schema 校验**：用 safeParseJSON + 字段补全（缺失则给空值/默认值）

### 2. 后端：路由（新端点）
**路径**：`server/routes/requirements.js`（在 `/assist/:method` 通用路由附近或独立）

**端点 1**：触发整理
```
POST /api/requirements/:id/assist/use-case
body: { modelId?, role? }
→ 调 use-case service.runUseCaseAssistJob
→ 返回 { status: 'generating', ... }（异步）
```

**端点 2**：应用整理结果
```
POST /api/requirements/:id/assist/use-case/apply
body: { 
  acceptedItems: [{ id, type: 'business'|'user'|'system', desc, ac, priority, deps }],
  discardedItems: [...],
  confirmedAssumptions: [...],
  structuredData: { assumptions, businessCases, userCases, systemCases, summary }
}
→ 旧 description + 旧 structured_requirements 进 history（各 5 份）
→ 新 description = acceptedItems 合并生成
→ 新 structured_requirements = 完整结构化数据
→ 触发 brief 重生（autoRegenBrief: false 避免 Bug 1 并发）
```

### 3. 数据存储：新字段
**路径**：`server/stores/requirement-store.js` (create 方法) + 路由处理

**新增字段**（在 create 时初始化）：
- `structured_requirements`: 'null' 或 JSON 字符串（完整结构化数据）
- `structured_requirements_history`: '[]' 或 JSON 字符串（最多 5 份）

### 4. 前端：use-case 渲染组件（新文件）
**路径**：`client/js/views/assists/use-case.js`

**功能**：
- 接收 `data.structuredData` 渲染
- 4 个区块：
  1. **假设清单**（灰底）：每条可勾选确认
  2. **业务层用例**：每条可勾选/编辑/丢弃
  3. **用户层用例**（按角色分）：admin/user 分组
  4. **系统层用例**：每条同上
- 底部 3 个按钮：
  - **✅ 提交采纳**：调 apply 端点
  - **↻ 重整**：重新触发整理
  - **✕ 全部丢弃**：关闭卡片
- 编辑：inline 编辑描述 + AC（点击 [编辑] 切换为 textarea）

### 5. 前端：✨ 整理按钮改造
**路径**：`client/js/views/requirements.js:2917`

**改法**：把 `chatRewrite(reqId)` 改为 `chatAssist(reqId, 'use_case')`

**删除/废弃**：
- `chatRewrite` 函数（line 4260）
- `chatDone` 函数（line 4269）—— ✅ 够了的逻辑要重新设计（v0.13 可保留为占位，TODO v0.14）

### 6. 前端：index.html 加载新组件
**路径**：`client/index.html:411 附近`

**改法**：在 `decision-tree.js` 后加 `<script src="/client/js/views/assists/use-case.js?v=0.13.0"></script>`

## 数据流（端到端）

```
[1] 用户点 ✨ 整理（在 chat-extras 里）
    ↓
[2] chatAssist(reqId, 'use_case')
    - 同其他 assist 流程：插 loading card → POST /assist/use-case → startChatPolling
    ↓
[3] 后端 use-case service.runUseCaseAssistJob
    - 读 req + supplement_history + currentDescription + srs
    - LLM 按 ECSR prompt 输出结构化 JSON
    - 校验 + 补全字段
    - 写入 req.structured_requirements（中间结果，不写入 description！）
    ↓
[4] 前端轮询拿到 structuredData → 渲染"整理结果预览"卡片
    - 假设清单（灰底 + 确认 checkbox）
    - 三层次分块（业务/用户/系统折叠区）
    - 每条目：✅采纳 / ☐不采纳 / [必做]/[应做]/[能做]/[不做] 下拉 / [编辑] / [丢弃]
    ↓
[5] 用户操作：勾选/编辑/丢弃
    ↓
[6] 用户点 ✅ 提交采纳
    ↓
[7] POST /assist/use-case/apply
    - 旧 description 进 description_history
    - 旧 structured_requirements 进 structured_requirements_history
    - 新 description = acceptedItems 合并
    - 新 structured_requirements = 完整结构化数据
    - autoRegenBrief: false（避免 Bug 1 并发）
    ↓
[8] 前端刷新需求面板顶部 description 区域
    + 整理卡片变 "✅ 已采纳 5 条 · v3" 持久状态
    + 写入 description_history 快照按钮可恢复（按描述历史恢复）
```

## 行为示意

```
┌─────────────────────────────────────────────────────┐
│ ✨ AI 整理预览 · 用例（Use Case） · 基于 8 条补充   │
├─────────────────────────────────────────────────────┤
│ ▼ ⚠️ 假设清单（3 条 · 待你确认）                  │
│ ┌──────────────────────────────────────────────┐  │
│ │ [✓] A-001  假设用户已登录           风险:低   │  │
│ │ [✓] A-002  "评论"指文字评论（非音视频）风险:中 │  │
│ │ [✓] A-003  "关注"是单向关注         风险:中   │  │
│ └──────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│ ▼ 业务层（2 条）                                  │
│ ┌──────────────────────────────────────────────┐  │
│ │ [✓] UC-001  发布文字评论  [必做▼] 依赖:无    │  │
│ │       AC: Given已登录 When点击评论 When输入... │  │
│ │                              [编辑] [丢弃]    │  │
│ │ [☐] UC-002  关注其他用户  [应做▼] 依赖:UC-001 │  │
│ │                              [编辑] [丢弃]    │  │
│ └──────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│ ▼ 用户层                                          │
│ [管理员] (1 条)  [普通用户] (2 条)                  │
├─────────────────────────────────────────────────────┤
│ ▼ 系统层（1 条）                                  │
│ [SYS-001] 评论审核接口 ...                         │
├─────────────────────────────────────────────────────┤
│ AI 整理小结：基于 8 条补充整理出 5 条用例          │
├─────────────────────────────────────────────────────┤
│ [✅ 提交采纳 5 条]  [↻ 重整]  [✕ 全部丢弃]        │
└─────────────────────────────────────────────────────┘
```

## 改动量预估

| 位置 | 文件 | 改动行数 |
|---|---|---|
| 后端 use-case service | 新文件 use-case.js | +180 |
| 后端路由 | requirements.js | +120 |
| 数据存储字段 | requirement-store.js | +20 |
| 前端 use-case 组件 | 新文件 use-case.js | +280 |
| 前端 chat-extras 改造 | requirements.js | +10 / -10 |
| 前端 index.html | index.html | +1 |
| **合计** | **6 个文件（含 2 新文件）** | **+611 / -10** |

## 主动指出局限（按你节奏）

**局限 ① LLM 不会稳定输出严格 ECSR 格式**：必须后端做 JSON schema 校验 + 字段补全
**局限 ② AC Given/When/Then LLM 偷懒**：prompt 要硬约束"禁止'系统应正确处理'"等废话
**局限 ③ LLM 倾向全标 Must**：后处理逻辑——比如 Must > 5 条自动降级为 Should
**局限 ④ 三层次分类边界模糊**：业务/用户/系统经常交叉。prompt 要约定
**局限 ⑤ 假设清单"风险等级"判定**：LLM 自评可能不准，前端可以重新评估
**局限 ⑥ description 合并格式**：acceptedItems 怎么合并成 description——编号列表？分块？需要约定
**局限 ⑦ 旧 chatRewrite / chatDone 是直接 reload，现在用 assist 流程**——chat-extras 仍保留 ✅ 够了按钮但功能没改（v0.13 不重做 chatDone）
**局限 ⑧ 这是 600+ 行大改动**——一次 commit 不容易 review。**但多多拍板"一次性做完"**，我照办
**局限 ⑨ 没先做 mock 示意**——按你节奏应该先看 demo，但你拍板直接做，**我尊重你的判断**。如果做完觉得视觉不对，再调

## 没做的事
- ❌ 不 git / 不 restart 服务器
- ❌ 不做另外 3 个工具（事件响应表/质量属性/决策表）—— v0.14+
- ❌ 不重做 chatDone（✅ 够了按钮逻辑）
- ❌ 不改 description_history UI（已存在的恢复逻辑可继续用）

## 拍板记录
- 多多明确："一次性做完"
- 多多明确："旧 description 进 history 同时，5 要素结构化数据要存"
- 多多明确："假设清单直接显示在整理结果里确认"