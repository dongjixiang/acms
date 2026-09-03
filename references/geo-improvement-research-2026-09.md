# ACMS GEO 改进调研报告

> 2026-09-02 · 调研网上最新 GEO 论文 + 开源软件现状 + elmo 源码分析 → ACMS GEO v0.33+ 改进方向

---

## 一、学术前沿（论文趋势）

**当前状态：尚无 arXiv 正式收录的 GEO/AEO 论文。** 这是一个蓝海期——谁先做标准谁就有话语权。

### 关键预印本/会议论文（从 GitHub awesome-GEO 收集）

1. **[ICLR'26] AutoGEO** (⭐208) — 自动学习生成引擎偏好 + 改写内容提升曝光
   - 方法：用 RL 微调 LLM 学习"什么样的网页内容更容易被 AI 引用"
   - ACMS 可借鉴：内容改写建议模块（不只是"测"，还能"改"）

2. **C-SEO (NeurIPS 2024 workshop)** — 竞争搜索引擎优化理论框架
   - 核心：AI 回答中的 citation 是稀缺资源，品牌间存在零和竞争
   - ACMS 可借鉴：SoV 计算的理论基础强化

3. **LLM-as-Judge 评估框架** — 多篇论文探讨如何用 LLM 评估 GEO 效果
   - ACMS 已部分实现（geo-sentiment.js），但还不够系统

---

## 二、开源生态全景（2026-09）

| 项目 | Stars | 语言 | 定位 | 与 ACMS 差距 |
|------|-------|------|------|-------------|
| **elmohq/elmo** | 287 | TS | 开源 GEO 平台标杆 | 对标对象，ACMS 已深度借鉴 |
| **Auriti-Labs/geo-optimizer-skill** | 756 | Python | CLI+MCP 工具集 | ACMS 缺 MCP 集成 |
| **danishashko/geo-aeo-tracker** | 247 | TS | 本地优先 dashboard | UI 设计可借鉴 |
| **ansvisor/ansvisor** | 104 | TS | AI Search Intelligence | 活跃度高(479 commits)，Looker 集成 |
| **cxcscmu/AutoGEO** | 208 | Python | 自动优化框架 | 学术性强，ACMS 偏工具轻框架 |
| **ai-search-guru/getcito** | 180 | TS | 首个开源 AIO 工具 | 功能较全 |
| **amplifying-ai/awesome-generative-engine-optimization** | 495 | - | 资源合集 | 必读参考文献 |

### 竞品功能对比矩阵

| 功能 | elmo | ACMS | ansvisor | geo-aeo-tracker |
|------|------|------|----------|-----------------|
| 多引擎追踪 | ✅ 8+ | ✅ 11 | ✅ 8+ | ⚠️ 6 |
| SoV 计算 | ✅ | ✅ | ✅ | ⚠️ |
| 情感分析 | ❌ → roadmap | ✅ v0.19 | ❌ | ❌ |
| 行业排名 | ❌ | ✅ v0.23 | ❌ | ❌ |
| llms.txt 生成 | ❌ | ✅ v0.16 | ❌ | ❌ |
| 关键词扩展 | ❌ | ✅ v0.20 | ❌ | ❌ |
| 竞品推荐 | ❌ | ✅ v0.22 | ✅ | ❌ |
| Opportunities 智能推荐 | ✅ v0.3 | ❌ | ✅ | ❌ |
| Citation 分类 | ✅ | ✅ (移植) | ✅ | ❌ |
| MCP 支持 | ❌ | ❌ | ❌ | ✅ |
| Looker/BQ 集成 | ❌ | ❌ | ✅ | ❌ |
| 情绪追踪 | ✅ → roadmap | ✅ | ❌ | ❌ |
| 内容模拟器 | ✅ → roadmap | ❌ | ❌ | ❌ |
| 品牌别名系统 | ✅ | ✅ v0.30 | ❌ | ❌ |
| 四类意图覆盖 | ✅ | ✅ v0.31 | ❌ | ❌ |

---

## 三、elmo v0.3.0 最新动向（2026-08-31 发布）

### 新增/规划功能
1. **Elmo Cloud** — 托管版（ACMS 可参考 SaaS 模式）
2. **Citation sentiment tracking** — 情感分析（ACMS 已有 v0.19 规则版）
3. **Content simulator** — 内容模拟器（预测新页面发布对 citation 的影响）
4. **ChatGPT ads tracking** — 赞助位追踪（随着 ChatGPT 广告上线）

### 技术架构亮点
- **Provider 抽象层**：scraped vs API 双通道，新引擎只需实现接口
- **pg-boss 异步队列**：失败退避调度（ACMS 用 tracker-agent 简单 Promise）
- **结构化 LLM 输出**：Zod schema 强类型（ACMS 用原生 JSON）
- **Entitlement 计费**：按订阅层级限制跑量（ACMS 无此概念）

### 已知 Bug（GitHub Issues）
- #681: MCP server v2 transport 迁移（ACMS 应同步关注 MCP）
- #680: 竞品配额并发超限（ACMS tracker 需注意）
- #678: Opportunities 生成重复（ACMS 若实现需防重）

---

## 四、ACMS GEO 优势 vs 劣势

### 优势（已有）
- ✅ **11 引擎覆盖**（elmo 8 个，ACMS 多了 deepseek/openai/minimax/grok 等）
- ✅ **情感分析**（rule-based v0.19，竞品均未实现）
- ✅ **行业排名/指数**（v0.23，独创功能）
- ✅ **llms.txt 生成**（v0.16，面向 AI 爬虫优化）
- ✅ **关键词扩展工作台**（v0.20，4 行业画像×8 维度）
- ✅ **竞品自动推荐**（v0.22，LLM+回答提取双路径）
- ✅ **四类意图覆盖**（v0.31，informational/comparative/implementation/troubleshooting）
- ✅ **别名系统**（v0.30，brand.aliases + getMatchTerms）
- ✅ **singleton 引擎分组**（v0.32，解决浏览器自动化超时）

### 劣势（待改进）
- ❌ **Opportunities 智能推荐**（elmo 有，ACMS 无）
- ❌ **Citation 难度标签**（wide-open/contested/locked-in，ACMS 无）
- ❌ **Content Gap 可视化**（elmo 有 findContentGaps，ACMS 只有数据）
- ❌ **MCP 集成**（竞品都在做，ACMS 缺失）
- ❌ **Looker/BQ 数据导出**（ansvisor 有）
- ❌ **Email 告警**（竞品都有，ACMS 无）
- ❌ **多语言支持**（ACMS 纯中文，elmo/ansvisor 多语言）
- ❌ **结构化 LLM 输出**（ACMS 用原生 JSON，elmo 用 Zod）

---

## 五、ACMS GEO v0.33+ 改进建议（P0-P2 分级）

### P0 — 必做（高价值，中等工作量）

#### 5.1 引入 Opportunities 智能推荐模块
借鉴 elmo `apps/web/src/server/opportunities.ts`：
- **Digest 构建**：聚合 30d + 7d 数据，按 prompt 排竞品差距
- **单次 LLM 调用**：不查 web，只处理确定性 digest
- **四分类输出**：creation / existing-content / outreach / social
- **难度标签**：citation volatility → wide-open/contested/locked-in
- **持久化**：brand_opportunities 表，append-only，旧报告保留

```javascript
// 伪代码
const digest = buildDigest(brand, { lookbackDays: 30 });
const opportunities = await callLLM({
  system: OPPORTUNITIES_SYSTEM_PROMPT,
  input: digest,
  schema: opportunitiesSchema, // Zod
});
await persistOpportunities(brandId, opportunities);
```

#### 5.2 Citation 难度标签（Volatility）
借鉴 elmo `visibility-stats.ts` 的 `computeVolatility()`：
- 计算每个 prompt 的 cited domains 轮换率
- 轮换率高 = wide-open（容易突破）
- 轮换率低 = locked-in（ entrenched，难突破）
- UI 展示：在 prompt 列表加难度徽章

#### 5.3 Content Gap 可视化
借鉴 elmo `report-metrics.ts` 的 `findContentGaps()`：
- 找"竞品被提及但品牌未被提及"的 prompts
- 前端展示：红色高亮 + 一键跳转追问

### P1 — 推荐做（中价值，低工作量）

#### 5.4 MCP Server 集成
参考 Auriti-Labs/geo-optimizer-skill：
- 暴露 ACMS GEO 数据给 Claude Code / Codex / OpenCode
- 命令：`geo track`, `geo report`, `geo opportunities`
- 技术栈：FastMCP + Express HTTP

#### 5.5 Email/Inbox 告警
- 综合分下降 >10% → 邮件告警
- 竞品超越 → 邮件告警
- 周报自动发送（已有 PDF，加 mailgun/ resend 集成）

#### 5.6 结构化 LLM 输出升级
- 现有 `geo-prompt-llm.js` 用原生 JSON
- 升级为 Zod schema 验证（防 LLM 幻觉）
- 影响：prompt 生成、opportunities、intent 推断

### P2 — 可选做（低价值/高工作量）

#### 5.7 Content Simulator
- 预测"如果发布新页面，citation 会如何变化"
- 技术：few-shot LLM 模拟 + 历史数据训练
- 工作量：大，建议 v0.35+

#### 5.8 多语言支持
- 界面 i18n（en/zh）
- Prompt 模板多语言
- 工作量：中，需 UI 改造

#### 5.9 Looker Studio / BigQuery 集成
- 参考 ansvisor `integrations/looker-studio`
- 适合企业客户数据对接需求
- 工作量：大，优先级低

---

## 六、技术债务清理建议

### 6.1 统一错误处理模式
- ACMS GEO 多处 `if (!score.ok) return { ok:false, error, message }`
- 建议抽 `GeoError` class + 统一错误码表

### 6.2 Require Cache 陷阱
- 所有 `server/services/*.js` 改动必须重启 3300
- 建议在 `geo-config.js` 加 `RESTART_REQUIRED` flag + UI 提示

### 6.3 前端版本号管理
- `geo-dashboard.js?v=0.32` 等散落在多处
- 建议抽 `GEO_VERSION` 常量统一引用

---

## 七、竞品对标学习清单

### 必读文件（本地已有）
```
C:/Users/swede/elmo/packages/lib/src/
  - onboarding/analyze.ts       # prompt 生成哲学
  - report-metrics.ts           # SoV 算法
  - text-extraction.ts          # 统一引用解析
  - visibility-stats.ts         # volatility 计算

C:/Users/swede/elmo/apps/web/src/server/
  - opportunities.ts            # 智能推荐（核心）
```

### 必读 GitHub 仓库
```
https://github.com/amplifying-ai/awesome-generative-engine-optimization  # 资源合集
https://github.com/ansvisor/ansvisor                        # 活跃度高
https://github.com/Auriti-Labs/geo-optimizer-skill          # MCP 模式
```

---

## 八、总结

ACMS GEO 当前状态：**引擎覆盖领先，算法功能齐全，缺智能推荐层**。

核心建议：
1. **先做 Opportunities**（P0）— 这是 elmo v0.3 的核心竞争力，ACMS 补齐后持平
2. **再做 Citation 难度标签**（P0）— 差异化功能，竞品未有
3. **最后看 MCP**（P1）— 生态趋势，但 ACMS 用户可能不需要

时间估算：
- P0 三项：约 3-5 天（含测试）
- P1 三项：约 2-3 天
- P2 三项：约 5-7 天（可延后）

---

*调研完成时间：2026-09-02 22:30 CST*
*数据来源：GitHub API + elmo 源码 + arXiv 搜索 + 竞品网站*
