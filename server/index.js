// ACMS 服务入口（只负责启动）
const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('./app');
const config = require('./config');
const { setupWebSocket } = require('./handlers/websocket');

// ── DEBUG 模式启动提示（v0.3.3 B+++ 2026-06-13，v0.13 抽公共） ──
// 实现已抽到 services/debug-logger.js（合并 3 处重复的 _debugDump + rotate）
// 开启 ACMS_LLM_DEBUG=1 后 LLM request/response/parse 全 dump 到 data/acms-llm-debug.log
const { printStartupHint } = require('./services/debug-logger');
printStartupHint();
// 之前 server_out.txt 只有启动信息，所有 runBriefJob / pickNext / runAssistJob 的日志都丢了
// 调查"5 轮没辅助手段"时最大的痛点。现在加一个轻量文件 logger：
//   - 输出到 data/acms.log
//   - 同时 stdout（兼容 start.bat 直接启动的场景）
const LOG_FILE = path.join(__dirname, '..', 'data', 'acms.log');
const _origLog = console.log;
const _origErr = console.error;
function _append(level, args) {
  try {
    const line = `[${new Date().toISOString()}] ${level} ` + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') + '\n';
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
}
console.log = (...args) => { _origLog(...args); _append('INFO', args); };
console.error = (...args) => { _origErr(...args); _append('ERR ', args); };
console.warn = (...args) => { _origLog(...args); _append('WARN', args); };

console.log('[ACMS] 智能体协同管理系统 v0.3.0');
console.log(`[ACMS] 日志输出: ${LOG_FILE}`);

// HTTP API
// P0 v0.X: keepAliveTimeout + headersTimeout 调到 10 分钟 — 防止长跑（>5min）agent-execute 连接被 Node 默认 keepAliveTimeout=5s 主动 reset (Pattern U)
//   之前默认 5s：dispatcher 调 /agent-execute 后 audit/submit 阶段进行中时连接被 server 主动关，response 永远丢，任务卡 17% (T-MRHSD8OQ 7/13 实战)
const httpServer = http.createServer(app);
httpServer.keepAliveTimeout = 600_000; // 10 min — 允许 agent-execute 长跑 10 分钟不被 idle reset
httpServer.headersTimeout = 605_000;   // 必须 > keepAliveTimeout (Node HTTP server 要求)
// v0.46 fix: 端口重用（Windows TIME_WAIT 导致重启失败时用）
httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[ACMS] ⚠️ 端口 ${config.port} 被占用，等待 10 秒后重试...`);
    setTimeout(() => {
      httpServer.close();
      httpServer.listen(config.port, () => {
        console.log(`[ACMS] HTTP API: http://localhost:${config.port}`);
        console.log(`[ACMS] Web UI:  http://localhost:${config.port}/client/index.html`);
      });
    }, 10000);
  } else {
    throw err;
  }
});

// 创建默认管理员（首次启动）
try { require('./services/user-service').ensureDefaultAdmin(); } catch (e) { /* DB 未就绪时跳过 */ }

// v0.X: GEO Task Executor（Kanban GEO 任务自动执行）
try { require('./services/geo-task-executor').startGeoTaskExecutor(); } catch (e) { console.warn('[GEO] task executor start skipped:', e.message); }

httpServer.listen(config.port, () => {
  console.log(`[ACMS] HTTP API: http://localhost:${config.port}`);
  console.log(`[ACMS] Web UI:  http://localhost:${config.port}/client/index.html`);
});

// WebSocket
const wsServer = http.createServer();

// 终端 WebSocket（独立端口 3302，与主 WS 隔离避免扩展协商冲突）
const { setupTerminalWS } = require('./handlers/terminal-ws');
setupTerminalWS();

setupWebSocket(wsServer);
wsServer.listen(config.wsPort, () => {
  console.log(`[ACMS] WebSocket: ws://localhost:${config.wsPort}`);
});

// v0.59 appRuntime WebSocket：挂到主 httpServer（路径 /ws/app-runtime/*）
//   跟主 ws（/ws）和 terminal-ws（独立端口）做 path 隔离，不冲突
const { setupAppRuntimeWS } = require('./handlers/app-runtime-ws');
setupAppRuntimeWS(httpServer);
console.log('[ACMS] appRuntime WS 已挂到 httpServer: /ws/app-runtime/{sessionId}');

// v1.0 (Phase 4-B): Trace watchdog — 清理僵尸 running trace
//   治之前发现的 bug: trc_msyvcijq_dv6n 跑了 20+ 小时没清理
//   每 5 分钟扫描一次,超 30 分钟没更新的 running trace 标 failed
try {
  const watchdog = require('./services/trace-watchdog');
  watchdog.start(5 * 60 * 1000);  // 5 分钟间隔
} catch (e) {
  console.warn('[ACMS] ⚠️ Trace watchdog 启动失败:', e.message);
}

// ── 启动时：自动创建 ACMS 自我改进项目 ──
try {
  const { collection } = require('./db/connection');
  const existing = collection('projects').findOne(p => p.slug === 'acms-self-improvement');
  if (!existing) {
    const projectStore = require('./stores/project-store');
    projectStore.create({
      name: 'ACMS自我改进', slug: 'acms-self-improvement',
      description: '系统自我改进报告与任务管理。隐藏项目，仅通过「自我改进」入口访问。',
    });
    collection('projects').update(p => p.slug === 'acms-self-improvement', { system_project: 1 });
    console.log('[ACMS] ✅ 自动创建「ACMS自我改进」项目');
  } else if (!existing.system_project) {
    collection('projects').update(p => p.slug === 'acms-self-improvement', { system_project: 1 });
  }
} catch (e) { console.error('[ACMS] 创建系统项目失败:', e.message); }

