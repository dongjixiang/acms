# ACMS Office V3 集成方案 — GenOffice 引擎（docx/pptx 真编辑）

> 版本：v1.0 ｜ 2026-08-13 ｜ 作者：小吉（调研+验证）／多多（决策）
> 前置事实：GenOffice 中文 POC 全链路通过（parse/渲染/编辑/保存/Word COM 打开），见 `acms-poc-genoffice/` 与 skill P130。

---

## 1. 背景与目标

### 1.1 现状（v0.92）

| 应用 | 引擎 | 问题 |
|---|---|---|
| Word | Tiptap v3 | 覆盖仅 ~22%，无分页/批注/修订，保存走 JSON→writeDocx 重建 |
| Excel | Univer 0.25.1 | 基本可用（引擎本身 OK） |
| PPT | Reveal.js 6 | **假编辑器**：不能读写 .pptx，保存的是 HTML |

### 1.2 目标

1. **Word/PPT 变真编辑器**：读真 OOXML、编辑、保存，Word/PowerPoint 打开无损（byte-preserving round-trip 已实测）
2. **中文一等公民**：字体、eastAsia 槽位、IME、标点（GenOffice 实测全过）
3. **小吉可参与编辑**：AI 与人交替修改同一文档（P127 标准），有 diff 审查
4. **性能可控**：桌面 boot 零影响、按需加载、Excel 零增量
5. **可回滚**：灰度切换，随时退回 v2

---

## 2. 方案总览

**一句话**：抽取 GenOffice 的 docx-engine / pptx-engine / pptx-render（纯 TS、Apache-2.0、中文一等公民），用 bridge 模式（P117 既有模式）接入 ACMS，Excel 引擎保持 Univer 不动但**叠加 GenOffice sheets AI 栈（选项 3：单元格+公式+格式+结构+图表+透视表全量）**，后端 API 零改动（save/load 的 `content` base64 通道已支持）。

```
ACMS 桌面 (launcher: office-word / office-pptx / office-xlsx)
    │
    └─ office-v3-bridge.js（新增，v0.93）
         ├─ 注册 office-v3-word / office-v3-slides / office-v3-xlsx + 覆盖 office-word / office-pptx / office-xlsx
         ├─ idle prefetch + dynamic import + ACMSWin.onClose dispose（复用 P117 模式）
         └─ rollback: localStorage office-v3-disabled=1 → 回 v2
              │
              ├─ word-engine.js   (0.17MB gz) docx-engine 打包 → blocks → contenteditable 渲染
              ├─ slides-engine.js (0.14MB gz) pptx-engine+pptx-render → RenderNode → DOM/SVG
              ├─ xlsx-ai.js       (sheets AI 栈，见 5.7) Univer 0.25.1（同版本）+ AI DSL
              │     └─ 单元格/公式/格式/结构 DSL → edit-journal → Univer
              │     └─ 图表：chart-visual + chart-recommend + SVG 渲染
              │     └─ 透视表：pivot-engine + xlsx gateway 解析
              │
              └─ 文件 IO（复用 /api/office/*）
                   load  : resp.content (base64 原始字节) → 前端解码 → parseDocx/openPptx
                   save  : saveDocx/openPptx 字节 → base64 → POST {content} → 原样存盘
```

**Excel 为什么不换引擎**：GenOffice 的 xlsx 就是 Univer ^0.25.1——**与 ACMS 现用完全同版本**（实测 package.json），换引擎零收益；但它的 AI 层（workbook DSL + 图表 + 透视表）是 Univer 之上的自研栈，**可以直接移植叠加**（选项 3）。

---

## 3. 关键技术决策

