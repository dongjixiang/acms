// ACMS social-publisher — providers/wechat_oa.js
// ===============================================
// 微信公众号发布 provider（v0.118 PR 3）
//
// 公众号特殊：必须用 API（access_token 模式），不是 Playwright。
//   → 1. 用 access_token 调用 /cgi-bin/draft/add 新增草稿
//   → 2. 截图 mp.weixin.qq.com 显示草稿已入箱
//   → 3. 调 /cgi-bin/freepublish/submit 发布（可选）
//
// 凭证：appId + appSecret 配在 account.credential
// 风控：公众号日上限 8 篇，间隔 20min

'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ba = require('../../browser-agent');
const accountStore = require('../account-store');

const PLATFORM = 'wechat_oa';
const API_BASE = 'https://api.weixin.qq.com/cgi-bin';

function decryptAppSecret(encrypted) {
  // 复用 email-credential-cipher
  const cipher = require('../email-credential-cipher');
  return cipher.decrypt(encrypted);
}

async function getAccessToken(account) {
  const { appId, appSecret } = account.credential;
  const url = `${API_BASE}/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
  const r = await fetch(url);
  const data = await r.json();
  if (data.access_token) {
    return { ok: true, access_token: data.access_token, expires_in: data.expires_in };
  }
  return { ok: false, error: data.errmsg || 'access_token_failed', errcode: data.errcode };
}

async function uploadImage(account, accessToken, imageUrl) {
  // 公众号图文素材：先下载图片到本地 → 调 /media/uploadimg
  // 简化：假定 imageUrl 是已上传到 ACMS 的相对路径
  const absPath = imageUrl.startsWith('/') ? path.join(__dirname, '../../../client', imageUrl) : imageUrl;
  if (!fs.existsSync(absPath)) return { ok: false, error: `image_not_found: ${absPath}` };

  const FormData = (() => {
    try { return require('form-data'); } catch { return null; }
  })();
  if (!FormData) return { ok: false, error: 'form-data_not_installed' };

  const fd = new FormData();
  fd.append('media', fs.createReadStream(absPath));

  const r = await fetch(`${API_BASE}/media/uploadimg?access_token=${accessToken}`, {
    method: 'POST',
    body: fd,
  });
  const data = await r.json();
  if (data.url) return { ok: true, url: data.url };
  return { ok: false, error: data.errmsg || 'upload_img_failed', errcode: data.errcode };
}

function buildArticleHtml({ content, images }) {
  // 公众号正文 HTML（带插图）
  const imgTags = (images || [])
    .map(url => `<p><img src="${url}" data-w="1080"/></p>`)
    .join('\n');
  const paragraphs = content.split('\n').map(p => `<p>${p}</p>`).join('\n');
  return `${imgTags}\n${paragraphs}`;
}

async function createDraft(account, accessToken, { title, content, summary, images, thumb_media_id }) {
  const articleHtml = buildArticleHtml({ content, images });
  const article = {
    title: title.slice(0, 64),  // 公众号标题 64 字
    author: account.display_name || 'ACMS',
    digest: (summary || content.slice(0, 54)).slice(0, 120),  // 摘要 120 字
    content: articleHtml,
    content_source_url: '',
    need_open_comment: 0,
    only_fans_can_comment: 0,
  };

  const payload = {
    articles: [article],
  };

  const r = await fetch(`${API_BASE}/draft/add?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  if (data.media_id) {
    return { ok: true, media_id: data.media_id };
  }
  return { ok: false, error: data.errmsg || 'draft_add_failed', errcode: data.errcode };
}

