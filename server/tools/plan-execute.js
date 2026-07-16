// ACMS Tool — plan_execute (v0.48, 2026-07-16)
// LLM 看到复合意图（多 tool / 多步骤 / 依赖）时调用
// 治 v0.47.5 多多 REQ-MRHNP0PR 案例：chat 流说"生成图片+发邮件"只调了 generate_image
// 根因：LLM 一次性 tool_loop 决策漏调
// 治法：复合意图走 plan_execute → plan-executor 按拓扑序保证所有步骤执行
//
// handler 行为：fire-and-forget
//   - 立即返回 ok=true 表示"已接收 plan，开始执行"
//   - 不阻塞 LLM tool_loop，让 LLM 继续 final answer
//   - 执行过程通过聊天流 system entry 反馈给用户
//     (plan_loading → 各 step 实时 plan_step_update → plan_done)
//   - 前端 ⏳ 卡自动消失，结果卡（image_card / send_email_done 等）复用现有

const { registerTool } = require('../services/tool-registry');

registerTool({
  name: 'plan_execute',
  description:
    '执行一个多步骤 plan — 当用户请求涉及 2 个或以上工具、或步骤间有依赖关系、或步骤有耗时可能时，必须先调用本工具把整个事情拆成步骤交给系统执行。\n' +
    '\n' +
    '【何时必须调本工具】\n' +
    '- 用户同时表达多个 tool 意图（如"生成图片+发邮件"、"调研 3 个产品+生成对比表"、"查天气+查日历+找咖啡馆"）\n' +
    '- 步骤间有先后顺序或依赖（图片生成后才能发邮件作为附件、3 个调研后才能综合对比表）\n' +
    '- 步骤耗时较长（图片/视频生成），希望 AI 不会漏调后续步骤\n' +
    '\n' +
    '【何时不要调本工具】\n' +
    '- 只有 1 个 tool 意图（直接调那个 tool）\n' +
    '- 纯问答/解释/总结（直接文字回复）\n' +
    '- 用户明确说"先做 X、再看结果决定是否做 Y"（等用户反馈再决定后续）\n' +
    '\n' +
    '【参数 plan.steps 格式】\n' +
    '每个 step: { tool, args, depends_on? }\n' +
    '- tool: 必须是已注册的工具名（generate_image / play_video / send_email / web_search / web_research / fetch_url / get_current_time / play_music / agnes_generate_video）\n' +
    '- args: 该 tool 的参数对象（按各 tool 的 schema）\n' +
    '- depends_on: 上游 step id 数组（可选），表示等这些步骤完成才执行本步\n' +
    '\n' +
    '【handler 行为】fire-and-forget — handler 不阻塞 tool_loop，立即返回 ok=true 表示"已接收，开始执行"。' +
    '执行过程通过聊天流的 system entry 反馈给用户（loading 卡 → 各 step 实时更新 → done），前端会复用现有 image_card / send_email_done 等结果卡。\n' +
    '\n' +
    '【典型用法示例】\n' +
    '用户："生成小猫小狗打架图片并发邮件到 oracle.com"\n' +
    '{\n' +
    '  "summary": "生成图片并发邮件",\n' +
    '  "steps": [\n' +
    '    { "tool": "generate_image", "args": { "prompt": "小猫小狗打架" } },\n' +
    '    { "tool": "send_email", "args": { "to": "oracle@x.com", "subject": "...", "body": "..." }, "depends_on": ["s1"] }\n' +
    '  ]\n' +
    '}',
  parameters: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: '一句话说明这个 plan 要做什么（≤50 字，会显示在 ⏳ 卡上）',
      },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: '步骤 id（可选，不传则自动生成 s1, s2...）',
            },
            tool: {
              type: 'string',
              description: '工具名（必须是已注册的工具）',
            },
            args: {
              type: 'object',
              description: '该 tool 的参数对象',
            },
            depends_on: {
              type: 'array',
              items: { type: 'string' },
              description: '依赖的上游 step id 数组（无依赖可省略）',
            },
          },
          required: ['tool', 'args'],
        },
        description: '步骤数组（按 LLM 期望的执行顺序排列）',
      },
    },
    required: ['summary', 'steps'],
  },
  async handler(args, ctx = {}) {
    const { reqId } = ctx;
    if (!reqId) {
      return { ok: false, error: 'NO_REQ_ID', message: 'plan_execute 需要 reqId 上下文' };
    }
    if (!args || !Array.isArray(args.steps) || args.steps.length === 0) {
      return {
        ok: false,
        error: 'INVALID_ARGS',
        message: 'plan.steps 必须是非空数组',
      };
    }
    if (args.steps.length > 20) {
      return {
        ok: false,
        error: 'TOO_MANY_STEPS',
        message: 'plan 步骤数 ≤ 20（避免过度编排）',
      };
    }

    // 延迟 require 避免循环依赖（plan-executor.js require routes/chat-intent.js）
    const planExecutor = require('../services/plan-executor');
    const result = await planExecutor.executePlan(reqId, {
      summary: args.summary || '',
      steps: args.steps,
    });
    return result;
  },
});