// Agent Buddy Chat — v0.61
// POST /api/agent-buddy/chat
// 系统 Agent「小吉」的对话接口
//
// v0.61 重构：
//   - 保留 greeting / personality 特殊消息模式（v0.59 兼容）
//   - 主 chat 路径走 runToolLoop（复用 chat-intent 的 tool-loop 基建）
//   - 用 agent-buddy-skill 三层 SKILL prompt 动态拼装（按 currentView + expandedCategories）
//   - expandedCategories 持久化到 buddy_memory 表（跨对话保留）
//   - 通过 req.user（auth middleware）拿当前登录用户身份 → ctx.user
//
// 调用方：client/js/core/agent-buddy.js 的 sendMessage()

const express = require('express');
const router = express.Router();
const { callLLM } = require('../services/llm-adapter');
const { execute: runtimeExec } = require('../services/agent-runtime');
const modelStore = require('../stores/model-store');
var buddySkill = require('../services/agent-buddy-skill');
var buddyAction = require('../services/agent-buddy-action');
var toolRetriever = require('../services/tool-retriever');  // v0.74: 智能工具检索
const eventBus = require('../services/event-bus');

// P2: 订阅 Agent 事件，让小吉知道 task-agent 做了什么
const _recentAgentEvents = [];
eventBus.on('task.completed', function(ev) {
  _recentAgentEvents.push(ev);
  if (_recentAgentEvents.length > 5) _recentAgentEvents.shift();
});
eventBus.on('task.review_rejected', function(ev) {
  _recentAgentEvents.push(ev);
  if (_recentAgentEvents.length > 5) _recentAgentEvents.shift();
});
eventBus.on('task.failed', function(ev) {
  _recentAgentEvents.push(ev);
  if (_recentAgentEvents.length > 5) _recentAgentEvents.shift();
});

// ─── helpers ───

// L2 上下文接收端点（前端 fire-and-forget POST，记录用户行为供小吉参考）
router.post('/context', function(req, res) {
  var body = req.body || {};
  var userId = req.user ? (req.user.id || req.user.userId) : 'system';
  if (!body.action) return res.json({ ok: true }); // 什么都不记也 OK，不要报错

  // 只保留最近 50 条 action 记忆（按 user+view 聚合）
  try {
    var { collection } = require('../db/connection');
    var mem = collection('buddy_memory').findOne(m => m.user_id === userId && m.key === 'recent_actions');
    var actions = [];
    if (mem && typeof mem.value === 'string') {
      try { actions = JSON.parse(mem.value); } catch(e) { actions = []; }
    }
    actions.push({ view: body.view, action: body.action, ts: body.ts || Date.now() });
    if (actions.length > 50) actions = actions.slice(-50);
    if (mem) {
      collection('buddy_memory').update(m => m.user_id === userId && m.key === 'recent_actions', {
        value: JSON.stringify(actions), updated_at: new Date().toISOString()
      });
    } else {
      collection('buddy_memory').insert({
        user_id: userId, key: 'recent_actions',
        value: JSON.stringify(actions), updated_at: new Date().toISOString()
      });
    }
  } catch(e) { /* 非阻塞 */ }
  res.json({ ok: true });
});

// 后端记忆访问端点（v0.61）
// GET  /api/agent-buddy/memory/:key  — 读取记忆值
// PUT  /api/agent-buddy/memory/:key  — 写入记忆值 { value: any }
// DELETE /api/agent-buddy/memory/:key — 删除记忆键
router.get('/memory/:key', function(req, res) {
  var userId = req.user ? (req.user.id || req.user.userId) : 'system';
  try {
    var { collection } = require('../db/connection');
    var mem = collection('buddy_memory').findOne(m => m.user_id === userId && m.key === req.params.key);
    if (!mem) return res.json({ ok: true, value: null });
    try { return res.json({ ok: true, value: JSON.parse(mem.value) }); }
    catch(e) { return res.json({ ok: true, value: mem.value }); }
  } catch(e) { res.status(500).json({ error: 'INTERNAL', message: e.message }); }
});

router.put('/memory/:key', function(req, res) {
  var userId = req.user ? (req.user.id || req.user.userId) : 'system';
  var value = req.body && req.body.value;
  try {
    var { collection } = require('../db/connection');
    var mem = collection('buddy_memory').findOne(m => m.user_id === userId && m.key === req.params.key);
    var valueJson = JSON.stringify(value);
    if (mem) {
      collection('buddy_memory').update(m => m.user_id === userId && m.key === req.params.key, {
        value: valueJson, updated_at: new Date().toISOString()
      });
    } else {
      collection('buddy_memory').insert({
        user_id: userId, key: req.params.key,
        value: valueJson, updated_at: new Date().toISOString()
      });
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'INTERNAL', message: e.message }); }
});

router.delete('/memory/:key', function(req, res) {
  var userId = req.user ? (req.user.id || req.user.userId) : 'system';
  try {
    var { collection } = require('../db/connection');
    collection('buddy_memory').remove(m => m.user_id === userId && m.key === req.params.key);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'INTERNAL', message: e.message }); }
});

