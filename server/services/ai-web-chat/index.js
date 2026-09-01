// ACMS ai-web-chat 服务（v0.1）
// ============================================================
// 定位：语义化「操作 AI 网站拿回答」封装，供 GEO 引擎 adapter /
//       DeepSeek 网页版问答 / 未来其他 AI 站点适配器使用。
// 底层：browser-agent 服务（agent-browser CLI）
//
// 目前适配器：deepseek（chat.deepseek.com，支持「联网搜索」开关）
//
// 对外接口（保持极简，GEO adapter 契约对齐）：
//   deepSeekAsk(prompt, { webSearch, taskId })
//     → { ok, answer, elapsedMs, screenshot?, step?, error? }
//
// 关键流程：登录检查 → 联网开关 → 输入 → 发送 → 等回答完成 → 提取

const path = require('path');
const ba = require('../browser-agent');

// DeepSeek 页面元素（2026-08-31 实测校准：新版「联网搜索」改名为「智能搜索」）
const DS = {
  home: 'https://chat.deepseek.com/',
  signIn: 'https://chat.deepseek.com/sign_in',
  // 输入框 placeholder 关键词（find placeholder 用）
  inputPlaceholderKeywords: ['给 DeepSeek 发送消息', 'Ask DeepSeek', '输入'],
  // 联网搜索开关文本（2026-08-31 实测：新版叫「智能搜索」，旧版「联网搜索」兼容）
  webSearchToggle: ['智能搜索', '联网搜索'],
  // 回答完成判定：生成中会出现「停止生成」按钮文本
  stopButtonText: '停止生成',
};

// 等待回答完成：轮询直到生成中标志消失且内容稳定
// 返回 { ok, elapsedMs }
// 🔴 eval 表达式禁止中文字面量（Windows 传参 GBK 崩，2026-08-31 实测）；
//    提取文本用 encodeURIComponent 规避返回值中文
async function waitAnswerComplete(timeoutMs = 120000) {
  const start = Date.now();
  let lastText = '';
  let stableCount = 0;

  while (Date.now() - start < timeoutMs) {
    // 1. 检测是否还在生成（「停止生成」按钮出现 = 生成中；snapshot 中文正常）
    const snapR = await ba.snapshot(10000);
    const snap = snapR.ok ? snapR.output : '';
    const generating = snap.includes(DS.stopButtonText);

    // 2. 提取当前最后一条回答（encodeURIComponent 防返回值中文崩）
    const textR = await ba.evalJs('(() => { const els = document.querySelectorAll(".ds-markdown"); return els.length ? encodeURIComponent(els[els.length-1].innerText) : ""; })()', 10000);
    let currentText = '';
    if (textR.ok) {
      try { currentText = decodeURIComponent(String(textR.output || '').trim()); } catch (e) { currentText = ''; }
    }

    if (!generating) {
      // 未在生成：内容稳定（连续 2 次相同）且非空 → 完成
      if (currentText && currentText === lastText) {
        stableCount++;
        if (stableCount >= 2) {
          return { ok: true, elapsedMs: Date.now() - start, answer: currentText };
        }
      } else {
        stableCount = 0;
      }
      lastText = currentText;
    } else {
      stableCount = 0;
      lastText = currentText;
    }

    await ba.wait(2500);
  }
  // 超时：拿当前文本兜底
  const textR = await ba.evalJs('(() => { const els = document.querySelectorAll(".ds-markdown"); return els.length ? encodeURIComponent(els[els.length-1].innerText) : ""; })()', 10000);
  let finalText = '';
  if (textR.ok) {
    try { finalText = decodeURIComponent(String(textR.output || '').trim()); } catch (e) {}
  }
  return { ok: finalText.length > 0, elapsedMs: Date.now() - start, answer: finalText, timeout: true };
}

