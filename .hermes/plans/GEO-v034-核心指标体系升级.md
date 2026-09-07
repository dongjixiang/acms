# GEO v0.34 核心指标体系升级 —— 规划草案

> 状态：草案 · 待评审
> 拟定版本：v0.34（在 v0.33 Opportunities 之上）
> 拟定目标：补齐"四层漏斗"中 L2 推荐信任层的核心信号，让，让 ACMS GEO 从"能测"走向"能讲对外故事"

---

## 一、背景与动机

### 1.1 现状盘点（v0.33）
- 已实现：8 键指标（mention_rate / position_score / context_score / engine_consistency / freshness / sov_natural / branded_mention_rate / branded_ratio）、综合分加权、多品牌库（13 银行品牌批量追踪）、引擎覆盖 9+ 个、Opportunities 智能推荐、citation 分类、4 类意图追踪。
- 已成型：底层数据齐全（geo_brands / geo_queries / geo_responses / geo_scores 表），算法分层清晰，前端 geo-dashboard.js 2800+ 行已承载大量可视化。

### 1.2 缺口（从对外材料反推）
| 维度 | 现状 | 缺口 | 影响 |
| | --- | --- | --- |
| 首位推荐率 | position_score 平均位置分 | 没有"商业意图子集 + 首位"独立指标 | L2 核心战场无可对外讲的故事 |
| AI 引用占比 | citation 分类已有，无独立指标 | 没有"AI 引用占比 / 信源占比"产出 | 客户看不到"AI 真的引用了你网站" |
| 行业分位 | 自有多品牌数据，无横向对比 | 客户看不到自己"在 13 银行里排第几" | 缺少行业基准，参照系缺失 |
| 平台覆盖度 | engine_consistency 概念 | 没独立 UI 视图 | 客户不知道"我覆盖了几个主流 AI" |
| 描述准确率 | 完全空白 | 无 LLM-as-judge 检测 | AI 错误描述品牌时无法主动告警 |

### 1.3 价值锚点
- **对外讲故事能力跃迁**：之前 ACMS GEO 给客户讲的是"你的 mention 多少 / 位置多少 / SoV 多少"——这是数据。讲不出来的是"你的商业意图问题里被 AI 第一个提名的占比多少 / 你的内容在 AI 答案里占比多少 / 你在同行里排第几"。本版本补三个，可对外讲故事。
- **潜在差异化**：AI 引用占比 + 行业分位在竞品（elmo / ansvisor / geo-aeo-tracker）里也没成熟。13 银行品牌库是壁垒（竞品没有这个数据规模）。

---

## 二、目标与原则

### 2.1 三个 P0 功能（本期交付）
1. **首位推荐率**：在"商业意图 query 子集"中，品牌被 AI 第一个点名的占比。
2. **AI 引用占比**：在 AI 回答的引用源里，品牌内容出现的占比（含自营站点与被引第三方内容）。
3. **行业分位**：在 ACMS 同一行业类目的品牌库中，客户品牌的综合分百分位排名。

### 2.2 设计原则
- 复用既有数据与组件，不重新造轮子。
- 指标要"对客户可解释"——每一个新指标都对应对外材料里的一句话定义。
- 任何"漂亮但难落地"的指标可以推迟（不在 P0 范围）。
- 与 v0.31 的 4 类意图追踪协同：商业意图子集正是 comparative 类的子集。

---

## 三、功能 1：首位推荐率（First-Position Recommendation Rate）

### 3.1 业务定义
> 用户问"哪家好 / 推荐 / 对比 X"这类**商业意图问题**时，AI 回答中**第一个**点名的品牌是你的占比。

这是离"成交"最近的可见性指标——被提到只是入场券，被当首是成交前奏。

### 3.2 算法设计
**步骤**：

1. 筛选商业意图子集 query：
   - 复用 v0.31 `inferIntentAndTags()` 已推导出 `intent:comparative` 的 query
   - 进一步过滤 prompt 含"哪家 / 推荐 / 对比 / 排行 / Top / 哪个 / 选 / best / top / recommend"任一关键词（同时支持中英文）
   - 子集最小样本：≥ 20 条（不足时标"样本不足"灰色显示）

2. 计算每条 query 的首位位置：
   - 在该 query 的 response raw_answer 中，按 `getMatchTerms(brand)` 找到品牌所有变体首次出现位置
   - 取所有变体中最早的位置字符索引 `earliest`
   - 判定是否为"首位"：
     - 若回答中存在明显的列表结构（"第一名 / Top1 / 第一 / ①"等标记，或每条以换行+编号开头），以列表首项为第一位
     - 否则以 raw_answer 开头 200 字符内出现为"首位"（保守阈值，可配）

