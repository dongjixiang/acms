// 辅助工具自由对话端点（v0.61）
// POST /api/assist-free/detect
// 与 chat-intent 的 detect-and-respond 类似，但不依赖 requirement 上下文
//
// 设计：
//   - 单次对话（非多轮），用户说一句话，系统调对应 tool + 返回卡片
//   - 不需要 requirement 上下文（小吉和 assist-launcher 都能调）
//   - 返回 { reply, cards: [{ type, payload }] }
//     reply = LLM 的纯文本回复
//     cards = 工具执行结果转成的卡片数据（供 card-renderer.js 渲染）
//
// 调用方式：
//   POST /api/assist-free/detect
//   { text: "生成一张 FIFA 决赛宣传图" }
//   → { reply: "...", cards: [{ type: "image", payload: { url: "...", title: "..." } }] }
//
//   可选：method 字段预指定工具（如 { text: "...", method: "generate_image" }）
//   用于 assist-launcher 中已知工具类型的快捷入口

const express = require('express');
const router = express.Router();
const { callLLM } = require('../services/llm-adapter');
const { execute: runtimeExec } = require('../services/agent-runtime');
const modelStore = require('../stores/model-store');
const toolRegistry = require('../services/tool-registry');

// 自由对话支持的 tool（轻量版，不含 plan_execute / send_email 等需 requirement 上下文的）
const FREE_TOOL_NAMES = [
  'generate_image', 'play_music', 'play_video', 'agnes_generate_video',
  'web_search', 'web_research', 'fetch_url', 'get_current_time',
  'document_gen',
];

/**
 * 检测意图 —— 如果 method 已知则直接返回，否则 LLM 检测
 */
function detectIntent(text, method) {
  if (method && FREE_TOOL_NAMES.includes(method)) return method;
  if (!text) return null;
  const t = text.toLowerCase();
  if (/生成图片|画一张|画一个|做一张图|海报|封面/.test(t)) return 'generate_image';
  if (/搜索|查一下|调研|找资料/.test(t)) return 'web_search';
  if (/最新|赛况|新闻|综合|调研|对比/.test(t)) return 'web_research';
  if (/抓取|抓 URL|打开网页|fetch/.test(t)) return 'fetch_url';
  if (/播放|想听|找歌|放首歌|音乐|唱/.test(t)) return 'play_music';
  if (/生成视频|做视频|视频/.test(t)) return 'play_video';
  if (/生成文档|文档|Word|docx/.test(t)) return 'document_gen';
  if (/现在几点|今天日期|时间/.test(t)) return 'get_current_time';
  return null;
}

router.post('/detect', async (req, res) => {
  try {
    const { text, method } = req.body || {};
    if (!text) return res.status(400).json({ error: 'MISSING_TEXT' });

    const model = modelStore.getDefaultGenModel();
    if (!model) return res.status(503).json({ error: '模型未配置' });

    // 1. 检测意图
    const intent = detectIntent(text, method);
    if (!intent) {
      // 无匹配 tool → 走 LLM 对话回复
      const result = await callLLM(model.id, [
        { role: 'system', content: '你是 ACMS 辅助工具助手。用户说了一句不能直接用工具处理的话，请简短回复说明你可以做什么，或者反问ta具体需求。用中文，30-60字。' },
        { role: 'user', content: text },
      ], { maxTokens: 300, temperature: 0.7, caller: 'assist-free' });
      const reply = (typeof result === 'string' ? result : (result.content || '')) || '我还没理解你的意思，试试说"生成图片"、"搜索"、"播放音乐"？';
      return res.json({ reply: reply.trim(), cards: [] });
    }

    // 2. 拼 LLM messages（含自由对话 prompt + tool 可见）
    const systemPrompt = '你是 ACMS 辅助工具助手。用户通过辅助工具窗口向你提了一个请求。\n\n' +
      '你的任务是：\n' +
      '1. 判断用户想做什么，调对应的 tool\n' +
      '2. tool 完成后，给用户一句简洁的回复（15-40字）\n' +
      '3. 不需要在回复中重复工具结果细节——前端会自动展示结果卡片\n\n' +
      '可用工具：\n' +
      '- generate_image：生成图片\n' +
      '- play_music：播放/搜索音乐\n' +
      '- play_video：生成视频\n' +
      '- web_search：搜索信息\n' +
      '- web_research：综合调研（多源）\n' +
      '- fetch_url：抓取 URL\n' +
      '- document_gen：生成 Word 文档\n' +
      '- get_current_time：获取当前时间';

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ];

    // 3. 跑 runToolLoop（只用 FREE_TOOL_NAMES）
    const runtimeResult = await runtimeExec({
      modelId: model.id,
      messages,
      toolNames: FREE_TOOL_NAMES,
      maxRounds: 6,
      context: { reqId: 'assist-free:' + Date.now() },
      caller: 'assist-free',
    });

    const rawReply = runtimeResult.content || '好的，已处理完成。';
    const reply = rawReply.replace(/【[^】]+】/g, '').trim() || '好的，已处理完成。';

    // 4. 尝试从 LLM 回复中提取卡片标记
    //    格式：【card:type】\n{"payloadJson"}\n【endcard】
    let cards = [];
    var cardRegex = /【card:(\w+)】\s*([\s\S]*?)【endcard】/g;
    var match;
    while ((match = cardRegex.exec(rawReply)) !== null) {
      try {
        var payload = JSON.parse(match[2].trim());
        cards.push({ type: match[1], payload: payload });
      } catch (e) {
        // 解析失败则跳过
      }
    }

    // 如果 LLM 没写卡片标记但有 tool result，从 tool registry 拿最后的结果转卡片
    if (cards.length === 0 && result.toolCalls && result.toolCalls.length > 0) {
      var lastCall = result.toolCalls[result.toolCalls.length - 1];
      // 尝试从 tool result 推断卡片（需要 runToolLoop 返回 tool results）
      // 当前 runToolLoop 不返回 tool results——这是已知限制
      // LLM 的 final answer 是卡片的主要来源
    }

    res.json({ reply, cards });
  } catch (e) {
    console.error('[assist-free] 错误:', e);
    if (!res.headersSent) {
      res.json({ reply: '处理出错了，请稍后再试。', cards: [] });
    }
  }
});

module.exports = router;