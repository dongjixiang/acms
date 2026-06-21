# 2026-06-19 use_case B3 改版：自然语言需求文档（推翻 B1/B2）

## 现象
B2 渲染（5 卡片 + emoji + 依赖反查）依然"内容被割裂"，用户读起来跳读。
多多给了一个**完整 LLM 输出样例**（自然语言流畅需求文档），明确表示这种格式更好。

## 决策
**完全推翻 B1/B2 的"重点 + 关联性"设计**，回到**自然语言流畅文档**：
- 5 段按多多样例：① 一句话需求 ② 用户场景 ③ 关键功能点 ④ 体验/技术倾向 ⑤ 验收关注点
- 段落式连续流（不切独立卡片）
- 去掉 ID 编号 / 优先级 / 依赖关系 / 关键性 ⭐
- 去掉 emoji 装饰
- 长度 1500-3000 字（不被 1500 限制）
- maxTokens 改 4000

## 关键设计决策

### 段名（按多多样例一字不差）
1. 一句话需求
2. 用户场景
3. 关键功能点
4. 体验/技术倾向
5. 验收关注点

**没有"待验证假设"段**（多多样例里没假设）。假设数据**保留**在 `req.structured_requirements`（程序可查），不进 description。

### 格式
- section header 独占一行（**不要 `###` 标记**，LLM 容易漂移）
- 段落流畅（PM/技术写的需求文档风格）
- 验收关注点用 bullet 1-2 行（其他段段落为主）
- 体验/技术倾向段落 + bullet 混合

### 假设段处理（关键决策）
- confirmedAssumptions **不传**给 LLM（避免 LLM 输出去掉）
- description 5 段不含假设
- 假设**只显示在第一阶段 5 要素 checklist 卡片**（用户已看过）
- 假设数据**永久保留**在 `req.structured_requirements`（程序可查）

### maxTokens
- `maxTokens: 2000` → `maxTokens: 4000`（防 LLM 截断）
- prompt 目标长度 1500-3000 字

## 改动文件

### server/services/assists/use-case.js
- ~ PREVIEW_SYSTEM_PROMPT: 完全重写（5 段式新格式 + 段落式 + 去掉 ID/优先级/依赖）
- ~ previewUseCaseResult: 不再传 confirmedAssumptions 给 LLM
- ~ maxTokens: 2000 → 4000

### client/js/views/assists/use-case.js
- ~ parsePreviewDescription: 5 段识别（包含"体验/技术倾向"，去掉"待验证假设"）
- ~ renderPreviewCards: 完全重写（markdown 段落式渲染，不切卡片，section header 弱化）
- - PRIORITY_EMOJI / PRIORITY_LABEL / PRIORITY_COLOR / RISK_EMOJI / RISK_LABEL (删)
- - buildDepsIndex / computePrioStats (删)
- - renderFunctionPoints / renderAssumptions (删)
- ~ switchToEditMode: 保留 textarea（与 B2 一样）
- ~ ucConfirm: 保留（与 B2 一样）

## 数据流（B3）

```
[点"✅ 提交采纳"] ucApply(reqId)
  ├─ POST /apply/preview (maxTokens=4000)
  │     ↓ 后端:
  │       读 req (title/description/supplement_history)
  │       cap supplement_history 最近 15 条
  │       拼 userParts = 原始需求 + 聊天上下文 + 勾选项 (acceptedItems)
  │       ⚠️ 不传 confirmedAssumptions (假设不进 description)
  │       调 LLM (PREVIEW_SYSTEM_PROMPT 5 段式新格式)
  │     ↓ 返回 { description: 自然语言 5 段式, modelId }
  │
  ├─ 解析 LLM 输出 → parsed = { 一句话需求, 用户场景, 关键功能点, 体验/技术倾向, 验收关注点 }
  │
  ├─ 弹"自然语言预览"层（默认只读模式）
  │     ├─ 顶部 banner: 📋 5 段式预览 · 采纳 N 条 · 丢弃 M 条
  │     ├─ 5 段连续 markdown 渲染 (h3 + p + ul)
  │     │     ├─ <h3>一句话需求</h3><p>...</p>
  │     │     ├─ <h3>用户场景</h3><p>角色 1: ...</p>
  │     │     ├─ <h3>关键功能点</h3><p>功能 1 段落...</p>
  │     │     ├─ <h3>体验/技术倾向</h3><p>总策略...</p><ul><li>技术点 1</li></ul>
  │     │     └─ <h3>验收关注点</h3><ul><li>验收 1</li></ul>
  │     └─ 底部 3 按钮: [✏️ 编辑描述] [✅ 确认采纳] [✕ 取消]
  │
  ├─ [用户决定改] → 点 [✏️ 编辑描述] → switchToEditMode
  │     └─ 弹层就地变 textarea (5 段式纯文本)
  │
  ├─ [用户决定不改] → 点 [✅ 确认采纳] → 调 /apply/confirm 写库
  └─ [点 ✕ 取消] → 关闭弹层, use_case 卡片恢复
```

