# Elicitor SKILL Changelog

> **项目**：ACMS 智能体协同管理系统
> **作者**：小吉 & 多多
> **起始**：2026-06-13

---

## v0.7.0 — 2026-06-13 — Phase 4 固化 step（idea → clarifying 自动出摘要）

### 新增

- **`server/services/elicitor-solidify.js`**（4660 字节）
  - 在 idea → clarifying 转换时调用：调 `solidify.md` prompt 产出"我们讨论了什么"摘要
  - 输入：requirement.thinking_brief（含 diagnosis + dialog + 各轮 brief）+ requirement 完整记录
  - 输出：{ summary, boundaries[], tradeoff_points[], next_step, modelId, generated_at }
  - 约束：elicitor 必须 enabled + health 通过 + brief.status='done'
  - 失败返回 null（路由层兜底走 raw brief）

### 修改

- **`server/routes/requirements.js`**（Phase 4.1）
  - `POST /:id/transition` 在 `targetStatus === 'clarifying'` 分支开头加固化触发
  - 异步调 `generateSummary()`，结果写回 `thinking_brief.summary`
  - 失败非阻塞（try/catch 兜底，transition 正常返回）

- **`client/js/views/assists/thinking-brief.js`**（Phase 4.1）
  - render() 加 `summaryBlock`：brief.summary 存在时渲染"📋 我们讨论了什么"
  - 显示：summary 主文 + 确定的事（boundaries 列表）+ 还在犹豫（tradeoff_points 列表）
  - 失败/未生成时不渲染（type===null 降级）

- **`client/css/style.css`**（Phase 4.1 样式）
  - `.brief-summary` 浅青绿底（跟 dialog 同色系，区别于诊断蓝）
  - `.brief-summary-header / text / section-title / boundaries / tradeoffs` 子样式
  - tradeoff_points 用黄色（accent3）凸显"还在犹豫"

### 验证（v0.7.0）

- ✅ REQ-MQCCY44G / 电商首页改版：transition 后 brief.summary 写入
- ✅ summary 自然语言："你在意的是首页能让用户一眼找到想要的商品，同时还要有逛的欲望；分类、推荐、个性化位这些模块你心里有但还没排好优先级"
- ✅ tradeoff_points：识别出 2 个真实矛盾点（工具型 vs 逛的型 + 找货效率 vs 个性化推荐）
- ✅ boundaries 空数组（用户没明确表态边界，符合预期）
- ✅ canRun 不通过 → generateSummary 返回 null，transition 正常返回（不阻塞）

---

## v0.6.0 — 2026-06-13 — Phase 3 体验降噪（⑦⑧⑨⑩ 全做）

### 修改

- **`client/js/views/requirements.js`**（Phase 3.7）
  - 「回答并继续」→「📤 发送」（按钮文字改，行为不变 —— 后端逻辑走 submitIdeaSupplement）

- **`client/js/views/assists/thinking-brief.js`**（Phase 3.8 + 3.9）
  - `load()` 函数：fetch brief 前先 GET /requirements/:id 拿 description，立即渲染「📝 你最初的需求：」气泡
  - 容器已有 done 内容（.brief-opening / .insight-error）时不覆盖，避免覆盖已有 brief
  - render() 顶部加 positionBlock —— 直接读 `diagnosis.type`（单一数据源）：
    - vague → 🤔 想想其他角度（蓝色）
    - conflicted → 🎯 敲定细节（青绿色）
    - blank → 👂 我在听（绿色）
  - 位置指示放在 opening 上方，第一眼就能看到"AI 在哪个阶段"

- **`client/js/views/assists/dispatcher.js`**（Phase 3.10）
  - 顶部加 `SOURCE_EXPLANATIONS` 硬编码映射表（4 type × 6 method = 24 条说明）
  - `buildSourceExplanation(method, diagnosisType)` 查表
  - 每张 assist 卡片头部加 `<div class="assist-source-note">💡 ...</div>`
  - diagnosis.type 变 → 说明自动变（纠偏后下一轮 brief 重生 → 卡片说明同步更新）

