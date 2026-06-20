// ACMS 服务入口（只负责启动）
const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('./app');
const config = require('./config');
const { setupWebSocket } = require('./handlers/websocket');

// ── v0.3.3 B+++ 补丁（2026-06-13）：DEBUG 模式开关（环境变量 ACMS_LLM_DEBUG=1） ──
// 开启后把 LLM request/response/parse 全 dump 到 data/acms-llm-debug.log
// 配合文件 logger（data/acms.log）可以诊断 5 轮没辅助手段 / tradeoff 解析失败 等问题
// 启动时打印提示；自动 truncate 大文件（避免无限增长）
const LLM_DEBUG = process.env.ACMS_LLM_DEBUG === '1';
const DEBUG_LOG_FILE = path.join(__dirname, '..', 'data', 'acms-llm-debug.log');
const DEBUG_LOG_MAX_BYTES = 5 * 1024 * 1024;  // 5MB

function _maybeRotateDebugLog() {
  try {
    if (fs.existsSync(DEBUG_LOG_FILE) && fs.statSync(DEBUG_LOG_FILE).size > DEBUG_LOG_MAX_BYTES) {
      fs.renameSync(DEBUG_LOG_FILE, DEBUG_LOG_FILE + '.old');
      fs.writeFileSync(DEBUG_LOG_FILE, `[rotated at ${new Date().toISOString()}]\n`);
    }
  } catch {}
}

// 在 console.log 重写之前调一次，确认目录存在
try { fs.mkdirSync(path.dirname(DEBUG_LOG_FILE), { recursive: true }); } catch {}
if (LLM_DEBUG) {
  _maybeRotateDebugLog();
  console.log(`[ACMS] 🐛 DEBUG 模式开启 — LLM 全部入参/出参/解析结果 dump 到: ${DEBUG_LOG_FILE}`);
  console.log(`[ACMS] 🐛 关闭方式: 重启时不要设置 ACMS_LLM_DEBUG=1 环境变量`);
  // 把 banner 也 dump 一份到 debug log，方便对照
  try {
    fs.appendFileSync(DEBUG_LOG_FILE, `\n=== [${new Date().toISOString()}] ACMS_DEBUG_START ===\nACMS v0.3.3 B+++ DEBUG 模式开启\nLLM_REQUEST / LLM_RESPONSE / JSON_PARSE_OK / JSON_PARSE_FAIL 都会 dump\n`);
  } catch {}
} else {
  console.log(`[ACMS] ℹ️  DEBUG 模式关闭 — 设置环境变量 ACMS_LLM_DEBUG=1 重启可开启 LLM 全量 dump`);
}
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
const httpServer = http.createServer(app);
httpServer.listen(config.port, () => {
  console.log(`[ACMS] HTTP API: http://localhost:${config.port}`);
  console.log(`[ACMS] Web UI:  http://localhost:${config.port}/client/index.html`);
});

// WebSocket
const wsServer = http.createServer();
setupWebSocket(wsServer);
wsServer.listen(config.wsPort, () => {
  console.log(`[ACMS] WebSocket: ws://localhost:${config.wsPort}`);
});

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

// v2.0: 启动时注册内建工具
try {
  require('./tools/index');
  const tr = require('./services/tool-registry');
  console.log(`[tools] 工具注册完成: ${tr.listTools().map(t => t.name).join(', ')}`);
} catch (e) {
  console.error('[tools] 工具注册失败:', e.message);
}

console.log('[ACMS] 启动完成 ✅');
