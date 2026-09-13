// ACMS Office Action Tool (v0.X, 2026-09-10)
// 把 /api/agent-buddy/office-action HTTP 端点包装成 plan_execute 可编排的 server tool。
//
// 核心设计（详见 docs/plan/excel-multi-step-plan-b-2026-09-10.md §3.1）：
//   - 单次调用只能提交一类 op（structural / content / format / layout / charts）
//   - 混类直接拒绝，避免 applyPlan 时 zod schema 校验失败
//   - refreshContext=true → 重新读 fresh docContext（structural 下游必传）
//   - 把 office-action 端点产出的 action JSON 写 system entry source='office_action_apply'
//     → 前端识别 entry → 调 applyPlan 到 Univer 内存 / Tiptap / Konva
//
// 历史：今天多多踩的 "Structural operations ... must be proposed in separate batches"
//   根因：GenOffice sheets bundle (adapter-DLlo0sxK.js:332041) zod schema 硬规则
//   治法：chat 流用户多步指令 → LLM 调 plan_execute → 每个 step 调 office_action
//        → 每次 office-action 单类 op → 每次合法 batch

const { registerTool } = require('../services/tool-registry');

// Op 分类表（单类 op 校验用）
// 来源：GenOffice sheets bundle description 内的 5 大类（structural/content/format/layout/charts）
// Word/PPT 也按此分类（applyPlan 走同链路）
const OP_CLASSES = {
  structural: new Set([
    'add_sheet', 'delete_sheet', 'rename_sheet', 'duplicate_sheet',
    'insert_rows', 'delete_rows', 'insert_cols', 'delete_cols',
    'set_sheet_hidden', 'move_sheet', 'protect_sheet',
  ]),
  content: new Set([
    'set_cell', 'set_formula', 'clear_cell', 'set_range', 'clear_range',
    'find_replace', 'set_hyperlink', 'set_note',
    // Word ops 也走 content 类（appendAll / proposeEdits / insertAfterSelection 等）
    'appendAll', 'proposeEdits', 'proposeEdit', 'insertAfter', 'insertAfterSelection',
    'insertImagesAtContent',
    // Slides HTML-deck 模式（一次性整 deck 替换）
    'replaceHtmlDeck',
  ]),
  format: new Set([
    'format_range', 'formatOps', 'format_cell',
  ]),
  layout: new Set([
    'sort_range', 'merge_cells', 'unmerge_cells',
    'set_row_height', 'set_col_width',
    'set_rows_hidden', 'set_cols_hidden',
    'set_freeze', 'set_page_setup',
  ]),
  charts: new Set([
    'add_chart', 'edit_chart', 'delete_visual',
    'add_sparkline', 'add_shape', 'edit_shape', 'add_image',
  ]),
  data: new Set([
    'set_filter', 'clear_filter', 'set_filter_criteria',
    'add_conditional_format', 'clear_conditional_formats',
    'set_data_validation', 'add_defined_name', 'delete_defined_name',
    // Pivot/table 类
    'add_pivot', 'refresh_pivot',
    'add_table', 'add_table_row', 'add_table_column',
    'delete_table_row', 'delete_table_column', 'delete_table',
  ]),
};

/**
 * 校验 operations 数组是否全部属于同一类
 * @param {Array} operations - [{op: 'add_sheet', ...}, ...]
 * @returns {{ok: true, opClass: string} | {ok: false, error: string, mixedClasses: string[]}}
 */
function validateOpsSingleClass(operations) {
  if (!Array.isArray(operations) || operations.length === 0) {
    return { ok: false, error: 'EMPTY_OPERATIONS' };
  }

  const classes = new Set();
  const unknownOps = [];
  for (const op of operations) {
    if (!op || typeof op.op !== 'string') {
      unknownOps.push(String(op));
      continue;
    }
    let found = false;
    for (const [cls, set] of Object.entries(OP_CLASSES)) {
      if (set.has(op.op)) {
        classes.add(cls);
        found = true;
        break;
      }
    }
    if (!found) {
      unknownOps.push(op.op);
    }
  }

  if (unknownOps.length > 0) {
    return { ok: false, error: 'UNKNOWN_OPS', unknownOps };
  }
  if (classes.size > 1) {
    return { ok: false, error: 'MIXED_CLASS_OPS', mixedClasses: Array.from(classes) };
  }
  return { ok: true, opClass: Array.from(classes)[0] };
}

/**
 * 读取 fresh docContext（PR1 占位：返回 null，PR2 由前端补真实实现）
 * 真实实现需要从 office sessionId 调 __sheetsDebug.snapshot / __wordSnapshot 重新读数据
 *
 * @param {string} reqId - requirement id
 * @param {string} kind - 'word' | 'xlsx' | 'slides'
 * @returns {Promise<object|null>}
 */
