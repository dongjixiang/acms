# 方案 B：Excel 多步操作由 plan_execute 编排（实施设计）

**目标**：用户说"加 sheet + 合并分析 + 公式"类复合 Excel 指令，AI 自动拆 plan、多步执行、用户看到进度卡，**不再卡 schema 校验**。

**日期**：2026-09-10
**作者**：Hermes Agent
**对应 skill**：acms-office-editor-stack, acms-app-as-tool, acms-tool-call-preview
**对应 issue**：今天踩的"Structural operations ... must be proposed in separate batches"

---

## 1. 根本原因（已验证）

```
GenOffice sheets bundle (adapter-DLlo0sxK.js:332041)
  ↓ propose_operations description 硬规则
  "structural operations (row/column insert-delete, sheet add/delete/duplicate/move/hide)
   cannot share a batch with other classes"
  ↓ zod schema 校验
  "Structural operations (rows/columns/sheets) and cell edits must be proposed in separate batches."
```

**这条规则是 GenOffice 自己内嵌的**——不是 ACMS 加的。
**核心矛盾**：office-action 端点一次只产 1 个 batch → 用户必须手动分两次发指令。

---

## 2. 核心设计思想

**不破 GenOffice bundle**，**在 ACMS 层把"用户的一次对话"翻译成"GenOffice 的多次合法调用"**：

```
用户输入："加一个 sheet『对比分析』，合并考勤和打开的数据，写公式"
  ↓
[chat 流 LLM] → 识别复合意图 → 调 plan_execute
  ↓
plan.steps = [
  {tool: 'office_action', args: {kind:'xlsx', operations:[{op:'add_sheet',...}]}},  ← 只含 structural
  {tool: 'office_action', args: {kind:'xlsx', operations:[{op:'set_cell',...},{op:'set_formula',...}]}, depends_on:['s1']},  ← 只含 content
]
  ↓
[plan_executor] 拓扑序执行
  ↓
[step 1] office_action tool handler → 调 /api/agent-buddy/office-action → applyPlan → Univer 内存落 → 状态更新
  ↓
[step 2] office_action tool handler → 调 /api/agent-buddy/office-action → 重新读 docContext (因 structural 后地址变了) → applyPlan → 状态更新
  ↓
[plan_done] 全部成功 → plan_done card → 用户在 Excel 看到结果
```

**为什么这样设计**：
- ✅ 不破 GenOffice bundle 的硬规则（每次 office-action 只发 1 类 op，自然合法）
- ✅ 复用现成 plan_execute 机制（chat 流已验证 v0.48 + v0.49）
- ✅ 自动处理 structural → address 失效问题（plan 步骤 depends_on + handler 自动 re-read docContext）
- ✅ 部分失败隔离（structural 成功但 content 失败 → 至少 sheet 留下了，content 可以单独 retry）

---

## 3. 三层架构改动

### 3.1 后端：新工具 `office_action`（约 80 行）

**新文件**：`server/tools/office-action.js`

**核心职责**：把 office-action HTTP 端点包装成 plan_execute 可编排的 step。

### 3.2 前端：`office_action_apply` system entry 渲染分支

**文件**：`client/js/views/office-v3-bridge.js` + `client/js/views/requirements/chat.js`

**职责**：
1. chat.js system entry 渲染器识别 `source === 'office_action_apply'`
2. 提取 `action`（来自 office-action HTTP 端点的响应）
3. 找到当前打开的 OfficeV3 instance（sheets/word/slides）
4. 调 `applyPlan(action)` → Univer 内存 / Tiptap / Konva 写入
5. 状态回写（`__markDirty()` 等）

### 3.3 prompt 强化：识别 Excel 多步意图

**文件**：`server/routes/chat-intent.js` L72-83（INTENT_TOOL_NAMES + system prompt）

**关键防错**：
- 严禁单次 office_action call 同时含 structural + content 类 op
- structural 后下游 step 必须 refreshContext:true
- depends_on 强制串行（structural 必须先 apply）

