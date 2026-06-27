// 聊天智能响应端点（v0.16，2026-06-26）
// POST /api/chat/detect-and-respond
// v0.16：LLM tool-loop 自主判断工具调用，替代 v0.15 关键词硬匹配
//
// 流程：
//   含 URL → 走 fetch_url（现有 handleFetchUrl）
//   无 URL → 调 runToolLoop，LLM 看着 4 个外部 tool descriptions 自主决定
//           - 不调 tool → LLM 直接回复
//           - 调 tool → tool result 写 system → LLM 整理回复

const express = require('express');
const router = express.Router();
const reqStore = require('../stores/requirement-store');
const toolRegistry = require('../services/tool-registry');
const { runToolLoop } = require('../services/llm-adapter');
const modelStore = require('../stores/model-store');

// v0.20：本场景给 LLM 看的 8 个外部 tool
//   4 个信息类（v0.16）+ 1 个视频生成（v0.18）+ 3 个休闲娱乐（v0.20：play_music / play_video / generate_image）
const INTENT_TOOL_NAMES = [
  'web_search', 'web_research', 'fetch_url', 'get_current_time',  // 信息类
  'agnes_generate_video',  // 视频生成（v0.18 直接调 Agnes API）
  'play_music',           // 音乐播放（v0.20 触发 music assist）
  'play_video',           // 视频生成（v0.20 触发 video assist，自动从用户消息提取 prompt）
  'generate_image',       // 图片生成（v0.20 触发 image-gen assist，自动从用户消息提取 prompt）
];

// v0.16：chat-intent 阶段 LLM 看到的 system prompt（clarify 模式）
// 核心：「一放一收」—— 默认不调 tool，只有显式外部信息需求才调
function buildIntentSystemPrompt(req) {
  return `你是 ACMS 需求澄清对话助手。当前用户正在讨论需求：

# 需求上下文
- 标题：${req.title || '(空)'}
- 描述：${(req.description || '').slice(0, 500) || '(空)'}
- 状态：${req.status || 'idea'} / 阶段：${req.phase || '孵化'}

# 任务
用户在需求澄清场景中跟你对话。你需要根据他的消息和当前需求上下文，给出简洁（200-500 字）Markdown 格式的回复。

# 工具使用规则（严格遵守）
你**仅**在以下情况才调用工具；其他情况**直接回复**，不调用任何工具：

1. **web_research / web_search**（联网调研）：
   - 用户**显式**询问最新/实时/2026 事件、趋势、市场数据（如"最近 2026 世界杯排名"、"现在 AI 行业怎么样"）
   - 用户**显式**要求对比/调研多个产品或方案（如"对比钉钉和企业微信"、"调研 SaaS 行业头部厂商"）
   - **严禁**因为用户提到日常词（想听/想看/想找/推荐/帮我/搜索等）就触发
   - **严禁**用户描述产品功能/场景/用户故事时触发

2. **fetch_url**（抓 URL）：
   - 仅当用户消息包含完整 http:// 或 https:// 链接时使用

3. **get_current_time**（当前时间）：
   - 仅当用户**显式**询问"现在几点/今天日期"时使用

4. **agnes_generate_video**（AI 视频生成 — Agnes V2.0 直调 API）：
   - 当用户**显式**要求生成视频且希望**精确控制参数**时使用（如 num_frames/frame_rate/seed）
   - 参数：prompt（描述画面）、num_frames（帧数，默认121 ≈ 5s@24fps）、frame_rate（帧率）
   - 约 2 秒视频：num_frames=49, frame_rate=24；约 3 秒：num_frames=81, frame_rate=24
   - 创建任务是异步的，返回 video_id。告诉用户任务已提交，他们会追问进度

5. **play_music**（音乐播放 — v0.20）：
   - 当用户**显式**表达想听某首歌时使用（如"想听 X""播放 X""找一首 X""搜 X 歌""放 X 歌"）
   - 必须从用户消息中提取 song（必填），artist（可选，从对话历史推断）
   - **常见触发**："想听 程响 的 可能" → song="程响 的 可能"（注意"可能"是语气词，要去掉）
   - 触发后用户 10-30 秒内看到播放卡片（系统后台异步执行）
   - **严禁**：用户描述"功能里有音乐元素"或"我想做一个音乐 APP"时调用（这是需求澄清，不是想听歌）

6. **play_video**（视频生成 — v0.20，触发 video assist）：
   - 当用户**显式**想生成视频但**未指定精确参数**时使用（如"帮我生成一个 X 视频""做一个 X 演示"）
   - 必须从用户消息中提取 prompt（视频描述，必填）
   - 与 agnes_generate_video 的区别：本工具走 video assist 流程（更友好 UI）；agnes_generate_video 走直 API（精确控制）
   - 触发后 60-300 秒内看到视频卡片

7. **generate_image**（图片生成 — v0.20，触发 image-gen assist）：
   - 当用户**显式**想生成图片时使用（如"生成图片 X""画一张 X""画一个 X"）
   - 必须从用户消息中提取 prompt（图片描述，必填）
   - 触发后 10-60 秒内看到图片卡片

# 默认行为
- 用户大概率是描述产品功能/场景/用户故事（90%+ 情况）
- 用户也可能在回答 AI 之前的追问、确认理解、补充细节
- 这些情况**都不需要外部信息或休闲娱乐**，直接基于需求上下文和对话历史回复

# 回复要求
- 用 Markdown（### 标题、**粗体**、- 列表）
- 简洁 200-500 字，直接回应用户
- 不要重复读需求标题/描述（用户已经知道）
- 如果信息不足就反问`;
}