// v0.79: 聊天历史存储 API
// POST /api/agent-buddy/chat-history — 保存消息 { role, text }
router.post('/chat-history', function(req, res) {
  var userId = req.user ? (req.user.id || req.user.userId) : null;
  if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });
  
  var body = req.body || {};
  var role = body.role === 'user' ? 'user' : 'buddy';
  var text = (body.text || '').trim();
  if (!text) return res.json({ ok: true });
  
  try {
    var historySvc = require('../services/buddy-chat-history');
    var msg = historySvc.appendMessage(userId, role, text, body.meta);
    res.json({ ok: true, id: msg && msg.id });
  } catch(e) {
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

// GET /api/agent-buddy/chat-history — 获取历史消息
router.get('/chat-history', function(req, res) {
  var userId = req.user ? (req.user.id || req.user.userId) : null;
  if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });
  
  try {
    var historySvc = require('../services/buddy-chat-history');
    var limit = req.query.limit ? parseInt(req.query.limit) : 20;
    var messages = historySvc.getHistory(userId, limit);
    var summary = historySvc.getSummary(userId);
    res.json({ ok: true, messages: messages, summary: summary });
  } catch(e) {
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

// POST /api/agent-buddy/chat-history/summarize — 手动触发摘要生成
router.post('/chat-history/summarize', async function(req, res) {
  var userId = req.user ? (req.user.id || req.user.userId) : null;
  if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });
  
  try {
    var historySvc = require('../services/buddy-chat-history');
    var llmAdapter = require('../services/llm-adapter');
    var modelStore = require('../stores/model-store');
    
    var summaryData = await historySvc.generateSummary(userId, llmAdapter);
    if (!summaryData) {
      return res.json({ ok: true, summarized: false, reason: '消息不足' });
    }
    
    // 调用 LLM 生成摘要
    var model = modelStore.getDefaultGenModel();
    if (!model) {
      return res.status(503).json({ error: '模型未配置' });
    }
    
    var result = await llmAdapter.callLLM(model.id, [
      { role: 'system', content: summaryData.prompt },
      { role: 'user', content: '请为以上对话生成摘要' }
    ], { maxTokens: 300, temperature: 0.3 });
    
    var summaryText = typeof result === 'string' ? result : (result && result.content) || '';
    
    // 解析 JSON
    var summary = null;
    try {
      var jsonMatch = summaryText.match(/\{[\s\S]*\}/);
      if (jsonMatch) summary = JSON.parse(jsonMatch[0]);
    } catch(e) {}
    
    if (summary) {
      summary.messageCount = summaryData.history.length;
      historySvc.saveSummary(userId, summary);
      res.json({ ok: true, summarized: true, summary: summary });
    } else {
      res.json({ ok: true, summarized: false, raw: summaryText });
    }
  } catch(e) {
    res.status(500).json({ error: 'INTERNAL', message: e.message });
  }
});

// 计算当前 chat 应该暴露哪些 tool（与 SKILL prompt 中列出的逐一对应）
function computeToolNames(currentView, expandedCategories) {
  const view = currentView || '_default';
  const l1Tools = buddySkill.VIEW_TOOLS[view] || buddySkill.VIEW_TOOLS['_default'];
  const l2Tools = (expandedCategories || []).flatMap(cat => buddySkill.CATEGORY_TOOLS[cat] || []);
  return [...new Set([...buddySkill.L0_TOOLS, ...l1Tools, ...l2Tools])];
}

// 从 context 生成用户摘要字符串（v0.59 兼容）
function buildUserSummary(context) {
  if (!context) return '';
  const parts = [];
  if (context.loginCount > 0) parts.push('见过 ' + context.loginCount + ' 次');
  if (context.totalQuestions > 0) parts.push('聊过 ' + context.totalQuestions + ' 个话题');
  const views = context.knownViews || [];
  if (views.length > 0) parts.push('用过 ' + views.join('、'));
  return parts.join('；') || '';
}

// 从 buddy_memory 表读取记忆值
function loadMemory(userId, key) {
  if (!userId) return null;
  try {
    const { collection } = require('../db/connection');
    const mem = collection('buddy_memory').findOne(m => m.user_id === userId && m.key === key);
    return mem ? (typeof mem.value === 'string' ? JSON.parse(mem.value) : mem.value) : null;
  } catch (e) {
    console.warn('[agent-buddy] loadMemory 失败:', e.message);
    return null;
  }
}

// 写入 buddy_memory 表
function saveMemory(userId, key, value) {
  if (!userId) return;
  try {
    const { collection } = require('../db/connection');
    const mem = collection('buddy_memory').findOne(m => m.user_id === userId && m.key === key);
    const valueJson = JSON.stringify(value);
    if (mem) {
      collection('buddy_memory').update(m => m.user_id === userId && m.key === key, {
        value: valueJson,
        updated_at: new Date().toISOString()
      });
    } else {
      collection('buddy_memory').insert({
        user_id: userId,
        key: key,
        value: valueJson,
        updated_at: new Date().toISOString()
      });
    }
  } catch (e) {
    console.warn('[agent-buddy] saveMemory 失败:', e.message);
  }
}

// ─── Greeting 模式（v0.59 兼容）───

function buildGreetingPrompt(context) {
  return buddySkill.buildGreetingPrompt(context || {});
}

// ─── Personality 模式（v0.59 兼容）───

function buildPersonalityPrompt(context) {
  return buddySkill.buildPersonalityPrompt(context || {});
}

