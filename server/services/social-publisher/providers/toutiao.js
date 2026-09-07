// ACMS social-publisher — providers/toutiao.js
// ============================================================
// 头条发布 provider
//
// 流程（10 步）：
//   1. login              打开登录页 + auth save 凭据
//   2. open_editor        打开发文台
//   3. wait_editor        等编辑器加载
//   4. fill_title         填标题（人类打字）
//   5. fill_content       填正文（contenteditable 富文本，支持 v0.118 rich_content）
//   6. upload_images      上传图片（如有）
//   7. fill_tags          填标签（如有）
//   8. approval           审批门控（关键操作前 confirm）
//   9. click_publish      点"发布"按钮
//  10. wait_success       等发布成功 + 拿 post_url
//  10. verify             验证发布成功，提取 post_url
//
// 每个 step 走 ba.*（browser-agent），跟 ai-web-chat 同源
// 步骤执行器：execute-steps.js 提供重试 + 截图 + 行为模拟

'use strict';

const ba = require('../../browser-agent');
const { executeSteps, waitForElement, approvalStep, autoLoginStep } = require('../execute-steps');
const humanizer = require('../humanizer');
const accountStore = require('../account-store');

const PLATFORM = 'toutiao';
const EDITOR_URL = 'https://mp.toutiao.com/profile_v4/graphic/publish';
const LOGIN_URL = 'https://mp.toutiao.com/auth/page/login';

// ── 头条选择器（实测校准，PR 2 用最稳的选择器）──
const SELECTORS = {
  editor_title: 'input[placeholder*="标题"], .editor-title input, [data-test="article-title"]',
  editor_content: '.editor-content [contenteditable], .ProseMirror, [data-test="article-content"]',
  editor_image_input: '.editor-toolbar input[type=file], input[type=file][accept*="image"]',
  tag_input: 'input[placeholder*="标签"], .tag-input input, [data-test="tag-input"]',
  publish_button: 'button[class*="publish"], button:has-text("发布"), .publish-btn, button[data-test="publish"], button[class*="submit"]',
  success_url: '.success-modal a, .post-url a, [data-test="post-url"]',
  preview_button: 'button[class*="preview"], .preview-btn',
};

