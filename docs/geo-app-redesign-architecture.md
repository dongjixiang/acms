# ACMS GEO 应用整体架构重设计 v2.0（草案）

> 日期：2026-09-05
> 背景：多多要求参考 C:\Users\swede\geo-outreach（对外叙事）+ ansvisor / elmo / oneglanse / GEOVisibilityTool 四开源项目，重新设计 ACMS GEO 应用整体架构。
> 现状基线：2026-09-05 实测代码 — 后端 33 geo-* 服务（8500 行）+ routes/geo.js 90+ 端点；前端 geo-dashboard.js 4797 行 + html 686 + css 2328；SQLite 7 表；9 引擎（+ 国内 7 家待接）；11 个平铺 tab。

---

## 0. 一句话定位

**ACMS GEO 从「AI 可见性测量工具」升级为「AI 可见性运营平台」**——覆盖 geo-outreach 对外叙事里的完整飞轮：**测（AI 怎么说你）→ 诊（为什么）→ 治（怎么改：内容/技术/权威）→ 验（改了有没有用）**，并落到「机会 → 行动 → 复测」的可执行闭环。

参考项目的角色：
- **ansvisor** = 全功能商业平台形态 → 北极星架构（话题聚合 / 日聚合 / Content Brief / 行动闭环）
- **elmo** = Princeton 学术事实标准 → 测量严谨性（prompt 工程 / 分平台评分）
- **oneglanse** = 真浏览器采集 + Sources 价值页 → 信源保真度 + 域名级洞察
- **GEOVisibilityTool** = 测量到投放策略 → 策略层（channels 已借鉴落地）+ 紧急信号隔离 + 跨品牌 KB
- **geo-outreach** = 对外叙事 → L1-L4 漏斗决定 UI 分层与指标组织

---

## 1. 总览：五层架构 + 运营飞轮

```
┌─────────────────────────────────────────────────────────────┐
│ UI 层 — 按工作流组织的导航（不是 11 tab 平铺）                │
│   总览(分行业) │ 测量工作台 │ 洞察分析 │ 机会与行动 │ 报告 │ 设置 │
└─────────────────────────────────────────────────────────────┘
                            ↓ REST API（routes/geo.js 按域拆分）
┌─────────────────────────────────────────────────────────────┐
│ L4 策略行动层（"治疗" — 最大增长点）                         │
│   Opportunities → Content Brief → Channels 投放 → Schema/llms.txt  │
│   → Kanban 任务执行 → 复测验证闭环（audit/optimizer/task-executor）│
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ L3 评分洞察层（"诊断"）                                      │
│   评分引擎（分层 cite-ability + 首位推荐 + 引用占比 + 行业分位  │
│   + LLM-as-judge 准确率）→ 聚合（brand×topic×engine×周）       │
│   → 趋势 / 话题健康度 / 紧急信号 / 竞品对比                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ L2 解析归一层（"翻译"）                                      │
│   response 归一 / citation 归一（url 可空降级）/ sentiment    │
│   / mention / branded / judge —— 三派 schema 统一             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ L1 采集层（"听见"）                                          │
│   引擎适配器协议（capability: search/singleton）             │
│   API 派（openai/claude/perplexity/grok/doubao/qwen/kimi/zhipu）│
│   DOM 派（deepseek-web/google-web/copilot-web/yuanbao-web/…） │
│   调度：singleton 串行 + 其余并发 / cron + 手动 / 城市注入    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ L0 数据底座 — SQLite（schema 演进见 §4）                      │
└─────────────────────────────────────────────────────────────┘

        运营飞轮（UI 顶层叙事，对齐 geo-outreach L1-L4）：
   ┌──────┐   ┌──────┐   ┌───────┐   ┌──────┐   ┌───────┐
   │ 测    │ → │ 算    │ → │ 诊     │ → │ 治   │ → │ 验     │
   │ Track │   │ Score│   │ Diagnose│  │ Act  │   │Verify │
   └──────┘   └──────┘   └───────┘   └──────┘   └───────┘
      ↑                                                    │
      └────────── 复测（改了有没有用，闭环）────────────────┘
```

---

## 2. UI 信息架构（最大可见变化）

### 2.1 现状问题
11 tab 平铺：overview / brand / queries / track / scores / snapshots / watch / llms / settings / opportunities / channels
- queries / track / scores / snapshots 本质是**同一条测量流水线**的产物，却拆成 4 个平铺 tab，用户不知道先点谁
- 数据表视图（提问模板列表/评分表/快照表）是**工程视角**，不是业务视角
- 没有「一个品牌工作区」的概念——每次都要靠顶栏下拉选品牌
- 治疗层（opportunities/channels/schema/llms/audit）散落，没有「行动中心」

### 2.2 目标导航（业务工作流 6 区）

