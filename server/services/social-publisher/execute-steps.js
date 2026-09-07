// ACMS social-publisher — execute-steps.js
// =========================================
// 公共步骤执行器：每个 provider 的发布流程 = steps[] 数组
// 每步自动带：截图 + 错误处理 + 重试 + 行为模拟
//
// 跟 ai-web-chat/index.js 的 deepSeekAsk 流程同构（登录→操作→等完成→验证）
//
// 步骤格式：
//   { name: 'login', run: async (ctx) => ({ok, ...}), retry: 2, timeout: 30000 }
//
// 返回：
//   {
//     ok: true,
//     platform: 'toutiao',
//     post_url: '...',
//     post_id: '...',
//     screenshots: ['/api/social-publisher/screenshots/xxx/step-1.png', ...],
//     steps: [{step, ok, screenshot, elapsed_ms, result}, ...],
//     total_elapsed_ms: 18500
//   }

'use strict';

const path = require('path');
const fs = require('fs');
const ba = require('../browser-agent');
const humanizer = require('./humanizer');
const approval = require('./approval');

// 截图存放目录
const SCREENSHOTS_DIR = path.join(__dirname, '..', '..', '..', 'data', 'social-publisher-screenshots');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 公共等待：等元素出现（带 timeout）
async function waitForElement(selector, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const r = await ba.evalJs(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        return el ? true : false;
      })()
    `);
    if (r.ok && r.output) return { ok: true, selector };
    await humanizer.wait(300, 600);
  }
  return { ok: false, error: `wait_for_element_timeout: ${selector}`, timeout_ms: timeout };
}

// 单步执行（带截图 + 重试）
async function executeStep(step, ctx) {
  const { name, run, retry = 1, timeout = 30000, screenshot = true, humanize = true } = step;
  const startTime = Date.now();
  const stepScreenshots = [];

  // 步间停顿（行为模拟）
  if (humanize && ctx.options.humanize !== false) {
    await humanizer.wait(800, 2000);
  }

  // 截图（步前）
  let preShot = null;
  if (screenshot && ctx.options.screenshot_each_step !== false) {
    const shotPath = path.join(SCREENSHOTS_DIR, ctx.taskId, `step-${ctx.stepCount}-${name}-pre.png`);
    ensureDir(path.dirname(shotPath));
    try {
      const r = await ba.screenshotToFile(shotPath);
      if (r.ok) {
        preShot = `/api/social-publisher/screenshots/${ctx.taskId}/step-${ctx.stepCount}-${name}-pre.png`;
        stepScreenshots.push(preShot);
      }
    } catch (e) {
      // 截图失败不阻断流程
    }
  }

  // 执行（含重试）
  let lastError = null;
  let lastResult = null;
  const maxAttempts = retry + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await Promise.race([
        run({ ...ctx, preShot }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('step_timeout')), timeout)),
      ]);
      lastResult = result;
      if (result && result.ok !== false) {
        // 成功
        const elapsed = Date.now() - startTime;
        return {
          step: name,
          ok: true,
          attempt,
          result,
          screenshot: preShot,
          stepScreenshots,
          elapsed_ms: elapsed,
        };
      }
      lastError = result?.error || 'unknown';
    } catch (e) {
      lastError = e.message;
    }
    // 重试前等待
    if (attempt < maxAttempts) {
      await humanizer.wait(1500, 3000);
    }
  }

  // 全部尝试失败
  const elapsed = Date.now() - startTime;
  // 失败强制截图：即便 screenshot_each_step=false，evidence 也不丢（v0.118.2 修复）
  let failShot = null;
  try {
    const failPath = path.join(SCREENSHOTS_DIR, ctx.taskId, `step-${ctx.stepCount}-${name}-FAIL.png`);
    ensureDir(path.dirname(failPath));
    const r = await ba.screenshotToFile(failPath);
    if (r.ok) {
      failShot = `/api/social-publisher/screenshots/${ctx.taskId}/step-${ctx.stepCount}-${name}-FAIL.png`;
      stepScreenshots.push(failShot);
    }
  } catch (e) {
    // 截图失败不阻断
  }
  return {
    step: name,
    ok: false,
    attempt: maxAttempts,
    error: lastError,
    screenshot: preShot,
    failScreenshot: failShot,
    stepScreenshots,
    elapsed_ms: elapsed,
  };
}

// 主入口：执行整个步骤列表
// v0.118.x：加 onProgress 回调，每个 step 跑完（成功/失败）推一次
//  之前只有二态：10（开始）/ 100（成功）/ 0（失败），中间 10 个 step 跑几分钟都没反馈
//  修复：progress = 10 + stepIndex * 80 / totalSteps（后 20% 留给 finish）
//  callback 签名：({ stepIndex, totalSteps, stepName, ok, error, progress }) => void
async function executeSteps({ platform, taskId, steps, options, account, params, ctx: extraCtx = {}, onProgress = null }) {
  const startTime = Date.now();
  const ctx = {
    platform,
    taskId,
    account,
    params,
    options: options || {},
    stepCount: 0,
    results: {},
    preShot: null,
    ...extraCtx,
  };

  const stepResults = [];
  let lastFailedStep = null;
  const totalSteps = steps.length;

  // 工具：推一次 progress（不抛错 — callback 失败不能阻断流程）
  const pushProgress = (stepIndex, stepName, ok, error) => {
    if (typeof onProgress !== 'function') return;
    try {
      const progress = ok
        ? Math.min(90, 10 + Math.round((stepIndex / totalSteps) * 80))  // 10 ~ 90
        : 10 + Math.round((stepIndex / totalSteps) * 80);                 // 失败也推一个"卡在第 X 步"
      onProgress({
        stepIndex,
        totalSteps,
        stepName,
        ok,
        error: error || null,
        progress,
        progress_note: ok
          ? `✓ ${stepName} (${stepIndex}/${totalSteps})`
          : `✗ ${stepName} (${stepIndex}/${totalSteps}): ${(error || '').slice(0, 120)}`,
      });
    } catch (e) {
      // callback 异常不能影响主流程
    }
  };

  for (const step of steps) {
    ctx.stepCount++;
    const stepResult = await executeStep(step, ctx);
    stepResults.push(stepResult);
    ctx.results[step.name] = stepResult;

    // v0.118.x: 每个 step 跑完推一次进度（成功或失败都推）
    pushProgress(ctx.stepCount, step.name, stepResult.ok, stepResult.error);

    if (!stepResult.ok) {
      lastFailedStep = step.name;
      // 失败：记录到上下文
      ctx.lastFailedStep = step.name;
      ctx.lastError = stepResult.error;
      break;
    }

    // 把 step result 合并到 ctx（供后续步骤使用）
    if (stepResult.result) {
      Object.assign(ctx.results, stepResult.result);
    }
  }

  const totalElapsed = Date.now() - startTime;
  const allScreenshots = stepResults.flatMap(r => r.stepScreenshots || []);

  // 构造返回
  const finalResult = {
    ok: !lastFailedStep,
    platform,
    post_url: ctx.results.verify?.result?.post_url,
    post_id: ctx.results.verify?.result?.post_id,
    screenshots: allScreenshots,
    steps: stepResults,
    total_elapsed_ms: totalElapsed,
  };

  if (lastFailedStep) {
    finalResult.failed_step = lastFailedStep;
    finalResult.error = ctx.lastError || `${lastFailedStep} failed`;
  }

  // v0.118.x: 整个流程结束推一次 100% 完成（成功路径；失败路径在上面 pushProgress 已推）
  if (!lastFailedStep && typeof onProgress === 'function') {
    try {
      onProgress({
        stepIndex: totalSteps,
        totalSteps,
        stepName: 'done',
        ok: true,
        error: null,
        progress: 100,
        progress_note: `✅ 全部 ${totalSteps} 步完成（${totalElapsed}ms）`,
      });
    } catch (e) { /* ignore */ }
  }

  return finalResult;
}

// 工具：构造 approval step（v0.2 request_user_help 模式）
function approvalStep({ title, content, getPreviewScreenshot = true, timeout = 300000, platform, account_id }) {
  return {
    name: 'approval',
    retry: 0,  // 审批失败不重试（用户取消/编辑是预期行为）
    timeout: timeout + 5000,
    run: async (ctx) => {
      let previewScreenshot = null;
      if (getPreviewScreenshot) {
        const shotPath = path.join(SCREENSHOTS_DIR, ctx.taskId, 'approval-preview.png');
        ensureDir(path.dirname(shotPath));
        try {
          const r = await ba.screenshotToFile(shotPath);
          if (r.ok) previewScreenshot = `/api/social-publisher/screenshots/${ctx.taskId}/approval-preview.png`;
        } catch (e) {}
      }
      const decision = await approval.request({
        title,
        content,
        preview_screenshot: previewScreenshot,
        platform: platform || ctx.platform,
        account_id: account_id || (ctx.account && ctx.account.id),
        timeout,
      });
      if (decision.decision === 'cancel' || decision.decision === 'reject') {
        return { ok: false, error: `approval_${decision.decision}` };
      }
      return { ok: true, decision };
    },
  };
}

// ── v0.118.x 共享登录 step（4 个 provider 共用，根治"假登录" bug）──
//  实测 2026-09-07：头条/小红书/知乎/抖音等平台登录页默认不是密码登录 tab
//  （手机验证码 / 二维码 / 手机号密码 tab），agent-browser auth login 找不到 username/password 输入框
//  → 之前所有 provider 都只 ba.open + 等 2-3 秒就当登录完了，实际账号根本没登进去
//  修复：
//   1) ba.open(LOGIN_URL)
//   2) 检测已登录（URL 不在 login/auth）
//   3) evalJs 找"密码登录"切换 tab（找不到容错跳过）
//   4) ba.authLogin({ name: account.id }) 自动填账号密码
//   5) 兜底验证 URL（防止 agent-browser 误报成功）
//   6) 失败返回 need_user: true，前端引导用户去 Web 机器人手动
async function autoLoginStep(account, options = {}) {
  const {
    login_url,
    platform_hostname,                  // 例: 'toutiao.com' / 'xiaohongshu.com' / 'zhihu.com' / 'douyin.com'
    already_logged_in_path_skip = ['/auth/', '/login', '/signin'],  // URL 含这些 → 还在登录页
    timeout = 120000,         // v0.118.x: 整个 step 的 timeout 加到 120s（实测头条加载 + 切 tab + auth login 经常 > 60s）
    auth_timeout = 60000,     // v0.118.x: agent-browser auth login 内部 timeout 加到 60s
    open_timeout = 90000,     // v0.118.x: ba.open 默认 45s 太短，登录页慢加载容易 hard-kill
    eval_timeout = 90000,     // v0.118.x: ba.evalJs 默认 45s，复杂 JS（找 tab + 切）容易超
  } = options;
  if (!login_url) return { ok: false, error: 'autoLogin: missing login_url' };
  if (!account || !account.id) return { ok: false, error: 'autoLogin: missing account.id' };

  // 1) 打开登录页（用更长的 timeout，复杂登录页慢加载不至于被 hard-kill）
  const r = await ba.open(login_url, open_timeout);
  if (!r.ok) return { ok: false, error: r.error };
  await humanizer.wait(2500, 4000);

  // 2) 检测已登录
  const infoR = await ba.getInfo('url', 5000);
  const curUrl = (infoR.ok && infoR.output) || '';
  const isLoggedInUrl = (u) => {
    try {
      const url = new URL(u);
      if (platform_hostname && !url.hostname.endsWith(platform_hostname)) return false;
      return !already_logged_in_path_skip.some(p => url.pathname.includes(p));
    } catch { return false; }
  };
  if (isLoggedInUrl(curUrl)) {
    return { ok: true, already_logged_in: true, url: curUrl };
  }

  // 3) 检测/切换密码登录 tab
  const switchR = await ba.evalJs(`
    (() => {
      // 优先级：精确匹配 > 包含匹配；多种 tab 形态
      const exactTexts = ['密码登录', '账号密码登录', '账号登录', '邮箱密码登录'];
      const containTexts = ['密码登录', '账号密码', '邮箱密码'];
      const allEls = Array.from(document.querySelectorAll('div, span, a, button, li, [role="tab"], [class*="tab"]'));
      const tryMatch = (texts, exact) => {
        for (const el of allEls) {
          const t = (el.innerText || el.textContent || '').trim();
          if (!t) continue;
          for (const want of texts) {
            if (exact ? t === want : (t === want || t.includes(want))) {
              if (t.length > 20) continue; // 排除长段落误中
              const cls = (el.className || '').toString();
              if (cls.includes('active') || cls.includes('selected')) continue;
              return { el, text: t, tag: el.tagName, cls: cls.slice(0, 60) };
            }
          }
        }
        return null;
      };
      let hit = tryMatch(exactTexts, true) || tryMatch(containTexts, false);
      if (!hit) return { ok: true, switched: false, reason: 'no_password_tab_found' };
      try { hit.el.click(); } catch (e) { return { ok: false, error: 'click_failed: ' + e.message }; }
      return { ok: true, switched: true, text: hit.text, tag: hit.tag };
    })()
  `, eval_timeout);
  if (!switchR.ok) {
    return { ok: false, error: 'login_tab_switch_eval_failed: ' + (switchR.error || 'unknown') };
  }
  const switched = switchR.output?.switched === true;
  await humanizer.wait(1500, 2500);

  // 4) agent-browser auth login（自动填账号密码 + 提交 + 等跳转）
  const authR = await ba.authLogin({ name: account.id, timeout: auth_timeout });
  if (!authR.ok) {
    return {
      ok: false,
      error: `login_failed: ${authR.error || 'auth_login_failed'}（密码登录 tab 已${switched ? '切换' : '尝试切换（未找到）'}。如需验证码请去 Web 机器人手动完成）`,
      need_user: true,
      auth_output: authR.output,
      tab_switched: switched,
      tab_text: switchR.output?.text,
    };
  }

  // 5) 兜底验证
  await humanizer.wait(2000, 3000);
  const postR = await ba.getInfo('url', 5000);
  const postUrl = (postR.ok && postR.output) || '';
  if (!isLoggedInUrl(postUrl)) {
    return {
      ok: false,
      error: `login_verification_failed: auth login 报成功但 URL 仍在登录页 (${postUrl})`,
      post_url: postUrl,
    };
  }
  return { ok: true, tab_switched: switched, tab_text: switchR.output?.text, url: postUrl };
}

module.exports = {
  executeSteps,
  executeStep,
  waitForElement,
  approvalStep,
  autoLoginStep,  // v0.118.x: 4 个 provider 共用的登录 step
  SCREENSHOTS_DIR,
};
