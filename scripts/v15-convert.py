#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""browser-console.js v1.0 → v1.5 原子化转换
改动：
 1) 布局：预览(左,静态截图) + 右侧固定面板(右,执行步骤&对话流) — 删浮动抽屉/mini-bubble/chat-toggle
 2) 底部：删 restart/keyboard/open-url/puppeteer 按钮及其功能；键盘 modal 全删
 3) 帧流：删 Page.startScreencast / fallbackStream / scheduleReconnect / showLiveFrame → 静态截图
 4) 气泡：wb-msg 升级 ACMS chat-bubble 浅色风格（tool 气泡不再深色）
 5) CDP 点击/键盘控制保留，绑定对象从 wb-live 换成 wb-last-shot
"""
import re

SRC = r'C:\Users\swede\acms\client\js\views\browser-console.js'
with open(SRC, 'r', encoding='utf-8') as f:
    text = f.read()

orig = text
L = text.split('\n')

def drop_range(anchor_start, anchor_end, inclusive=True):
    """删掉从 anchor_start 所在行到 anchor_end 所在行（按行内容包含匹配，仅第一处）。"""
    global L
    si = ei = None
    for i, ln in enumerate(L):
        if si is None and anchor_start in ln:
            si = i
        elif si is not None and anchor_end in ln:
            ei = i
            break
    if si is None or ei is None:
        raise RuntimeError(f'DROP anchor not found: {anchor_start!r} .. {anchor_end!r}')
    end = ei + 1 if inclusive else ei
    L = L[:si] + L[end:]
    return si

def drop_fn(fn_sig):
    """按函数签名删除整个函数（花括号配平）。fn_sig 为该函数所在行包含的签名。"""
    global L
    si = None
    for i, ln in enumerate(L):
        if fn_sig in ln and si is None:
            si = i
            break
    if si is None:
        raise RuntimeError(f'FN anchor not found: {fn_sig!r}')
    depth = 0
    ei = None
    for i in range(si, len(L)):
        depth += L[i].count('{') - L[i].count('}')
        if depth <= 0 and i > si:
            ei = i
            break
    if ei is None:
        raise RuntimeError(f'FN end not found: {fn_sig!r}')
    L = L[:si] + L[ei + 1:]

def replace_first(old, new):
    global text
    if old not in text:
        raise RuntimeError(f'REPLACE anchor not found: {old[:60]!r}')
    text = text.replace(old, new, 1)

def drop_lines_containing(*needles):
    """删掉包含任一 needle 的整行。"""
    global L
    out = []
    for ln in L:
        if any(n in ln for n in needles):
            continue
        out.append(ln)
    L = out

# ────────────────────────── 头部注释 ──────────────────────────
new_head = '''// ACMS Web 机器人视图 v1.5 —— 静态截图 + 右侧「执行步骤&对话」固定面板
// ============================================================
// v1.5（多多要求）：
//   - 布局：左栏会话列表 + 主区（左静态截图 / 右 340px 固定面板：执行步骤&对话流混排）
//   - 删除浮动抽屉对话流 / mini 气泡 / chat-toggle 按钮 —— 对话流并入右侧固定面板
//   - 删除 Puppeteer / 手动 URL / 重启远程浏览器 / 键盘输入 按钮及相关功能
//   - 帧流删除：不再 Page.startScreencast / fallbackStream，主画面显示最近一步静态截图
//   - 气泡 ACMS chat-bubble 浅色风格（tool 气泡浅色，适配 ACMS 浅色主题）
//   - CDP 精准控制保留：鼠标点击/悬停/滚动/键盘输入绑定到静态截图（坐标等比映射）
//   - 会话 localStorage 持久化 + 多轮对话 + SSE 步骤进度（后端 session/*）
// 主题：跟随 ACMS 三主题（var(--xxx)）'''
lines = L
end_head = None
for i, ln in enumerate(lines):
    if ln.startswith('(function () {'):
        end_head = i
        break
L = [new_head] + lines[end_head:]

# ────────────────────────── 变量 ──────────────────────────
drop_lines_containing('let _drawerOpen = false;')

# ────────────────────────── CSS 区处理 ──────────────────────────
text = '\n'.join(L)

# 1) mini-bubble CSS 块
replace_first('''    /* mini 气泡（右下浮窗） */
    .wb-mini-bubble { position:absolute; right:12px; bottom:12px; max-width:300px;
      background:rgba(20,20,20,.94); color:#fff; border-radius:10px; padding:10px 14px;
      font-size:12px; cursor:pointer; box-shadow:0 6px 18px rgba(0,0,0,.4);
      border:1px solid rgba(255,255,255,.12); z-index:4; transition:transform .2s; }
    .wb-mini-bubble:hover { transform:translateY(-2px); }
    .wb-mini-bubble.pulse { animation:wb-pulse 1.2s ease-in-out 2; }
    @keyframes wb-pulse { 0%,100% { box-shadow:0 6px 18px rgba(0,0,0,.4); }
      50% { box-shadow:0 6px 22px rgba(79,140,255,.9); } }
    .wb-mini-content { margin-bottom:6px; line-height:1.45; overflow:hidden;
      text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; }
    .wb-mini-toggle { background:transparent; border:1px solid rgba(255,255,255,.25);
      color:#fff; border-radius:4px; padding:3px 10px; font-size:11px; cursor:pointer; }

''', '')

# 2) drawer CSS 块
replace_first('''    /* 抽屉：对话流（默认收起，右侧滑入） */
    .wb-drawer { position:absolute; right:0; top:0; bottom:0; width:340px;
      background:var(--bg2,#23262e); border-left:1px solid var(--border,#333);
      transform:translateX(100%); transition:transform .25s cubic-bezier(.4,.2,.2,1);
      display:flex; flex-direction:column; z-index:5; box-shadow:-4px 0 12px rgba(0,0,0,.3); }
    .wb-drawer.open { transform:translateX(0); }
    .wb-drawer-header { padding:10px 14px; font-size:13px; font-weight:600;
      border-bottom:1px solid var(--border); display:flex; justify-content:space-between;
      align-items:center; flex-shrink:0; background:var(--bg2); }
    .wb-drawer-messages { flex:1; overflow-y:auto; padding:14px;
      display:flex; flex-direction:column; gap:10px; }
    .wb-drawer-empty { text-align:center; color:var(--text2,#777); padding:40px 12px;
      font-size:12px; line-height:1.7; }
''', '')

# 3) keyboard modal CSS 块
replace_first('''    /* v1.0 修复：键盘输入模态弹层 —— 显式色不依赖 var()（浮窗根不继承 data-theme，P118 教训） */
    .wb-keyboard-modal { position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center; }
    .wb-keyboard-backdrop { position:absolute; inset:0; background:rgba(0,0,0,0.55); }
    .wb-keyboard-panel { position:relative; background:#2a2e38; color:#e8eaed;
      border:1px solid #4a4e58; border-radius:8px; padding:16px;
      width:480px; max-width:90vw; box-shadow:0 8px 32px rgba(0,0,0,0.5); }
    .wb-keyboard-title { font-size:14px; font-weight:600; margin-bottom:10px; color:#e8eaed; }
    .wb-keyboard-input { width:100%; min-height:100px; max-height:200px; padding:10px;
      border:1px solid #4a4e58; border-radius:4px; background:#1a1d24; color:#e8eaed;
      font-size:13px; resize:vertical; outline:none; font-family:inherit; box-sizing:border-box; }
    .wb-keyboard-input:focus { border-color:#4f8cff; }
    .wb-keyboard-actions { display:flex; gap:6px; margin-top:10px; align-items:center; flex-wrap:wrap; }
    .wb-keyboard-status { flex:1; min-width:0; font-size:11px; color:#9aa0a6; margin-left:8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
''', '')

# 4) wb-msg 样式 → ACMS chat-bubble 浅色风格（替换 v0.7 老样式）
replace_first('''    .wb-msg { padding:8px 12px; border-radius:10px; font-size:12px; line-height:1.55;
      max-width:88%; word-break:break-word; }
    .wb-msg.user { background:var(--accent,#4f8cff); color:#fff; align-self:flex-end; border-bottom-right-radius:2px; }
    .wb-msg.assistant { background:var(--bg3,#2a2e38); color:var(--text); align-self:flex-start;
      border:1px solid var(--border,#444); border-bottom-left-radius:2px; }
    .wb-msg.tool { background:rgba(255,255,255,.04); border:1px dashed var(--border);
      color:var(--text2); font-family:monospace; font-size:11px; max-width:95%; align-self:flex-start; }
    .wb-msg.waiting { background:#fff3cd; color:#856404; border:1px solid #ffc107;
      align-self:stretch; max-width:100%; }
    .wb-msg-bubble-name { font-size:10px; opacity:.7; margin-bottom:4px; font-weight:600; }
    .wb-msg-meta { font-size:10px; opacity:.6; margin-top:4px; }
''', '''    /* v1.5: ACMS chat-bubble 风格（浅色主题友好）—— 与主聊天流一致 */
    .wb-msg { display:flex; gap:8px; align-items:flex-start; max-width:94%; font-size:13px; line-height:1.55; animation:wb-msg-in .18s ease; }
    .wb-msg.user { align-self:flex-end; flex-direction:row-reverse; }
    .wb-msg.assistant, .wb-msg.tool { align-self:flex-start; }
    .wb-msg .wb-msg-avatar { width:28px; height:28px; border-radius:50%; flex-shrink:0;
      display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:600; margin-top:2px; }
    .wb-msg.user .wb-msg-avatar { background:var(--accent,#0ea89d); color:#fff; }
    .wb-msg.assistant .wb-msg-avatar { background:linear-gradient(135deg,var(--accent,#0ea89d),var(--blue,#4b8fd4)); color:#fff; }
    .wb-msg.tool .wb-msg-avatar { background:var(--bg3,#e8eaed); color:var(--text); border:1px solid var(--border); font-size:10px; }
    .wb-msg .wb-msg-inner { flex:1; min-width:0; padding:8px 12px; border-radius:12px; word-break:break-word; }
    .wb-msg.user .wb-msg-inner { background:var(--accent,#0ea89d); color:#fff; border-top-right-radius:4px; }
    .wb-msg.assistant .wb-msg-inner { background:var(--bg3,#eceef1); color:var(--text); border:1px solid var(--border,#ddd); border-top-left-radius:4px; }
    .wb-msg.tool .wb-msg-inner { background:var(--bg3,#f2f3f5); color:var(--text); border:1px solid var(--border,#ddd); border-radius:10px; font-size:12px; }
    .wb-msg.waiting { align-self:stretch; max-width:100%; background:#fff3cd; color:#856404;
      border:1px solid #ffc107; border-radius:10px; padding:8px 12px; font-size:12px; }
    .wb-msg-bubble-name { font-size:10px; opacity:.65; margin-bottom:3px; font-weight:600; display:flex; align-items:center; gap:5px; }
    .wb-msg-meta { font-size:10px; opacity:.6; margin-top:4px; }
    @keyframes wb-msg-in { from { opacity:0; transform:translateY(4px);} to { opacity:1; transform:none;} }
''')

# 5) 主区双栏：preview 左 + steps 右。wb-main 已是 flex row；补 steps 竖栏样式
replace_first('''    /* 主区 */
    .wb-preview { flex:1; background:var(--bg2,#23262e); display:flex; align-items:center;
      justify-content:center; position:relative; overflow:hidden; }
    .wb-preview img { max-width:100%; max-height:100%; object-fit:contain; display:block; }
    .wb-preview-ph { color:var(--text2,#777); font-size:13px; padding:20px; text-align:center; line-height:1.6; }
''', '''    /* 主区 — 左静态截图 + 右「执行步骤&对话」固定面板（v1.5） */
    .wb-preview { flex:1; background:var(--bg2,#23262e); display:flex; align-items:center;
      justify-content:center; position:relative; overflow:hidden; min-width:0; }
    .wb-preview img { max-width:100%; max-height:100%; object-fit:contain; display:block; cursor:zoom-in; }
    .wb-preview-ph { color:var(--text2,#777); font-size:13px; padding:20px; text-align:center; line-height:1.6; }
    .wb-steps { flex:0 0 340px; min-width:280px; max-width:440px; border-left:1px solid var(--border,#333);
      background:var(--bg,#1a1d23); display:flex; flex-direction:column; overflow:hidden; }
    .wb-steps-header { padding:8px 12px; font-size:12px; color:var(--text2,#999); font-weight:600;
      border-bottom:1px solid var(--border); flex-shrink:0; display:flex; justify-content:space-between; align-items:center; }
    .wb-steps-body { flex:1; overflow-y:auto; padding:10px; display:flex; flex-direction:column; gap:8px; }
    .wb-steps-empty { color:#888; font-size:11px; padding:16px 6px; text-align:center; line-height:1.6; }
''')

# ────────────────────────── HTML（render 模板）──────────────────────────
# chat-toggle 按钮删除（含 title 上行残段）
replace_first('''        <button class="wb-btn wb-chat-toggle" id="wb-chat-toggle" title="展开/收起对话流">
          💬 <span class="wb-badge" id="wb-msg-badge" style="display:none">0</span>
          <span id="wb-chat-arrow">▶</span>
        </button>
''', '')

# preview：wb-live → wb-last-shot 静态截图
replace_first('''          <div class="wb-preview" id="wb-preview">
            <img id="wb-live" src="" alt="" style="display:none">
            <div class="wb-preview-ph" id="wb-live-ph">🟢 实时画面（WebSocket 帧流）<br>连接中…</div>
          </div>
          <!-- 完整执行链路可视化：步骤时间线（每轮工具 + 描述 + 缩略图） -->
          <div class="wb-steps" id="wb-steps" style="flex:0 0 140px;border-top:1px solid var(--border,#333);background:var(--bg2,#23262e);overflow-y:auto;padding:8px 10px;display:flex;flex-direction:column;gap:6px;">
            <div class="wb-steps-header" style="font-size:10px;color:var(--text2,#777);font-weight:600;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;"><span>📋 执行步骤时间线</span><span id="wb-steps-progress" style="font-size:10px;color:#4f8cff;">等待开始</span></div>
            <div id="wb-steps-list" style="flex:1;overflow-y:auto;font-size:11px;line-height:1.4;color:#c8ccd4;"></div>
          </div>
          <div class="wb-mini-bubble" id="wb-mini-bubble" style="display:none">
            <div class="wb-mini-content" id="wb-mini-content"></div>
            <button class="wb-btn-mini" id="wb-mini-toggle">展开对话 ▶</button>
          </div>
          <aside class="wb-drawer" id="wb-drawer">
            <div class="wb-drawer-header">
              💬 对话流
              <button class="wb-btn-mini" id="wb-drawer-close" title="收起">◀ 收起</button>
            </div>
            <div class="wb-drawer-messages" id="wb-drawer-messages"></div>
          </aside>
''', '''          <div class="wb-preview" id="wb-preview">
            <img id="wb-last-shot" src="" alt="最后截图" style="display:none" onclick="openImagePreview(this.src);event.stopPropagation();">
            <div class="wb-preview-ph" id="wb-preview-ph">🖥️ Web 机器人<br>执行中自动更新步骤截图<br><span style="font-size:11px;opacity:.7">点击截图可放大 · 点击/滚轮可直接操控浏览器</span></div>
          </div>
          <!-- v1.5: 右侧固定面板 —— 对话流 + 执行步骤（替代抽屉浮窗） -->
          <div class="wb-steps" id="wb-steps">
            <div class="wb-steps-header"><span>📋 执行步骤 &amp; 对话</span><span id="wb-steps-progress" style="font-size:10px;color:#4f8cff;">等待开始</span></div>
            <div class="wb-steps-body" id="wb-steps-list"><div class="wb-steps-empty">等待智能体开始执行…<br>对话与每轮操作（工具调用、截图、描述）会在此显示</div></div>
          </div>
''')

# bottombar 按钮删除
replace_first('''            <button class="wb-btn-mini" id="wb-clear-conv" title="清空当前对话">🗑</button>
            <button class="wb-btn-mini" id="wb-restart" title="重启远程浏览器（daemon 卡死时一键恢复，画面会刷新）">🔄</button>
            <button class="wb-btn-mini" id="wb-keyboard" title="键盘输入到浏览器（绕开 AI 对话）">⌨️</button>
            <button class="wb-btn-mini" id="wb-open-url" title="手动打开 URL">🔗</button>
            <button class="wb-btn-mini" id="wb-puppeteer" title="用 Puppeteer 路径打开当前 URL（稳定，鼠标键盘可靠）">⤴ Puppeteer</button>
''', '''            <button class="wb-btn-mini" id="wb-clear-conv" title="清空当前对话">🗑</button>
''')

# keyboard modal HTML 删除
replace_first('''          <!-- v1.0 修复：键盘输入模态弹层（v0.5 删了 v1.0 补回，CDP 精准 / 降级双路径） -->
          <div class="wb-keyboard-modal" id="wb-keyboard-modal" style="display:none">
            <div class="wb-keyboard-backdrop" id="wb-keyboard-backdrop"></div>
            <div class="wb-keyboard-panel">
              <div class="wb-keyboard-title">⌨️ 键盘输入到浏览器（绕开 AI 对话，直接给浏览器按键）</div>
              <textarea class="wb-keyboard-input" id="wb-keyboard-input" placeholder="在此输入文本：CDP 精准模式直接 Unicode 插入（中文/emoji OK）；降级模式走 keyboard type（中文可能丢失）"></textarea>
              <div class="wb-keyboard-actions">
                <button class="wb-btn-mini" id="wb-kb-type" title="把文本输入到当前焦点（保留焦点位置）">输入</button>
                <button class="wb-btn-mini" id="wb-kb-enter" title="回车键（提交表单/换行）">↵ 回车</button>
                <button class="wb-btn-mini" id="wb-kb-backspace" title="退格一次">⌫ 退格</button>
                <button class="wb-btn-mini" id="wb-kb-tab" title="Tab 切换焦点">⇥ Tab</button>
                <button class="wb-btn-mini" id="wb-kb-escape" title="Esc 关闭弹窗/取消">⎋ Esc</button>
                <span class="wb-keyboard-status" id="wb-kb-status"></span>
                <button class="wb-btn-mini" id="wb-kb-close">关闭</button>
              </div>
            </div>
          </div>
''', '')

# render() 尾部调用：bindLivePreview → bindPreviewControls；refreshViewport 保留
replace_first('''    bindEvents(root);
    connectCDP(root);
    refreshViewport(root);
    bindLivePreview(root);
    initSessionStore(root);''', '''    bindEvents(root);
    connectCDP(root);
    refreshViewport(root);
    bindPreviewControls(root);
    initSessionStore(root);''')

L = text.split('\n')

# ────────────────────────── 函数替换 ──────────────────────────
# renderDrawerMessages → renderPanel（合并对话+步骤）
def replace_fn(sig, new_body_lines):
    global L
    si = None
    for i, ln in enumerate(L):
        if sig in ln:
            si = i
            break
    if si is None:
        raise RuntimeError(f'FN not found: {sig!r}')
    depth = 0
    ei = None
    for i in range(si, len(L)):
        depth += L[i].count('{') - L[i].count('}')
        if depth <= 0 and i > si:
            ei = i
            break
    L = L[:si] + new_body_lines + L[ei + 1:]

# appendMessage 里的 drawer 滚动改为 panel 滚动由 renderPanel 处理
drop_fn('function renderDrawerMessages(root)')

# 把旧的 renderStepsTimeline 删除（换成 renderPanel），同时保留 progress 更新与主截图更新
drop_fn('function renderStepsTimeline(root, sessionId)')

new_panel = '''  // v1.5: 右侧固定面板渲染 —— 对话消息(user/assistant/waiting 气泡) + 执行步骤(tool 卡片) 混排
  function renderPanel(root, sessionId) {
    const list = el('wb-steps-list', root);
    const progress = el('wb-steps-progress', root);
    if (!list) return;
    if (_currentMessages.length === 0) {
      list.innerHTML = '<div class="wb-steps-empty">还没有对话<br><br>底部输入框发个目标试试：<br>"去 DeepSeek 查深圳95油价"</div>';
      if (progress) progress.textContent = '等待开始';
      return;
    }
    const steps = _currentMessages.filter(m => m.role === 'tool');
    const lastStep = steps[steps.length - 1];
    if (steps.length === 0) {
      // 只有对话、还没有步骤 → 直接渲染消息气泡
      list.innerHTML = _currentMessages.map(renderMessageHtml).join('');
      if (progress) progress.textContent = '等待开始';
      list.scrollTop = list.scrollHeight;
      return;
    }
    // 有执行步骤 → 更新进度条
    const roundInfo = lastStep.round ? `第 ${lastStep.round} 轮` : '';
    const maxInfo = lastStep.maxRounds ? ` / 最多 ${lastStep.maxRounds}` : '';
    if (progress) progress.textContent = roundInfo + maxInfo || `已执行 ${steps.length} 步`;

    // 混排：按 _currentMessages 顺序输出（user/assistant/waiting → 气泡；tool → 步骤卡）
    let html = '';
    for (const m of _currentMessages) {
      if (m.role === 'tool') {
        const toolText = esc(m.tool || 'step');
        const desc = esc((m.fullMessage || m.content || '').slice(0, 300)) + ((m.fullMessage || m.content || '').length > 300 ? '…' : '');
        const roundTag = m.round ? `<span style="font-size:9px;background:#4f8cff;color:#fff;padding:1px 5px;border-radius:4px;margin-left:4px;">R${m.round}</span>` : '';
        const shotHtml = m.screenshot ? `<img src="${shotUrl(m.screenshot)}" onclick="openImagePreview('${shotUrl(m.screenshot)}');event.stopPropagation();" style="max-width:130px;max-height:80px;border-radius:4px;margin-top:4px;border:1px solid var(--border,#ccc);object-fit:contain;cursor:zoom-in;display:block;" alt="步骤截图 - 点击放大" onerror="this.style.display='none'">` : '';
        html += `<div class="wb-msg tool"><div class="wb-msg-avatar">🔧</div><div class="wb-msg-inner">` +
          `<div class="wb-msg-bubble-name">🔧 ${toolText}${roundTag}<span style="margin-left:auto;opacity:.6">${m.ts ? new Date(m.ts).toLocaleTimeString('zh-CN', { hour12: false }) : ''}</span></div>` +
          `<div style="font-size:12px;line-height:1.45;color:var(--text);">${desc}</div>${shotHtml}</div></div>`;
      } else {
        html += renderMessageHtml(m);
      }
    }
    list.innerHTML = html;
    list.scrollTop = list.scrollHeight;

    // v1.5: 最新带截图的步骤 → 更新主画面静态截图
    const lastWithShot = steps.slice().reverse().find(s => s.screenshot || s.screenshotPath);
    const shot = lastWithShot && (lastWithShot.screenshot || lastWithShot.screenshotPath);
    if (shot) showLastScreenshot(root, shotUrl(shot));
  }'''
insert_at = None
for i, ln in enumerate(L):
    if '// 完整执行链路可视化' in ln and insert_at is None:
        insert_at = i
        break
L = L[:insert_at] + new_panel.split('\n') + L[insert_at + 1:]

# ────────────────────────── 调用名替换 ──────────────────────────
def replace_all_in_lines(old, new):
    global L
    L = [ln.replace(old, new) for ln in L]

replace_all_in_lines('renderDrawerMessages(root)', 'renderPanel(root)')
replace_all_in_lines('renderStepsTimeline(root, sessionId)', 'renderPanel(root, sessionId)')
replace_all_in_lines('renderStepsTimeline(root, _currentSessionId)', 'renderPanel(root, _currentSessionId)')
# 删除 updateMiniBubble 调用行（带分号，避免误删函数定义行）
L = [ln for ln in L if 'updateMiniBubble(root);' not in ln]

text = '\n'.join(L)

# appendMessage 内 drawer scroll 引用（精确锚点，wb-drawer-messages 已不存在，box 未定义会 ReferenceError）
replace_first('''    updateBadge(root);
    const box = el('wb-drawer-messages', root);
    if (box) box.scrollTop = box.scrollHeight;
    const sess = _sessions.find(s => s.id === _currentSessionId);''',
              '''    updateBadge(root);
    const sess = _sessions.find(s => s.id === _currentSessionId);''')

# help 事件委托 drawer → panelEl（waiting_user 回复框挂在 wb-steps-list 上）
replace_first('''    const drawer = el('wb-drawer-messages', root);
    if (drawer) {
      drawer.addEventListener('click', (e) => {''',
              '''    const panelEl = el('wb-steps-list', root);
    if (panelEl) {
      panelEl.addEventListener('click', (e) => {''')
replace_first('''      drawer.addEventListener('keydown', (e) => {''',
              '''      panelEl.addEventListener('keydown', (e) => {''')

L = text.split('\n')

# ────────────────────────── 函数删除 ──────────────────────────
drop_fn('function updateMiniBubble(root)')
drop_fn('function toggleDrawer(root, force)')
drop_fn('function openKeyboardModal(root)')
drop_fn('function closeKeyboardModal(root)')
drop_fn('async function keyboardDoType(root)')
drop_fn('async function keyboardDoKey(root, keyName)')
drop_fn('function setKbStatus(root, msg)')
drop_fn('function showLiveFrame(root, b64)')
drop_fn('function bindLivePreview(root)')
drop_fn('async function fallbackStream(root)')
drop_fn('function scheduleReconnect(root)')

# ────────────────────────── CDP / 健康区变量 ──────────────────────────
drop_lines_containing('let _ws = null;', 'let _streamRetry = 0;', 'let _noFrameT = 0;',
                      'let _streamFallbackActive = false;', 'let _lastFrameTs = 0;',
                      'const FRAME_STALE_MS')

# ────────────────────────── 事件绑定清理 ──────────────────────────
def drop_between(start_needle, end_needle, keep_end_line=True):
    """删除 start 行(含)之后直到 end 行(不含，或含) —— 用于删多行事件块。只处理第一处。"""
    global L
    si = ei = None
    for i, ln in enumerate(L):
        if si is None and start_needle in ln:
            si = i
        elif si is not None and end_needle in ln:
            ei = i
            break
    if si is None or ei is None:
        raise RuntimeError(f'DROP-BETWEEN not found: {start_needle!r} -> {end_needle!r}')
    end = ei + 1 if keep_end_line else ei
    L = L[:si] + L[end:]

text = '\n'.join(L)

# chat-toggle 事件块
replace_first('''    el('wb-chat-toggle', root).addEventListener('click', () => toggleDrawer(root));
    el('wb-mini-toggle', root).addEventListener('click', (e) => { e.stopPropagation(); toggleDrawer(root, true); });
    el('wb-drawer-close', root).addEventListener('click', () => toggleDrawer(root, false));
    el('wb-mini-bubble', root).addEventListener('click', (e) => {
      if (e.target.id === 'wb-mini-toggle') return;
      toggleDrawer(root, true);
    });

''', '')

# open-url / restart / puppeteer / keyboard 事件块 → 全删（从 open-url 到 wb-settings 之前）
m = re.search(r"\n    el\('wb-open-url', root\)\.addEventListener\('click', async \(\) => \{.*?\n    el\('wb-settings', root\)\.addEventListener\('click', \(\) => \{", text, re.DOTALL)
if m:
    text = text[:m.start()] + "\n    el('wb-settings', root).addEventListener('click', () => {" + text[m.end():]
else:
    raise RuntimeError('open-url..settings 事件块未找到')

# help 事件委托替换已在上方（drop_fn 之前）完成

# 键盘输入函数删除后 keyboardTypeText 仍被引用? keyboardDoType 删了, keyboardTypeText 只被 keyboardDoType 用? 查一下
# （保守：keyboardTypeText 保留定义无副作用；KEY_MAP 保留）

# ────────────────────────── 帧流清理（CDP connect）──────────────────────────
# connectCDP 开头 fallback 判断
replace_first('''    if (_streamFallbackActive) { fallbackStream(root); return; }
''', '')
# onmessage screencastFrame 分支删除
m = re.search(r"\n        if \(msg\.method === 'Page\.screencastFrame'\) \{.*?\n        \}\n", text, re.DOTALL)
if m:
    text = text[:m.start()] + "\n" + text[m.end():]
else:
    raise RuntimeError('screencastFrame 分支未找到')
# startScreencast 调用删除
replace_first('''          await cdpSend('Page.startScreencast', { format: 'jpeg', quality: 60, everyNthFrame: 1 });
''', '')
# onclose 里 _streamFallbackActive return
replace_first('''        if (_streamFallbackActive) return;
''', '')
# connectCDP onopen 状态文案（去掉帧流相关描述，v1.5 画面=静态截图可点击操控）
replace_first('''          setStatus(root, '🟢 CDP 双向控制已连接 —— 画面可直接点击/悬停/滚动/输入（与智能体同一浏览器）');''',
              '''          setStatus(root, '🟢 CDP 双向控制已连接 —— 静态截图可直接点击/悬停/滚动/输入（与智能体同一浏览器）');''')

# scheduleCdpRetry 降级分支：不再 fallbackStream
replace_first('''    if (_cdpRetry >= CDP_MAX_RETRY) {
      setStatus(root, `🟡 CDP 精准控制失败（${reason}，已重试 ${CDP_MAX_RETRY} 次）—— 已降级为「只看」流模式：画面可看，点击/输入可能不精准`);
      _streamFallbackActive = true;
      fallbackStream(root);
      return;
    }
    _cdpRetry++;
    const delay = 800 * _cdpRetry;
    setTimeout(() => {
      if (_cdp.ws || _cdp.attempting || _streamFallbackActive) return;
      connectCDP(root);
    }, delay);''', '''    if (_cdpRetry >= CDP_MAX_RETRY) {
      setStatus(root, `🟡 CDP 精准控制失败（${reason}，已重试 ${CDP_MAX_RETRY} 次）—— 仅展示智能体步骤截图，无法直接操控浏览器`);
      return;
    }
    _cdpRetry++;
    const delay = 800 * _cdpRetry;
    setTimeout(() => {
      if (_cdp.ws || _cdp.attempting) return;
      connectCDP(root);
    }, delay);''')

# mapImgCoord 绑定目标 wb-live → wb-last-shot
replace_first("const live = el('wb-live');", "const live = el('wb-last-shot');")

# ────────────────────────── 静态截图函数 ──────────────────────────
# 在 refreshViewport 之前插入 showLastScreenshot
m = re.search(r"\n  async function refreshViewport\(root\) \{", text)
if not m:
    raise RuntimeError('refreshViewport 锚点未找到')
shot_fn = '''
  // v1.5: 显示最近一步静态截图（替代 v1.0 实时帧流）
  function showLastScreenshot(root, urlOrDataUrl) {
    const img = el('wb-last-shot', root);
    const ph = el('wb-preview-ph', root);
    if (!img || !urlOrDataUrl) return;
    if (img.src === urlOrDataUrl) return;
    img.src = urlOrDataUrl;
    img.style.display = 'block';
    if (ph) ph.style.display = 'none';
  }
'''
text = text[:m.start()] + shot_fn + text[m.start():]

# bindPreviewControls：静态截图上的 CDP 操控绑定
m = re.search(r"\n  function cdpSend\(method, params\) \{", text)
if not m:
    raise RuntimeError('cdpSend 锚点未找到')
controls_fn = '''
  // v1.5: 静态截图上的 CDP 操控（点击/滚轮/悬停 —— 坐标按 viewport 等比映射）
  function bindPreviewControls(root) {
    const img = el('wb-last-shot', root);
    if (!img) return;
    img.addEventListener('click', (e) => {
      const c = mapImgCoord(e);
      if (!c) return;
      if (clickAt(c.x, c.y)) setStatus(root, `👆 已点击 (${c.x}, ${c.y})`);
      else api('POST', '/mouse', { x: c.x, y: c.y, action: 'click' }).then((r) => {
        if (r.ok) setStatus(root, `👆 已点击 (${c.x}, ${c.y})`);
      }).catch(() => {});
    });
    img.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dy = e.deltaY > 0 ? 300 : -300;
      if (!wheelAt(dy)) api('POST', '/mouse', { action: 'wheel', dy }).catch(() => {});
    }, { passive: false });
    let _mvT = 0;
    img.addEventListener('mousemove', (e) => {
      const now = Date.now();
      if (now - _mvT < 100) return;
      _mvT = now;
      const c = mapImgCoord(e);
      if (!c) return;
      cdpMoveThrottled(c.x, c.y);
    });
  }
'''
text = text[:m.start()] + controls_fn + text[m.start():]

# ────────────────────────── healthCheck 简化（去帧维度）──────────────────────────
m = re.search(r"  async function healthCheck\(root\) \{.*?\n  \}\n", text, re.DOTALL)
if not m:
    raise RuntimeError('healthCheck 未找到')
new_health = '''  async function healthCheck(root) {
    const box = el('wb-health', root);
    const txt = el('wb-health-text', root);
    if (!box) return;
    const now = Date.now();
    // 维度 1: ws 状态
    const wsOpen = !!(_cdp.ws && _cdp.ws.readyState === 1);
    // 维度 2: page session
    const hasSession = !!_cdp.sessionId;
    // 维度 3: 主动 ping（Runtime.evaluate 1+1）—— 测 Chrome 真响应
    let pingOk = (_lastPingOk > 0 && (now - _lastPingOk) < PING_OK_VALID_MS);
    if (wsOpen && hasSession && (_lastPingSent === 0 || now - _lastPingSent > HEALTH_INTERVAL_MS)) {
      _lastPingSent = now;
      const t0 = Date.now();
      try {
        const pingPromise = cdpSend('Runtime.evaluate', { expression: '1+1', returnByValue: true });
        const pingTimeout = new Promise((r) => setTimeout(() => r({ result: { exceptionDetails: { text: 'timeout' } } }), 2000));
        const r = await Promise.race([pingPromise, pingTimeout]);
        pingOk = !!(r && r.result && r.result.result && r.result.result.value === 2);
        if (pingOk) { _lastPingOk = now; _lastPingLatency = Date.now() - t0; }
      } catch (e) { pingOk = false; }
    }
    // 综合判定（4 档，v1.5 无帧维度）
    let level = 'gray', text = '检测中', title = '';
    if (!wsOpen) {
      level = 'red'; text = 'CDP 断';
      title = 'WebSocket 未连接';
    } else if (!hasSession) {
      level = 'yellow'; text = '初始化';
      title = 'CDP 已连但 page session 还没建立';
    } else if (!pingOk) {
      level = 'red'; text = 'Chrome 无响应';
      title = 'Runtime.evaluate ping 失败 — daemon 可能卡死';
    } else {
      level = 'green'; text = '健康';
      title = `ws=open session=ok ping=${_lastPingLatency}ms`;
    }
    box.className = 'wb-health ' + level;
    if (txt) txt.textContent = text;
    box.title = title;
    return { level, text, title, wsOpen, hasSession, pingOk };
  }
'''
text = text[:m.start()] + '\n' + new_health + text[m.end():]

# bindEvents health 点击显示：去掉 帧= 字段
replace_first('''          `ws=${r.wsOpen ? '✅' : '❌'} session=${r.hasSession ? '✅' : '❌'} ping=${r.pingOk ? '✅' : '❌'} 帧=${r.frameAge >= 0 ? r.frameAge + 's' : '无'}`,''',
              '''          `ws=${r.wsOpen ? '✅' : '❌'} session=${r.hasSession ? '✅' : '❌'} ping=${r.pingOk ? '✅' : '❌'}`,''')

# waiting_user 提示文案：对话流面板 → 右侧面板
replace_first("setStatus(root, '⏸ 智能体需要你的帮助，请在对话流面板回复');",
              "setStatus(root, '⏸ 智能体需要你的帮助，请在右侧面板回复');")

# settings 面板内旧文案（流式画面/浮窗 pulse）轻改 → 已删功能不再误导
text = text.replace('失败后自动降级为流式画面（只看模式），点击状态灯查看详情', 'CDP 失败后仅展示步骤截图，无法直接操控')
text = text.replace('<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;"><input type="checkbox" id="wb-set-pulse" checked> 新消息 pulse 动画</label>', '')

# ────────────────────────── 收尾清理 ──────────────────────────
# 遗留的空行压缩 & 悬空分号清理
text = re.sub(r'\n{3,}', '\n\n', text)

with open(SRC, 'w', encoding='utf-8') as f:
    f.write(text)
print(f'OK: {len(orig.splitlines())} lines -> {len(text.splitlines())} lines')
