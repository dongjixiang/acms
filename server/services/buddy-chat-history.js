// Agent Buddy Chat History Service — v0.79
// 持久化聊天历史 + 自动摘要压缩

const { collection } = require('../db/connection');

const HISTORY_KEY_PREFIX = 'chat_history:';
const SUMMARY_KEY_PREFIX = 'chat_summary:';
const MAX_RAW_MESSAGES = 50;  // 保留最近 50 条原始消息
const SUMMARY_INTERVAL = 10;  // 每 10 轮对话生成一次摘要
const MAX_HISTORY_TTL_HOURS = 72; // 72 小时前的消息可被压缩

// ─── 存储消息 ───
function appendMessage(userId, role, text, meta = {}) {
  if (!userId) return null;
  // v0.79: 拒绝空消息 — 否则会污染 history 导致上游 API 报 "No user query found in messages"
  const textStr = text == null ? '' : String(text);
  if (!textStr.trim()) return null;

  const now = new Date().toISOString();
  const msg = {
    id: Date.now() + Math.random(),
    user_id: userId,
    role,
    text: textStr.slice(0, 500), // 限制长度
    ts: now,
    ...meta
  };
  
  try {
    const { collection } = require('../db/connection');
    // 存储到 buddy_memory 的 chat_history 键（数组形式）
    const mem = collection('buddy_memory').findOne(m => m.user_id === userId && m.key === HISTORY_KEY_PREFIX + userId);
    let messages = [];
    if (mem && mem.value) {
      try { messages = JSON.parse(typeof mem.value === 'string' ? mem.value : JSON.stringify(mem.value)); } catch(e) {}
    }
    
    messages.push(msg);
    // 只保留最近 MAX_RAW_MESSAGES 条
    if (messages.length > MAX_RAW_MESSAGES) {
      messages = messages.slice(-MAX_RAW_MESSAGES);
    }
    
    if (mem) {
      collection('buddy_memory').update(
        m => m.user_id === userId && m.key === HISTORY_KEY_PREFIX + userId,
        { value: JSON.stringify(messages), updated_at: now }
      );
    } else {
      collection('buddy_memory').insert({
        user_id: userId,
        key: HISTORY_KEY_PREFIX + userId,
        value: JSON.stringify(messages),
        updated_at: now
      });
    }
    
    return msg;
  } catch (e) {
    console.warn('[buddy-history] appendMessage 失败:', e.message);
    return null;
  }
}

// ─── 读取历史消息 ───
function getHistory(userId, limit = 20) {
  if (!userId) return [];

  try {
    const { collection } = require('../db/connection');
    const mem = collection('buddy_memory').findOne(m => m.user_id === userId && m.key === HISTORY_KEY_PREFIX + userId);
    if (!mem || !mem.value) return [];

    let messages = [];
    try { messages = JSON.parse(typeof mem.value === 'string' ? mem.value : JSON.stringify(mem.value)); } catch(e) {}

    // v0.79: 过滤掉空 text 的脏数据（之前没校验污染了 history）
    messages = (messages || []).filter(m => m && m.text && String(m.text).trim());
    return messages.slice(-limit);
  } catch (e) {
    console.warn('[buddy-history] getHistory 失败:', e.message);
    return [];
  }
}

// ─── 读取历史摘要 ───
function getSummary(userId) {
  if (!userId) return null;
  
  try {
    const { collection } = require('../db/connection');
    const mem = collection('buddy_memory').findOne(m => m.user_id === userId && m.key === SUMMARY_KEY_PREFIX + userId);
    if (!mem || !mem.value) return null;
    
    try { return JSON.parse(typeof mem.value === 'string' ? mem.value : JSON.stringify(mem.value)); }
    catch(e) { return null; }
  } catch (e) {
    console.warn('[buddy-history] getSummary 失败:', e.message);
    return null;
  }
}

// ─── 保存摘要 ───
function saveSummary(userId, summary) {
  if (!userId || !summary) return;
  
  try {
    const { collection } = require('../db/connection');
    const now = new Date().toISOString();
    const mem = collection('buddy_memory').findOne(m => m.user_id === userId && m.key === SUMMARY_KEY_PREFIX + userId);
    
    const summaryDoc = {
      text: summary.text,
      ts: summary.ts || now,
      messageCount: summary.messageCount || 0,
      topics: summary.topics || []
    };
    
    if (mem) {
      collection('buddy_memory').update(
        m => m.user_id === userId && m.key === SUMMARY_KEY_PREFIX + userId,
        { value: JSON.stringify(summaryDoc), updated_at: now }
      );
    } else {
      collection('buddy_memory').insert({
        user_id: userId,
        key: SUMMARY_KEY_PREFIX + userId,
        value: JSON.stringify(summaryDoc),
        updated_at: now
      });
    }
  } catch (e) {
    console.warn('[buddy-history] saveSummary 失败:', e.message);
  }
}

// ─── 检查是否需要生成摘要 ───
function shouldSummarize(userId) {
  const history = getHistory(userId, MAX_RAW_MESSAGES);
  if (history.length < SUMMARY_INTERVAL) return false;
  
  // 检查上次摘要时间
  const summary = getSummary(userId);
  if (summary) {
    const summaryTs = new Date(summary.ts).getTime();
    const now = Date.now();
    // 如果上次摘要在 30 分钟内，跳过
    if (now - summaryTs < 30 * 60 * 1000) return false;
  }
  
  return true;
}

// ─── 生成摘要 prompt ───
function buildSummaryPrompt(history) {
  const messages = history.slice(-20); // 最近 20 条
  const historyText = messages.map(m => {
    const role = m.role === 'user' ? '用户' : '小吉';
    return `${role}：${m.text}`;
  }).join('\n');
  
  return `请为以下对话生成简要摘要：

${historyText}

要求：
1. 提取 3-5 个关键话题（用逗号分隔）
2. 用 1-2 句话总结对话要点
3. 识别用户的意图和需求模式
4. 输出 JSON 格式：{"topics": ["话题1", "话题2"], "summary": "对话摘要", "messageCount": N}`;
}

// ─── 异步生成摘要（不阻塞主流程）──
async function generateSummary(userId, llmAdapter) {
  if (!shouldSummarize(userId)) return null;
  
  try {
    const history = getHistory(userId, MAX_RAW_MESSAGES);
    const prompt = buildSummaryPrompt(history);
    
    // 这里需要传入 LLM adapter，但由于循环依赖，我们返回 prompt 让调用方处理
    return { prompt, history };
  } catch (e) {
    console.warn('[buddy-history] generateSummary 失败:', e.message);
    return null;
  }
}

// ─── 清理过期摘要 ───
function cleanupExpired(userId) {
  const summary = getSummary(userId);
  if (!summary) return;
  
  const summaryTs = new Date(summary.ts).getTime();
  const now = Date.now();
  const expired = now - summaryTs > MAX_HISTORY_TTL_HOURS * 60 * 60 * 1000;
  
  if (expired) {
    try {
      const { collection } = require('../db/connection');
      collection('buddy_memory').remove(m => m.user_id === userId && m.key === SUMMARY_KEY_PREFIX + userId);
    } catch (e) {
      console.warn('[buddy-history] cleanupExpired 失败:', e.message);
    }
  }
}

module.exports = {
  appendMessage,
  getHistory,
  getSummary,
  saveSummary,
  shouldSummarize,
  buildSummaryPrompt,
  generateSummary,
  cleanupExpired,
  // 常量
  MAX_RAW_MESSAGES,
  SUMMARY_INTERVAL,
  MAX_HISTORY_TTL_HOURS
};