---

## 4. 失败隔离与原子性

**核心问题**：structural step 成功（sheet 加好了）但 content step 失败（LLM 编错 cell 地址），用户体感？
**当前设计**：plan_executor 已经实现了"失败隔离只跳下游，不终止整个 plan"（参见 plan-executor.js 的 fail-isolation 逻辑，v0.48 已验证）

**示例**：
```
s1: office_action(add_sheet) → ok  → sheet "对比分析" 已添加，Univer 内存可见
s2: office_action(set_cell F2=B2/D2) → fail（LLM 把 sheetId 写错）
  → plan_executor 标记 s2 失败，跳下游
  → 用户在 Excel 看到：sheet 已加（Ctrl+S 后落盘），但 F2 是空的，状态卡显示"❌ s2 失败：invalid sheetId"
  → 用户可以"重试 s2" 或手动修改
```

**回滚**（可选，v0.121+）：plan_done card 加 [↩ 回滚整个 plan] 按钮 → 反向应用每个成功 step 的 inverse action（结构性 step 用 delete_sheet / delete_rows，content step 用 clear_cell）

**v0.X 第一版不做回滚**，因为：
1. 复合操作失败率低（Excel 多步通常都是简单 op）
2. 回滚的 inverse action 不一定存在（format 类、merge_cells）
3. 增量重试比整批回滚更友好（用户改 prompt 重跑 s2 即可）

---

## 5. 现有 office-action 端点（chat 流外的直接调用）怎么办？

**问题**：用户当前在 Office V3 编辑器内的 AI 面板发指令，走 `office-v3-bridge.js` → `__acmsOfficeAction` → 直接调 `/api/agent-buddy/office-action`（不走 plan_execute）。这条路径不受方案 B 影响，依然单次单 batch。

**决策**：
- **方案 B 优先服务 chat 流**（用户在小吉面板里发"加 sheet + 合并"指令的场景）
- **Office V3 内 AI 面板继续走原路径**（一次一 batch）
- **未来扩展**：如果用户在 V3 内 AI 面板也想用多步 → 给 `__acmsOfficeAction` 加 plan_execute 调度器（同 office_action tool handler），但**这次不做**

---

## 6. 实施分解（5 个 PR，每个 ≤ 200 行）

| PR | 内容 | 状态 | 文件 |
|---|---|---|---|
| **PR1: 后端 office_action tool** | server/tools/office-action.js + tools/index.js 加 require + server/tools/office-action.test.js | ✅ 完成 | 后端 ~330 行 |
| **PR2: 前端 office_action_apply 渲染** | chat.js system entry 加 branch + office-v3-bridge.js 加 readFreshDocContext helper | ✅ 完成 | 前端 ~144 行 |
| **PR3: prompt 强化** | chat-intent.js INTENT_TOOL_NAMES 加 office_action + system prompt 加"多步编排"段 | ✅ 完成 | prompt ~52 行 |
| **PR4: 端到端验证** | 服务端 E2E 5 case + 浏览器手动验证清单 | 📍 进行中 | test ~250 行 |
| **PR5: 失败隔离 + 重试 UI** | plan_done card 加 [↩ 重试失败 step] 按钮 + 失败原因解释 | ⏳ 待办 | ~80 行 |

**总工作量**：约 1-2 天开发 + 测试（每个 PR 都自带测试，不留尾巴）。

---

## 6.5 PR1 详细 spec — server/tools/office-action.js

**目标**：把 `/api/agent-buddy/office-action` HTTP 端点包装成 plan_execute 可编排的 server tool。

**文件清单**：
- ✅ 新建 `server/tools/office-action.js`（约 330 行）
- ✅ 新建 `server/__tests__/office-action-tool.test.js`（约 270 行，7 个 case）
- ✅ 修改 `server/tools/index.js`（加 4 行 require）