| # | 决策点 | 选择 | 理由 | 代价/反面 |
|---|---|---|---|---|
| D1 | Word 渲染层 | **阶段1：最小 contenteditable renderer（POC 已验证）**；阶段2 评估官方 React renderer | 1-2 天可上线，全链路已验证 | 无分页视图/批注/修订 UI（阶段2补） |
| D2 | PPT 渲染层 | pptx-render 的 RenderNode 树 → DOM/SVG + opentype.js 度量 | 逐字 glyph 精确排版已实测；不引 canvas 引擎 | 编辑交互（拖拽/缩放）需自建（PPT 已有 resize 机制可复用 v0.66） |
| D3 | 引擎获取 | **vendor 源码**（monorepo tarball 抽取，锁定版本） | 未发 npm；锁定版本防 API 漂移 | 升级要手动合源码 |
| D4 | 字体 | 系统字体优先（宋体/黑体/等线/微软雅黑）+ 思源子集兜底（OFL，client/fonts/） | 中文字体 100% 可用；Noto 仅文档缺字体时按需加载 | 2.4MB 首次加载（缓存后零） |
| D5 | 小吉对接 | 前端工具 API（window.OfficeV3）+ block 级编辑 + 快照 diff | 不依赖 GenOffice 的 Genspark 后端（用小吉自己的 LLM） | ai-provider 复用价值低（架构参考） |
| D6 | Excel 引擎 | **不动**（Univer ^0.25.1，与 GenOffice 同版本） | 零增量、零风险；AI 栈叠加在现有引擎上 | 无 |
| D7 | 后端 | **零改动** | save/load 的 content base64 通道已存在 | 无 |
| D8 | 回滚 | localStorage flag + v2 代码保留 | 一键回退 | 双份代码体积（可接受） |
| D9 | 公式重算 | **先用 Univer 自带 engine-formula**（ACMS 现有）；IronCalc wasm（2MB）作为 P4c 后评估 | Univer 公式引擎已能算常见公式；IronCalc 更准（calamine 读 + 独立计算引擎），opendesk-office 已用 @ironcalc/wasm 0.8.4 | 复杂公式一致性要求高时再引入 wasm（+2MB 按需加载） |
| D10 | AI 面板 UI | **vanilla JS 重写**（不引 React） | GenOffice 的 AiChatPanel 是 React 19，ACMS 是 vanilla；交互模式（消息 + auto-applied 卡片 + [Undo] 按钮）照搬即可 | 面板样式自绘（参考 ACMS 既有 chat UI） |
| D11 | 透视表数据源 | pivot-engine 纯计算层直接搬；gateway 读 OOXML 定义；流式加载不做（ACMS 小文件整表加载） | pivot-engine 不依赖流式；流式只是大文件加载优化 | 超大 xlsx（>10MB）打开慢（现状已如此，非新增） |

---

## 4. 分阶段实施计划

| 阶段 | 交付物 | 验收标准 | 工时 |
|---|---|---|---|
| P0 资产准备 | client/lib/office-v3/ 产物 + 字体 + sheets AI 源码 vendor 化 | word-engine.js 0.17MB gz / slides-engine.js 0.14MB gz 可 dynamic import；apps/sheets/src 相关模块（ai/domain/gateway/renderer 子集）入库 | 1天 |
| P1 Word 全链路 | office-v3-word.js：加载→渲染→编辑→保存 | 中文 docx 打开/编辑/保存，**Word COM 打开无损坏**（复用 verify-word.ps1） | 1.5天 |
| P2 PPT 全链路 | office-v3-slides.js：渲染→文本框编辑→保存 | 中文 pptx 打开/编辑文本/保存，PowerPoint 打开无损坏 | 2天 |
| P3 Bridge 集成 | office-v3-bridge.js + index.html 挂载 | 桌面 launcher 点 Word/PPT/Excel 走 v3；文件浏览器打开 docx/pptx/xlsx 走 v3；rollback 生效 | 1天 |
| P4a sheets AI 核心 | xlsx-ai.js：workbook DSL（单元格/公式/格式/结构 4 类 20+ 操作）+ edit-journal + 撤销 | 小吉 propose_operations 改单元格/公式/格式/行列 → 表格即时更新 → Undo 回滚 → 保存 xlsx 无损 | 3-4天 |
| P4b 图表 | chart-visual + chart-recommend + SVG 渲染 + AI 图表工具（add_chart/edit_chart/delete_visual） | 小吉"给 B2:C10 生成柱状图"→ 图表渲染 + 保存后 xlsx 含图表 | 2-3天 |
| P4c 透视表 | pivot-engine 7 模块 + xlsx gateway 透视解析 + AI 工具（add_pivot/refresh_pivot） | 小吉"对数据区建透视表按部门汇总"→ 透视表渲染 + 保存无损 | 3-5天 |
| P5 小吉集成 | OfficeV3 工具 API + AI 面板（vanilla，消息 + auto-applied 卡片 + [Undo]） | LLM 可调用 Word/PPT/Excel 三类编辑；用户看卡片回滚 | 2天 |
| 合计 | | | **~15-17 人日** |

---

## 5. 详细设计

### 5.1 引擎打包（P0）

