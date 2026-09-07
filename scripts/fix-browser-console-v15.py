#!/usr/bin/env python3
"""v1.5: browser-console.js — 删除抽屉浮窗/mini-bubble/keyboard按钮，对话集成到步骤面板"""
import re

path = r'C:\Users\swede\acms\client\js\views\browser-console.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

original = content

lines = content.split('\n')

def find_block_end(start, lines):
    depth = 0
    for i in range(start, len(lines)):
        depth += lines[i].count('{') - lines[i].count('}')
        if depth <= 0 and i > start:
            return i
    return len(lines) - 1

# ============================================================
# 1. JS 部分：删除函数、变量、事件监听
# ============================================================
result = []
i = 0
while i < len(lines):
    l = lines[i]

    # 删除 _drawerOpen 变量
    if 'let _drawerOpen = false;' in l:
        i += 1
        continue

    # 删除 chat-toggle 按钮 HTML
    if 'id="wb-chat-toggle"' in l:
        i += 1
        continue
    if '展开/收起对话流' in l:
        i += 1
        continue

    # 跳过整个 updateMiniBubble 函数
    if 'function updateMiniBubble(root)' in l:
        end = find_block_end(i, lines)
        i = end + 1
        continue

    # 跳过整个 toggleDrawer 函数
    if 'function toggleDrawer(root, force)' in l:
        end = find_block_end(i, lines)
        i = end + 1
        continue

    # 替换 renderDrawerMessages → renderChatInStepsPanel
    if 'function renderDrawerMessages(root)' in l:
        result.append('  // v1.5: 对话消息渲染到右侧步骤面板（替代旧抽屉浮窗）')
        result.append('  function renderChatInStepsPanel(root) {')
        result.append("    const list = el('wb-steps-list', root);")
        result.append('    if (!list) return;')
        result.append('    if (_currentMessages.length === 0) {')
        result.append("      list.innerHTML = '<div class=\"wb-steps-empty\">还没有对话<br><br>底部输入框发个目标试试</div>';")
        result.append('      return;')
        result.append('    }')
        result.append("    const steps = _currentMessages.filter(m => m.role === 'tool').map((m, idx) => ({ ...m, idx: idx + 1 }));")
        result.append("    const chatMsgs = _currentMessages.filter(m => m.role === 'user' || m.role === 'assistant');")
        result.append('    if (steps.length === 0 && chatMsgs.length === 0) {')
        result.append("      list.innerHTML = '<div class=\"wb-steps-empty\">等待智能体开始执行…</div>';")
        result.append('      return;')
        result.append('    }')
        result.append("    let html = '';")
        result.append("    for (const m of chatMsgs) { html += renderMessageHtml(m); }")
        result.append('    for (const s of steps) {')
        result.append("      const toolText = esc(s.tool || 'step');")
        result.append("      const desc = esc((s.fullMessage || s.content || '').slice(0, 200)) + ((s.fullMessage || s.content || '').length > 200 ? '…' : '');")
        result.append("      const roundTag = s.round ? `<span style=\"font-size:9px;background:#4f8cff;color:#fff;padding:1px 4px;border-radius:4px;\">R${s.round}</span>` : '';")
        result.append("      const shotHtml = s.screenshot ? `<img src=\"${shotUrl(s.screenshot)}\" onclick=\"openImagePreview('${shotUrl(s.screenshot)}');event.stopPropagation();\" style=\"max-width:100px;max-height:60px;border-radius:4px;margin-top:4px;border:1px solid #444;object-fit:contain;cursor:zoom-in;\" alt=\"截图\" onerror=\"this.style.display='none'\">` : '';")
        result.append("      html += `<div style=\"padding:6px 8px;background:#1a1d24;border:1px solid #333;border-radius:6px;margin-bottom:4px;\">` +")
        result.append("        `<div style=\"font-weight:600;color:#4f8cff;font-size:11px;margin-bottom:2px;\">${roundTag} 🔧 ${toolText}</div>` +")
        result.append("        `<div style=\"color:#c8ccd4;font-size:11px;margin-bottom:2px;line-height:1.35;\">${desc}</div>` +")
        result.append("        `${shotHtml}</div>`;")
        result.append('    }')
        result.append('    list.innerHTML = html;')
        result.append('    list.scrollTop = list.scrollHeight;')
        result.append('  }')
        # 跳过原函数体
        end = find_block_end(i, lines)
        i = end + 1
        continue

    # 替换调用名
    if 'renderDrawerMessages(root)' in l:
        l = l.replace('renderDrawerMessages(root)', 'renderChatInStepsPanel(root)')
    if 'updateMiniBubble(root)' in l:
        l = l.replace('updateMiniBubble(root)', '')
    if 'refreshViewport(root)' in l:
        l = l.replace('refreshViewport(root)', '')

    # 删除事件监听行（跳过整块）
    skip_lines = [
        "el('wb-chat-toggle'", "el('wb-mini-toggle'", "el('wb-drawer-close'",
        "el('wb-mini-bubble'", "el('wb-open-url'", "el('wb-restart'",
        "el('wb-puppeteer'", "el('wb-keyboard'", "el('wb-kb-",
    ]
    if any(p in l for p in skip_lines):
        i += 1
        continue
    if 'toggleDrawer(root' in l or "if (e.target.id === 'wb-mini-toggle') return;" in l:
        i += 1
        continue

    # 跳过键盘函数块
    if any(k in l for k in [
        'function openKeyboardModal', 'function closeKeyboardModal',
        'async function keyboardDoType', 'async function keyboardDoKey',
        'function setKbStatus'
    ]):
        end = find_block_end(i, lines)
        i = end + 1
        continue

    result.append(l)
    i += 1

