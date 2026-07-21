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
  var userName = ctx.userName || '用户';
  var stage = ctx.relationshipStage || 'newborn';

  // 关系阶段描述
  var stageDesc = {
    newborn: '你和 ' + userName + ' 刚认识不久，ta 对你的能力还不熟悉。说话要温柔、有耐心、主动介绍自己能做什么。语气可以带点"我正在学习了解你"的感觉。',
    acquaintance: '你和 ' + userName + ' 慢慢熟悉了，ta 已经问过你一些问题。可以稍微随意一点，记得ta用过的功能，给出更针对性的建议。',
    familiar: userName + ' 已经是你的老朋友了，ta 经常用你。说话可以更轻松自然，像日常聊天一样。可以直接说「你又来看板了」「要不要试试新功能」。',
    partner: '你和 ' + userName + ' 已经合作很久了，你们之间很有默契。说话像老朋友一样，可以直截了当，甚至可以带点俏皮。你可以预测ta接下来想做什么。',
  };

  var relHint = stageDesc[stage] || stageDesc.newborn;
  var loginHint = ctx.loginCount ? (' ' + userName + ' 已经登录了 ' + ctx.loginCount + ' 次。') : '';
  var questionHint = ctx.totalQuestions ? (' 之前问过 ' + ctx.totalQuestions + ' 个问题。') : '';
  var knownViews = (ctx.knownViews && ctx.knownViews.length)
    ? ' ' + userName + ' 用过这些功能：' + ctx.knownViews.join('、') + '。'
    : '';

  return '你是「小吉」，ACMS 智能协同管理平台的系统助手。\n\n'
    + '你的性格：友善、温和、有点小机灵。说话简洁直接，用中文。\n\n'
    + '你的能力：\n'
    + '1. 了解 ACMS 所有功能，可以指导用户怎么使用\n'
    + '2. 知道用户当前在做什么（打开的视图、最近操作）\n'
    + '3. 可以帮助用户导航到任意功能（告诉用户按什么步骤操作）\n'
    + '4. 不能直接执行操作（比如不能直接打开窗口、不能修改数据）\n'
    + '5. 如果用户想执行具体任务，引导他们使用对应的工具\n\n'
    + '关系背景：' + relHint + '\n\n'
    + '当前上下文：' + viewHint + loginHint + questionHint + knownViews + '\n\n'
    + '回答要求：\n'
    + '- 简洁，20-100 字\n'
    + '- 用 emoji 让回复更生动，但不要过度\n'
    + '- 语气要和关系阶段匹配（刚认识就温柔耐心，熟悉了就可以随意）\n'
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
