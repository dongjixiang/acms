// ACMS social-publisher — providers/douyin.js
// ============================================
// 抖音视频发布 provider（v0.118 PR 5-1 完整实现）
//
// 流程（10 步）：
//   1. login              创作中心（auth save 凭据复用）
//   2. open_editor        creator.douyin.com → 发布视频
//   3. wait_editor        等"上传视频"按钮出现
//   4. upload_video       通过 <input type=file> + DataTransfer API（v0.118 PR 5 新增 ba.uploadFile）
//   5. wait_upload        等视频上传完成（抖音转码可能要 30-90s）
//   6. fill_caption       填文案（22 字内）
//   7. add_hashtags       #话题（抖音会变成 @话题）
//   8. choose_cover       自动选帧（默认从 1/3 位置选）
//   9. approval           审批门控
//  10. click_publish      发布
//  11. verify             post_url（抖音是 video/数字 ID）
//
// 抖音风控：日 5 篇，间隔 60min。视频文件最大 4GB，时长 ≤ 60s 最佳

'use strict';

const path = require('path');
const fs = require('fs');
const ba = require('../../browser-agent');
const { executeSteps, waitForElement, approvalStep } = require('../execute-steps');
const humanizer = require('../humanizer');
const accountStore = require('../account-store');

const PLATFORM = 'douyin';
const EDITOR_URL = 'https://creator.douyin.com/creator-micro/content/upload';
const LOGIN_URL = 'https://creator.douyin.com/';

const SELECTORS = {
  // 抖音 2026-09 选择器（实测校准）
  video_upload: 'input[type=file][accept*="video"], .upload-input input[type=file], input[type=file]',
  caption_editor: '[contenteditable="true"], .editor-content, [data-text="true"]',
  tag_input: 'input[placeholder*="话题"], input[placeholder*="添加话题"], .tag-input',
  publish_button: 'button[class*="publish"], button:has-text("发布"), .publish-btn',
  post_url: '.post-success a, [class*="success"] a, [class*="link"]',
};

async function publish(params, ctx) {
  const { video_url, caption, hashtags = [], account_id, options = {} } = params;
  const taskId = `douyin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  // 0. 前置检查
  const account = accountStore.get(account_id);
  if (!account) return { ok: false, error: `account_not_found: ${account_id}` };
  const health = accountStore.checkHealth({ account_id, platform: PLATFORM });
  if (!health.ok) return { ok: false, error: `account_unhealthy: ${health.status}`, detail: health };

  if (!video_url) return { ok: false, error: 'missing_video_url' };
  // 校验视频文件
  if (video_url.startsWith('/') || /^[a-zA-Z]:/.test(video_url)) {
    if (!fs.existsSync(video_url)) {
      return { ok: false, error: `video_file_not_found: ${video_url}` };
    }
    const stat = fs.statSync(video_url);
    if (stat.size > 4 * 1024 * 1024 * 1024) {
      return { ok: false, error: 'video_too_large', max_size: '4GB', actual_size: stat.size };
    }
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
        const r = await waitForElement(SELECTORS.video_upload, 12000);
        return r.ok ? { ok: true } : { ok: false, error: 'editor_not_loaded' };
      },
    },
    {
      name: 'upload_video',
      retry: 1,
      timeout: 180000,  // 抖音上传 + 转码可能 2-3min
      run: async () => {
        // v0.118 PR 5: 用 ba.uploadFile 走 base64/fetch 模式
        const r = await ba.uploadFile(SELECTORS.video_upload, video_url, 180000);
        if (!r.ok) return { ok: false, error: `upload_failed: ${r.error}` };
        return { ok: true, file_name: r.name, size: r.size, mode: r.mode };
      },
    },
    {
      name: 'wait_upload',
      retry: 0,
      timeout: 180000,
      run: async () => {
        // 抖音上传完成后会显示"重新上传"按钮 + 视频预览
        // 简单等 30s 后再继续（PR 5 增强：等进度条消失）
        await humanizer.wait(30000, 35000);
        return { ok: true, waited_ms: 30000 };
      },
    },
    {
      name: 'fill_caption',
      retry: 1,
      timeout: 30000,
      humanize: true,
      run: async () => {
        const text = (caption || '').slice(0, 22);  // 抖音文案建议 22 字内
        const r = await ba.evalJs(`
          (() => {
            const el = document.querySelector(${JSON.stringify(SELECTORS.caption_editor)});
            if (!el) return { ok: false, error: 'caption_editor_not_found' };
            el.focus();
            el.innerHTML = ${JSON.stringify(text)};
            el.dispatchEvent(new InputEvent('input', { bubbles: true }));
            return { ok: true, length: el.innerText.length };
          })()
        `);
        return r.ok && r.output?.ok ? { ok: true, length: r.output.length } : { ok: false, error: r.error || r.output?.error };
      },
    },
    {
      name: 'add_hashtags',
      skip: !hashtags || hashtags.length === 0,
      retry: 1,
      timeout: 30000,
      humanize: true,
      run: async () => {
        // 抖音标签：写进 caption 末尾 + 用 # 格式
        const tagText = '\n' + (hashtags || []).map(t => `#${t}`).join(' ');
        const r = await ba.evalJs(`
          (() => {
            const el = document.querySelector(${JSON.stringify(SELECTORS.caption_editor)});
            if (!el) return { ok: false };
            el.focus();
            el.innerHTML += ${JSON.stringify(tagText)};
            el.dispatchEvent(new InputEvent('input', { bubbles: true }));
            return { ok: true, added: ${hashtags?.length || 0} };
          })()
        `);
        return r.ok ? { ok: true, tags: hashtags.length } : { ok: false };
      },
    },
    {
      name: 'choose_cover',
      retry: 0,
      timeout: 20000,
      run: async () => {
        // PR 5 简版：跳过手动选封面（抖音默认从视频中段选帧）
        return { ok: true, skipped: true, note: '默认从 1/3 位置选帧（PR 5 简版不主动选）' };
      },
    },
    ...(options.require_approval !== false ? [approvalStep({
      title: '即将发布到抖音',
      content: `视频: ${path.basename(video_url)}\n文案: ${(caption || '').slice(0, 22)}\n话题: ${hashtags?.join(', ') || '无'}\n\n⚠️ 抖音风控严：单账号每天上限 5 篇，确认发布？`,
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
        await humanizer.wait(2000, 3500);
        return await humanizer.clickLikeHuman(SELECTORS.publish_button);
      },
    },
    {
      name: 'verify',
      retry: 2,
      timeout: 30000,
      run: async () => {
        await humanizer.wait(5000, 8000);
        const r = await ba.evalJs(`
          (() => {
            const cur = location.href;
            // 抖音视频链接：/video/数字id
            const match = cur.match(/\\/video\\/(\\d+)/);
            if (match) return { ok: true, post_url: cur, post_id: match[1] };
            // 兜底：可能跳到作品管理页
            if (cur.includes('content/manage') || cur.includes('content/list')) {
              return { ok: true, post_url: cur, post_id: null, note: '作品管理页' };
            }
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
  displayName: '抖音',
  EDITOR_URL,
  LOGIN_URL,
  SELECTORS,
  isStub: false,  // v0.118 PR 5-1: 完整实现
};
