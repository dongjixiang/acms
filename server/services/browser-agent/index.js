// ACMS 跨应用浏览器自动化服务（browser-agent v0.1）
// ============================================================
// 定位：通用浏览器自动化基础设施，供小吉工具 / ai-web-chat /
//       GEO 应用 / 未来任何应用复用。
// 底层：agent-browser CLI（Rust + Playwright Chromium，内置 stealth 反爬）
// 关键：通过 Python wrapper 执行（解决 Windows 子进程 pipe hang）
//       + 固定 session 复用（AGENT_BROWSER_SOCKET_DIR）
//
// 设计原则：
// 1. 命令执行无状态化 —— 每次 exec() 独立连 daemon，页面状态由
//    agent-browser daemon 保持（session 复用）
// 2. 截图自动落盘 —— data/browser-sessions/<taskId>/step-N.png，
//    供聊天卡片 / GEO 回答快照 / 监控台复用
// 3. 只做执行层，不做编排 —— LLM（小吉）或 ai-web-chat 适配器负责
//    步骤规划，本服务负责「执行 + 记录 + 可观察」
//
// 注意：不要 require 本模块后直接调 agent-browser 原生命令以外的
// 逻辑 —— 一切命令必须走 execAgentBrowser() 统一出口（超时/错误/
// 截图记录都在这里）

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const WRAPPER = path.join(__dirname, '..', 'agent-browser-wrapper.py');
const DEFAULT_TIMEOUT = 45000;

// 截图 / 会话数据根目录（项目根 data/，与 geo/ 等其他模块同级）
// 🔴 2026-08-31 实测：../../ 从 services/browser-agent 只到 server/ 层，
//    正确要 ../../../ 到项目根 —— 否则存到 server/data/（未被 gitignore 且不符合惯例）
const SESSION_ROOT = path.join(__dirname, '..', '..', '..', 'data', 'browser-sessions');
if (!fs.existsSync(SESSION_ROOT)) {
  try { fs.mkdirSync(SESSION_ROOT, { recursive: true }); } catch (e) {}
}

// ------------------------------------------------------------
// 核心执行器：跑一条 agent-browser 命令（复用 wrapper 的 pipe 修复）
// ------------------------------------------------------------
function execAgentBrowser(args, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve) => {
    const child = spawn('python', [WRAPPER, args], {
      encoding: 'utf8',
      timeout: timeout,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        resolve({ success: false, error: stderr || `exit code ${code}`, output: stdout.trim() });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message, output: '' });
    });

    setTimeout(() => {
      child.kill();
      resolve({ success: false, error: 'timeout', output: '' });
    }, timeout);
  });
}

// 执行单条命令，失败抛错（供工具/适配器使用）
async function exec(args, timeout = DEFAULT_TIMEOUT) {
  const result = await execAgentBrowser(args, timeout);
  if (!result.success) {
    throw new Error(`agent-browser ${args} 失败: ${result.error}`);
  }
  return result.output;
}

// 执行单条命令，返回结构化 {ok, output, error}（供服务层使用）
async function tryExec(args, timeout = DEFAULT_TIMEOUT) {
  const result = await execAgentBrowser(args, timeout);
  if (result.success) return { ok: true, output: result.output };
  return { ok: false, error: result.error, output: result.output || '' };
}

// ------------------------------------------------------------
// 命令封装（LLM 工具 / 适配器用）
// ------------------------------------------------------------
async function open(url, timeout = DEFAULT_TIMEOUT) {
  const r = await tryExec(`open "${url}" --json`, timeout);
  if (!r.ok) return { ok: false, error: r.error };
  // open --json 返回结构化数据，解析 URL/title
  try {
    const data = JSON.parse(r.output);
    return { ok: true, url: data?.data?.url || url, title: data?.data?.title || '' };
  } catch (e) {
    return { ok: true, url };
  }
}

async function click(sel, timeout = 15000) {
  return tryExec(`click "${sel}"`, timeout);
}

async function typeText(sel, text, timeout = 15000) {
  // 转义文本中的引号/反斜杠，避免 shell 破坏
  const safe = String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
  return tryExec(`type "${sel}" "${safe}"`, timeout);
}

async function press(key, timeout = 10000) {
  return tryExec(`press "${key}"`, timeout);
}