// GET /api/agent-buddy/action/:requirementId — 小吉动作卡轮询状态
router.get('/action/:requirementId', function(req, res) {
  try {
    const state = buddyAction.snapshotActionState(req.params.requirementId);
    if (!state) return res.status(404).json({ error: 'ACTION_NOT_FOUND' });
    return res.json({ ok: true, state });
  } catch (e) {
    return res.status(500).json({ error: 'ACTION_STATE_FAILED', message: e.message });
  }
});

// POST /api/agent-buddy/action/:requirementId/send-email — 用户在小吉动作卡确认发送
router.post('/action/:requirementId/send-email', async function(req, res) {
  try {
    const state = buddyAction.snapshotActionState(req.params.requirementId);
    if (!state) return res.status(404).json({ error: 'ACTION_NOT_FOUND' });
    const pending = state.pendingEmail;
    if (!pending) return res.status(409).json({ error: 'NO_PENDING_EMAIL' });
    const emailSvc = require('../services/assists/send-email');
    await emailSvc.runAssistJob(req.params.requirementId, {
      to: pending.to,
      subject: pending.subject,
      body: pending.body,
      file_ids: pending.file_ids || [],
    });
    const next = buddyAction.snapshotActionState(req.params.requirementId);
    return res.json({ ok: next?.assistEmail?.status === 'done', state: next });
  } catch (e) {
    return res.status(500).json({ error: 'EMAIL_SEND_FAILED', message: e.message });
  }
});

// ════════════════════════════════════════
// chat 端点
// ════════════════════════════════════════

