# OneGlanse 源码对照报告（2026-09-06）

源码位置：`C:\Users\swede\oneglanse`（23MB / 476 文件，从 codeload.github.com 拉的 main 分支快照）
对照对象：ACMS GEO app（`C:\Users\swede\acms\server\services\geo-*` + browser-agent）

## 一、OneGlanse 全貌

| 维度 | 数据 |
|------|------|
| Provider 数 | **5 个**：ChatGPT / Gemini / Perplexity / Claude / Google AI Overview（比之前 reference 多 Claude 和 AI Overview） |
| 浏览器引擎 | **Camoufox**（Firefox 内核反指纹浏览器）+ Playwright（不是 Chrome） |
| Web 框架 | Next.js 15 + React 19 + tRPC + Drizzle ORM |
| DB | PostgreSQL 16（关系）+ ClickHouse（分析时序）|
| 队列 | Redis + BullMQ（README 写）但实际用 pg_cron + http_post（代码滞后） |
| 鉴权 | Better Auth |
| LLM 评分 | OpenAI 或 Anthropic（二选一，用户自带 key） |
| 单 repo monorepo | pnpm + turbo，3 app + 6 package |

## 二、ACMS 可直接借鉴的 7 个核心资产

### 1. `ProviderConfig` 接口（state machine 模板）— apps/agent/src/core/providers/types.ts

**这是整个 OneGlanse 最有价值的"模式"，不是 DOM 选择器。** 14 个 hook 的完整状态机：

```typescript
export interface ProviderConfig {
  url: string; label: string; displayName: string;
  waitForResponse: (page: Page) => Promise<void>;
  extractResponse: (page: Page) => Promise<string>;
  extractSources: (page: Page) => Promise<Source[]>;
  beforePromptHook? / afterTypingHook? / beforeSubmitHook? / afterSubmitHook?
  beforeRetryHook? / betweenPromptsHook? / preNavigationHook? / postNavigationHook?
  navigateToPrompt? (page: Page, prompt: string) => Promise<void>;  // 搜索引擎型
  submitOrder?: Array<"native" | "enter" | "force" | "dispatch">;
  checkSubmitSuccess?: (page, ctx) => Promise<boolean | undefined>;
}
```

**给 ACMS 的建议**：`server/services/geo-engines/` 下用同样接口定义 16 个国内 provider（豆包/元宝/DeepSeek/Kimi 等）。`navigateToPrompt` 是关键 —— 元宝/百度这类需要搜索 → AI 摘要的，UI 完全不同（AI Overview 就是这种）。

### 2. DOM 选择器全集（含昨天未记录的 2 个）— apps/agent/src/core/providers/*/lib/extractSources.ts

| Provider | 关键选择器 | 文件 |
|----------|----------|------|
| ChatGPT | `ul li > a[target="_blank"][rel*="noopener"][href^="http"]` | chatgpt/lib/extractSources.ts:35 |
| Perplexity | `[role="tabpanel"][aria-labelledby*="citations"]` | perplexity/lib/extractSources.ts |
| Gemini | `inline-source-card a[href^="http"]` | gemini/lib/extractSources.ts |
| **Claude** | response element 内 DOM 抽取 + `fetchTitle` 回填（Claude source 无标题） | claude/lib/extractSources.ts:38 |
| **AI Overview** | 自定义 extractSources + expand（需要点击展开）| ai-overview/lib/extractSources.ts |

**特别重要**：Claude 的 source 没有 title 字段，OneGlanse 是用 `fetch(rawHref)` 抓 `<title>` 标签回填 —— **这正好对应你 2026-08-30 邮件修复 "Kimi/ima 无 URL → Citation.url === null" 的同类问题**，是普适模式。

### 3. Source 归一化清洗 — apps/agent/src/lib/extraction/sourceUtils.ts

**昨天 reference 没记的 3 个清洗函数**：

```typescript
PROVIDER_OWNED_SOURCE_DOMAINS = {  // 剔除自家域名
  chatgpt: ["chatgpt.com", "openai.com"],
  perplexity: ["perplexity.ai"],
  gemini: ["gemini.google.com", "google.com"],
  claude: ["claude.ai", "anthropic.com"],
  "ai-overview": ["google.com"],
}

normalizeSourceTitle()  // 去掉 "openai.com " 这类前缀
buildSources()          // URL fragment 剥离 + 域名提取 + favicon + 去重
```

**ACMS 现状**：geo-citation-classifier.js / geo-citation-extractor.js 没做这套清洗。直接抄。

### 4. `analysisPrompt` 评分 prompt（441 行）— packages/services/src/analysis/analysisPrompt.ts

**这是 L3 评分洞察层的灵魂**。7 条绝对规则：

1. ZERO HALLUCINATION POLICY（每字段必须 trace 到原文）
2. QUOTE-OR-DEFAULT（无原文支撑就降级）
3. TRACEABILITY ENFORCEMENT
4. LITERAL READING（中性 ≠ 正面）
5. **ANTI-INFLATION MANDATE**（抗 LLM 膨胀打分 —— "maybe" 算 "no"）
6. EVIDENCE-FIRST（每 coreClaim 必须 paraphrasing 原文）
7. ANALYZE STATEMENTS ONLY（不算疑问句）