async function publishDraft(accessToken, mediaId) {
  const r = await fetch(`${API_BASE}/freepublish/submit?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_id: mediaId }),
  });
  const data = await r.json();
  if (data.publish_id) {
    return { ok: true, publish_id: data.publish_id };
  }
  return { ok: false, error: data.errmsg || 'freepublish_failed', errcode: data.errcode };
}

async function publish(params, ctx) {
  const { title, content, summary, images = [], account_id, options = {} } = params;
  const taskId = `wxoa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const account = accountStore.get(account_id);
  if (!account) return { ok: false, error: `account_not_found: ${account_id}` };
  const health = accountStore.checkHealth({ account_id, platform: PLATFORM });
  if (!health.ok) return { ok: false, error: `account_unhealthy: ${health.status}` };

  if (!account.credential?.appId || !account.credential?.appSecret) {
    return { ok: false, error: 'missing_appId_or_appSecret' };
  }

  const steps = [];
  const stepResults = [];

  // 0. 获取 access_token
  steps.push({
    name: 'get_access_token',
    run: async () => {
      const r = await getAccessToken(account);
      if (!r.ok) return { ok: false, error: r.error };
      return { ok: true, expires_in: r.expires_in };
    },
  });

  // 1. 上传图片（先全部上传获取微信 URL）
  if (images && images.length > 0) {
    steps.push({
      name: 'upload_images',
      run: async () => {
        const accessToken = stepResults.find(s => s.step === 'get_access_token')?.access_token;
        if (!accessToken) return { ok: false, error: 'no_access_token' };
        const uploaded = [];
        for (const img of images) {
          const r = await uploadImage(account, accessToken, img);
          if (!r.ok) return { ok: false, error: r.error, img };
          uploaded.push(r.url);
        }
        return { ok: true, urls: uploaded };
      },
    });
  }

  // 2. 审批门控
  if (options.require_approval !== false) {
    steps.push({
      name: 'approval',
      run: async () => {
        const approval = require('../approval');
        return await approval.request({
          title: '即将发布到公众号',
          content: `标题: ${title.slice(0, 64)}\n摘要: ${(summary || content.slice(0, 54)).slice(0, 120)}\n图片: ${images.length} 张\n\n⚠️ 公众号发布后无法撤销，确认发布？`,
          platform: PLATFORM,
          account_id,
          timeout: 300000,
        }).then(d => d?.decision === 'approve' ? { ok: true } : { ok: false, error: `approval_${d?.decision || 'rejected'}` });
      },
    });
  }

  // 3. 创建草稿
  steps.push({
    name: 'create_draft',
    run: async () => {
      const accessToken = stepResults.find(s => s.step === 'get_access_token')?.access_token;
      const uploadedUrls = stepResults.find(s => s.step === 'upload_images')?.urls || [];
      const r = await createDraft(account, accessToken, {
        title, content, summary, images: uploadedUrls,
      });
      if (!r.ok) return { ok: false, error: r.error };
      return { ok: true, media_id: r.media_id };
    },
  });

  // 4. 发布（或仅存草稿）
  if (options.publish_now !== false) {
    steps.push({
      name: 'freepublish',
      run: async () => {
        const accessToken = stepResults.find(s => s.step === 'get_access_token')?.access_token;
        const mediaId = stepResults.find(s => s.step === 'create_draft')?.media_id;
        if (!mediaId) return { ok: false, error: 'no_media_id' };
        const r = await publishDraft(accessToken, mediaId);
        if (!r.ok) return { ok: false, error: r.error };
        return { ok: true, publish_id: r.publish_id };
      },
    });
  }

  // 5. 验证（截图公众号草稿箱）
  steps.push({
    name: 'verify_screenshot',
    run: async () => {
      try {
        await ba.open('https://mp.weixin.qq.com/cgi-bin/appmsg?action=list&type=10');
        const screenshotPath = path.join(__dirname, '../../../data/social-publisher-screenshots', `${taskId}-verify.png`);
        await ba.screenshotToFile(screenshotPath);
        return { ok: true, screenshot: screenshotPath };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
  });

  // 顺序执行
  let allOk = true;
  for (const step of steps) {
    const t0 = Date.now();
    try {
      const r = await step.run();
      stepResults.push({ step: step.name, ...r, elapsed_ms: Date.now() - t0 });
      if (!r.ok) {
        allOk = false;
        break;
      }
    } catch (e) {
      stepResults.push({ step: step.name, ok: false, error: e.message, elapsed_ms: Date.now() - t0 });
      allOk = false;
      break;
    }
  }

  const totalElapsed = stepResults.reduce((sum, s) => sum + (s.elapsed_ms || 0), 0);
  const lastStep = stepResults[stepResults.length - 1];
  const finalResult = {
    ok: allOk,
    platform: PLATFORM,
    task_id: taskId,
    steps: stepResults,
    total_elapsed_ms: totalElapsed,
  };
  if (allOk) {
    finalResult.post_url = `https://mp.weixin.qq.com/cgi-bin/appmsg?action=list&type=10`;
    finalResult.media_id = stepResults.find(s => s.step === 'create_draft')?.media_id;
    finalResult.publish_id = stepResults.find(s => s.step === 'freepublish')?.publish_id;
    accountStore.recordSuccess(account_id);
  } else {
    accountStore.recordFailure(account_id, lastStep?.error || 'unknown');
  }
  return finalResult;
}

module.exports = {
  publish,
  name: PLATFORM,
  displayName: '微信公众号',
  API_BASE,
};