router.post('/chat', async function(req, res) {
  console.log('[agent-buddy] 收到请求:', req.body && req.body.message);

  try {
    var body = req.body || {};
    var message = (body.message || '').trim();
    var context = body.context || {};

    // ── 当前登录用户（从 auth middleware 透传，或从 body.ctx 兼容）──
    var user = req.user || (context._user) || null;
    var userId = user ? (user.id || user.userId) : null;

    // ── 问候模式 ──
    if (message === '__greeting__') {
      var greetPrompt = (context && context._useNewSkill)
        ? buildGreetingPrompt(context)
        : (function legacyGreeting(ctx) { /* v0.59 fallback */
            var oldPrompt = buddySkill.buildGreetingPrompt(context);
            return oldPrompt;
          })(context);
      var model = modelStore.getDefaultGenModel();
      if (!model) return res.status(503).json({ error: '模型未配置' });

      var result = await callLLM(model.id, [
        { role: 'system', content: greetPrompt },
        { role: 'user', content: '跟我打个招呼吧' }
      ], { maxTokens: 300, temperature: 0.9, caller: 'agent-buddy-greet' });

      var reply = '';
      if (typeof result === 'string') reply = result;
      else if (result && result.content) reply = result.content;
      else reply = '欢迎回来～有什么需要帮忙的吗？';
      return res.json({ reply: reply.trim() });
    }

    // ── 性格总结模式 ──
    if (message === '__personality__') {
      var pModel = modelStore.getDefaultGenModel();
      if (!pModel) return res.json({ reply: '仍在了解中' });
      var pHistory = (context && context.history) || '';
      var pOld = (context && context.oldPersonality) || '还没有了解';
      var pPrompt = buddySkill.buildPersonalityPrompt({ history: pHistory, oldPersonality: pOld });

      var pResult = await callLLM(pModel.id, [
        { role: 'system', content: pPrompt },
        { role: 'user', content: '总结一下我观察到的' }
      ], { maxTokens: 200, temperature: 0.8, caller: 'agent-buddy-personality' });

      var pReply = '';
      if (typeof pResult === 'string') pReply = pResult;
      else if (pResult && pResult.content) pReply = pResult.content;
      return res.json({ reply: (pReply || '').trim() });
    }

    if (!message) {
      return res.status(400).json({ error: '请输入消息' });
    }

    // ── 主路径：runToolLoop ──

    var model = modelStore.getDefaultGenModel();
    if (!model) {
      return res.status(503).json({ error: '系统未配置 AI 模型' });
    }

    // 1. 读取 previous expandedCategories（持久化记忆，跨对话保留）
    var previousCategories = [];
    if (userId) {
      var savedCats = loadMemory(userId, 'expanded_categories');
      if (Array.isArray(savedCats)) previousCategories = savedCats;
    }

    // v0.61: L2 动作上下文——读 recent_actions（最近 5 条去重操作）
    var recentActions = [];
    if (userId) {
      var savedActions = loadMemory(userId, 'recent_actions');
      if (Array.isArray(savedActions)) {
        var deduped = [];
        var seenActs = {};
        for (var i = (savedActions.length - 1); i >= 0; i--) {
          var a = savedActions[i];
          if (!seenActs[a.action]) {
            seenActs[a.action] = true;
            deduped.push({ action: a.action, view: a.view });
          }
          if (deduped.length >= 5) break;
        }
        recentActions = deduped;
      }
    }
    var actionHint = recentActions.length > 0
      ? '；最近操作：' + recentActions.map(function(a) { return a.action; }).join('、')
      : '';

    // v0.61: 小吉持续学习——读 learned_facts（之前学过的映射关系）
    var learnedFacts = [];
    if (userId) {
      var savedFacts = loadMemory(userId, 'learned_facts');
      if (Array.isArray(savedFacts)) learnedFacts = savedFacts;
    }
    var learnHint = learnedFacts.length > 0
      ? '；你之前学过：' + learnedFacts.map(function(f) { return f.key + '→' + f.value; }).join('、')
      : '';

    // v0.61: 行为纠正检测——上次小吉调了什么 vs 用户最近操作
    var lastCall = userId ? loadMemory(userId, 'last_buddy_tool_call') : null;
    if (lastCall) {
      var conflictingActions = (recentActions || []).filter(function(a) {
        return a.action !== ('tool:' + lastCall.action) && a.action.indexOf('toast:') !== 0;
      });
      if (conflictingActions.length > 0) {
        actionHint += '；【注意：上次你调了' + lastCall.action + '，但用户实际做了' + conflictingActions[0].action + '— 可能纠正了你】';
      }
    }

    // v0.79: 读取历史摘要（跨会话上下文）
    var chatHistory = [];
    var chatSummary = null;
    if (userId) {
      try {
        var historySvc = require('../services/buddy-chat-history');
        chatHistory = historySvc.getHistory(userId, 10); // 最近 10 条原始消息
        chatSummary = historySvc.getSummary(userId);
        // 检查是否需要生成新摘要
        if (chatHistory.length >= historySvc.SUMMARY_INTERVAL && historySvc.shouldSummarize(userId)) {
          // 异步生成摘要（不阻塞主响应）
          setImmediate(function() {
            historySvc.generateSummary(userId).then(function(summaryData) {
              if (summaryData) {
                var modelStore = require('../stores/model-store');
                var llmAdapter = require('../services/llm-adapter');
                var model = modelStore.getDefaultGenModel();
                if (model) {
                  llmAdapter.callLLM(model.id, [
                    { role: 'system', content: summaryData.prompt },
                    { role: 'user', content: '请生成摘要' }
                  ], { maxTokens: 300, temperature: 0.3 })
                    .then(function(result) {
                      var summaryText = typeof result === 'string' ? result : (result && result.content) || '';
                      var summary = null;
                      try {
                        var jsonMatch = summaryText.match(/\{[\s\S]*\}/);
                        if (jsonMatch) summary = JSON.parse(jsonMatch[0]);
                      } catch(e) {}
                      if (summary) {
                        summary.messageCount = summaryData.history.length;
                        historySvc.saveSummary(userId, summary);
                        console.log('[buddy-history] 摘要已生成并保存');
                      }
                    })
                    .catch(function(e) { console.warn('[buddy-history] 摘要生成失败:', e.message); });
                }
              }
            }).catch(function(e) { console.warn('[buddy-history] generateSummary 失败:', e.message); });
          });
        }
      } catch(e) {
        console.warn('[buddy-history] 加载历史失败:', e.message);
      }
    }
    var historyHint = chatSummary
      ? '；历史摘要：' + chatSummary.text
      : '';

    // 2. 拼 SKILL system prompt
    var retrievedToolNames = [];
    try {
      // v0.74: 根据用户消息自动检索最匹配的工具
      if (toolRetriever.status().ready) {
        var retrieved = await toolRetriever.retrieve(message, 5);
        retrievedToolNames = retrieved.map(function(r) { return r.name; });
        console.log('[agent-buddy] retrieved tools:', JSON.stringify(retrievedToolNames), 'scores:', JSON.stringify(retrieved.map(function(r) { return r.score; })));
      }
    } catch (e) {
      console.warn('[agent-buddy] tool retriever error:', e.message);
    }

    var buddyCtx = {
      currentView: context.currentView || '_default',
      expandedCategories: previousCategories,
      retrievedTools: retrievedToolNames,  // v0.74
      userName: user ? (user.displayName || user.username || '伙伴') : (context.userName || '伙伴'),
      userSummary: buildUserSummary(context) + actionHint + learnHint + historyHint,
      personality: context.personality || '',
      // P2: 注入近期 Agent 事件
      agentEvents: _recentAgentEvents.slice(-3).map(function(ev) {
        var t = ev.type || '';
        var s = (ev.payload && ev.payload.summary) || (ev.payload && ev.payload.error) || '';
        return t + ': ' + s.slice(0, 120);
      }),
      // v0.79: 注入历史摘要
      chatSummary: chatSummary,
      // v0.89: 成功经验追踪器需要原 message 查相关案例
      message: message,
    };
    var systemPrompt = buddySkill.buildChatPrompt(buddyCtx);

    // 2.5 conversational-action：单轮 LLM 路由，只决定即时聊天动作模式。
    // Router 无工具；真正执行仍走下面统一 runtime/tool-loop。
    var actionRoute = await buddyAction.routeMessage(model.id, message, context.history || []);
    var actionRequirement = null;
    if (actionRoute.mode !== 'conversation') {
      actionRequirement = buddyAction.getOrCreateActionRequirement(userId || 'anonymous');
      systemPrompt += buddyAction.buildActionPrompt(actionRoute);
      console.log('[agent-buddy] action route:', JSON.stringify({
        mode: actionRoute.mode,
        capabilities: actionRoute.capabilities,
        confidence: actionRoute.confidence,
        reqId: actionRequirement.id,
      }));
    }

    // v0.94 (P5): office_edit 是前端动作（浏览器持有文档 DOM，server 看不到文档内容）。
    //   server 只做意图路由：把用户指令 + 推断的文档类型放进 _action.officeV3，
    //   前端收到后组装文档摘要 → /api/agent-buddy/office-action 生成精确参数 → 执行 + 动作卡。
    var officeAction = null;
    if (actionRoute.capabilities.includes('office_edit')) {
      officeAction = {
        kind: guessOfficeKind(message),
        instruction: message,
      };
      console.log('[agent-buddy] office_edit 前端动作:', JSON.stringify(officeAction));
    }

    // 3. 算 toolNames（与 SKILL prompt 一一对应）
    var toolNames = computeToolNames(context.currentView, previousCategories);
    toolNames = buddyAction.getActionToolNames(actionRoute, toolNames);
    console.log('[agent-buddy DEBUG] toolNames:', JSON.stringify(toolNames));
    // 如果已经有 ACMS 内部 tool 注册了就全用，否则退回到 v0.59 纯对话模式（不传 tools）
    var hasSkills = toolNames.length > 0 && require('../services/tool-registry').getTool(toolNames[0]);
    console.log('[agent-buddy DEBUG] hasSkills:', hasSkills, 'toolNames[0]:', toolNames[0], 'getTool result:', toolNames.length > 0 ? !!require('../services/tool-registry').getTool(toolNames[0]) : 'N/A');

    // 4. 构建 messages（含对话历史）
    // v0.79: 过滤掉空 content 的 user/buddy 历史消息 — 上游 OpenAI 严格模式把空 user 视为不存在
    //   Agnes AI 等代理报 "No user query found in messages" 即此原因
    var messages = [
      { role: 'system', content: systemPrompt }
    ];
    var history = context.history || [];
    history.forEach(function(h) {
      var text = (h && h.text != null) ? String(h.text) : '';
      if (!text.trim()) return;  // 跳过空消息
      if (h.role === 'user') {
        messages.push({ role: 'user', content: text });
      } else if (h.role === 'buddy') {
        messages.push({ role: 'assistant', content: text });
      }
    });
    // v0.79: 校验当前 user message 非空（空消息直接返回 400 给前端，不浪费 LLM 调用）
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'EMPTY_MESSAGE', message: '消息内容不能为空' });
    }
    messages.push({ role: 'user', content: message });

    // 5. 共享 ctx（_expand_tools handler 写 expandedCategories 到引用外传）
    var sharedCtx = {
      user: user || {},
      apiKey: req.headers['x-api-key'],
      userToken: req.headers['authorization'],
      // v0.88: 当前项目 ID（前端传 currentProjectId，代码执行域定位 workspace 用）
      //   未传时回退：查用户当前项目（兼容无前端场景，如 curl 测试）
      projectId: context.currentProjectId || null,
      // 图片/邮件/plan 工具必须使用真实 requirement id；普通问答保留兼容标识。
      reqId: actionRequirement ? actionRequirement.id : ('buddy:' + (userId || 'anonymous')),
      actionMode: actionRoute.mode,
      actionRoute: actionRoute,
      expandedCategories: previousCategories.slice(),  // 初始复制
      message: message,  // v0.89: 给 tool handler 关联原 query（成功经验追踪用）
    };

    // 6. 跑 runToolLoop（LLM 可以调 tool）
    var runtimeResult;
    try {
      if (officeAction) {
        // P5: office_edit 不走 tool-loop，reply 由前端动作卡接管（生成器端点负责精确参数）
        runtimeResult = { content: '好的，我来帮你编辑' + (officeAction.kind === 'word' ? ' Word 文档' : officeAction.kind === 'xlsx' ? ' Excel 表格' : ' PPT 演示文稿') + '。' };
      } else if (hasSkills) {
        console.log('[agent-buddy DEBUG] 开始 runToolLoop, model:', model.id, 'toolNames:', JSON.stringify(toolNames));
        runtimeResult = await runtimeExec({
          modelId: model.id,
          messages,
          toolNames,
          maxRounds: 8,
          maxTokens: 4000,  // v0.75: 提高上限，避免 plan_execute 的 6 步骤 JSON 被截断
          context: sharedCtx,
          caller: 'agent-buddy',
        });
        console.log('[agent-buddy DEBUG] runToolLoop 完成, content:', (runtimeResult.content || '').slice(0, 100));
      } else {
        // 无 tools 时退回到常规 callLLM
        var result = await callLLM(model.id, messages, {
          maxTokens: 500,
          temperature: 0.8,
          caller: 'agent-buddy',
        });
        runtimeResult = { content: typeof result === 'string' ? result : (result?.content || '') };
      }
    } catch (loopErr) {
      // tool loop 超时或错误，给出友好提示
      console.warn('[agent-buddy] tool loop 异常:', loopErr.message);
      runtimeResult = { content: '我思考得有点久，可能任务太复杂了。您能再简单说说吗？' };
    }

    // 7. 持久化新的 expandedCategories
    var newCategories = sharedCtx.expandedCategories || [];
    if (userId && JSON.stringify(newCategories) !== JSON.stringify(previousCategories)) {
      saveMemory(userId, 'expanded_categories', newCategories);
      console.log('[agent-buddy] expandedCategories 已持久化:', newCategories);
    }

    // 8. 提取 final answer
    var reply = runtimeResult.content || '好的，我先消化一下再回答你～';
    reply = reply.trim();

    // 清理 LLM 回复中的 tool_result 残留（以防万一）
    // runToolLoop 会自动把 tool_result 从 final answer 中剥离，但保险起见
    if (reply.startsWith('Tool result for')) {
      reply = '好的，已经处理了。还有什么需要帮忙的吗？';
    }

    // 9. 解析 learn markers 入库（小吉持续学习）
    if (userId) {
      var learnRegex = /【learn:([^=]+)=([^】]+)】/g;
      var learnMatch;
      var newFacts = [];
      while ((learnMatch = learnRegex.exec(reply)) !== null) {
        newFacts.push({ key: learnMatch[1], value: learnMatch[2], ts: Date.now() });
      }
      if (newFacts.length > 0) {
        var existingFacts = loadMemory(userId, 'learned_facts') || [];
        newFacts.forEach(function(nf) {
          var found = false;
          for (var i = 0; i < existingFacts.length; i++) {
            if (existingFacts[i].key === nf.key) {
              existingFacts[i].value = nf.value;
              existingFacts[i].ts = nf.ts;
              found = true;
              break;
            }
          }
          if (!found) existingFacts.push(nf);
        });
        if (existingFacts.length > 50) existingFacts = existingFacts.slice(-50);
        saveMemory(userId, 'learned_facts', existingFacts);
        console.log('[agent-buddy] 小吉新学 ' + newFacts.length + ' 条:', newFacts.map(function(f) { return f.key; }).join(', '));
      }

      // 10. 存 last_tool_call（用于下次行为纠正检测）
      if (result && result.toolCalls && result.toolCalls.length > 0) {
        var lastToolCall = result.toolCalls[result.toolCalls.length - 1];
        saveMemory(userId, 'last_buddy_tool_call', {
          action: lastToolCall.name,
          args: lastToolCall.args,
          ts: Date.now()
        });
      }
    }

    // v0.79: 保存聊天历史到服务端
    if (userId && message && reply) {
      try {
        var historySvc = require('../services/buddy-chat-history');
        historySvc.appendMessage(userId, 'user', message);
        historySvc.appendMessage(userId, 'buddy', reply);
      } catch(e) {
        console.warn('[buddy-history] 保存历史失败:', e.message);
      }
    }

    // v0.66: 流式输出 — 当 query stream=1 时，reply 文本分块 SSE 推送，最后发 action JSON
    var isStream = req.query && req.query.stream === '1';
    if (isStream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      // 分块推送 reply 文本（每块 3-6 字，模拟流式）
      var chunks = reply.match(/.{1,6}/g) || [reply || ''];
      for (var si = 0; si < chunks.length; si++) {
        if (!res.headersSent || res.writableEnded) break;
        res.write('data: ' + JSON.stringify({ type: 'text', chunk: chunks[si] }) + '\n\n');
        // 微延时模拟流式（最后一块不延时）
        if (si < chunks.length - 1) await new Promise(r => setTimeout(r, 30));
      }
      // 发 action
      if (!res.writableEnded) {
        res.write('data: ' + JSON.stringify({
          type: 'action',
          action: actionRequirement ? {
            mode: actionRoute.mode,
            capabilities: actionRoute.capabilities,
            confidence: actionRoute.confidence,
            requires_confirmation: actionRoute.requires_confirmation,
            requirementId: actionRequirement.id,
            status: buddyAction.snapshotActionState(actionRequirement.id),
            _action: officeAction ? { officeV3: officeAction } : undefined,
          } : null,
        }) + '\n\n');
      }
      if (!res.writableEnded) res.end();
    } else {
      // v0.79: 标记 plan_status='done'，让 fetch_url 等无 assist_* 字段的 single_action 也能停轮询
      if (actionRequirement) {
        try {
          const reqStore = require('../stores/requirement-store');
          reqStore.update(actionRequirement.id, { plan_status: 'done' });
        } catch (e) { /* 非关键，不阻断响应 */ }
      }
      return res.json({
        reply: reply,
        action: actionRequirement ? {
          mode: actionRoute.mode,
          capabilities: actionRoute.capabilities,
          confidence: actionRoute.confidence,
          requires_confirmation: actionRoute.requires_confirmation,
          requirementId: actionRequirement.id,
          status: buddyAction.snapshotActionState(actionRequirement.id),
          _action: officeAction ? { officeV3: officeAction } : undefined,
        } : null,
      });
    }
  } catch (e) {
    console.error('[agent-buddy] 错误:', e);
    // 非关键错误：给用户一个友好兜底，不让前端报 500
    if (!res.headersSent) {
      return res.json({
        reply: '我刚才有点卡住了，您能不能再说一遍？' + (e.message ? ' (错误: ' + e.message + ')' : '')
      });
    }
  }
});