// v0.18：chat-mode=free 时的 LLM prompt — 通用对话 + 附件总结（用户场景：上传文件让 LLM 总结）
// 区别于 clarify：基于附件/参考资料直接回答，不追问澄清需求
function buildFreeChatSystemPrompt(req) {
  return `你是 ACMS 通用对话助手。当前用户正在与你自由对话，可能基于附件/参考资料提问、让你总结内容、解读资料、对比方案。

# 需求上下文（仅作背景，不要当成对话主线）
- 标题：${req.title || '(空)'}
- 描述：${(req.description || '').slice(0, 200) || '(空)'}
- 状态：${req.status || 'idea'} / 阶段：${req.phase || '孵化'}

# 任务
用户正在「自由对话」模式下与你交流——**不是澄清需求**，而是希望你帮他处理具体信息。优先基于附件/参考资料/对话历史回答。

# 工具使用规则（与 clarify 模式一致）
你**仅**在以下情况才调用工具；其他情况**直接回复**：

1. **web_research / web_search**（联网调研）：用户**显式**询问最新/实时信息或要求对比/调研多个产品
2. **fetch_url**：仅当用户消息包含完整 http:// 或 https:// 链接
3. **get_current_time**：仅当用户**显式**询问"现在几点/今天日期"
4. **agnes_generate_video**：用户**显式**要求生成视频且希望精确控制参数（num_frames/frame_rate/seed）时使用，约 2 秒用 num_frames=49
5. **play_music**（v0.20）：用户**显式**想听某首歌时调用（如"想听 X""播放 X""找一首 X"），从消息提取 song（必填）+ artist（可选）
6. **play_video**（v0.20）：用户**显式**想生成视频但未指定精确参数时调用，提取 prompt
7. **generate_image**（v0.20）：用户**显式**想生成图片时调用（"画一张 X""生成 X 图片"），提取 prompt

# 默认行为
- 用户大概率是想让你总结附件、解读资料、对比方案、或回答具体问题
- 看到附件（用户消息里以 [文件名] 或 📎 开头的部分）→ **直接基于附件内容回答**
- 不要追问"你想要什么功能"——这是澄清场景的逻辑，不适用于自由对话
- 不要建议"我们换个方式讨论"——除非用户明确表示想整理需求

# 回复要求
- Markdown 格式（### 标题、**粗体**、- 列表）
- 长度 200-800 字（比澄清 prompt 略长，方便总结）
- 信息不足直接说"附件里没看到 X 信息"或"还需要补充 Y"，不要反问澄清需求
- 不要重复读需求标题/描述（用户已经知道，那只是背景）`;
}

// v0.18：按 req.chat_mode 选 system prompt（外部调用入口）
function pickIntentSystemPrompt(req) {
  if (req.chat_mode === 'free') return buildFreeChatSystemPrompt(req);
  return buildIntentSystemPrompt(req);
}

