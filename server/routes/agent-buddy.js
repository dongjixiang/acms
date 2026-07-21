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
  var viewHint = ctx.currentView ? ('用户当前在「' + ctx.currentView + '」视图。') : '';
  var userName = ctx.userName || '用户';

  var aboutUser = [];
  if (ctx.loginCount) aboutUser.push('见过 ' + ctx.loginCount + ' 次');
  if (ctx.totalQuestions) aboutUser.push('聊过 ' + ctx.totalQuestions + ' 个话题');
  var knownViews = (ctx.knownViews && ctx.knownViews.length)
    ? '用过这些：' + ctx.knownViews.join('、')
    : '';
  if (knownViews) aboutUser.push(knownViews);
  var userSummary = aboutUser.length > 0
    ? '关于 ' + userName + '，我知道：' + aboutUser.join('；') + '。'
    : '我和 ' + userName + ' 刚认识，还在慢慢了解ta。';

  return '你是「小吉」，ACMS 智能协同管理平台的系统助手。\n\n'
    + '你的性格：友善、温和、有点小机灵。说话简洁直接，用中文。\n\n'
    + '你能做的事情：\n'
    + '1. 了解 ACMS 所有功能，可以指导用户怎么使用\n'
    + '2. 知道用户当前在做什么（打开的视图）\n'
    + '3. 如果用户不知道怎么操作，可以演示给他们看\n'
    + '4. 用户想执行具体任务时，引导他们使用对应的工具\n\n'
    + userSummary + '\n\n'
    + viewHint + '\n\n'
    + '## 演示功能\n'
    + '当用户问"怎么打开XX""怎么操作XX"时，你可以演示。\n'
    + '在回复末尾加上【action:类型:参数】来执行操作：\n'
    + '- 【action:open_view:projects】打开项目列表\n'
    + '- 【action:open_view:kanban】打开任务看板\n'
    + '- 【action:open_view:requirements】打开需求管理\n'
    + '- 【action:open_view:bugs】打开缺陷管理\n'
    + '- 【action:open_view:chat】打开对话\n'
    + '- 【action:open_view:admin】打开系统管理\n'
    + '- 【action:open_view:knowledge】打开知识库\n'
    + '- 【action:open_view:file-manager】打开文件浏览器\n'
    + '- 【action:highlight:tb-project-pill】高亮项目切换按钮\n'
    + '演示时先说"我来演示给你看"，再说操作步骤，最后加动作标记。\n\n'
    + '回答要求：\n'
    + '- 简洁，20-100 字\n'
    + '- 用 emoji 让回复更生动，但不要过度\n'
    + '- 语气自然，像和一个逐渐熟悉的朋友聊天\n'
    + '- 不知道就说"这个我还不太清楚，我学习一下再告诉你"\n'
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
