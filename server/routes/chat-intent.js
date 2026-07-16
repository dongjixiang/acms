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

// v0.20d：7 个外部 tool（play_music 由预检覆盖，不加进 LLM 可见避免重复触发）
const INTENT_TOOL_NAMES = [
  'web_search', 'web_research', 'fetch_url', 'get_current_time',  // 信息类
  'agnes_generate_video',  // 视频生成（v0.18 直接调 Agnes API）
  // v0.20d: play_music 由预检覆盖，不加进 LLM 可见工具避免重复触发
  'play_video',           // 视频生成（v0.20 触发 video assist，自动从用户消息提取 prompt）
  'generate_image',       // 图片生成（v0.20 触发 image-gen assist，自动从用户消息提取 prompt）
  'send_email',           // v0.47：邮件发送（fire-and-forget + 用户确认才真发）
  'plan_execute',         // v0.48：复合意图 plan 执行（多 tool / 多步骤 / 依赖场景）
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
// v0.22.23b：精简 system prompt，删掉复用的 clarify 模式限制（"仅在...才调"）+ 暗示 LLM 直接回复的措辞
//   多多诉求：free 模式更开放，LLM 自主决定调不调 tool。工具 description 自带触发条件，不需要在 system prompt 重复
// v0.47.1：治「LLM 装睡」 — 用户表达生成图片/视频/搜索/邮件/音乐等明确工具意图时，
//   **必须调用对应工具**，不能嘴说"正在生成/正在搜索/已发送"等假动作（用户看不到任何卡片，就是空话）。
//   多次轮询日志显示 LLM 倾向于在第一轮 final answer 中描述"动作"但**不真调用 tool**，
//   导致用户看不到任何输出（图片/视频/搜索结果都不存在），不得不催第二轮。
function buildFreeChatSystemPrompt(req) {
  return `你是 ACMS 自由对话助手。当前用户正在与你自由对话，可能让你总结附件、解读资料、对比方案、画图、生成视频、搜索信息、发送邮件、找歌曲等。

# 需求上下文（仅作背景，不要当成对话主线）
- 标题：${req.title || '(空)'}
- 描述：${(req.description || '').slice(0, 200) || '(空)'}
- 状态：${req.status || 'idea'} / 阶段：${req.phase || '孵化'}

# 任务
- 用户没在整理需求，**直接帮用户处理具体请求**。
- 你可以调用工具（generate_image、play_video、agnes_generate_video、play_music、web_search、web_research、fetch_url、get_current_time、send_email、plan_execute）来满足用户的具体请求；工具的 description 告诉你何时该调。
- 也可以直接基于对话历史和已有知识回答。

# ⛔ 严禁「装睡」（v0.47.1 治根因）
当用户消息含**明确的工具调用意图**时（生成图片/视频/搜索/邮件/找歌），你**必须调用对应工具**。绝不能只回文字如"图片正在生成中""视频已发送""邮件已发送""搜索中请稍等"——**这种回复是空话，用户看不到任何卡片，必须避免**。

判断标准（满足任一即视为有工具意图）：
- 含"生成图片/画一张/画一个/做一张图"等 → 调 **generate_image**
- 含"生成视频/做一个视频/拍个视频"等 → 调 **play_video** 或 **agnes_generate_video**
- 含"搜索/查一下/调研/找资料"等 → 调 **web_search** 或 **web_research**
- 含 URL → 调 **fetch_url**
- 含"发邮件/发送邮件/转发邮件"等 → 调 **send_email**
- 含"想听/播放/找一首/放首歌"等 → 调 **play_music**

如果工具已调（msg 里有 role=tool 的返回结果），下一轮 final answer 可以简短告诉用户"已触发，请稍候"——但**第一轮**看到用户意图就必须调工具。

# ⛔ 复合意图必须调 plan_execute（v0.48 治根因）
当用户消息**同时涉及 2 个或以上 tool 意图**时（且步骤有先后/依赖/耗时），**必须先调 plan_execute** 把整个事情拆成步骤交给系统执行，不能自己按顺序一个个调 tool。

判断标准：
- 只有 1 个 tool 意图 → 直接调那个 tool（不走 plan_execute）
- 2+ tool 意图 且步骤独立或串行依赖 → **调 plan_execute 一次**

典型场景：
- "生成图片 + 发邮件" → plan_execute (2 步：generate_image → send_email)
- "调研 A + 调研 B + 调研 C + 生成对比表" → plan_execute (4 步：3 个 web_research 并列 → synthesize)
- "查天气 + 查日历 + 找咖啡馆" → plan_execute (3 步：3 个查询并列)

**为什么不能用普通多 tool call**：
LLM 在同一次 tool_loop 里调多个 tool 后，会拿到 tool result 进入 final answer 阶段，不会等异步 tool 完成再调后续 tool。
v0.47.5 REQ-MRHNP0PR 案例：用户说"生成图片+发邮件" → LLM 调 generate_image → 拿到 result → final answer → 漏调 send_email。
plan_execute 内部由 plan-executor 按拓扑序保证所有步骤都执行，不会漏调。

调用格式（参考 plan_execute tool description）：
{"summary": "一句话", "steps": [{"tool": "...", "args": {...}}, {"tool": "...", "args": {...}, "depends_on": ["s1"]}]}

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
    let documentDetected = false;

    // v0.20d：预检音乐意图 → 直接触发音乐辅助工具（现有 assist_music 机制）
    //   - 写 loading 到 supplement_history（即时反馈）
    //   - 调 musicSvc.runAssistJob（实际搜索，结果存入 assist_music → 前端辅助面板渲染）
    const musicPreCheck = extractMusicIntent(text);
    if (musicPreCheck.song && !toolCalls.includes('agnes_generate_video') &&
        /播放|听[一这]?首|放[一这]?首|想听|找歌|音乐/.test(text)) {
      console.log(`[detect-and-respond] ${reqId} 预检音乐意图: song=${musicPreCheck.song}, artist=${musicPreCheck.artist}`);
      // 写 loading 到聊天流（用 JSON 格式，前端 renderMusicBubble 渲染出漂亮 loading 卡片）
      appendChatEntry(reqId, {
        role: 'system',
        text: JSON.stringify({
          type: 'music_loading',
          song: musicPreCheck.song,
          artist: musicPreCheck.artist || null,
          status: 'loading',
        }),
        at: new Date().toISOString(),
        source: 'music_precheck',
      });
      // 直接触发音乐搜索（assist_music 更新 → 前端辅助面板渲染播放卡片）
      try {
        const musicSvc = require('../services/assists/music');
        musicSvc.runAssistJob(reqId, musicPreCheck).catch(e =>
          console.error(`[detect-and-respond] ${reqId} music 预触发失败:`, e.message));
      } catch (e) {
        console.error(`[detect-and-respond] ${reqId} music 预触发异常:`, e.message);
      }
    }

    // v0.46：预检文档生成意图 → 直接触发文档生成辅助
    //   匹配关键词如"整理成文档/生成文档/导出文档/Word文档"等
    // v0.48 修复：只在"单一文档意图"才抢跑，复合意图（含其他 tool 关键词）让 LLM 调 plan_execute 编排
    //   否则 document_precheck 抢跑后 LLM 收到"文档已自动生成"提示，会以为整个流程都跑完了 → 装睡
    //   （v0.48 多多 REQ-MRHNP0PR 案例："查2026世界杯+生成Word+发邮件" → 抢跑文档 → LLM 装睡，没调 web_search）
    const docKeywords = /整理成文档|生成文档|导出文档|Word文档|\.docx|\.doc|文档|变成文档|形成文档|整理成word/i;
    const otherToolKeywords = /发邮件|发送邮件|转发邮件|发给|发到|搜索|查一下|调研|找资料|查\s*\d{4}|生成图片|画[一]?[张个]|做[一]?张图|生成视频|拍个视频|播放|想听|放[一]?首|听[一]?首|找歌/i;
    const hasDocIntent = docKeywords.test(text);
    const hasOtherIntent = otherToolKeywords.test(text);
    const isCompositeIntent = hasDocIntent && hasOtherIntent;

    if (hasDocIntent && !isCompositeIntent) {
      console.log(`[detect-and-respond] ${reqId} 检测到文档意图（单一意图）→ 抢跑触发`);
      appendChatEntry(reqId, {
        role: 'system',
        text: '📄 正在生成文档…（完成前请勿重复发送）',
        at: new Date().toISOString(),
        source: 'document_precheck',
      });
      try {
        const docGenSvc = require('../services/assists/document-gen');
        docGenSvc.runAssistJob(reqId, { instruction: text, autoTriggered: true }).catch(e =>
          console.error(`[detect-and-respond] ${reqId} document 预触发失败:`, e.message));
      } catch (e) {
        console.error(`[detect-and-respond] ${reqId} document 预触发异常:`, e.message);
      }
      documentDetected = true;
    } else if (hasDocIntent && isCompositeIntent) {
      console.log(`[detect-and-respond] ${reqId} 检测到复合意图（含文档+其他 tool）→ 跳过 document_precheck 抢跑，让 LLM 调 plan_execute 编排`);
      // 不抢跑 document_gen：让 LLM 通过 plan_execute 走完整流程（web_search → document_gen → send_email）
      // documentDetected 保持 false，不注入"文档已搞定"误导提示
    }

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
          // v0.20b：如果音乐已预触发，告诉 LLM 不要自己调 tool，直接简短回复
          ...(musicPreCheck.song ? [{ role: 'system', content: '（音乐搜索已自动触发，10-30 秒后显示播放卡片。请简短回复用户"正在找"即可，不要复制歌词或推荐平台，不要调用任何工具。）' }] : []),
          // v0.46：文档生成已自动触发，让 LLM 简短回复即可
          // v0.48 修复：去掉"请不要自己写文档"等诱导 LLM 装睡的措辞（v0.48 REQ-MRHNP0PR 案例）
          //   改用中性提示，让 LLM 自己判断是否还有其他 tool 需要调（单一意图则简短回复，复合意图则调 plan_execute）
          ...(documentDetected ? [{ role: 'system', content: '（文档生成辅助已自动触发。如果用户消息还包含其他工具意图（如发邮件/搜索等），请用 plan_execute 编排多步骤；否则简短回复用户"正在整理文档"即可。）' }] : []),
          // v0.22.23b：删除图片生成意图的 system 提示注入。多多诉求：LLM 自己看 context 决定调不调 tool。
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

      // v0.22.23b：删除 LLM 偷懒兜底。多多诉求：LLM 自己看 context 决定调不调 tool。
      // 之前 v0.22.23 / v0.22.23a 都在服务端替 LLM 抢跑或兜底，等于 LLM 决策被绕过。
      // 现在完全由 LLM 决定：调 generate_image → 走 tool 路径；不调 → 走纯文字回复。
      // 治"toast 骗人"在 model 层（换 model 或加 model tool-call 训练），不在服务端。
    } catch (e) {
      console.error(`[detect-and-respond] ${reqId} tool-loop 失败:`, e.message);
      aiReply = `⚠️ AI 暂时无响应（${e.message.slice(0, 100)}），请稍后再试。`;
    }

    // 4. 写 tool-loop 触发的 tool 结果（如果 LLM 调了 web_research/web_search，
    //    整段已经在 runToolLoop 里被 LLM 整理成最终 aiReply 了——
    //    这里不再额外写 search entry，避免重复展示）
    //    fetch_url / get_current_time 调用的结果已融入 aiReply

    // 5. 写 AI 回复作为 assistant 角色（这是 v0.16 新增的：把 LLM 最终回复存档）
    // v0.46 fix：如果后续会跑 brief 重生，跳过写 assistant entry，避免前端的 polling + SSE 双气泡
    const reqAfterCheck = reqStore.getById(reqId);
    const willBriefRegen = reqAfterCheck && reqAfterCheck.chat_mode !== 'free';
    if (aiReply && !willBriefRegen) {
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
    // v0.46 fix：去掉 setImmediate runBriefJob——前端 SSE /thinking-brief/stream
    //   已经会触发 runBriefJobStream，两个路径同时跑造成 race condition
    //   （后写完的覆盖前一个的 suggested_assist 等字段）
    //   去掉后统一走 SSE 路径，避免双重生成 + 覆盖 bug
    //   保留 chat_mode=free 的跳过（free 模式本来就不跑 brief）
    const reqAfter = reqStore.getById(reqId);
    if (reqAfter && reqAfter.chat_mode !== 'free') {
      console.log(`[detect-and-respond] ${reqId} chat_mode=clarify, 等待前端 SSE 触发 brief 生成（不再后端主动跑）`);
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
  const matches = text.match(/https?:\/\/[^\s<>"'，。、；！？)\\]]+/g) || [];
  return Array.from(new Set(matches));
}

// 从用户消息提取音乐意图（歌手+歌名）
function extractMusicIntent(text) {
  if (!text) return {};
  // 模式1："想听/播放/放/听 [歌手] 的 [歌名]"
  let m = text.match(/(?:想听|播放|放|听)\s*(.+?)?\s*的\s*(.+?)(?:[，。！？\n]|$)/);
  if (m) {
    const artist = (m[1] || '').trim();
    const song = (m[2] || '').trim();
    if (song) return { song, artist: artist || undefined };
  }
  // 模式2："想听/播放/放/听 [歌名]"
  m = text.match(/(?:想听|播放|放一首?|听一首?|听)\s+([^，。！？\n]{1,30})/);
  if (m && m[1]) return { song: m[1].trim() };
  return {};
}

function isDirectImageGenerationRequest(text) {
  // v0.22.23b：删除 LLM 偷懒兜底 + 关键词直生成逻辑。
  // 多多明确诉求：用户发请求 → LLM 理解 → LLM 决定调不调 tool。服务端不预判、不抢跑、不兜底。
  // 偷懒 LLM（MiniMax-M3.0）会自编"任务已提交"骗人——治 root cause 在 model 层（换 model / model 训练 tool-call），
  // 不在服务端。保留这个空 stub 仅防止外部 module 引用。
  return false;
}

function extractImagePrompt(text) {
  // v0.22.23b：保留 stub 防止外部 module 引用，但不再被使用。
  return (text || '').trim();
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
// v0.48 fix: plan-executor 需要 appendChatEntry 写 plan_loading/plan_step_update/plan_done entries
//   之前没 export → writeSystemEntry 调 undefined() 抛 TypeError 被 try/catch 静默吞掉
//   症状：requirement.plan 写对了但 supplement_history 没 plan_* entries → 前端聚合渲染失败
module.exports.appendChatEntry = appendChatEntry;
