# Round 0 事实清单：L3118-5070 真实内容

**Date**: 2026-06-21
**Status**: Round 0 诊断输出（未动手，只读）
**结论**: 拆 13 个文件，requirements.js 缩到 ~300 行

---

## L3118「Decision Tree 渲染」实际是 7 大子系统

| 子系统 | 行数 | 关键函数 | 拆到哪 |
|---|---|---|---|
| 1. 决策树渲染（真名） | ~140 | renderDecisionTree / submitDecisionBranch / skipDecisionTree / pickDecisionBranch | `decision-tree.js` |
| 2. AI 重写 + Assist 信号 | ~100 | aiRewriteDescription / collectAssistSignals | `ai-rewrite.js` |
| 3. Thinking Brief 控制 | ~50 | regenerateThinkingBrief / skipThinkingBrief / triggerInsightPreviews | `brief-control.js` |
| 4. **聊天核心**（最大块） | ~860 | loadChatStream / startChatPolling / renderChatBubble / renderBriefBubble / renderAssistLayer / chatUpload* / chatHandlePaste / chatSend / connectStreamingBrief / connectAssistStream / chatRegen | **`chat.js`** |
| 5. **AI 状态机**（v0.13 B5 核心） | ~480 | _aiGetState / _aiSetState / showAiPopover / selectAiMode / applyAiDraft / triggerAiAutoSend / confirmAiAuto / _aiStartAutoCountdown / _aiSetupInputListener / _aiCheckDirectionCheckpoint / _aiContinueAfterCheckpoint | **`ai-state.js`** |
| 6. 聊天 Assist 操作 | ~210 | chatAssist / chatSendAssistPick / chatAssistRegen / chatSkipAssist / chatRewrite / chatDone | **`chat-assist.js`** |
| 7. 聊天 UI + 澄清历史 | ~100 | toggleChatMaximize / chatScrollToBottom / chatSendSupplement / chatExportWord / toggleClarifyHistory | 合到 `chat.js` |

**70 个 function 拆到 6 个文件 + 1 个合到 chat**——比原 plan 的 4 个 Round 1 抽走文件多 2 个新大块（chat.js, ai-state.js）。

---

## 修正后的拆分方案

### 新文件清单（13 个）

```
client/js/views/requirements/
├── _shared.js              # 公共基座 (escHtml, fmtArr, fmtLocalTime, showConfirm, sanitizeWireframe 等)
├── decision-tree.js        # L3118-3258  决策树渲染 (~140)
├── ai-rewrite.js           # L3260-3363  AI 重写 + Assist 信号 (~100)
├── brief-control.js        # L3364-3433  Brief + Insight 控制 (~70)
├── chat.js                 # L3404-4061 + 4062-4261 + 4963-5070  聊天核心 + 流式 + UI (~960)
├── chat-assist.js          # L4751-4962  聊天 Assist 操作 (~210)
├── ai-state.js             # L4262-4749  AI 自动回复状态机 (~480)  ⚠️ v0.13 B5 活跃区
├── word-export.js          # L2829-3118  Word 导出 (~290)
├── description-history.js  # L2503-2617  描述历史 (~115)
├── change-history.js       # L168-323    变更管理 + 变更历史 (~155)
├── prototype.js            # L1136-1289  原型界面 (~155)
├── md-editor.js            # L1511-2378  分段卡片 + 行内编辑 (~868)
├── split.js                # L2617-2829  需求拆分 + 父刷新 (~213)
├── data-model.js           # L443-562    数据模型 (~120)
└── arch.js                 # L323-443    架构宪法 (~120)
```

### requirements.js 缩到 ~300 行，剩：

- 头部 helpers（fmtArr, escHtml 包装）— 1-94 (~94 行)
- 列表 + 创建（loadRequirements, doCreateReq, showCreateReq）— 95-163 (~70 行)
- 详情（openRequirement, renderThread, renderReviewPanel）— 95-163 跨 (~70 行)
- 审核（approveReq, rejectReq, forceSubmitReview）— 164-168 + 1496-1511 (~25 行)
- 调度入口（openRequirement 内调用各子模块 render）— 接管各 view 的入口
- AI 澄清对话入口（startAiClarify / sendAiClarify — 也许留主文件）

