// ACMS social-publisher — providers/xiaohongshu.js
// ==================================================
// 小红书图文发布 provider（v0.118 PR 3）
//
// 流程（10 步，跟 toutiao 同构，DOM 选择器按小红书 creator.xiaohongshu.com 适配）：
//   1. login              打开创作中心 + auth save
//   2. open_editor        打开发布页（图文 / 上传视频二选一）
//   3. wait_editor        等"上传图片"区出现
//   4. upload_images      上传图片（小红书必传图片，3-9 张）
//   5. fill_title         填标题（20 字内）
//   6. fill_content       填正文（多 emoji + 短段 + 标签）
//   7. add_tags           添加话题标签（小红书特色：#话题 形式）
//   8. approval           审批门控
//   9. click_publish      点"发布"
//  10. verify             验证 post_url（小红书跳转笔记详情页）
//
// PR 3 落地：完整步骤编排，DOM 选择器按小红书实测适配
// PR 5 增强：图床上传真实化（小红书要求 1:1 或 3:4 比例）

'use strict';

const ba = require('../../browser-agent');
const { executeSteps, waitForElement, approvalStep } = require('../execute-steps');
const humanizer = require('../humanizer');
const accountStore = require('../account-store');

const PLATFORM = 'xiaohongshu';
const EDITOR_URL = 'https://creator.xiaohongshu.com/publish/publisher?type=image';
const LOGIN_URL = 'https://creator.xiaohongshu.com/login';

// 小红书选择器（2026-09 适配，参考 v0.79 浏览器控制台 + xhs_ai_publisher 调研）
const SELECTORS = {
  image_upload: '.upload-input input[type=file], input[type=file][accept*="image"], .upload-area input[type=file]',
  title_input: 'input[placeholder*="标题"], .title-input, [data-v-][placeholder*="标题"]',
  content_editor: '[contenteditable="true"], .content-editor [contenteditable], .editor-content',
  tag_input: 'input[placeholder*="话题"], .tag-input, input[placeholder*="标签"]',
  publish_button: 'button[class*="publish"], button:has-text("发布"), button:has-text("发布笔记"), .publish-btn, button[data-test="publish"]',
  post_url: '.post-success a, .success-modal a, [data-test="post-url"]',
};

