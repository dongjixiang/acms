// ACMS 内建工具 — read_window_content（v0.121）
//
// 用途：读取用户在「对话工作区」里打开的文件窗口正文 —— 配合"引用+按需"注入模式。
//   系统上下文里只注入「当前选中窗口」的引用（名称 + windowId），不注入正文（省 token）；
//   LLM 真需要内容时调本工具，由后端按 windowId 读文件。
//
// 数据来源：chat_window_ctx 表（前端 file-picker 打开/选中窗口时注册）
//   file_id   → /server/public/office/<fileId>.<docx|xlsx|pptx> → pandoc 转纯文本
//   file_path → 直接读（文本/代码类）
//
// 只读工具，无副作用。
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { registerTool } = require('../services/tool-registry');
const chatSvc = require('../services/chat-session-service');

const OFFICE_DIR = path.join(__dirname, '..', 'public', 'office');
const MAX_CHARS = 20000;
const TEXT_EXT = new Set(['txt','md','markdown','json','js','jsx','ts','tsx','py','java','c','cpp','h','hpp','css','scss','sass','less','html','htm','xml','csv','tsv','log','sh','bash','yaml','yml','ini','conf','toml','sql','vue','svelte','go','rs','rb','php','kt','swift','r','lua','pl','tex','env']);

function _pandocText(file) {
  return new Promise((resolve) => {
    execFile('pandoc', [file, '-t', 'plain', '--wrap=none'],
      { maxBuffer: 16 * 1024 * 1024, timeout: 20000 },
      (err, stdout) => resolve(err ? null : stdout));
  });
}