// ── v0.94 (P5): Office V3 编辑动作生成器 ──────────────

/** 从用户指令推断 Office 文档类型（word/xlsx/slides） */
function guessOfficeKind(message) {
  // 单元格地址模式：把B2改成 / 将E7改为 / B2填 等（避免 P5 这类产品名误判——要求后面紧跟编辑动词）
  if (/(把|将)?[A-Z]{1,2}\d{1,3}(改成|改为|修改|更新|设置|填|加上|清除)/.test(message)) return 'xlsx';
  if (/excel|xlsx|表格|sheet|工作簿|单元格|行|列|数据/.test(message)) return 'xlsx';
  if (/ppt|pptx|幻灯片|演示文稿|slides/.test(message)) return 'slides';
  return 'word';
}

/**
 * 确定性提取用户指令中明确给出的新文本（防止 LLM 编造/改写）。
 * 命中"改成：XXX / 改为XXX / 替换为XXX / 换成XXX"等模式 → 返回新文本。
 * 提取失败返回 null（此时才依赖 LLM 的 newText 生成）。
 */
function extractExplicitNewText(instruction) {
  const text = String(instruction || '');
  // 带引号优先：改成"XXX" / 改为'XXX'
  let m = text.match(/(?:改成|改为|替换为|换成|更新为|修改为|加上)[:：]?\s*["“']([^"”']{1,80})["”']/);
  if (m && m[1] && m[1].trim()) return m[1].trim();
  // 无引号：改成：XXX（到句号/分号/逗号/换行截止）
  m = text.match(/(?:改成|改为|替换为|换成|更新为|修改为)[:：]?\s*([^。；;\n，,]{1,80})/);
  if (m && m[1] && m[1].trim()) return m[1].trim();
  return null;
}