**核心接口契约**：注册 `office_action` tool，含 4 字段（kind/operations/refreshContext/summary），handler 校验混类 + 调 office-action 端点 + 写 system entry。

**测试结果**：**51/51 通过** ✅

---

## 6.6 PR2 详细 spec — 前端 office_action_apply 渲染 + readFreshDocContext

**目标**：让 `office_action_apply` system entry 一旦写进 `supplement_history`，前端自动识别并 applyPlan 到当前打开的 OfficeV3 编辑器。

**关键复用**：
- ✅ `runAction` 已经在 `office-v3-bridge.js:2254` 现成 → 复用，caller 改为 system entry
- ✅ chat.js 的 system entry 三元链 + polling 机制 → 只新增 1 个分支

**文件清单**：
- ✅ 修改 `client/js/views/office-v3-bridge.js`（+106 行：`readFreshDocContext(kind)` + `applyOfficeAction(payload)`）
- ✅ 修改 `client/js/views/requirements/chat.js`（+38 行：三元链分支 + `renderOfficeActionApplyBubble` 函数）
- ✅ 新建 `server/__tests__/office-action-renderer.test.js`（280 行，7 个 case + 3 个静态一致性检查）

**测试结果**：**25/25 通过** ✅

---

## 6.7 PR3 详细 spec — prompt 强化 + INTENT_TOOL_NAMES

**目标**：让 LLM 在 chat 流看到"加 sheet + 合并数据 + 写公式"等多步 Office 操作时，**自动调 plan_execute + office_action**。

**文件清单**：
- ✅ 修改 `server/routes/chat-intent.js`（+52 行：INTENT_TOOL_NAMES 加 'office_action' + buildFreeChatSystemPrompt 加"Excel/Word/PPT 多步操作"段）
- ✅ 新建 `server/__tests__/chat-intent-office-action.test.js`（200 行，5 个 case）

**核心改动**：
- INTENT_TOOL_NAMES 加 `'office_action'`（总数 9 → 10）
- buildFreeChatSystemPrompt 加 `# ⛔ Excel/Word/PPT 多步操作必须调 plan_execute + office_action` 段（52 行，含 6 类 op 列表 + 严禁混类 + refreshContext + 失败兜底 + 典型 plan 模板）
- 段位置在"复合意图必须调 plan_execute"段之后，"# 回复要求"段之前（距离 874 字符）

**测试结果**：**33/33 通过** ✅

---

## 6.8 PR4 详细 spec — 端到端验证（你今天的 case）

**目标**：验证 PR1-3 的改动让 LLM 真的能识别"加 sheet + 合并数据 + 写公式"等多步 Excel 指令，并自动拆成 plan_execute 多步执行。

**PR4 拆两部分**：

### PR4a — 服务端 E2E（Node 可自动化跑）

**文件**：`server/__tests__/excel-multi-step-e2e.test.js`（约 250 行，5 个 case）

**5 个 case 设计**：

| # | Case | 验证 |
|---|---|---|
| 1 | LLM 真实调 office_action 看到意图 | mock llmAdapter + mock office-action 端点 → 模拟 chat 流"加 sheet + 合并数据 + 写公式"指令 → LLM 返回 plan_execute(steps:[...]) → plan_executor 跑 → office_action handler 调 office-action 端点 → 写 system entry |
| 2 | 真实混类拒绝 E2E | plan step 的 operations 同时含 add_sheet + set_cell → office_action handler 拒绝 → plan_step_failed entry 写入 |
| 3 | 真实 refreshContext 触发 | plan step 的 args.refreshContext=true 但缺 docContext → handler 返回 NO_DOC_CONTEXT → plan_step_failed entry |
| 4 | 部分失败隔离 | plan 2 步，s1 ok / s2 fail（混类）→ s2 失败不中断整个 plan → plan_done entry 显示 s2 失败 + s1 成功状态保留 |
| 5 | 不影响 Office V3 内 AI 面板路径 | 模拟 V3 内 AI 面板直发 office-action 端点 → 不走 plan_execute → 单 batch → 行为不变 |