---

## Round 1 调整（与原 plan 差异）

### 原 Round 1 计划（4 个文件）
1. word-export.js (~290)
2. description-history.js (~115)
3. change-history.js (~20)
4. prototype.js (~155)

### 修正后 Round 1 建议（5 个文件 + 公共基座）

加 1 个 **`_shared.js`**（公共基座）作为拆分模板 — 后续每轮所有新文件都先从基座取 helper。

调整后 5 个：
1. `_shared.js` (基座)
2. `word-export.js` (~290) — 最独立
3. `description-history.js` (~115) — 较独立
4. `change-history.js` (~155) — 依赖详情但有清晰边界
5. `prototype.js` (~155) — 依赖澄清但 prototype 是独立子系统

总抽出 ~810 行 → requirements.js 缩到 ~4260 行

---

## 关键风险（基于 Round 0 事实）

### 🔴 R9: AI 状态机（_ai* 函数）跨 L4262-4749 紧耦合
- 22 个 `_ai*` 函数共享 `_aiGetState` / `_aiSetState` 全局状态
- 必须**整块迁移**到 ai-state.js，不能拆开
- 这是多多 6/19-20 v0.13 B5 连续修的活跃区，**最后再动**

### 🟡 R10: chat.js 跨多段，依赖 4 个不同子系统
- L3404-4061 聊天核心（流式 + 附件）
- L4062-4261 流式 brief/assist 连接
- L4963-5070 UI helper
- 函数互相调用：chatSend → connectStreamingBrief → _aiCheckAndStartAuto
- 建议 **Round 2 一次性抽 chat.js + ai-state.js + chat-assist.js**（3 个文件一并动）

### 🟡 R11: 决策树只占 140 行，名字误导
- 真实功能只占 L3118-3258
- 剩下 L3258+ 都是被错误归到「Decision Tree」section 的其他功能
- 修正方案里 `decision-tree.js` 只需要 140 行（小文件）

### 🟢 R12: 行内 MD 编辑（724 行）跨 2 个 section
- L1511-1654 分段卡片 + L1654-2378 行内编辑
- 推测可合并为单一 `md-editor.js`（~868 行），但需要验证函数是否真互相调用

---

## 修订后的 Round 1 → Round 3 计划

### Round 1（1 天，5 个文件，~810 行抽出）
- `_shared.js` 基座
- `word-export.js`
- `description-history.js`
- `change-history.js`
- `prototype.js`
- **目标**: requirements.js 5070 → 4260 行

### Round 2（1 天，3 个文件，~500 行抽出）
- `ai-rewrite.js` (~100)
- `brief-control.js` (~70)
- `decision-tree.js` (~140)
- `arch.js` (~120)
- `data-model.js` (~120)
- **目标**: requirements.js 4260 → 3760 行

实际可执行 — Round 1 + Round 2 一次性 commit，拆 9 个文件

### Round 3（1-2 天，3 个大块）
- `chat.js` + `ai-state.js` + `chat-assist.js`（3 个文件一并动，~1650 行）
- 风险最大，多多亲自验

### Round 4（半天，收尾）
- `md-editor.js` (~868)
- `split.js` (~213)
- **目标**: requirements.js 缩到 ~300 行

### 总览

| 轮 | 文件数 | 抽出行 | 累计剩 |
|---|---|---|---|
| Round 0 | (摸清) | 0 | 5070 |
| Round 1 | 5 | 810 | 4260 |
| Round 2 | 4 | 330 | 3930 |
| Round 3 | 3 | 1650 | 2280 |
| Round 4 | 2 | 1080 | ~1200 → ~300 (含 helpers) |
| **目标** | **14** | **~3870** | **~300** |

---

## 拍板请多多确认

Round 0 修正后比原 plan 多 4 个文件 + 1 轮。

我建议**继续按修正方案开 Round 1**（5 个文件 + 基座），每 1 个 commit + 报告。

如果多多觉得 5 个文件太多，可以**只先抽 3 个最独立的**（word-export + description-history + _shared），拿到 quick win 再说。

**继续开干 Round 1（5 文件 1 commit）**，还是**先只抽 3 个最独立**？