```
Header（全局限定）：行业下拉 → 品牌下拉（v0.44 已有）| 引擎健康 | 🔄
────────────────────────────────────────────────────
📊 总览        —— L1/L2 分层 KPI + 行业分组对比 + 紧急信号区 + 趋势
🔬 测量工作台   —— Prompt 资产（生成/批量/管理）→ 跑（引擎/城市）→ 结果流
💡 洞察分析     —— 评分仪表 / 引用分析 / Sources 页 / 竞品 Watch / 趋势对比
🛠 机会与行动   —— Opportunities → Content Brief → 投放 Channels → 任务看板
📄 报告         —— 周报 / 月报 / PDF / 推送 / 复测验证 delta
⚙️ 设置         —— 品牌 / 引擎白名单 / Provider 登录态 / 推送 / 语言
```

关键设计原则：
1. **测量工作台合并 queries+track+scores**：一条流水线三个视图切换（按 prompt / 按 engine / 按 topic），不再是四个并列 tab
2. **总览 L1-L2 分层**（对齐 geo-outreach）：L1 曝光（提及率/平台覆盖/稳定性）、L2 推荐信任（★首位推荐率/SoV/描述准确率/情感）——指标分组讲人话
3. **紧急信号独立红色区**（借鉴 GEOVisibilityTool）：负面描述 / 误识别 / 竞品突进 / 高价值零命中，放总览顶部
4. **每个 KPI 悬停 tooltip 说明**（多多硬性要求）
5. 行业+品牌选择器保留在 Header 常驻（v0.44 已拍板）

---

## 3. 分层设计细节

### L1 采集层 — 引擎适配器协议（已成形，需统一）

现有 9 引擎 + 待接 7 国内（4 API + 3 DOM）= 16 引擎。协议统一为：

```js
// engine adapter 标准形状
{
  id: 'doubao', name: '豆包',
  capability: {
    search: 'native',        // native | dom
    singleton: false,        // DOM 派必须 true（串行）
    note: '火山方舟 Web Search 插件',
    maxConcurrent: 5,
    timeoutMs: 120000,
    regionAware: false,      // 是否支持城市注入
  },
  async ask(prompt, opts) → { content, citations, raw }
}
```

调度规则（geo-tracker-agent 已有雏形，保持）：
- `capability.singleton === true` 的引擎串行，其余进并发池
- 任务级 `withTimeout` 兜底（坑 #35 已修）
- 引擎白名单分两级：settings 持久化 + tracker 本次临时 picker（v0.44 已做）

新增统一点：引擎能力位确认 SOP + DOM 选择器配置化（oneglanse 教训：选择器放 `selectors` 字段/yaml，UI 改版检测失败报警 + 回退 API 派）。

### L2 解析归一层 — 保持，扩展 citation 行级化

现状：geo-citation-extractor（217 行）+ citation-classifier + sentiment + accuracy-judge 已分家。
扩展：
- **Citation 行级存储**（新增 geo_citations 表）：现在 citations 埋在 responses JSON 里，无法做域名级聚合 → Sources 页需要行级（response_id, url, domain, title, engine, prompt_id, brand_id, cited_index, url_ok）
- Kimi / ima 等无 URL 场景：url=null 降级（已拍板），UI 显式「⚠ 仅标题」

### L3 评分洞察层 — 加「话题」聚合维度（借鉴 ansvisor，最大架构增量）

现状评分已厚（8+13 键 + judge + 行业分位），但**聚合维度只有 brand 和 week**，缺一个中间层：**Topic（话题簇）**。

- Prompt 增加 `topic_id`（一个 prompt 属于一个 topic；topic 属于 brand）
- 聚合分析单位从「逐条 prompt」升级为「话题」：
  - 话题健康度：该话题下所有 prompt 的 visibility 均值
  - 「哪个话题在丢分」→ 钻取到拖后腿的 1-2 条 prompt → 生成内容 brief（ansvisor 的完整工作流）
  - 内容规划按话题分配：brief 覆盖最弱话题优先
- Topic 来源：onboarding 自动生成（行业×意图骨架）+ 手动创建/合并 + AI 建议（带 topic 标签）

聚合数据分层（解决 N+1 + 支撑趋势图）：
- `geo_scores`（原始评分，已有）
- `geo_snapshots`（周聚合，已有，upsert）
- 新增 `geo_topic_snapshots`（话题×周聚合，轻量视图表）
- 趋势 delta 口径：本周窗口 vs 前一周（ansvisor 7-day delta 同思路）

### L4 策略行动层 — 「治疗」闭环（最大增长点）