router.post('/detect-and-respond', async (req, res, next) => {
  try {
    const { reqId, text } = req.body;
    if (!reqId || !text) {
      return res.status(400).json({ error: 'MISSING_FIELDS' });
    }

    // 0. v0.18 bugfix：读历史（在写 user message 之前注入 LLM 上下文，避免重复）
    //   旧 bug：messages 只有 system + 当前 user，free 模式没 brief 兜底 → LLM 完全失忆
    const req0 = reqStore.getById(reqId);
    let historyForLLM = [];
    if (req0) {
      try {
        const raw = JSON.parse(req0.supplement_history || '[]');
        if (Array.isArray(raw)) {
          historyForLLM = raw
            .filter(e => e && (e.role === 'user' || e.role === 'assistant') && (e.text || e.opening))
            .slice(-10); // 最近 10 条（5 轮对话，省 token）
        }
      } catch (e) { /* 静默降级 */ }
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

    // 3. v0.16：LLM tool-loop 自主判断（替代 v0.15 关键词硬匹配）
    //    LLM 看着 4 个外部 tool descriptions 自主决定要不要调
    let searched = false;
    let deepResearch = false;
    let toolCalls = [];
    let aiReply = '';
    try {
      const req = reqStore.getById(reqId);
      if (!req) throw new Error(`需求不存在: ${reqId}`);

      const model = pickIntentModel();
      if (!model) {
        console.warn(`[detect-and-respond] ${reqId} 无可用 LLM，跳过 tool-loop`);
      } else {
        // v0.18 bugfix：注入历史上下文（之前 messages 只有 system + 当前 user，LLM 失忆）
        const historyMessages = historyForLLM.map(e => ({
          role: e.role,
          content: e.role === 'assistant'
            ? (e.text || e.opening || e.followup_question || '')
            : (e.text || ''),
        })).filter(m => m.content);

        const messages = [
          { role: 'system', content: pickIntentSystemPrompt(req) },
          ...historyMessages,
          { role: 'user', content: text },
        ];
        console.log(`[detect-and-respond] ${reqId} LLM tool-loop (${model.name}, ${INTENT_TOOL_NAMES.length} tools, history=${historyMessages.length})`);
        const result = await runToolLoop(model.id, messages, {
          toolNames: INTENT_TOOL_NAMES,
          maxRounds: 5,  // v0.20 bugfix：3 → 5（兜底，runToolLoop 内部重复检测已避免真循环）
          context: { reqId },  // v0.20：透传 reqId 给 tool handler（play_music/play_video/generate_image 需要）
        });
        aiReply = (result && typeof result === 'string') ? result : (result?.content || '');

        // 从 messages 历史提取实际调用的 tool（runToolLoop 内部已写回 messages）
        // 兼容两种格式：
        //   openai-chat:    m.tool_calls = [{function: {name, ...}}]
        //   anthropic:      m.content = [{type: 'tool_use', name, ...}]
        for (let i = messages.length - 1; i >= 0; i--) {
          const m = messages[i];
          if (m.role !== 'assistant') continue;
          // openai-chat 格式
          if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
            toolCalls = m.tool_calls.map(tc => tc.function?.name || tc.name).filter(Boolean);
            break;
          }
          // anthropic 格式
          if (Array.isArray(m.content)) {
            const tuse = m.content.find(b => b.type === 'tool_use');
            if (tuse) { toolCalls = [tuse.name]; break; }
          }
        }
        searched = toolCalls.some(n => n === 'web_search' || n === 'web_research');
        deepResearch = toolCalls.includes('web_research');

        console.log(`[detect-and-respond] ${reqId} tool-loop 结果: tools=${toolCalls.join(',') || '(无)'}, reply=${aiReply.length}字`);
      }

      // v0.19：clarify 模式隐式触发休闲 assist（音乐/图片）
      // 当 LLM tool-loop 没调相关工具，但用户消息明显表达了娱乐/创作意图时触发
      if (req && req.chat_mode !== 'free') {
        const lowerText = text.toLowerCase();
        // 音乐检测：含"播放/听/放/歌/音乐"等词且没有实际调用视频工具
        if (!toolCalls.includes('agnes_generate_video') &&
            /播放|听[一这]?首|放[一这]?首|想听|找歌|音乐/.test(text)) {
          console.log(`[detect-and-respond] ${reqId} 隐式触发 music assist`);
          const musicSvc = require('../services/assists/music');
          setImmediate(() => {
            musicSvc.runAssistJob(reqId, {}).catch(e =>
              console.error(`[detect-and-respond] ${reqId} music 隐式调用失败:`, e.message));
          });
        }
        // 图片检测：含"生成图片/图/插图/海报/画"等词
        if (!toolCalls.includes('agnes_generate_video') &&
            /生成.*(?:图片|图像|图|插图|海报|壁纸|画)|画[一这]?[张幅]|做.*(?:海报|封面|配图|logo)|图生图/.test(text)) {
          console.log(`[detect-and-respond] ${reqId} 隐式触发 image_gen assist`);
          const imgSvc = require('../services/assists/image-gen');
          setImmediate(() => {
            imgSvc.runAssistJob(reqId, {
              prompt: text.replace(/^(帮我|请|麻烦|可以)\s*(生成|画|做|设计|制作)/i, '').trim() || text,
            }).catch(e => console.error(`[detect-and-respond] ${reqId} image 隐式调用失败:`, e.message));
          });
        }
      }
    } catch (e) {
      console.error(`[detect-and-respond] ${reqId} tool-loop 失败:`, e.message);
      aiReply = `⚠️ AI 暂时无响应（${e.message.slice(0, 100)}），请稍后再试。`;
    }

    // 4. 写 tool-loop 触发的 tool 结果（如果 LLM 调了 web_research/web_search，
    //    整段已经在 runToolLoop 里被 LLM 整理成最终 aiReply 了——
    //    这里不再额外写 search entry，避免重复展示）
    //    fetch_url / get_current_time 调用的结果已融入 aiReply

    // 5. 写 AI 回复作为 assistant 角色（这是 v0.16 新增的：把 LLM 最终回复存档）
    if (aiReply) {
      const assistantEntry = {
        role: 'assistant',
        text: aiReply,
        source: 'intent_loop',
        chat_round: req.chat_round || 0, // v0.17：记当前 round（brief 重生前），前端历史显示「第N轮」用
        at: new Date().toISOString(),
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      };
      appendChatEntry(reqId, assistantEntry);
    }

    // 6. 触发 brief 重生（让 AI 看到 AI 回复 + 工具结果）
    // v0.18：free 模式跳过 brief 重生（避免澄清问题污染自由对话流）
    const reqAfter = reqStore.getById(reqId);
    if (reqAfter && reqAfter.chat_mode !== 'free') {
      const { runBriefJob } = require('../services/thinking-brief');
      setImmediate(() => {
        runBriefJob(reqId, { modelId: null })
          .catch(e => console.error(`[detect-and-respond] brief 重生失败:`, e.message));
      });
    } else {
      console.log(`[detect-and-respond] ${reqId} chat_mode=free, 跳过 brief 重生`);
    }

    res.json({
      ok: true,
      reqId,
      searched,
      deepResearch,
      toolCalls,        // v0.16 新增：LLM 实际调用的 tool 列表（前端可显示「🤖 AI 调用了 web_research」）
      briefRegen: true,
    });
  } catch (e) {
    next(e);
  }
});

