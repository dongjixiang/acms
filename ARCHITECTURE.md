# ACMS Architecture (v0.23)

> **Audience**: ACMS contributors, AI assistants extending the codebase, anyone reading the source.  
> **Last updated**: 2026-07-09 (post v0.23 L2 + L3 refactor)

---

## 1. Layered Overview

ACMS follows a strict 5-layer architecture. **Lower layers know nothing about higher layers**; higher layers depend downward via explicit `require`.

```
┌─────────────────────────────────────────────────────────────┐
│ L1 入口层 — Express routes + worker daemon                  │
│   server/app.js                                              │
│   server/index.js                                            │
│   server/routes/*.js          ← HTTP endpoints               │
│   agent-worker.js             ← background job runner        │
└─────────────────────────────────────────────────────────────┘
                         ↓ uses
┌─────────────────────────────────────────────────────────────┐
│ L2 服务层 — business logic, organized by concern             │
│   server/services/                                            │
│   ├─ ai-tools-service.js (shim, 26 行) ← see §3.1 for splits│
│   ├─ llm-adapter.js         ← all LLM provider calls         │
│   ├─ tool-registry.js       ← tool registration + dispatch   │
│   ├─ workspace-service.js   ← sandboxed filesystem            │
│   ├─ gen-adapter.js         ← image/video/audio generation    │
│   └─ assists/*.js           ← 20+ assist method handlers     │
└─────────────────────────────────────────────────────────────┘
                         ↓ registers
┌─────────────────────────────────────────────────────────────┐
│ L3 工具层 — 16 内建工具，按权限/用途物理隔离                │
│   server/tools/                       (see §3.2)              │
│   ├─ index.js          (22 行 — entry + boot log)            │
│   ├─ web.js           ← 6 search/fetch tools                │
│   ├─ external-api.js  ← 2 Agnes video tools                  │
│   ├─ leisure.js       ← 3 music/video/image wrappers         │
│   └─ agent/                                                ──┐│
│       ├─ read.js      ← 3 read-only file tools  (safe)     ││
│       └─ write.js     ← 2 file/exec tools      (⚠ sidefx) ││
└─────────────────────────────────────────────────────────────┘  │
                         ↓ uses                                  │
┌─────────────────────────────────────────────────────────────┐  │
│ L4 沙箱层 — filesystem exec isolation                       │  │
│   server/services/workspace-service.js  (205 行)             │  │
│   ├─ readFile / writeFile / listFiles / searchFiles / exec    │  │
│   ├─ path traversal blocked                                  │  │
│   └─ shell command whitelist enforced                        │  │
└─────────────────────────────────────────────────────────────┘  │
                                                                 │
┌─────────────────────────────────────────────────────────────┐  │
│ L5 适配层 — vendor-specific HTTP quirks                     │◀┘
│   server/tools/http1-fetch.js  (Node fetch workaround)        │
│   server/tools/url-fetch.js    (fetch_url impl)               │
│   server/tools/web-search.js                                     │
│   server/tools/web-research.js                                  │
│   server/tools/agnes-video.js  (litellm proxy quirks)         │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Agent Subsystem (v0.23 主线)

The agent is the centerpiece of v0.23. Here's how a single agent task flows end-to-end:

```
┌─────────────────┐     POST /api/agent-execute        ┌────────────────────┐
│  Task (kanban)  │ ────────────────────────────────▶ │ routes/ai-tools.js │
│  status=todo    │                                    │ .agent-execute()   │
└─────────────────┘                                    └─────────┬──────────┘
                                                                   │
                                                                   ▼
                                                        ┌────────────────────┐
                                                        │ ai-tools-service   │
                                                        │ .executeTaskAgent  │ ◀─┐
                                                        │ (shim → task-agent │   │
                                                        │                    │   │
                                                        │ 86 行单文件)       │   │
                                                        └─────────┬──────────┘  │
                                                                  │            │
                                                                  ▼            │
                ┌─────────────────────────────────────────────────────────────┐ │
                │  runToolLoop (llm-adapter.js:362)                            │ │
                │  • maxRounds=20 死循环保护                                    │ │
                │  • OpenAI + Anthropic tool-call format                       │ │
                │  • context = { projectId, taskId } (PWD-style 沙箱上下文)    │ │
                └────────────────────────┬────────────────────────────────────┘ │
                                         │                                       │
                                         ▼                                       │
                ┌─────────────────────────────────────────────────────────────┐  │
                │  AGENT 工具（独立子目录，按权限分文件）                     │◀─┘
                │                                                              │
                │  agent/read.js (只读，安全)                                 │
                │   • agent_read_file     读文件，限 8000 chars                │
                │   • agent_list_files    递归列文件，跳过 build               │
                │   • agent_search_files  正则搜索，限 20 结果                │
                │                                                              │
                │  agent/write.js (有副作用，⚠ 安全敏感)                     │
                │   • agent_exec_command  沙箱执行 shell                      │
                │   • agent_write_file    写/覆盖文件，自动建父目录            │
                └────────────────────────┬────────────────────────────────────┘
                                         │
                                         ▼
                ┌─────────────────────────────────────────────────────────────┐
                │  workspace-service.js 沙箱                                  │
                │  ├─ path 必须在项目工作区内                                  │
                │  ├─ exec 命令白名单（node/npm/git/ls/cat 等）               │
                │  └─ timeout 30s，stdout 限 5000 chars                       │
                └────────────────────────┬────────────────────────────────────┘
                                         │
                                         ▼
                ┌─────────────────────────────────────────────────────────────┐
                │  最终输出：summary (~2000 字，含文件路径/行号/变更/验证)     │
                │  → 自动调 taskStore.submit() → task 状态变为 review         │
                │  → 触发 task.submitted 事件（webhooks）                     │
                └─────────────────────────────────────────────────────────────┘
