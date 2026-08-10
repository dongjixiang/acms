# RFC v0.89 — 小吉工具描述双通道问题：对齐方案 vs 彻底 Hermes 化方案

状态：待拍板（2026-08-04）
触发背景：小吉回复变慢（Agnes API 中位 25s + runToolLoop 8 轮循环 + prompt 15KB 每轮重发）
拍板：待定

## 一、问题定义

小吉的工具描述存在**两份**，一份进 system prompt 文本，一份进 API tools 参数：

```
buildChatPrompt(ctx)              → system prompt 文本（LLM 可见）
  ├─ L0_BASE 静态模板（灵魂+能力索引）          ≈ 3.0KB
  ├─ L1 视图工具描述（_default 4 个）           ≈ 0.4KB
  └─ L3 检索工具描述（retrievedTools 5 个）     ≈ 1.8KB
  └─ toolDescs = L0(6) + L1(4) + L3(5) 全部描述 ≈ 3.6KB  ← 冗余来源
buildActionPrompt(single_action)              ≈ 1.1KB
userSummary + actionHint + 历史摘要           ≈ 2-5KB
──────────────────────────────────────────
合计 ≈ 15.2KB / 轮

callLLMWithTools(modelId, messages, { toolNames })
  → toolNames = computeToolNames(view, cats) + getActionToolNames(route)
  → API tools 参数 = toolRegistry.toProviderFormat(api, toolNames)
  → 实际注入 1 个（play_music）                ← 真正可调用的
```

**核心矛盾（P132）**：prompt 展示 15 个工具描述，API 只给 1 个 schema。
LLM 信 prompt → 调了 prompt 里的工具 → UNKNOWN_TOOL；或困惑于"看得到调不到"。

**为什么慢**：15KB prompt 每轮 runToolLoop 完整重发（8 轮 × 15KB），
Agnes 慢 API 下 token 越多处理越慢，正反馈。

## 二、两个候选方案

### 方案 A：对齐方案（最小改动，P132 直接修法）

**做法**：`buildChatPrompt` 的 toolDescs 段改为只拼**最终注入 toolNames** 的描述。

```js
// 改前：allToolNames = L0(6) + L1(4) + L2(0) + L3(5) = 15 个
// 改后：allToolNames = 传入的 finalToolNames（与 runToolLoop 一致）
```

- routes 里先算 toolNames（computeToolNames + getActionToolNames），再传给 buildChatPrompt
- prompt 展示 = API 注入，两套变一套
- 长度：15 个描述 → 1-3 个描述，省 ~3KB/轮

**优点**：
- 改动小（buildChatPrompt 签名 + routes 调用顺序调整）
- 不一致 bug（P132）直接消失
- Agnes 内联标签模型不受影响（最终工具的完整描述还在 prompt 里，它还能学）

**代价 / 问题**：
- L3 检索出的工具如果没进最终 toolNames，LLM 看不到 → "发现"能力被收窄
  （single_action 只有 1 个工具时，检索层结果对 LLM 不可见）
- L0_BASE 索引还在（"你能做的主要事情"），LLM 仍知道能力存在，但看不到描述
- 治标不治本：prompt 还是 12KB 左右（L0_BASE 3KB + action 1KB + 摘要 2-5KB + 工具 1-3KB）

### 方案 B：彻底 Hermes 化（学 Hermes/Claude Code）

**做法**：system prompt **不拼任何工具描述**，工具信息只走 API `tools` 参数。

- 删掉 buildChatPrompt 里整个 toolDescs 段
- L0_BASE 的"能力索引"改为纯名字列表（不进描述）
- tools 参数维持现状（已经是按需的、正确的）
- 非标准模型（Agnes 内联标签）用独立兜底 prompt 分支（按 baseUrl 判断）

**优点**：
- 单通道，无冗余，system prompt 从 15KB → ~5KB（L0_BASE 3KB + action 1KB + 摘要少量）
- 与主流 agent（Claude Code / Codex / Hermes）架构一致
- 工具描述维护只改一处（tool-registry）

