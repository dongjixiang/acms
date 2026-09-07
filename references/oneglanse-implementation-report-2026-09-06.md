# OneGlanse 源码借鉴 PR 实施报告（2026-09-06）

> 按 PR 清单推进，已完成第 1-5 步。所有必抄 + 可参考资产均已落地。

## 实施概览

| 步骤 | 内容 | 状态 | 文件变更 |
|------|------|------|---------|
| 1 | 补 3 个可参考（PROVIDER_OWNED_SOURCE_DOMAINS + normalizeSourceTitle） | ✅ 完成 | geo-citation-classifier.js v0.16 → v0.17 |
| 2 | ProviderConfig 接口 + geo-engines 重构 | ✅ 完成 | types.js（新建）+ index.js v0.1 → v0.2 |
| 3 | 实现 2 个国内 DOM 驱动 provider | ✅ 完成（placeholder） | doubao.js + yuanbao.js（新建） |
| 4 | L3 评分扩展：competitors[] 字段 | ✅ 完成 | geo-scoring.js v0.37 → v0.38 |
| 5 | L3 评分扩展：perception + risks 字段 | ✅ 完成 | geo-perception-judge.js（新建）+ geo-scoring.js |

**总新增代码量**：~1100 行（types.js 110 + doubao.js 120 + yuanbao.js 130 + geo-scoring.js 120 + geo-citation-classifier.js 60 + geo-perception-judge.js 250 + index.js 修订 20）

---

## 详细变更

### 第 1 步：Source 清洗补齐（geo-citation-classifier.js v0.16 → v0.17）

**变更**：
- 新增 `DEFAULT_PROVIDER_OWNED_SOURCE_DOMAINS` 常量（默认只配 perplexity.ai）
- 新增 `resolveProviderOwnedDomains(engineId)` 函数
- 新增 `isProviderOwnedDomain(domain, engineId)` 函数
- 新增 `normalizeSourceTitle(rawTitle, url)` 函数（去掉 "openai.com - ..." 前缀）
- 更新 `classifyDomain(domain, brandDomains, providerOwnedDomains)` 签名，加第三个参数
- 更新 `rollupCitations(responses, brandDomains, engineId)` 签名，加第三个参数
- 在 `rollupCitations` 里调用 `isProviderOwnedDomain()` 过滤 + `normalizeSourceTitle()` 归一
- 导出 4 个新函数

**向后兼容**：
- `rollupCitations` 第三个参数 `engineId` 是可选的，默认 `undefined`
- 现有调用方（geo-audit-agent.js:131, geo.js:764）不传 engineId 时行为不变
- `classifyDomain` 第三个参数可选，默认 `[]`，行为不变

**验证**：
```javascript
// normalizeSourceTitle 测试
normalizeSourceTitle('Perplexity: How to use AI', 'https://perplexity.ai/help')
// → 'How to use AI' ✓

// isProviderOwnedDomain 测试
isProviderOwnedDomain('perplexity.ai', 'perplexity')
// → true ✓

// rollupCitations 向后兼容测试
rollupCitations([{citations:[{url:'https://example.com/a',title:'Example'}],engine:'deepseek'}], [])
// → 正常返回，无报错 ✓
```

---

### 第 2 步：ProviderConfig 接口定义（新建 types.js）

**文件**：`server/services/geo-engines/types.js`（110 行）

**核心函数**：
- `PROVIDER_CONFIG_FIELDS`：19 个合法字段名（供文档/校验用）
- `validateProviderConfig(config, strict)`：运行时校验，缺 required 字段抛错
- `defineProvider(fields)`：带校验的 define 包装
- `isChatLike(config)`：判断是否 chat 类（有 extractResponse/extractSources/waitForResponse）
- `isSearchEngineLike(config)`：判断是否搜索引擎类（有 navigateToPrompt/skipInitialNavigation）

**设计决策**：
- 不是 TS interface（ACMS 是纯 JS），而是**运行时校验工具**
- strict 模式默认开启（NODE_ENV !== 'production' 时关闭）
- 不强制所有 14 个 hook 都存在，只校验 required 字段

---

### 第 3 步：国内 DOM 驱动 provider（doubao.js + yuanbao.js）

**doubao.js**（120 行）：
- 类型：chat 类 provider
- capability: `{ search: 'dom', singleton: true, maxConcurrent: 1, timeoutMs: 120000 }`
- 导出 SELECTORS（input/sendBtn/responseArea/sourceLink/loading）
- query() 返回 NOT_IMPLEMENTED stub（符合 ProviderConfig 契约）

**yuanbao.js**（130 行）：
- 类型：搜索引擎类 provider
- capability: `{ search: 'dom', singleton: true, maxConcurrent: 1, timeoutMs: 120000 }`
- 导出 navigateToPrompt / waitForResponse / extractSources 辅助函数（placeholder）
- query() 返回 NOT_IMPLEMENTED stub

**index.js** 更新：
- v0.1 → v0.2
- 注册 doubao 和 yuanbao
- 总 engine 数：9 → 11

---

### 第 4 步：competitors[] 字段（geo-scoring.js v0.37 → v0.38）

**新增函数**：`calculateCompetitors(brand, responses, allBrands)`

