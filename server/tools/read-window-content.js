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

registerTool({
  name: 'read_window_content',
  description: '读取用户在对话工作区里打开的文件窗口的正文内容。'
    + '当用户的问题需要基于他正在看的文件（Word/Excel/PPT/代码/文本）来回答时才调用。'
    + 'windowId 必须从对话上下文的「对话工作区」段落里取，不要自己编造。'
    + '只读，不会修改用户的文件。返回截断后的正文文本。',
  parameters: {
    type: 'object',
    properties: {
      windowId: { type: 'string', description: '窗口 id，例如 "aw-2"（来自对话工作区上下文段落）' },
      maxChars: { type: 'number', description: '最多返回多少字符（默认 20000，上限 60000）' },
    },
    required: ['windowId'],
  },
  async handler(args) {
    const wid = args && args.windowId;
    if (!wid) return { error: 'MISSING_WINDOW_ID', message: '需要 windowId' };
    let rec = null;
    try { rec = chatSvc.getWindowById(wid); } catch (e) { return { error: 'LOOKUP_FAILED', message: e.message }; }
    if (!rec) return { error: 'WINDOW_NOT_FOUND', message: '没有这个窗口的注册信息（可能已关闭或未注册）' };
    const limit = Math.min(Number(args.maxChars) || MAX_CHARS, 60000);

    // ① office 编辑器副本 → pandoc 转纯文本
    if (rec.file_id) {
      for (const ext of ['docx', 'xlsx', 'pptx']) {
        const p = path.join(OFFICE_DIR, rec.file_id + '.' + ext);
        if (fs.existsSync(p)) {
          const txt = await _pandocText(p);
          if (txt == null) return { error: 'CONVERT_FAILED', message: '文档转换失败（pandoc）', name: rec.name };
          return {
            ok: true, name: rec.name, kind: ext, chars: txt.length,
            truncated: txt.length > limit, text: txt.slice(0, limit),
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