3. 首位率聚合：
   ```
   top1_rate = count(brand是首位) / 子集query总数
   ```

4. 拆维度：
   - 按 engine 分：每个引擎的 top1_rate（用于发现引擎差异）
   - 按 branded/unbranded 分：branded 几乎 100%（baseline），重点看 unbranded
   - 趋势：与上一周期对比 delta

### 3.3 与 position_score 的关系
| 维度 | position_score | 首位推荐率 |
| --- | --- | --- |
| 范围 | 所有 query | 商业意图子集 |
| 度量 | 字符比例相对位置 | 离散：首位 vs 非首位 |
| 粒度 | 0~1 连续值 | 0%~100% 离散占比 |
| 用途 | 通用"出现早晚"评估 | "商业场景被推荐力度"评估 |

两者并存不互斥：position_score 是大背景，top1_rate 是商业战场关键指标。

### 3.4 UI 设计
**Dashboard 金卡**：与综合分（综合得分卡）并列，新增"★ 首位推荐率"独立大卡。
- 标题：`★ 首位推荐率`（金色徽章）
- 主数字：top1_rate（大字号 + 颜色按分位定性：>50% 金 / 30-50% 品牌色 / <30% 灰）
- 副指标：
  - 商业意图 query 数（"基于 X 条商业意图问题"）
  - 上周期 delta（↑ / ↓ X%）
  - 按引擎分布小条（4 个引擎的 top1_rate 横向条形）
- 悬停说明 tooltip：定义 + 计算逻辑 + 怎么改善
- 截图占位：略（实现时出一稿）

**趋势图**：与现有综合分趋势图并列，新增 top1_rate 折线（双 Y 轴：分位% + 样本数虚线）。

**下钻视图**：点击金卡展开商业意图子集逐条 query 的明细（query 文本、AI 回答、首位判断理由、点击跳到回答快照）。

### 3.5 数据模型与代码改动
- **新算法函数**：`server/services/geo-scoring.js` 加 `calculateTop1Rate(brandId, options)`
- **复用**：`getMatchTerms(brand)`（geo-match.js）、`inferIntentAndTags()`（v0.31 已有）、`getIntentTag('comparative')`
- **缓存策略**：与综合分同节奏重算（每轮 tracker 完成后），写入 geo_scores 新键 `top1_rate` + `top1_by_engine` JSON
- **坑提醒**：
  - brandName 字符串字符串字符串退化（坑 #36）—— 必须传完整 brand 对象，getMatchTerms 才能读到 aliases
  - 中文分词字符比例位置（v0.30 修复）—— 但首位判断不依赖 position_score，复用字符索引判定即可
  - 列表结构识别是中英文双轨——实现时收集样例 query/answer 做规则规则

### 3.6 边界与不做
- 不做"每位推荐率"（top3 / top5）—— 本期只做 top1，P1 再扩
- 不做 query 文案的"难度分级"—— 一律视作商业意图，由用户后续看明细
- 首位名单稳定性问题（同一 query 多次跑结果可能不同）—— 走 `engine_consistency` 同源策略（多次跑取众数）

### 3.7 验证标准
- [ ] 单元测试：mock 5 条 comparative query + 5 条 non-comparative，验证子集筛选
- [ ] mock raw_answer 含"第一位是 A，第二是 B..."与"开头 200 字提 A"，验证两种首位判定路径
- [ ] 集成：选 3 个真实品牌跑一遍，与人工判断首位的一致率 ≥ 80%
- [ ] UI：金卡在 dashboard 显眼展示，趋势图渲染正常，移动端断点工作

---

## 四、功能 2：AI 引用占比（Citation Share）

### 4.1 业务定义
> AI 回答所附带的引用源（信源）中，**品牌相关内容**出现的占比。

这是 L2 信任层最硬的信号——比 mention 更接近"AI 真的在引用你"。是 v0.33 移植的 elmo `text-extraction.ts` 能力的直接产品化。

### 4.2 算法设计
**步骤**：

1. 解析 response 的 citations：
   - 复用 `geo-citation-extractor.js` 已分类的 citation（来源类型：brand-site / earned-media / social / 等）
   - 每条 citation 至少含：`url` + `domain` + `type`

2. 判定"品牌相关"：
   - **类型 brand-site**：直接判为品牌相关（品牌自营站点）
   - **类型 earned-media / social / other**：URL 或文本中是否含 brand.aliases（复用 `getMatchTerms(brand)` 的扩展匹配）
   - 边界：竞品站点不在 brand-site 分类但被 brand aliases 误判 → 复用 v0.30 防自指过滤（`!selfMatchTerms.has(t)`）反向应用——竞品的 aliases 与本品牌 aliases 取交集，过滤掉

