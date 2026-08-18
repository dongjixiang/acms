// ACMS Agent 运行全链路追踪 + HTML 报告生成
// v0.101 (2026-08-18)
//
// 记录 runToolLoop 每轮完整数据：
//   - 每轮发给 LLM 的完整 messages 快照（system prompt + 历史 + 工具结果）
//   - LLM 完整响应（content / tool_calls / finish_reason / usage / 耗时）
//   - 每个工具调用（完整 args + 发给 LLM 的结果 + 耗时 + 成败）
//   - steer/重试事件（stall / 空 content / 装睡 / budget alert / 重复调用 / 承诺-不调）
//
// 开关：system_configs.agent_trace_enabled（系统管理 UI 实时切换，默认关）
// 存储：data/traces/trc_*.json（每个 Agent 运行一个文件，保留最近 100 条）
//       data/traces/.meta.json（列表索引，轻量）
// 报告：GET /api/agent-trace/:id/report → 自包含 HTML（无外部依赖，可下载可分享）

const fs = require('fs');
const path = require('path');

const TRACE_DIR = path.join(__dirname, '..', '..', 'data', 'traces');
const META_FILE = path.join(TRACE_DIR, '.meta.json');
const CONFIG_KEY = 'agent_trace_enabled';
const MAX_TRACES = 100;
const SNAPSHOT_MAX_CONTENT = 60000;   // 单条 content 超过 60KB 截断（防 base64 图片爆盘）
const LIST_LIMIT = 20;

let _dbColl = null;
function _db() {
  if (!_dbColl) _dbColl = require('../db/connection').collection('system_configs');
  return _dbColl;
}

function ensureDir() {
  try { if (!fs.existsSync(TRACE_DIR)) fs.mkdirSync(TRACE_DIR, { recursive: true }); } catch (e) { /* */ }
}

// ─────────────────────────── 开关 ───────────────────────────

function isTraceEnabled() {
  try {
    const cfg = _db().findOne(c => c.key === CONFIG_KEY);
    return cfg ? (cfg.value === true || cfg.value === 'true') : false;
  } catch (e) { return false; }
}

function setTraceEnabled(enabled) {
  const now = new Date().toISOString();
  const val = !!enabled;
  try {
    const cfg = _db().findOne(c => c.key === CONFIG_KEY);
    if (cfg) _db().update(c => c.key === CONFIG_KEY, { ...cfg, value: val, updated_at: now });
    else _db().insert({ key: CONFIG_KEY, value: val, created_at: now, updated_at: now });
  } catch (e) { /* 写失败返回 val，前端 toast 会显示失败由调用方处理 */ }
  return val;
}

function getConfig() { return { enabled: isTraceEnabled() }; }

// ─────────────────────────── meta 索引 ───────────────────────────

function _readMeta() {
  try {
    if (fs.existsSync(META_FILE)) return JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  } catch (e) { /* */ }
  return [];
}

function _writeMeta(meta) {
  try { fs.writeFileSync(META_FILE, JSON.stringify(meta)); } catch (e) { /* */ }
}

function _saveTrace(trace) {
  try {
    ensureDir();
    fs.writeFileSync(path.join(TRACE_DIR, trace.id + '.json'), JSON.stringify(trace));
    const meta = _readMeta();
    const idx = meta.findIndex(m => m.id === trace.id);
    const entry = {
      id: trace.id,
      startedAt: trace.startedAt,
      finishedAt: trace.finishedAt,
      status: trace.status,
      modelId: trace.modelId,
      roundCount: trace.rounds.length,
      context: trace.context,
      error: trace.error || null,
    };
    if (idx >= 0) meta[idx] = entry; else meta.push(entry);
    _writeMeta(meta);
  } catch (e) { /* trace 写盘失败不阻塞主流程 */ }
}

function _trimOld() {
  try {
    const files = fs.readdirSync(TRACE_DIR).filter(f => f.endsWith('.json') && f !== '.meta.json');
    if (files.length <= MAX_TRACES) return;
    files.sort((a, b) => {
      try { return fs.statSync(path.join(TRACE_DIR, a)).mtimeMs - fs.statSync(path.join(TRACE_DIR, b)).mtimeMs; } catch (e) { return 0; }
    });
    const toRemove = files.slice(0, files.length - MAX_TRACES);
    for (const f of toRemove) { try { fs.unlinkSync(path.join(TRACE_DIR, f)); } catch (e) { /* */ } }
    const removedIds = new Set(toRemove.map(f => f.replace(/\.json$/, '')));
    _writeMeta(_readMeta().filter(m => !removedIds.has(m.id)));
  } catch (e) { /* */ }
}

