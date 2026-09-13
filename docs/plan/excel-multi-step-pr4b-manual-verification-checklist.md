# PR4b + PR5 浏览器手动验证清单

**目标**：验证 PR1-5 的改动让 LLM 在真实 chat 流 + 真实 Excel V3 编辑器下端到端工作，
且 plan 部分失败时能一键重试。

**前置条件**：
- [ ] ACMS 服务在跑（`start.bat` 或 `node server/index.js`）
- [ ] 浏览器打开 ACMS 主界面
- [ ] 准备好一个有"考勤"和"打开"两个 sheet 的 xlsx 文件（可以用上次那个，或造一个）

> ⚠️ **前端改动需硬刷新**：PR5 改了 `plan.js?v=0.120` + `chat.js?v=0.22.49`，
> 浏览器 Ctrl+Shift+R 强制刷新后再测，否则拿到缓存旧版看不到重试按钮。

---

## 步骤 1: 启动服务

```bash
cd C:\Users\swede\acms
# 如果服务没在跑，先启动：
node server/index.js
# 验证：curl http://localhost:3300/api/health -H "X-API-Key: dev-key-001"
```

## 步骤 2: 打开 Excel V3 编辑器

1. 浏览器 → ACMS 主界面
2. 辅助工具 → Excel
3. 打开你的 xlsx 文件（有"考勤"+"打开"两个 sheet）
4. 确认能在编辑器看到两个 sheet 的 tab

## 步骤 3: 在 chat 流发指令

**关键**：是 chat 流（requirement 详情页的对话区），**不是 Excel V3 编辑器内的 AI 面板**。

发指令（可调整成你自己的实际需求）：
```
帮我把当前打开的 Excel 加一个 sheet『对比分析』，把考勤和打开两个 sheet 的数据
按姓名合并，写公式 F=B/D
```

## 步骤 4: 观察 chat 流（预期行为）

| # | 观察点 | 期望 | ❓ |
|---|---|---|---|
| 1 | LLM 是否识别为 Excel 多步意图？ | chat 流出现 ⏳ plan_loading card（不是普通文本回复）| ☐ |
| 2 | step 1（新增 sheet）是否成功？ | chat 流出现 ✅ 气泡（来自 office_action_apply entry 渲染）| ☐ |
| 3 | step 2（写表头/数据/公式）是否成功？ | chat 流出现第二个 ✅ 气泡 | ☐ |
| 4 | 最终是否有 plan_done card？ | 显示 "📋 全部完成" 或 "⚠ 部分失败" | ☐ |
| 5 | plan_done card 的 step 状态？ | 展开看到 s1=✅ s2=✅（或 s2=❌ + 原因）| ☐ |

## 步骤 5: 观察 Excel（应用层验证）

| # | 观察点 | 期望 | ❓ |
|---|---|---|---|
| 1 | Excel tab 是否多了"对比分析"？ | 是 | ☐ |
| 2 | A1 / B1 / C1 等表头是否填好？ | 表头亮起（姓名 / 考勤天数 / 迟到次数 / 打开次数 / 打开天数 / 比率）| ☐ |
| 3 | F 列公式是否生效？ | 选中 F2 看 fx 框显示 `=B2/D2` | ☐ |
| 4 | Ctrl+S 保存后状态栏？ | "● 未保存" → "✓ 已保存" | ☐ |

## 步骤 6: 持久化验证

| # | 操作 | 期望 | ❓ |
|---|---|---|---|
| 1 | 关掉 Excel V3 编辑器 | 无报错 | ☐ |
| 2 | 重新打开同一个 xlsx 文件 | "对比分析" sheet 仍在 | ☐ |
| 3 | 数据/公式是否还在？ | 表头、公式、计算结果都保留 | ☐ |

## 步骤 7: 部分失败路径验证（可选）

把步骤 3 的指令故意模糊化，让 LLM 生成一个会失败的 plan：

```
帮我给当前 Excel 的『对比分析』sheet 加一些数据
```

如果 LLM 输出了 plan_execute（很可能不会，因为没明确结构），观察：
- 部分 step 失败 → plan_done 显示 ⚠
- 成功的 step 在 Excel 里能看到效果
- 失败的 step 显示具体错误（不再卡 schema 校验错误，而是清晰的 MIXED_CLASS_OPS / NO_DOC_CONTEXT）

## 步骤 8: 失败信息回写验证（如果 plan 失败）