```

**关键设计**：
- **agent 工具放独立子目录**：`tools/agent/read.js` vs `write.js` — 安全审计一眼看清"哪些有副作用"
- **5 个工具权限等级**（read < exec < write），未来加新工具按级别归类即可
- **AGENT_SYSTEM_PROMPT 收紧探索**（1-2 轮即动手），maxRounds=20 兜底长任务

**当前 v0.23 已验证**：
- T-MRDLBHTP（proj_sanguo）只读分析任务 → 108 秒完成，1667 字符报告
- write_file 已 commit 但未实测端到端

---

## 3. L2 + L3 Refactor (v0.23 历史)

2026-07-09 完成两轮拆分，避免巨型单文件堆积。

### 3.1 L2: ai-tools-service.js (783 → 26 行 shim)

| 原 .js 单文件 | 新独立文件 | 行数 |
|---|---|---|
| **整体** | ai-tools-service.js (shim) | 26 |
| 工具函数 + JSON 修复 | ai-tools-utils.js | 228 |
| generateDoc | doc-generator.js | 88 |
| + complexity/granularity |  |  |
| decomposeRequirement | requirement-decomposer.js | 227 |
| + EXPERIENCE_DECOMPOSE_RULES |  |  |
| refineSection + checkConsistency | consistency-checker.js | 88 |
| **executeTaskAgent** ⭐ | **task-agent.js** | **86** |

**调用方式不变**：`routes/ai-tools.js` 和 `routes/ai-clarify.js` 继续 `require('../services/ai-tools-service')`，shim re-export 5 函数。

### 3.2 L3: tools/index.js (484 → 22 行)

| 分类 | 文件 | 行数 | 工具数 |
|---|---|---|---|
| Web / 搜索 / 时间 | tools/web.js | 122 | 6 |
| 外部 SaaS API | tools/external-api.js | 50 | 2 |
| 休闲娱乐 assist 包装 | tools/leisure.js | 130 | 3 |
| **Agent 只读** ⭐ | tools/agent/read.js | 102 | 3 |
| **Agent 写入** ⭐ ⚠ | tools/agent/write.js | 76 | 2 |
| 注册入口 | tools/index.js | 22 | — |

**全部 16 工具**：get_current_time, search_knowledge, get_requirement_detail, fetch_url, web_search, web_research, agnes_generate_video, agnes_query_video, play_music, play_video, generate_image, agent_read_file, agent_list_files, agent_search_files, agent_exec_command, agent_write_file

---

## 4. Contribution Guide

### 4.1 添加新内建工具

**先决定权限等级** — 文件放哪里：

| 权限等级 | 放哪里 | 例子 |
|---|---|---|
| 信息检索 / 无副作用 | `tools/web.js` | search_knowledge, fetch_url |
| 外部 API（限流敏感） | `tools/external-api.js` | agnes_generate_video |
| assist 触发器（fire-and-forget） | `tools/leisure.js` | play_music |
| Agent 只读 | `tools/agent/read.js` | agent_read_file |
| Agent 写/执行 | `tools/agent/write.js` | agent_write_file |

**模板**：

```js
// 在对应文件里加
registerTool({
  name: 'my_new_tool',
  description: '做什么 + 何时使用（中文 + 英文 fallback）',
  parameters: {
    type: 'object',
    properties: { /* JSON Schema */ },
    required: ['必填字段'],
  },
  async handler(args, ctx = {}) {
    // args = 工具入参
    // ctx = { projectId, reqId, ... } 上下文
    // 返回 JS 对象，会被 LLM tool-call 协议序列化
  },
});
```

**agent 工具额外要求**：
- 必须从 `ctx.projectId` 拿项目 ID → `projectStore.getById` → 用 `slug`
- 所有 I/O 必须走 `workspace-service.js` 的沙箱
- 写入要检查文件大小、路径合规

### 4.2 添加新 AI 业务能力

**先决定归哪个 L2 业务模块**：

| 业务类型 | 放哪里 | 例子 |
|---|---|---|
| 文档生成（MD、表格、报告） | `doc-generator.js` | generateDoc |
| 任务分解、复杂度评估 | `requirement-decomposer.js` | decomposeRequirement |
| 文档润色、一致性检查 | `consistency-checker.js` | refineSection |
| 自主执行（agent loop） | `task-agent.js` | executeTaskAgent |
| 跨模块共享 utility | `ai-tools-utils.js` | repairJSON, assessComplexity |

**改 `ai-tools-service.js` shim**：新增 export 才需要改（保持向后兼容）。

### 4.3 添加新 assist 方法

`server/services/assists/<name>.js` 单文件，导出 `{ name, field, runAssistJob, ... }`，然后在 `services/assists/index.js` 注册一行。

事件：`status: 'generating' → 'done' | 'failed'` 必须按这 3 阶段推进（前端 SSE 监听状态）。

### 4.4 添加新生成 provider（图片/视频/音频）

`server/stores/gen-store.js` 注册；`server/services/gen-adapter.js` 加 switch case + async function。模式：

```js
case 'my-provider':
  return await generateMyProvider(projectSlug, provider, prompt, params);
