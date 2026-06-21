// 聊天智能响应端点（v0.15，2026-06-21）
// POST /api/chat/detect-and-respond
// 自动判断用户消息需要：普通补充、URL 抓取、还是互联网搜索
//
// 检测规则：
//   含 URL → 走 fetch_url（现有逻辑）
//   含疑问词 + 实时性关键词 → 走 web_search + 摘要
//   其他 → 走普通 supplement（无需搜索）

const express = require('express');
const router = express.Router();
const reqStore = require('../stores/requirement-store');
const toolRegistry = require('../services/tool-registry');

// 需要搜索的实时性关键词
const SEARCH_TRIGGER_WORDS = [
  '最新', '现在', '今天', '当前', '近期', '最近', '近期有',
  '2026', '2025', '这个月', '今年', '本月',
  '发生了什么', '怎么回事', '是什么', '有什么',
  '有没有', '是不是', '为什么', '如何', '怎么',
];

// 不需要搜索的本地性关键词（只跟当前项目/需求相关）
const LOCAL_ONLY_WORDS = [
  '需求', '项目', '任务', '看板', '知识库',
  '这个功能', '这个设计', '这个需求', '这个项目',
];

/**
 * 判断消息是否需要搜索互联网
 */
function needsWebSearch(text) {
  if (!text || typeof text !== 'string') return false;

  // 含 URL 的不搜索（走 fetch_url）
  if (/https?:\/\/[^\s]+/.test(text)) return false;

  // 含本地性关键词 → 本地处理，不搜索
  if (LOCAL_ONLY_WORDS.some(w => text.includes(w))) return false;

  // 检查是否含疑问词 + 实时性关键词
  const hasTrigger = SEARCH_TRIGGER_WORDS.some(w => text.includes(w));
  const isQuestion = /[\?？]/.test(text) || /^(什么|如何|为什么|怎么|有没有|是不是|能否|是否)/.test(text.trim());

  return hasTrigger || isQuestion;
}

/**
 * 从文本中提取搜索关键词
 */
function extractSearchQuery(text) {
  // 去掉疑问词和标点
  let query = text
    .replace(/[\?？。，！、；：""''【】《》（）\s]+/g, ' ')
    .replace(/\b(请|帮我|帮我查|帮我查一下|查询|搜索|查找|我想知道|告诉我|请问|能不能|可否|麻烦)\b/g, '')
    .trim();

  // 如果太短就没意义
  if (query.length < 4) return text.replace(/[\?？。，！、；：""''【】《》（）]/g, ' ').trim();

  return query;
}

router.post('/detect-and-respond', async (req, res, next) => {
  try {
    const { reqId, text } = req.body;
    if (!reqId || !text) {
      return res.status(400).json({ error: 'MISSING_FIELDS' });
    }

    // 1. 写 user message
    appendChatEntry(reqId, {
      role: 'user', text, at: new Date().toISOString(),
    });

    // 2. 检测 URL
    const urls = extractUrls(text);
    if (urls.length > 0) {
      // 走 fetch_url 路径（现有逻辑）
      return await handleFetchUrl(req, res, reqId, text, urls);
    }

    // 3. 检测是否需要搜索
    let searched = false;
    if (needsWebSearch(text)) {
      const query = extractSearchQuery(text);
      console.log(`[detect-and-respond] ${reqId} 自动搜索: ${query}`);
      const searchResult = await toolRegistry.execute('web_search', { query, max_results: 5 });

      if (!searchResult.error && searchResult.results?.length > 0) {
        searched = true;

        // 写搜索结果到 supplement_history
        const searchEntry = {
          role: 'system',
          text: `🔍 搜索结果：${query}\n\n${searchResult.formatted || searchResult.results.map((r, i) => `${i + 1}. [${r.title}](${r.url})\n   ${(r.snippet || '').slice(0, 200)}`).join('\n\n')}`,
          at: new Date().toISOString(),
        };
        appendChatEntry(reqId, searchEntry);
      }
    }

    // 4. 触发 brief 重生（让 AI 看到搜索结果）
    const { runBriefJob } = require('../services/thinking-brief');
    setImmediate(() => {
      runBriefJob(reqId, { modelId: null })
        .catch(e => console.error(`[detect-and-respond] brief 重生失败:`, e.message));
    });

    res.json({
      ok: true,
      reqId,
      searched,
      briefRegen: true,
    });
  } catch (e) {
    next(e);
  }
});