// ── v0.122: 把前端上报的「编辑器内存态」docContext 渲染成 AI 友好文本 ──
// 关键：**必须带单元格地址**（A/B/C…+行号），否则 LLM 无法生成 format_range 这类
// 精确到 range 的 op。pandoc 那条路纯文本无地址，正是「把 A+ 标红」做不了的原因之一。
function _colLetter(n) {
  let s = '';
  n = Number(n) + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function _cellsToText(v) {
  if (v == null) return '';
  return String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function _renderSheets(doc) {
  const sheets = (doc && doc.sheets) || [];
  if (!sheets.length) return null;
  const out = [];
  sheets.forEach((s, si) => {
    const rows = (s.rows || []).filter(r => Array.isArray(r));
    if (!rows.length) return;
    // 去掉右侧全空列 / 底部全空行，避免空白刷屏
    let maxCol = 0;
    rows.forEach(r => { for (let c = r.length - 1; c >= 0; c--) { if (String(r[c] == null ? '' : r[c]).trim() !== '') { if (c + 1 > maxCol) maxCol = c + 1; break; } } });
    if (maxCol === 0) maxCol = Math.min(rows[0].length, 26);
    let maxRow = rows.length;
    while (maxRow > 0 && rows[maxRow - 1].every(v => String(v == null ? '' : v).trim() === '')) maxRow--;
    if (maxRow === 0) return;
    out.push('工作表' + (si + 1) + '「' + (s.name || '(未命名)') + '」' +
             (s.id ? ' sheetId=' + s.id : '') + '  范围 ' + _colLetter(0) + '1:' + _colLetter(maxCol - 1) + maxRow);
    const header = ['行'];
    for (let c = 0; c < maxCol; c++) header.push(_colLetter(c));
    out.push('| ' + header.join(' | ') + ' |');
    out.push('|' + header.map(() => '---').join('|') + '|');
    for (let r = 0; r < maxRow; r++) {
      const row = [(r + 1)];
      for (let c = 0; c < maxCol; c++) row.push(_cellsToText(rows[r] ? rows[r][c] : ''));
      out.push('| ' + row.join(' | ') + ' |');
    }
    out.push('');
  });
  return out.length ? out.join('\n') : null;
}

function _renderBlocks(doc) {
  const blocks = (doc && doc.blocks) || [];
  if (!blocks.length) return null;
  const out = [];
  blocks.forEach(b => {
    const tag = b.type === 'docHeading' ? ('标题' + (b.level || 1)) :
                b.type === 'docListItem' ? ('列表项') : '段落';
    out.push('[' + b.i + '] ' + tag + '：' + (b.text || ''));
  });
  return out.join('\n');
}

registerTool({
  name: 'read_window_content',
  description: '读取用户在对话工作区里打开的文件窗口的正文内容。'
    + '当用户的问题需要基于他正在看的文件（Word/Excel/PPT/代码/文本）来回答时才调用。'
    + 'windowId 必须从对话上下文的「对话工作区」段落里取，不要自己编造。'
    + '【拿到的是编辑器当前内存态】—— 包含用户尚未保存的改动，且表格类会带单元格地址（A/B/C + 行号），'
    + '可直接用于生成精确到 range 的编辑操作。'
    + '只读，不会修改用户的文件。返回截断后的正文文本。',
  parameters: {
    type: 'object',
    properties: {
        windowId: { type: 'string', description: '窗口 id，例如 "aw-2"（来自对话工作区上下文）' },
        sessionId: { type: 'string', description: '会话 id（对话工作区上下文里也给，用于精确定位；可选）' },
      maxChars: { type: 'number', description: '最多返回多少字符（默认 20000，上限 60000）' },
    },
    required: ['windowId'],
  },
  async handler(args) {
    const wid = args && args.windowId;
    if (!wid) return { error: 'MISSING_WINDOW_ID', message: '需要 windowId' };
    let rec = null;
    try {
      // 优先按 (sessionId, windowId) 精确命中；没有 sessionId 才退全局（兼容旧上下文）
      rec = (args.sessionId && chatSvc.getWindowByIdInSession)
        ? (chatSvc.getWindowByIdInSession(args.sessionId, wid) || chatSvc.getWindowById(wid))
        : chatSvc.getWindowById(wid);
    } catch (e) { return { error: 'LOOKUP_FAILED', message: e.message }; }
    if (!rec) return { error: 'WINDOW_NOT_FOUND', message: '没有这个窗口的注册信息（可能已关闭或未注册）' };
    const limit = Math.min(Number(args.maxChars) || MAX_CHARS, 60000);

    // ⓪ v0.122 优先：前端上报的编辑器内存态（含未保存改动 + 单元格地址）
    //    这条路才能支撑「把 A+ 标红」这类需要精确定位的编辑任务。
    if (rec.doc_context) {
      let parsed = null;
      try { parsed = typeof rec.doc_context === 'string' ? JSON.parse(rec.doc_context) : rec.doc_context; } catch (e) { parsed = null; }
      if (parsed && parsed.doc) {
        let text = null, kind = parsed.kind || rec.kind || '';
        if (parsed.doc.sheets) text = _renderSheets(parsed.doc);
        else if (parsed.doc.blocks) text = _renderBlocks(parsed.doc);
        if (text) {
          const head = '【编辑器当前内存态' +
            (rec.doc_context_at ? '（快照于 ' + rec.doc_context_at + '）' : '') +
            '】以下含用户尚未保存的改动：\n';
          const full = head + text;
          return {
            ok: true, name: rec.name, kind: kind, source: 'editor-memory',
            chars: full.length, truncated: full.length > limit,
            text: full.slice(0, limit),
          };
        }
      }
      // doc_context 有但渲染不出来（如 slides HTML-deck）→ 落到下面兜底
    }

    // ① office 编辑器副本 → pandoc 转纯文本（兜底：窗口没上报内存态时）
    if (rec.file_id) {
      for (const ext of ['docx', 'xlsx', 'pptx']) {
        const p = path.join(OFFICE_DIR, rec.file_id + '.' + ext);
        if (fs.existsSync(p)) {
          const txt = await _pandocText(p);
          if (txt == null) return { error: 'CONVERT_FAILED', message: '文档转换失败（pandoc）', name: rec.name };
          return {
            ok: true, name: rec.name, kind: ext, source: 'disk',
            chars: txt.length, truncated: txt.length > limit, text: txt.slice(0, limit),
          };
        }
      }
      return { error: 'FILE_NOT_FOUND', message: '编辑器副本不存在: ' + rec.file_id };
    }

    // ② 文本 / 代码 → 直接读原文件
    if (rec.file_path) {
      try {
        const st = fs.statSync(rec.file_path);
        if (!st.isFile()) return { error: 'NOT_A_FILE', message: '不是文件' };
        const ext = String(rec.file_path.split('.').pop() || '').toLowerCase();
        if (!TEXT_EXT.has(ext) && st.size > 2 * 1024 * 1024) {
          return { ok: false, reason: 'binary-or-too-large', name: rec.name, size: st.size,
                   message: '这个文件不是文本类型或太大，无法作为文本读取' };
        }
        const txt = fs.readFileSync(rec.file_path, 'utf8');
        return {
          ok: true, name: rec.name, kind: ext, chars: txt.length,
          truncated: txt.length > limit, text: txt.slice(0, limit),
        };
      } catch (e) {
        return { error: 'READ_FAILED', message: e.message };
      }
    }

    return { error: 'NO_SOURCE', message: '这个窗口没有可读取的文件来源（图片/网页类窗口暂不支持）' };
  },
});
