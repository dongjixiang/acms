# ACMS 邮件模块 — 开源生态集成评估与决策矩阵

> 编写时间：2026-08-30
> 适用对象：多多（PM 决策参考）
> 评估人：Hermes
> 关联：prototype-email-rules*.html、Inbox-Zero 模式、ACMS 现有模块

---

## 一、评估背景

ACMS 邮件应用已完成基于 Inbox-Zero 模式的本地化借鉴（6 个核心模块）。本次评估回答两个问题：

1. **Inbox-Zero 能否直接拿来？** → 否（已分析，见会话记录）
2. **开源邮件生态中，哪些适合 ACMS 集成？** → 见下方决策矩阵

## 二、设计原则（不可妥协）

| 原则 | 来源 |
|---|---|
| 本地优先 / 自建 / SSH/CLI | 你的明确要求 |
| 不增加独立浮窗 / 不引入外部 SaaS | 你多次重申 |
| auto_reply 必须用户确认（P151 模式） | 防「toast 骗人」 |
| 解析/保存/删除必须显式确认（P163 防御） | 防 silent write |
| 测试用 mock 数据（P164 SOP） | 不实踩真实模型 |
| UI 严格一致（参考记忆：参考原型不缩水）| 三栏布局 + 设置界面分页签 |
| 指标/按钮必须带悬停说明 | UI 要求 |

## 三、Inbox-Zero 集成评估（结论：不可直接拿来）

| 维度 | Inbox-Zero | ACMS | 冲突 |
|---|---|---|---|
| 架构 | Next.js SaaS webapp | 本地 Node.js + SQLite | ❌ |
| 邮件协议 | Gmail/Graph OAuth | IMAP/SMTP | ❌ |
| 用户认证 | NextAuth | 不需要 | ❌ |
| UI 形态 | 独立 webapp | 三栏内嵌 | ❌ |
| auto_reply | 默认自动 | 必须确认 | ❌ |
| 借鉴完成度 | 80%（6/8 核心模块） | 完整本地化 | ✓ |

**结论**：Inbox-Zero 适合「按模式借鉴」，不适合「直接拿来」。

## 四、开源邮件生态调研总览

### A. 桌面邮件客户端（不可集成）
- Thunderbird、Mailspring、Betterbird、Trojita、Claws Mail
- **共同点**：独立桌面应用，技术栈不可嵌入 Node.js；只能借鉴 UI 模式

### B. Node.js 邮件协议库（**可集成**）
| 库 | 能力 | ACMS 当前 | 集成价值 | 难度 | 风险 |
|---|---|---|---|---|---|
| **mailparser** | MIME 解析（HTML/text/附件/headers/encoding） | 自研 100+ 行解码 | ⭐⭐⭐⭐ | 低 | 低 |
| **mail-listener** | IMAP IDLE 实时监听（事件驱动） | 无（轮询/手动） | ⭐⭐⭐⭐⭐ | 低 | 低 |
| **nodemailer** | SMTP 发送（DKIM/附件/TLS） | 自研 SMTP | ⭐⭐⭐⭐ | 低 | 低 |
| **imapflow** | 现代 IMAP 客户端 | node-imap（够用）| ⭐⭐ | 中 | 中 |
| **JMAP client** | JMAP 协议客户端 | 无 | ⭐⭐ | 高 | 中 |

### C. 邮件服务器（不集成）
- Dovecot、Postfix、Stalwart、Mailcow、iRedMail、Mailu、Wildduck
- ACMS 是客户端，不需要服务器

### D. AI 邮件管理（已分析）
- Inbox-Zero ✗ / Mailmeteor ✗ / SaneBox ✗ — 都是 SaaS，不适合本地

### E. 邮件归档/搜索（轻量集成）
| 方案 | 价值 | 难度 | 风险 |
|---|---|---|---|
| **SQLite FTS5** | ⭐⭐⭐ | 低 | 低（ACMS 已在用 SQLite） |
| notmuch-js | ⭐⭐⭐ | 中 | 中（需装 notmuch 二进制）|

## 五、集成决策矩阵（按 ROI 排序）

### 🥇 Tier 1：立即推进（高 ROI、低风险、无冲突）

#### A. mail-listener（实时 IMAP 监听）
- **价值**：⭐⭐⭐⭐⭐ — 实现真正「新邮件到达 → 规则引擎自动匹配 → 执行动作」的实时链路
- **现状**：规则引擎当前只能「手动触发」或「轮询」
- **工作量**：3-5 天
- **风险**：低（成熟库，GitHub 1k+ stars）
- **依赖**：无（需先 npm install）
- **对齐**：阶段2 核心需求（多多原本目标）

#### B. mailparser（标准化 MIME 解析）
- **价值**：⭐⭐⭐⭐ — 替代 imap-service.js 自研 100+ 行解析代码
- **现状**：imap-service.js 自研 RFC2047 / base64 / quoted-printable / charset 解码
- **工作量**：2-3 天
- **风险**：低（纯解析库）
- **收益**：减少代码量、提高稳定性、支持更多边界 case