async function readFreshOfficeDocContext(reqId, kind) {
  // PR1: 占位返回 null。前端通过 ctx.refreshContextHint=true 时
  // 会自己读 snapshot 并在下一次 ask 时把 docContext 塞进来。
  // 真正的实现见 PR2（前端 office-v3-bridge.js 暴露 readFreshDocContext()）
  // 和 PR3（plan_executor 调用前等前端 ack）。
  return null;
}

registerTool({
  name: 'office_action',
  description:
    '【v0.X 编排 Excel/Word/PPT 多步操作】向 Office V3 编辑器（kind:word/xlsx/slides）提交一组编辑动作。\n' +
    '\n' +
    '【何时使用】\n' +
    '- 用户在 chat 流请求"加 sheet + 写表头 + 写数据 + 加公式"等多步 Excel/Word 操作\n' +
    '- 用户说"修改 PPT 第 3 页内容 + 调字体 + 改配色"等多步 PPT 操作\n' +
    '- 任何需要 2 步及以上、跨 structural/content/format/layout/charts 类的 Office 操作\n' +
    '\n' +
    '【⚠️ 严格单类 op 约束 — 混类直接拒绝】\n' +
    '本工具单次调用只能提交一类 op，混类会被 handler 拒绝并返回 MIXED_CLASS_OPS。\n' +
    '\n' +
    '六大类 op：\n' +
    '- structural：add_sheet / delete_sheet / rename_sheet / duplicate_sheet / insert_rows / delete_rows / insert_cols / delete_cols / set_sheet_hidden / move_sheet / protect_sheet\n' +
    '- content：set_cell / set_formula / clear_cell / set_range / clear_range / find_replace / set_hyperlink / set_note / appendAll / proposeEdits / insertAfterSelection / insertImagesAtContent / replaceHtmlDeck\n' +
    '- format：format_range / formatOps / format_cell\n' +
    '- layout：sort_range / merge_cells / unmerge_cells / set_row_height / set_col_width / set_rows_hidden / set_cols_hidden / set_freeze / set_page_setup\n' +
    '- charts：add_chart / edit_chart / delete_visual / add_sparkline / add_shape / edit_shape / add_image\n' +
    '- data：set_filter / set_filter_criteria / add_conditional_format / set_data_validation / add_defined_name / add_pivot / add_table / refresh_pivot\n' +
    '\n' +
    '【⚠️ structural 后必须 refreshContext:true】\n' +
    '如果本 step 是另一个 office_action 的下游（依赖 structural 类变更），\n' +
    'args.refreshContext 必须设为 true。结构性变更会让原有 cell 地址失效，\n' +
    '需要重新读取 docContext 才能正确生成后续 content op。\n' +
    '\n' +
    '【何时不要调】\n' +
    '- 只有 1 个 op 且不涉及结构性变更（直接用 office-action HTTP 端点，或 Office V3 内 AI 面板）\n' +
    '- 用户在 Office V3 编辑器内的 AI 面板发指令（那条路径继续走单 batch）\n' +
    '\n' +
    '【典型用法 — plan_execute 编排】\n' +
    '用户："加 sheet『对比分析』，合并考勤和打开的数据，写公式 F=B/D"\n' +
    'plan_execute({\n' +
    '  summary:"加 sheet 并合并考勤数据",\n' +
    '  steps:[\n' +
    '    {id:"s1", tool:"office_action", args:{kind:"xlsx",\n' +
    '      operations:[{op:"add_sheet", sheetId:"sheet-3", name:"对比分析"}],\n' +
    '      summary:"新增 sheet"}},\n' +
    '    {id:"s2", tool:"office_action", args:{kind:"xlsx",\n' +
    '      refreshContext:true,\n' +
    '      operations:[\n' +
    '        {op:"set_cell", sheetId:"sheet-3", address:"A1", value:"姓名"},\n' +
    '        {op:"set_formula", sheetId:"sheet-3", address:"F2", formula:"=B2/D2"}\n' +
    '      ],\n' +
    '      summary:"写表头+公式"},\n' +
    '      depends_on:["s1"]}\n' +
    '  ]\n' +
    '})\n' +
    '\n' +
    '【handler 行为】fire-and-forget — handler 立即返回 ok=true 表示"已提交到 office-action 端点，\n' +
    '前端会拿到 system entry 并 applyPlan"。返回的 action 是 office-action 端点产出的精确动作 JSON，\n' +
    '前端用 applyPlan 写入 Univer / Tiptap / Konva。',

  parameters: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ['word', 'xlsx', 'slides'],
        description: '编辑器类型，必须与当前打开的编辑器一致',
      },
      operations: {
        type: 'array',
        description: '本批操作数组。**必须全部属于同一类**（structural/content/format/layout/charts/data），禁止混类。handler 会校验并拒绝混类。',
        items: { type: 'object' },
      },
      refreshContext: {
        type: 'boolean',
        default: false,
        description: 'true=本 step 提交前自动重新读取 docContext（structural 类下游必须=true）。PR1 占位：返回 null 由前端兜底，PR2 完整实现。',
      },
      summary: {
        type: 'string',
        description: '一句话说明本批变更（给用户看的）',
      },
    },
    required: ['kind', 'operations'],
  },

  async handler(args, ctx = {}) {
    const { reqId } = ctx;
    if (!reqId) {
      return { ok: false, error: 'NO_REQ_ID', message: 'office_action tool 必须在 plan_execute step 内调用（提供 reqId）' };
    }

    // 1. 混类校验
    const validation = validateOpsSingleClass(args.operations);
    if (!validation.ok) {
      return {
        ok: false,
        error: validation.error,
        ...(validation.mixedClasses ? { mixedClasses: validation.mixedClasses } : {}),
        ...(validation.unknownOps ? { unknownOps: validation.unknownOps } : {}),
        message: validation.error === 'MIXED_CLASS_OPS'
          ? `operations 混类（${validation.mixedClasses.join(' + ')}），必须拆成多个 plan step`
          : validation.error === 'UNKNOWN_OPS'
          ? `未知 op: ${validation.unknownOps.join(', ')}`
          : 'operations 校验失败',
      };
    }

    // 2. 读取 docContext（refreshContext=true 或缺失时）
    let docContext = args.docContext;
    if (args.refreshContext || !docContext) {
      const fresh = await readFreshOfficeDocContext(reqId, args.kind);
      if (!fresh) {
        // PR1 占位：返回 NO_DOC_CONTEXT 让 LLM 知道需要传 docContext
        // PR2 后会改成等前端 ack（前端读 snapshot 后注入）
        return {
          ok: false,
          error: 'NO_DOC_CONTEXT',
          message: 'refreshContext=true 但无法读取 fresh docContext。请在 args.docContext 里直接传，或确认编辑器已打开',
          needsDocContext: true,
        };
      }
      docContext = fresh;
    }

    // 3. POST office-action HTTP 端点
    // 使用 Node 18+ 内置 fetch（避免依赖 node-fetch）
    const httpBase = process.env.ACMS_HTTP_BASE || `http://127.0.0.1:${process.env.ACMS_PORT || 3300}`;
    const apiKey = process.env.ACMS_API_KEY || 'dev-key-001';

    let resp;
    try {
      const fetchResp = await fetch(`${httpBase}/api/agent-buddy/office-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          kind: args.kind,
          instruction: args.summary || 'office_action multi-step batch',
          docContext,
        }),
      });
      resp = await fetchResp.json();
    } catch (e) {
      return {
        ok: false,
        error: 'OFFICE_ACTION_HTTP_ERROR',
        message: `调 office-action 端点失败：${e.message}`,
      };
    }

    if (!resp || !resp.ok) {
      return {
        ok: false,
        error: 'OFFICE_ACTION_FAILED',
        reason: resp && resp.error ? resp.error : 'unknown',
        message: resp && resp.error ? resp.error : 'office-action 端点返回失败',
      };
    }

    // 4. 写 system entry source='office_action_apply' 让前端 applyPlan
    // PR1：只写 system entry（plan-executor 持久化），推到前端由 PR2 实现
    const reqStore = require('../stores/requirement-store');
    const req = reqStore.getById(reqId);
    if (req) {
      let history = [];
      try { history = JSON.parse(req.supplement_history || '[]'); } catch { /* 静默 */ }
      history.push({
        role: 'system',
        source: 'office_action_apply',
        text: JSON.stringify({
          type: 'office_action_apply',
          kind: args.kind,
          action: resp.action,
          summary: args.summary || resp.action.summary,
          stepIndex: ctx.stepIndex,
          opClass: validation.opClass,
        }),
        at: new Date().toISOString(),
      });
      reqStore.update(reqId, { supplement_history: JSON.stringify(history) });
    }

    // 5. 返回 fire-and-forget（apply 在前端发生）
    return {
      ok: true,
      action: resp.action,
      summary: args.summary || resp.action.summary,
      opClass: validation.opClass,
      pendingApply: true,  // 标记前端需要 apply
    };
  },
});

module.exports = {
  validateOpsSingleClass,
  OP_CLASSES,
};
