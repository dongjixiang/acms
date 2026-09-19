/**
 * ACMS 窗口操作通道 — Window Action Bridge (v0.122, 2026-09-19)
 * ============================================================
 *
 * 目的：让 AI（对话侧）能「读写用户打开着的窗口里的内容」。
 *   用户：在对话里打开一个 xlsx →「帮我把所有 A+ 标成红色」→ AI 真改 + 用户可撤销。
 *
 * 设计原则（2026-09-19 多多拍板：Q1=改内存态 / Q2=全 office + 未来通用）：
 *
 *   ① 按 **windowUid** 定位，不按 kind / fileId
 *      —— 同一个文件开两个窗口必须各改各的。
 *         旧实现 `state.instances` 用 fileId 当 key、`readFreshDocContext` 遍历取
 *         第一个 kind 匹配的实例 ⇒ 多窗口时读错/改错文件（同类病根：aw-N 跨会话复用）。
 *
 *   ② read 和 write 走 **同一个 adapter、同一份数据源**
 *      —— 避免「AI 用 A 数据定位、动作落到 B 数据上」。
 *         旧实现读走后端 pandoc 纯文本、写走前端 snapshot，是两份数据。
 *
 *   ③ adapter 接口统一（read / apply / describe）
 *      —— 新窗口类型（代码编辑器 / 图片编辑器）只是多注册一个 adapter 文件。
 *
 *   ④ 改的是**编辑器内存态**（可撤销、用户自己保存），不是磁盘文件。
 *      磁盘文件是「已保存版」；编辑器里未保存的改动 AI 也必须能看到。
 *
 * ── 为什么要有 uid ──
 *   `w.id` 形如 `aw-N`，是 per-页面计数器（window-manager.js:277 `'aw-' + (++winCount)`），
 *   刷新页面即复用、多标签页各自从 aw-1 开始。它作为 DOM id / 任务栏键是够的，
 *   但一旦要**持久化到后端**（chat_window_ctx 表）或跨窗口比对就会指错对象。
 *   故本模块在绑定时给窗口打一个额外的 `w.uid`，不动 `w.id` —— 零破坏。
 *
 * ── adapter 接口 ──
 *   {
 *     kind:  'xlsx' | 'word' | 'slides' | 'code' | 'image' | ...,
 *     label: 'Excel 编辑器',                    // 给 AI / 给 UI 显示
 *     canRead:  (win) => bool,                  // 可选，默认 true
 *     canApply: (win) => bool,                  // 可选，默认 true
 *     read(win, opts)         -> { ok, doc, meta } | { ok:false, error }
 *     apply(win, action, opts)-> { ok, summary, pendingSave } | { ok:false, error }
 *     describe(win)           -> { label, fileId, fileName, ... }
 *   }
 *
 *   opts（read）：{ scope: 'selection' | 'all', maxSheets, maxRows, maxCols }
 *
 * ── 用法 ──
 *   // 1) adapter 注册（各编辑器自己在脚本加载时注册一次）
 *   WindowActionBridge.registerAdapter('xlsx', { ... });
 *
 *   // 2) 窗口打开时绑定（各 adapter 在自己的 viewLoader 里调）
 *   WindowActionBridge.bindWindow(w, 'xlsx');
 *
 *   // 3) 对话侧 / AI 工具调用
 *   WindowActionBridge.listWindows();              // 有哪些窗口可操作
 *   WindowActionBridge.read(uid, { scope:'selection' });
 *   WindowActionBridge.apply(uid, { op:'format_range', ... });
 *
 * 窗口关闭无需手动解绑 —— gc() 会用 ACMSWin.getWindows() 比对自动清理。
 */
