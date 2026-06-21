# Plan: 拆分 client/js/views/requirements.js (5070 行 / 261KB)

**Date**: 2026-06-21
**Status**: Plan mode (待多多拍板)
**Author**: 小吉
**Branch**: main
**Est. effort**: 2-3 天（渐进 3 轮）

---

## Goal

把 `client/js/views/requirements.js`（5070 行 / 261KB / 19 sections / ~100 函数）
拆成 6-10 个语义清晰的子文件（目标每个 < 800 行），同时：

1. 0 行为变化（用户看不出来区别）
2. 0 行为回归（不影响 assist 系统、API 调用、HTML onclick）
3. 保持 HTML inline onclick 调用模式（不引入模块系统）
4. 为未来引入"轻量模块加载"留好钩子

---

## Current Context (已摸清)

### 现状数字

- **5070 行 / 261 KB** — 客户端最大 view（其他 view 都在 4-22KB）
- **19 sections** + 头部 ~94 行未标 section
- **~100 函数**（50+50+ 翻页查到）
- **129 处 `onclick=`** 字符串调用 — HTML 注入模式，无 window 导出
- **13 个 `Requirements.*` API 调用面**（见下表）
- **依赖**: core/state.js (App) / core/utils.js / api.js / views/kanban.js

### 19 sections 行数 + 函数数（规模从大到小）

| # | Section | 起止 | 行数 | 函数 | 状态 |
|---|---|---|---|---|---|
| 1 | **Decision Tree 渲染** | L3118-5070 | **1953** | **70** | ⚠️ 名字误导，需摸清 |
| 2 | 行内分段编辑 | L1654-2378 | 724 | 24 | 复杂 |
| 3 | AI 澄清对话 | L562-1136 | 574 | 13 | 核心 |
| 4 | 导出 Word | L2829-3118 | 289 | 8 | 较独立 |
| 5 | HTML 清洗 | L1289-1496 | 207 | 7 | 较独立 |
| 6 | 原型界面/流程 | L1136-1289 | 153 | 4 | 较独立 |
| 7 | 需求拆分 | L2617-2763 | 146 | 4 | 较独立 |
| 8 | 分段卡片 MD | L1511-1654 | 143 | 7 | 复杂 |
| 9 | 需求变更管理 | L168-307 | 139 | 6 | 依赖详情 |
| 10 | 架构宪法 | L323-443 | 120 | 5 | 较独立 |
| 11 | 数据模型 | L443-562 | 119 | 3 | 依赖详情 |
| 12 | 描述历史 | L2503-2617 | 114 | 4 | 较独立 |
| 13 | 需求详情 | L94-164 | 70 | 3 | 核心 |
| 14 | AI 任务分解 | L2378-2448 | 70 | 4 | 较独立 |
| 15 | 父需求刷新 | L2763-2829 | 66 | 2 | 依赖拆分 |
| 16 | 澄清记录弹窗 | L2448-2503 | 55 | 3 | 依赖澄清 |
| 17 | 变更历史 | L307-323 | 16 | 1 | 依赖变更 |
| 18 | 忽略 AI 评审 | L1496-1511 | 15 | 1 | 依赖详情 |
| 19 | 审核操作 | L164-168 | 4 | 2 | 依赖详情 |
| — | (头部 helpers + load + doCreateReq) | L1-94 | 94 | 9+ | 核心 |

### 关键观察

1. **assists/ 已部分抽走**（v0.13 6/20 之前）— `views/assists/` 17 文件 / 113KB 已独立
   - 16 个 assist 模块 + 1 个 dispatcher
   - 16 个文件对应 13 种 assist 方法（部分合并）
   - 决策树、视觉、参考等已迁出，requirements.js 仍负责 **dispatch + HTML shell**

2. **Decision Tree 渲染（L3118-5070, 1953 行 / 70 函数）名字高度误导**
   - 1953 行只渲染一棵 decision tree 不可能（v0.4 B+++ 之前整棵 tree 都迁到 assists/decision-tree.js 了）
   - 推测实际装了：chat 状态机 / 通用 helper / scenarios 残留 / 各种 inline edit / history
   - **必须在 Round 0 摸清真实内容**，否则拆分就是赌博

3. **HTML inline onclick 是拆分最大障碍**
   - 129 处 `onclick="xxx()"` 跨文件无法直接调用（函数必须全局可见）
   - 解决：拆分后新文件里函数仍是全局（保持 `<script>` 加载），HTML 不动
   - 多文件 share 函数 → 抽到 `views/requirements/_shared.js` 公共基座

4. **行内分段编辑（L1654-2378, 724 行 / 24 函数）是大块独立**
   - 完整的 MD section editor（parseMdBlocks / renderSectionCards / saveInlineBlock / 等）
   - 独立性最强，可独立 Round 1 抽走