**关键技术点**：
- mock global.fetch（office-action 端点响应可控）
- mock llmAdapter.callLLM 返回预设的 plan_execute tool_call
- 用真实 plan-executor.executePlan() 完整跑一遍
- 检查 reqStore.getById(reqId).supplement_history 的实际写入

### PR4b — 浏览器手动验证（你亲自跑）

**步骤*ck llmAdapter.callLLM 返回预设的 plan_execute tool_call
- 用真实 plan-executor.executePlan() 完整跑一遍
- 检查 reqStore.getById(reqId).supplement_history 的实际写入

### PR4b — 浏览器手动验证（你亲自跑）

**步骤**（要 ACMS 服务在跑 + Excel V3 编辑器可用）：
1. 启动 ACMS 服务（`start.bat` 或 `node server/index.js`）
2. 浏览器打开 ACMS → 辅助工具 → Excel → 打开一个有考勤和打开两个 sheet 的 xlsx
3. 在 chat 流（不是 Excel AI 面板）输入："帮我加一个 sheet『对比分析』，合并考勤和打开的数据，按姓名 join，写公式 F=B/D"
4. 观察：
   - LLM 是否调 plan_execute（看 chat 流 plan_loading card）
   - step 1 是否新增 sheet（看 Excel）
   - step 2 是否写入表头/数据/公式（看 Excel）
   - plan_done card 是否显示成功
5. 验证完成后 Ctrl+S 保存 Excel → 关掉重开 → 数据仍在

**PR4 不做什么**（明确边界）：
- ❌ 不做前端浏览器自动化（puppeteer/playwright 太重，且 ACMS 服务起来需要 GUI 环境）
- ❌ 不做 stress test（1 plan 同时 5+ 步、并发 plan、refreshContext 跨 plan 复用）
- ❌ 不测多 REQ 并发（plan_executor 跨 REQ 复杂，本期不做）

**PR4 review 检查清单**：
- [ ] `timeout 60 node server/__tests__/excel-multi-step-e2e.test.js` 5/5 通过
- [ ] 服务端 E2E 跑真实 LLM call（不 mock 整个 LLM）— LLM 响应至少有 tool_calls 字段
- [ ] mock fetch 的 office-action 端点响应可重复使用（避免 5 个 case 之间互相污染）
- [ ] 浏览器手动验证清单可执行（每步有明确观察点）

**预计代码量**：~250 行测试 + 1 个手动验证清单。

---

## 6.9 PR5 详细 spec — 失败重试 UI

**目标**：plan_done status=partial_failed 时，给用户一键"重试失败"按钮，比手动复制错误信息再发指令省 4 步。

**决策：方案 B（一键重发 plan 失败的 user message）**：

```
用户点 [🔄 重试] 按钮
  ↓
前端调用 POST /api/requirements/:id/plan/:plan_id/retry
  ↓
后端构造 user message 文本：
  "[系统提示] 上一次 plan_execute 部分失败：
   - s1 成功：新增 sheet（'对比分析'）
   - s2 失败：MIXED_CLASS_OPS（混类：structural + content）
   - s3 skipped：上游 s2 失败

   请重新尝试。把混类 op 拆成多个 step 重跑。"
  ↓
后端调 chatSendSupplement 写入 supplement_history
  ↓
前端 polling 拉到这条 user message → 触发新 chatSend → LLM 重写 plan
  ↓
新一轮 plan_execute 自动跑（LLM 看到失败上下文会拆 step 重做）
```

**为什么选 B**：
- ✅ 不引入"复杂 plan 重算"逻辑（不分析依赖图）
- ✅ LLM 看到失败上下文，自己决定怎么改（强 LLM 比硬编码路由更稳）
- ✅ 复用现有 chatSend 链路（不动 chat 协议）
- ⚠️ 缺点：LLM 可能再次给混类 plan（要靠 prompt 失败时给详细 context + 严禁混类规则）