// 定期任务：检查过期需求 + 饥饿降级
setInterval(() => {
  try { require('./stores/requirement-store').checkAndAbandon(); } catch (e) { /* */ }
  try { require('./services/agent-stats-service').checkAndDegrade(); } catch (e) { /* */ }
}, 10 * 60 * 1000);

// 每日自动归档：已完成任务按项目配置天数自动归档
setInterval(() => {
  try { require('./services/auto-archive-service').autoArchive(); } catch (e) { /* */ }
}, 24 * 60 * 60 * 1000);

// P160: Task Watchdog — 兜底熔断卡死任务 (ACMS_WATCHDOG_ENABLED=true 启用)
try { require('./services/task-watchdog').init(); } catch (e) { console.error('[P160 watchdog] 启动失败:', e.message); }

// v0.55.1：每日清理回收站（删除 > 7 天的软删 session）
function cleanupExpiredChatSessions() {
  try {
    const n = require('./services/chat-session-service').cleanupExpired();
    if (n > 0) console.log(`[ACMS] 回收站清理: 删除 ${n} 个过期 session`);
  } catch (e) { console.error('[ACMS] 回收站清理失败:', e.message); }
}
setInterval(cleanupExpiredChatSessions, 24 * 60 * 60 * 1000);

// v2.0: 启动时注册内建工具
try {
  require('./tools/index');
  const tr = require('./services/tool-registry');
  console.log(`[tools] 工具注册完成: ${tr.listTools().map(t => t.name).join(', ')}`);
} catch (e) {
  console.error('[tools] 工具注册失败:', e.message);
}

// v0.24: 注册 ACMS-Self 系统 agent（注册表层面 + dispatcher 订阅）
try {
  const agentStore = require('./stores/agent-store');
  const sysAgent = agentStore.register({
    id: 'agent-acms-self',
    name: 'ACMS-Self (系统)',
    role: 'orchestrator',
    domain: 'system',
    modelId: '',
    systemPrompt: '',
    allowedToCall: [],
  });
  console.log(`[ACMS-Self] 已注册: ${sysAgent.name} (id=${sysAgent.id})`);

  // 启动 dispatcher（监听 task.claimed 事件 → 自动 trigger agent-execute）
  require('./services/auto-execute-dispatcher').init();
} catch (e) {
  console.error('[ACMS-Self] 注册失败:', e.message);
}

// v0.97: Agent Registry — 扫描并注册 Expert Agents
try {
  const agentRegistry = require('./agents/registry');
  const toolStore = require('./stores/tool-store');
  const modelStore = require('./stores/model-store');

  // 默认工具注册
  const defaultTools = [
    { id: 'genImage', name: 'AI生图', category: 'image', description: '调用 AGNES AI 文生图 API', handlerPath: 'server/tools/gen-image.js' },
    { id: 'appendAll', name: '追加文本', category: 'word', description: '在文档末尾追加文本内容', handlerPath: 'server/tools/append-all.js' },
    { id: 'formatText', name: '文本格式化', category: 'word', description: '调整文本格式（字体/字号/颜色等）', handlerPath: 'server/tools/format-text.js' },
    { id: 'webSearch', name: '网络搜索', category: 'search', description: '搜索网络获取信息', handlerPath: 'server/tools/web-search.js' },
    { id: 'summarize', name: '文本摘要', category: 'general', description: '对长文本进行摘要总结', handlerPath: 'server/tools/summarize.js' },
  ];

  for (const t of defaultTools) {
    const existing = toolStore.getById(t.id);
    if (!existing) {
      toolStore.register(t);
      console.log(`[AgentRegistry] 工具已注册: ${t.id}`);
    }
  }

  // 注册 Expert Agents
  console.log('[AgentRegistry] 开始加载 Expert Agents...');
  const experts = [
    require('./agents/expert-word'),
    require('./agents/expert-image'),
    require('./agents/expert-search'),
  ];
  console.log(`[AgentRegistry] 加载了 ${experts.length} 个专家模块`);

  for (const exp of experts) {
    console.log(`[AgentRegistry] 注册: ${exp.id} (${exp.name}) domain=${exp.domain}`);
    agentRegistry.register(exp);
    // 绑定默认工具
    const curAgentStore = require('./stores/agent-store');
    const agent = curAgentStore.getById(exp.id);
    if (agent && exp.domain === 'word') {
      ['appendAll', 'formatText', 'genImage'].forEach(tid => toolStore.addTool(exp.id, tid));
    } else if (agent && exp.domain === 'image') {
      toolStore.addTool(exp.id, 'genImage');
    } else if (agent && exp.domain === 'search') {
      toolStore.addTool(exp.id, 'webSearch');
      toolStore.addTool(exp.id, 'summarize');
    }
  }

  // 确保小吉是编排者，可以调用所有专家
  const curAgentStore2 = require('./stores/agent-store');
  const xiaoji = curAgentStore2.getById('agent-xiaoji');
  if (xiaoji) {
    curAgentStore2.update('agent-xiaoji', {
      role: 'orchestrator',
      allowedToCall: ['agent-word-expert', 'agent-image-expert', 'agent-search-expert']
    });
    console.log('[AgentRegistry] 小吉已配置为编排者');
  }

  console.log('[AgentRegistry] 启动完成 ✅');
} catch (e) {
  console.error('[AgentRegistry] 初始化失败:', e.message);
}

// v0.46: 注册内置 hooks（PostToolUse: auto-typescheck-on-write + track-tool-stats）
try {
  require('./hooks');
} catch (e) {
  console.error('[ACMS] hooks 注册失败:', e.message);
}

console.log('[ACMS] 启动完成 ✅');
