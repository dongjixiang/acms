# 2026-06-19 use_case B2 改版：2 模式弹层 + 5 段式结构化卡片 + 重点/关联性可视化

## 现象（多多的 3 个观察 + 1 个补充）
1. 整理界面（5 要素 checklist）信息采纳后丢失
2. 需求 description 缺少结构
3. 整理后应"展示→确认→更新"
4. **补充：信息展示可读性不高，"看补充功能的重点和关联性"**（重点=优先级，关联性=依赖关系）

## B1 第一轮做的（v0.13 B1）
- 加 PREVIEW_SYSTEM_PROMPT + previewUseCaseResult
- 加 2 端点 /apply/preview + /apply/confirm
- 前端 ucApply 改调 /preview + 弹 textarea 让用户改
- **问题**：
  - 假设段 LLM 推导"验证方式"导致空段（**修法**：让 LLM 复述原话，不推导）
  - UX 是 textarea 默认可改，**多多要"先预览后改"**（**改法**：2 模式弹层）
  - textarea 纯文本不直观，**可读性差**（**改法**：5 段式结构化卡片）
  - 没有"重点和关联性"可视化（**改法**：优先级 emoji + 依赖/被依赖反查）

## B2 决策（按"6/17 先体验"模式）
B1-直接版 → 升级到 B2 改版：
- **保留**：第一阶段 5 要素 checklist 卡片（用户勾选哪些需求纳入）
- **保留**：preview 阶段调 LLM（输入：原始需求 + 聊天上下文 + 勾选项；输出：5 段式 description）
- **改 UX**：弹层默认**只读模式**（5 段式结构化卡片）+ 用户主动点"编辑"切 **textarea 编辑模式**
- **加可视化**：重点（优先级 emoji + 颜色）+ 关联性（依赖箭头 + 被依赖数 + 优先级分布统计）

## 5 段式结构化卡片（重点 + 关联性）

### 一句话需求
段落（大字，无结构）

### 用户场景
- 按角色 bullet list
- 视觉：每条 `- 角色: 描述`

### 关键功能点（重点 + 关联性双可视化）
- section 顶部小字：`[3 必做 · 7 应做 · 7 能做]` 优先级分布
- 每条 bullet：
  ```
  • UC-001 🔴 [必做] 系统应在销售打开客户详情页的瞬间, ...
    └ 依赖: → SYS-001, → SYS-002
    └ ⭐ 被 2 条依赖
  ```
- 优先级 emoji：必做=🔴 应做=🟡 能做=🟢 不做=⚫
- 依赖箭头：→ ID 文本链（点击无行为，预留 v0.14）
- 被依赖数：⭐ 被 N 条依赖（关键性指标，N=0 不显示）

### 验收关注点
- bullet list: `- [UC-001] 摘要（Given X, When Y, Then Z）`

### 待验证假设
- bullet list: `- A-001 [低] text 原话`（**不推导验证方式**）
- 按风险等级排序（高→中→低）

## prompt 改动（B1 → B2）

### PREVIEW_SYSTEM_PROMPT 关键变更
- "待验证假设"段：删除"验证方式从聊天上下文推导" + "标注 AI 推测"
- 改为：复述 confirmedAssumptions 原话（id + 风险 + text），**不推导验证方式**

## 前端改动（B1 → B2）

### use-case.js 新增/修改

#### parsePreviewDescription(text)
- 解析 LLM 输出 → 结构化对象
- 用 regex 切 5 个 section（识别 `### 一句话需求` 等 header）
- 容错：header 漂移时降级到 `## 1.` `## 一、` 等模式
- 容错：解析失败时返回 null → 弹层降级到 textarea

#### renderPreviewCards(parsed, structuredData)
- 5 个 section 渲染为卡片
- 关键功能点 section：算"被依赖数"（遍历 structuredData 里所有 case 的 deps，反查）
- 优先级 emoji + 颜色（CSS 变量）

#### openUcPreviewLayer(reqId, initialDescription, meta) 重构
- 默认渲染**结构化卡片**（不是 textarea）
- 底部 3 按钮：[✏️ 编辑描述] [✅ 确认采纳] [✕ 取消]
- [✏️ 编辑描述]：弹层就地变 textarea（不嵌套弹层）
- [✅ 确认采纳]：调 /apply/confirm 写库
- [✕ 取消]：关闭弹层，use_case 卡片恢复

#### switchToEditMode(reqId, initialText)
- 把卡片就地变成 textarea（保留 5 段式文本）
- 底部 2 按钮：[✅ 确认采纳] [✕ 取消]

#### 兼容性
- 解析失败时 → 降级到 textarea（保留 B1 行为）

## 改动文件

```
server/services/assists/use-case.js
  └─ ~ PREVIEW_SYSTEM_PROMPT: "待验证假设"段简化（不推导验证方式）

client/js/views/assists/use-case.js
  ├─ + parsePreviewDescription(text) 函数
  ├─ + renderPreviewCards(parsed, structuredData) 函数
  ├─ + renderFunctionPoint(item, depsIndex) 函数（带 emoji + 依赖/被依赖）
  ├─ + renderAssumptionItem(item) 函数（带风险等级 emoji）
  ├─ + renderScenarioItem(item) 函数
  ├─ + renderAcItem(item) 函数
  ├─ ~ openUcPreviewLayer: 默认结构化卡片 + 3 按钮
  ├─ + switchToEditMode(reqId, initialText): 切到 textarea
  └─ + ucPreviewEdit 事件代理（data-uc-edit-desc）
```