async function readText(timeout = 30000) {
  return tryExec('read', timeout);
}

async function snapshot(timeout = 15000) {
  return tryExec('snapshot', timeout);
}

async function find(locator, value, action = 'click', timeout = 15000) {
  return tryExec(`find ${locator} "${value}" ${action}`, timeout);
}

async function evalJs(expr, timeout = 15000) {
  // 🔴 wrapper 用 cmd shell=True 执行，特殊字符会被 cmd 解析破坏
  //    （2026-08-31 实测：双引号剥离 / => 的 > 重定向 / 箭头函数崩）
  //    根治：表达式 base64 编码，eval(decodeURIComponent(escape(atob(...))))
  //    浏览器端解码执行 —— base64 字符集无任何 cmd 元字符
  const b64 = Buffer.from(String(expr), 'utf8').toString('base64');
  const safe = `eval(decodeURIComponent(escape(atob('${b64}'))))`;
  return tryExec(`eval ${safe}`, timeout);
}

async function getInfo(what, timeout = 10000) {
  // what: title / url / text / html
  return tryExec(`get ${what}`, timeout);
}

async function wait(ms, timeout = 15000) {
  return tryExec(`wait ${ms}`, timeout);
}

// 截图：保存到文件，返回路径（供卡片展示 / 回答快照）
async function screenshotToFile(filePath, opts = {}, timeout = 20000) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) { try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {} }
  const full = opts.fullPage ? '--full' : '';
  const r = await tryExec(`screenshot ${full} "${filePath}"`, timeout);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, path: filePath, exists: fs.existsSync(filePath) };
}

// v0.118 PR 5: 文件上传（通过设置 file input 的 value 触发 change 事件）
// 用于抖音视频上传、小红书图片上传等场景
// 抖音/小红书的上传组件是隐藏的 <input type=file>，需要：
//   1. 把 file 路径写到 DataTransfer → FileList
//   2. 派发 change 事件
// 浏览器限制：出于安全，set value 必须用 DataTransfer API + 模拟事件
//
// ⚠️ v0.118 PR 5 限制：base64 模式适合 <10MB（小红书图片、头像）
//   抖音视频通常 50MB+，用 fetch 模式（video_url → fetch → Blob → File）
async function uploadFile(selector, filePath, timeout = 120000) {
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `file_not_found: ${filePath}` };
  }
  const stat = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  const fileSize = stat.size;
  const ext = fileName.split('.').pop().toLowerCase();
  const mimeMap = {
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  };
  const mime = mimeMap[ext] || 'application/octet-stream';

  // 大文件（>10MB）走 fetch 模式：先在浏览器里 fetch 同一个 video_url 转 Blob
  // 小文件（<10MB）走 base64 模式：直接 set value
  const useFetchMode = fileSize > 10 * 1024 * 1024;

  const js = useFetchMode
    ? `
    (async () => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok: false, error: 'input_not_found' };
      if (el.type !== 'file') return { ok: false, error: 'not_a_file_input' };
      try {
        // 大文件用 fetch 模式：依赖 filePath 是 URL（file:// 或 http://）
        const url = ${JSON.stringify(filePath)};
        const resp = await fetch(url);
        if (!resp.ok) return { ok: false, error: 'fetch_failed: ' + resp.status };
        const blob = await resp.blob();
        const file = new File([blob], ${JSON.stringify(fileName)}, { type: ${JSON.stringify(mime)} });
        const dt = new DataTransfer();
        dt.items.add(file);
        el.files = dt.files;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, name: file.name, size: file.size, mime, mode: 'fetch' };
      } catch (e) {
        return { ok: false, error: 'fetch_mode_failed: ' + e.message };
      }
    })()
  `
    : `
    (() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok: false, error: 'input_not_found' };
      if (el.type !== 'file') return { ok: false, error: 'not_a_file_input' };
      const bin = atob(${JSON.stringify(fs.readFileSync(filePath).toString('base64'))});
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], ${JSON.stringify(fileName)}, { type: ${JSON.stringify(mime)} });
      const dt = new DataTransfer();
      dt.items.add(file);
      el.files = dt.files;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, name: file.name, size: file.size, mime, mode: 'base64' };
    })()
  `;
  return await evalJs(js, timeout);
}