// ─────────────────────────── 会话 ───────────────────────────

/**
 * 深拷贝 messages 快照 + 超长 content 截断（防 base64 图片/dataURL 爆盘）
 * @param {Array} messages
 * @returns {Array}
 */
function cloneMessages(messages) {
  try {
    return (messages || []).map(m => {
      const out = { role: m.role };
      if (typeof m.content === 'string') {
        out.content = m.content.length > SNAPSHOT_MAX_CONTENT
          ? m.content.slice(0, SNAPSHOT_MAX_CONTENT) + `\n... [已截断，原长度 ${m.content.length} 字符]`
          : m.content;
      } else if (Array.isArray(m.content)) {
        out.content = m.content.map(b => {
          if (b && typeof b === 'object' && (b.type === 'image' || b.image)) {
            return { ...b, image: '[image data omitted]', source: undefined };
          }
          return b;
        });
      } else if (m.content != null) {
        out.content = String(m.content);
      }
      if (m.tool_calls) out.tool_calls = m.tool_calls;
      if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
      if (m.name) out.name = m.name;
      return out;
    });
  } catch (e) { return []; }
}

/**
 * 启动一次追踪会话（开关已由调用方判断）
 * @param {object} meta { modelId, maxRounds, toolNames, context }
 * @returns {TraceSession}
 */
function startTrace(meta) {
  ensureDir();
  const id = 'trc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const trace = {
    id,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',
    modelId: meta.modelId || '',
    maxRounds: meta.maxRounds || 10,
    toolNames: meta.toolNames || [],
    context: meta.context || {},
    rounds: [],
    notes: [],       // 全局事件（不在轮次内）
    summary: null,
    error: null,
  };
  _saveTrace(trace);
  _trimOld();
  return new TraceSession(trace);
}

function _round(trace, round) {
  return trace.rounds.find(r => r.round === round) || null;
}

class TraceSession {
  constructor(trace) { this.trace = trace; }

  /** 每轮开始：记录本轮发送给 LLM 的完整 messages 快照 */
  beginRound(round, messagesSnapshot) {
    this.trace.rounds.push({
      round,
      startedAt: new Date().toISOString(),
      messagesSnapshot: messagesSnapshot || [],
      llm: null,
      toolCalls: [],
      notes: [],
      durationMs: null,
    });
    _saveTrace(this.trace);
  }

  /** LLM 调用完成后记录完整响应 */
  recordLLMResponse(round, data) {
    const r = _round(this.trace, round);
    if (!r) return;
    r.llm = data;
    r.durationMs = (data && data.durationMs) || null;
    _saveTrace(this.trace);
  }

  /** 记录 steer / 重试事件（效率杀手标记） */
  addNote(round, type, summary) {
    const item = { type, summary: String(summary || '').slice(0, 400), at: new Date().toISOString() };
    if (round != null) {
      const r = _round(this.trace, round);
      if (r) { r.notes.push(item); _saveTrace(this.trace); return; }
    }
    this.trace.notes.push(item);
    _saveTrace(this.trace);
  }

  /** 记录一次工具调用（完整 args + 发给 LLM 的结果 + 耗时 + 成败） */
  recordToolCall(round, tc) {
    const r = _round(this.trace, round);
    if (!r) return;
    r.toolCalls.push(tc);
    _saveTrace(this.trace);
  }

  /** 正常完成 */
  finish(result) {
    this.trace.finishedAt = new Date().toISOString();
    this.trace.status = 'completed';
    this.trace.summary = _buildSummary(this.trace, result);
    _saveTrace(this.trace);
  }

  /** 失败（maxRounds 耗尽 / 异常） */
  fail(error) {
    this.trace.finishedAt = new Date().toISOString();
    this.trace.status = 'failed';
    this.trace.error = error ? String((error && error.message) || error).slice(0, 500) : 'unknown error';
    this.trace.summary = _buildSummary(this.trace, {});
    _saveTrace(this.trace);
  }
}

