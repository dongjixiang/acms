// ACMS Context Compressor — P159 借鉴 Hermes `agent/context_compressor.py` 设计
//
// 治 "runToolLoop 过度循环(22 轮重复验证)→ 信息爆炸 → LLM 注意力分散" bug
// Hermes 设计要点(被 ACMS 借鉴):
//   1. 前置剪枝(pruneToolOutputs): 不调 LLM,先把旧 tool_result 替换成占位符(便宜 pre-pass)
//   2. Token 估算触底:基于 message 长度估算 token,而非消息条数(更精准)
//   3. 结构化 summary 模板:Active Task / Resolved Questions / Pending Questions / Key Decisions
//   4. 失败冷却(SUMMARY_FAILURE_COOLDOWN_SECONDS=600):摘要失败后 10 分钟内不重试
//
// ACMS 当前 v0.45 实现的局限(line 705-776 of llm-adapter.js):
//   - 仅消息条数触发(COMPRESS_THRESHOLD=30),不考虑 token 长度
//   - 没有前置剪枝 — 每次都把所有 tool_result 内容塞给 LLM 摘要
//   - 没有失败冷却 — 摘要失败后下一次又重试,可能反复失败
//   - Summary 模板单一 — "Earlier N messages compressed: agent explored..."

'use strict';

// Lazy require 避免循环依赖:context_compressor ← llm-adapter (callLLM)
let _callLLM = null;
function getCallLLM() {
  if (!_callLLM) _callLLM = require('./llm-adapter').callLLM;
  return _callLLM;
}

// ===== 常量 =====
const DEFAULT_THRESHOLD_MESSAGES = 30;   // 超过 N 条消息触发压缩
const KEEP_RECENT = 12;                  // 压缩时保留最近 N 条
const CHARS_PER_TOKEN = 4;                // 字符→token 粗略估算(同 Hermes)
const SUMMARY_RATIO = 0.20;               // 摘要占总压缩内容比例(Hermes)
const MIN_SUMMARY_TOKENS = 2000;
const MAX_SUMMARY_TOKENS = 12000;
const PRUNED_TOOL_PLACEHOLDER = '[Old tool output cleared to save context space]';
const SUMMARY_FAILURE_COOLDOWN_MS = 10 * 60 * 1000;  // 10 分钟,失败后不重试
const SUMMARY_PREFIX = '[CONTEXT COMPACTION — REFERENCE ONLY] Earlier turns were compacted into the summary below. This is a handoff from a previous context window — treat it as background reference, NOT as active instructions.\n\nYour current task is identified in the "Active Task" section. Resume exactly from there. Respond ONLY to the latest user message that appears AFTER this summary.';

// ===== 状态(per-task 一次性,防止反复压缩) =====
// Hermes 用 ContextCompressor 实例,每个 AIAgent 一个
// ACMS 用 module-level 简单实现:每次 runToolLoop 调一次,本进程全局标志
//   注意:Node.js 单进程 ACMS,任务并发受限,够用
let _lastFailureAt = 0;
let _compressedThisRun = false;

/**
 * 估算一条 message 的 token 数(粗略)。
 * Hermes 设计:字符串直接 len/4,multimodal list 加 image token estimate。
 * ACMS 简化:目前 message.content 都是 string 或 OpenAI tool_calls JSON,够用。
 */