**代价 / 问题**：
- 🔴 **Agnes 内联标签模型可能崩**：它学工具调用格式的唯一来源是 prompt 文本，
  只留 tools 参数它不认 → 不知道有哪些工具 → 装睡/瞎编/新格式变体
  → 必须做"非标准模型双轨"（Agnes 保留旧 prompt，标准模型走新 prompt）
- 🔴 **L3 检索价值被阉割**：LLM 看不到检索出的工具，无法自主判断"该换工具"
  → 检索层从"让 LLM 知道有什么"退化为"路由层内部参考"
- 🟡 _expand_tools 变黑箱：LLM 不知道 category 里有什么才去扩载，删描述后纯靠猜
- 🟡 prompt caching 收益存疑：Agnes 是否支持 caching 未知；userSummary 每轮变，前缀不稳定
- 🟡 工具选择准确率可能下降：USE WHEN / DON'T USE WHEN 规范（P77/P88）若 tools 参数没带全

## 三、对比表

| 维度 | 方案 A（对齐） | 方案 B（Hermes 化） |
|------|:---:|:---:|
| 改动量 | 小（2-3 处） | 中（5-6 处 + 双轨分支） |
| prompt 长度 | 15KB → ~12KB | 15KB → ~5KB |
| 每轮省 token | ~3KB | ~10KB |
| P132 不一致 bug | ✅ 根治 | ✅ 根治 |
| Agnes 兼容 | ✅ 不受影响 | ⚠️ 必须双轨，有风险 |
| L3 发现能力 | ⚠️ 收窄（只展示注入的） | ❌ 阉割（完全不展示） |
| _expand_tools | ✅ 保留 | ⚠️ 变黑箱 |
| 与主流 agent 一致 | ❌ 仍是混合 | ✅ 完全一致 |
| 风险等级 | 低 | 中-高 |
| 回归测试影响 | 小 | 大（Agnes 全链路回归） |

## 四、推荐

**先做方案 A（止血，30 分钟）**：修掉 P132 不一致 + 省 3KB/轮。
Agnes 慢的问题（真正的大头）靠换模型/超时调优解决，不靠 prompt 瘦身。

**方案 B 作为 v0.90 架构演进**：等确认 Agnes API 是否支持标准 tool_calls
（若支持，双轨可去掉，直接全量 Hermes 化；若不支持，保留 Agnes 双轨）。

## 五、方案 A 实施清单

| 文件 | 改动 |
|------|------|
| `server/services/agent-buddy-skill.js` | buildChatPrompt 接收 `finalToolNames` 参数；toolDescs 只拼传入的 |
| `server/routes/agent-buddy.js` | 先算 toolNames → 传给 buildChatPrompt（调整调用顺序，~10 行） |
| `server/services/agent-buddy-action.js` | getActionToolNames 结果导出给 routes 复用 |
| `scripts/verify-buddy-code-execution.js` | 更新 buildChatPrompt 断言（8 组中 prompt 含执行工具的改法） |
| `server/__tests__/` | 若有 prompt 内容断言，同步更新 |

## 六、验证方法

```bash
# 1. 单次 chat，看 system_prompt_len 是否从 15KB → ~12KB
curl -s -X POST http://localhost:3300/api/agent-buddy/chat \
  -H 'Content-Type: application/json' -H 'X-API-Key: dev-key-001' \
  -d '{"message":"我想听梁静茹的勇气","context":{"currentView":"_default","history":[]}}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('reply','')[:100])"

# 2. 日志确认 toolNames 与 prompt 工具数一致
grep "toolNames:" data/acms.log | tail -3

# 3. Agnes 内联标签回归：确认 play_music 正常执行（tool_calls 解析成功）
grep "play_music" data/acms.log | tail -5
```

## 七、已知限制

- 方案 A 不解决 Agnes API 慢（外部因素），只解决 prompt 冗余放大
- L3 检索的"展示"与"注入"仍由 action 路由决定，检索质量依赖路由准确率
- 方案 B 若实施，Agnes 双轨分支是永久维护负担（除非 Agnes 支持标准 tool_calls）
