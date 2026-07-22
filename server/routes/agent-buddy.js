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
const { callLLM, runToolLoop } = require('../services/llm-adapter');
const modelStore = require('../stores/model-store');
const buddySkill = require('../services/agent-buddy-skill');

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

    // 2. 拼 SKILL system prompt
    var buddyCtx = {
      currentView: context.currentView || '_default',
      expandedCategories: previousCategories,
      userName: user ? (user.displayName || user.username || '伙伴') : (context.userName || '伙伴'),
      userSummary: buildUserSummary(context) + actionHint + learnHint,
      personality: context.personality || '',
    };
    var systemPrompt = buddySkill.buildChatPrompt(buddyCtx);

    // 3. 算 toolNames（与 SKILL prompt 一一对应）
    var toolNames = computeToolNames(context.currentView, previousCategories);
    // 如果已经有 ACMS 内部 tool 注册了就全用，否则退回到 v0.59 纯对话模式（不传 tools）
    var hasSkills = toolNames.length > 0 && require('../services/tool-registry').getTool(toolNames[0]);

    // 4. 构建 messages（含对话历史）
    var messages = [
      { role: 'system', content: systemPrompt }
    ];
    var history = context.history || [];
    history.forEach(function(h) {
      if (h.role === 'user' || h.role === 'buddy') {
        messages.push({ role: h.role === 'buddy' ? 'assistant' : 'user', content: h.text });
      }
    });
    messages.push({ role: 'user', content: message });

    // 5. 共享 ctx（_expand_tools handler 写 expandedCategories 到引用外传）
    var sharedCtx = {
      user: user || {},
      apiKey: req.headers['x-api-key'],
      userToken: req.headers['authorization'],
      reqId: 'buddy:' + (userId || 'anonymous'),  // 让 chat 流工具（play_music/generate_image/web_search 等）能找到"身份"
      expandedCategories: previousCategories.slice(),  // 初始复制
    };

    // 6. 跑 runToolLoop（LLM 可以调 tool）
    var result;
    if (hasSkills) {
      result = await runToolLoop(model.id, messages, {
        toolNames: toolNames,
        maxRounds: 8,
        context: sharedCtx,
        caller: 'agent-buddy',
      });
    } else {
      // 无 tools 时退回到常规 callLLM
      result = await callLLM(model.id, messages, {
        maxTokens: 500,
        temperature: 0.8,
        caller: 'agent-buddy',
      });
    }

    // 7. 持久化新的 expandedCategories
    var newCategories = sharedCtx.expandedCategories || [];
    if (userId && JSON.stringify(newCategories) !== JSON.stringify(previousCategories)) {
      saveMemory(userId, 'expanded_categories', newCategories);
      console.log('[agent-buddy] expandedCategories 已持久化:', newCategories);
    }

    // 8. 提取 final answer
    var reply = '';
    if (typeof result === 'string') {
      reply = result;
    } else if (result && result.content) {
      reply = result.content;
    } else if (result && result.message && result.message.content) {
      reply = result.message.content;
    } else {
      reply = '好的，我先消化一下再回答你～';
    }
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

    return res.json({ reply: reply });
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

module.exports = router;