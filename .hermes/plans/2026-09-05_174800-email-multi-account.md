# ACMS 邮件多账户体系实施计划

## 目标

实现邮件应用的多账户 + 多身份 (Profile) 体系，解决"不同账户是不同人在用"的根本问题。
- Profile = 身份（人），1:N 绑 Account（邮箱凭证）
- 4-6 位 PIN 验证 + 30 分钟自动锁屏
- 邮件数据（草稿/分类/规则/AI 偏好/tone）按 Profile 完全隔离
- 沿用 ACMS 整体风格（teal #4ecdc4 主色）

## 实物 prototype

`client/_diag/prototype-email-multi-account.html` (37KB, v0.2 风格对齐 ACMS)
- 4 个 demo profile（大多多/老婆/销售A/销售B，PIN: 1234/5678/1111/2222）
- 三屏流程：身份选择 → PIN 验证 → 邮件应用（含账户抽屉切换器）
- dark/light/cream 三主题验证风格一致性

## 拍板决策（2026-09-05）

- Q1: 三场景并存（家庭 + 公司多销售 + 自己多角色）
- Q2: 4-6 位 PIN + 30 分钟自动锁屏
- Q3: 邮件按 Profile 完全隔离（其他模块后续）
- Q4: 1 Profile : N Account
- 风格：与 ACMS 一致（teal #4ecdc4）

## 分阶段实施

### Phase v2.0 — 后端基础 + 数据迁移（本次实施）

**新建 service 文件（5 个）**
- `server/services/email-credential-cipher.js` — IMAP/SMTP 密码 AES-256-GCM 加密（密钥从 config 派生）
- `server/services/email-pin-service.js` — PIN bcrypt 哈希 + verify（cost=10）
- `server/services/email-profile-store.js` — Profile CRUD（按 id 索引）
- `server/services/email-account-store.js` — Account CRUD（按 profile_id + email 索引，凭证 cipher 后存）
- `server/services/email-transport-pool.js` — nodemailer transporter 按 accountId 缓存（lazy init + reconnect）

**DB schema 扩展**
- `server/db/connection.js` KNOWN_COLLECTIONS 新增：`email_profiles`, `email_accounts`
- 现有 7 个 collection 加 `profile_id` 字段（迁移时填默认 profile_id='default'）
- email_accounts 加索引 `idx_email_accounts_profile_id`

**新建 route 文件（2 个）**
- `server/routes/email-profiles.js`
  - `GET /api/email-profiles` — 列所有 profile（不带 PIN hash）
  - `POST /api/email-profiles` — 新建（含 PIN 哈希）
  - `PATCH /api/email-profiles/:id` — 改名/改头像/改颜色/改类型/改 PIN
  - `DELETE /api/email-profiles/:id` — 删除（级联删 account + 数据）
  - `POST /api/email-profiles/:id/verify-pin` — 验证 PIN（返回一次性 token）
- `server/routes/email-accounts.js`
  - `GET /api/email-accounts?profile_id=X` — 列某 profile 的账户
  - `POST /api/email-accounts` — 新建（凭证 cipher 后存）
  - `PATCH /api/email-accounts/:id` — 改名/改颜色/改凭证
  - `DELETE /api/email-accounts/:id` — 删除
  - `POST /api/email-accounts/:id/test` — 测试 IMAP + SMTP 连接

**重构现有文件**
- `server/services/email-sender.js`
  - `sendEmail(options, { accountId })` — 优先从 pool 取 transporter
  - 保留 `sendEmail(options, { smtp, ... })` 兼容旧调用（降级到 config.smtp）
- `server/services/imap-service.js`
  - `activeListeners: Map<accountKey, Map<mailbox, listener>>` 替代 `Map<mailbox, listener>`
  - `startListening({ accountKey, user, password, host, port, tls, mailbox, ... })`
  - 新增 `createImapServiceForAccount({ accountId, profileId, ... })` 工厂
- `server/services/email-imap-rule-integration.js` — 接受 `accountId` 参数

**新建迁移脚本**
- `server/scripts/migrate-email-to-multi-account.js`
  - 读 config.smtp（如果存在）
  - 创建 default profile + default account（凭证从 config.smtp 导入）
  - 把 7 个 collection 所有 doc 加 `profile_id='default'`（如果没有字段）
  - 把 config.smtp 标记 deprecated（不删除，向后兼容）

**app.js 挂载**
- `app.use('/api/email-profiles', require('./routes/email-profiles'))`
- `app.use('/api/email-accounts', require('./routes/email-accounts'))`

**验证步骤（v2.0 完成后）**
1. `node --check` 所有新文件
2. 重启 ACMS
3. `curl -X POST /api/email-profiles -H "x-api-key: $KEY" -d '{name, avatar, type, pin}'` 创建 profile
4. `curl -X POST /api/email-profiles/:id/verify-pin -d '{pin}'` 验证 PIN → 拿 token
5. `curl -X POST /api/email-accounts -d '{profile_id, email, imap_*, smtp_*}'` 创建 account
6. `curl -X POST /api/email-accounts/:id/test` 测试连接
7. `curl /api/email-accounts?profile_id=X` 列账户
8. 跑现有邮件发送流程（`POST /api/emails/send` 带 `accountId` 参数）