- **`client/css/style.css`**（配套样式）
  - `.brief-position-hint` 圆角 pill + 三色系（blue/accent/green）
  - `.brief-user-bubble` 浅色背景 + 边框 + 斜体引用样式
  - `.assist-source-note` 左侧细线 + 浅背景说明样式

### 验证（v0.6.0）

- ✅ 后端数据 REQ-MQCCY44G：diagnosis.type=blank, dialog.method=荒谬方案法（说明前端能正确读 diagnosis）
- ✅ ⑦ 文字改：grep 确认 "回答并继续" 全部替换为 "📤 发送"
- ✅ ⑧ user-bubble：load() 先 GET req 拿 description，DOM 立即填充
- ✅ ⑨ position-hint：render() 直接读 diagnosis.type，4 个映射生效
- ✅ ⑩ source-note：dispatcher 24 条映射表覆盖所有 method × type 组合

### 已知遗留

- ⚠️ position-hint CSS 跟 brief-opening 块间距需视觉确认（用浏览器实测）
- ⚠️ user-bubble 跟 brief 同时显示时可能有视觉重叠（前端用 querySelector 判断避免）

---

## v0.5.0 — 2026-06-13 — Phase 2 路由器改造 + 诊断对话 + 纠偏

### 新增

- **`server/services/elicitor-dialog.js`**（5046 字节）
  - brief 完成后调用：根据 diagnosis.type 选对应 toolbox prompt
  - 输入：requirement.thinking_brief（含 diagnosis）+ 用户原始描述
  - 输出：{ chosen_method, guide_question, expected_schema }
  - 防御：diagnosis.type === null / elicitor 未启用 / health 不通过 → 返回 null

### 修改

- **`server/services/assists/router.js`**（Phase 2a）
  - `pickNext()` 入口加 blank 短路：diagnosis.type='blank' → 不推卡片（Phase 2b 接管）
  - `pickNext()` LLM prompt 注入 diagnosis_type（vague=具象化优先 / conflicted=场景定位优先）
  - `fallbackPick()` 加 blank 短路 + vague/conflicted 优先级列表
  - 修 bug：`used` undefined（原 patch 误删变量声明，改用 `usedMethods`）
  - **`server/services/thinking-brief.js`**（Phase 2a）
    - 调用 `pickNext()` 时多传 `diagnosis` 字段
  - **`server/routes/requirements.js`**（Phase 2a）
    - `/assist/run` 路由读 brief 时多读 `diagnosis` 传给路由器

- **`server/services/thinking-brief.js`**（Phase 2b）
  - brief 完成持久化时加 `dialog: null` 字段
  - brief 完成后 `setImmediate` 异步调 `generateDialog()`
  - 持久化 dialog 到 `thinking_brief.dialog`
  - **`client/js/views/assists/thinking-brief.js`**（Phase 2b）
    - render() 读 `brief.dialog`
    - 加 `dialogBlock` 渲染（type=null 时不渲染）
    - **`client/css/style.css`**（Phase 2b）
      - `.brief-dialog` 样式：青绿色（跟 --accent 同色系）
      - `.brief-dialog-method / text / schema` 子样式

- **`client/js/views/assists/thinking-brief.js`**（Phase 2c 纠偏）
  - 诊断标签加 `<select>` 下拉，onchange 触发 `correctDiagnosis`
  - 暴露全局 `correctDiagnosis(reqId, newType)` 函数
  - 纠偏成功后 `setTimeout(load)` 刷新 brief
  - **`client/css/style.css`**（Phase 2c）
    - `.brief-diagnosis-correction` 紧凑样式