(function () {
  'use strict';

  var adapters = {};   // kind → adapter
  var bindings = {};   // uid  → { uid, win, kind, fileId, fileName, title, boundAt }
  var uidSeq = 0;

  // 每页面一个随机前缀，避免多标签页各自生成的 uid 相撞
  var PAGE_PREFIX = Math.random().toString(36).slice(2, 6);

  function genUid() {
    return 'w-' + PAGE_PREFIX + '-' + (++uidSeq).toString(36) + '-' +
           Date.now().toString(36).slice(-4);
  }

  function err(code, message, extra) {
    var o = { ok: false, error: code, message: message };
    if (extra) { for (var k in extra) { if (extra.hasOwnProperty(k)) o[k] = extra[k]; } }
    return o;
  }

  // ────────────────────────────────────────────────────────────
  // 注册 / 绑定
  // ────────────────────────────────────────────────────────────

  function registerAdapter(kind, adapter) {
    if (!kind || !adapter) return false;
    adapters[kind] = adapter;
    return true;
  }

  function getAdapter(kind) {
    return adapters[kind] || null;
  }

  /**
   * 把窗口绑定到通道。adapter 在自己的 viewLoader 里调用。
   * 重复调用同一个窗口返回同一个 uid（幂等）。
   *
   * @param {object} win   ACMSWin 的窗口对象
   * @param {string} kind  adapter kind（'xlsx' / 'word' / ...）
   * @param {object} [meta] 附加信息（fileId / fileName / offType ...）
   * @returns {string|null} uid
   */
  function bindWindow(win, kind, meta) {
    if (!win || !kind) return null;
    meta = meta || {};
    // 幂等：同一窗口重复绑定 -> 复用 uid，刷新元信息
    if (win.uid && bindings[win.uid]) {
      var b0 = bindings[win.uid];
      b0.kind = kind;
      b0.fileId = meta.fileId || b0.fileId;
      b0.fileName = meta.fileName || b0.fileName;
      b0.title = (win.st && (win.st.titleOverride || win.st.title)) || b0.title;
      b0.boundAt = Date.now();
      return win.uid;
    }
    var uid = genUid();
    win.uid = uid;
    bindings[uid] = {
      uid: uid,
      win: win,
      kind: kind,
      fileId: meta.fileId || null,
      fileName: meta.fileName || null,
      title: (win.st && (win.st.titleOverride || win.st.title)) || meta.fileName || kind,
      boundAt: Date.now(),
    };
    return uid;
  }

  function unbindWindow(uid) {
    if (uid && bindings[uid]) delete bindings[uid];
  }

  function getBinding(uid) {
    gc();
    return bindings[uid] || null;
  }

  /**
   * 回收已关闭的窗口绑定。
   * 不依赖 window-manager 的关闭钩子（那个文件是并行开发热点，少碰），
   * 而是直接问 ACMSWin 现在还活着哪些窗口。
   */
  function gc() {
    if (typeof window.ACMSWin === 'undefined' || !ACMSWin.getWindows) return;
    var alive = {};
    try {
      ACMSWin.getWindows().forEach(function (w) { if (w && w.uid) alive[w.uid] = true; });
    } catch (e) { return; }
    Object.keys(bindings).forEach(function (uid) {
      if (!alive[uid]) delete bindings[uid];
    });
  }

  // ────────────────────────────────────────────────────────────
  // 查询
  // ────────────────────────────────────────────────────────────

  /**
   * 列出当前「可被 AI 操作」的窗口（给对话选焦点 / 给 AI 看有哪些窗口）。
   * @param {object} [opts] { kind } 只列某类
   */
  function listWindows(opts) {
    gc();
    opts = opts || {};
    var out = [];
    Object.keys(bindings).forEach(function (uid) {
      var b = bindings[uid];
      if (opts.kind && b.kind !== opts.kind) return;
      var ad = adapters[b.kind];
      var canRead = !ad || !ad.canRead ? true : !!ad.canRead(b.win);
      var canApply = !ad || !ad.canApply ? true : !!ad.canApply(b.win);
      out.push({
        uid: uid,
        kind: b.kind,
        label: (ad && ad.label) || b.kind,
        title: b.title,
        fileId: b.fileId,
        fileName: b.fileName,
        canRead: canRead,
        canApply: canApply,
      });
    });
    return out;
  }

  /**
   * 按文件名 / 标题模糊找窗口（AI 拿不到 uid 时的兜底，例如"那个表格"）
   * @returns {string|null} uid
   */
  function findByHint(hint) {
    gc();
    if (!hint) return null;
    var h = String(hint).toLowerCase();
    var hit = null;
    Object.keys(bindings).forEach(function (uid) {
      if (hit) return;
      var b = bindings[uid];
      var hay = (b.fileName || '') + ' ' + (b.title || '') + ' ' + (b.kind || '');
      if (hay.toLowerCase().indexOf(h) >= 0) hit = uid;
    });
    return hit;
  }

  // ────────────────────────────────────────────────────────────
  // 读 / 写
  // ────────────────────────────────────────────────────────────

  /**
   * 读窗口内容（走 adapter，与 apply 同源）。
   * @param {string} uid
   * @param {object} [opts] { scope:'selection'|'all', maxSheets, maxRows, maxCols }
   */
  function read(uid, opts) {
    var b = getBinding(uid);
    if (!b) return err('WINDOW_NOT_BOUND', '窗口不存在或已关闭: ' + uid);
    var ad = adapters[b.kind];
    if (!ad || typeof ad.read !== 'function') {
      return err('NO_ADAPTER', '该类窗口暂不支持读取: ' + b.kind);
    }
    if (typeof ad.canRead === 'function' && !ad.canRead(b.win)) {
      return err('READ_NOT_SUPPORTED', '当前窗口状态不支持读取');
    }
    try {
      var r = ad.read(b.win, opts || {});
      if (r && r.ok && r.doc) {
        r.meta = r.meta || {};
        r.meta.uid = uid;
        r.meta.kind = b.kind;
        r.meta.fileName = b.fileName;
      }
      return r;
    } catch (e) {
      return err('READ_THREW', (e && e.message) || String(e));
    }
  }

  /**
   * 把动作应用到窗口（走 adapter，与 read 同源）。
   * @param {string} uid
   * @param {object} action  { op, ... } —— op 语义由 adapter 决定
   */
  function apply(uid, action) {
    var b = getBinding(uid);
    if (!b) return err('WINDOW_NOT_BOUND', '窗口不存在或已关闭: ' + uid);
    var ad = adapters[b.kind];
    if (!ad || typeof ad.apply !== 'function') {
      return err('NO_ADAPTER', '该类窗口暂不支持编辑: ' + b.kind);
    }
    if (typeof ad.canApply === 'function' && !ad.canApply(b.win)) {
      return err('APPLY_NOT_SUPPORTED', '当前窗口状态不支持编辑');
    }
    if (!action || !action.op) {
      return err('NO_OP', 'action 缺少 op 字段');
    }
    try {
      var r = ad.apply(b.win, action, { uid: uid });
      if (r && r.ok) {
        r.meta = r.meta || {};
        r.meta.uid = uid;
        r.meta.kind = b.kind;
      }
      return r;
    } catch (e) {
      return err('APPLY_THREW', (e && e.message) || String(e));
    }
  }

  // ────────────────────────────────────────────────────────────
  // 自检
  // ────────────────────────────────────────────────────────────

  function selfTest() {
    gc();
    var wins = listWindows();
    var report = {
      adapters: Object.keys(adapters),
      windowCount: wins.length,
      windows: wins,
    };
    // 逐窗口探一次 read（只报能力，不打印内容全文）
    report.probes = wins.map(function (x) {
      var r = read(x.uid, { scope: 'selection' });
      return {
        uid: x.uid, kind: x.kind, title: x.title,
        readOk: !!(r && r.ok),
        readError: (r && r.error) || null,
        docHint: (r && r.doc) ? (r.doc.sheets ? r.doc.sheets.length + ' sheet'
                  : r.doc.blocks ? r.doc.blocks.length + ' block'
                  : r.doc.text != null ? String(r.doc.text).length + ' chars' : 'unknown') : null,
      };
    });
    return report;
  }

  window.WindowActionBridge = {
    registerAdapter: registerAdapter,
    getAdapter: getAdapter,
    bindWindow: bindWindow,
    unbindWindow: unbindWindow,
    getBinding: getBinding,
    listWindows: listWindows,
    findByHint: findByHint,
    read: read,
    apply: apply,
    gc: gc,
    selfTest: selfTest,
  };

  console.info('[WindowActionBridge] 就绪 — 窗口操作通道（按 uid 定位，read/apply 同源）');
})();