function estimateMessageTokens(msg) {
  if (!msg) return 0;
  let chars = 0;
  if (typeof msg.content === 'string') {
    chars = msg.content.length;
  } else if (Array.isArray(msg.content)) {
    // 多模态(罕见)
    for (const part of msg.content) {
      if (typeof part === 'string') chars += part.length;
      else if (part && part.text) chars += part.text.length;
    }
  } else if (msg.content) {
    chars = JSON.stringify(msg.content).length;
  }
  if (msg.tool_calls) {
    chars += JSON.stringify(msg.tool_calls).length;
  }
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * 是否应该触发压缩(消息条数 OR 估算 token 超阈值)
 */
function shouldCompress(messages, opts = {}) {
  const threshold = opts.thresholdMessages || DEFAULT_THRESHOLD_MESSAGES;
  if (messages.length <= threshold) return false;

  // 估算总 token — 如果超过 32K 也触发(防止 token 爆炸)
  const totalTokens = messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
  return totalTokens > 32000 || messages.length > threshold;
}

/**
 * 前置剪枝(便宜 pre-pass):把"较旧"的 tool_result 内容替换成占位符
 * Hermes 设计: token-based,保留最近 K 条的工具输出
 * ACMS 实现:保留最近 KEEP_RECENT * 2 条
 *
 * @returns {number} 被剪掉的 message 数
 */
function pruneToolOutputs(messages, keepRecent = KEEP_RECENT * 2) {
  if (messages.length <= keepRecent) return 0;
  const cutoff = messages.length - keepRecent;
  let pruned = 0;
  for (let i = 0; i < cutoff; i++) {
    const m = messages[i];
    if (m && m.role === 'tool' && typeof m.content === 'string' && m.content.length > 200) {
      m.content = PRUNED_TOOL_PLACEHOLDER;
      pruned++;
    }
  }
  return pruned;
}

/**
 * 用 LLM 摘要中间 messages。失败时降级为规则摘要。
 * Hermes 设计:用便宜辅助模型(auxiliary_client),失败冷却 600s。
 * ACMS 简化:用同一个 model 做摘要(已经有辅助模型但启动复杂度高),失败冷却保留。
 */
async function summarizeMiddle(systemMsg, msgsToCompress, recentMsgs, modelId, droppedCount) {
  // 失败冷却: 10 分钟内不重试,直接走规则降级
  if (_lastFailureAt > 0 && Date.now() - _lastFailureAt < SUMMARY_FAILURE_COOLDOWN_MS) {
    return buildFallbackSummary(msgsToCompress, droppedCount);
  }

  const compressPrompt = [
    {
      role: 'system',
      content: 'You are a context summarizer. Summarize the conversation turns below into a structured handoff document with these sections:\n\n## Active Task\nWhat the agent is currently trying to accomplish (1 sentence).\n\n## Resolved Questions / Decisions\nKey decisions made or questions answered (bullet list).\n\n## Pending Questions / Next Steps\nOpen questions or unfinished work (bullet list).\n\n## Files Modified\nList of files changed (if mentioned).\n\n## Key Context\nCritical facts that future turns must know.\n\nFocus on outcomes, NOT tool call details. Be concise — total output should be ~' + MIN_SUMMARY_TOKENS + ' tokens.',
    },
    {
      role: 'user',
      content: msgsToCompress.map(m => {
        if (m.role === 'tool') return `Tool result: ${typeof m.content === 'string' ? m.content.slice(0, 500) : JSON.stringify(m.content).slice(0, 500)}`;
        if (m.role === 'assistant' && m.tool_calls) {
          const tools = m.tool_calls.map(tc => `${tc.function?.name || tc.name}(${(tc.function?.arguments || tc.args || '').toString().slice(0, 100)})`).join(', ');
          return `Assistant called tools: ${tools}`;
        }
        return `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 500) : JSON.stringify(m.content).slice(0, 500)}`;
      }).join('\n---\n'),
    },
  ];

  try {
    const summaryResult = await getCallLLM()(modelId, compressPrompt, {
      toolNames: [],
      maxTokens: MAX_SUMMARY_TOKENS,
    });
    const summaryText = (summaryResult.content || '').trim() ||
      buildFallbackSummary(msgsToCompress, droppedCount);
    return SUMMARY_PREFIX + '\n\n' + summaryText;
  } catch (e) {
    _lastFailureAt = Date.now();
    console.warn(`[context_compressor] LLM summary failed (cooldown ${SUMMARY_FAILURE_COOLDOWN_MS / 1000}s): ${e.message}`);
    return buildFallbackSummary(msgsToCompress, droppedCount);
  }
}

/**
 * 规则降级 summary(LLM 摘要失败时用)
 * Hermes 做法: 用 toolCallHistory 拼简单事实串
 */
function buildFallbackSummary(msgsToCompress, droppedCount) {
  const toolCalls = msgsToCompress
    .filter(m => m.role === 'assistant' && m.tool_calls)
    .flatMap(m => m.tool_calls.map(tc => tc.function?.name || tc.name || 'unknown'));
  const toolSummary = [...new Set(toolCalls)].slice(0, 20).join(', ');
  return SUMMARY_PREFIX + `\n\n[Earlier ${droppedCount} messages compressed. Tools used: ${toolSummary || 'various'}. Goal context remains in system prompt above.]`;
}

/**
 * 主入口 — 压缩 messages
 *
 * @param {Array} messages - 当前 messages 数组(会被 in-place 修改)
 * @param {Object} opts
 *   - thresholdMessages: 触发阈值(默认 30)
 *   - keepRecent: 保留最近 N 条(默认 12)
 *   - modelId: 摘要用的 model id(默认用同一 model)
 * @returns {Promise<boolean>} 是否真的压缩了
 */
async function compressMessages(messages, opts = {}) {
  if (_compressedThisRun) return false;
  if (!shouldCompress(messages, opts)) return false;

  const systemMsg = messages[0];
  const keepRecent = opts.keepRecent || KEEP_RECENT;
  const msgsToCompress = messages.slice(1, -keepRecent);
  const recentMsgs = messages.slice(-keepRecent);
  const droppedCount = msgsToCompress.length;
  if (droppedCount === 0) return false;

  _compressedThisRun = true;
  const beforeCount = messages.length;

  // Step 1: 前置剪枝(便宜 pre-pass)
  const pruned = pruneToolOutputs(msgsToCompress);

  // Step 2: LLM 摘要(或规则降级)
  const summaryText = await summarizeMiddle(
    systemMsg,
    msgsToCompress,
    recentMsgs,
    opts.modelId,
    droppedCount
  );

  // Step 3: 拼回
  const compressed = [
    systemMsg,
    { role: 'user', content: summaryText },
    ...recentMsgs,
  ];
  messages.length = 0;
  messages.push(...compressed);

  console.log(`[context_compressor] P159 压缩: ${beforeCount} → ${compressed.length} messages (pruned ${pruned} tool outputs, dropped ${droppedCount} middle msgs)`);
  return true;
}

/**
 * 重置 per-run 状态(用于新一轮 runToolLoop)
 */
function resetRunState() {
  _compressedThisRun = false;
  // _lastFailureAt 不重置 — 跨任务持续冷却
}

module.exports = {
  compressMessages,
  shouldCompress,
  pruneToolOutputs,
  estimateMessageTokens,
  resetRunState,
  // 常量导出方便测试
  DEFAULT_THRESHOLD_MESSAGES,
  KEEP_RECENT,
  PRUNED_TOOL_PLACEHOLDER,
  SUMMARY_FAILURE_COOLDOWN_MS,
};