```bash
# 抽取（monorepo tarball → vendor/office-v3/engine/）
docx-engine/  pptx-engine/  pptx-render/  font-metrics/  i18n/

# 打包（两个独立 ESM entry，浏览器平台）
npx esbuild engine/docx-engine/src/index.ts --bundle --minify --format=esm \
  --platform=browser --outfile=dist/word-engine.js \
  --external:node:fs --external:node:crypto --external:node:zlib   # 浏览器端用 crypto.subtle/JSZip 替代

npx esbuild engine/pptx-render/src/index.ts --bundle --minify --format=esm \
  --platform=browser --outfile=dist/slides-engine.js \
  --external:node:* \
  --alias:@genoffice/pptx-engine=<同层相对路径>   # 或 sed 改相对路径（P130 已验证）
```

产物放 `client/lib/office-v3/`：
- `word-engine.js`（docx 解析/生成/补丁）~0.17MB gz
- `slides-engine.js`（pptx 解析+渲染树）~0.14MB gz
- `opentype.js`（字体度量，PPT 必需）~0.2MB gz
- `fonts/NotoSansCJKsc-Regular-subset.woff2`（2.4MB，仅缺字体时按需）

> 打包坑全部记录在 skill P130（node:* external、@genoffice 子路径、Windows 路径、PowerShell 编码、base64 分段取回）。

### 5.2 Word renderer（P1）

复用 POC 已验证的最小 renderer（web/main.js 逻辑迁移到 ACMS）：

- **契约**：`export function mountWord(targetId, opts) → { destroy(), getBlocks(), save() }`
- 加载：`fetch /api/office/load/:fileId` → `resp.content`（base64）→ `decodeURIComponent`/`atob` → `Uint8Array` → `parseDocx`
- 渲染：blocks → 段落 div（contenteditable）+ 表格只读 + 图片/passthrough chip（POC 已验证）
- 编辑：input 事件标记 dirty
- 保存：dirty 段 → `{kind:'generated', block}`，其余 `{kind:'original'}` → `saveDocx` → base64 → `POST /api/office/save {content, name}`
- **阶段2（可选）**：抽取 GenOffice 官方 renderer（apps/docs/src/renderer，React 19），补分页视图/批注/修订/字号选择器——评估后再定，不阻塞上线

### 5.3 PPT renderer（P2）

- 契约：`export function mountSlides(targetId, opts) → { destroy(), save() }`
- 加载：`openPptx(resp.content字节)` → deck
- 渲染：`buildRenderSlide(slide, size, {fitWidthPx, metrics: opentypeMetrics})` → RenderNode 树 → DOM（div 定位 + text glyph 定位）；文本框 div 可编辑（contenteditable），失焦回写 text model
- 编辑：文本框段落 → `patchTextElementXml`（引擎 API）或全量 `savePptx`
- 保存：`savePptx(deck)` → base64 → POST
- 复用 ACMS 既有 PPT resize 机制（v0.66 `.ppt-obj-wrap`）做元素选择/缩放

### 5.4 Bridge v3（P3）

新文件 `client/js/views/office-v3-bridge.js`（参照 v2 的 448 行骨架）：

```
- BASE = '/client/lib/office-v3/'
- 注册：office-v3-word / office-v3-slides（新名）+ 覆盖 office-word / office-pptx（旧名）
- Excel：不注册，保持 v2（bridge v2 继续管 office-xlsx）
- prefetch：idle 3s 预取 word-engine.js + opentype.js；8s 预取 slides-engine.js
- rollback：localStorage office-v3-disabled=1 → 不注册 v3，v2 继续生效
- 脚本顺序：index.html 中 office-v3-bridge.js 在 office-v2-bridge.js 之后（后者管 excel）
```

### 5.5 文件 IO（复用，零后端改动）

| 方向 | 通道 | 说明 |
|---|---|---|
| 读 | `GET /api/office/load/:fileId` → `resp.content`(base64) | 原始字节，前端 decode 后 parse；docx 的 blocks 分支忽略（v3 用 content） |
| 写 | `POST /api/office/save` → `{content: base64, name}` | 服务端 `body.content` 分支直存（office.js:328 已存在） |
| 新文件 | save 后拿 fileId → 文件浏览器刷新 | 与 v2 相同流程 |

### 5.6 小吉集成（P5）

**目标**：小吉作为"文档协作者"，block 级编辑 + 快照 diff + 接受/拒绝（P127）。