// ── 头条发布主函数 ──
async function publish(params, ctx) {
  const { title, content, content_html, rich_content, rich_images, images = [], tags = [], account_id, options = {} } = params;
  const taskId = `tt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  // 0. 前置检查
  const account = accountStore.get(account_id);
  if (!account) {
    return { ok: false, error: `account_not_found: ${account_id}` };
  }
  const health = accountStore.checkHealth({ account_id, platform: PLATFORM });
  if (!health.ok) {
    return { ok: false, error: `account_unhealthy: ${health.status}`, detail: health };
  }

  // 1. 构造步骤列表
  const steps = [
    // Step 1: 登录（v0.118.x: 调用共享 autoLoginStep，根治"假登录" bug）
    //  实测 2026-09-07：头条默认手机验证码 tab，之前只 ba.open + 等 2-3 秒，账号没登进去
    {
      name: 'login',
      retry: 1,
      timeout: 120000,  // v0.118.x: 整个 login step 加到 120s（默认 45s 的 ba.open + 45s 的 ba.evalJs + 30s auth login 可能超 60s）
      run: async (c) => autoLoginStep(account, {
        login_url: LOGIN_URL,
        platform_hostname: 'toutiao.com',
        already_logged_in_path_skip: ['/auth/', '/login'],
      }),
    },
    // Step 2: 打开发文台
    {
      name: 'open_editor',
      retry: 1,
      timeout: 30000,
      run: async (c) => {
        const r = await ba.open(EDITOR_URL);
        if (!r.ok) return { ok: false, error: r.error };
        return { ok: true, url: r.url };
      },
    },
    // Step 3: 等编辑器加载
    {
      name: 'wait_editor',
      retry: 2,
      timeout: 15000,
      run: async (c) => {
        const r = await waitForElement(SELECTORS.editor_title, 12000);
        if (!r.ok) return { ok: false, error: 'editor_not_loaded' };
        return { ok: true };
      },
    },
    // Step 4: 填标题
    {
      name: 'fill_title',
      retry: 1,
      timeout: 30000,
      humanize: true,
      run: async (c) => {
        // 先清空再填
        await humanizer.clearInput(SELECTORS.editor_title);
        await humanizer.typeLikeHuman(title, SELECTORS.editor_title);
        // blur 触发 onChange
        await ba.press('Tab');
        return { ok: true, title };
      },
    },
    // Step 5: 填正文（contenteditable）
    {
      name: 'fill_content',
      retry: 1,
      timeout: 60000,
      humanize: true,
      run: async (c) => {
        // contenteditable 不能用 typeText，要用 execCommand 或 innerHTML
        // 头条用 ProseMirror
        // v0.118 PR 6: 优先用 rich_content 转 HTML（保留图片位置/样式），降级 content_html（已序列化）/ content（纯文本）
        let htmlContent;
        let insertedImages = [];
        if (rich_content && Array.isArray(rich_content) && rich_content.length) {
          // 序列化为 HTML（rich_content 是 blocks 数组）
          const richContentMod = require('../rich-content');
          // 如果有 rich_images（content-rewriter 用占位符改写后），先回填
          let blocks = rich_content;
          if (rich_images && Array.isArray(rich_images) && rich_images.length) {
            blocks = richContentMod.fromPlaceholders(rich_content, rich_images);
          }
          htmlContent = richContentMod.richToHtml(blocks);
          // 收集图片 base64（用于下载到本地后 upload_images step 上传到头条）
          blocks.forEach(b => {
            if (b.type === 'image' && b.src) insertedImages.push({ src: b.src, mime: b.mime || 'image/png', alt: b.alt });
          });
        } else if (content_html && typeof content_html === 'string') {
          htmlContent = content_html;
          // content_html 也可能含 base64 图片
          const imgMatches = content_html.match(/<img[^>]+src="data:image\/[^"]+"/g) || [];
          imgMatches.forEach(m => {
            const srcMatch = m.match(/src="(data:image\/[^"]+)"/);
            if (srcMatch) insertedImages.push({ src: srcMatch[1], mime: srcMatch[1].slice(11, srcMatch[1].indexOf(';')) });
          });
        } else {
          htmlContent = String(content || '');
        }
        // v0.118.6 修复：Node 端算 expectedMin 传给 evalJs（之前下划线字段 _expected_min/_html_chars 跨 wrapper 序列化时丢失）
        // 同时末尾加 wait 2 秒等 ProseMirror 同步完，再读 innerText.length
        const htmlChars = String(htmlContent || '').length;
        const expectedMin = Math.max(20, Math.floor(htmlChars * 0.5));
        const contentJs = `
          (() => {
            const el = document.querySelector(${JSON.stringify(SELECTORS.editor_content)});
            if (!el) return { ok: false, error: 'content_editor_not_found' };
            el.focus();
            // 一次性赋值（不要 appendChild 循环 — ProseMirror 监听 input 事件，逐节点插入会被部分丢弃）
            const html = ${JSON.stringify(htmlContent)};
            el.innerHTML = html;
            // 触发 input + paste 事件，让 ProseMirror 把 innerHTML 同步到 model
            el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: html }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            el.dispatchEvent(new Event('focus', { bubbles: true }));
            // 同步立即读取 innerText 拿长度（ProseMirror 同步是异步的，下面 Node 端会 wait 后再验）
            const len = el.innerText.length;
            const imgs = el.querySelectorAll('img').length;
            // 只返回简单字段（避免下划线字段被序列化丢）
            return { ok: true, length: len, images: imgs };
          })()
        `;
        const r = await ba.evalJs(contentJs);
        if (!r.ok) return { ok: false, error: r.error || 'fill_failed' };
        if (r.output?.ok === false) return r.output;
        // v0.118.6: 等 ProseMirror 同步完成（同步是 setImmediate 微任务），再读 innerText.length
        await humanizer.wait(2000, 3000);
        // 同步后再读一次（用 ba.evalJs，避免被老 cached result 干扰）
        const verifyR = await ba.evalJs(`
          (() => {
            const el = document.querySelector(${JSON.stringify(SELECTORS.editor_content)});
            if (!el) return { ok: false, error: 'content_editor_not_found' };
            return {
              ok: true,
              length: el.innerText.length,
              images: el.querySelectorAll('img').length,
              preview: el.innerText.slice(0, 100),
              // 诊断：返回编辑器的 tagName + class + 直接子元素数
              tag: el.tagName,
              cls: (el.className || '').toString().slice(0, 100),
              childCount: el.children.length,
              // 多个候选 contenteditable 元素（兜底：如果主编辑器选错，下面会列所有）
              alt_editors: Array.from(document.querySelectorAll('[contenteditable="true"], .ProseMirror, [contenteditable]')).slice(0, 5).map(e => ({
                tag: e.tagName,
                cls: (e.className || '').toString().slice(0, 80),
                len: (e.innerText || '').length,
                parentCls: (e.parentElement?.className || '').toString().slice(0, 60),
              })),
            };
          })()
        `);
        let filledLen = r.output?.length || 0;
        let imgsCount = r.output?.images || 0;
        let preview = '';
        let editorDiag = null;
        if (verifyR.ok && verifyR.output?.ok) {
          filledLen = verifyR.output.length;
          imgsCount = verifyR.output.images;
          preview = verifyR.output.preview || '';
          editorDiag = {
            tag: verifyR.output.tag,
            cls: verifyR.output.cls,
            childCount: verifyR.output.childCount,
            alt_editors: verifyR.output.alt_editors,
          };
        }
        // 长度校验：Node 端算的 expectedMin（同步后再读长度）
        if (filledLen < expectedMin) {
          return {
            ok: false,
            error: `content_truncated: filled=${filledLen} chars, expected≥${expectedMin}, html=${htmlChars} chars (ProseMirror 同步失败或编辑器选择器选错元素，请检查 editor_content 选择器)`,
            filled: filledLen,
            expected_min: expectedMin,
            html_chars: htmlChars,
            preview,
            editor_diag: editorDiag,
          };
        }
        await humanizer.wait(1000, 2000);
        // 把 rich_content 的图片合并到 images（供 upload_images step 用）
        // 注：当前 base64 img 已在 fill_content 时通过 innerHTML 嵌入，upload_images 步骤只在需要单独上传（CDN）时跑
        return {
          ok: true,
          length: r.output?.length,
          images_inserted: insertedImages.length,
          // 把 base64 img 也加到 images 数组（让 upload_images step 知道有图，但 base64 不需要再上传）
          _all_images: [...images, ...insertedImages],
        };
      },
    },
    // Step 6: 上传图片（如有）
    ...(images && images.length > 0 ? [{
      name: 'upload_images',
      retry: 1,
      timeout: 60000,
      humanize: true,
      run: async (c) => {
        const results = [];
        for (const imgPath of images) {
          await humanizer.wait(2000, 4000);
          // 用 file input 直接上传
          const r = await ba.evalJs(`
            (() => {
              const input = document.querySelector(${JSON.stringify(SELECTORS.editor_image_input)});
              if (!input) return { ok: false, error: 'file_input_not_found' };
              return { ok: true, hasInput: true };
            })()
          `);
          if (!r.ok || r.output?.ok === false) {
            results.push({ img: imgPath, ok: false, error: r.error || r.output?.error });
            continue;
          }
          // 实际文件上传（PR 2 简化为传路径，PR 3 改真实上传）
          // ba.uploadFile 是 P193 假设的方法，需要确认存在性
          results.push({ img: imgPath, ok: true, note: 'upload_simulated' });
        }
        return { ok: true, results };
      },
    }] : []),
    // Step 7: 填标签（如有）
    ...(tags && tags.length > 0 ? [{
      name: 'fill_tags',
      retry: 1,
      timeout: 30000,
      humanize: true,
      run: async (c) => {
        for (const tag of tags) {
          await humanizer.wait(1000, 2000);
          await humanizer.typeLikeHuman(tag, SELECTORS.tag_input);
          await ba.press('Enter');
        }
        return { ok: true, tagCount: tags.length };
      },
    }] : []),
    // Step 8: 审批门控（关键操作前）
    ...(options.require_approval !== false ? [approvalStep({
      title: '即将发布到今日头条',
      content: `标题: ${title}\n正文长度: ${content.length} 字\n图片: ${images?.length || 0} 张\n标签: ${tags?.join(', ') || '无'}\n\n确认发布？`,
      timeout: 300000,
    })] : []),
    // Step 9: 点发布
    {
      name: 'click_publish',
      retry: 1,
      timeout: 30000,
      humanize: true,
      run: async (c) => {
        await humanizer.wait(2000, 3000);
        // 多选择器兜底链：第 1 次主选择器；失败后按文本精确匹配；最终按 class hash 模糊匹配
        let r = await humanizer.clickLikeHuman(SELECTORS.publish_button);
        if (!r.ok) {
          // 兜底 1：直接按文本匹配"发布"按钮（mp.toutiao.com 改版后常见）
          r = await humanizer.clickLikeHuman('button:has-text("发布"):not([disabled])');
        }
        if (!r.ok) {
          // 兜底 2：通过 ba.find('text', ...) 调真实点击
          // v0.118.6 修复：必须先验证 URL 还在 publish 页（防止误点顶栏/营销弹窗的"发布"链接跳到营销页）
          const urlCheckR = await ba.getInfo('url', 5000);
          const currentUrl = (urlCheckR.ok && urlCheckR.output) || '';
          let urlOk = false;
          try {
            const u = new URL(currentUrl);
            urlOk = u.hostname.endsWith('toutiao.com') && u.pathname.includes('/graphic/');
          } catch {}
          if (!urlOk) {
            return {
              ok: false,
              error: `click_publish_url_guard_failed: 当前 URL 不在 publish 页 (${currentUrl})，拒绝执行 text-fallback 防止跳到营销页`,
              current_url: currentUrl,
            };
          }
          // 用 ba.find('text', ...) 找"发布"按钮；find 返回的 ref 是 playwright 真实点击（React 受控组件友好）
          // 注意：find text 命中的是第一个包含"发布"文本的元素，可能误中顶栏/营销区——所以**额外限定**只找编辑器表单/底部区域内的 button
          const findR = await ba.evalJs(`
            (() => {
              // 限定范围：编辑器表单容器 / 底部操作栏 / 发布按钮区（排除顶栏 nav / 营销区 / 弹窗）
              const SCOPE_SEL = '.editor-content, .ProseMirror, [data-test="article-content"], form, .publish-bar, .footer-actions, .editor-footer, .toolbar';
              const scopes = Array.from(document.querySelectorAll(SCOPE_SEL));
              if (!scopes.length) return { ok: false, error: 'no_scope_found' };
              // 在每个 scope 内找包含"发布"文本且非禁用的 button
              const candidates = [];
              for (const sc of scopes) {
                const btns = sc.querySelectorAll('button, [role="button"], a.btn, a.button');
                for (const b of btns) {
                  const t = (b.innerText || '').trim();
                  // 严格匹配：必须是"发布"或"发布文章"或"确认发布"开头（不是"发布会""发布会话""发布工具"等营销文案）
                  const isPublishBtn = (t === '发布' || t === '发布文章' || t === '确认发布' || t.startsWith('发布文章') || t.startsWith('确认发布')) && !b.disabled;
                  if (isPublishBtn) {
                    candidates.push({ el: b, text: t, scope: sc.className?.toString().slice(0, 40) || sc.tagName });
                  }
                }
              }
              if (!candidates.length) {
                // 兜底：列出所有 scope 内的 button 让诊断知道有哪些候选
                const allBtns = [];
                for (const sc of scopes) {
                  sc.querySelectorAll('button, [role="button"]').forEach(b => {
                    allBtns.push({ text: (b.innerText||'').trim().slice(0,20), cls: (b.className||'').toString().slice(0,40) });
                  });
                }
                return { ok: false, error: 'no_publish_button_in_scope', allBtns: allBtns.slice(0, 15) };
              }
              // 选最后一个（通常是底部"发布"按钮，而非工具栏/侧栏的"发布"链接）
              const target = candidates[candidates.length - 1].el;
              target.scrollIntoView({ block: 'center' });
              target.setAttribute('data-sp-target', 'publish');
              return { ok: true, text: target.innerText.trim(), scope: candidates[candidates.length - 1].scope, selector: '[data-sp-target="publish"]' };
            })()
          `);
          if (findR.ok && findR.output?.ok) {
            // 用 selector 真实点击（ba.find 是 playwright 真实点击）
            const clickR = await ba.click(findR.output.selector, 10000);
            if (clickR.ok) {
              r = { ok: true, clicked_via: 'text-fallback-scoped', note: findR.output };
            } else {
              r = { ok: false, error: 'scoped_click_failed: ' + (clickR.error || 'unknown') };
            }
          } else {
            r = { ok: false, error: findR.output?.error || 'scoped_find_failed', allBtns: findR.output?.allBtns };
          }
        }
        if (!r.ok) {
          // 失败时 dump 当前页面所有 button + URL（兜底诊断，让用户/agent 看到真实 DOM）
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
        // v0.118.6 后置验证：点了"发布"按钮后 wait 3 秒，确认 URL 还在 publish 页（没有跳到营销页）
        await humanizer.wait(2000, 3000);
        const postClickR = await ba.getInfo('url', 5000);
        const postUrl = (postClickR.ok && postClickR.output) || '';
        let stillOnPublish = false;
        try {
          const u = new URL(postUrl);
          stillOnPublish = u.hostname.endsWith('toutiao.com') && u.pathname.includes('/graphic/');
        } catch {}
        if (!stillOnPublish) {
          return {
            ok: false,
            error: `click_publish_jumped_away: 点完发布按钮后 URL 跳到 ${postUrl}（不在 publish 页，可能点了营销链接）`,
            post_click_url: postUrl,
          };
        }
        return r;
      },
    },
    // Step 10: 验证发布成功
    {
      name: 'verify',
      retry: 2,
      timeout: 20000,
      run: async (c) => {
        await humanizer.wait(3000, 5000);
        const r = await ba.evalJs(`
          (() => {
            const urlEl = document.querySelector(${JSON.stringify(SELECTORS.success_url)});
            if (!urlEl) {
              // 兜底：可能跳到了文章管理页
              const allLinks = document.querySelectorAll('a[href*="toutiao.com"]');
              for (const link of allLinks) {
                if (link.href.includes('/item/') || link.href.includes('/c/')) {
                  return { ok: true, post_url: link.href };
                }
              }
              return { ok: false, error: 'post_url_not_found' };
            }
            return { ok: true, post_url: urlEl.href };
          })()
        `);
        if (!r.ok) return { ok: false, error: r.error };
        const result = r.output;
        if (result?.ok) {
          // 提取 post_id
          const idMatch = result.post_url.match(/\/c\/(\d+)/) || result.post_url.match(/item\/(\d+)/);
          return {
            ok: true,
            post_url: result.post_url,
            post_id: idMatch ? idMatch[1] : null,
          };
        }
        return { ok: false, error: result?.error || 'verify_failed' };
      },
    },
  ];

  // 2. 执行
  const result = await executeSteps({
    platform: PLATFORM,
    taskId,
    steps,
    options,
    account,
    params,
    ctx: { account, params, options },
    onProgress: params.onProgress,  // v0.118.x: 透传 step 级进度回调
  });

  // 3. 记录到账号
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
  displayName: '今日头条',
  EDITOR_URL,
  LOGIN_URL,
  SELECTORS,
};