- **`server/routes/requirements.js`**（Phase 2c 后端）
  - 新增 `POST /:id/correct-diagnosis { type }`
  - 校验：VALID 白名单 + status='idea' + diagnosis 已存在
  - 改 diagnosis.type + 写 corrected_at + previous_type + 清 dialog
  - setImmediate 异步触发 brief 重生（带 opts）
  - **`server/services/thinking-brief.js`**（Phase 2c runBriefJob）
    - `opts.skipDiagnosisRegen = true` 时保留 diagnosis.type
    - LLM 仍重生 label/guide，但强制覆盖 type
    - 持久化时写 corrected_at + previous_type

### 验证（v0.5.0）

- ✅ fallbackPick 4 case：vague→tradeoff / conflicted→scenarios / blank→null / null→原行为
- ✅ pickNext blank 短路：返回 `{ method: null, elicitSkipped: true, elicitReason: 'diagnosis=blank' }`
- ✅ pickNext LLM prompt 注入 diagnosis_type（软影响，不强制）
- ✅ 新需求 REQ-MQCCY44G（电商首页改版）：diagnosis=vague → dialog={chosen_method="极端对比", guide_question="首屏只能突出一个卖点..."}
- ✅ 纠偏 vague → blank：brief 重生后 type=blank 保留，dialog 重生为"荒谬方案法"
- ✅ Phase 2a + 2b + 2c 端到端链路打通

### 已知遗留（v0.5.0）

- ⚠️ diagnosis.previous_type 字段在某些场景下记录不准确（对象引用副作用）—— 留待 polish
- ⚠️ 完整诊断对话循环（用户回答 dialog → 重新生成 brief）未实现
- ⚠️ 固化 step（solidify.md prompt 实际未用）

---

## v0.2.0 — 2026-06-13 — Phase 1 诊断接入 thinking-brief

### 修改

- **`server/services/thinking-brief.js`**
  - `THINKING_SYSTEM_PROMPT` 加 diagnosis 字段规范（type/label/guide/confidence）
  - 加 diagnosis 判断规则段（vague/conflicted/blank + 描述<20 字降级为 null）
  - `generateBrief()` 加 diagnosis 解析（VALID_TYPES 白名单 + label/guide 长度切片 + confidence 0-1 clamp）
  - 3 处 `JSON.stringify({...})` 都加 diagnosis 字段（generating:null / done:brief.diagnosis / failed:null）
  - 顶部字段注释加 diagnosis schema 描述

- **`client/js/views/assists/thinking-brief.js`**
  - render() 读 `brief.diagnosis`
  - 加 `diagnosisBlock` 渲染（type=null 时不渲染——降级）
  - 标签不可点（B 方案，cursor:default，纠偏推迟到 Phase 2.6）
  - 加 `data-diagnosis-type` 属性（便于 Phase 2.6 纠偏时定位）

- **`client/css/style.css`**
  - `.brief-diagnosis` 样式：blue 色系（不强推，跟 badge-idea 同色系）
  - `.brief-diagnosis-icon / label / guide` 子样式

### 验证（v0.2.0）

- ✅ 旧 brief（无 diagnosis 字段）→ 前端不渲染诊断标签，行为不变
- ✅ 新 brief 触发 → diagnosis 真产出，4 字段符合规则
- ✅ `REQ-MQ85J6J0 / 游戏内天气系统` 实测：type=vague, label="方向清楚，想具体化", guide="我们先聊聊『沉浸感』", confidence=0.7
- ✅ 描述 < 20 字 → diagnosis.type=null，前端降级不渲染
- ✅ JSON 截断 / 解析异常 → diagnosis 降级为 null（VALID_TYPES 白名单）

---

## v0.1.0 — 2026-06-13 — Phase 0 安全网落地

### 新增

- **`server/services/elicitor-adapter.js`**（2871 字节）
  - 软开关 `ELICITOR_ENABLED`（默认 false）
  - 短路开关 `ELICITOR_FALLBACK_SHORT_CIRCUIT`（默认 false，独立控制）
  - 健康检查：SKILL 注册 + 5 个 prompt 文件齐全
  - 启动时 `startupHealthCheck()` —— 不健康只 warn 不 throw
  - `loadStepPrompt(stepName)` 接口
  - `canRun()` 接口（router.js 在 pickNext 入口调用）