现状已有雏形但**未串成闭环**：
- opportunities（342 行）— 内容 gap 推荐
- channels（349 行，v0.45 借鉴 GEOVisibilityTool）— 投放策略 7 节
- schema-suggest（211 行）+ llms-txt-generator（293 行）— 技术侧处方
- audit-agent（313 行）+ optimizer-agent（289 行）— 多 agent 诊断/优化
- task-executor + kanban-helper（85 行）— **诊断类任务**自动执行（geo-track/audit/report/optimize 四类已通）

**架构缺口（2026-09-05 评审补设计）**：task-executor 只覆盖"诊断类"（claim 后跑分析），**处方 → 可发布产物之间是断的**——"写一篇对比页/生成 llms.txt/产出知乎投放稿"这类落地动作没有执行器。用户旅程从 Step 6（拿处方）到 Step 7（复测）之间缺「自动执行」一站。

目标闭环（借鉴 ansvisor brief + GEOVisibilityTool 行动链 + ACMS 既有 Kanban 骨架）：

```
[洞察发现机会] → [生成 Content Brief（标题/大纲/关键词/竞品角度）]
      → [Channels 投放建议（渠道+ROI+形态）]
      → [处方自动执行（NEW）：5 条生产线 → 质检 → 人工发布门]
      → [复测：该 prompt/topic 的 delta 验证]（衔接既有复测）
```

**处方自动执行设计（Step 7 NEW，2026-09-05）**：

1. **执行类任务类型扩展**（在 GEO_TASK_TYPES 增加）：
   - `geo-content-write`：Content Brief → LLM 写作（标题/大纲/关键词/竞品角度全量注入）→ Markdown 成品 → workspace
   - `geo-llms-generate`：品牌档案 → 确定性模板生成 llms.txt 文件 + 部署说明
   - `geo-schema-generate`：官网识别 → JSON-LD 代码块（Organization/FAQPage/Article…）+ 放置说明
   - `geo-channel-adapt`：母稿 → 知乎/公众号/小红书多版本改写
2. **状态机扩展**：backlog → in_progress（eventBus task.claimed 自动认领）→ review（自动质检）→ done（产物就绪）→ **publish_gate（人工确认）** → published → 触发复测队列
3. **自动化边界（关键规则）**：内容起草/文件生成/多版本改写全自动；**对外发布必须人工确认**（系统不冒充品牌对外发声——合规 + 品牌责任）；LLM 产物过自动质检三查（关键词覆盖/结构模板/竞品角度），不过自动重写 1 次，仍不过转人工（不无限循环）
4. **产物可追溯**：每个产物保留版本与来源任务 ID——"这份内容为哪个机会生成"可回查

新增缺口：
1. **Content Brief 生成器**（opportunities 详情 → 结构化 brief：title/outline/keywords/competitor angles）——可作 optimizer-agent 的产出物模板
2. **复测验证视图**：机会 → 任务 → 执行后「验证 delta」——治没治好，数据说话
3. **ROI 定性公式落地**（GEOVisibilityTool：高=appearance≥5 且跨 LLM；中/低分级）——目前 channels 有雏形，公式化 + 前端 pill 展示
4. 紧急信号红色专区（误识别/负面/竞品突进）优先于普通建议展示

### UI 之外的横向能力（借鉴清单按优先级）

| 借鉴对象 | 能力 | ACMS 现状 | 优先级 |
|---|---|---|---|
| ansvisor | Topic 话题聚合层 | 缺（仅 tags） | **P0** |
| oneglanse | Sources 独立页（域名级引用榜） | 缺（citation 未行级化） | **P0** |
| GEOVisibilityTool | 紧急信号隔离红色专区 | 缺（混排） | **P0** |
| ansvisor | Content Brief 生成 | 缺（有 optimizer 建议雏形） | P1 |
| GEOVisibilityTool | 跨品牌知识库/行业基准 | 缺 | P1 |
| ansvisor | 日聚合 rollup + delta 对比 | 部分（周快照） | P1 |
| GEOVisibilityTool | ROI 定性公式 + pill 展示 | channels 雏形 | P1 |
| elmo | query-fan-out（AI 生成子查询） | 部分（keyword-expander） | P2 |
| oneglanse | Provider 登录态管理页 | 缺 | P2 |
| ansvisor | traffic（L3 AI 导流 + GA/GSC） | 缺（需外部数据对接） | P2 |
| elmo/oneglanse | Schedule 可视化 cron 配置 | 部分（cron/status） | P2 |

---

## 4. 数据模型演进（SQLite 7 表 → ~11 表）