| # | 观察点 | 期望 | ❓ |
|---|---|---|---|
| 1 | 失败原因显示具体错误码？ | MIXED_CLASS_OPS / NO_DOC_CONTEXT / UNKNOWN_OPS / OFFICE_ACTION_FAILED | ☐ |
| 2 | 错误信息指向具体哪个 step？ | "s2 失败：MIXED_CLASS_OPS（混类：structural+content）"| ☐ |
| 3 | 之前成功的 step 状态保留？ | "s1 已完成：新增 sheet" | ☐ |

## 步骤 9: 🔄 一键重试（PR5 新增）

**前提**：步骤 7/8 触发了 plan 部分失败，plan-bubble 显示 ⚠ 部分步骤失败。

| # | 观察点 | 期望 | ❓ |
|---|---|---|---|
| 1 | plan-bubble 展开后有 [🔄 重试失败步骤 (N)] 按钮？ | 有，N = failed 步骤数（不含 skipped）| ☐ |
| 2 | 按钮可见吗（不是透明的）？ | 深灰底 + 浅色字，明显可点 | ☐ |
| 3 | 全部成功的 plan 有没有这个按钮？ | **没有**（按钮只在 failed>0 时出现）| ☐ |
| 4 | 点击按钮后？ | 出现 toast「已发起重试：N 个失败步骤」+ 用户气泡「🔄 重试失败步骤（s2）」 | ☐ |
| 5 | 之后是否自动开始新一轮？ | chat 流出现新的 plan_loading / AI 思考中，不需要再手打指令 | ☐ |
| 6 | 新一轮的 plan 是否避开了上次的失败原因？ | 具体看：不再混类（拆成独立 step）/ 不再缺 docContext | ☐ |
| 7 | 已成功步骤是否被重做？ | **不应重做**（retry_message 里明确说了"不要重做"）| ☐ |

**验证 retry_message 内容**（可选，用 console 看）：
```js
// 浏览器 console 里发：
fetch('/api/requirements/'+REQ_ID+'/plan/'+PLAN_ID+'/retry',{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':'dev-key-001'},body:'{}'})
  .then(r=>r.json()).then(d=>console.log(d.retry_message))
```
期望看到：`[系统提示] 上一次 plan_execute 部分失败` + 已完成清单（✅ s1）+ 失败清单（❌ s2 · 错误：MIXED_CLASS_OPS）+ 三条重试约束。

**幂等验证**：对同一个全部成功的 plan 调 retry → 应返回 `{retried: false, reason: "NO_FAILED_STEPS"}`，
不写任何消息、不触发 LLM。

---

## 验收通过标准

**全部满足即可验收**：
- [ ] 步骤 4 全部 5 个观察点 ✅
- [ ] 步骤 5 全部 4 个观察点 ✅
- [ ] 步骤 6 全部 3 个操作 ✅

**部分失败路径（可选）**：
- [ ] 步骤 7 验证
- [ ] 步骤 8 验证（如果步骤 7 触发失败）
- [ ] 步骤 9 验证（PR5 一键重试，需步骤 7 先触发失败）

---

## 如果遇到问题

### LLM 没识别 Excel 多步意图（只回了文本）

→ 看 `data/acms.log` 里 `[plan-executor]` 调用 — 没调用说明 LLM 不识别
→ 检查 prompt 是否包含 "office_action 多步操作必须调 plan_execute" 段（grep `server/routes/chat-intent.js`）
→ 检查 INTENT_TOOL_NAMES 是否含 `'office_action'`（node -e `require('./server/routes/chat-intent').getIntentToolNames().indexOf('office_action') >= 0`）

### 报 "MIXED_CLASS_OPS" 但用户没要求混类

→ LLM 没读懂 "严禁混类" 规则 → 看 prompt 段落是否清晰
→ 看 plan step 的 operations 数组结构是否真的混类

### Excel 没看到结果（plan_done 成功但 Excel 空的）

→ 看 chat 流是否有 `❌ 缺少 kind 或 action` 气泡 → 渲染逻辑报错
→ 看浏览器 console 是否有 `__sheetsDebug` 报错 → GenOffice bundle 加载问题

### 数据保存后丢失

→ 按 Ctrl+S 看状态栏 "● 未保存" 是否变 "✓ 已保存"
→ 如果一直是未保存 → sheets-ui 的 saveXlsxNow 没被调（看 office-v3-bridge.js:__markDirty 钩子）

---

## 测试反馈

跑完后告诉我：
1. 步骤 4-6 是否全部通过
2. 如果失败，贴 chat 流截图 + data/acms.log 相关行
3. 你打算多久内自己跑一次？

我会在你跑完反馈后再决定 PR5（重试 UI）要不要做、做什么。