5. **AI 澄清对话（L562-1136, 574 行）含子结构**
   - 主体: startAiClarify / sendAiClarify / 各种 render
   - 子: 原型界面（L1136-1289）和 HTML 清洗（L1289-1496）紧跟其后
   - 推测：澄清 → 原型 → 清洗 是同一 workflow 的 3 阶段，可一起抽

### 依赖面（13 个 Requirements API 调用）

- `Requirements.create` ×1 — 创建
- `Requirements.list` ×1 — 列表
- `Requirements.get` ×5 — 详情
- `Requirements.updateSrs` ×9 — SRS 更新（最热）
- `Requirements.approve` ×1
- `Requirements.reject` ×1
- `Requirements.transition` ×1
- `Requirements.submitReview` ×1
- `Requirements.splitProposal` ×1
- `Requirements.split` ×1
- `Requirements.refreshParent` ×1
- `Requirements.children` ×1
- `Requirements.progress` ×1

**全部走 `js/api.js` 包装的 fetch**，不直接 hit 后端 — 拆 view 不影响 API 层。

### 风险点（基于事实）

- 🔴 **R1**: L3118-5070 真实内容未摸清，名字误导
- 🟡 **R2**: 129 处 onclick 跨文件共享，需保持全局或挂 window
- 🟡 **R3**: 行内分段编辑（724 行）跨 section 边界，函数互相调用
- 🟡 **R4**: view-detail HTML（L394）写死 `onclick="..."` 引用 requirements.js 函数
- 🟢 **R5**: API 层无变化，零风险
- 🟢 **R6**: 13 个 section 都标了 // ===== 注释，物理边界清晰

---

## Proposed Approach: 渐进 3 轮

按"由小到大、由独立到耦合"原则，3 轮渐进，每轮 1-2 天：

### Round 0（必须先做，半天）— 摸清 L3118-5070

打开 L3118 起的 1953 行 / 70 函数真实内容，给出"它装了什么"的事实清单。
- 不改任何代码，只读 + 标注
- 输出：每个函数 1 行注释，归到「真实功能」类别
- 决定后续 Round 1/2 怎么切

### Round 1（1 天）— 抽 4 个最独立的小块

目标：拿到 quick win，建立拆分模板（公共基座 + 拆分模式），让多多看到效果

| 新文件 | 来源 | 行数 | 风险 |
|---|---|---|---|
| `views/requirements/word-export.js` | L2829-3118 | ~290 | 🟢 |
| `views/requirements/description-history.js` | L2503-2617 | ~115 | 🟢 |
| `views/requirements/change-history.js` | L307-323 + L168-307 部分 | ~20 | 🟢 |
| `views/requirements/prototype.js` | L1136-1289 | ~155 | 🟡 |

**公共基座**: `views/requirements/_shared.js` — fmtArr / escHtml / showConfirm 包装等

**index.html 加载顺序**（保持现状风格）：
```html
<script src="/client/js/views/requirements/_shared.js"></script>
<script src="/client/js/views/requirements/word-export.js"></script>
<script src="/client/js/views/requirements/description-history.js"></script>
<script src="/client/js/views/requirements/change-history.js"></script>
<script src="/client/js/views/requirements/prototype.js"></script>
<script src="/client/js/views/requirements.js"></script>  <!-- 缩到 ~3500 行 -->
```

**验证**:
- `npm test` 仍过（route check 不受影响，但加 require-js 边界 lint？）
- 浏览器手测：创建需求 → 详情 → 描述历史 → 原型 → Word 导出 5 个流程
- `grep -c "onclick=" client/js/views/requirements.js` 应减少 ~30

### Round 2（1 天）— 抽 3 个大块

前提：Round 0 摸清 L3118 后才能定这轮的边界

| 新文件 | 来源 | 行数 | 风险 |
|---|---|---|---|
| `views/requirements/clarify.js` | L562-1136 + 紧跟的 clarifications | ~630 | 🟡 |
| `views/requirements/md-editor.js` | L1511-1654 + L1654-2378 | ~870 | 🟡 |
| `views/requirements/split.js` | L2617-2763 + L2763-2829 | ~215 | 🟢 |

**风险缓解**:
- clarify.js 跨 2 个 section，可能需要先抽 helper 到 `_shared.js`
- md-editor.js 跨 2 个 section（分段卡片 + 行内编辑），先确认是否真的能一起抽
- split.js + refreshParent.js 合并，单一职责清晰

### Round 3（半天-1 天）— 收尾

把 L3118-5070 拆成 2-3 个文件（基于 Round 0 的事实清单）

| 新文件 | 来源（推测） | 风险 |
|---|---|---|
| `views/requirements/chat.js` | chat 状态机部分 | 🟡 |
| `views/requirements/misc.js` | 散落的 helper + 历史 | 🟢 |
| `views/requirements.js` | 头部 + 列表 + 创建 + 详情 + 审核 + 决策树渲染入口 | 🟢 |

**目标**: requirements.js 缩到 **< 800 行**（列表 + 创建 + 详情 + 审核 + decision tree 入口）

