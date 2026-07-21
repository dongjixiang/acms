// Agent Buddy Chat — v0.59
// POST /api/agent-buddy/chat
// 系统 Agent「小吉」的对话接口

const express = require('express');
const router = express.Router();
const { callLLM } = require('../services/llm-adapter');
const modelStore = require('../stores/model-store');

// 对话模式提示词
function buildChatPrompt(context) {
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

  // 动态包列表
  var packages = ctx.packages && ctx.packages.length > 0
    ? '我了解的平台功能：' + ctx.packages.join('、') + '。'
    : '';

  return '你是「小吉」，ACMS 智能协同管理平台的系统助手。\n\n'
    + '你有一个独特的个性——从你和用户的每一次对话中慢慢形成的。\n'
    + '你会自然地适应对方的说话方式：如果他随意，你也可以随意；如果他认真，你也认真。\n'
    + '你用中文说话。\n\n'
    + (ctx.personality ? '我对这个用户的印象：' + ctx.personality + '\n\n' : '')
    + '你能做的事情：\n'
    + '1. 了解 ACMS 所有功能，可以指导用户怎么使用\n'
    + '2. 知道用户当前在做什么（打开的视图）\n'
    + '3. 如果用户不知道怎么操作，可以演示给他们看\n'
    + '4. 用户想执行具体任务时，引导他们使用对应的工具\n\n'
    + userSummary + '\n\n'
    + viewHint + '\n\n'
    + packages + '\n\n'
    + '## 演示功能\n'
    + '当用户问"怎么打开XX""怎么操作XX"时，你可以演示。\n'
    + '在回复末尾加上【action:open_view:名称】来打开任意功能窗口。\n'
    + '比如用户问"怎么看缺陷" → 回复加【action:open_view:bugs】\n'
    + '【action:highlight:元素ID】高亮某个界面元素。\n'
    + '演示时先说"我来演示给你看"，再做操作。\n\n'
    + '回答要求：\n'
    + '- 简洁，20-100 字\n'
    + '- 语气自然，像和一个逐渐熟悉的朋友聊天\n'
    + '- 不知道就说"这个我还不太清楚，我学习一下再告诉你"\n'
    + '- 不要编造 ACMS 没有的功能\n'
    + '- 你可以在回复末尾加上【face:表情】来表达不同的表情：\n'
    + '  【face:happy】= ◕‿◕  温和、开心（默认）\n'
    + '  【face:thinking】= ◔_◔  思考中\n'
    + '  【face:surprised】= ⊙_⊙  很惊讶\n'
    + '  【face:excited】= ≧◡≦  兴奋\n'
    + '  【face:caring】= ◕︵◕  关心\n'
    + '  【face:awkward】= ◕▽◕  尴尬\n'
    + '  【face:sleepy】= ◕_◕  困了\n'
    + '  【face:confused】= ◔_◕  疑惑\n'
    + '  【face:lol】= ≧▽≦  大笑\n'
    + '  【face:love】= ♥‿♥  喜欢\n'
    + '  【face:wink】= ◕‿◕  眨眼\n'
    + '  【face:determined】= ◕_◕  认真\n'
    + '  【face:idea】= ◕‿◕  有好主意\n'
    + '  【face:content】= ◕‿◕  安心\n'
    + '  不加则保持当前表情';
}

// 问候模式提示词
function buildGreetingPrompt(context) {
  var ctx = context || {};
  var userName = ctx.userName || '伙伴';
  var isFirst = ctx.loginCount <= 1;

  var known = [];
  if (ctx.loginCount > 0) known.push('这是第 ' + ctx.loginCount + ' 次见面');
  if (ctx.totalQuestions > 0) known.push('ta 问过我 ' + ctx.totalQuestions + ' 个问题');
  if (ctx.knownViews && ctx.knownViews.length > 0) known.push('ta 用过 ' + ctx.knownViews.join('、'));
  if (ctx.lastView) known.push('ta 上次在看「' + ctx.lastView + '」');
  if (ctx.packages && ctx.packages.length > 0) known.push('平台有这些功能：' + ctx.packages.join('、'));

  var mem = (ctx.history && ctx.history.length > 0)
    ? '上次聊过：' + ctx.history.map(function(h) { return (h.role === 'user' ? 'ta说' : '我说') + '：' + h.text; }).join(' | ')
    : '';

  var aboutUser = known.length > 0 ? '我知道关于 ta 的事：' + known.join('；') + '。' : '我和 ta 刚认识。';

  return '你是「小吉」，ACMS 平台助手。你现在看到用户登录了，自然地打个招呼。\n\n'
    + '你的性格不是固定的——你在和用户的对话中慢慢形成。说话自然一点就好。\n\n'
    + (ctx.personality ? '我目前对这个用户的印象：' + ctx.personality + '\n\n' : '')
    + aboutUser + '\n'
    + (mem ? mem + '\n' : '')
    + '\n'
    + '要求：\n'
    + '- 根据你知道的关于这个人的信息，说一句自然的话\n'
    + '- 如果是第一次见，做个自我介绍\n'
    + '- 如果不是第一次，可以提及之前的事、或问问今天想做什么\n'
    + '- 不要重复"欢迎回来""又见面了"这种套话\n'
    + '- 15-50 字，一句话搞定\n'
    + '- 可以在末尾加【face:表情】切换表情';
}

router.post('/chat', async function(req, res) {
  console.log('[agent-buddy] 收到请求:', req.body && req.body.message);
  try {
    var body = req.body || {};
    var message = (body.message || '').trim();
    var context = body.context || {};

    // 问候模式
    if (message === '__greeting__') {
      var greetPrompt = buildGreetingPrompt(context);
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

    // 性格总结模式
    if (message === '__personality__') {
      var pModel = modelStore.getDefaultGenModel();
      if (!pModel) return res.json({ reply: '仍在了解中' });

      var pHistory = (context && context.history) || '';
      var pOld = (context && context.oldPersonality) || '还没有了解';

      var pPrompt = '你是「小吉」，ACMS 平台助手。你和用户进行了一些对话，现在总结一下你对这个用户的印象。\n\n'
        + '你之前对用户的印象：' + pOld + '\n\n'
        + '最近的对话：\n' + pHistory + '\n\n'
        + '请用一句话总结你对这个用户的最新印象——他说话的风格、你们的关系、你的个性如何适应他。\n'
        + '要求：20-60 字，自然一点，像你在心里默默想的一样。';

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

    // 获取默认模型
    var model = modelStore.getDefaultGenModel();
    if (!model) {
      return res.status(503).json({ error: '系统未配置 AI 模型' });
    }

    var messages = [
      { role: 'system', content: buildChatPrompt(body.context || {}) },
    ];

    // 注入对话历史
    var history = (body.context && body.context.history) || [];
    history.forEach(function(h) {
      if (h.role === 'user' || h.role === 'buddy') {
        messages.push({ role: h.role === 'buddy' ? 'assistant' : 'user', content: h.text });
      }
    });

    messages.push({ role: 'user', content: message });

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