### Phase v2.1 — 前端入口流（待 v2.0 测试通过后实施）

- `client/js/views/email-inbox.js` 入口改造：
  - 启动时显示身份选择屏（替换直接进应用）
  - PIN 弹窗逻辑
  - 锁定状态管理（localStorage 存 `email_session_locked=true`）
  - 顶栏 lock timer + 立即锁定按钮
  - 抽屉式账户切换器（左栏顶部）
- `client/css/email-inbox.css` 新增 PIN 弹窗 + 锁定 UI 样式
- `client/index.html` 引入新 view + 资源

### Phase v2.2 — 前端 profile/account 管理 UI（待 v2.1 后）

- 设置页 → "📋 身份管理" sub-tab
  - 列表 + 编辑 + 删除 + 新增
  - 改 PIN 用 ACMSModal 双输入确认
- 设置页 → "📧 账户管理" sub-tab
  - 按 profile 分组显示
  - 列表 + 编辑 + 删除 + 新增 + 测试连接

### Phase v2.3 — 数据隔离验证 + 边界场景（最后）

- 验证所有 7 个 collection 正确按 profile_id 过滤（grep + 端到端测试）
- 切换 profile → 清 state → 重 load
- 同一 profile 多账户并发（两个 IMAP listener 同时跑）
- 自动锁屏 30 分钟验证（prod 改 5 分钟测）
- 锁定后 API 调用是否要拒绝（设计：锁状态只影响 UI，不影响 API）

## 文件清单（v2.0 全部）

**新建（8 个）**
- server/services/email-credential-cipher.js
- server/services/email-pin-service.js
- server/services/email-profile-store.js
- server/services/email-account-store.js
- server/services/email-transport-pool.js
- server/routes/email-profiles.js
- server/routes/email-accounts.js
- server/scripts/migrate-email-to-multi-account.js

**修改（4 个）**
- server/db/connection.js（KNOWN_COLLECTIONS 加 2 个 + 索引）
- server/services/email-sender.js（兼容 accountId）
- server/services/imap-service.js（activeListeners 二维 Map）
- server/services/email-imap-rule-integration.js（接受 accountId）
- server/app.js（挂载 2 个新 route）

**不动**
- client/* （v2.0 后端先做完，UI 在 v2.1 再改）

## 风险与回滚

- **加密密钥丢失** — 凭证无法解密。用 `data/email-cipher.key` 文件存密钥（不在 git 跟踪），备份时单独提示
- **迁移脚本错误** — 先 dry-run 模式打印要改的 doc 数，确认后再 apply。迁移脚本要 idempotent（可重跑）
- **现有 /api/emails/send 调用方** — 保持向后兼容（不带 accountId 时降级到 config.smtp 或 default account）
- **测试不充分** — v2.0 阶段必须 curl + 端到端覆盖；v2.1/v2.2 阶段必须手动 UI 测

## 与 ACMS 通病 checklist 的对应

| 反模式 | 防御 |
|---|---|
| DOMPurify ALLOWED_ATTR 漏 src | v2.1 改 UI 时检查 |
| Node 24 filter(undefined) | v2.0 迁移脚本和 store 用 `coll.all()` |
| return + setTimeout 死代码 | v2.1 loadXxx 方法 return 前 schedule |
| sub-tab switch 漏 load | v2.2 profile/account 管理页每个 sub 都 schedule load |
| loadXxx map callback 只返回开始标签 | v2.1 列表渲染 assert open==close |
| 用户报"加载中"先 curl | v2.0 完成后立刻按 SOP 全 curl 验证 |
| catch 用 setStatus 推状态栏 | v2.1 错误处理统一 |
| 浮窗按钮显式颜色 | v2.1/v2.2 浮窗按钮全用 #0ea89d 等显式色 |
| 「toast 骗人」 | 所有异步操作完成必须 setStatus + Toast 双提示 |
| 「改 UI 不改行为」 | v2.0 后端完整，v2.1/v2.2 UI 全绑真实事件 |
| 「不能缩水」 | 设置页必须含 profile/account 全字段编辑 |

## 测试报告预期

多多会按 SOP 测：
- 本地 3300 测（curl + 浏览器）
- UI 视角报问题（"看不到 UI" / "消失" / "点了没反应"）
- 错别字不纠
- "继续" = 直接推进不重复确认

每 phase 完成后我先 kill 3300（用户手工 start.bat 重启）→ 用户测 → 反馈 → 下一 phase。

## 不做

- 改其他模块（chat / GEO / Web 机器人）的 profile 隔离 — 等邮件稳了再说
- PIN 重试锁定（5 次错 → 锁 5 分钟） — v2.3 再说
- 头像上传到服务器 — v2.2 用 emoji 够了
- 邮件模板按 profile 覆盖 — v2.3 再说

