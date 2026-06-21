// 聊天 URL 抓取端点（v0.14，2026-06-21）
// POST /api/chat/send-with-fetch
// 模式 B「预搜注入」：客户端检测到 URL → 调本端点 → server 内部调 fetch_url tool
//   → LLM 提炼摘要 → 摘要入 chat 流 system message（不吃原始 5000 字）→ 触发 brief 重生
//
// v0.14.1（2026-06-21）：LLM 摘要代替原始内容塞 supplement_history
//   用户反馈：网页原始内容直接展示无意义，需要模型整理后才展示
//   动机：参考资料卡展示 AI 摘要（用户看到有价值信息）+ 省 brief 模型的 token

const express = require('express');
const router = express.Router();
const reqStore = require('../stores/requirement-store');
const toolRegistry = require('../services/tool-registry');
const modelStore = require('../stores/model-store');
const { callLLM } = require('../services/llm-adapter');
const { runBriefJob } = require('../services/thinking-brief');

const MAX_URLS_PER_MESSAGE = 5;  // 1 条消息最多抓 5 个 URL（防刷）
const SUMMARY_MAX_CHARS = 1000;   // AI 摘要最大字数（用户反馈 300 太精炼丢细节）

router.post('/send-with-fetch', async (req, res, next) => {
  try {
    const { reqId, text, urls } = req.body;
    if (!reqId || !text) {
      return res.status(400).json({ error: 'MISSING_FIELDS' });
    }
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'NO_URLS' });
    }
    if (urls.length > MAX_URLS_PER_MESSAGE) {
      return res.status(400).json({ error: 'TOO_MANY_URLS', max: MAX_URLS_PER_MESSAGE });
    }

    // 0. 拿默认模型做摘要
    const summaryModel = modelStore.getDefaultGenModel();

    // 1. 写 user message
    const userEntry = { role: 'user', text, at: new Date().toISOString() };
    appendChatEntry(reqId, userEntry);

    // 2. 逐 URL 调 fetch_url tool → LLM 摘要 → 写 system message
    const fetchResults = [];
    for (const url of urls) {
      let result;
      try {
        result = await toolRegistry.execute('fetch_url', { url });
      } catch (e) {
        result = { error: `tool 异常: ${e.message}` };
      }

      if (result.error) {
        // 失败也写 system message（让 AI 知道"用户给了 URL，但抓取失败"）
        const systemEntry = {
          role: 'system',
          text: `⚠️ URL 抓取失败：${url}\n原因：${result.error}`,
          at: new Date().toISOString(),
        };
        appendChatEntry(reqId, systemEntry);
        fetchResults.push({ url, ok: false, error: result.error, summary: '' });
      } else {
        // 成功：调 LLM 做摘要 → 写 system message（摘要代替原始内容）
        const rawContent = result.content || '';
        const summary = await summarizeContent(summaryModel, url, result.title, rawContent);

        const systemEntry = {
          role: 'system',
          text: `📎 参考资料：${result.title || '(无标题)'}\nURL：${result.finalUrl || url}\n字数：${result.length}${result.truncated ? '（已截断）' : ''} · AI 摘要\n\n${summary}`,
          at: new Date().toISOString(),
        };
        appendChatEntry(reqId, systemEntry);

        fetchResults.push({
          url,
          ok: true,
          title: result.title,
          length: result.length,
          truncated: result.truncated,
          summary,
        });
      }
    }

    // 3. 触发 brief 重生（fire-and-forget，不阻塞响应）
    //    让 AI 看到最新的 chat 流（含 AI 摘要）后生成新 brief
    setImmediate(() => {
      runBriefJob(reqId, { modelId: null })
        .catch(e => console.error(`[send-with-fetch] brief 重生失败:`, e.message));
    });

    res.json({
      ok: true,
      reqId,
      fetchResults,
      briefRegen: true,
    });
  } catch (e) {
    next(e);
  }
});

/**
 * 调 LLM 做网页内容摘要
 * @param {object|null} model - 模型对象（getDefaultGenModel 返回值），null = 跳过摘要
 * @param {string} url
 * @param {string} title
 * @param {string} content - 原始内容（已截断 ≤5000 字）
 * @returns {Promise<string>} 摘要文本，失败时返回原始内容的前 200 字
 */
async function summarizeContent(model, url, title, content) {
  if (!model || !content || content.length < 20) {
    // 内容太短不需要摘要，或没有可用模型
    return content.slice(0, SUMMARY_MAX_CHARS);
  }

  const prompt = `你是一个信息整理助手。用户从以下网页抓取了内容，请提炼为不超过 ${SUMMARY_MAX_CHARS} 字的摘要。

要求：
- 保留关键事实、数据、时间线、人物关系、具体结论
- 按逻辑组织：先概述核心内容，再展开关键细节
- 不要遗漏重要信息节点
- 不要添加评价或开头语（"以下是摘要"等），直接输出摘要内容

网页标题：${title || '(无标题)'}
网页 URL：${url}

网页内容：
${content.slice(0, 5000)}

摘要：`;

  try {
    const resp = await callLLM(model.id, [
      { role: 'system', content: '你是一个专业的信息提炼助手，输出简洁、准确。' },
      { role: 'user', content: prompt },
    ], {
      temperature: 0.3,
      maxTokens: 2000,
      caller: 'url-summarize',
    });

    const summary = (resp.content || '').trim();
    if (!summary) return content.slice(0, SUMMARY_MAX_CHARS);

    // 限制摘要长度
    return summary.length > SUMMARY_MAX_CHARS
      ? summary.slice(0, SUMMARY_MAX_CHARS - 3) + '...'
      : summary;
  } catch (e) {
    console.error(`[send-with-fetch] 摘要失败 (${url}):`, e.message);
    // 降级：返回原始内容前 200 字
    return content.slice(0, SUMMARY_MAX_CHARS);
  }
}

// 写 chat history entry 到 supplement_history JSON
function appendChatEntry(reqId, entry) {
  const req = reqStore.getById(reqId);
  if (!req) throw new Error(`需求不存在: ${reqId}`);
  let history = [];
  try { history = JSON.parse(req.supplement_history || '[]'); } catch (e) { /* 静默降级 */ }
  if (!Array.isArray(history)) history = [];
  history.push(entry);
  reqStore.update(reqId, { supplement_history: JSON.stringify(history) });
}

module.exports = router;
