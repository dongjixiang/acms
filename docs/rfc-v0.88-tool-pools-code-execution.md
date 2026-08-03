# RFC v0.88 — 工具池元数据 + 小吉执行域（契约先定，引擎后建）

状态：已实施（2026-08-03）
拍板：多多（"按这个来"）

## 一、背景与目标

ACMS 现在是 86 个工具的小系统，但未来是通用任务平台（300+ 工具、第三方角色、MCP）。
目标：
1. 现在成本低、未来不堵死 —— 把"工具属于哪个域、什么风险级"作为契约现在定死
2. 小吉获得"像 Claude Code 执行任务"的能力（读文件/写文件/跑命令/git/委派）
3. 不引入现在用不上的抽象引擎（池投影 / specialist 注册制 / 风险门禁）

## 二、关键决策（与多多的三轮讨论结论）

| 议题 | 结论 |
|------|------|
| 全量注入 86 工具？ | ❌ +439% token，必然质量崩（实测 ~12.2k tokens） |
| 注入太多工具影响质量？ | ✅ 会。解法=常驻小 + 按需大 + 检索准，不是不注入 |
| 专业 Agent 分工？ | ✅ 有价值，但搜索已有 web_research 流程封装（形态 A），形态 B 留给代码执行 |
| 工具分池？ | ✅ 必须，但不要 4 份手写清单 → 1 个 pool 元数据属性 |
| 全套引擎（投影+注册制）？ | ⏳ 现在不做，工具 >150 或第三方角色出现时再做（增量迁移） |
| 安全边界？ | ⚠️ 分池是逻辑边界不是安全边界（无 OS 沙箱），exec/restricted 未来接确认门 |

## 三、实施内容

### 1. pool 字段 schema（契约）

```js
registerTool({
  name: 'agent_read_file',
  pool: { domain: 'fs', risk: 'read' },
})
```

- domain 能力域：fs / git / exec / web / db / office / acms / media / agent / system / app
- risk 风险级：read（直接执行）/ write（可逆写入）/ exec（命令，高审）/ restricted（受限）
- 未来：domain → MCP server 名；risk → 权限系统地基

### 2. 文件清单

| 文件 | 改动 |
|------|------|
| `server/services/tool-pools.js` | **新增**：POOL_DEFAULTS（86→87 工具映射）+ POOLS（7 个手写池）+ DOMAIN_TERMS（域→中文意图词） |
| `server/services/tool-registry.js` | registerTool 收 pool 字段；新增 getToolPool / listPool / listPoolNames / validatePools |
| `server/tools/delegate-subtasks.js` | **新增**：从 task-agent.js 抽出独立注册（+pool 元数据） |
| `server/services/task-agent.js` | 删除内嵌 delegate_subtasks 注册块（改注释引用） |
| `server/tools/index.js` | require('./delegate-subtasks') |
| `server/services/agent-buddy-action.js` | normalizeRoute 白名单 + router prompt 枚举 + 关键词拦截 + getActionToolNames 映射 code_execution |
| `server/routes/agent-buddy.js` | sharedCtx 加 projectId |
| `client/js/core/agent-buddy.js` | sendMessage context 加 currentProjectId |
| `server/services/tool-retriever.js` | init() 按 pool.domain 注入中文意图词（解决 P6 英文描述中文检索不到） |
| `scripts/verify-tool-pools.js` | **新增**：池完整性校验（9 组检查） |
| `scripts/verify-buddy-code-execution.js` | **新增**：小吉执行域端到端验证（8 组检查） |

### 3. 池定义（POOLS，7 个）

- code_execution：16 工具（fs 读写 + exec + git）≈ 2909 tokens
- web_research：7 工具
- data_query：10 工具
- office：4 工具
- media：5 工具
- read_only：39 工具
- high_risk：8 工具

### 4. 小吉执行域（code_execution capability）

路由检测（LLM router prompt + 关键词前置拦截）：
```
/改代码|写代码|修bug|修缺陷|实现功能|新增.*功能|读文件|看.*代码|跑命令|执行命令|调试|查看项目|改文件|写文件|重构|代码审查/
```
命中 → capabilities 加 code_execution → getActionToolNames 注入 listPool('code_execution') + delegate_subtasks。

projectId 上下文：前端 `App.currentProjectId` → context.currentProjectId → sharedCtx.projectId
→ agent_exec_command / agent_read_file 等 handler 能定位 workspace。

## 五、验证结果

### verify-tool-pools.js（9/9 通过）
- 87 个注册工具全部有 pool 元数据
- 7 个池内工具全部真实注册
- validatePools 通过
- 风险分布：read 47 / write 31 / exec 6 / restricted 3
- 域分布：acms 44 / fs 10 / web 10 / git 5 / media 5 / office 4 / exec 4 / agent 3 / db 1 / system 1

### verify-buddy-code-execution.js（8/8 通过）
- 中文检索 4/4 捞到执行工具（"读项目文件"→agent_read_file，"跑命令"→agent_exec_command）
- code_execution 注入 17 工具 ≈ 3076 tokens（+77%，可控）
- 风险分布：read 10 / write 4 / exec 3
- buildChatPrompt 含执行工具描述

## 六、Token 成本对比

| 策略 | 工具数 | tokens |
|------|:------:|-------:|
| 全量注入（错误方案） | 86 | ~12,198 (+439%) |
| 当前分层（对话） | 16 | ~2,263 |
| 分层 + code_execution（执行时） | 17 | ~3,076 (+77%) |

## 七、未来迁移路径（明确不做，留接口）

1. 池投影引擎：listPool 内部改为 `registry.tools.filter(t => pool.domain ∈ ...)`，接口不变
2. specialist 注册制：`ACMS.registerSpecialist({name, pools, risk})` 角色=池组合
3. 风险门禁：risk=exec/restricted 走通用 confirm gate（复用 send_email pending 模式）
4. MCP 挂载：新 domain 自动进池

## 八、已知限制

- ⚠️ 分池是逻辑边界，不是安全边界（无 OS 沙箱）
- ⚠️ 代码执行域需要当前项目上下文；未传 projectId 时 handler 返回 NO_PROJECT_ID
- ⚠️ delegate_subtasks 子 agent 上下文断裂（只回传摘要），复杂任务可能失真