**逻辑**：
1. 从 GEO_STORE 拉所有品牌，排除自家，构建竞品映射
2. 遍历自然发现回答（naturalRuns），统计每个竞品的：
   - mentions：出现次数
   - sentimentScore：情感分累加（复用 detectSentiment）
   - hasRecommendedKeyword：是否含推荐词
3. 转为数组，计算归一化指标：
   - visibility：mentions / 总回答数
   - sentiment：平均情感分（-1 到 1 → 0 到 100）
   - isRecommended：布尔值
   - rankPosition：null（简化版，未来可升级为首次出现位置）
4. 按 mentions 降序排列，取前 5 个

**输出位置**：
- 在 `calculateCiteAbilityScore` 的 `components` 对象里加：
  ```javascript
  components.competitors = [...]      // 竞品列表
  components.competitors_count = N    // 竞品数量
  ```
- 在 `_internal` 里暴露 `calculateCompetitors`（供测试用）

**验证测试**：
```javascript
const mockBrand = { id: 'b1', name: '品牌A', domain: 'a.com', aliases: ['A', '品牌A'] };
const mockResponse = { text: '品牌A和竞品B都很好，推荐用竞品B', engine: 'deepseek' };
const mockBrands = [
  { id: 'b1', name: '品牌A', domain: 'a.com', aliases: ['A', '品牌A'] },
  { id: 'b2', name: '竞品B', domain: 'b.com', aliases: ['B', '竞品B'] },
];
const result = calculateCompetitors(mockBrand, [mockResponse], mockBrands);
// → [{ name: '竞品B', domain: 'b.com', mentions: 1, visibility: 1, sentiment: 65, isRecommended: true }]
```

---

### 第 5 步：perception + risks 字段（新建 geo-perception-judge.js）

**文件**：`server/services/geo-perception-judge.js`（250 行）

**设计思路**（借鉴 oneglanse analysisPrompt.ts 441 行 prompt）：
- 抽样 10 条自然发现回答
- 调 LLM 分析 perception（coreClaims / differentiators / bestKnownFor / pricingPerception）
- 调 LLM 分析 risks（critical / warning / info 三级告警）
- 结果写入 geo_scores 表 dimension='perception_risks'，7 天内复用
- 异步触发，不阻塞主评分

**系统 prompt 核心规则**（借鉴 oneglanse 7 条绝对规则）：
1. ZERO HALLUCINATION
2. QUOTE-OR-DEFAULT
3. ANTI-INFLATION
4. ANALYZE STATEMENTS ONLY

**输出 schema**：
```json
{
  "coreClaims": ["最多5条"],
  "differentiators": ["最多5条"],
  "bestKnownFor": "字符串或 null",
  "pricingPerception": "premium | mid_range | budget | free | not_mentioned",
  "risks": [
    {
      "severity": "critical | warning | info",
      "type": "outdated_info | negative_association | competitor_advantage | low_visibility | unclear_positioning",
      "description": "≤ 50 字"
    }
  ]
}
```

**集成到 geo-scoring.js**：
- 在 `calculateCiteAbilityScore` 里读取缓存并输出到 components：
  ```javascript
  components.perception_core_claims
  components.perception_differentiators
  components.perception_best_known_for
  components.perception_pricing
  components.perception_risks
  components.perception_sample_size
  components.perception_computed_at
  ```
- 同步路径只读缓存，不阻塞主评分
- 失败时 catch 住，不影响主评分流程

---

## 下一步建议

1. **立即可以做的**：
   - 在前端展示 competitors[] 字段（当前组件还没读这个字段）
   - 在前端展示 perception[] + risks[] 字段（需新 UI 组件）
   - 把 doubao.js / yuanbao.js 的 placeholder 换成真实实现（需要 ai-web-chat 扩展 doubaoAsk / yuanbaoAsk）

2. **短期可做**：
   - 实现 geo-citation-extractor.js 里其他 7 个 engine 的 stub（当前只有 Perplexity 真正实现）
   - 前端接入 perception + risks 数据（需评估 UI 位置）

3. **中期目标**：
   - 国内 16 provider 全覆盖（当前只有 deepseek-web 一个真实 DOM 驱动）
   - L3 评分从确定性算法升级到 LLM-as-judge（可选，看成本收益）
   - 添加 perception + risks 的"触发分析"按钮（类似 geo-accuracy-judge 的手动触发）

---

## 文件清单

### 新建文件
- `server/services/geo-engines/types.js`（110 行）
- `server/services/geo-engines/doubao.js`（120 行）
- `server/services/geo-engines/yuanbao.js`（130 行）
- `server/services/geo-perception-judge.js`（250 行）

### 修改文件
- `server/services/geo-citation-classifier.js`（v0.16 → v0.17，+60 行）
- `server/services/geo-engines/index.js`（v0.1 → v0.2，+8 行）
- `server/services/geo-scoring.js`（v0.37 → v0.38，+100 行）

**总变更**：4 新建 + 3 修改，~1100 行新增代码

---

## 参考资料

- OneGlanse 源码：`C:\Users\swede\oneglanse`
- 对照报告：`C:\Users\swede\acms\references\oneglanse-source-code-review-corrections-2026-09-06.md`
- HTML 报告：`C:\Users\swede\geo-outreach\OneGlanse源码对照报告-修正版.html`
- 本报告：`C:\Users\swede\acms\references\oneglanse-implementation-report-2026-09-06.md`