// 带编号标注的截图（--annotate）：截图 + 交互元素编号，对应 snapshot @eN
async function screenshotAnnotated(filePath, timeout = 25000) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) { try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {} }
  const r = await tryExec(`screenshot --annotate "${filePath}"`, timeout);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, path: filePath, exists: fs.existsSync(filePath) };
}

async function closeAll(timeout = 10000) {
  return tryExec('close --all', timeout);
}

// ------------------------------------------------------------
// 用户手动操作（双向控制：用户在实时画面上点击/滚动/输入）
// 坐标 = 浏览器视口 CSS 像素（前端按 img 显示尺寸映射）
// ------------------------------------------------------------
async function mouseClick(x, y, timeout = 10000) {
  const r1 = await tryExec(`mouse move ${Math.round(x)} ${Math.round(y)}`, timeout);
  if (!r1.ok) return r1;
  const r2 = await tryExec('mouse down left', timeout);
  const r3 = await tryExec('mouse up left', timeout);
  return r2.ok && r3.ok ? { ok: true } : (r2.ok ? r3 : r2);
}

async function mouseMove(x, y, timeout = 10000) {
  return tryExec(`mouse move ${Math.round(x)} ${Math.round(y)}`, timeout);
}

async function mouseWheel(dy, timeout = 10000) {
  return tryExec(`mouse wheel ${Math.round(dy)} 0`, timeout);
}

async function keyboardType(text, timeout = 15000) {
  const safe = String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
  return tryExec(`keyboard type "${safe}"`, timeout);
}

async function getViewport(timeout = 10000) {
  const r = await evalJs('window.innerWidth + "x" + window.innerHeight', timeout);
  if (!r.ok) return { ok: false, error: r.error };
  const m = String(r.output).match(/(\d+)x(\d+)/);
  return m ? { ok: true, width: parseInt(m[1], 10), height: parseInt(m[2], 10) } : { ok: false, error: 'viewport 解析失败: ' + r.output };
}

// ------------------------------------------------------------
// 会话级工具：当前页面上下文记录（供监控台/调试）
// ------------------------------------------------------------
async function pageInfo() {
  const [titleR, urlR] = await Promise.all([
    tryExec('get title', 8000),
    tryExec('get url', 8000),
  ]);
  return {
    title: titleR.ok ? titleR.output.trim() : '',
    url: urlR.ok ? urlR.output.trim() : '',
  };
}

// ------------------------------------------------------------
// 站点登录检查辅助（deepseek 等适配器用）
// ------------------------------------------------------------
// 判断当前是否已登录 DeepSeek：URL 不再是 /sign_in 且出现聊天输入框
async function isDeepSeekLoggedIn() {
  const urlR = await tryExec('get url', 8000);
  if (!urlR.ok) return false;
  const url = urlR.output.trim();
  if (url.includes('/sign_in') || url.includes('/login')) return false;
  // 主页特征：聊天输入框（DeepSeek 输入框 placeholder 含「给 DeepSeek 发送消息」类文本）
  const snapR = await tryExec('snapshot', 10000);
  if (!snapR.ok) return false;
  const snap = snapR.output;
  return /textbox/.test(snap) && /发送|输入|message/i.test(snap);
}

// DeepSeek 登录序列（手机号/邮箱 + 密码，auth save 凭据）
// 流程：open sign_in → 切密码登录（eval 点击，find text 精确匹配不可靠 2026-08-31 实测）
//        → auth login 填表 → 兜底点「登录」→ 等跳转
async function deepSeekLogin(timeout = 60000) {
  const r1 = await tryExec(`open "https://chat.deepseek.com/sign_in" --json`, 30000);
  if (!r1.ok) return { ok: false, error: r1.error, step: 'open' };
  await wait(2000);

  // 切到密码登录（默认是验证码登录表单）
  // 🔴 eval .click() 对 React 受控组件无效（2026-08-31 实测）；
  //    必须 snapshot 解析 ref + 真实点击（手工验证过的可行路径）
  const snapR = await snapshot(10000);
  const pwBtn = snapR.ok ? snapR.output.match(/button "密码登录" \[ref=(e\d+)\]/) : null;
  if (pwBtn) {
    await tryExec(`click "@${pwBtn[1]}"`, 10000);
    await wait(1200);
  }

  // 自动登录（凭据来自 auth save deepseek）
  // 🔴 2026-08-31 实测：auth login 填表常成功但提交时网络超时（10060）报错；
  //    表单已填好就不能放弃 —— 继续走兜底提交
  const r3 = await tryExec('auth login deepseek', 40000);
  await wait(1500);

  // 兜底提交：仍在登录页 → snapshot 解析「登录」按钮 ref 真实点击
  // 🔴 eval .click() 对 React 无效；必须 snapshot ref + 真实点击
  const urlR = await tryExec('get url', 8000);
  const stillOnLogin = urlR.ok && String(urlR.output).includes('/sign_in');
  if (stillOnLogin) {
    const snap2 = await snapshot(10000);
    const loginBtn = snap2.ok ? snap2.output.match(/button "登录" \[ref=(e\d+)\]/) : null;
    if (loginBtn) {
      await tryExec(`click "@${loginBtn[1]}"`, 10000);
      await wait(5000);
    }
  }

  const info = await pageInfo();
  const loggedIn = !(info.url || '').includes('/sign_in');
  return { ok: loggedIn, info, step: 'login' };
}