// 写 supplement_history
function appendChatEntry(reqId, entry) {
  const req = reqStore.getById(reqId);
  if (!req) throw new Error(`需求不存在: ${reqId}`);
  let history = [];
  try { history = JSON.parse(req.supplement_history || '[]'); } catch (e) { /* 静默降级 */ }
  if (!Array.isArray(history)) history = [];
  history.push(entry);
  reqStore.update(reqId, { supplement_history: JSON.stringify(history) });
}

// 提取 URL
function extractUrls(text) {
  if (!text) return [];
  const matches = text.match(/https?:\/\/[^\s<>"'，。、；！？)\]]+/g) || [];
  return Array.from(new Set(matches));
}

// 处理 fetch_url（复用 chat-fetch.js 逻辑的简化版）
async function handleFetchUrl(req, res, reqId, text, urls) {
  const modelStore = require('../stores/model-store');
  const { callLLM } = require('../services/llm-adapter');
  const { runBriefJob } = require('../services/thinking-brief');

  const summaryModel = modelStore.getDefaultGenModel();
  const SUMMARY_MAX_CHARS = 2000;

  // 存旧 brief（防覆盖历史）
  const req0 = reqStore.getById(reqId);
  if (req0) {
    try {
      const oldBrief = JSON.parse(req0.thinking_brief || 'null');
      if (oldBrief && oldBrief.status === 'done') {
        const parts = {};
        if (oldBrief.opening && typeof oldBrief.opening === 'string' && oldBrief.opening.trim()) parts.opening = oldBrief.opening.trim();
        if (oldBrief.ai_understanding && typeof oldBrief.ai_understanding === 'string' && oldBrief.ai_understanding.trim()) parts.understanding = oldBrief.ai_understanding.trim();
        if (oldBrief.followup_question && typeof oldBrief.followup_question === 'string' && oldBrief.followup_question.trim()) parts.followup_question = oldBrief.followup_question.trim();
        if (Object.keys(parts).length > 0) {
          appendChatEntry(reqId, { role: 'assistant', ...parts, source: 'assistant_round', at: new Date().toISOString() });
        }
      }
    } catch (e) { /* 静默降级 */ }
  }

  const fetchResults = [];
  for (const url of urls) {
    let result;
    try {
      result = await toolRegistry.execute('fetch_url', { url });
    } catch (e) {
      result = { error: `tool 异常: ${e.message}` };
    }

    if (result.error) {
      const systemEntry = {
        role: 'system',
        text: `⚠️ URL 抓取失败：${url}\n原因：${result.error}`,
        at: new Date().toISOString(),
      };
      appendChatEntry(reqId, systemEntry);
      fetchResults.push({ url, ok: false, error: result.error, summary: '' });
    } else {
      const rawContent = result.content || '';
      const summary = await summarizeContent(summaryModel, url, result.title, rawContent, SUMMARY_MAX_CHARS);

      const systemEntry = {
        role: 'system',
        text: `📎 参考资料：${result.title || '(无标题)'}\nURL：${result.finalUrl || url}\n字数：${result.length}${result.truncated ? '（已截断）' : ''} · AI 摘要\n\n${summary}`,
        at: new Date().toISOString(),
      };
      appendChatEntry(reqId, systemEntry);
      fetchResults.push({ url, ok: true, title: result.title, length: result.length, truncated: result.truncated, summary });
    }
  }

  setImmediate(() => {
    runBriefJob(reqId, { modelId: null }).catch(e => console.error(`[detect-and-respond] brief 重生失败:`, e.message));
  });

  res.json({ ok: true, reqId, fetchResults, briefRegen: true });
}

// 调 LLM 做摘要
async function summarizeContent(model, url, title, content, maxChars) {
  if (!model || !content || content.length < 20) return content.slice(0, maxChars);
  const { callLLM } = require('../services/llm-adapter');
  const prompt = `你是一个信息整理助手。用户从以下网页抓取了内容，请提炼为不超过 ${maxChars} 字的摘要。

要求：
- 用 Markdown 格式输出（### 分节标题、**粗体**关键词、- 列表）
- 保留关键事实、数据、时间线、人物关系、具体结论
- 按逻辑组织：先概览（### 概述），再逐主题展开（### 主题名）
- 不要遗漏重要信息节点

网页标题：${title || '(无标题)'}
网页 URL：${url}

网页内容：
${content.slice(0, 5000)}

摘要：`;

  try {
    const resp = await callLLM(model.id, [
      { role: 'system', content: '你是一个专业的信息提炼助手。' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 4000, caller: 'url-summarize' });
    return (resp.content || '').trim().slice(0, maxChars) || content.slice(0, maxChars);
  } catch (e) {
    console.error(`[detect-and-respond] 摘要失败:`, e.message);
    return content.slice(0, maxChars);
  }
}

module.exports = router;