```js
window.OfficeV3 = {
  open(kind, fileId, fileName),        // 打开编辑器窗口
  getBlocks(fileId),                   // 当前文档 blocks（JSON，含中文文本+格式）
  proposeEdit(fileId, blockIdx, newTextOrRuns),  // 生成快照 + diff
  acceptEdit(fileId, proposalId),      // 应用（走 saveDocx generated 路径）
  rejectEdit(fileId, proposalId),      // 丢弃
  // sheets（P4 全量）
  workbookContext(fileId),             // → get_workbook_context
  proposeOperations(fileId, operations, summary),  // → propose_operations（auto-apply + Undo）
  listInstances(), getState(),
}
```

- LLM 侧（chat-intent / 工具调用）：小吉调 `OfficeV3.proposeEdit` / `proposeOperations` → 前端渲染 auto-applied 卡片（含一句话 summary + **[Undo] 按钮**，照搬 GenOffice 交互）→ 用户点 Undo 回滚
- Word/PPT 编辑用 block diff（接受/拒绝）；Excel 编辑用 GenOffice 的 auto-apply + Undo 模式（两种哲学并存，各取所长）
- **不做**：接 GenOffice 的 Genspark AI 后端（设备码登录）——小吉用自己的 LLM 通道，只复用引擎与 DSL
- 进阶（可选）：服务端 agent 直改文档（Node 端跑 docx-engine/pptx-engine，like mcp-genoffice），小吉任务执行时直接生成 .docx/.xlsx——与前端编辑器共用同一引擎，保证双向一致

### 5.7 sheets AI 栈移植设计（选项 3 全量，P4a/b/c）

**移植范围**（从 GenOffice monorepo apps/sheets/src 抽取，Apache-2.0）：

| 模块 | 规模 | 说明 | 适配点 |
|---|---|---|---|
| ai/tools.ts + workbook-skill + workbook-readers + guides/prompts | ~1.1K 行 | workbook DSL 7 工具（40+ 操作） | DSL 纯逻辑，直接搬；读 Univer 数据用 ACMS 实例 |
| edit-journal.ts + plan-operations.ts | ~2.2K 行 | 操作日志（保存 payload + 撤销依据）+ 操作计划执行 | journal 结构直接搬；应用操作走 Univer API |
| univer-sync.ts | 3.2K 行 | Univer 同步层（view 读写/编辑重放） | **同版本 Univer（0.25.1）**，摩擦最低；按 ACMS 插件集裁剪 |
| domain/chart-visual + chart-recommend | ~750 行 | 图表模型 + AI 推荐 | 纯计算直接搬 |
| 图表渲染 | - | Konva → **SVG 渲染**（ACMS 用 DOM/SVG，免 Konva 依赖） | 自绘渲染层（参考 pptx-render 思路） |
| domain/pivot-*（7 模块） | ~1470 行 | 透视表引擎（公式/分组/时间线/筛选） | 纯计算直接搬 |
| gateway/xlsx-pivot + xlsx-chart 等 | 按需 | OOXML 透视/图表定义读写 | 只搬图表/透视相关，不搬全 gateway（20+ 模块） |

**关键适配（3 个摩擦点）**：
1. **univer-sync 裁剪**：GenOffice 深度定制 Univer（流式加载、视图重放），ACMS 是小文件整表场景 → 裁剪流式部分，保留"journal → Univer 应用"核心
2. **AI 面板 UI**：AiChatPanel 是 React 19 → vanilla 重写（消息流 + auto-applied 卡片 + Undo 按钮），样式对齐 ACMS chat
3. **公式重算**：先用 Univer engine-formula（现有）；P4c 后评估 @ironcalc/wasm（0.8.4，2MB，opendesk-office 已在用）增强公式一致性

**保存链路**：AI 操作 → edit-journal 记录 → 保存时 journal 合并进 xlsx（走 /api/office/save content base64）；xlsx 的 OOXML 写回用 GenOffice gateway（xlsx-sheets/xlsx-styles 等）或现有 exceljs writeXlsx——**P4a 先验证保存无损，再决定用 gateway 还是 exceljs**。

---

## 6. 性能预算

| 指标 | 值 | 说明 |
|---|---|---|
| 桌面 boot | +0 KB | v3 不进 boot 路径（bridge 只注册 loader） |
| 打开 Word | +0.17MB gz JS | word-engine.js（Tiptap 现状 436KB raw → 更轻） |
| 打开 PPT | +0.34MB gz JS | slides-engine + opentype.js（Reveal 117KB → 真引擎） |
| 字体 | 0（系统字体）～ 2.4MB 首次 | 仅文档缺字体时加载 Noto 子集，缓存后零 |
| 打开 Excel | +0 | 保持 v2/Univer |
| 内存/实例 | +10~30MB | React 不引入（P1/P2 用 vanilla），引擎本身轻 |
| 保存 | 毫秒级 | byte-preserving 只重写脏段落（实测 9KB 文档秒级） |

