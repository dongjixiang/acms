// ACMS 内建工具 — window_action（v0.122）
//
// 用途：把「编辑动作」应用到用户在对话工作区里打开的窗口 —— 与 read_window_content 配对。
//   read_window_content  读编辑器内存态（含单元格地址）
//   window_action        写编辑器内存态（改完用户可 Ctrl+Z 撤销，自己按需保存）
//
// 为什么不能像普通后端工具那样直接改：
//   文档活在浏览器里的编辑器实例（office 是 GenOffice iframe）。后端进程碰不到它。
//   所以本工具只做「校验 + 把动作交给前端」——
//   真正的 apply 发生在浏览器侧（WindowActionBridge.apply → OfficeV3.runAction → applyPlan）。
//
// 传递路径（v0.122）：
//   本工具返回 { pendingApply:true, windowUid, kind, action }
//   → chat-intent.js 的 Qwen onEvent 在 tool_use_end 时识别 tool_name==='window_action'
//   → 往 SSE 里补推一条 { type:'office_action_apply', windowUid, kind, action, summary }
//   → 前端 chat.js 收到 → WindowActionBridge.apply(windowUid, action)
//
// 设计约束（对齐 office-action.js）：
//   单次调用只能提交**一类** op（structural/content/format/layout/charts/data），
//   混类会被 GenOffice 的 zod schema 拒绝（"must be proposed in separate batches"）。
//   本工具在入参处先拦一道，给出清晰错误而不是让前端炸。
const { registerTool } = require('../services/tool-registry');
const chatSvc = require('../services/chat-session-service');

// 与 office-action.js 的 OP_CLASSES 保持一致（那边是权威定义，这里只做早期拦截）
let OP_CLASSES = null;
try { OP_CLASSES = require('./office-action').OP_CLASSES; } catch (e) { /* 静默 */ }

function classifyOps(operations) {
  if (!OP_CLASSES) return { ok: true };
  const classes = new Set();
  const unknown = [];
  (operations || []).forEach(op => {
    const name = op && op.op;
    if (!name) return;
    let hit = null;
    for (const cls of Object.keys(OP_CLASSES)) {
      if (OP_CLASSES[cls].has(name)) { hit = cls; break; }
    }
    if (hit) classes.add(hit);
    else unknown.push(name);
  });
  if (unknown.length) return { ok: false, error: 'UNKNOWN_OPS', unknownOps: unknown };
  if (classes.size > 1) {
    return { ok: false, error: 'MIXED_CLASS_OPS', mixedClasses: [...classes] };
  }
  return { ok: true, opClass: [...classes][0] || null };
}