---

## Files Likely to Change

### 新增（10 个）

```
client/js/views/requirements/_shared.js           # 公共基座
client/js/views/requirements/word-export.js
client/js/views/requirements/description-history.js
client/js/views/requirements/change-history.js
client/js/views/requirements/prototype.js
client/js/views/requirements/clarify.js
client/js/views/requirements/md-editor.js
client/js/views/requirements/split.js
client/js/views/requirements/chat.js             # Round 3
client/js/views/requirements/misc.js             # Round 3
```

### 修改

- `client/js/views/requirements.js` (5070 → 800 行)
- `client/index.html` (line 412，加 9-10 个 script tag，按依赖顺序)
- `scripts/verify-route-registration.js` (可选 — 加 js 文件数 lint)

---

## Tests / Validation

### 自动化（每轮必跑）

1. `npm test` — route-registration 仍干净
2. `node --check client/js/views/requirements.js` — 语法
3. `node --check client/js/views/requirements/*.js` — 语法（Round 1+ 后）
4. `grep -c "onclick=" client/js/views/requirements.js` — 应递减
5. `wc -l client/js/views/requirements.js` — 应递减

### 浏览器手测（每轮必跑，按多多 6/13 SOP「改 UI 不写 demo」要求多多亲自验）

**Round 1 验**:
- 创建需求（doCreateReq 流程）→ 跳详情
- 详情页 → 描述历史（恢复）→ 原型界面（生成）
- 详情页 → Word 导出

**Round 2 验**:
- 详情页 → AI 澄清（多轮对话）
- 详情页 → MD 编辑器（行内分段编辑 + 接受/拒绝 AI 重写）
- 详情页 → 需求拆分

**Round 3 验**:
- 详情页 → 决策树渲染（实际功能回归）
- 详情页 → 状态机/聊天（看 Round 0 摸出的是啥）
- 端到端跑 1 个完整需求：创建 → 澄清 → 决策树 → 拆分 → 任务分解

### 性能检查（不期望明显变化，但要 verify）

- 打开 index.html 加载时间不变（script tag 数从 ~25 → ~35，多文件并行解析，实际更快）
- `console.log` 行为不变

---

## Risks, Tradeoffs, and Open Questions

### 已知风险

| ID | 风险 | 缓解 |
|---|---|---|
| R1 | L3118-5070 名字误导 | Round 0 必做（半天） |
| R2 | 129 onclick 跨文件 | 函数保持全局（HTML 不动） |
| R3 | 行内 MD 编辑跨 2 section | Round 2 拆前先 inline 验证 |
| R4 | 拆分顺序影响依赖 | 按依赖图拓扑序加载 script tag |
| R7 | 浏览器缓存导致旧 JS 不刷 | 每次加 `?v=0.x.x` 强制刷新 |
| R8 | 拆分后局部函数被其他 view 引用 | 拆分前先 grep 跨文件调用 |

### Open Questions（需要多多拍板）

1. **拆分粒度**：6 / 8 / 10 个文件？多多想要多少？
   - 6 个：粗粒度，每个 view 一个
   - 8 个：推荐
   - 10 个：细粒度（每 section 一个），维护更简单但 script tag 多

2. **公共基座 _shared.js 放哪**？
   - 选 A: `views/requirements/_shared.js`（局部）— 推荐
   - 选 B: `core/req-utils.js`（全局）— 但 core/ 目前是基础设施，污染风险
   - 选 C: 抽到 `views/shared.js`（跨 view 共享）— 长期好但当前只有 requirements 用

3. **是否趁机引入"轻量模块加载"**（如 IIFE + 命名空间）？
   - 选 A: 不引入，保持全局 — 推荐（风险最低）
   - 选 B: 引入 `window.RequirementsView = { ... }` 模式（防止命名冲突）
   - 选 C: 引入 ES Modules（影响 IE / 老浏览器，且要改全部 script tag → 大改）

4. **L3118 真实内容摸清后可能要重新设计拆分边界**？
   - 如果 L3118 真的是 chat 状态机 → 它跨多个 section 调用，需要更细的依赖分析
   - 多多 OK 我每轮做完后**主动问要不要调整下轮计划**吗？

5. **是否需要保留旧 requirements.js 作 fallback**？
   - 选 A: 不保留，删干净 — 推荐
   - 选 B: 保留 `requirements.legacy.js` 灰度 1-2 周（但会多一个文件 + 维护成本）

---

## Recommended Next Step

**多多拍板以下 3 个问题**：

1. **拆 6 / 8 / 10 个？**
2. **公共基座放哪里？** (A 局部 / B core / C views/shared)
3. **要不要 Round 0？** (必做 — 不摸清 L3118 就动手是赌博)

我建议：**Round 0 必做 + 拆 8 个 + 选 A 公共基座**。

确认后我开始 Round 0（半天读 + 标注 L3118-5070），不写任何新文件，只输出一份 L3118 真实内容清单给多多看。
