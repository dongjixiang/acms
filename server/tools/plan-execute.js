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
    '【⚠️ plan.steps 必须完整覆盖用户每个工具意图】\n' +
    '用户提到的每个工具动作（搜索/调研/生成图片/生成视频/生成文档/发邮件/查日历等）**必须在 plan.steps 里**有一个对应 step。\n' +
    '**严禁**省略：用户说"查 X + 生成 Word + 发邮件"，plan 里就必须有 web_search + document_gen + send_email 三步，缺一不可。\n' +
    '**严禁**嘴上说 3 步但 plan 里只列 2 步 —— 每个工具意图独立对应一个 step。\n' +
    '**严禁**把多个 tool 意图合并成一个 step（除非确实有合并 API）。\n' +
    '\n' +
    '【何时不要调本工具】\n' +
    '- 只有 1 个 tool 意图（直接调那个 tool）\n' +
    '- 纯问答/解释/总结（直接文字回复）\n' +
    '- 用户明确说"先做 X、再看结果决定是否做 Y"（等用户反馈再决定后续）\n' +
    '\n' +
    '【参数 plan.steps 格式】\n' +
    '每个 step: { tool, args, depends_on? }\n' +
    '- tool: 必须是已注册的工具名（generate_image / play_video / send_email / web_search / web_research / fetch_url / get_current_time / play_music / agnes_generate_video / document_gen）\n' +
    '- args: 该 tool 的参数对象（按各 tool 的 schema）\n' +
    '- depends_on: 上游 step id 数组（可选），表示等这些步骤完成才执行本步\n' +
    '\n' +
    '【⚠️ 选对工具（按用户意图类型决定）v0.50 升级】\n' +
    '- "查**最新赛况/新闻/动态/最近发生/比分**" → **web_research**（LLM 综合多源 → 写结构化摘要，最适合"赛况总结"）\n' +
    '- "查某个具体事实/产品价格/某词列表/某单一信息" → web_search（搜索引擎原生 list of titles）\n' +
    '- "抓 URL 网页内容" → fetch_url（**仅接受完整 http(s) URL**，不是搜索 query）\n' +
    '- "生成图片/海报/插图" → generate_image\n' +
    '- "生成 Word 文档 / 整理成 Word / 生成 docx / 整理成文档" → **document_gen**（v0.48 真 tool，会返回 .docx + .md + file_ids）\n' +
    '- "发邮件/通知/把对话发邮件" → send_email（**file_ids 自动串联上游 document_gen / generate_image 等的产出**）\n' +
    '选错工具 = 那个步骤失败或返回空数据。**复合意图里 web_research vs web_search 二选一**：要"读起来通顺的赛况总结" 用 web_research；要"原始链接 + snippet 列表" 用 web_search。\n' +
    '\n' +
    '【⚠️ 下游 step（send_email/generate_image/document_gen）的 body 必须引用上游数据 v0.50 升级】\n' +
    '当 send_email / generate_image / document_gen 是某个上游 web_search / web_research / generate_image / document_gen 的下游（depends_on）时，\n' +
    '你**必须**在 args.body / args.prompt / args.instruction 里用 ${...} 模板引用上游真实数据，否则产出空话：\n' +
    '  ❌ 错误示例：args.body = "Please find attached the latest World Cup promotional image."（凭空编）\n' +
    '  ✅ 正确示例：args.body = "世界杯赛况：${s1.formatted}\\n海报附件 ID：${s2.file_ids.0.id}..."（含真数据 + 上游 file_id）\n' +
    '\n' +
    '注：plan-executor 对 generate_image / document_gen 已自动注入上游 ${s1.formatted} 作为 prefix（治"LLM 不写 ${...}" 兜底），但 send_email.body 不自动注入（body 是用户读的纯正文，自动拼接 prefix 会污染）。所以：**send_email body 必须 LLM 自己显式写 ${...} 引用**。\n' +
    '\n' +
    '【⚠️ document_gen + send_email 串联用法】\n' +
    '当用户要"搜索 + 生成 Word 文档 + 发邮件"这类多步骤，**每个步骤都要列在 plan.steps 里**。\n' +
    'document_gen 会返回 file_ids（docx + md 都注册到 chat-upload），\n' +
    'send_email 自动从依赖里收集上游 document_gen 的 file_ids 作附件 —— **你不需要在 send_email args 里手动传 file_ids**。\n' +
    '只要 plan.steps 正确 depends_on 串联即可。\n' +
    '\n' +
    '【v0.49 新增 — 数据流模板语法 ${step_id.field_path}】\n' +
    '当下游 step 需要引用上游 step result 里的具体字段时，**必须用模板语法注入**，禁止凭空编写下游参数：\n' +
    '  s1 web_search  → result.formatted = "1. FIFA Final Argentina vs France\\n   https://espn.com ..."\n' +
    '  s2 generate_image args.prompt = "基于赛况生成 FIFA 决赛宣传图，赛况: ${s1.formatted}"  ← 注入 s1.formatted\n' +
    '  s3 send_email    args.body    = "世界杯赛况概要：${s1.results.0.title}\\n海报附件 ID: ${s2.file_ids.0.id}"  ← 嵌套引用\n' +
    '语法规则：\n' +
    '- `${<step_id>.<dot.path>}` 中 step_id 对应 plan.steps 里的 id，path 是 result 字段路径\n' +
    '- 支持任意深度 + 数组下标：`${s2.file_ids.0.id}` / `${s1.results.0.title}` / `${s1.count}`\n' +
    '- 找不到路径时**保留原字符串**（不报错，方便你看到 raw 自己修正）\n' +
    '- 严禁凭空写下游 prompt/body 不引用上游 —— 会导致"AI 装能做"症状\n' +
    '- 严禁从历史对话 context 里抄"上次结果"当上游 —— 必须用 ${...} 引用当前 plan 的真实 step result\n' +
    '\n' +
    '【⚠️ 数据不足防护 — 必须告知，禁止凭空编造】\n' +
    '当 web_search / web_research / fetch_url 等查询工具返回 **0 条 或 明显不相关（广告/跳转/历史残留）** 的结果时：\n' +
    '- **严禁**凭想象在下游 step 的 prompt/body 里写"赛况：……"、"结果：……"、附件描述等编造内容\n' +
    '- **必须**在该步骤的 tool call args 里如实说明"未找到相关数据"，或在 final answer 里告知用户\n' +
    '- 例：plan.executor 会根据 `${s1.formatted}` 找不到时**保留原字符串**，你看到 `${s1.formatted}` 没被解析 = 上游数据缺失\n' +
    '\n' +
    '【生成图/文档 vs 音乐/视频 — fire-and-forget 行为差异】\n' +
    'plan 编排下的工具行为：\n' +
    '- generate_image / document_gen — 真完成（等图/文档真正下载保存后才返回；result 含 file_ids / asset_path 可串联）\n' +
    '- play_music / agnes_generate_video — fire-and-forget（启动异步立即返回；用户后续看到卡片，不是 plan step result.file_ids）\n' +
    '所以下游 send_email 想接上游产出时，**只对 generate_image / document_gen 用 ${...} 引用 file_ids**，其他 fire-and-forget 类型不支持。\n' +
    '\n' +
    '【handler 行为】fire-and-forget — handler 不阻塞 tool_loop，立即返回 ok=true 表示"已接收，开始执行"。' +
    '执行过程通过聊天流的 system entry 反馈给用户（loading 卡 → 各 step 实时更新 → done），前端会复用现有 image_card / send_email_done 等结果卡。\n' +
    '\n' +
    '【典型用法示例】\n' +
    '用户："查 2026 世界杯半决赛结果 + 生成 Word 文档 + 发邮件到 oracle.com"\n' +
    '{\n' +
    '  "summary": "查世界杯结果并生成文档发邮件",\n' +
    '  "steps": [\n' +
    '    { "tool": "web_search", "args": { "query": "2026世界杯半决赛结果 四强 比分", "max_results": 8 } },\n' +
    '    { "tool": "document_gen", "args": { "instruction": "把搜索结果整理成 Word 文档" }, "depends_on": ["s1"] },\n' +
    '    { "tool": "send_email", "args": { "to": "oracle@x.com", "subject": "2026世界杯半决赛结果汇总", "body": "..." }, "depends_on": ["s2"] }\n' +
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

    // v0.49: LLM 偶尔把 steps 序列化成 JSON 字符串（重复出现 ≥3 次仍重试），
    //   自动尝试 JSON.parse 修复，避免 5 轮 tool-loop 全花在 INVALID_ARGS 上
    if (typeof args?.steps === 'string') {
      try {
        args.steps = JSON.parse(args.steps);
        console.log(`[tool:plan_execute] ${reqId} auto-fixed: steps 从字符串解析回数组`);
      } catch (e) {
        return {
          ok: false,
          error: 'INVALID_ARGS',
          message: `plan.steps 是字符串但 JSON.parse 失败: ${e.message.slice(0, 100)}`,
        };
      }
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