**文件清单**：
- 新建 `server/routes/plan-retry.js`（~80 行：POST /api/requirements/:id/plan/:plan_id/retry）
- 修改 `server/app.js` 或 routes 注册（~3 行：注册 plan-retry router）
- 修改 `client/js/views/assists/plan.js`（+30 行：plan_done card 加 [🔄 重试] 按钮 + onclick 调 retry API）
- 新建 `server/__tests__/plan-retry.test.js`（~150 行，5 个 case）

**核心接口契约**：

```js
// 后端 POST /api/requirements/:id/plan/:plan_id/retry
// req: {}
// resp: { ok: true, retried_plan_id, retry_message: '[系统提示] 上一次...' }
//
// 实现：
// 1. 从 reqStore.getById(reqId).plan 拿 planDoc
// 2. 构造 retry_message（见上面模板）
// 3. 调 chatSendSupplement(reqId, retry_message) 写入 supplement_history
// 4. 返回 retried_plan_id = planDoc.planId（标记"这次是 retry 上次"）

---

## 6.9.1 PR5 实施记录（2026-09-10，实际偏离 spec 两处）

**已交付**（17/17 测试通过）：

- 新建 `server/routes/plan-retry.js`（207 行）— POST `/:reqId/plan/:planId/retry`
- 修改 `server/app.js`（+2 行）— 在 `/api/requirements` 后挂载 plan-retry router
- 修改 `client/js/views/assists/plan.js`（+40 行）— `renderRetryButton()` + `__reqId` 注入
- 修改 `client/js/views/requirements/chat.js`（+52 行）— `retryFailedPlanSteps()` 挂 window
- 修改 `client/index.html`（+2 行）— plan.js `?v=0.120` / chat.js `?v=0.22.49`
- 新建 `server/__tests__/plan-retry.test.js`（305 行，17 case）

**偏离 1：不写 supplement_history，交回前端走标准发送链路**

spec 写的是"后端调 chatSendSupplement 写入 supplement_history"。实施时发现：

1. `POST /:id/supplement` 只在 `req.status === 'idea'` 时接受（`requirements.js:1166`），
   自由对话的 hidden requirement 状态虽也是 idea，但 **free 模式会跳过 brief 重生**，
   而 plan 流的 LLM 轮次不是 brief 链路 —— 写 supplement 不必然触发新 LLM 轮次。
2. `detect-and-respond` 自己会 `sessionSvc.appendMessage(reqId, 'user', text)`
   （`chat-intent.js:324`）。若 retry 端点也写一条，会产生**重复 user message**。

**改后契约**（更简单，语义更准）：

```
点 [🔄 重试失败步骤 (N)]
  ↓
POST /api/requirements/:reqId/plan/:planId/retry     ← 纯读，无副作用
  resp: { ok, retried:true, plan_id, session_id, failed_steps:[...], retry_message }
  ↓
前端 renderChatBubble(user, "🔄 重试失败步骤（s2）")   ← 让用户看得见发了什么
  ↓
前端 await chatSendDetect(reqId, r.retry_message)     ← 完全等价用户手打
  ↓
