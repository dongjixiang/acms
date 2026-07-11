// ACMS Hook Registry — PreToolUse / PostToolUse 钩子系统（v0.46）
//
// 核心概念：
//   PreToolUse  — 工具执行前同步触发；可以修改 args、abort 执行
//   PostToolUse — 工具执行后同步触发；可以修改/包装 result
//
// 用法：
//   const { registerHook, runPreHooks, runPostHooks } = require('./hook-registry');
//
//   registerHook('PreToolUse', 'auto-lint-js', async (ctx) => {
//     if (ctx.toolName !== 'agent_write_file') return ctx;
//     if (!ctx.args.path?.endsWith('.js')) return ctx;
//     // 在写之前先 lint
//     return ctx;  // 可改 ctx.args / ctx.abort
//   });
//
//   const result = await runPostHooks('agent_write_file', args, handlerResult, ctx);
//
// 设计原则（来自 Claude Code hooks）：
//   1. 同步执行 — PreToolUse 在 tool 跑前同步等待；abort=true 时跳过 tool
//   2. 失败 fail-open — hook 抛错不阻塞 tool（log warn 即可）
//   3. 可链式 — 多个 hook 按注册顺序依次执行；任一 PreToolUse abort=true 终止链
//   4. 内置 hooks 在 server startup 时通过 hooks/index.js 自动注册

const hooks = new Map();  // key: 'PreToolUse' | 'PostToolUse' → array of {name, fn}

function registerHook(event, name, fn) {
  if (!['PreToolUse', 'PostToolUse'].includes(event)) {
    throw new Error(`[hook-registry] Invalid event: ${event} (must be PreToolUse or PostToolUse)`);
  }
  if (typeof fn !== 'function') {
    throw new Error(`[hook-registry] Hook '${name}' must be a function`);
  }
  if (!hooks.has(event)) hooks.set(event, []);
  hooks.get(event).push({ name, fn });
  console.log(`[hook-registry] Registered ${event} hook: ${name}`);
}

function getHooks(event) {
  return hooks.get(event) || [];
}

/**
 * 执行 PreToolUse 链
 * @param {string} toolName
 * @param {object} args - 工具参数（可能被 hook 修改）
 * @param {object} ctx - 上下文 {taskId, projectId, ...}
 * @returns {{args, abort: boolean, abortReason?: string}}
 */
async function runPreHooks(toolName, args, ctx) {
  const preHooks = getHooks('PreToolUse');
  if (preHooks.length === 0) return { args, abort: false };

  let currentArgs = args;
  let abort = false;
  let abortReason = '';

  for (const { name, fn } of preHooks) {
    try {
      const result = await fn({ toolName, args: currentArgs, ctx });
      if (result && typeof result === 'object') {
        if (result.abort === true) {
          abort = true;
          abortReason = result.reason || `aborted by PreToolUse hook: ${name}`;
          console.log(`[hook-registry] ⛔ ${name} aborted ${toolName}: ${abortReason}`);
          break;
        }
        if (result.args) currentArgs = result.args;  // hook 修改了 args
      }
    } catch (e) {
      // fail-open：hook 抛错不阻塞 tool
      console.warn(`[hook-registry] ⚠️ PreToolUse hook '${name}' failed (fail-open): ${e.message}`);
    }
  }

  return { args: currentArgs, abort, abortReason };
}

/**
 * 执行 PostToolUse 链
 * @param {string} toolName
 * @param {object} args
 * @param {object} result - tool 执行结果
 * @param {object} ctx
 * @returns {object} - 可能被 hook 修改的 result
 */
async function runPostHooks(toolName, args, result, ctx) {
  const postHooks = getHooks('PostToolUse');
  if (postHooks.length === 0) return result;

  let currentResult = result;
  for (const { name, fn } of postHooks) {
    try {
      const updated = await fn({ toolName, args, result: currentResult, ctx });
      if (updated && typeof updated === 'object' && 'result' in updated) {
        currentResult = updated.result;
      }
    } catch (e) {
      console.warn(`[hook-registry] ⚠️ PostToolUse hook '${name}' failed (fail-open): ${e.message}`);
    }
  }

  return currentResult;
}

module.exports = {
  registerHook,
  getHooks,
  runPreHooks,
  runPostHooks,
};