3. 占比聚合：
   ```
   citation_share = brand_citation_count / total_citation_count
   ```
   - 多 response 聚合：每个 response 独立算 share，加权平均（按每个 response 的 citation 数加权）
   - 拆维度：按引擎 / 按 branded/unbranded

4. 衍生：
   - **品牌内容被引绝对数**：单 response 平均 brand 引用数
   - **引用多样性**：引用的 brand 站点域名数（多样性越高越权威）

### 4.3 UI 设计
**金卡**：与首位推荐率、原有"自然 SoV"并排，新增"🔗 AI 引用占比"卡。
- 主数字：citation_share%
- 副：自营站点被引 X 次 / 总引用 X 次 / 跨 Y 个域名
- 趋势线
- 下钻：每条 response 的引用清单（域名 + 类型 + 是否品牌），点击跳回答快照
- 悬停说明：定义 + 怎么提高（"在品牌站点多发可被 AI 抓取的结构化内容"）

### 4.4 数据模型与代码改动
- **新算法函数**：`server/services/geo-scoring.js` 加 `calculateCitationShare(brandId, options)`
- **复用**：`geo-citation-extractor.js` 的 `extractCitations(response)`、`getMatchTerms(brand)`、v0.30 防自指逻辑
- **写入**：`geo_scores` 加 `citation_share` + `citation_share_by_engine` + `citation_brand_count` + `citation_total_count`
- **坑**：
  - citation 抽取覆盖率（v0.33 移植时测过的真实数据，markdown 中需对齐）
  - 防自指（v0.30 已有逻辑）—— 复用，不是新发明
  - brand-site 域名配置：brand 表需要 `domains` 字段（或读 brand.website）

### 4.5 边界
- 不做"引用情感分析"（cite 是否带正面/负面情绪）—— P1 议题
- 不做"AI 在引用中描述品牌的准确性"—— 与功能 3 描述准确率联动
- 引用类型分类不增加新类型 —— 复用 v0.33 已有的 brand-site / earned-media / social / other

### 4.6 验证标准
- [ ] 单元测试：mock response 带已知 citations（5 品牌域 + 3 竞品域 + 2 无关域），验证占比计算
- [ ] 防自指：竞品 aliases 与本品牌 aliases 撞词时，本品牌 share 不虚高
- [ ] 集成：选 3 个品牌跑真实数据，与人工抽样 30 条核对一致率 ≥ 85%
- [ ] UI：渲染正常，下钻可看引用清单

---

## 五、功能 3：行业分位（Industry Percentile）

### 5.1 业务定义
> 在 ACMS 同行业类目的品牌库中，客户品牌当前综合分（及关键子分）的百分位排名。

回答"我在同行里排第几"。替代无出处的"及格/良好/优秀"行业阈值，提供基于真实数据的参照系。

### 5.2 算法设计
**步骤**：

1. 行业类目：
   - brand 表加 `industry` 字段（已有？如无，需 schema 迁移 + 现有品牌批量打标）
   - 13 银行品牌按"banking"类目归类（v0.31 批量追踪已知）
   - 后续行业类目随品牌新增扩展

2. 行业基准库构建：
   - 选定首批 3 个行业：banking / 品牌设计 / 会展服务（基于已有追踪品牌）
   - 每个行业需要 ≥ 8 个品牌样本（分位才有意义）
   - 每个品牌的"基线值"用最近 30 天的综合分 + 关键子分（mention_rate / top1_rate / citation_share / position_score）

3. 分位计算：
   - 百分位 = (排名升序中小于当前值的品牌数) / (行业总品牌数 - 1)
   - 输出：前 25% / 中位 / 后 25% 三个标签 + 行业均值
   - 关键子分也分别算分位（多指标分位卡片）

4. 行业 dashboard 视图（按行业分组）：
   - 行业总览：行业品牌数、均值综合分、最高分品牌
   - 客户位置：百分位可视化（带状图 + 客户位置标记）

### 5.3 UI 设计
**新增"行业位置"view**：在现有 overview/watch/queries/reports 等 tab 之间，新增 tab 或 sub-sub：
- 顶部：行业均值卡片 + 客户百分位大数字（"你在 X 行业排前 Y%"）
- 中部：带状图 —— 横轴综合分分位，纵轴品牌分布散点，客户品牌高亮
- 下部：分指标分位对比（mention_rate / top1_rate / citation_share / position_score 四列，客户 vs 行业中位）
- 行业品牌榜：排行榜表，前 10 名 + 客户所在位置