// 打开「智能搜索」开关（新版 DeepSeek 联网搜索改名；支持多个候选文本）
// 🔴 eval 表达式禁止中文字面量 —— 「智能搜索」=\u667a\u80fd\u641c\u7d22
async function enableWebSearch() {
  // 先看当前是否已开启（aria-checked / 选中类名）
  const checkR = await ba.evalJs('(() => { const els = Array.from(document.querySelectorAll("button,[role=switch],[role=checkbox],[role=radio],[tabindex]")); const hit = els.find(e => { const t = (e.innerText||"").trim(); return t.includes("\\u667a\\u80fd\\u641c\\u7d22") || t.includes("\\u8054\\u7f51\\u641c\\u7d22"); }); return hit ? (hit.getAttribute("aria-checked") || hit.getAttribute("aria-selected") || hit.className || "found") : "notfound"; })()', 10000);
  const state = checkR.ok ? String(checkR.output).trim() : 'notfound';

  if (state === 'notfound') {
    // 元素没找到：尝试 find text 逐个候选点击
    for (const label of DS.webSearchToggle) {
      const r = await ba.find('text', label, 'click', 10000);
      if (r.ok) return { ok: true, action: 'clicked-' + label };
    }
    return { ok: false, error: '智能搜索开关未找到' };
  }

  // 元素存在：aria-checked=false / 未含选中类 → 点击
  const isChecked = state.includes('true') || /checked|active|selected|选中/i.test(state);
  if (!isChecked) {
    for (const label of DS.webSearchToggle) {
      const r = await ba.find('text', label, 'click', 10000);
      if (r.ok) break;
    }
  }
  return { ok: true, action: isChecked ? 'already-on' : 'clicked' };
}

// DeepSeek 网页版问答主入口
// prompt: 用户问题；webSearch: 是否开启联网搜索；taskId: 截图目录
async function deepSeekAsk(prompt, opts = {}) {
  const { webSearch = false, taskId = 'deepseek-' + Date.now() } = opts;
  const start = Date.now();
  const shotDir = path.join(ba.SESSION_ROOT, taskId);

  try {
    // 1. 打开主页（未登录会自动跳 sign_in）
    const openR = await ba.open(DS.home, 30000);
    if (!openR.ok) return { ok: false, step: 'open', error: openR.error };
    await ba.wait(2000);

    // 2. 登录检查 + 登录
    const loggedIn = await ba.isDeepSeekLoggedIn();
    if (!loggedIn) {
      const loginR = await ba.deepSeekLogin(60000);
      if (!loginR.ok) {
        return { ok: false, step: 'login', error: loginR.error, info: loginR.info };
      }
      await ba.wait(2000);
    }

    // 3. 联网搜索开关
    if (webSearch) {
      const wsR = await enableWebSearch();
      if (!wsR.ok) {
        // 开关找不到不阻断 —— 继续发问（部分账号/版本无此开关）
        console.log('[ai-web-chat] 联网搜索开关未找到，继续无联网提问');
      }
      await ba.wait(1000);
    }

    // 4. 找输入框 + 输入 + 发送
    // 输入框查找：placeholder 关键词轮询（新版可能无 placeholder，用 textbox 兜底）
    let inputFound = false;
    const kws = DS.inputPlaceholderKeywords;
    for (const kw of kws) {
      const r = await ba.find('placeholder', kw, 'click', 8000);
      if (r.ok) { inputFound = true; break; }
    }
    if (!inputFound) {
      // 兜底：snapshot 里找 textbox
      const snapR = await ba.snapshot(10000);
      const m = snapR.ok ? snapR.output.match(/textbox\s+"([^"]*)"/) : null;
      if (m) {
        const r = await ba.click('@' + (snapR.output.match(/textbox[^\[]*\[ref=(e\d+)\]/) || [])[1], 8000);
        inputFound = r.ok;
      }
    }
    if (!inputFound) return { ok: false, step: 'input', error: 'DeepSeek 输入框未找到（页面结构可能变更）' };

    // 输入文本（点击已聚焦，用 keyboard type 无 selector 输入更稳）
    const typeR = await ba.tryExec(`keyboard type "${String(prompt).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')}"`, 20000);
    if (!typeR.ok) return { ok: false, step: 'type', error: typeR.error };
    await ba.wait(500);

    // 发送（Enter）
    const pressR = await ba.press('Enter', 10000);
    if (!pressR.ok) return { ok: false, step: 'send', error: pressR.error };

    // 5. 等回答完成
    const waitR = await waitAnswerComplete(150000);

    // 6. 截图存档（回答快照，供 GEO / 监控台复用）
    const shotPath = path.join(shotDir, 'answer.png');
    await ba.screenshotToFile(shotPath);

    return {
      ok: waitR.ok,
      answer: waitR.answer || '',
      elapsedMs: Date.now() - start,
      timeout: !!waitR.timeout,
      screenshot: `/api/browser-agent/screenshots/${taskId}/answer.png`,
    };
  } catch (e) {
    return { ok: false, step: 'exception', error: e.message, elapsedMs: Date.now() - start };
  }
}

module.exports = { deepSeekAsk, waitAnswerComplete, enableWebSearch };