registerTool({
  name: 'window_action',
  description:
    '把编辑动作应用到用户在对话工作区里打开的窗口（Excel/Word/PPT）。\n'
    + '\n'
    + '【改的是编辑器内存态，不是磁盘文件】\n'
    + '- 改完表格/文档里**立刻可见**；用户可 Ctrl+Z 撤销；由用户自己决定何时保存。\n'
    + '- 所以本工具成功后不要对用户说"已保存"，要说"已应用到窗口，可撤销，需要时自行保存"。\n'
    + '\n'
    + '【必须先读再写】\n'
    + '先调 read_window_content 拿到编辑器当前内存态（表格会带单元格地址 A/B/C + 行号），\n'
    + '据此算出精确的 range 再调本工具。不要凭猜测编造单元格地址。\n'
    + '\n'
    + '【单类 op 约束】\n'
    + '单次调用只能提交一类 op，混类会被拒绝（需拆成多次调用）：\n'
    + '- format：format_range / formatOps / format_cell        —— 标红、加粗、底色等\n'
    + '- content：set_cell / set_formula / set_range / find_replace 等\n'
    + '- structural：add_sheet / insert_rows / insert_cols / delete_rows 等\n'
    + '- layout：sort_range / merge_cells / set_row_height / set_freeze 等\n'
    + '- charts：add_chart / edit_chart / add_image 等\n'
    + '- data：add_conditional_format / set_filter / add_table 等\n'
    + '\n'
    + '【典型用法】\n'
    + '用户："把这个表里所有 A+ 标成红色"\n'
    + '1) read_window_content({windowId:"aw-2"}) → 看到 B2=C+、E5=A+...\n'
    + '2) window_action({\n'
    + '     windowUid:"w-xxx", kind:"xlsx", summary:"把所有 A+ 标红",\n'
    + '     operations:[{op:"format_range", sheetId:"sheet-1", range:"E5:E5", format:{fontColor:"#FF0000"}}]\n'
    + '   })\n'
    + '\n'
    + '【何时不要调】\n'
    + '- 用户只是问内容 → 只用 read_window_content\n'
    + '- 窗口没打开 / 用户没把窗口关联到对话 → 先提示他打开并选中窗口',
  parameters: {
    type: 'object',
    properties: {
      windowUid: {
        type: 'string',
        description: '目标窗口的 uid（形如 "w-tkil-1-zbd8"，来自对话工作区上下文）。必填。',
      },
      windowId: {
        type: 'string',
        description: '兼容字段：窗口 id（形如 "aw-2"）。windowUid 缺失时会用它反查。',
      },
      kind: {
        type: 'string',
        description: '窗口类型：xlsx | word | slides。缺省时按窗口注册信息推断。',
      },
      summary: {
        type: 'string',
        description: '一句话说明这次要做什么（会显示给用户，例如"把所有 A+ 标红"）。',
      },
      operations: {
        type: 'array',
        description: '编辑动作列表。单次只能同一类 op。格式见上面各 op 说明。',
        items: { type: 'object' },
      },
    },
    required: ['operations'],
  },
  async handler(args) {
    args = args || {};
    const ops = Array.isArray(args.operations) ? args.operations : [];
    if (!ops.length) {
      return { ok: false, error: 'NO_OPERATIONS', message: 'operations 为空，没什么可执行的' };
    }

    // ① 单类 op 校验（先拦一道，给清晰错误）
    const cls = classifyOps(ops);
    if (!cls.ok) {
      return {
        ok: false,
        error: cls.error,
        unknownOps: cls.unknownOps,
        mixedClasses: cls.mixedClasses,
        message: cls.error === 'MIXED_CLASS_OPS'
          ? `operations 混类（${(cls.mixedClasses || []).join(' + ')}），请拆成多次 window_action 调用`
          : `未知 op: ${(cls.unknownOps || []).join(', ')}`,
      };
    }

    // ② 定位窗口注册信息（doc_context 所在的记录）
    let rec = null;
    try {
      if (args.windowUid) {
        // uid 是前端 WindowActionBridge 生成的 w.uid；后端记录里存的是 window_id
        // 前端上报 ctx 时 windowId 字段就是 uid（v0.122 起），先按它查
        rec = chatSvc.getWindowById(args.windowUid);
      }
      if (!rec && args.windowId) rec = chatSvc.getWindowById(args.windowId);
      // 再退一步：全局找最近活跃的窗口
      if (!rec) {
        const active = chatSvc.getActiveWindow && chatSvc.getActiveWindow(null);
        if (active) rec = active;
      }
    } catch (e) {
      return { ok: false, error: 'LOOKUP_FAILED', message: e.message };
    }

    const kind = args.kind || (rec && rec.kind) || null;
    const uid = args.windowUid || (rec && rec.window_id) || null;

    if (!uid) {
      return {
        ok: false,
        error: 'NO_TARGET_WINDOW',
        message: '没找到目标窗口。请让用户先在对话工作区里打开并选中要改的文件窗口。',
      };
    }
    if (rec && rec.kind && kind && rec.kind !== kind) {
      return {
        ok: false,
        error: 'KIND_MISMATCH',
        message: `窗口类型不符：窗口是 ${rec.kind}，请求是 ${kind}`,
      };
    }
    if (kind === 'slides') {
      return {
        ok: false,
        error: 'SLIDES_NOT_SUPPORTED',
        message: 'PPT 是 HTML-deck 模式，当前不支持结构化编辑动作',
      };
    }

    // ③ 组装动作，交给前端 apply
    //    这里**不**直接执行 —— 后端碰不到浏览器里的编辑器实例。
    const action = {
      op: 'propose',                 // runAction 的语义：propose + 立即 applyPlan
      operations: ops,
      summary: args.summary || 'AI 编辑',
    };

    return {
      ok: true,
      pendingApply: true,            // 标记：chat-intent 会据此补推 SSE 给前端
      windowUid: uid,
      kind: kind,
      action: action,
      opClass: cls.opClass,
      summary: action.summary,
      note: '动作已下发到窗口（改的是编辑器内存态，用户可 Ctrl+Z 撤销，需自行保存）',
    };
  },
});