- **`server/scripts/register-elicitor-skill.js`**（3522 字节）
  - 一次性注册 `skill-requirement-elicitor` 到 ACMS `skills` 表
  - 可重复执行（已存在会 update）
  - 注册后自动验证：GET + 5 个 prompt 文件清单
  - 缺文件时 exit 1 + 清晰错误

- **`server/skills/elicitor/references/`**（新增目录）
  - `elicitor-methods.md`（5016 字节）—— 需求启发方法论
  - `four-requirement-journeys.md`（5501 字节）—— 4 旅程 elicitor 视角精简版（顶部含版本漂移注释）

### 修改

- **`server/stores/skill-store.js`**
  - 新增 `loadPromptStep(skillId, stepName, dirName=null)` —— 支持 `server/skills/${dirName}/prompts/${stepName}.md` 多文件 SKILL
  - 新增 `listPromptSteps(skillId, dirName=null)` —— 健康检查用，列出所有 step prompt 文件名
  - **向后兼容**：旧 skill 顶层 `prompts/${skillId}.md` 调用方式不变
  - dirName 默认回退到 skillId，新参数可选

- **`server/services/assists/router.js`**
  - 顶部 import `elicitorAdapter`
  - `pickNext()` 入口加 `canRun()` 检查 + 短路开关
  - 短路时返回 `{ ...fallbackPick(ctx), modelId: null, elicitorSkipped: true, elicitReason }`
  - **关键不变**：短路开关默认 false；不打开时行为与改前完全一致

- **`server/app.js`**
  - 顶部 import + 调 `startupHealthCheck()`
  - 不健康只 console.warn，不影响服务启动

### 数据

- **`skills` 表新增 1 条记录**：`skill-requirement-elicitor | 需求启发师 | analysis`
- 22 个 skill 列表里最后一项

### 验证（v0.1.0）

- ✅ 注册脚本可重复执行
- ✅ `/api/skills` 列表里能看到 elicitor
- ✅ 启动日志：`[elicitor] 软开关关闭（ELICITOR_ENABLED!=true），走 fallback`
- ✅ 启动健康检查生效，缺失 prompt 会 warn
- ✅ 服务 PID 25692，3300 端口正常

### 安全保证

- `ELICITOR_ENABLED` 默认 false → 走原 fallback
- `ELICITOR_FALLBACK_SHORT_CIRCUIT` 默认 false → 短路开关不打开
- 即使短路开关打开，也是 fallbackPick 退化逻辑（跟原 LLM 失败时跑的 fallback 完全一致）
- 启动健康检查失败只 warn 不 throw → 服务永远能起
- **任何时候设 `ELICITOR_ENABLED=false` 即可一键回退到改前行为**

### 后续 Phase

- ~~Phase 1~~ ✅ v0.2.0 落地
- ~~Phase 2a/b/c~~ ✅ v0.5.0 落地
- ~~Phase 3~~ ✅ v0.6.0 落地
- ~~Phase 4~~ ✅ v0.7.0 落地

### v0.4 完整收官

**核心成果**：诊断对话驱动替代 assist 卡片驱动，4 旅程的「放」姿态落地。

**完整链路**：
```
用户输入 → thinking-brief(含 diagnosis) → elicit-dialog(基于 toolbox) →
用户回答 → router(诊断感知) → assist 卡片(带来源说明) → 用户表态 →
transition 到 clarifying → elicit-solidify 出摘要 → 固化到 srs.summary
```

**安全保证**：ELICITOR_ENABLED 默认 false → 走 fallback 旧行为不变；启用时一键回退。

**改进点 ROI**：
- ⭐⭐⭐ Phase 2b 诊断对话 + Phase 4 固化（用户核心体验）
- ⭐⭐ Phase 3 体验降噪（首屏感知优化）
- ⭐ Phase 0 安全网（必备基础）