/** POST /api/agent-buddy/office-action — 前端组装文档摘要后调用，LLM 生成精确编辑动作
 *  body: { kind:'word'|'slides'|'xlsx', docContext:{...}, instruction:'用户指令' }
 *  resp: { ok:true, action:{ kind, op, ... } } 或 { ok:false, error }
 */
router.post('/office-action', async function(req, res) {
  try {
    var body = req.body || {};
    var kind = body.kind === 'xlsx' || body.kind === 'slides' ? body.kind : 'word';
    var instruction = String(body.instruction || '').slice(0, 600);
    var docContext = body.docContext || null;
    if (!instruction) return res.json({ ok: false, error: '缺少 instruction' });
    if (!docContext) return res.json({ ok: false, error: '缺少 docContext（前端需先组装文档摘要）' });

    var modelStore = require('../stores/model-store');
    var llmAdapter = require('../services/llm-adapter');
    var model = modelStore.getDefaultGenModel();
    if (!model) return res.json({ ok: false, error: '未配置生成模型' });

    // 确定性提取用户明确给出的新文本（防 LLM 编造）
    var fixedNewText = extractExplicitNewText(instruction);
    var fixedHint = fixedNewText
      ? '\n用户明确要求写入的新文本/值是：' + JSON.stringify(fixedNewText) + '。newText/value/formula 字段必须逐字等于它，严禁改写。'
      : '';

    var docPrompt = '';
    if (kind === 'word') {
      docPrompt = '文档是 Word（按段落 block 组织，blockIdx 从 0 开始）：\n'
        + (docContext.blocks || []).map(function(b) { return '[' + b.i + '] ' + String(b.text || '').slice(0, 120); }).join('\n');
    } else if (kind === 'slides') {
      docPrompt = '文档是 PPT（当前第 ' + (docContext.slideIdx != null ? docContext.slideIdx : 0) + ' 页的文本框，textBoxIdx 从 0 开始）：\n'
        + (docContext.texts || []).map(function(t) { return '[' + t.i + '] ' + String(t.text || '').slice(0, 120); }).join('\n');
    } else {
      docPrompt = '文档是 Excel（sheetId 形如 sheet1/sheet2，单元格地址形如 A1）：\n'
        + (docContext.sheets || []).map(function(s) {
          var rows = (s.rows || []).map(function(r) { return r.map(function(c) { return c == null ? '' : c; }).join('|'); }).join('\n');
          return 'sheetId=' + s.id + ' name=' + s.name + ':\n' + rows;
        }).join('\n---\n');
    }

    var system = '你是 Office 文档编辑动作生成器。根据用户指令和文档摘要，输出严格 JSON 动作，不要输出其他文字。\n'
      + '文档类型 word 的动作格式：{"op":"proposeEdit","blockIdx":N,"newText":"修改后的完整段落文本"}\n'
      + '文档类型 slides 的动作格式：{"op":"proposeEdit","textBoxIdx":N,"newText":"修改后的完整文本框文本"}\n'
      + '文档类型 xlsx 的动作格式：{"op":"propose","summary":"一句话说明","operations":[{"op":"set_cell","sheetId":"sheet1","address":"A1","value":"..."}]}\n'
      + 'xlsx 支持的 op：set_cell（写值）、set_formula（写公式，value 换成 formula 字段）、clear_cell、rename_sheet（address 换成 newName）、add_sheet（name 字段）、delete_sheet、set_range（批量写，cells 字段 {"A1":"v"}）、sort_range（range+key）、add_chart（range+kind）。\n'
      + '规则：\n'
      + '- blockIdx/textBoxIdx/sheetId/address 必须从文档摘要中选取真实存在的，禁止编造。\n'
      + '- **如果用户指令明确给出了新文本（例如"改成：XXX"/"改为XXX"），newText/value 必须逐字采用用户给的新文本（只去掉"改成/改为"等引导词），严禁自行改写或发挥。**\n'
      + '- 用户没有给出新文本、只说了意图（如"把标题加粗"）而文档摘要无法支撑该格式操作时 → 输出 {"op":"none","error":"简短原因"}。\n'
      + '- 用户没指定具体位置时，选择最贴近指令语义的段落/单元格。\n'
      + '示例（word）：文档摘要：[0] 产品周报 / [1] 本周完成三个功能。指令：把第1段改成：本周完成五个功能。输出：{"op":"proposeEdit","blockIdx":1,"newText":"本周完成五个功能"}。\n'
      + '示例（xlsx）：sheet1 有 A1:D4。指令：把 D4 改成 SUM 公式。输出：{"op":"propose","summary":"设置合计公式","operations":[{"op":"set_formula","sheetId":"sheet1","address":"D4","formula":"=SUM(D2:D3)"}]}。\n'
      + fixedHint + '\n';

    var result = await llmAdapter.callLLM(model.id, [
      { role: 'system', content: system },
      { role: 'user', content: '文档摘要：\n' + docPrompt + '\n\n用户指令：' + instruction },
    ], { maxTokens: 700, temperature: 0.1, caller: 'agent-buddy-office-action' });

    var content = typeof result === 'string' ? result : (result && result.content) || '';
    console.log('[office-action] LLM 原始输出 >>>', JSON.stringify(content).slice(0, 500));
    var action = null;
    try {
      var start = content.indexOf('{');
      var end = content.lastIndexOf('}');
      if (start >= 0 && end > start) action = JSON.parse(content.slice(start, end + 1));
    } catch (e) {
      console.warn('[office-action] LLM 输出非 JSON:', content.slice(0, 200));
    }
    if (!action || !action.op) {
      return res.json({ ok: false, error: '无法生成编辑动作：' + String(content || 'LLM 无输出').slice(0, 200) });
    }
    // 确定性覆盖：用户明确给的新文本优先于 LLM 生成（防编造）
    if (fixedNewText) {
      if (action.newText != null) action.newText = fixedNewText;
      if (action.value != null) action.value = fixedNewText;
      if (action.op === 'set_formula' && action.formula != null) action.formula = fixedNewText;
      if (action.operations && Array.isArray(action.operations)) {
        action.operations.forEach(function(op) {
          if (op.newText != null) op.newText = fixedNewText;
          if (op.value != null) op.value = fixedNewText;
          if (op.op === 'set_formula' && op.formula != null) op.formula = fixedNewText;
        });
      }
    }
    action.kind = kind;
    if (action.op === 'none') {
      return res.json({ ok: false, error: action.error || '无法匹配文档内容' });
    }
    return res.json({ ok: true, action: action });
  } catch (e) {
    console.error('[office-action] 错误:', e.message);
    return res.json({ ok: false, error: e.message });
  }
});

