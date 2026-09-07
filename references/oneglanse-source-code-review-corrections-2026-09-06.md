# OneGlanse 源码对照报告 — 代码核实修正（2026-09-06）

> 昨天生成的 HTML 报告《OneGlanse源码对照报告.html》里有 4 处判断失准，经逐文件核实 ACMS GEO 应用后修正。本报告只写**需要修正的地方**和**实际差距评估**。

## 修正项汇总

| # | 原报告判断 | 实际代码情况 | 修正等级 |
|---|----------|------------|--------|
| 1 | geo-accuracy-judge.js "只有简单打分" | **错误**。它是 v0.36 LLM-as-judge，独立于主评分，用于 fact-check（判定 AI 回答里品牌事实描述是否准确），不是主评分器 | 🔴 重要 |
| 2 | "ACMS 评分 = 简单打分，缺方法论" | **错误**。`geo-scoring.js` 750 行 v0.37，已是完整算法系统（mentionRate 50% + SoV 20% + position 15% + context 15%，含 engineered sentiment / branded-natural 分层 / Top1 率 / 行业分位） | 🔴 重要 |
| 3 | "Source 清洗 3 函数没做" | **部分错误**。`geo-citation-extractor.js`（217 行，借鉴 elmo MIT）有 normalizeUrl/extractDomain/去重；`geo-citation-classifier.js`（220 行，借鉴 elmo MIT）有 URL 归一 + 域名分类（brand/editorial/reviews/social/forum/ecommerce/reference/institutional/other）+ 页面类型推断 + rollup | 🟡 中 |
| 4 | "调度用 node-cron" | **错误**。`geo-snapshot-cron.js` 用**裸 setInterval**（无第三方 cron 库依赖），每周六 02:00 UTC 触发。跟 OneGlanse 的 pg_cron + http_post 完全不同思路，但功能等价。OneGlanse GUC secret 管理可借鉴，但无需照抄 | 🟡 中 |

## 逐项详细核实

### 修正 1：geo-accuracy-judge.js 不是"简单打分"

**文件**：`server/services/geo-accuracy-judge.js`（231 行）
**版本**：v0.36（注释里有明确迭代记录）
**真实定位**：**LLM-as-judge 的事实核查模块**，用于判定 AI 回答里品牌描述是否准确（"X 公司成立于 2005 年"但实际 2015 → misleading）。这是独立于主评分的补充维度，通过 `GEO_ACCURACY.getCachedAccuracy(brandId)` 异步读入 `calculateCiteAbilityScore` 的 components 输出。

它**不是**主评分器。主评分器是 `geo-scoring.js`。

### 修正 2：geo-scoring.js 才是主评分器（v0.37，非常成熟）

**文件**：`server/services/geo-scoring.js`（750 行）
**版本**：v0.37（有详细 v0.26 C3 / v0.30 / v0.34 / v0.36 / v0.37 迭代记录）
**真实结构**：

```
综合分公式（L3 核心算法）：
  totalScore = (mentionRate × 0.5 + sov_natural × 0.2 + positionScore × 0.15 + contextScore × 0.15) × 100

components 输出字段（13 个）：
  mention_rate, position_score, context_score, engine_consistency, freshness,
  sov_natural, branded_mention_rate, branded_ratio, coverage_detail, coverage_engine_count,
  accuracy_rate, top1_rate, citation_share, industry_percentile

独立函数：
  - calculateMentionRate()        // 提及率
  - calculatePositionScore()      // 相对位置（回答长短不偏）
  - calculateContextScore()       // 长度 + 情感信号（推荐词+0.3/批评词-0.3）
  - calculateSoV()                // 自然发现份额（v0.30 修复过 bug：之前 brandHitCount 恒为 0/1）
  - calculateEngineConsistency()  // 多引擎一致性
  - calculateFreshness()          // 时效性（最近 30 天占比）
  - calculateTop1Rate()           // 首位推荐率（商业意图子集 + 列表结构识别）
  - calculateCitationShare()      // AI 引用占比（基于 geo_responses.citations）
  - calculateIndustryPercentile() // 行业分位（同行业品牌排名）
```

**关键设计特点**：
- branded/natural 分离（v0.26 C3）：unbranded（自然发现）才是核心指标
- alias 遍历（v0.30）：brand.name + aliases 任一命中算提及
- 递归守卫（v0.44）：`_skipIndustryPercentile` 打破 calculateIndustryPercentile ↔ calculateCiteAbilityScore 互相调用的无限递归

**与 OneGlanse 对比**：
| 维度 | ACMS geo-scoring.js | OneGlanse analysisPrompt |
|------|---------------------|-------------------------|
| 评分方式 | **确定性算法**（正则/字符串/统计） | **LLM-as-judge**（温度 0 + JSON mode） |
| 维度数 | 4 维 + 9 附加指标 | 9 维度（含 competitors[] / perception[] / risks[]） |
| 情感分析 | 词表匹配（推荐/批评各 +0.3/-0.3） | LLM 判断 |
| 竞品分析 | 无（只算品牌自身分数） | 有（competitors[] 数组） |
| 定价感知 | 无 | pricingPerception（premium/mid_range/budget/free/not_mentioned） |

### 修正 3：Source 清洗已有，但功能边界不同

**`geo-citation-extractor.js`（217 行）** — 从 raw response 里提取 Citation 数组，支持 Perplexity（唯一真正实现），其他 7 个 engine 是 stub。借鉴 elmo MIT 代码，有：
- `normalizeUrl()`：去 tracking 参数 / 去 www / 强制 https / 去尾斜杠
- `extractDomain()`：URL → domain
- `collectCitations()`：通用遍历 + 去重（Set）
- 每 engine 一个 `extractCitationsFromXxx()` + dispatch

