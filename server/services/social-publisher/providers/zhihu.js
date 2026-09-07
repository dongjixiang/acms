// ACMS social-publisher — providers/zhihu.js
// ===========================================
// 知乎发布 provider（v0.118 PR 3）
//
// 模式二选一：
//   - publish_type='article'  → 写专栏文章（zhuanlan.zhihu.com）
//   - publish_type='answer'    → 写回答（question_id 必填）
//
// 知乎风控中等，日上限 15 篇，间隔 15min

'use strict';

const ba = require('../../browser-agent');
const { executeSteps, waitForElement } = require('../execute-steps');
const humanizer = require('../humanizer');
const accountStore = require('../account-store');

const PLATFORM = 'zhihu';
const ARTICLE_EDITOR_URL = 'https://zhuanlan.zhihu.com/write';
const ANSWER_BASE_URL = 'https://www.zhihu.com/question/';

const SELECTORS = {
  // 专栏编辑器
  article_title: 'input[placeholder*="标题"], .WriteIndex-titleInput, [data-zh-dom-name*="title"]',
  article_content: '.public-DraftEditor-content, [contenteditable="true"], .RichText',
  article_publish: 'button.Button--primary, .PublishPanel-publishButton button, button:has-text("发布")',

  // 回答编辑器
  answer_editor: '.RichText.ztext, [contenteditable="true"], .AnswerForm-inputRichText',
  answer_submit: 'button.Button--primary[type="submit"], .AnswerForm-submit button, button:has-text("发布回答")',
};

async function publish(params, ctx) {
  const { title, content, account_id, options = {}, publish_type = 'article', question_id } = params;
  const taskId = `zhihu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const account = accountStore.get(account_id);
  if (!account) return { ok: false, error: `account_not_found: ${account_id}` };
  const health = accountStore.checkHealth({ account_id, platform: PLATFORM });
  if (!health.ok) return { ok: false, error: `account_unhealthy: ${health.status}` };

  if (publish_type === 'answer' && !question_id) {
    return { ok: false, error: 'missing_question_id', message: '回答模式需要 question_id' };
  }

  const editorUrl = publish_type === 'answer'
    ? `${ANSWER_BASE_URL}${question_id}`
    : ARTICLE_EDITOR_URL;

  const steps = [
    {
      name: 'login',
      retry: 1,
      timeout: 30000,
      run: async () => {
        const r = await ba.open('https://www.zhihu.com/signin');
        if (!r.ok) return { ok: false, error: r.error };
        await humanizer.wait(2500, 4000);
        return { ok: true };
      },
    },
    {
      name: 'open_editor',
      retry: 1,
      timeout: 30000,
      run: async () => {
        const r = await ba.open(editorUrl);
        if (!r.ok) return { ok: false, error: r.error };
        return { ok: true, url: r.url, publish_type };
      },
    },
    {
      name: 'wait_editor',
      retry: 2,
      timeout: 15000,
      run: async () => {
        const sel = publish_type === 'answer' ? SELECTORS.answer_editor : SELECTORS.article_content;
        const r = await waitForElement(sel, 12000);
        return r.ok ? { ok: true } : { ok: false, error: 'editor_not_loaded' };
      },
    },
    {
      name: 'fill_title',
      skip: publish_type === 'answer',  // 回答模式无标题
      retry: 1,
      timeout: 30000,
      humanize: true,
      run: async () => {
        await humanizer.clearInput(SELECTORS.article_title);
        await humanizer.typeLikeHuman(title, SELECTORS.article_title);
        await ba.press('Tab');
        return { ok: true, title };
      },
    },
    {
      name: 'fill_content',
      retry: 1,
      timeout: 90000,
      humanize: true,
      run: async () => {
        const sel = publish_type === 'answer' ? SELECTORS.answer_editor : SELECTORS.article_content;
        // 知乎 Draft.js 富文本，innerHTML 方式
        const html = content.split('\n').map(p => `<p>${p}</p>`).join('\n');
        const r = await ba.evalJs(`
          (() => {
            const el = document.querySelector(${JSON.stringify(sel)});
            if (!el) return { ok: false, error: 'editor_not_found' };
            el.focus();
            // Draft.js 走原生 setContent
            if (el.contentEditable === 'true' || el.getAttribute('contenteditable') === 'true') {
              el.innerHTML = ${JSON.stringify(html)};
              el.dispatchEvent(new InputEvent('input', { bubbles: true }));
              return { ok: true, length: el.innerText.length };
            }
            return { ok: false, error: 'editor_not_focusable' };
          })()
        `);
        if (!r.ok) return { ok: false, error: r.error };
        return r.output?.ok ? { ok: true, length: r.output.length } : { ok: false, error: r.output?.error };
      },
    },
    ...(options.require_approval !== false ? [{
      name: 'approval',
      run: async () => {
        const approval = require('../approval');
        return await approval.request({
          title: `即将发布到知乎${publish_type === 'answer' ? '回答' : '专栏'}`,
          content: `标题: ${title || '(无)'}\n内容长度: ${content.length} 字\n模式: ${publish_type}${question_id ? `\n问题ID: ${question_id}` : ''}\n\n⚠️ 知乎发布后无法删除，确认发布？`,
          platform: PLATFORM,
          account_id,
          timeout: 300000,
        }).then(d => d?.decision === 'approve' ? { ok: true } : { ok: false, error: `approval_${d?.decision || 'rejected'}` });
      },
    }] : []),
    {
      name: 'click_publish',
      retry: 1,
      timeout: 30000,
      humanize: true,
      run: async () => {
        const sel = publish_type === 'answer' ? SELECTORS.answer_submit : SELECTORS.article_publish;
        await humanizer.wait(2000, 3500);
        return await humanizer.clickLikeHuman(sel);
      },
    },
    {
      name: 'verify',
      retry: 2,
      timeout: 25000,
      run: async () => {
        await humanizer.wait(5000, 8000);
        const r = await ba.evalJs(`
          (() => {
            const cur = location.href;
            // 专栏：p/数字id  /  回答：answer/数字id
            const articleMatch = cur.match(/p\/(\d+)/);
            const answerMatch = cur.match(/answer\/(\d+)/);
            if (articleMatch) return { ok: true, post_url: cur, post_id: articleMatch[1], type: 'article' };
            if (answerMatch) return { ok: true, post_url: cur, post_id: answerMatch[1], type: 'answer' };
            return { ok: false, error: 'post_url_not_found', url: cur };
          })()
        `);
        if (!r.ok) return { ok: false, error: r.error };
        return r.output?.ok ? { ok: true, ...r.output } : { ok: false, error: r.output?.error };
      },
    },
  ];

  const result = await executeSteps({
    platform: PLATFORM,
    taskId,
    steps,
    options,
    account,
    params,
    ctx: { account, params, options, publish_type, question_id },
  });

  if (result.ok) accountStore.recordSuccess(account_id);
  else accountStore.recordFailure(account_id, result.error);

  return result;
}

module.exports = {
  publish,
  name: PLATFORM,
  displayName: '知乎',
  ARTICLE_EDITOR_URL,
  ANSWER_BASE_URL,
  SELECTORS,
};