function _buildSummary(trace, result) {
  const s = {
    totalDurationMs: trace.finishedAt ? (new Date(trace.finishedAt).getTime() - new Date(trace.startedAt).getTime()) : null,
    roundCount: trace.rounds.length,
    finalContentLen: result && result.content ? String(result.content).length : 0,
    finishReason: (result && result.finishReason) || null,
    toolCallCount: 0,
    tokens: { prompt: 0, completion: 0, total: 0 },
    toolStats: {},      // tool → { calls, errors, totalMs }
    noteStats: {},      // type → count
    maxLLMRoundMs: 0,
    avgLLMRoundMs: 0,
  };
  let llmMsSum = 0;
  for (const r of trace.rounds) {
    if (r.llm) {
      if (r.llm.usage) {
        // 兼容 snake_case (openai) / camelCase (deepseek 等) 两种 usage 字段名
        const u = r.llm.usage;
        const p = u.prompt_tokens || u.input_tokens || u.promptTokens || 0;
        const c = u.completion_tokens || u.output_tokens || u.completionTokens || 0;
        s.tokens.prompt += p;
        s.tokens.completion += c;
        s.tokens.total += (u.total_tokens || u.totalTokens || 0) || (p + c);
      }
      const rd = r.llm.durationMs || 0;
      if (rd > s.maxLLMRoundMs) s.maxLLMRoundMs = rd;
      llmMsSum += rd;
    }
    for (const tc of r.toolCalls) {
      s.toolCallCount++;
      const st = s.toolStats[tc.tool] || (s.toolStats[tc.tool] = { calls: 0, errors: 0, totalMs: 0 });
      st.calls++;
      if (tc.error) st.errors++;
      st.totalMs += tc.durationMs || 0;
    }
    for (const n of r.notes) s.noteStats[n.type] = (s.noteStats[n.type] || 0) + 1;
  }
  for (const n of trace.notes) s.noteStats[n.type] = (s.noteStats[n.type] || 0) + 1;
  s.avgLLMRoundMs = trace.rounds.length ? Math.round(llmMsSum / trace.rounds.length) : 0;
  return s;
}

// ─────────────────────────── 读取 / 列表 / 删除 ───────────────────────────

function listTraces(limit) {
  const meta = _readMeta();
  meta.sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
  return meta.slice(0, limit || LIST_LIMIT).map(m => {
    let size = 0;
    try { size = fs.statSync(path.join(TRACE_DIR, m.id + '.json')).size; } catch (e) { /* */ }
    return { ...m, size };
  });
}

function getTrace(id) {
  const file = path.join(TRACE_DIR, id + '.json');
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

function deleteTrace(id) {
  const file = path.join(TRACE_DIR, id + '.json');
  if (fs.existsSync(file)) fs.unlinkSync(file);
  _writeMeta(_readMeta().filter(m => m.id !== id));
}

// ─────────────────────────── HTML 报告 ───────────────────────────

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtMs(ms) {
  if (ms == null) return '-';
  if (ms < 1000) return ms + ' ms';
  return (ms / 1000).toFixed(1) + ' s';
}

function fmtTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { hour12: false });
}

function renderMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) return '<div class="muted">（无消息）</div>';
  const roleNames = { system: '系统', user: '用户', assistant: 'AI', tool: '工具结果' };
  const parts = messages.map((m, i) => {
    const role = roleNames[m.role] || m.role;
    let body = '';
    if (typeof m.content === 'string') {
      body = '<pre class="msg-content">' + esc(m.content) + '</pre>';
    } else if (Array.isArray(m.content)) {
      const blocks = m.content.map(b => {
        if (b && b.type === 'image') return '<div class="muted">[图片内容]</div>';
        if (b && b.type === 'tool_use') return '<pre class="msg-content">[tool_use] ' + esc(JSON.stringify(b, null, 2)) + '</pre>';
        return '<pre class="msg-content">' + esc(b && b.text != null ? b.text : JSON.stringify(b)) + '</pre>';
      });
      body = blocks.join('');
    } else if (m.tool_calls) {
      const calls = m.tool_calls.map(tc => {
        const fn = tc.function || tc;
        return '<pre class="msg-content">tool_call → ' + esc(fn.name || tc.name) + '\n' + esc(fn.arguments || JSON.stringify(tc.args || {})) + '</pre>';
      });
      body = calls.join('');
    } else {
      body = '<div class="muted">（空）</div>';
    }
    return '<div class="msg role-' + esc(m.role) + '"><span class="msg-role">[' + esc(role) + ']</span>' + body + '</div>';
  });
  return parts.join('');
}