**`geo-citation-classifier.js`（220 行）** — 基于 extractor 输出的 URL 列表做**域名分类 + 页面类型推断 + rollup 聚合**，借鉴 elmo MIT。输出包括：
- `category_tally`：brand/editorial/reviews/social/forum/ecommerce/reference/institutional/other
- `page_type_tally`：homepage/article/listicle/comparison/review/howto/forum/video/doc/product/info/other
- URL 级 + 域名级双层统计

**实际差距**：
- ✅ ACMS **有** URL 归一、域名提取、去重、分类 —— 这些 OneGlanse 的 `sourceUtils.ts` 也有，但实现路径不同（ACMS 走 elmo，OneGlanse 走自研）
- ❌ ACMS **没有** `PROVIDER_OWNED_SOURCE_DOMAINS`（剔除自家域名）—— 这点 OneGlanse 做了，ACMS 没做
- ❌ ACMS **没有** `normalizeSourceTitle`（去掉 "openai.com " 前缀）—— OneGlanse 有，ACMS 没有
- ✅ ACMS **已有** rollup + 域名级统计 —— 这是 OneGlanse 的 DomainStats 的等价物
- ⚠️ ACMS citations 是**埋在 responses JSON 里的**，未做行级存储（架构文档 Phase 1 计划里就是"geo_citations 表行级化"，P0 优先级）

**结论**：Source 清洗这块 ACMS **做得比 OneGlanse 还全面**（有分类 + 页面类型 + rollup），唯一缺的是"自家域名剔除"和"title 前缀归一"两个小函数。**我之前判断"Source 清洗差距 = 🔴 大"是错误的**。

### 修正 4：调度是裸 setInterval，不是 node-cron

**`geo-snapshot-cron.js`（204 行）**：
- 用裸 `setInterval` + 手动计算下周六 02:00 UTC
- 状态：isRunning / lastRun / nextRun / lastResult
- 调用 `geo-tracker-agent.runTracker()` 触发全量 tracker
- 调用 `geo-scoring.generateSnapshotSummary()` 生成周报

OneGlanse 的实际调度是 pg_cron + http_post（README 写的 BullMQ 已过时）。两者功能等价，只是技术路线不同。OneGlanse 的 GUC secret 管理（`ALTER ROLE ... SET app.api_base_url`）值得参考，但 ACMS 当前 `.env` 明文存储也可接受，不值得为这点改。

## 重新评估：实际借鉴价值排序

### 🔴 必抄（对应 ACMS 真缺口）

1. **ProviderConfig hook 接口**（30 行 TS interface）—— 国内 16 provider 适配的统一模板。这是 ACMS `geo-engines/index.js` 当前 `async ask()` 协议的**结构化升级**，让 "chat 类 provider（元宝/豆包）" 和 "搜索引擎类 provider（AI Overview 型）" 走不同分支。

2. **DOM 选择器参考**（5 个 provider 的核心片段）—— ACMS 目前只有 `deepseek-web` 一个 browser-agent 驱动引擎，未来加豆包/元宝/文小言时需要这套 DOM 抽取模式作为模板。

3. **竞品分析模型**（`competitors[]` 字段）—— ACMS geo-scoring.js 完全没有竞品共现分析，OneGlanse 的 BrandAnalysisResult.competitors 字段可补这个维度。

4. **perception 维度**（coreClaims / differentiators / bestKnownFor / pricingPerception）—— ACMS 现有情感分是词表匹配，缺 LLM 级品牌叙事分析。

5. **risks 维度**（critical/warning/info 三级告警）—— 缺失。

### 🟡 可参考但不必抄

6. **Source title 前缀归一函数**（normalizeSourceTitle，10 行）—— 可直接 add 到 geo-citation-classifier.js
7. **PROVIDER_OWNED_SOURCE_DOMAINS** 配置表（一行对象）—— 加到同一文件
8. **分析 prompt 的 7 条绝对规则** —— 如果未来把 L3 从确定性算法升级到 LLM-as-judge，这些规则可直接复用
9. **pg_cron GUC secret 管理** —— 如果未来想从 node-cron 切到 pg_cron 再抄

### 🟢 无需抄

10. Camoufox / BullMQ / ClickHouse / pg_cron 整条栈 —— ACMS 的 agent-browser + node-cron + SQLite 路线已定

## 修正后的结论

**昨天 "不引入 OneGlanse 源码" 的决策维持不变**。但借鉴清单从"7 个资产"修正为：

- **必抄（4 项，~400 行核心代码）**：ProviderConfig hook 接口 + DOM 选择器 + competitors[] schema + perception/risks 维度
- **可参考（5 项，~30 行）**：title 前缀归一 + 自家域名剔除 + 7 条绝对规则 + GUC 模式
- **不抄（4 项）**：Camoufox/BullMQ/ClickHouse/pg_cron 全栈

**总借鉴量从估算的 700 行压缩到 ~430 行**，集中在 L1 采集层（国内 16 provider 模板）和 L3 评分层（竞品分析 + perception + risks）。

## 源码位置

- 源码：`C:\Users\swede\oneglanse`（23MB / 476 文件，git 仓已初始化）
- 本报告对照源：`C:\Users\swede\acms\references\oneglanse-source-code-review-2026-09-06.md`
- 修正 HTML 报告待生成