**对比现状**：Word 从 Tiptap 436KB → 0.17MB gz 反而更轻；PPT 从 117KB 假引擎 → 0.34MB 真引擎（换来真读写）；Excel 不变。

---

## 7. 风险与反面论证（多多必问项）

| 风险 | 等级 | 缓解 |
|---|---|---|
| **GenOffice 未发 npm、API 可能漂移** | 中 | vendor 源码 + 锁定版本（tarball 存档）；升级走手动合源码流程 |
| **无实时 CRDT 协同**（P127 的"同秒共编"） | 中 | 交付的是"AI 编辑→diff 审查→接受/拒绝 + auto-apply 可 Undo"（交替修改），满足 P127 的"AI/人交替修改"；若未来要实时协同，BetterOffice 的 Yrs CRDT 是备选（但中文差） |
| **官方 renderer 未抽取，功能深度受限** | 中 | P1 最小 renderer 覆盖基础编辑（段落/表格/格式保留）；批注/修订/分页视图列后续评估 |
| **PPT 编辑交互自建成本** | 中 | 复用 ACMS 既有 resize/选择机制（v0.66）；文本框编辑走 contenteditable（IME 友好） |
| **中文 IME 未在 ACMS 实机测** | 低 | contenteditable 天然支持 composition；P1 验收清单含"中文输入法连续输入 20 字"用例 |
| **univer-sync 深度定制（3.2K 行）** | 中 | **同版本 Univer（0.25.1）** 摩擦最低；P4a 先做"journal→Univer 应用"最小闭环验证，再扩展 |
| **图表渲染 Konva→SVG 自绘** | 中 | chart-visual 模型纯计算直接搬；渲染层参考 pptx-render 的 RenderNode→DOM 思路（已有先例） |
| **透视表依赖流式加载** | 中 | pivot-engine 纯计算不依赖流式；流式只是大文件优化，ACMS 整表加载即可（D11） |
| **xlsx 保存无损（journal 合并 OOXML）** | 中 | P4a 门禁：AI 改后保存 → Excel/WPS 打开无损坏（复用 Word 验证方法）；失败则退回 exceljs writeXlsx |
| **商业公司背书（Genspark 获客工具嫌疑）** | 低 | Apache-2.0 永久许可；vendor 源码已落本地，公司停更不影响 |
| **双份代码体积（v2+v3 并存）** | 低 | 过渡期 1-2 周；稳定后删除 v2 的 word/slides（保留 excel 兜底） |

---

## 8. 验收清单（每阶段门禁）

- [ ] P0：word-engine.js / slides-engine.js 可被浏览器 import，`node -c` 语法过
- [ ] P1：中文 docx（含表格/多字体/中英混排）打开→编辑→保存→**Word COM 打开无损坏**（verify-word.ps1）
- [ ] P1：中文输入法实机连续输入 ≥20 字无丢字/错位
- [ ] P2：中文 pptx 打开渲染（逐字 glyph）→ 编辑文本框 → 保存 → PowerPoint 打开无损坏
- [ ] P3：launcher 点 Word/PPT/Excel 走 v3；文件浏览器双击 docx/pptx/xlsx 走 v3；`office-v3-disabled=1` 回滚生效
- [ ] P3：桌面启动时间不劣化（对比 v0.92 基线）；Word/PPT/Excel 首开 ≤2s（prefetch 后）
- [ ] P4a：小吉 propose_operations 改单元格/公式/格式/行列 → 表格即时更新 → [Undo] 回滚 → 保存后 Excel/WPS 打开无损
- [ ] P4b：小吉"给 B2:C10 生成柱状图" → 图表渲染（SVG）→ 保存后 xlsx 含图表可打开
- [ ] P4c：小吉"按部门建透视表汇总" → 透视表渲染 → 保存无损
- [ ] P5：小吉可调用 Word/PPT/Excel 三类编辑；auto-applied 卡片 + [Undo] 生效；Word/PPT 的 block diff 接受/拒绝生效
- [ ] 全量：Excel 人工编辑回归（打开/编辑/保存/公式）零回归

---

## 9. 下一步（待多多拍板）

1. 确认本方案（或调整决策 D1/D5）
2. 批准后开工 P0（0.5天，纯打包无风险）
3. P0 产物给多多验收 → P1（Word 全链路，1.5天）
