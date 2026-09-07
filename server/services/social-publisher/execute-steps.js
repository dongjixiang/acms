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
async function executeSteps({ platform, taskId, steps, options, account, params, ctx: extraCtx = {} }) {
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

  for (const step of steps) {
    ctx.stepCount++;
    const stepResult = await executeStep(step, ctx);
    stepResults.push(stepResult);
    ctx.results[step.name] = stepResult;

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

module.exports = {
  executeSteps,
  executeStep,
  waitForElement,
  approvalStep,
  SCREENSHOTS_DIR,
};
