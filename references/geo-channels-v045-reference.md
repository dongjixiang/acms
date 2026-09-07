# ACMS GEO v0.45 投放策略模块 — 完整参考

## 一、设计背景

借鉴 GEOVisibilityTool `geo-channels` 模块，对标其 7 节结构，利用 ACMS 已有的 citations / 竞品库 / per-engine breakdown 数据优势做更精细的策略。

**不做的事**：
- 不替换现有 `geo-optimizer-agent.js`（它是"做什么"层，保留）
- 不做 DOM recipe（A 派，ACMS 当前 B 派 API 够用）
- 不做独立 HTML 报告（保持前端内嵌面板）

---

## 二、文件清单

```
server/services/
  geo-channel-mapping.js   # 投放形态映射（新）
  geo-channels.js          # 核心逻辑（新）

server/routes/
  geo.js                   # 新增两个路由（改）

server/middleware/
  auth.js                  # 新增白名单（改）

client/js/views/
  geo-dashboard.js         # 新增 loadChannels/renderChannelsPanel（改）

client/views/
  geo-dashboard.html       # 新增 tab + 面板占位（改）

client/css/
  geo-dashboard.css        # 新增样式（改）
```

---

## 三、后端设计

### 3.1 geo-channel-mapping.js

```js
// 14 类主流平台硬编码
const CHANNEL_REGISTRY = {
  'zhihu.com': { type: 'QNA', priority: 1 },
  'juejin.cn': { type: 'BLOG', priority: 2 },
  'csdn.net': { type: 'BLOG', priority: 3 },
  'bilibili.com': { type: 'VIDEO', priority: 5 },
  '36kr.com': { type: 'MEDIA', priority: 6 },
  // ... 完整见源码
};

// 排除规则（对标 geo-channels 核心剔除）
const EXCLUDED_PATTERNS = [
  'google.com', 'baidu.com', 'bing.com',  // 搜索引擎
  'scholar.google.com', 'patents.google.com',  // 索引类
  'wikipedia.org',  // 百科
];

function isExcluded(domain) { ... }
function resolveChannelInfo(citation) { ... }
function registerChannelType(domain, config) { ... }  // 扩展 API
```

### 3.2 geo-channels.js

**核心函数**：`generateChannels(brandId, options)` → 返回 7 节数据结构

**ROI 公式**（公开可复现）：
```js
function computeROI(appearanceCount, crossEngineCount, intentCoverage) {
  if (appearanceCount >= 5 && (crossEngineCount >= 2 || intentCoverage >= 3)) return 'HIGH';
  if (appearanceCount >= 5 || (crossEngineCount >= 2 && appearanceCount >= 3)) return 'MED';
  return 'LOW';
}
```

**时间维度**：
```js
function computeTimeline(roi, hasNegative, isCompetitorWeak) {
  if (hasNegative || isCompetitorWeak) return 'URGENT';
  if (roi === 'HIGH') return 'SHORT';
  if (roi === 'MED') return 'MEDIUM';
  return 'LONG';
}
```

**七节输出结构**：
```js
{
  ok: true,
  brand: { id, name, domain },
  generatedAt: '...',
  lookbackDays: 30,
  heroMetrics: { urgentCount, topChannelCount, zeroHitCount, totalResponses },
  urgent: { items: [{ type, query, platform, evidence, action }], count },
  topChannels: [{ domain, type, contentForm, appearanceCount, engines, intents, roi, timeline }],
  perEngineStrategy: [{ engine, intents, topChannels, strategy }],
  counterPlacement: [{ competitor, domain, counterChannels: [{ domain, action }] }],
  zeroHitPlan: [{ query, intent, competitors, recommendedChannel, contentForm }],
  summary: { coreProblem, thirtyDayAction, expectedImprovement },
}
```

### 3.3 路由

```js
// GET /api/geo/channels/:brand_id — 读取（带 5 分钟缓存）
// POST /api/geo/channels/generate — 强制刷新
```

### 3.4 Auth 白名单

```js
// server/middleware/auth.js
|| /^\/api\/geo\/channels\/[^/]+$/.test(req.path)
```

---

## 四、前端设计

### 4.1 面板触发

- 按钮：「📊 投放策略」（在优化建议区域，与「✨ 生成建议」「💡 智能推荐」「📋 Schema 建议」并排）
- 全局函数：`window.toggleChannelsPanel(brandId)`
- 抽屉面板：`#geo-channels-panel`，复用 `.geo-opp-panel` 样式

### 4.2 渲染结构

```
§1 Hero Metrics — 4 卡片（紧急项 / Channel 数 / 零命中 / 总响应）
§2 🔥 紧急处理 — 红色专区（负面/误识别信号）
§3 📊 Top Channel — grid 卡片（ROI pill + 形态 pill + 时间 pill）
§4 🤖 Per-Engine — 表格（LLM × 内容偏好 × 渠道偏好）
§5 🎯 竞品反位 — 列表（对手已占位 channel + 反制动作）
§6 🕳️ 零命中 — 网格（query + 推荐 channel）
§7 📋 总结 — 3 卡片（核心问题 / 30 天行动 / 预期提升）
```

### 4.3 版本号同步（三处）

```
client/index.html:       geo-dashboard.js?v=0.45  ✅ 已是 0.45
client/js/views/geo-dashboard.js: CSS href ?v=0.45 ✅
client/js/views/geo-dashboard.js: HTML fetch ?v=0.45 ✅
```

---

## 五、与现有模块的关系

| 模块 | 定位 | 关系 |
|------|------|------|
| `geo-optimizer-agent.js` | "做什么"（内容/FAQ/Schema） | 互补，不冲突 |
| `geo-opportunities.js` | "内容机会"（creation/outreach/social） | opportunities.outreach 引用 channels.Top10 |
| `geo-schema-suggest.js` | "结构化数据"（纯规则） | 独立，不重叠 |
| **`geo-channels.js`** | **"投到哪"**（新） | 补全"测→投"最后一公里 |

---

## 六、已知限制 & 后续迭代

1. **citations 数据为空时 topChannels=0**：当前 tracker 采集的 citations 字段可能为空（取决于 engine adapter 是否填充）。等国内引擎接入（v0.46+）后数据会变丰富。
2. **sentiment 检测是启发式**：用负面词匹配，不准确。后续可接 `geo-sentiment.js`。
3. **竞品反位依赖 watch 配置**：需要用户在「竞品 Watch」tab 里配好竞争对手。
4. **channel mapping 硬编码 14 类**：用 `registerChannelType()` API 可扩展。

---

## 七、测试命令

```bash
# 后端验证
cd C:/Users/swede/acms
node -e "
const channels = require('./server/services/geo-channels');
const store = require('./server/services/geo-store');
const b = store.listBrands()[0];
channels.generateChannels(b.id).then(r => console.log(JSON.stringify(r, null, 2)));
"

# 前端验证
# 1. 浏览器强刷 http://localhost:3300（Ctrl+Shift+R）
# 2. 选一个品牌
# 3. 点「📊 投放策略」按钮
# 4. 看抽屉面板是否渲染 7 节结构
```