服务端 appendMessage(user) 一次 + SSE 流 → LLM 看到失败上下文自己重规划
```

好处：retry 端点变成**幂等纯函数**（可安全重放）；不碰 supplement 语义；
前端复用 v0.119 中断续发（`chatSendAfterInterrupt`）已验证的链路。

**偏离 2：session 解析用 buddy_memory 映射，不是 chat_sessions.hidden_req_id**

`chat_sessions` 表**没有** `hidden_req_id` 字段。真实映射在 buddy_memory：
key = `session_req:<sessionId>`，value = `<hidden reqId>`
（由 `chat-session-service.getOrCreateSessionRequirement` 写入，`chat-session-service.js:245`）。

`resolveSessionForRetry(reqId)` 两条路径：
- reqId 是 `sess-xxx` → 直接就是 session id
- 否则反查 `buddy_memory` 里 value === reqId 的 `session_req:*` 记录

**错误码全集**：
| code | HTTP | 含义 |
|---|---|---|
| `REQ_NOT_FOUND` | 404 | reqId 不存在 |
| `PLAN_NOT_FOUND` | 404 | req 有但没 plan doc |
| `PLAN_ID_MISMATCH` | 404 | planId 与 doc 内 planId 不符（含 `current` 字段） |
| `NO_FAILED_STEPS` | 200 | 无 failed/skipped → `retried:false`（幂等，不触发 LLM） |

**按钮出现条件**：`overall ∈ {partial_failed, done}` 且 `counts.failed > 0`。
skipped 不计入按钮数字（它们是 failed 的级联下游，重试后会被重新规划）。

**按钮样式**：plan-bubble 全系列**没有 CSS 文件**（v0.48 遗留，靠浏览器默认样式），
所以按钮用内联样式保证可见（`background:#2d3748; color:#e2e8f0`）——
遵循"浮窗按钮显式颜色防隐形"教训。

**测试**：`node server/__tests__/plan-retry.test.js` → 17/17
（5 个纯函数 case + 5 个路由 case[真 express + mock store + Node 内置 fetch] + 7 个前端静态检查）
```

```js
// 前端 plan.js renderPlanInner 加按钮
const failedSteps = (data.steps || []).filter(s => s.status === 'failed' || s.status === 'skipped');
if (failedSteps.length > 0) {
  // 在 plan-detail 末尾加 [🔄 重试失败步骤] 按钮
  buttonsHtml = `<button class="btn-retry-plan" onclick="retryFailedPlan('${reqId}', '${data.plan_id}')">🔄 重试失败步骤 (${failedSteps.length})</button>`;
}