## 验证步骤

1. Ctrl+C 重启 server
2. Ctrl+Shift+R 硬刷
3. 进 idea req → 聊天底部点"✨ 整理"
4. 勾选 5 要素条目 → 点"✅ 提交采纳"
5. 预期：toast "AI 正在整理为 5 段式结构…" → 弹层出现
6. **检查 1**：5 段**连续 markdown 流**（不切独立卡片），section header 弱化
7. **检查 2**：内容是**自然语言段落**（不是 bullet 强制）
8. **检查 3**：没有 UC-001/SYS-001 等 ID 编号
9. **检查 4**：没有 emoji 装饰 / 依赖反查 / 优先级分布
10. **检查 5**：长度 1500-3000 字（不被 1500 限制截断）
11. **检查 6**：没有"待验证假设"段（5 段不含假设）
12. 点 [✏️ 编辑描述] → 弹层就地变 textarea
13. 编辑几处 → 点 [✅ 确认采纳] → 写库
14. 点 [✕ 取消] → 弹层关闭, use_case 卡片恢复

## 主动指出的局限

1. **"重点 + 关联性"完全去掉**：用户看不到优先级分布 / 依赖关系 / 关键性
   - 但多多要"自然语言"，可视化与自然语言冲突
   - 折中：依赖关系隐含在段落里（"依赖：..."），不显式 emoji
2. **假设不进 description**：用户在第一阶段看过，**写库后 description 看不到**
   - 但多多样例里没假设段
   - 假设数据保留在 `req.structured_requirements`（程序可查）
3. **section header 漂移风险**：LLM 可能输出"1. 一句话需求" / "## 一句话需求" / "一句话需求" 三种格式
   - parser 容忍 3 种（### / 裸 / 数字编号）—— 之前 B2 验证过
4. **markdown 渲染 vs 纯文本**：LLM 偶尔输出 markdown 标记（**xxx**、- bullet），前端要 strip 或 render
   - 用 DOMPurify? 不引入新依赖
   - 简单：手动解析 + 转义
5. **textarea 编辑模式不渲染 markdown**：用户改完就是纯文本（不再结构化）
   - 但 confirm 端点只校验 ≥ 50 字
   - 信任用户编辑
6. **maxTokens 4000 提升成本**：每次 preview 多花 token
   - 但 apply 频率低（几天一次），成本可接受
7. **未 commit/push/restart**（按 6/16 硬约束）
8. **没在改前 mockup**（按 6/16 "新 UI 交互先给个示意"）：直接做是因为多多给了完整文字样例
9. **没做端到端 e2e**（需要多多重启 + 跑 + 截图 LLM 输出）
10. **推翻 B1/B2 的"重点 + 关联性"**：B1/B2 的 emoji / 依赖反查代码全部删除（不留技术债）

## 6/16 SOP 反思

- ✓ plan 落档
- ✓ 改 1 service 立即 grep 同类 pattern
- ✗ 改前没 mockup（直接做）
- ✗ 多次返工：B1 → B2 → B3（每次都是"先动手再发现方向不对"）
- **教训**：6/16 SOP "我产品节奏控" 应该"先对齐样例再动手"
- **改进**：今后大改版前**先要多多给完整样例**（文字/LLM 实际输出），再写 prompt

## 落档 / 提交
- ❌ git add/commit/push
- ❌ 部署到 120.24.204.130
- ❌ 自动 restart ACMS 服务
- 落档：.hermes/plans/2026-06-19-use-case-b3-natural-language.md（本文件）