```

---

## 5. 常见 Pitfalls

| 错误 | 后果 | 修法 |
|---|---|---|
| `require('../services/...')` 在 `tools/agent/*.js` | "Cannot find module" | 改 `require('../../services/...')` |
| 在 `agent_write_file` 里直接 `fs.writeFile` | 绕过沙箱 | 必须走 `workspace-service.writeFile` |
| 工具 prompt 写"自动判断"诱导 LLM | LLM 误触发 web_search | 显式条件 + 严禁场景，参考 `web_search` 描述 |
| assist 没设 `status: 'generating'` | SSE 拿不到进度，UI 永远 loading | 必须 3 阶段：`generating` → `done`/`failed` |
| 巨型文件不拆（>400 行混合多个职责） | code review 失控、未来扩展必踩坑 | 按上面 §4.1/§4.2 决定归位 |

---

## 6. Roadmap (planned stages)

| Stage | 内容 | 工作量 | 依赖 |
|---|---|---|---|
| **v0.23** ✅ | Agent 只读 MVP + write_file 工具 + L2/L3 重构 | — | done |
| Stage 1 (v0.24) | 多模态 agent 工具（image_gen/video_gen 集成到 task-agent） | 1 天 | task-agent.js |
| Stage 2 (v0.25) | Agent session 持久化（跨多轮执行保留上下文） | 1-2 天 | task-agent.js |
| Stage 3 (v0.30) | 多 agent 协作 + Marketplace | 1 周 | Stage 1+2 |
| Stage 4 | 与 self-improvement 流程集成（agent 自动写 changelog） | 半天 | Stage 2 |

---

## 7. 关键文件索引

```
acms/
├─ server/
│  ├─ index.js                            ← 启动入口
│  ├─ app.js                              ← Express 配置 + routes mount
│  ├─ routes/                             ← L1 HTTP endpoints
│  │  ├─ ai-tools.js                      含 POST /agent-execute
│  │  └─ ai-clarify.js                    含 generateDoc 调用
│  ├─ services/
│  │  ├─ ai-tools-service.js              ← shim (26 行)
│  │  ├─ ai-tools-utils.js                ← 共享 utility
│  │  ├─ doc-generator.js
│  │  ├─ requirement-decomposer.js
│  │  ├─ consistency-checker.js
│  │  ├─ task-agent.js                    ⭐ v0.23 核心
│  │  ├─ llm-adapter.js                   ← runToolLoop 在 362 行
│  │  ├─ tool-registry.js
│  │  ├─ workspace-service.js             ← L4 沙箱
│  │  └─ assists/                         ← 20+ assist 方法
│  └─ tools/
│     ├─ index.js                         ← 注册入口 (22 行)
│     ├─ web.js
│     ├─ external-api.js
│     ├─ leisure.js
│     └─ agent/
│        ├─ read.js                       ⭐ 只读
│        └─ write.js                      ⭐ 写入
├─ agent-worker.js                        ← kanban 工作流 daemon
└─ client/                                ← 前端（详见 docs/api-spec.md）
```

---

## 8. One-line Mental Model

> **ACMS = LLM tool-use registry + task kanban + workspace sandbox + workspec-driven assists.**  
> Agent = LLM loop with 5 sandboxed tools, invoked per task via `executeTaskAgent`.  
> **拆分原则：每个文件单一职责，每个工具按权限分级，每个 L2 业务独立演化。**