| 表 | 演进 | 说明 |
|---|---|---|
| geo_brands | 保持 | 已含 aliases/industry/location |
| geo_queries | **+ topic_id** | prompt 归属话题 |
| geo_topics | **新增** | (brand_id, name, sort) — 话题簇 |
| geo_responses | 保持 | raw answer |
| geo_citations | **新增** | citation 行级（Sources 页数据源） |
| geo_scores | 保持 | 原始评分历史 |
| geo_snapshots | 保持 | 周聚合（upsert） |
| geo_topic_snapshots | **新增** | 话题×周聚合视图 |
| geo_watch | 保持 | 竞品对比 |
| geo_opportunities | 保持 | + state（open/doing/done/verify） |
| geo_content_briefs | **新增** | brief 产出（供 kanban 任务引用） |

迁移策略：**全部增量，不破坏现有 7 表**。queries.topic_id 可空（老数据 null = "未分组"话题），UI 提供「一键按意图聚类到话题」的迁移工具。

---

## 5. 后端组织演进（物理目录，分阶段，不一步到位）

现状：server/services/geo-*.js 33 个平铺文件（命名已按域前缀，物理未分组）。
目标域目录（**新增模块按域落位；存量模块迁移放 Phase 3 之后**，避免大规模移动破坏引用）：

```
server/services/geo/
  core/       prompt-llm / query-templates / tracker-agent / config
  engines/    16 适配器（保持现状 flat 亦可）
  ingest/     citation-extractor / citation-classifier / sentiment / match
  score/      scoring / ranking / accuracy-judge
  insight/    聚合 / topic / trend（新）
  strategy/   opportunities / channels / content-brief（新）/ competitor-suggest
  agents/     audit-agent / optimizer-agent / task-executor / kanban-helper
  report/     weekly / monthly / pdf / push
  store/      geo-store（保持单点）
```

routes/geo.js（1200+ 行）→ 按域拆 4-5 个 router 文件（routes/geo/measure.js / insight.js / strategy.js / report.js），**auth 白名单一并迁移**。

---

## 6. 里程碑（每轮 30-60 分钟节奏，可独立交付）

### Phase 0 — UI 信息架构重构（纯前端，收益最大，先做）
- 导航从 11 tab 平铺 → 6 区工作流（可先保留全部旧 pane，只改导航分组与默认视图）
- 总览 L1/L2 分层 KPI 卡 + 紧急信号红色区雏形
- 每 KPI 悬停 tooltip
- 验收：多多点一圈，找不到功能算失败

### Phase 1 — 话题层 + Sources 页（数据架构升级）
- geo_topics + queries.topic_id + topic 快照聚合
- geo_citations 行级化 + 存量数据回填
- Sources 独立页（域名 + favicon + 引用次数 + 涉及 prompt，抄 oneglanse）
- 测量工作台按 topic 视图切换

### Phase 2 — 行动闭环（治疗层串起来）
- Content Brief 生成器（opportunities → brief → kanban）
- 复测验证 delta 视图
- Channels ROI 公式 + pill + 紧急信号专区正式版
- 跨品牌行业基准 KB（kb.sqlite 或 geo_store 加表）

### Phase 3 — 横向补强 + 物理重构
- Provider 登录态管理页（oneglanse 形态）
- query-fan-out / traffic 对接（P2 项按需）
- 后端域目录迁移 + routes 拆分（不影响 API 契约）

---

## 7. 关键决策点（需多多拍板）

1. **Topic 话题层是否上**：这是 ansvisor 的核心抽象，也是从「逐条看 prompt」到「看主题赢输」的关键一跃——但增加一层数据建模 + UI。建议上（P0）。
2. **Sources 页是否值得做**：citation 行级化是一次数据迁移；但 Sources 是 oneglanse/ansvisor 两家都有的「商业价值页」——客户能直接看到「AI 引用我的内容来自哪些域名」。建议上。
3. **UI 重构激进程度**：A) 只改导航分组（安全，保留旧 pane 结构）；B) 按工作流重写 pane 内布局（彻底但工作量大）。建议先 A 后 B 渐进。
4. **L3/L4（AI 导流、商业转化）是否接入**：geo-outreach 叙事有 L3/L4，但需客户侧 GA/CRM 数据——作为产品功能先留接口位，不做默认闭环（本地工具无客户网站数据）。

---

## 8. 关联资产

- 对外叙事：C:\Users\swede\geo-outreach\GEO核心介绍-完整版.md（L1-L4 漏斗 / 三本账 / 铺量vs资产）
- 竞品剖析：acms-geo-app skill references/geo-competitor-comparison-pattern.md（GEOVisibilityTool 六模块）
- 架构对比：references/oneglanse-vs-acms-architecture-comparison.md（v0.46+ 5 块增量）
- 采集生态：references/source-collection-open-source-landscape.md（三派路线）
- ansvisor 源码：C:\Users\swede\downloads 或 /tmp/ansvisor（本会话拉取，含 supabase 77 个 migration / visibility-scoring 概念）
- elmo 源码：C:\Users\swede\elmo（apps/web routes 结构见 §2 参考）