content = '\n'.join(result)

# ============================================================
# 2. CSS: 修 tool 气泡浅色主题
# ============================================================
content = content.replace(
    '.wb-msg.tool { background:rgba(255,255,255,.04); border:1px dashed var(--border);\n      color:var(--text2); font-family:monospace; font-size:11px; max-width:95%; align-self:flex-start; }',
    '.wb-msg.tool { background:var(--bg3,#eeeef1); border:1px solid var(--border);\n      color:var(--text); font-size:12px; max-width:95%; align-self:flex-start; }'
)

# 删除 mini-bubble / drawer / keyboard CSS 块
content = re.sub(
    r'\n    /\* mini 气泡[^\n]*\n.*?\.wb-mini-toggle \{.*?\n\s*\n',
    '\n    /* v1.5: mini-bubble 已删除 */\n',
    content, flags=re.DOTALL
)
content = re.sub(
    r'\n    /\* 抽屉：对话流.*?\n.*?\.wb-drawer-empty \{.*?\n\s*\n',
    '',
    content, flags=re.DOTALL
)
content = re.sub(
    r'\n    /\* v1\.0 修复：键盘输入模态弹层.*?\n.*?\.wb-keyboard-status \{.*?\n\s*\n',
    '',
    content, flags=re.DOTALL
)

# ============================================================
# 3. HTML: 删除多余元素
# ============================================================
content = re.sub(
    r'          <div class="wb-mini-bubble"[^>]*>.*?</div>\s*\n\s*<aside class="wb-drawer"[^>]*>.*?</aside>\s*\n',
    '',
    content, flags=re.DOTALL
)

buttons = ['id="wb-restart"', 'id="wb-keyboard"', 'id="wb-open-url"', 'id="wb-puppeteer"']
for b in buttons:
    content = content.replace(
        '            <button class="wb-btn-mini" ' + b + ' title="[^"]*">[^<]*</button>\n',
        ''
    )

content = re.sub(
    r'          <!-- v1\.0 修复：键盘输入模态弹层.*? -->\s*\n'
    r'          <div class="wb-keyboard-modal".*?</div>\s*\n',
    '',
    content, flags=re.DOTALL
)

# 步骤面板标题
content = content.replace('📋 执行步骤</span>', '📋 执行步骤 &amp; 对话</span>')

# ============================================================
# 4. 写回
# ============================================================
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f'Done: {len(original)} -> {len(content)} chars')