**+ 9 维度评分公式**（geoScore 0-100 = visibility/rank/sentiment/recommendation 各 25%）：
- visibility（25%）= coverage 25% + placement 25% + structural prominence 20% + frequency 15% + contextual framing 15%
- sentiment 0-100，50=中性
- 6 种 recommendation type：top_pick / strong_alternative / conditional / mentioned_only / discouraged / not_mentioned

**ACMS 现状**：`geo-accuracy-judge.js` 只有简单分数，没有这套方法论。**直接抄 441 行 prompt**，改 brand 名称为目标品牌即可。

### 5. `runAnalysis` LLM 调用模式 — packages/services/src/analysis/runAnalysis.ts

86 行极简：温度 0 + JSON mode（OpenAI `responses.create` with `text.format: json_object`）+ Claude Messages API + 选其一。**`env.ANALYSIS_LLM_PROVIDER === "claude" ? :`**。

### 6. 调度架构 — packages/services/src/prompt/scheduler.ts

**意外发现**：README 写 BullMQ，但实际代码用 **pg_cron + http_post**（在 PostgreSQL 里直接 `cron.schedule()` + `http_post()` 调内部 API）。比 BullMQ 简单 —— 无需 Redis sidecar，单一 PG 实例。

**ACMS 现状**：`geo-snapshot-cron.js` 已经用 node-cron，不需要改。但 OneGlanse 的 GUC secret 管理（`ALTER ROLE ... SET app.api_base_url`）值得抄 —— 当前 ACMS cron job 的 secret 是明文，存在 .env 里。

### 7. 数据模型（BrandAnalysisResult 9 维度）— packages/types/src/types/analysis.ts

**ACMS `geo_score` 字段必须对齐的字段清单**：
```
geoScore.overall
presence.{mentioned, visibility}
position.rankPosition
sentiment.score
recommendation.type (6 enum)
competitors[{name, domain, visibility, sentiment, rankPosition, isRecommended}]
perception.{coreClaims[], differentiators[], bestKnownFor, pricingPerception (5 enum)}
risks.items[{severity (critical|warning|info)}]
```

加上 `Source{title, cited_text, url, domain, favicon}` 和 `BrandMetric{mentions, sentiment, visibility, position, website}`。**昨天 reference 没记 perception/risks/pricingPerception 这 3 个**。

## 三、与 ACMS 现状的关键对照

| 维度 | OneGlanse | ACMS GEO 现状 | 差距 |
|------|-----------|-------------|------|
| 浏览器内核 | **Camoufox (Firefox + 反指纹)** | **Playwright Chromium (Rust 包装)** | 🟡 中等：ACMS Chromium 在豆包/元宝可能没 OneGlanse 在 ChatGPT 上那么稳，但国内主流浏览器场景未必需要 Firefox 反指纹 |
| Provider 抽象 | 14 hook 状态机 | 散落在 geo-citation-extractor.js 等 | 🔴 大：必须重构成 hook 接口 |
| Source 清洗 | 3 个函数（owned domain + normalize + dedupe） | 无 | 🔴 大：直接抄 |
| 评分 prompt | 441 行方法论 | geo-accuracy-judge.js 简单打分 | 🔴 大：直接抄 |
| 数据 schema | BrandAnalysisResult 9 维度 | 简化版 | 🟡 中：补 perception/risks/pricingPerception |
| 调度 | pg_cron + http_post（实测） | node-cron + .env 明文 | 🟢 小：可借鉴 GUC secret |
| DB | PG + ClickHouse | SQLite | 🟢 不动（昨天已拍板） |
| Telemetry | PostHog SHA-256 上报 | 无 | 🟢 抄时关掉 |

## 四、昨天拍板的"不引入 OneGlanse 源码"决策 —— 现在是否需要修改？

**结论：决策保持不变**。理由更新：
1. ✅ Provider hook 接口（资产 1）→ 直接抄，30 行 TS interface
2. ✅ DOM 选择器（资产 2）→ 抄 5 个 .ts 文件核心片段
3. ✅ Source 清洗（资产 3）→ 抄 sourceUtils.ts
4. ✅ 评分 prompt（资产 4）→ 抄 analysisPrompt.ts 整文件
5. ✅ 数据 schema（资产 7）→ 抄 types/analysis.ts 的 TS interface

以上 5 项总计 **~700 行**核心代码，全部抄到 ACMS 的 `server/services/geo-engines/`，跟 OneGlanse 的 monorepo 解耦，不引入 pnpm/turbo/Drizzle/Camoufox 整套依赖。

**新认知**：OneGlanse 的 `ProviderConfig` 接口 + `analysisPrompt` 远比之前 reference 记的"4 函数"完整。**模块化借鉴不是"思路借鉴"，而是"具体 TS 接口 + 具体 441 行 prompt 借鉴"**。

## 五、下一步（待你拍板）

1. **直接抄清单**：把 5 个核心资产（assets 1/2/3/4/7）落到 `server/services/geo-engines/`，预计 1-2 个 PR
2. **国内 16 provider 适配**：用新 hook 接口写豆包/元宝/DeepSeek/Kimi 等，每个 50-100 行
3. **评分方法论切换**：geo-accuracy-judge.js 替换为 OneGlanse 9 维度评分 prompt
4. **Source 清洗上线**：所有 citation 走 `buildSources()` 清洗

要不要我接着按"直接抄清单"出 PR？还是先做哪个子项？