// v0.16：选 chat-intent 用的 LLM（优先默认 gen 模型，capability 兜底）
function pickIntentModel() {
  const defaultGen = modelStore.getDefaultGenModel();
  if (defaultGen) return defaultGen;
  const all = modelStore.list();
  return all.find(m => m.capabilities?.includes('text') || m.type === 'chat' || m.type === 'text')
    || all[0]
    || null;
}

// v0.19a：从 user text 剥离附件内容（保留 LLM 上下文，但展示难看）
//   chatBuildSupplementText 拼附件时用 marker '\n\n---\n📎 附件内容：' 开头
//   supplement-history 持久化时剥掉这段，渲染 user bubble 不显示附件原文
//   LLM 调用仍用原始 text（含附件），行为不变
function stripAttachmentContext(text) {
  if (!text || typeof text !== 'string') return text;
  const marker = '\n\n---\n📎 附件内容：';
  const idx = text.indexOf(marker);
  return idx >= 0 ? text.slice(0, idx).replace(/\s+$/, '') : text;
}

// 写 supplement_history
function appendChatEntry(reqId, entry) {
  const req = reqStore.getById(reqId);
  if (!req) throw new Error(`需求不存在: ${reqId}`);
  let history = [];
  try { history = JSON.parse(req.supplement_history || '[]'); } catch (e) { /* 静默降级 */ }
  if (!Array.isArray(history)) history = [];
  // v0.19a：user entry 写入前剥附件内容（assistant / system 不动）
  if (entry.role === 'user' && typeof entry.text === 'string') {
    entry = { ...entry, text: stripAttachmentContext(entry.text) };
  }
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
          appendChatEntry(reqId, { role: 'assistant', ...parts, source: 'assistant_round', chat_round: oldBrief.chat_round || 0, at: new Date().toISOString() });
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
module.exports.stripAttachmentContext = stripAttachmentContext;
