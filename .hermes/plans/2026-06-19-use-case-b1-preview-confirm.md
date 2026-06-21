# 2026-06-19 use_case 整理 → 5 段式 preview → 确认写库（B1-直接版）

## 现象（多多的 3 个观察）
1. 整理界面（5 要素 checklist）信息采纳后丢失
2. 需求 description 缺少结构（当前是 4 段式 bullet list，无顶层摘要/无 AC/无假设）
3. 整理后应"展示→确认→更新"（多多的方法论"放/收"框架）

## 决策
**B1-直接版**：保留第一阶段 5 要素 checklist 卡片（用户勾选哪些需求纳入），在"提交采纳"后**加 preview 中间态**：
- preview 阶段调 LLM（复用 rewrite-description.js 的 prompt 风格，但严格 5 段式输出）
- LLM 输入：[原始需求 + supplement_history 聊天上下文 + 勾选项]
- LLM 输出：5 段式 description 文本
- 前端弹 inline 编辑层（textarea + 2 按钮"确认采纳/取消"）
- 用户确认后调 confirm 端点写库

## 关键 UX
- 第一阶段（5 要素 checklist 卡片）**保留不动**（多多明确说"现在的做法是对的"）
- 第二阶段（采纳提交）从"直接写库"改为"preview + 用户确认"
- 弹层 = 就地变编辑（不是 modal），符合"6/16 单按钮+弹层"
- 取消 = 保留 use_case 卡片（不消失，可重试）

## 5 段式（严格结构）
1. **一句话需求** ≤ 80 字，浓缩核心意图
2. **用户场景** 按角色列 bullet
3. **关键功能点** 从勾选项合并，按 ID 顺序
4. **验收关注点** 从 ac 提取，Given/When/Then 摘要
5. **待验证假设** 从 confirmedAssumptions 列出，按风险等级

## 改动文件（4 文件 / +150 -50 行）

### 1. server/services/assists/use-case.js
- 新增 PREVIEW_SYSTEM_PROMPT（严格 5 段式 prompt，区别于 rewrite-description 的"灵活" prompt）
- 新增 previewUseCaseResult(reqId, payload)：
  - 读 req (title/description/supplement_history)
  - 拼 userParts = 原始需求 + 聊天上下文（cap 最近 15 条）+ 勾选项
  - 调 LLM (callLLMWithRetry) → safeParseJSON
  - 返回 { description, modelId } 不写库
- applyUseCaseResult 改名为 confirmUseCaseResult(reqId, description, payload)：
  - 不再 buildDescriptionFromAccepted（直接接收 preview 后的 description）
  - 写库: description + structured_requirements(status: 'applied') + description_history
  - 返回 { ok, newDescription, applied, discarded, confirmedAssumptions }
- 导出 previewUseCaseResult + confirmUseCaseResult
- 保留 buildDescriptionFromAccepted（被 confirm 端点外部调用时兜底用，标记 deprecated）

### 2. server/routes/requirements.js
- 新增 POST /:id/assist/use_case/apply/preview
  - 调 useCaseSvc.previewUseCaseResult
  - 返回 { description, modelId }
  - 401/400/500 错误处理
- 新增 POST /:id/assist/use_case/apply/confirm
  - 接收 req.body.description（用户改后的 5 段式文本）
  - 调 useCaseSvc.confirmUseCaseResult
  - 写库 + 200
- 原 POST /:id/assist/use_case/apply **保留**（标记 deprecated，前端用 preview/confirm 替代）
  - 直接调 confirmUseCaseResult（无 description 参数）→ 走旧 buildDescriptionFromAccepted
  - 后续版本删除

### 3. server/services/rewrite-description.js（不动）
- 不共用 prompt（rewrite-description 是"灵活 5 段"，use_case preview 是"严格 5 段"）
- 两个 prompt 场景不同，强行共用会丢失差异

### 4. client/js/views/assists/use-case.js
- ucApply 改：
  - 调 /apply/preview（带 acceptedItems / confirmedAssumptions / discardedItems）
  - loading toast "AI 正在整理为 5 段式结构…"
  - 收到 { description, modelId } → 弹 inline 编辑层
- 新增 ucConfirm(reqId, editedDescription)：
  - 调 /apply/confirm
  - 写库成功 → 关闭弹层 + 刷新 req + toast
- 新增 ucCancelPreview：关闭弹层，use_case 卡片保留
- 弹层 DOM 结构（用 mockup 状态 2 的样式）：
  - 顶部 banner: ✏️ 编辑需求描述 · 预览 · 采纳 N 条 · 丢弃 M 条
  - 中间: 1 个 textarea (5 段式文本预填)
  - 底部: ✅ 确认采纳 / ✕ 取消
- 弹层样式：复用 ACMS 现有 CSS 变量 (--bg3, --accent, --border, --radius, --green)，不引新依赖
- 事件代理：document.click 已有的 t.dataset.ucApply 处理改 → 调 /apply/preview

## 数据流（B1-直接版）