// 全局函数
window.retryFailedPlan = function (reqId, planId) {
  fetch(`/api/requirements/${reqId}/plan/${planId}/retry`, {method: 'POST', headers: {...}})
    .then(r => r.json())
    .then(r => {
      if (r.ok) {
        toast('✅ 已发送重试指令，等 LLM 重新规划', 'success');
      } else {
        toast('❌ 重试失败：' + r.error, 'error');
      }
    });
};
```

**PR5 必做的 5 个测试 case**（`server/__tests__/plan-retry.test.js`）：

| # | Case | 验证 |
|---|---|---|
| 1 | retry 端点构造 user message 正确 | mock reqStore.plan 含 partial_failed → 调 retry 端点 → 检查 supplement_history 末尾的 user entry 含 "[系统提示] 上一次 plan_execute 部分失败" + 失败 step 列表 |
| 2 | 无失败 step 时返回 ok 但不构造 message | plan 全 done → retry 返回 ok 但不写 user entry |
| 3 | plan 不存在时返回 NOT_FOUND | planDoc 为 null → retry 返回 {ok: false, error: 'PLAN_NOT_FOUND'} |
| 4 | reqId 不存在时返回 REQ_NOT_FOUND | reqStore.getById 返回 null → retry 返回 {ok: false, error: 'REQ_NOT_FOUND'} |
| 5 | retry_message 包含每个失败 step 的 error 码 | 注入 MIXED_CLASS_OPS 失败 → retry_message 含 "MIXED_CLASS_OPS" |

**PR5 不做什么**（明确边界）：
- ❌ 不做"只重跑失败 step（不动成功的）"的智能重算（依赖图分析太复杂，留 v0.121+）
- ❌ 不做 plan_done card 整体重写（只加按钮）
- ❌ 不改 chatSendSupplement 接口（只调它）

**PR5 review 检查清单**：
- [ ] `timeout 30 node server/__tests__/plan-retry.test.js` 5/5 通过
- [ ] POST /api/requirements/:reqId/plan/:planId/retry 返回 ok:true + 写入 user entry
- [ ] plan_done card 显示 [🔄 重试] 按钮（仅当 failed/skipped > 0）
- [ ] 按钮 onclick 调 API + toast 提示

**预计代码量**：~120 行（80 后端 + 30 前端 + 测试）

---

## 7. 验收标准

### 7.1 今天这个 case「加 sheet『对比分析』+ 合并考勤 + 打开」

**步骤**：
1. 在 ACMS chat 流（不是 Excel AI 面板）发："帮我把当前打开的 Excel 加个 sheet『对比分析』，把考勤和打开两个 sheet 的数据按姓名合并，写公式 F=B/D"
2. 后端 → LLM 识别 Excel 多步意图 → 调 plan_execute 拆 2 step：
   - s1: office_action(add_sheet)
   - s2: office_action(set_cell × N + set_formula × N, depends_on:s1, refreshContext:true)
3. 前端 plan_loading card → 实时显示 ⏳ → step 1 ok → step 2 ok → plan_done card
4. Excel 真的多了 sheet + 数据 + 公式

### 7.2 部分失败隔离

**步骤**：
1. 同上但故意把 s2 的 sheetId 写错（不存在）
2. 验证：s1 成功（sheet 加了），s2 失败（plan_done card 显示 "❌ s2: invalid sheetId"）
3. Excel 里能看到 sheet 但里面空的

### 7.3 不影响原路径

**步骤**：
1. 在 Excel V3 内 AI 面板发"加 1 行数据"
2. 走原 office-action 路径（不经过 plan_execute）
3. 不报错，行为不变

---

## 8. 不做什么（明确边界）

1. **不动 GenOffice bundle** — 不 rebuild vite，不改 zod schema，不改 description
2. **不替代 Office V3 内 AI 面板** — 那条路径继续单 batch
3. **不做整批回滚**（v0.X）— 增量重试即可
4. **不做跨文件 plan**（v0.X）— plan_executor 跨 REQ 复杂，先不碰
5. **不动 plan_executor 本身** — 复用 v0.48 + v0.49 + v0.119 interrupt 机制

---

## 9. 风险与监控

| 风险 | 缓解 |
|---|---|
| LLM 把多步写成单步（混类） | prompt 加"严禁混类"规则 + office_action handler 加 ops 分类校验（不通过则 reject） |
| structural 后 docContext 失效 | handler refreshContext 自动读 fresh data |
| applyPlan 失败但 plan_executor 报 ok | 前端 apply 失败 → system entry 写回 `plan_step_failed` → plan_done 显示 ⚠ |
| 用户在 V3 内 AI 面板发多步指令 | 走原路径（不经过 plan_execute），继续单 batch，行为不变 |
| LLM 不识别 Excel 多步意图 | prompt 加 "Excel 多步操作" 段 + 多个 example；先用 E2E 跑通稳定后再扩 |

**监控指标**：
- `data/acms.log` 里 `[plan-executor] office_action` 调用频次
- plan_done card 的 step_success_rate / step_fail_rate
- 用户在 chat 流发 Excel 多步指令的频次（vs 单步）

---

## 10. 进度跟踪

| PR | 状态 | 测试结果 | review |
|---|---|---|---|
| PR1: 后端 office_action tool | ✅ 完成 | 51/51 通过 | 待 review |
| PR2: 前端 office_action_apply 渲染 | ✅ 完成 | 25/25 通过 | 待 review |
| PR3: prompt 强化 | ✅ 完成 | 33/33 通过 | 待 review |
| PR4: 端到端验证 | 📍 进行中 | TBD | — |
| PR5: 失败隔离 + 重试 UI | ⏳ 待办 | TBD | — |

---

**附录**：参考的相关 skill
- acms-office-editor-stack（v0.97.x sheets-ui 修复 + host.html runner 模式）
- acms-tool-call-preview（plan_execute + tool_call 编排）
- free-chat-sse-integration-diag（chat 流 SSE + Qwen interrupt）
- acms-app-as-tool（app-tool 注册机制，本方案不直接用，但 office_action 是 server tool 不走 app-tool）
