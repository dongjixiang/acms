// Agent Buddy Chat — v0.59
// POST /api/agent-buddy/chat
// 系统 Agent「小吉」的对话接口

const express = require('express');
const router = express.Router();
const { callLLM } = require('../services/llm-adapter');
const modelStore = require('../stores/model-store');

// 系统提示词：小吉是谁、她能做什么
function buildSystemPrompt(context) {
  var ctx = context || {};
  var viewHint = ctx.currentView ? (' 用户当前在「' + ctx.currentView + '」视图。') : '';
  var actionsHint = (ctx.recentActions && ctx.recentActions.length)
    ? ' 最近操作: ' + ctx.recentActions.slice(-3).join(', ') + '。'
    : '';

  return '你是「小吉」，ACMS 智能协同管理平台的系统助手。\n\n'
    + '你的性格：友善、温和、有点小机灵。说话简洁直接，用中文。\n\n'
    + '你的能力：\n'
    + '1. 了解 ACMS 所有功能，可以指导用户怎么使用\n'
    + '2. 知道用户当前在做什么（打开的视图、最近操作）\n'
    + '3. 可以帮助用户导航到任意功能（告诉用户按什么步骤操作）\n'
    + '4. 不能直接执行操作（比如不能直接打开窗口、不能修改数据）\n'
    + '5. 如果用户想执行具体任务，引导他们使用对应的工具\n\n'
    + '当前上下文：' + viewHint + actionsHint + '\n\n'
    + '回答要求：\n'
    + '- 简洁，20-100 字\n'
    + '- 用 emoji 让回复更生动，但不要过度\n'
    + '- 如果不知道就说"这个我还不太清楚，我学习一下再告诉你"\n'
    + '- 不要编造 ACMS 没有的功能';
}

router.post('/', async function(req, res) {
  try {
    var body = req.body || {};
    var message = (body.message || '').trim();
    if (!message) {
      return res.status(400).json({ error: '请输入消息' });
    }

    // 获取默认模型
    var model = modelStore.getDefaultGenModel();
    if (!model) {
      return res.status(503).json({ error: '系统未配置 AI 模型' });
    }

    var messages = [
      { role: 'system', content: buildSystemPrompt(body.context || {}) },
      { role: 'user', content: message }
    ];

    var result = await callLLM(model.id, messages, {
      maxTokens: 500,
      temperature: 0.8,
      caller: 'agent-buddy',
    });

    var reply = '';
    if (typeof result === 'string') {
      reply = result;
    } else if (result && result.content) {
      reply = result.content;
    } else if (result && result.message && result.message.content) {
      reply = result.message.content;
    } else {
      reply = '嗯… 我组织一下语言，你再问一遍？';
    }

    res.json({ reply: reply.trim() });

  } catch (e) {
    console.error('[agent-buddy] chat error:', e.message);
    res.status(500).json({ error: '我有点卡住了，稍后再试试？(' + e.message + ')' });
  }
});

module.exports = router;