const NOTE_LABELS = {
  budget_alert: '预算提醒',
  web_search_force_stop: 'web_search 强制终止',
  empty_content: '空内容重试',
  empty_content_give_up: '空内容放弃',
  stall: 'STALL 装睡检测',
  user_steer_sleeping: 'USER-STEER 装睡',
  residual_tool_tag: '残留工具标签',
  first_round_no_tool: '首轮未调工具',
  force_final_prompt: '连续不调工具',
  promise_no_call: '承诺-不调',
  parallel_tool_failed: '并行工具失败',
};

function renderNotes(notes) {
  if (!notes || !notes.length) return '';
  return notes.map(n => {
    const label = NOTE_LABELS[n.type] || n.type;
    return '<div class="note">⚠️ <b>' + esc(label) + '</b> ' + esc(n.summary) + '</div>';
  }).join('');
}

function renderToolCalls(toolCalls) {
  if (!toolCalls || !toolCalls.length) return '';
  return toolCalls.map(tc => {
    const status = tc.error
      ? '<span class="badge err">✗ ' + esc(tc.error) + '</span>'
      : '<span class="badge ok">✓</span>';
    const args = '<pre class="msg-content">' + esc(JSON.stringify(tc.args || {}, null, 2)) + '</pre>';
    const result = tc.result != null
      ? '<div class="tool-result"><span class="msg-role">[结果]</span><pre class="msg-content">' + esc(typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2)) + '</pre></div>'
      : '';
    return '<div class="tool-call">🔧 <b>' + esc(tc.tool) + '</b> ' + status + ' <span class="muted">' + fmtMs(tc.durationMs) + '</span>'
      + args + result + '</div>';
  }).join('');
}

function renderRound(r, maxMs) {
  const llmBlock = r.llm
    ? (function () {
        const u = r.llm.usage || {};
        const pTok = u.prompt_tokens || u.input_tokens || u.promptTokens || 0;
        const cTok = u.completion_tokens || u.output_tokens || u.completionTokens || 0;
        const usage = r.llm.usage ? ' · 💬 ' + pTok + '/' + cTok + ' tok' : '';
        const calls = (r.llm.toolCalls && r.llm.toolCalls.length)
          ? '<div class="llm-calls"><span class="msg-role">[tool_calls]</span><pre class="msg-content">' + esc(JSON.stringify(r.llm.toolCalls.map(t => ({ name: t.name, args: t.args })), null, 2)) + '</pre></div>'
          : '';
        return '<div class="llm-resp"><span class="msg-role">[LLM 返回]</span> <span class="muted">finish=' + esc(r.llm.finishReason || 'n/a') + usage + '</span>'
          + '<pre class="msg-content">' + esc(r.llm.content || '(空)') + '</pre>' + calls + '</div>';
      })()
    : '<div class="muted">（本轮无 LLM 响应）</div>';

  const notesHtml = renderNotes(r.notes);
  const toolsHtml = renderToolCalls(r.toolCalls);

  return '<details class="round" open>'
    + '<summary><b>Round ' + r.round + '</b> <span class="muted">' + fmtMs(r.durationMs) + '</span>'
    + (r.notes.length ? ' <span class="badge warn">⚠️ ' + r.notes.length + ' 事件</span>' : '')
    + (r.toolCalls.length ? ' <span class="badge">🔧 ' + r.toolCalls.length + '</span>' : '')
    + '</summary>'
    + '<div class="round-body">'
    + '<h4>📤 发送给模型的 messages（' + (r.messagesSnapshot ? r.messagesSnapshot.length : 0) + ' 条）</h4>'
    + renderMessages(r.messagesSnapshot)
    + '<h4>📥 LLM 响应</h4>' + llmBlock
    + (toolsHtml ? '<h4>🔧 工具调用</h4>' + toolsHtml : '')
    + (notesHtml ? '<h4>⚠️ 系统事件</h4>' + notesHtml : '')
    + '</div></details>';
}

/**
 * 生成自包含 HTML 报告
 * @param {object} trace
 * @returns {string}
 */