// ─────────────────────────────────────────────────────────────────
// v0.118.1：auth 系列 — 给 social-publisher 账号管理用
//   auth save → 保存账号密码到 agent-browser 全局 auth 系统（acms session 复用）
//   auth login → 立即登录（打开登录页 + 自动填账号密码 + 等跳转；如需验证码用户去 Web 机器人手动点）
//   auth list → 列出已保存 profile（仅名字 + URL，无密码）
//   auth delete → 删除 profile（账号删除时调）
// ─────────────────────────────────────────────────────────────────

async function authSave({ name, url, username, password }) {
  if (!name || !url || !username || password === undefined || password === null) {
    return { ok: false, error: 'missing_fields: name/url/username/password 必填' };
  }
  // --password 命令行参数（密码走 stdin 在 Windows + agent-browser + wrapper 组合下卡 30s，2026-09-06 实测）
  //   agent-browser 软警告"may be visible in process listings"——ACMS 单机部署瞬时暴露，可接受
  const args = `auth save "${name}" --url "${url}" --username "${username}" --password "${String(password).replace(/"/g, '\\"')}"`;
  const r = await execAgentBrowser(args, 15000);
  if (!r.success) return { ok: false, error: r.error || 'auth_save_failed', output: r.output };
  return { ok: true, name, output: r.output };
}

async function authLogin({ name, timeout = 45000 }) {
  if (!name) return { ok: false, error: 'missing_name' };
  // auth login 自动：打开登录页 → 等 username/password 表单 → 自动填 → 提交 → 等跳转
  //   成功条件：URL 跳到登录后页面（如创作中心）
  //   失败/超时：可能需要验证码 → 用户去 Web 机器人手动完成
  const r = await execAgentBrowser(`auth login "${name}"`, timeout);
  if (!r.success) return { ok: false, error: r.error || 'auth_login_failed', output: r.output, need_user: true };
  return { ok: true, name, output: r.output };
}

async function authList() {
  const r = await execAgentBrowser('auth list', 10000);
  if (!r.success) return { ok: false, error: r.error || 'auth_list_failed' };
  // 输出是文本，解析出 profile 列表（agent-browser 0.31 输出格式：<name>  <url>）
  const lines = (r.output || '').split('\n').map(l => l.trim()).filter(Boolean);
  return { ok: true, profiles: lines };
}

async function authDelete({ name }) {
  if (!name) return { ok: false, error: 'missing_name' };
  const r = await execAgentBrowser(`auth delete "${name}"`, 5000);
  if (!r.success) return { ok: false, error: r.error || 'auth_delete_failed' };
  return { ok: true, name };
}

module.exports = {
  execAgentBrowser,
  exec,
  tryExec,
  open,
  click,
  typeText,
  press,
  readText,
  snapshot,
  find,
  evalJs,
  getInfo,
  wait,
  screenshotToFile,
  screenshotAnnotated,
  uploadFile,
  closeAll,
  mouseClick,
  mouseMove,
  mouseWheel,
  keyboardType,
  getViewport,
  pageInfo,
  isDeepSeekLoggedIn,
  deepSeekLogin,
  authSave,
  authLogin,
  authList,
  authDelete,
  SESSION_ROOT,
};