// ── v0.74: Tool Retriever 管理 API ──────────────

/** GET /api/agent-buddy/tool-retriever/status — 查看当前检索器状态 */
router.get('/tool-retriever/status', function(req, res) {
  return res.json(toolRetriever.status());
});

/** POST /api/agent-buddy/tool-retriever/mode — 切换检索模式 */
router.post('/tool-retriever/mode', function(req, res) {
  var newMode = req.body && req.body.mode;
  if (newMode !== 'keyword' && newMode !== 'embedding' && newMode !== 'bge') {
    return res.status(400).json({ ok: false, error: 'mode must be "keyword", "bge", or "embedding"' });
  }
  var ok = toolRetriever.setMode(newMode);
  return res.json({ ok: ok, mode: toolRetriever.getMode() });
});

/** GET /api/agent-buddy/suggestion — 获取主动建议（v0.80） */
router.get('/suggestion', async function(req, res) {
  var userId = req.user ? (req.user.id || req.user.userId) : 'system';
  
  try {
    var suggestionSvc = require('../services/agent-buddy-suggestion');
    
    if (!suggestionSvc.shouldGenerate(userId)) {
      return res.json({ ok: true, suggestions: [], reason: '建议生成冷却中' });
    }
    
    var result = await suggestionSvc.generateSuggestions(userId);
    suggestionSvc.recordSuggestionGen(userId);
    
    return res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[agent-buddy] 建议生成失败:', e);
    return res.json({ ok: false, error: e.message, suggestions: [] });
  }
});

/** POST /api/agent-buddy/tool-retriever/test — 测试检索效果 */
router.post('/tool-retriever/test', async function(req, res) {
  var query = req.body && req.body.query;
  var topK = req.body && req.body.topK ? parseInt(req.body.topK) : 5;
  if (!query) return res.status(400).json({ ok: false, error: 'query required' });
  try {
    var results = await toolRetriever.retrieve(query, topK);
    return res.json({
      ok: true,
      mode: toolRetriever.getMode(),
      query: query,
      topK: topK,
      toolsCount: toolRetriever.status().toolsCount,
      results: results,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// 初始化 tool retriever（后台加载，不阻塞）
try {
  setTimeout(function() {
    toolRetriever.init().then(function(s) {
      console.log('[agent-buddy] 🔧 tool-retriever 就绪:', s.mode, (s.count || s.toolsCount || 0), 'tools');
    }).catch(function(e) {
      console.warn('[agent-buddy] tool-retriever init warning:', e.message);
    });
  }, 1000);
} catch (e) {
  console.warn('[agent-buddy] tool-retriever init error:', e.message);
}

module.exports = router;