#### C. nodemailer（标准化 SMTP 发送）
- **价值**：⭐⭐⭐⭐ — 替代 email-sender.js 自研 SMTP 实现
- **现状**：email-sender.js 自研 SMTP
- **工作量**：2-3 天
- **风险**：低（Node.js 邮件领域事实标准）
- **收益**：支持 DKIM、签名、OAuth2 备选（保持用户名密码为主）

### 🥈 Tier 2：评估后推进（中 ROI、需规划）

#### D. SQLite FTS5（邮件全文搜索）
- **价值**：⭐⭐⭐ — 大邮箱（1万+ 封）搜索体验显著提升
- **现状**：runSearch 只搜主题 + 地址 + 正文片段
- **工作量**：2 天
- **风险**：低（SQLite 内置）
- **依赖**：现有 SQLite 数据库

### 🥉 Tier 3：本地化实现 Inbox-Zero 风格功能（无新依赖）

#### E. 一键退订
- **价值**：⭐⭐⭐⭐⭐ — Inbox-Zero 核心特性，邮件营销场景刚需
- **实现**：解析 List-Unsubscribe header（RFC8058），发送 SMTP 退订
- **复用**：email-classifier.js（识别 newsletter）+ email-rule-engine.js（添加 unsubscribe 动作）
- **工作量**：1 周
- **风险**：低（纯本地实现）

#### F. 冷邮件检测
- **价值**：⭐⭐⭐⭐ — 自动归档冷邮件
- **实现**：email-classifier.js 增加"冷邮件"细分类别（特征：陌生发件人 + 公司域名 + 无历史交互）
- **复用**：现有分类器
- **工作量**：3 天
- **风险**：低

#### G. 回复追踪（thread 状态）
- **价值**：⭐⭐⭐⭐ — 标记"需回复"/"已回复"
- **实现**：新增 `email_threads` collection（threadId + status）
- **复用**：现有邮件详情面板
- **工作量**：1 周
- **风险**：低

### ❌ 不推荐（违反设计原则或 ROI 极低）

| 项目 | 不推荐理由 |
|---|---|
| Inbox-Zero SaaS 部署 | 违反本地原则（已分析） |
| Thunderbird/Mailspring 集成 | 技术栈不兼容 |
| JMAP 协议 | 服务端支持少，ACMS 用户无 JMAP 需求 |
| Dovecot/Postfix 集成 | ACMS 是客户端 |
| Slack/Linear 集成 | 违反「不引入外部服务」 |
| ClamAV / SpamAssassin | 增加外部服务依赖，ROI 低 |
| 多用户/SaaS 化 | 违反单用户本地原则 |

## 六、推荐推进顺序（基于多多「逐项验证+务实」风格）

### 第 1 周：稳基（Tier 1 + 验证）
- **Day 1-3**：集成 mail-listener（实现 IMAP IDLE 实时监听）
- **Day 4-5**：集成 mailparser（替换自研解析）
- **Day 6-7**：单元测试 + 端到端验证（mock 邮件 → 规则引擎 → 规则执行 → 日志）

### 第 2-3 周：增强（Tier 3）
- **Week 2**：一键退订（RFC8058 解析 + SMTP 退订 + 规则引擎动作）
- **Week 3**：冷邮件检测（email-classifier 扩展）+ 回复追踪（thread collection）

### 第 4 周：优化（Tier 2）
- SQLite FTS5 全文搜索（大邮箱场景）

## 七、不集成的明确边界

**不集成**：
- OAuth-only 工具（与 ACMS IMAP 用户名密码模式冲突）
- 完整邮件服务器（Dovecot/Postfix — ACMS 是客户端）
- SaaS 多用户系统（违反单用户原则）
- 引入向量数据库（Pinecone/Weaviate）的 RAG（暂缓，先用 email-tone-sampler）

## 八、决策建议

**短期（立即）**：集成 mail-listener + mailparser + nodemailer（Tier 1，1 周工作量，ROI 高）
**中期**：本地实现 Inbox-Zero 风格功能（Tier 3，一键退订 + 冷邮件 + 回复追踪）
**长期**：评估 JMAP（仅当用户有 JMAP 服务器时）+ SQLite FTS5

**不推荐**：Inbox-Zero SaaS、Thunderbird/Mailspring 集成、OAuth 工具、外部邮件服务器。

---

## 九、参考信息

- **会话记录**：2026-08-30 Inbox-Zero 借鉴对话、2026-08-30 邮件 UI 重构
- **原型文件**：`prototype-email-rules.html`、`prototype-email-rules-complete.html`
- **现有模块**：`server/services/email-*.js`（classifier、drafter、sender-analyzer、category-store、tone-sampler、rule-parser、rule-engine）
- **设计原则来源**：多多记忆（参考 session_search）