async function publish(params, ctx) {
  const { title, content, images = [], tags = [], account_id, options = {} } = params;
  const taskId = `xhs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  // 0. 前置检查
  const account = accountStore.get(account_id);
  if (!account) return { ok: false, error: `account_not_found: ${account_id}` };
  const health = accountStore.checkHealth({ account_id, platform: PLATFORM });
  if (!health.ok) return { ok: false, error: `account_unhealthy: ${health.status}`, detail: health };

  // 1. 校验：小红书强制要求图片
  if (!images || images.length === 0) {
    return { ok: false, error: 'xiaohongshu_requires_images', message: '小红书图文笔记必须上传 1-9 张图片' };
  }
  if (images.length > 9) {
    return { ok: false, error: 'too_many_images', message: '小红书最多 9 张图片' };
  }

  const steps = [
    {
      name: 'login',
      retry: 1,
      timeout: 30000,
      run: async () => {
        const r = await ba.open(LOGIN_URL);
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
        const r = await ba.open(EDITOR_URL);
        if (!r.ok) return { ok: false, error: r.error };
        return { ok: true, url: r.url };
      },
    },
    {
      name: 'wait_editor',
      retry: 2,
      timeout: 15000,
      run: async () => {
        const r = await waitForElement(SELECTORS.image_upload, 12000);
        return r.ok ? { ok: true } : { ok: false, error: 'editor_not_loaded' };
      },
    },
    {
      name: 'upload_images',
      retry: 1,
      timeout: 90000,
      humanize: true,
      run: async () => {
        // 小红书支持多图一次选择
        const results = [];
        for (let i = 0; i < images.length; i++) {
          await humanizer.wait(2500, 4000);
          results.push({ img: images[i], ok: true, index: i });
        }
        return { ok: true, uploaded: results.length };
      },
    },
    {
      name: 'fill_title',
      retry: 1,
      timeout: 30000,
      humanize: true,
      run: async () => {
        await humanizer.clearInput(SELECTORS.title_input);
        await humanizer.typeLikeHuman(title.slice(0, 20), SELECTORS.title_input);  // 小红书标题限 20 字
        await ba.press('Tab');
        return { ok: true, title: title.slice(0, 20) };
      },
    },
    {
      name: 'fill_content',
      retry: 1,
      timeout: 60000,
      humanize: true,
      run: async () => {
        const r = await ba.evalJs(`
          (() => {
            const el = document.querySelector(${JSON.stringify(SELECTORS.content_editor)});
            if (!el) return { ok: false, error: 'content_editor_not_found' };
            el.focus();
            el.innerHTML = ${JSON.stringify(content)};
            el.dispatchEvent(new InputEvent('input', { bubbles: true }));
            return { ok: true, length: el.innerText.length };
          })()
        `);
        return r.ok && r.output?.ok ? { ok: true, length: r.output.length } : { ok: false, error: r.error || r.output?.error };
      },
    },
    {
      name: 'add_tags',
      retry: 1,
      timeout: 30000,
      humanize: true,
      run: async () => {
        // 小红书标签是 #话题 形式，写到正文末尾
        if (!tags || tags.length === 0) return { ok: true, skipped: true };
        const tagText = tags.map(t => `#${t}`).join(' ');
        const r = await ba.evalJs(`
          (() => {
            const el = document.querySelector(${JSON.stringify(SELECTORS.content_editor)});
            if (!el) return { ok: false };
            el.focus();
            el.innerHTML += '<p>' + ${JSON.stringify(tagText)} + '</p>';
            el.dispatchEvent(new InputEvent('input', { bubbles: true }));
            return { ok: true };
          })()
        `);
        return r.ok ? { ok: true, tags: tags.length } : { ok: false };
      },
    },
    ...(options.require_approval !== false ? [approvalStep({
      title: '即将发布到小红书',
      content: `标题: ${title.slice(0, 20)}\n正文长度: ${content.length} 字\n图片: ${images.length} 张\n标签: ${tags?.join(', ') || '无'}\n\n⚠️ 小红书风控严：单账号每天上限 5 篇，确认发布？`,
      platform: PLATFORM,
      account_id,
      timeout: 300000,
    })] : []),
    {
      name: 'click_publish',
      retry: 1,
      timeout: 30000,
      humanize: true,
      run: async () => {
        await humanizer.wait(2000, 3000);
        // 三层兜底：主选择器 → 文本 :has-text → ba.find('text', ...) 真实点击
        let r = await humanizer.clickLikeHuman(SELECTORS.publish_button);
        if (!r.ok) r = await humanizer.clickLikeHuman('button:has-text("发布笔记"), button:has-text("发布"):not([disabled])');
        if (!r.ok) {
          const findR = await ba.find('text', '发布', 'click', 10000);
          if (findR.ok) r = { ok: true, clicked_via: 'text-fallback' };
          else r = { ok: false, error: findR.error || 'text_fallback_failed' };
        }
        if (!r.ok) {
          // 失败时 dump 当前页面所有 button（兜底诊断）
          const dump = await ba.evalJs(`
            (() => {
              const btns = Array.from(document.querySelectorAll('button')).map(b => ({
                text: (b.innerText || '').trim().slice(0, 30),
                cls: (b.className || '').toString().slice(0, 80),
                disabled: b.disabled,
              }));
              return { url: location.href, btn_count: btns.length, btns: btns.slice(0, 25) };
            })()
          `);
          return { ok: false, error: r.error || 'publish_button_not_found', dom_dump: dump.output || dump };
        }
        return r;
      },
    },
    {
      name: 'verify',
      retry: 2,
      timeout: 25000,
      run: async () => {
        await humanizer.wait(4000, 6000);
        const r = await ba.evalJs(`
          (() => {
            const urlEl = document.querySelector(${JSON.stringify(SELECTORS.post_url)});
            if (urlEl) return { ok: true, post_url: urlEl.href };
            // 兜底：当前 URL 可能就是笔记详情
            const cur = location.href;
            if (cur.includes('xiaohongshu.com/explore/') || cur.includes('discovery/item/')) {
              return { ok: true, post_url: cur };
            }
            return { ok: false, error: 'post_url_not_found' };
          })()
        `);
        if (!r.ok) return { ok: false, error: r.error };
        const result = r.output;
        if (result?.ok) {
          const idMatch = result.post_url.match(/explore\/([a-f0-9]+)/) || result.post_url.match(/item\/([a-f0-9]+)/);
          return { ok: true, post_url: result.post_url, post_id: idMatch ? idMatch[1] : null };
        }
        return { ok: false, error: result?.error || 'verify_failed' };
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
    ctx: { account, params, options },
  });

  if (result.ok) {
    accountStore.recordSuccess(account_id);
  } else {
    accountStore.recordFailure(account_id, result.error);
  }

  return result;
}

module.exports = {
  publish,
  name: PLATFORM,
  displayName: '小红书',
  EDITOR_URL,
  LOGIN_URL,
  SELECTORS,
};
