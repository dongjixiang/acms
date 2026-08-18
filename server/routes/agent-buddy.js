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
// v0.102 架构调整：计数降噪——loginCount 超阈值只显示"老用户"（914 次无决策价值），
//   保留高频视图（限 6 个）+ 上次在看（行为信号）
function buildUserSummary(context) {
  if (!context) return '';
  const parts = [];
  const loginCount = context.loginCount || 0;
  if (loginCount > 30) parts.push('老用户');
  else if (loginCount > 0) parts.push('见过 ' + loginCount + ' 次');
  const views = context.knownViews || [];
  if (views.length > 0) parts.push('常用 ' + views.slice(0, 6).join('、'));
  if (context.lastView) parts.push('上次在看「' + context.lastView + '」');
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

    // v0.61: L2 动作上下文——读 recent_actions（最近操作）
    // v0.102 架构调整：只保留语义动作（act: 前缀），过滤 UI 噪音（btn:/toast:/view: 点击事件对 LLM 无决策价值）
    var recentActions = [];
    if (userId) {
      var savedActions = loadMemory(userId, 'recent_actions');
      if (Array.isArray(savedActions)) {
        var deduped = [];
        var seenActs = {};
        for (var i = (savedActions.length - 1); i >= 0; i--) {
          var a = savedActions[i];
          var act = (a && a.action) || '';
          if (act.indexOf('btn:') === 0 || act.indexOf('toast:') === 0) continue;  // 丢弃 UI 点击/弹窗噪音
          if (!seenActs[act]) {
            seenActs[act] = true;
            deduped.push({ action: act, view: a.view });
          }
          if (deduped.length >= 3) break;  // 只保留 3 条语义动作
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

    // v0.102 架构调整：删除 v0.61 UI 动作推断的行为纠正（act:close ≠ 纠正，误报率高）。
    //   纠正信号只认语言层 learn: 语法（learned_facts），由 LLM 显式记录，不靠猜。

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
                        // v0.102: 字段归一化——LLM 可能输出 summary/content/摘要 等字段名，统一成 text
                        //   否则 saveSummary 存了无 text 的对象，注入端拼出"历史摘要：undefined"
                        summary.text = summary.text || summary.summary || summary.content || summary['摘要'] || '';
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
    // v0.102: 历史摘要兜底——chatSummary.text 不存在（旧数据/生成失败）时不拼 undefined
    var historyHint = (chatSummary && chatSummary.text)
      ? '；历史摘要：' + String(chatSummary.text).slice(0, 200)
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
      // v0.102: Memory 注入预算——总长上限 500 字符（超出截断，防止噪音膨胀挤占工具上下文）
      userSummary: (function() {
        var raw = buildUserSummary(context) + actionHint + learnHint + historyHint;
        return raw.length > 500 ? raw.slice(0, 500) + '…' : raw;
      })(),
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
    // v0.96.2 (P138 修复 + office_edit 语义): 把 currentView/fileName 注入 router，让 LLM 知道前端打开了什么
    //   才能区分「在打开的 Word 里写」(office_edit) vs 「生成新文档」(document_generation)
    var actionRoute = await buddyAction.routeMessage(model.id, message, context.history || [], {
      currentView: context.currentView || '',
      fileName: context.fileName || context.openFileName || '',
    });
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
    // v0.100 (2026-08-18): 行为纠正检测修复 — 捕获 LLM 最后调用的工具名
    //   之前 672 行用未定义的 result.toolCalls（主路径变量是 runtimeResult）→ 恒 false
    //   这里通过 onProgress 的 tools 参数捕获（llm-adapter 传 [tc.name]），非流式也生效
    var _lastToolInfo = null;
    var _ssePush = null;  // v0.100: 显式声明（原代码隐式全局，并发请求会互相污染）
    try {
      if (officeAction) {
        // P5: office_edit 不走 tool-loop，reply 由前端动作卡接管（生成器端点负责精确参数）
        runtimeResult = { content: '好的，我来帮你编辑' + (officeAction.kind === 'word' ? ' Word 文档' : officeAction.kind === 'xlsx' ? ' Excel 表格' : ' PPT 演示文稿') + '。' };
      } else if (hasSkills) {
        console.log('[agent-buddy DEBUG] 开始 runToolLoop, model:', model.id, 'toolNames:', JSON.stringify(toolNames));
        // v0.96: SSE 进度推送 — 直接写（headers 未发送时），同时缓冲一份等 writeHead 后补发
        var _sseBuffer = null;
        var _isStream = req.query && req.query.stream === '1';
        if (_isStream) {
          _sseBuffer = [];
        }
        // v0.100: 统一 onProgress —— 流式时推送进度，非流式只捕获工具名（行为纠正检测用）
        _ssePush = function(round, maxRounds, msg, tools) {
          if (Array.isArray(tools) && tools.length > 0) {
            _lastToolInfo = { name: tools[tools.length - 1], ts: Date.now() };
          }
          if (!_isStream) return;
          if (msg.indexOf('正在生成任务总结') >= 0) return;
          if (msg.indexOf('调用工具:') < 0) return;
          var line = 'data: ' + JSON.stringify({ type: 'progress', round: round, total: maxRounds, msg: msg }) + '\n\n';
          _sseBuffer.push(line);
          console.log('[agent-buddy] SSE progress buffered:', msg.slice(0, 80));
        };
        runtimeResult = await runtimeExec({
          modelId: model.id,
          messages,
          toolNames,
          maxRounds: 8,
          maxTokens: 4000,  // v0.75: 提高上限，避免 plan_execute 的 6 步骤 JSON 被截断
          context: sharedCtx,
          caller: 'agent-buddy',
          actionMode: actionRoute.mode,
          onProgress: _ssePush,
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
      // v0.100 (2026-08-18) 修复：原代码用未定义的 result.toolCalls（主路径变量是 runtimeResult，
      //   且 runToolLoop 返回对象里 toolCalls 恒为 []）→ 条件恒 false → 从不写入 → 行为纠正检测从未生效
      //   现改用 onProgress 捕获的最后工具名（_lastToolInfo，含 officeAction/callLLM 分支的 null 保护）
      if (_lastToolInfo) {
        saveMemory(userId, 'last_buddy_tool_call', {
          action: _lastToolInfo.name,
          args: null,
          ts: _lastToolInfo.ts
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
      // v0.96: 立即 flush，确保后续进度事件不会被缓冲
      if (typeof res.flush === 'function') res.flush();
      // v0.96: flush 缓冲的 progress 事件（在 writeHead 之后）
      if (_sseBuffer && _sseBuffer.length > 0) {
        console.log('[agent-buddy] Flushing', _sseBuffer.length, 'progress events');
        for (var pi = 0; pi < _sseBuffer.length; pi++) {
          try { res.write(_sseBuffer[pi]); } catch(e) { console.log('[agent-buddy] progress write error:', e.message); break; }
        }
        _sseBuffer = null;
      } else {
        console.log('[agent-buddy] No progress events to flush (buffer empty)');
      }
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

// 修复 LLM 输出的 JSON：字符串值内未转义的 ASCII 引号 → \"（状态机扫描）
// LLM 常把文档原文里的 " 直接复制进 newText/value，不转义，导致 JSON.parse 失败
function repairJsonQuotes(str) {
  var out = '';
  var inString = false;
  var escaped = false;
  for (var i = 0; i < str.length; i++) {
    var ch = str[i];
    if (inString) {
      if (escaped) { out += ch; escaped = false; continue; }
      if (ch === '\\') { out += ch; escaped = true; continue; }
      if (ch === '"') {
        // 字符串值内的裸引号：检查后面是否紧跟结构符（, } ] : 空白）——key 结束引号后是 ':'，值结束引号后是 , } ] 空白
        var next = i + 1 < str.length ? str[i + 1] : '';
        var isCloser = /[\s,}\]\[:]/.test(next) || next === '';
        if (isCloser) { out += '"'; inString = false; }  // 正常字符串结束
        else out += '\\"';  // 裸引号 → 转义
        continue;
      }
      out += ch;
    } else {
      if (ch === '"') { inString = true; out += ch; }
      else out += ch;
    }
  }
  return out;
}

/**
 * POST /api/agent-buddy/office-action mode='html-deck' — PPT AI 专用路径
 *
 * 背景：GenOffice slides-ui bundle 的 AI 面板期望 LLM 输出完整 deck HTML（每页一个
 *       <section class="slide">），bundle 自己有 HTML→pptx 流水线（generateFromHtml）。
 *       范式跟 word/xlsx 的"动作 JSON op"完全不同，单独走一条路径。
 *
 * 输入：{ kind:'slides', mode:'html-deck', docContext:{...}, instruction:'用户指令', settings:{...} }
 * 输出：{ ok:true, html:'<section class="slide">...</section>...' }
 */
async function handleOfficeHtmlDeck(req, res, body) {
  var instruction = String(body.instruction || '').slice(0, 2000);
  var docContext = body.docContext || {};
  if (!instruction) return res.json({ ok: false, error: '缺少 instruction' });

  var modelStore = require('../stores/model-store');
  var llmAdapter = require('../services/llm-adapter');
  var model = modelStore.getDefaultGenModel();
  if (!model) return res.json({ ok: false, error: '未配置生成模型' });

  // 当前 deck 上下文（slides 数量 + 大致内容）
  var deckSummary = '';
  if (Array.isArray(docContext.slides) && docContext.slides.length) {
    deckSummary = '当前 deck 共 ' + docContext.slides.length + ' 页：\n'
      + docContext.slides.map(function (s, i) {
        var title = s.title ? (' 标题="' + String(s.title).slice(0, 60) + '"') : '';
        var body = s.body ? (' 内容="' + String(s.body).slice(0, 120) + '"') : '';
        var note = s.notes ? (' 备注="' + String(s.notes).slice(0, 80) + '"') : '';
        return '[第' + (i + 1) + '页]' + title + body + note;
      }).join('\n');
  } else {
    deckSummary = '当前 deck 为空（新文档）';
  }

  // 系统 prompt：让 LLM 输出严格 HTML deck（bundle 期望的格式）
  var systemPrompt = '你是 PPT deck HTML 生成器。根据用户指令和当前 deck 摘要，输出完整 deck 的 HTML。\n\n'
    + '【严格输出格式】\n'
    + '- 整个 deck 用一个根元素 <div class="deck"> 包裹\n'
    + '- 每页幻灯片是一个 <section class="slide">，里面包含多个块元素（h1/h2/h3/p/ul/ol/blockquote 等）\n'
    + '- 标题用 <h1>（页标题）或 <h2>（副标题）\n'
    + '- 正文段落用 <p>\n'
    + '- 列表用 <ul><li>...</li></ul> 或 <ol><li>...</li></ol>\n'
    + '- 关键数据用 <strong> 或 <em> 强调\n'
    + '- **不要**输出任何 HTML 之外的文字（不要"以下是..."、"好的..."、代码块围栏 ```html``` 等）\n'
    + '- **不要**输出 <html>/<head>/<body> 这种外层结构——只输出 deck 内容\n'
    + '- **不要**输出 <style>/<script>\n\n'
    + '【编辑模式 vs 新建模式】\n'
    + '- 用户说"创建/生成/写一个XX主题的PPT" → 输出全新 deck（覆盖现有）\n'
    + '- 用户说"美化/改进/润色/修改当前的PPT" → 输出基于现有 deck 的修订版本（保留原结构，只改内容）\n'
    + '- 用户说"在第N页加一段" → 输出完整 deck 但在第N页追加指定内容\n\n'
    + '【质量要求】\n'
    + '- 每页 3-8 个块元素（标题 + 2-6 个内容块）\n'
    + '- 内容真实可信，不要空洞套话（"在这个时代..."、"让我们一起..."）\n'
    + '- 总页数 5-15（除非用户指定）\n'
    + '- 中文输出，配少量英文术语（IT/商业/技术类内容常见）';

  var userMsg = '当前 deck 摘要：\n' + deckSummary + '\n\n用户指令：' + instruction;

  try {
    var result = await llmAdapter.callLLM(model.id, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg }
    ], { maxTokens: 8000, temperature: 0.7, caller: 'agent-buddy-office-html-deck' });

    var html = typeof result === 'string' ? result : (result && result.content) || '';
    if (!html.trim()) {
      return res.json({ ok: false, error: 'LLM 未返回 HTML 内容' });
    }
    // 简单清洗：去掉外层 ```html``` 围栏（部分模型会包）
    html = html.replace(/^\s*```html?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    console.log('[office-html-deck] 生成 HTML 长度:', html.length, '预览:', html.slice(0, 200));
    return res.json({ ok: true, html: html });
  } catch (e) {
    console.error('[office-html-deck] LLM 异常:', e.message);
    return res.json({ ok: false, error: 'AI 处理失败：' + (e.message || String(e)) });
  }
}

/** POST /api/agent-buddy/office-action — 前端组装文档摘要后调用，LLM 生成精确编辑动作
 *  body: { kind:'word'|'slides'|'xlsx', docContext:{...}, instruction:'用户指令' }
 *  resp: { ok:true, action:{ kind, op, ... } } 或 { ok:false, error }
 */
router.post('/office-action', async function(req, res) {
  try {
    var body = req.body || {};
    var mode = body.mode || 'action-json';
    // v0.97.x: PPT AI HTML-deck 模式（slides-ui bundle 期望 LLM 输出完整 deck HTML，
    //          而不是 JSON 动作 op——范式跟 word/xlsx 完全不同，单独走一条路径）
    if (mode === 'html-deck') {
      return await handleOfficeHtmlDeck(req, res, body);
    }
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
      docPrompt = '文档是 Word（按段落 block 组织，blockIdx 从 0 开始；格式标注：type=段落类型 docParagraph|docHeading|docListItem，level=标题级别，kind=列表类型 bullet|numbered，marks=段内字符格式，size=字号（半磅，24=12pt），color=文字颜色（十六进制无#），font=字体名，highlight=高亮，align=对齐方式，indentFirstLine=首行缩进）：\n'
        + (docContext.blocks || []).map(function(b) {
            var fmt = [];
            if (b.type) fmt.push('type=' + b.type);
            if (b.level != null) fmt.push('level=' + b.level);
            if (b.kind) fmt.push('kind=' + b.kind);
            if (b.align) fmt.push('align=' + b.align);
            if (b.indentFirstLine != null) fmt.push('indentFirstLine=' + b.indentFirstLine);
            if (b.marks) {
              var ms = [];
              if (b.marks.bold) ms.push('bold');
              if (b.marks.italic) ms.push('italic');
              if (b.marks.underline) ms.push('underline');
              if (b.marks.strike) ms.push('strike');
              if (ms.length) fmt.push('marks=' + ms.join('+'));
            }
            // v0.96.9: docTextStyle 聚合（字号/颜色/字体/高亮）——LLM 排版时能感知并修改
            if (b.textStyle) {
              if (b.textStyle.sizeHalfPoints != null) fmt.push('size=' + b.textStyle.sizeHalfPoints);
              if (b.textStyle.color) fmt.push('color=' + b.textStyle.color);
              if (b.textStyle.font) fmt.push('font=' + b.textStyle.font);
              if (b.textStyle.highlight) fmt.push('highlight=' + b.textStyle.highlight);
            }
            // 防 JSON 破坏：文本里的 ASCII 引号统一转成中文引号（LLM 复制出来不会破坏 JSON）
            var safeText = String(b.text || '').replace(/"/g, '\u201C').replace(/\\/g, '/');
            var selMark = b.selected ? '[已选中]' : '';
            return '[' + b.i + ']' + selMark + (fmt.length ? '(' + fmt.join(',') + ')' : '') + ' ' + safeText.slice(0, 120);
          }).join('\n');
      // v0.96.9: 选中文字原文——润色/总结/插图生成器必须基于它精确处理（不能只靠 block 摘要）
      if (docContext.selectionText) {
        docPrompt += '\n【用户选中的文字原文】' + String(docContext.selectionText).slice(0, 500).replace(/"/g, '\u201C').replace(/\\/g, '/');
      }
    } else if (kind === 'slides') {
      docPrompt = '文档是 PPT（当前第 ' + (docContext.slideIdx != null ? docContext.slideIdx : 0) + ' 页的文本框，textBoxIdx 从 0 开始）：\n'
        + (docContext.texts || []).map(function(t) { return '[' + t.i + '] ' + String(t.text || '').slice(0, 120); }).join('\n');
    } else {
      docPrompt = '文档是 Excel：\n'
        + (docContext.sheets || []).map(function(s) {
          var rows = (s.rows || []).map(function(r) { return r.map(function(c) { return c == null ? '' : c; }).join('|'); }).join('\\n');
          return 'sheetId=' + s.id + ' name=' + s.name + ':\\n' + rows;
        }).join('\\n---\\n');
      // v0.97: sheetId 必须以文档摘要中给出的为准（如 sheet-1），严禁自造（如 sheet1）
      // v0.97.1: 措辞放宽——禁止自造【不存在的】sheetId（编一个文档里没有的 id），但允许从现有 sheets 中挑选第一个/最近一个
      docPrompt += '\\n【sheetId 硬规则】operations 里的 sheetId 必须从文档摘要中【已有】的 sheetId= 值里选取一个（例如 sheet-1），**禁止**自造文档里不存在的 id（如 sheet1 省略连字符、Sheet2 等）。用户没指定 sheet 时，从现有 sheets 中挑第一个即可。';
      // v0.97.1: 通用填充规则——用户说"生成/填充/写一些数据/测试数据"没指定位置时的默认行为
      docPrompt += '\\n【通用填充规则】用户说"生成/填充/写一些数据/测试数据/示例数据/假数据"且**未指定 sheet/位置/列结构**时：默认使用 docsContext.sheets[0]（第一个 sheet）；从 A1 开始填写（若 A1 已有表头文字，则从已有数据末尾的下一行开始，避免覆盖）；按 3-5 列的通用列结构（姓名/编号|项目/名称|数值/分数/金额|日期 等合理组合）填充 5-10 行真实感的示例数据。**禁止**输出 op:none 拒绝。';
      // v0.97.1: 行/列推断规则——address 必须用 A1、B2 这种字母+数字形式，禁止写"sheet1 第3行"
      docPrompt += '\\n【address 推断规则】address 必须是 A1 引用样式（字母列+数字行，如 A1/B2/E7），禁止写中文行号或描述性位置（如"第3行"/"第三列"/"中间"）。';
      // 若摘要没有任何 sheet 信息（极少见：工作簿刚加载未就绪），才允许返回 none
      docPrompt += '\\n若摘要中没有任何 sheet 信息（sheets=[] 或为空），才回复 {"op":"none","error":"工作簿尚未就绪，请稍后重试"}。';
    }

    var system = '你是 Office 文档编辑动作生成器。根据用户指令和文档摘要，输出严格 JSON 动作，不要输出其他文字。\\n'
      + '【动作 op 类型】\\n'
      + '- proposeEdit（word/slides）：替换指定位置的现有文本。格式 {"op":"proposeEdit","blockIdx":N,"newText":"..."} 或 {"op":"proposeEdit","textBoxIdx":N,"newText":"..."}\\n'
      + '- proposeEdits（word/slides，v0.96.7）：批量替换多个段落的文本（用于润色全文/改写多处）。格式 {"op":"proposeEdits","operations":[{"blockIdx":N,"newText":"..."},...]}。每段 newText 必须是润色改写后的完整新文本，保持原意。\\n'
      + '- appendAll（word/slides）：在文档末尾追加新内容（不替换现有文本）。格式 {"op":"appendAll","newText":"完整要追加的内容"}。多个段落用 \\n\\n 分隔。\\n'
      + '- insertAfter（word/slides）：在某段后插入新段落。格式 {"op":"insertAfter","blockIdx":N,"newText":"完整的新段落文本"}。\\n'
      + '- formatOps（word，v0.96.7/v0.96.9）：批量格式调整（只改格式不改文字）。格式 {"op":"formatOps","operations":[{"blockIdx":N,"format":{...}}]}。format 支持的字段：heading（0=转正文，1..9=标题级别）、kind（"bullet"|"numbered"|"none"）、bold/italic/strike/underline（true/false）、sizeHalfPoints（字号，半磅：24=12pt，22=11pt，28=14pt，44=22pt二号）、font（字体名，如"宋体"/"微软雅黑"/"楷体"）、color（文字颜色，十六进制无#，如 FF0000）、highlight（高亮，十六进制无#或颜色名，如 FFFF00/yellow）、align（"left"|"center"|"right"|"justify"）、indentFirstLine/indentLeft/indentRight（缩进，整数）、lineSpacing（行距，数值）、spaceBefore/spaceAfter（段前段后间距，整数）、shadingFill（段落底纹，十六进制无#）。未提及的字段保持原样。\\n'
      + '- insertAfterSelection（word，v0.96.9）：把新文本插入到用户选中区域之后（**原文保留不动**，用户自行对比取舍）。用于\"对选中文字润色/总结/改写/翻译\"类指令。格式 {"op":"insertAfterSelection","newText":"润色/总结/改写后的完整文本","summary":"一句话说明"}。newText 只针对【用户选中的文字原文】，不要包含未选中的内容。\\n'
      + '- generateImage（word，v0.96.9/v0.97）：有选区时根据选中文字生成插图。无选区时由前端 appendAll 自动触发配图（用户的"写文章+配图"场景），LLM 不需要输出此 op。\\n'
      + '- insertImagesAtContent（word，v0.97+）：为【已有文章】批量配图。场景是用户选中已有正文说"给文章配图/在文章恰当位置配图"且无选区编辑意图（不是"对某段润色"）。LLM 必须：(1) 分析文档摘要抽取关键元素（人物/场景/动物/物品）；(2) 决策 3-5 张图（段落数 / 3 向上取整，最多 6 张）；(3) 每张选 afterBlockIdx（在该段之后插入）；(4) 写 globalStyle 统一风格（用户指定则用用户的，如"水墨"/"赛博朋克"；未指定则省略，前端用通用风格）；(5) 每张写具体 prompt（主角+场景+动作+氛围）。格式 {"op":"insertImagesAtContent","summary":"一句话说明","globalStyle":"统一风格描述，可省略","images":[{"afterBlockIdx":N,"prompt":"该图的具体画面","reason":"为什么这里适合插图"},...]}。**严禁**输出 op:none ——"给文章配图"是有明确意图的指令。\\n'
      + '- addSmartart（slides，v0.96.8）：在幻灯片上插入 SmartArt 图形。格式 {"op":"addSmartart","slideIndex":N,"layout":"process","items":["第一项","第二项","第三项"],"summary":"一句话说明"}。layout 可选值：list/process/cycle/hierarchy/pyramid/matrix/venn。items 至少 2 项。\n'
      + '- propose（xlsx）：批量操作。格式 {"op":"propose","summary":"一句话说明","operations":[{"op":"set_cell",...}]}\n'
      + 'xlsx 支持的 op：set_cell、set_formula（value 换成 formula）、clear_cell、rename_sheet、add_sheet、delete_sheet、set_range、sort_range、add_chart。\n'
      + '【xlsx 格式硬规则 — v0.97 极重要】\n'
      + '- set_cell 的 value 只能是原始值（字符串/数字/布尔/null），**严禁**传对象。\n'
      + '- 写公式**必须**用 set_formula op：{"op":"set_formula","sheetId":"sheet-1","address":"E7","formula":"=C7*D7"}。\n'
      + '- **严禁**写成 {"op":"set_cell","address":"E7","value":{"formula":"=C7*D7"}} 或 {"op":"set_cell","address":"E7","formula":"=C7*D7"}——这两种都会校验失败。\n'
      + '- 示例：{"op":"set_formula","sheetId":"sheet-1","address":"E2","formula":"=C2*D2"}\n'
      + '【语义决策规则 — 极重要】\n'
      + '- **选区优先（v0.96.8/v0.96.9）**：文档摘要中标了 [已选中] 的 block 是用户选中的内容。用户指令含"润色/翻译/改写/排版/修改"等编辑意图且存在 [已选中] 标记时 → 只对 [已选中] 的 block 生成操作（proposeEdit/proposeEdits/formatOps 的 blockIdx 只能选 [已选中] 的），**严禁修改未选中的 block**。\\n'
      + '- **选中区域插入（v0.96.9）**：文档摘要含【用户选中的文字原文】且指令是"对选中的文字润色/总结/改写/翻译" → 输出 insertAfterSelection（newText 是针对选中文字的润色/总结/改写结果，**插入到选中区域之后，不修改不删除原文**）。"对选中内容生成插图/配图/插画" → 输出 generateImage。无选区时按以下规则全文操作。\\n'
      + '- 用户说「写一篇 XXX/作文/文章/内容/段落」且未指定位置时 → 优先用 appendAll（追加到文档末尾），除非文档明确要求替换某段。\\n'
      + '- **用户说「写文章+配图/插画/插图」或「XXX 不少于 N 张图」**（v0.97）：只输出 appendAll 写入全文。前端会根据文章结构自动插入插图并生成图片，LLM 不需要输出任何插图标记。\\n'
      + '- **用户说「给【已有文章】配图/在文章恰当位置配图/为文章生成插图」（v0.97+）**：文档非空且无 [已选中] 块 → 输出 insertImagesAtContent（不论用词：「给文章配图/为文章配图/配插图/通篇配图/均匀分布插图/图文并茂」等都命中）。这是「修改现有文档」类需求，不是「写新文章」类——和上面的写文章+配图规则**完全不同**。LLM 必须：分析文档摘要 → 抽取关键元素（人物/场景/动物/物品）→ 决策 3-5 张图的位置和内容。用户说「统一XX风格」时必须用 globalStyle 字段（"统一XX风格"是强约束，必须用）。\\n'
      + '- 用户说「改/编辑/替换/更新 + 第N段/第N个 + 成 XXX」 → proposeEdit（blockIdx/textBoxIdx 指向目标）。\n'
      + '- 用户说「润色全文/使表达更清晰流畅/改写全文/优化全文/通顺一些」 → proposeEdits（对每个需要润色的段落输出润色后的完整新文本，保持结构和原意；不需要改的段不要列出）。\n'
      + '- 用户说「整理排版/排版/修正标题层级/统一列表/去除加粗斜体/首行缩进/格式调整」 → formatOps（只输出格式字段，不改动任何文字内容）。标题层级：正文用 heading=0，各级标题用 heading=1..9（按文档结构和用户意图）。\n'
      + '- 用户说「在第N段后面加一段 XXX/在...之后插入」 → insertAfter（blockIdx=N）。\n'
      + '- 用户只给了内容（「写一篇春天的作文」）没指定位置/动作 → appendAll（避免破坏现有内容）。\n'
      + '- 用户说「清空/覆盖整篇文档/重写全部」 → appendAll（追加新版本到末尾，前端会让用户决定是否清空；不要输出"重写整篇"类型 op）。\n'
      + '【其他规则】\n'
      + '- blockIdx/textBoxIdx/sheetId/address 必须从文档摘要中选取真实存在的，禁止编造。appendAll/insertAfter 不要带 blockIdx（除非 insertAfter 必须带）。\n'
      + '- **如果用户指令明确给出了新文本（例如"改成：XXX"/"改为XXX"），newText/value 必须逐字采用用户给的新文本（只去掉"改成/改为"等引导词），严禁自行改写或发挥。**\n'
      + '- 用户没有给出新文本、文档摘要无法支撑任何动作时 → 输出 {"op":"none","error":"简短原因"}。**只有这一种情况才输出 none；润色和排版有专门 op，不要用 none 拒绝。**\n'
      + '- **严禁编造拒绝理由（v0.97+ 重要）**：输出 op:none 时，error 必须是真实可验证的原因（"文档为空"/"无段落信息"）。**严禁**用以下借口拒绝：(a) "文档编码乱码"/"内容乱码"；(b) "无法识别意图"（如果不是真的不识别）；(c) "格式不支持"——除非对应 op 真的不在支持列表。用户说"给文章配图"/"为文章配插图"/"根据文章内容配图"等任何配图表述，文档非空时 → 必须输出 insertImagesAtContent，不允许 none 拒绝。\n'
      + '- **思维链（v0.97+）**：在输出 JSON 之前，心中先过一遍：(1) 文档有哪些段落？摘要里能看出什么；(2) 用户指令核心意图是什么（写/改/排/配图）；(3) 哪个 op 匹配？禁止"看一眼就说看不懂"直接拒绝。\n'
      + '【示例】\n'
      + '- word 例 1（替换）：文档摘要：[0] 产品周报 / [1] 本周完成三个功能。指令：把第1段改成：本周完成五个功能。输出：{"op":"proposeEdit","blockIdx":1,"newText":"本周完成五个功能"}。\n'
      + '- word 例 2（追加，v0.96.2）：文档摘要：[0] 产品周报。指令：帮我写一篇春天的作文。输出：{"op":"appendAll","newText":"春天来了，柳树发芽..."}。\n'
      + '- word 例 3（插入）：文档摘要：[0] 引言 / [1] 正文 / [2] 结论。指令：在正文后面加一段：实验数据表明...。输出：{"op":"insertAfter","blockIdx":1,"newText":"实验数据表明..."}。\n'
      + '- word 例 4（润色全文，v0.96.7）：文档摘要：[0](type=docParagraph) 今天天气很好 / [1](type=docParagraph) 我们去了公园。指令：润色全文。输出：{"op":"proposeEdits","operations":[{"blockIdx":0,"newText":"今天天气格外晴朗，阳光明媚。"},{"blockIdx":1,"newText":"我们一同前往公园散步。"}]}。\n'
      + '- word 例 5（排版，v0.96.7）：文档摘要：[0](type=docParagraph,marks=bold) 第一章 背景 / [1](type=docParagraph) 正文内容。指令：整理排版，把第一段设为一级标题、去掉加粗。输出：{"op":"formatOps","operations":[{"blockIdx":0,"format":{"heading":1,"bold":false}}]}。\n'
      + '- word 例 6（选区润色，v0.96.9）：文档摘要：[0][已选中](type=docParagraph) 我们完成了多个项目 / 【用户选中的文字原文】我们完成了多个项目。指令：润色选中的文字。输出：{"op":"insertAfterSelection","newText":"我们顺利推进并交付了多个重要项目。","summary":"已生成润色版本，插入到选中文字之后"}。\n'
      + '- word 例 7（选区总结，v0.96.9）：文档摘要含【用户选中的文字原文】。指令：总结选中的文字。输出：{"op":"insertAfterSelection","newText":"摘要：本段主要说明项目推进与交付情况。","summary":"已生成摘要，插入到选中文字之后"}。\n'
      + '- word 例 8（选区插图，v0.96.9）：文档摘要含【用户选中的文字原文】。指令：根据选中的文字生成插图。输出：{"op":"generateImage","prompt":"一幅水墨风格插图，描绘春日的柳树与湖面，意境清新，留白构图","summary":"已根据选中文字生成插图描述"}。\n'
      + '- word 例 9（字号排版，v0.96.9）：文档摘要：[0](type=docHeading) 第一章 背景。指令：把选中的标题设为二号字并加粗。输出：{"op":"formatOps","operations":[{"blockIdx":0,"format":{"sizeHalfPoints":44,"bold":true}}]}（二号=22pt=44半磅）。\n'
      + '- word 例 10（写文章+配图，v0.97）：文档为空。指令：写一篇武侠小说配4张插图。输出：{"op":"appendAll","newText":"武侠全文内容..."}。前端会自动在文中插入插图并生成图片，LLM 只需输出 appendAll。\\n'
      + '- word 例 11（给已有文章配图，v0.97+）：文档摘要：[0] 江南水乡春景 / [1] 主角林风踏入小镇 / [2] 客栈内遇到老者。指令：给我根据文章内容在恰当的地方配置插图，统一水墨风格。输出：{"op":"insertImagesAtContent","summary":"已配置 3 张水墨插图","globalStyle":"中国水墨画，留白构图，写意为主","images":[{"afterBlockIdx":0,"prompt":"江南水乡全景，烟雨朦胧，小桥流水，水墨晕染","reason":"开篇场景"},{"afterBlockIdx":1,"prompt":"林风青衫仗剑立于小镇石桥上","reason":"主角首次出场"},{"afterBlockIdx":2,"prompt":"客栈内老者与林风对坐，烛光摇曳","reason":"关键人物互动场景"}]}。\\n'
      + '- word 例 12（给已有文章配图，未指定风格）：文档摘要：[0] 实验室全景 / [1] 科学家发现新元素 / [2] 实验结果发表。指令：帮我给文章配几张图。输出：{"op":"insertImagesAtContent","summary":"已配置 3 张通用插图","images":[{"afterBlockIdx":0,"prompt":"现代实验室全景，仪器林立，蓝色调","reason":"开篇场景"},{"afterBlockIdx":1,"prompt":"科学家专注观察显微镜下的样本","reason":"主角工作场景"},{"afterBlockIdx":2,"prompt":"科学家在学术会议上展示研究成果","reason":"成就场景"}]}。globalStyle 可省略，前端会用通用风格。\n'
      + '- xlsx：sheet1 有 A1:D4。指令：把 D4 改成 SUM 公式。输出：{"op":"propose","summary":"设置合计公式","operations":[{"op":"set_formula","sheetId":"sheet1","address":"D4","formula":"=SUM(D2:D3)"}]}。\n'
      + '- xlsx 通用填充（v0.97.1）：sheetId=sheet-1 name=Sheet1 内容为空或仅有 A1 表头"姓名|分数|日期"。指令：生成一些测试数据。输出：{"op":"propose","summary":"已生成 5 行测试数据","operations":[{"op":"set_cell","sheetId":"sheet-1","address":"A2","value":"张三"},{"op":"set_cell","sheetId":"sheet-1","address":"B2","value":92},{"op":"set_cell","sheetId":"sheet-1","address":"C2","value":"2024-03-15"},... 共5行]}。**禁止**输出 op:none 拒绝——"生成测试数据"是有明确意图的指令，用默认位置即可。\\n'
      + fixedHint + '\\n';

    var result = await llmAdapter.callLLM(model.id, [
      { role: 'system', content: system },
      { role: 'user', content: '文档摘要：\n' + docPrompt + '\n\n用户指令：' + instruction },
    ], { maxTokens: 3000, temperature: 0.1, caller: 'agent-buddy-office-action' });

    var content = typeof result === 'string' ? result : (result && result.content) || '';
    console.log('[office-action] LLM 原始输出 >>>', JSON.stringify(content).slice(0, 2000));
    var action = null;
    // v0.97: 支持多个 JSON 对象（appendAll + 多个 generateImage 分开输出）
    // 先尝试解析为单个 JSON（含 operations 数组）
    // JSON 容错解析
    function extractJson(text) {
      var results = [];
      var depth = 0, start = -1;
      for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        if (ch === '{') {
          if (depth === 0) start = i;
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0 && start >= 0) {
            var jsonStr = text.slice(start, i + 1);
            try {
              results.push(JSON.parse(jsonStr));
            } catch (e) {
              var repaired = repairJsonQuotes(jsonStr);
              try { results.push(JSON.parse(repaired)); } catch (e2) { /* skip */ }
            }
            start = -1;
          }
        }
      }
      return results;
    }
    var jsons = extractJson(content);
    if (jsons.length > 0) {
      // 如果只有一个 JSON，用它
      // 如果有多个，第一个作为主 action，后续合并到 operations
      action = jsons[0];
      if (jsons.length > 1) {
        // 把后续 JSON 收集到 operations
        var imgOps = jsons.slice(1).filter(function(j) { return j && j.op === 'generateImage'; });
        if (imgOps.length > 0) {
          if (!action.operations) action.operations = [];
          action.operations = action.operations.concat(imgOps);
        }
      }
      console.log('[office-action] 解析到', jsons.length, '个 JSON，主 op=', action.op, 'operations=', (action.operations || []).length);
    } else {
      console.warn('[office-action] LLM 输出非 JSON:', content.slice(0, 200));
    }
    if (!action || !action.op) {
      return res.json({ ok: false, error: '无法生成编辑动作：' + String(content || 'LLM 无输出').slice(0, 200) });
    }
    // v0.97: 支持 LLM 输出 operations 数组（如 appendAll + 多个 generateImage 组合）
    if (action.operations && Array.isArray(action.operations)) {
      // 过滤空操作
      action.operations = action.operations.filter(function(op) {
        if (op.op === 'generateImage') return op && String(op.prompt || '').trim() !== '';
        if (op.op === 'insertAfterSelection') return op && String(op.newText || '').trim() !== '';
        return true;
      });
      if (!action.operations.length) {
        return res.json({ ok: false, error: '生成的动作为空' });
      }
    }
    // proposeEdits/formatOps 过滤空 operation（newText 为空或 format 为空）
    if ((action.op === 'proposeEdits' || action.op === 'formatOps') && Array.isArray(action.operations)) {
      action.operations = action.operations.filter(function (op) {
        if (action.op === 'proposeEdits') return op && String(op.newText || '').trim() !== '';
        return op && op.format && Object.keys(op.format).length > 0;
      });
      if (!action.operations.length) {
        return res.json({ ok: false, error: '生成的编辑动作为空（LLM 未给出需要修改的内容）' });
      }
    }
    // v0.96.9: insertAfterSelection / generateImage 非空校验
    if (action.op === 'insertAfterSelection' && !String(action.newText || '').trim()) {
      return res.json({ ok: false, error: '生成的插入内容为空（LLM 未给出润色/总结结果）' });
    }
    if (action.op === 'generateImage' && !String(action.prompt || '').trim()) {
      return res.json({ ok: false, error: '生成的插图描述为空' });
    }
    // v0.97+: insertImagesAtContent 校验 — 给已有文章批量配图
    if (action.op === 'insertImagesAtContent') {
      if (!Array.isArray(action.images) || action.images.length === 0) {
        return res.json({ ok: false, error: 'insertImagesAtContent 缺少 images 数组' });
      }
      // 过滤空 prompt + 校验 afterBlockIdx 范围
      var maxBlockIdx = (docContext.blocks || []).length - 1;
      var validImages = [];
      var dropped = [];
      for (var imi = 0; imi < action.images.length; imi++) {
        var img = action.images[imi];
        if (!img || typeof img.prompt !== 'string' || !img.prompt.trim()) {
          dropped.push({ reason: 'prompt 为空', index: imi });
          continue;
        }
        if (typeof img.afterBlockIdx !== 'number' || img.afterBlockIdx < 0 || img.afterBlockIdx > maxBlockIdx) {
          // 越界：降级到 maxBlockIdx（最后一段之后）
          dropped.push({ reason: 'afterBlockIdx 越界（' + img.afterBlockIdx + '）', index: imi, maxBlockIdx: maxBlockIdx });
          if (maxBlockIdx >= 0) img.afterBlockIdx = maxBlockIdx;
        }
        validImages.push(img);
      }
      if (validImages.length === 0) {
        return res.json({ ok: false, error: 'insertImagesAtContent 所有图片均被过滤（无有效 prompt 或 blockIdx 越界）' });
      }
      if (validImages.length > 6) {
        // 防止 LLM 一次输出太多张（生图慢+风格飘移）
        validImages = validImages.slice(0, 6);
      }
      action.images = validImages;
      if (dropped.length > 0) {
        console.warn('[office-action] insertImagesAtContent 过滤', dropped.length, '条:', JSON.stringify(dropped));
      }
      // globalStyle 可选；如果是空字符串规范化成 undefined
      if (action.globalStyle != null && !String(action.globalStyle).trim()) {
        action.globalStyle = undefined;
      }
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
    // v0.97: 检测配图需求——如果 instruction 含配图关键词，在 action 里加 needImages 字段
    var imgKeywords = /配图|插图|插画|生图|画画|绘.*图/;
    if (imgKeywords.test(instruction || '')) {
      // 估算需要几张图（按文本长度粗略估计）
      var textLen = String(action.newText || '').length;
      var imgCount = Math.max(1, Math.min(6, Math.floor(textLen / 200)));
      action.needImages = imgCount;
    }
    // v0.97: 如果有 operations 数组，包装成 batch 格式供前端串行执行
    if (action.operations && action.operations.length > 0) {
      return res.json({ ok: true, action: action, batch: true });
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