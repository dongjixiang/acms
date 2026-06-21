// ACMS Debug Logger — LLM/JSON 解析调试日志的公共工具
// 历史背景（v0.3.3 B+++ → v0.13）：index.js / llm-adapter.js / json-extractor.js
// 各自内联了相同的 _debugDump + rotate 逻辑。3 份重复，rotate 还有 bug
// （index.js 只在 banner 那次跑，永不触发 rotate）。
//
// 设计约束：必须 0 service 依赖，避免 require 循环
// （json-extractor.js 当时显式注释「避免 require 循环」才不复用）。
// 解法：只 import node 内置 fs/path，不 require 任何业务模块。
//
// 公共 API：
//   const { dump, banner, printStartupHint } = require('./debug-logger');
//   dump('LLM_REQUEST', { ... })   — JSON.stringify 后追加
//   banner('ACMS_DEBUG_START ...')  — 纯文本追加（不 JSON 化）
//   printStartupHint()              — 启动时打印 banner + dump 启动 marker

const fs = require('fs');
const path = require('path');

// v0.13 修正：debug-logger.js 在 services/ 下，所以需要 2 层 .. 才能到项目根
// 原 3 处代码漏写一层 ..，把 log 写到了 server/data/（被 mkdirSync 静默创建，
// 但 7 周来从未真正写过 data/acms-llm-debug.log，根因 6/21 发现）
const ENABLED = process.env.ACMS_LLM_DEBUG === '1';
const LOG_FILE = path.join(__dirname, '..', '..', 'data', 'acms-llm-debug.log');
const MAX_BYTES = 5 * 1024 * 1024;  // 5MB

// 内部：rotate 日志文件（超过 MAX_BYTES 时保留 .old，重开新文件）
function _rotateIfNeeded() {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_BYTES) {
      fs.renameSync(LOG_FILE, LOG_FILE + '.old');
      fs.writeFileSync(LOG_FILE, `[rotated at ${new Date().toISOString()}]\n`);
    }
  } catch {}
}

// 内部：确保 data 目录存在（dump 之前调一次）
function _ensureDir() {
  try { fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true }); } catch {}
}

// 公共：结构化 dump（payload 走 JSON.stringify(..., null, 2)）
function dump(tag, payload) {
  if (!ENABLED) return;
  _ensureDir();
  _rotateIfNeeded();
  try {
    const line = `\n=== [${new Date().toISOString()}] ${tag} ===\n` + JSON.stringify(payload, null, 2) + '\n';
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
}

// 公共：纯文本 banner（不 JSON 化）。多次 dump 的 marker 用这个。
function banner(text) {
  if (!ENABLED) return;
  _ensureDir();
  _rotateIfNeeded();
  try {
    fs.appendFileSync(LOG_FILE, `\n=== [${new Date().toISOString()}] ${text} ===\n`);
  } catch {}
}

// 公共：启动时打印 console 提示 + dump 启动 marker
function printStartupHint() {
  if (ENABLED) {
    console.log(`[ACMS] 🐛 DEBUG 模式开启 — LLM 全部入参/出参/解析结果 dump 到: ${LOG_FILE}`);
    console.log(`[ACMS] 🐛 关闭方式: 重启时不要设置 ACMS_LLM_DEBUG=1 环境变量`);
    banner('ACMS_DEBUG_START\nACMS v0.3.3 B+++ DEBUG 模式开启\nLLM_REQUEST / LLM_RESPONSE / JSON_PARSE_OK / JSON_PARSE_FAIL 都会 dump');
  } else {
    console.log(`[ACMS] ℹ️  DEBUG 模式关闭 — 设置环境变量 ACMS_LLM_DEBUG=1 重启可开启 LLM 全量 dump`);
  }
}

module.exports = { dump, banner, printStartupHint, ENABLED, LOG_FILE };