```
[点"✨ 整理"] chatAssist(reqId, 'use_case')
  └─ ECSR 整理 → 5 要素 checklist 卡片   ← 第一阶段保留
       └─ [用户勾选]
            └─ [点"✅ 提交采纳"] ucApply(reqId)
                 ├─ toast: "AI 正在整理为 5 段式结构…"
                 ├─ POST /api/requirements/:id/assist/use_case/apply/preview
                 │     ↓ 后端:
                 │       读 req (title/description/supplement_history)
                 │       cap supplement_history 最近 15 条
                 │       拼 userParts = 原始需求 + 聊天上下文 + 勾选项
                 │       调 LLM (PREVIEW_SYSTEM_PROMPT) → safeParseJSON
                 │     ↓ 返回 { description: 5段式文本, modelId }
                 ├─ [弹 inline 编辑层]
                 │     ├─ 顶部 banner: ✏️ 编辑需求描述 · 采纳 5 条 · 丢弃 0 条
                 │     ├─ textarea (5 段式文本预填)
                 │     └─ ✅ 确认采纳 / ✕ 取消
                 ├─ [用户编辑 → 点 ✅ 确认采纳] ucConfirm(reqId, editedDescription)
                 │     └─ POST /api/requirements/:id/assist/use_case/apply/confirm
                 │           ↓ confirmUseCaseResult 写库:
                 │             description = editedDescription
                 │             structured_requirements = { status: 'applied', ...勾选项 }
                 │             description_history += 旧 description
                 │           ↓ 200 → 关闭弹层 + openRequirement 刷新 + toast
                 └─ [用户点 ✕ 取消] ucCancelPreview
                       └─ 关闭弹层, use_case 卡片保留
```

## 5 段式 prompt（严格）

```js
const PREVIEW_SYSTEM_PROMPT = `你是 ACMS 系统的「需求结构化助手」。
你的工作是把「原始需求 + 用户聊天补充 + 用户勾选的结构化条目」整合成严格 5 段式需求描述。

## 5 段式结构（必须严格遵守，section header 一字不差）
1. **一句话需求**：单段陈述，≤80 字
2. **用户场景**：按角色列 bullet（销售/客户经理/管理员等）
3. **关键功能点**：从勾选项合并，bullet `- ID [优先级] 描述`
4. **验收关注点**：从 ac 提取，bullet `- [ID] 摘要`
5. **待验证假设**：从 confirmedAssumptions + 聊天上下文推导，bullet `- ID [风险等级] 描述`

## 要求
1. 严格按 5 段式输出，每段之间空一行
2. 不要 markdown 代码块，直接输出纯文本
3. 不要"以下是..."之类开场白
4. 关键功能点按"业务→用户→系统"层排序
5. 假设按风险等级 high→medium→low 排序
6. 目标长度 400-700 字

输出严格 JSON: {"description": "完整 5 段式文本"}`;
```

## 验证步骤（多多本地）
1. **Ctrl+C 重启 server**（必须！新加的 service 函数和 route 要重新 require）
2. **Ctrl+Shift+R 硬刷浏览器**
3. 进入 idea req → 聊天里点"✨ 整理" → 等生成
4. **第一阶段**：勾选 5 要素条目（业务/用户/系统 + 假设）
5. 点"✅ 提交采纳"
6. 预期：toast "AI 正在整理为 5 段式结构…" → 1.5s 后弹层
7. 弹层里 textarea 预填 5 段式 description
8. 编辑几处 → 点"✅ 确认采纳"
9. 预期：弹层关闭 → toast "✅ 已整理 · 采纳 N 条 · 丢弃 M 条" → req.description 已更新为 5 段式
10. 重新整理 → 点"✕ 取消" → 弹层关闭, use_case 卡片保留

## 主动指出的局限（按 6/16 SOP）

1. **LLM 成本 +1.5s / ~1000 token** — 每次 apply 调一次 LLM（频率低，几天一次，可接受）
2. **聊天上下文 cap 在最近 15 条** — 长对话会丢早期上下文
3. **5 段式 prompt 是新 prompt**（不共用 rewrite-description）— 维护 2 个 prompt，但场景不同值得
4. **原 /apply 端点保留 deprecated** — 旧客户端/测试可能还在用，保守保留
5. **弹层依赖 CSS 变量**（--bg3 / --accent / --border）— 亮色/米色主题也能正常显示
6. **取消后 use_case 卡片保留** — 但 _assistRenderCache 的 fingerprint 不会变（desc 没改），下次轮询会"跳过"渲染 — 不影响（卡片 DOM 还在，只是没刷新）
7. **confirm 端点不验签 description 长度** — 用户可能清空 textarea 点确认 → req.description 变空字符串 — 防御：confirm 端点加 description 长度校验（> 50 字）
8. **mockup 5 段式排版跟实际 LLM 输出可能有差异** — LLM 偶尔漏 section / 顺序错 — prompt 加 few-shot 例子缓解
9. **5 段式里"待验证假设"的"验证方式"字段** — LLM 从聊天上下文推导，未必真（编的）— 标注 "(AI 推测)" 让用户识别
10. **structured_requirements 写 status: 'applied'** — 但不含 generated_at_round 字段（用 ...structuredData 展开）— 前端 status==='applied' 走 continue 不渲染，defer

## 数据流（验证后）

## 落档 / 提交
- ❌ git add/commit/push (按 6/16 硬约束)
- ❌ 部署到 120.24.204.130
- ❌ 自动 restart ACMS 服务
- 落档：.hermes/plans/2026-06-19-use-case-b1-preview-confirm.md (本文件)