### 5.4 数据模型与代码改动
- **schema**：`geo_brands` 加 `industry` 字段（迁移 + 13 品牌批量打标，banking 已知）
- **新算法**：`server/services/geo-scoring.js` 加 `calculateIndustryPercentile(brandId, metric)`
- **新数据查询**：按 `industry` 聚合查询同行业品牌的指标分布
- **新 UI**：geo-dashboard.js 加 tab + view，HTML 加 tab pane + CSS
- **坑**：
  - 重启依赖（server/services 改动）—— 必 restart 3300
  - 前端版本号 `?v=` 三处同步（geo-dashboard.js + index.html 加载引用 + geo-dashboard.css）
  - auth 白名单（如新加端点需豁免，按 v0.33 模式）

### 5.5 冷启动策略（首批行业基准）
1. banking（13 品牌）——：直接用 v0.31 批量追踪数据
2. 品牌设计 / 会展服务 ——：当前追踪品牌覆盖 1-2 个，需补采集 5-8 个品牌达到 8+ 样本阈值
3. 阈值过低的行业不展示百分比，标"样本不足"

### 5.6 边界
- 不做"行业未来预测"——本期只给静态分位
- 不做"跨行业对比"——只做同行业内对比
- 不让客户自行选行业归类 —— industry 由 ACMS 运营/产品方打标（避免客户作弊）

### 5.7 验证标准
- [ ] 13 银行品牌：行业分位与综合分一致（同行业同分时给同一百分位）
- [ ] 新增品牌样本后分位更新
- [ ] UI：行业 tab 加载、移动端、悬停说明齐全
- [ ] 文档：行业基准数据每月刷新频率在帮助文档写明

---

## 六、实施路径

### Phase A：后端算法与数据（~ 2 天）
- A1：geo-store.js schema 迁移加 `industry` 字段 + 13 品牌批量打 banking
- A2：geo-scoring.js 新增 `calculateTop1Rate` + `calculateCitationShare` + `calculateIndustryPercentile`
- A3：tracker-agent 在每轮采集完后触发三个新指标重算，写入 geo_scores
- A4：单元测试 + 集成测试覆盖三个新指标

### Phase B：前端 UI（~ 2 天）
- B1：geo-dashboard.js 新增"★ 首位推荐率"与"🔗 AI 引用占比"金卡 + 趋势线
- B2：geo-dashboard.js 新增"行业位置"tab + 视图（带状图 + 分指标对比）
- B3：CSS 适配（金卡配色、行业带状图样式、移动端）
- B4：版本号三处同步（`?v=0.33` → `?v=0.34`）

### Phase C：QA + 文档（~ 1 天）
- C1：端到端跑 3 个真实品牌（金卡 / 引用占比 / 行业分位数字正确）
- C2：手机 WPS 预览 PPT v0.34 版（如果有版本对外）
- C3：geo-dashboard.html tooltip 文案补全 + 帮助文档更新

### 总计：~ 5 天

---

## 七、风险与依赖

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 商业意图关键词规则覆盖不全 | 首位推荐率漏算 | 多语言关键词 + inferIntentAndTags 兜底 + 抽样验证 ≥ 80% 一致 |
| citation 抽取覆盖低 | AI 引用占比分母不准 | v0.33 已验证基础覆盖；新指标做 fallback：coverage < 30% 时显示"数据稀疏" |
| 行业样本不足 | 分位无意义 | 硬阈值 < 8 不显示分位；冷启动期 banking 优先 |
| brand.aliases 子串压扁逻辑可能漏判 | mention / citation 漏算 | 复用 v0.30 已有逻辑 + 单元测试 |
| 前端大改 + 涉及 13 银行品牌存量数据 | schema 迁移风险 | 先备份 data/acms.db，迁移后回归测试 |
| v0.31 旧品牌无 industry 字段 | 行业基准不全 | 一次性迁移脚本：13 银行 brands → banking 类目 |

---

## 九、非目标（本期明确不做，避免 scope creep）
- 描述准确率（LLM-as-judge）—— P1
- 平台覆盖度独立视图 —— P1
- 商业意图 query 子集的"top3 / top5"扩展 —— P1
- AI 营销味风险预警 —— P2
- 算法波动主动告警 —— P2
- 商业层归因（UTM/CRM 建议）—— P2
- 行业动态预测 —— 不在 GEO 工具边界内
- 跨行业对比 —— 不做（容易让客户误读分位）

---

## 十、成功标准

1. 客户首屏能看到三个新指标，理解"我在商业意图 AI 推荐里排多少" / "AI 真的在引用我吗" / "我在同行里什么位置"
2. 对外讲 GEO 时，ACMS 能拿这三个指标讲一个完整故事
3. 13 银行品牌库首批体验分位数字正确、稳定
5. 文档齐全（帮助文档 tooltip + 内部 SOP）