function renderHtml(trace) {
  // 报告总是用最新逻辑重算 summary（旧文件里的 summary 快照可能字段不兼容）
  const s = _buildSummary(trace, { finishReason: (trace.summary && trace.summary.finishReason) || null });
  const maxMs = Math.max(s.maxLLMRoundMs || 1, 1);

  // 轮次耗时条形图（纯 CSS）
  const bars = trace.rounds.map(r => {
    const w = Math.max(2, Math.round(((r.durationMs || 0) / maxMs) * 100));
    return '<div class="bar-row" title="Round ' + r.round + ' ' + fmtMs(r.durationMs) + '">'
      + '<span class="bar-label">R' + r.round + '</span>'
      + '<div class="bar-track"><div class="bar" style="width:' + w + '%"></div></div>'
      + '<span class="bar-ms">' + fmtMs(r.durationMs) + '</span></div>';
  }).join('');

  // 工具统计表
  const toolRows = Object.keys(s.toolStats).sort((a, b) => s.toolStats[b].calls - s.toolStats[a].calls)
    .map(t => {
      const st = s.toolStats[t];
      const avg = st.calls ? Math.round(st.totalMs / st.calls) : 0;
      return '<tr><td>' + esc(t) + '</td><td>' + st.calls + '</td><td>' + st.errors + '</td><td>' + fmtMs(avg) + '</td></tr>';
    }).join('') || '<tr><td colspan="4" class="muted">（无工具调用）</td></tr>';

  // 事件统计
  const noteRows = Object.keys(s.noteStats).map(t => {
    const label = NOTE_LABELS[t] || t;
    return '<span class="badge warn">' + esc(label) + ' × ' + s.noteStats[t] + '</span>';
  }).join(' ') || '<span class="muted">无</span>';

  const ctx = trace.context || {};
  const ctxStr = [
    ctx.taskId ? '任务: ' + esc(ctx.taskId) : '',
    ctx.reqId ? '会话: ' + esc(ctx.reqId) : '',
    ctx.caller ? '调用方: ' + esc(ctx.caller) : '',
    ctx.actionMode ? '模式: ' + esc(ctx.actionMode) : '',
  ].filter(Boolean).join(' · ');

  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">'
    + '<title>Agent 运行报告 ' + esc(trace.id) + '</title>'
    + '<style>'
    + 'body{font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;background:#16181f;color:#e8eaf0;margin:0;padding:24px;line-height:1.55}'
    + 'h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 12px;border-bottom:1px solid #2a2e3d;padding-bottom:8px}'
    + 'h3{font-size:14px;margin:16px 0 8px;color:#9aa3b8}h4{font-size:12px;margin:14px 0 6px;color:#7a8398;text-transform:uppercase;letter-spacing:.4px}'
    + '.meta{color:#9aa3b8;font-size:13px;margin-bottom:16px}'
    + '.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:16px 0}'
    + '.card{background:#1e222e;border:1px solid #2a2e3d;border-radius:10px;padding:12px 14px}'
    + '.card .num{font-size:20px;font-weight:700;color:#7cc4ff}.card .lbl{font-size:11px;color:#9aa3b8;margin-top:2px}'
    + '.card.warn .num{color:#ffb86c}.card.err .num{color:#ff6b6b}.card.ok .num{color:#4ecdc4}'
    + '.panel{background:#1e222e;border:1px solid #2a2e3d;border-radius:10px;padding:14px 16px;margin:10px 0}'
    + '.muted{color:#6b7280;font-size:12px}'
    + '.bar-row{display:flex;align-items:center;gap:8px;margin:3px 0}'
    + '.bar-label{width:34px;font-size:11px;color:#9aa3b8;text-align:right;flex:none}'
    + '.bar-track{flex:1;height:12px;background:#232736;border-radius:6px;overflow:hidden}'
    + '.bar{height:100%;background:linear-gradient(90deg,#3b82f6,#7cc4ff);border-radius:6px;min-width:2px}'
    + '.bar-ms{width:64px;font-size:11px;color:#9aa3b8;flex:none}'
    + 'table{width:100%;border-collapse:collapse;font-size:13px}'
    + 'th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #232736}th{color:#9aa3b8;font-weight:600;font-size:11px}'
    + 'details.round{background:#1e222e;border:1px solid #2a2e3d;border-radius:10px;margin:10px 0;overflow:hidden}'
    + 'details.round summary{cursor:pointer;padding:10px 14px;background:#222635;font-size:13px}'
    + 'details.round[open] summary{border-bottom:1px solid #2a2e3d}'
    + '.round-body{padding:12px 14px}'
    + '.msg{border-left:3px solid #3b82f6;margin:6px 0;padding:4px 10px;background:#1a1e2a;border-radius:0 6px 6px 0}'
    + '.msg.role-system{border-color:#8b5cf6}.msg.role-user{border-color:#3b82f6}.msg.role-assistant{border-color:#4ecdc4}.msg.role-tool{border-color:#f59e0b}'
    + '.msg-role{font-size:11px;color:#7a8398;margin-right:6px}'
    + 'pre.msg-content{white-space:pre-wrap;word-break:break-word;margin:4px 0 2px;font-size:12px;color:#c9d1e0;font-family:ui-monospace,Consolas,monospace;max-height:420px;overflow:auto}'
    + '.tool-call{background:#232736;border:1px solid #2a2e3d;border-radius:8px;padding:8px 10px;margin:6px 0}'
    + '.tool-result{margin-top:6px}'
    + '.llm-resp{margin-top:6px}'
    + '.note{background:#3a2d1a;border:1px solid #5c451f;border-radius:8px;padding:6px 10px;margin:6px 0;font-size:12px;color:#ffd9a0}'
    + '.badge{display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;background:#2a2e3d;color:#9aa3b8;margin-left:6px}'
    + '.badge.ok{background:#14352e;color:#4ecdc4}.badge.err{background:#3d1f22;color:#ff6b6b}.badge.warn{background:#3d2f16;color:#ffb86c}'
    + '.status-completed{color:#4ecdc4}.status-failed{color:#ff6b6b}.status-running{color:#ffb86c}'
    + '</style></head><body>'
    + '<h1>🤖 Agent 运行报告</h1>'
    + '<div class="meta">' + esc(trace.id) + ' · ' + fmtTime(trace.startedAt) + (trace.finishedAt ? ' → ' + fmtTime(trace.finishedAt) : '')
    + ' · 状态 <span class="status-' + esc(trace.status) + '">' + esc(trace.status) + '</span>'
    + (ctxStr ? ' · ' + ctxStr : '') + '</div>'
    + (trace.error ? '<div class="note">❌ 失败原因: ' + esc(trace.error) + '</div>' : '')

    + '<div class="cards">'
    + '<div class="card"><div class="num">' + s.roundCount + '</div><div class="lbl">LLM 轮次</div></div>'
    + '<div class="card"><div class="num">' + s.toolCallCount + '</div><div class="lbl">工具调用</div></div>'
    + '<div class="card"><div class="num">' + fmtMs(s.totalDurationMs) + '</div><div class="lbl">总耗时</div></div>'
    + '<div class="card warn"><div class="num">' + (s.tokens.total || 0).toLocaleString() + '</div><div class="lbl">总 token（入 ' + (s.tokens.prompt || 0).toLocaleString() + ' / 出 ' + (s.tokens.completion || 0).toLocaleString() + '）</div></div>'
    + '<div class="card"><div class="num">' + fmtMs(s.avgLLMRoundMs) + '</div><div class="lbl">平均 LLM 耗时/轮</div></div>'
    + (s.finishReason ? '<div class="card"><div class="num" style="font-size:14px">' + esc(s.finishReason) + '</div><div class="lbl">finish reason</div></div>' : '')
    + '</div>'

    + '<h2>📊 效率指标</h2>'
    + '<div class="panel"><h4>每轮耗时（LLM 调用 + 工具执行，最大 ' + fmtMs(maxMs) + '）</h4>' + bars + '</div>'
    + '<div class="panel"><h4>工具调用统计</h4><table><tr><th>工具</th><th>次数</th><th>失败</th><th>平均耗时</th></tr>' + toolRows + '</table></div>'
    + '<div class="panel"><h4>系统事件（效率杀手）</h4>' + noteRows + '</div>'

    + '<h2>📜 逐轮详情</h2>'
    + trace.rounds.map(r => renderRound(r, maxMs)).join('')
    + '</body></html>';
}

module.exports = {
  isTraceEnabled,
  setTraceEnabled,
  getConfig,
  startTrace,
  cloneMessages,
  listTraces,
  getTrace,
  deleteTrace,
  renderHtml,
  TRACE_DIR,
};
