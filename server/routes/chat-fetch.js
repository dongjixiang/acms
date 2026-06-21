// 聊天 URL 抓取端点（v0.14，2026-06-21）
// POST /api/chat/send-with-fetch
// 模式 B「预搜注入」：客户端检测到 URL → 调本端点 → server 内部调 fetch_url tool
//   → 抓取结果入 chat 流 system message → 触发 brief 重生
//   → 客户端拿到整理后的 chat 流（含参考资料）

const express = require('express');
const router = express.Router();
const reqStore = require('../stores/requirement-store');
const toolRegistry = require('../services/tool-registry');
const { runBriefJob } = require('../services/thinking-brief');
const auth = require('../middleware/auth');

const MAX_URLS_PER_MESSAGE = 5;  // 1 条消息最多抓 5 个 URL（防刷）

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

    // 1. 写 user message
    const userEntry = { role: 'user', text, at: new Date().toISOString() };
    appendChatEntry(reqId, userEntry);

    // 2. 逐 URL 调 fetch_url tool，写 system message
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
        fetchResults.push({ url, ok: false, error: result.error });
      } else {
        // 成功：写 system message（含标题 + 正文摘要）
        const systemEntry = {
          role: 'system',
          text: `📎 参考资料：${result.title || '(无标题)'}\nURL：${result.finalUrl || url}\n字数：${result.length}${result.truncated ? '（已截断）' : ''}\n\n${result.content}`,
          at: new Date().toISOString(),
        };
        appendChatEntry(reqId, systemEntry);
        fetchResults.push({
          url,
          ok: true,
          title: result.title,
          length: result.length,
          truncated: result.truncated,
        });
      }
    }

    // 3. 触发 brief 重生（fire-and-forget，不阻塞响应）
    //    让 AI 看到最新的 chat 流（含参考资料）后生成新 brief
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