预计改动：2 文件 / +200 -30 行

## 数据流（B2）

```
[点"✅ 提交采纳"] ucApply(reqId)
  ├─ POST /apply/preview → LLM 生成 5 段式 description (prompt 改: 不推导验证方式)
  │
  ├─ 解析 LLM 输出 → parsed = { 一句话需求, 用户场景, 关键功能点, 验收关注点, 待验证假设 }
  │   └─ 解析失败 → 降级到 textarea（保留 B1 行为）
  │
  ├─ 弹"5 段式预览"层（默认只读模式）
  │     ├─ 顶部 banner: ✏️ 预览 · 采纳 N 条 · 丢弃 M 条
  │     ├─ 5 个 section 卡片渲染（结构化）
  │     │     ├─ 一句话需求（段落）
  │     │     ├─ 用户场景（bullet list）
  │     │     ├─ 关键功能点（带优先级 emoji + 依赖/被依赖 + 优先级分布统计）
  │     │     ├─ 验收关注点（bullet list）
  │     │     └─ 待验证假设（bullet list, 不推导验证方式）
  │     └─ 底部 3 按钮: [✏️ 编辑描述] [✅ 确认采纳] [✕ 取消]
  │
  ├─ [用户决定改] → 点 [✏️ 编辑描述] → switchToEditMode
  │     ├─ 弹层就地变 textarea
  │     └─ 底部 2 按钮: [✅ 确认采纳] [✕ 取消]
  │
  ├─ [用户决定不改] → 直接点 [✅ 确认采纳] → 调 /apply/confirm 写库
  └─ [点 ✕ 取消] → 关闭弹层, use_case 卡片恢复
```

## 验证步骤

1. Ctrl+C 重启 server
2. Ctrl+Shift+R 硬刷
3. 进 idea req → 聊天底部点"✨ 整理"
4. 勾选 5 要素条目 → 点"✅ 提交采纳"
5. 预期：toast "AI 正在整理为 5 段式结构…" → 弹层出现
6. **检查 1**：5 段式结构化卡片渲染，**不是 textarea**
7. **检查 2**：关键功能点 section 顶部有 `[N 必做 · N 应做 · N 能做]` 分布统计
8. **检查 3**：每条关键功能点有 优先级 emoji + 依赖/被依赖行
9. **检查 4**：待验证假设段有内容（**不推导验证方式**）
10. 点 [✏️ 编辑描述] → 弹层就地变 textarea
11. 编辑几处 → 点 [✅ 确认采纳] → 写库
12. 点 [✕ 取消] → 弹层关闭，use_case 卡片恢复

## 主动指出的局限（按 6/16 SOP）

1. **LLM section header 漂移**：可能输出 "## 1. 一句话" 而非 "### 一句话需求" → 解析失败 → 降级到 textarea
2. **"被依赖数"反查范围**：只查同 req 的 structuredData（不同 req 的 case id 可能冲突，**这是 ACMS 的设计**：每个 req 独立 use_case 结果）
3. **emoji 风格依赖系统字体**：Windows / Mac / Linux 渲染可能不一致 → 兜底：用 CSS unicode 字体栈
4. **textarea 编辑模式用户可能改 5 段式顺序**：写库时直接存用户文本，**不再结构化解析**（信任用户编辑）
5. **"重点 + 关联性"是设计原则不是功能**：本次实现是**视觉化层**（emoji + 颜色 + 依赖反查），不引入新的"功能按钮"（如接受/拒绝假设、点击 ID 跳转等）—— 这些**留作 v0.14 候选**
6. **解析 LLM 输出是"猜"**：regex 解析 5 段式不保证 100% 准确，**降级路径**是 textarea（保留 B1 行为）
7. **优先级分布统计范围**：只算"关键功能点"section 的 ID 优先级（不包含验收关注点和待验证假设，因为它们没优先级）
8. **未在改前 mockup**（按 6/16 "新 UI 交互先给个示意"）：直接动手是因为多多授权"按你的建议来改"，且改动范围明确，**风险可控**
9. **没做端到端 e2e**（按 6/16 SOP "改完 1 service 立即跑 e2e"）：本次需要多多跑 + 截图 LLM 输出给我看实际格式
10. **未 commit/push/restart**（按 6/16 硬约束）

## 6/16 SOP 反思（本轮）

- ✓ plan 落档
- ✓ 改 1 service 立即 grep 同类 pattern（_lastUseCaseStructuredData 格式 + deps 字段）
- ✗ 没在改前 mockup（直接做，按"6/17 先体验"模式 + 多多授权）
- ⏳ 验证依赖多多本地跑

## 落档 / 提交
- ❌ git add/commit/push
- ❌ 部署到 120.24.204.130
- ❌ 自动 restart ACMS 服务
- 落档：.hermes/plans/2026-06-19-use-case-b2-structured-preview.md（本文件）
