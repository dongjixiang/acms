// ACMS social-publisher — go-publisher.js
// ========================================
// v0.118.12: 收敛到 browser-agent session 通道（去重，不再自建执行栈）
//
// 之前（v0.118.x 初版）：本模块自建 TASKS 内存表 + SSE_CLIENTS + 5 个 go-publish
//   端点 + replyWaiting/getTask/listTasks —— 与 browser-agent task-runner 的
//   TASKS 表 / SSE 通道 / waiting_user resume 完全重复（双层状态、两套 SSE）。
//
// 现在：go-publish 的「一次发布」= browser-agent 的一个一次性 session：
//   - sessionId 前缀 gp-，与 Web机器人 ws- 会话互不干扰（Web机器人前端只列自己的）
//   - 执行状态 / 步骤截图 / waiting_user 保活 / resume / 断线恢复
//     全部由 browser-agent 的 session 端点负责（/api/browser-agent/session/*）
//   - 本模块 = 领域壳，只做三件事：
//       ① buildGoal 组装平台知识（PLATFORM_INSTRUCTIONS + platform-memory）
//       ② 启动 runSessionTurn（fire-and-forget，前端经 SSE 订阅）
//       ③ onDone 落库：social_task_history + platform-memory（成败都写）
//
// 流程：
//   goPublish(account, params) → buildGoal → runSessionTurn(gp-xxx, goal)
//   → 前端 GET /api/browser-agent/session/gp-xxx/stream 订阅（step/waiting_user/done）
//   → 用户回复 POST /api/browser-agent/session/gp-xxx/reply
//   → done 时本模块写 history（source='goal-driven' 与老 provider 同一张表）

'use strict';

const taskRunner = require('../browser-agent/task-runner');
const platformMemory = require('./platform-memory');  // v0.118.x: 平台经验库
// v0.119.6: AI 发布自带远程预览浏览器 —— gp-* session 自动起 Puppeteer Chrome，画面直接渲染到 AI modal
const appRuntime = require('../app-runtime');
// v0.119.7: buildGoal 净化 base64 → 临时文件 + [IMAGE:n] 占位符（解 context 撑爆）
const sanitizeContent = require('./sanitize-content');

// ── 平台特定指令（告诉 LLM 每个平台要做什么、有什么坑）──
//  不是选择器代码，是「自然语言指令 + 关键链接 + 已知陷阱」
//  LLM 看 DOM 自己判断具体怎么操作
const PLATFORM_INSTRUCTIONS = {
  toutiao: {
    displayName: '今日头条',
    loginUrl: 'https://mp.toutiao.com/auth/page/login',
    editorUrl: 'https://mp.toutiao.com/profile_v4/graphic/publish',
    tips: `
【头条特有提示】
- 登录页默认是"手机验证码"tab，**必须**先切换到"密码登录"再让 agent-browser 自动填账号密码
- 切换方式：用 web_snapshot 看页面，找包含"密码登录"或"账号密码登录"文本的可点击元素（div/span/a），调 web_click
- ⚠️ **标题输入框是 React 受控组件，web_type 打字不会进 value**（页面显示仍为空，浪费轮数）——
  **必须**直接用 web_eval 原生 setter 赋值（一次成功，不要先试 web_type）：
    (() => { const t = document.querySelector('textarea[placeholder*="文章标题"]'); if(!t) return 'NO_TITLE_INPUT';
      const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      set.call(t, '你的标题');
      t.dispatchEvent(new Event('input', {bubbles:true})); t.dispatchEvent(new Event('change', {bubbles:true}));
      return t.value; })()
  验证：返回的 t.value 应等于你的标题；若返回 NO_TITLE_INPUT 说明还没切到编辑器页，先 web_open 编辑器 URL 再重试
- 编辑器是 ProseMirror 富文本。填正文时用 web_eval 一次性 innerHTML 赋值（避免 ProseMirror 同步问题）：
    document.querySelector('.ProseMirror, .editor-content [contenteditable]').innerHTML = HTML_CONTENT
- **正文带图（v0.119.8，首选 web_paste）**：任务里有【正文HTML文件】路径时，用
    web_paste({"file_path":"<路径>", "selector":".ProseMirror"})
  一次把文字+图贴进编辑器 —— 头条的富文本管线会自动把 base64 图上传到 CDN 并插入正文（等价于人工 Ctrl+C/Ctrl+V）。
  **不需要**找 input[type=file]、**不需要**逐个 web_upload、**不需要**管封面图 vs 正文插图。
- **封面图（可选）**：头条发布时通常会自动从正文抓图做封面；若需手动设，点 class 含 'article-cover' 的 DIV → 弹窗内 input[type=file] → web_upload
- **web_upload 兜底**：仅当 web_paste 不可用时用（返回 UPLOAD_NO_INPUT_MATCH 会带 candidates.buttons/divs 提示点哪个按钮触发弹窗）
- **发布流程（两步确认，v0.119.8.4）**：
  1. web_find({"locator":"text","value":"预览并发布","action":"click"})（或"发布"）→ 点编辑器右上角/底部的主发布按钮
  2. **弹出发布设置面板**（含「展示封面」「添加位置」「投放广告」「声明首发」等）→ 按下面处理：
     - **封面（必做）**：面板有「单图 / 三图 / 无封面」三个选项 →
       最省事：web_find({"locator":"text","value":"无封面","action":"click"})
       或者用正文首图：「单图」→ 自动从正文抓图
       ⚠️ **不处理封面直接点「确认发布」可能被拦/报错**（提示"请上传封面"）
     - 「添加位置」「投放广告」「声明首发」保持默认即可，**不用动**
  3. 点面板底部的 **「确认发布」**：web_find({"locator":"text","value":"确认发布","action":"click"})
  4. 等 5-10s → 页面出现「提交成功」提示 或 URL 变化 → 完成
  ⚠️ 只点第 1 步不算发布成功；**必须先处理封面，再点「确认发布」**
  ⚠️ **不要用 :has-text() 等 Playwright 语法**（Puppeteer 不支持）—— 按文字点一律用 web_find({"locator":"text","value":"..."}）`.trim(),
  },
  xiaohongshu: {
    displayName: '小红书',
    loginUrl: 'https://creator.xiaohongshu.com/login',
    editorUrl: 'https://creator.xiaohongshu.com/publish/publisher?type=image',
    tips: `
【小红书特有提示】
- **小红书必须先上传图片才能填标题/正文**（标题/正文输入框在图片上传后才解锁）
- **图片上传流程（v0.119.7，web_upload）**：发布任务【图片】段会给你本地图片绝对路径列表
  1. web_snapshot 看编辑器，找包含「上传图片」「添加图片」「+」文本的可点击元素 → web_click 触发文件选择对话框
  2. web_snapshot 确认页面上出现了 input[type="file"]（多数平台是隐藏的 input，点击上传按钮后才挂到 DOM 上）
  3. **按【图片】段的路径顺序，多次调 web_upload({file_path:<绝对路径>}) 上传每张图**（小红书最多 18 张）
  4. web_snapshot 看是否所有图都生成了缩略图；如有图没上去，单独再 web_upload 一次
- **正文填写（v0.119.8）**：图片传完后，若任务里有【正文HTML文件】路径 → 用 web_paste({"file_path":"<路径>"}) 贴正文（比 web_eval innerHTML 更能触发平台状态同步）
- 标题限 20 字以内；正文用 emoji + 短段 + #话题 格式
- 发布前会自动风控检查（标题党/敏感词），如失败会有提示`.trim(),
  },
  zhihu: {
    displayName: '知乎',
    loginUrl: 'https://www.zhihu.com/signin',
    editorUrl: 'https://zhuanlan.zhihu.com/write',
    tips: `
【知乎特有提示】
- 默认是扫码登录；如未登录需要切换到"手机号/邮箱" + 密码登录
- 知乎有专栏文章和回答两种模式，根据用户指定 publish_type 选择对应 URL
- 知乎编辑器是 Draft.js（看到 class 包含 public-DraftEditor-content）
- 填正文用 web_eval 一次性 innerHTML 赋值
- **正文带图（v0.119.7）**：发布任务【图片】段给的是本地路径。知乎专栏编辑器工具有「插入图片」按钮，点了会弹文件选择框 → 用 web_upload({file_path:<路径>}) 逐张上传 → 平台自动插入到光标位置`.trim(),
  },
  douyin: {
    displayName: '抖音',
    loginUrl: 'https://creator.douyin.com/',
    editorUrl: 'https://creator.douyin.com/creator-micro/content/upload',
    tips: `
【抖音特有提示】
- 抖音是视频发布；如果用户没传视频文件，可以告诉用户需要先准备视频
- 默认是扫码登录；可能需要切换到手机号登录
- 文案限 22 字以内；话题用 #xxx 格式会自动变成 @话题`.trim(),
  },
  wechat_oa: {
    displayName: '微信公众号',
    loginUrl: 'https://mp.weixin.qq.com',
    editorUrl: 'https://mp.weixin.qq.com/cgi-bin/appmsg',
    tips: `
【微信公众号特有提示】
- 公众号通常需要扫码登录（管理员微信扫码）
- 公众号编辑器是 contenteditable 富文本，支持更复杂的样式
- 一次只能发布一篇文章，但支持图文/视频/语音多种
- **正文带图（v0.119.7）**：发布任务【图片】段给的是本地路径。公众号编辑器工具有「图片」按钮（在工具栏左侧）→ 点了弹文件选择 → 用 web_upload({file_path:<路径>}) 逐张上传 → 平台自动插入到光标位置`.trim(),
  },
};

// ── goal 模板生成（核心）──
//  把发布任务的所有信息塞进 goal 字符串，LLM 看 goal 自己操作
//
// v0.119.7: params.embeddedImagePaths 是 sanitizeContent 抽 base64 后的临时文件路径数组；
//   buildGoal 不会主动用 LLM 看图，只告诉 LLM「有 N 张内嵌图，路径在 X，用 web_upload 上传」
function buildGoal(account, params) {
  const { platform, title, content, tags, images } = params;
  const embeddedPaths = Array.isArray(params.embeddedImagePaths) ? params.embeddedImagePaths : [];
  const cfg = PLATFORM_INSTRUCTIONS[platform];
  if (!cfg) throw new Error(`unsupported_platform: ${platform}`);

  const tagsLine = (tags && tags.length)
    ? `【标签】${tags.map(t => t.startsWith('#') ? t : '#' + t).join(' ')}`
    : '【标签】无（自动从正文提取或留空）';

// v0.119.7: 区分「前端传入的外链图片」与「content 内嵌 base64 抽出来的临时文件」
  //   v0.119.7.2: images 数组可能是混合 — 既有外链 URL 也有本地路径（base64 抽出后替换的）
  //   告诉 LLM：URL 已经是平台可访问的（不用再上传），本地路径用 web_upload 上传
  let imagesLine;
  if (embeddedPaths.length && images && images.length) {
    // 拆 images 为 URL 和本地路径
    const localPaths = images.filter(p => typeof p === 'string' && /^([a-zA-Z]:[\\\\\/]|\/)/.test(p));
    const urlImages = images.filter(p => typeof p === 'string' && /^https?:\/\//i.test(p));
    const otherImages = images.filter(p => !localPaths.includes(p) && !urlImages.includes(p));
    const parts = [];
    if (urlImages.length) parts.push(`外链 ${urlImages.length} 张（URL 已是平台可访问，无需再上传）`);
    if (otherImages.length) parts.push(`其他 ${otherImages.length} 张（${JSON.stringify(otherImages)}）`);
    if (localPaths.length) parts.push(`内嵌 ${localPaths.length} 张（已抽到本地临时文件：${JSON.stringify(localPaths)}）`);
    parts.push(`还有 content 正文里抽出的 ${embeddedPaths.length} 张临时文件：${JSON.stringify(embeddedPaths)}`);
    imagesLine = `【图片】${parts.join(' + ')}\n**所有本地路径都用 web_upload({file_path:<绝对路径>}) 上传到当前页面的 input[type=file]**（外链 URL 不用上传）`;
  } else if (embeddedPaths.length) {
    imagesLine = `【图片】${embeddedPaths.length} 张内嵌图（已从正文 base64 抽出，临时文件路径：${JSON.stringify(embeddedPaths)}）。**用 web_upload({file_path:<路径>}) 上传到当前页面的 input[type=file]**（多张图按顺序逐张上传）`;
  } else if (images && images.length) {
    // 全是外链 URL 的情况
    const localPaths = images.filter(p => typeof p === 'string' && /^([a-zA-Z]:[\\\\\/]|\/)/.test(p));
    if (localPaths.length === images.length) {
      imagesLine = `【图片】${images.length} 张本地文件（路径：${JSON.stringify(images)}）。**用 web_upload({file_path:<路径>}) 上传到当前页面的 input[type=file]**`;
    } else {
      imagesLine = `【图片】${images.length} 张（路径：${JSON.stringify(images)}）。外链 URL 不用上传；本地路径用 web_upload 上传`;
    }
  } else {
    imagesLine = '【图片】无';
  }

  // v0.118.x: 注入本平台历史经验（从 data/social-publisher-memory/<platform>.json 读）
  //  LLM 看到这些会避开已知坑、复用成功路径
  const memoryBlock = platformMemory.renderForGoal(platform);

  // v0.119.8: 正文 HTML 文件路径 —— web_paste 优先路径（图文一次贴完，平台自动上传图）
  const htmlPath = params.contentHtmlPath || null;
  const htmlPathLine = htmlPath
    ? `\n【正文HTML文件】（**填正文的首选方式，v0.119.8**）：${htmlPath}\n**直接调 web_paste({"file_path":"${htmlPath}"}) 即可**——工具会把 HTML（含图）写剪贴板 + Ctrl+V 粘贴到编辑器，平台富文本管线会自动把图片上传到 CDN（等价于用户手动粘贴）。比逐个 web_upload 更可靠（不用找上传按钮/不用管封面 vs 正文两类图）。`
    : '';

  return `【发布任务】把一篇文章发布到 ${cfg.displayName}

${memoryBlock}

【账号信息】
- display_name: ${account.display_name || account.id}
- agent-browser 已通过 auth save 保存账号密码（profile=${account.id}）；登录时让 agent-browser 自动填即可
- 你不需要手动输入账号密码；遇到登录表单时直接调 npx agent-browser auth login ${account.id}（或 web_eval 触发），agent-browser 会自动填 + 提交 + 等跳转

【平台链接】
- 登录页: ${cfg.loginUrl}
- 编辑器: ${cfg.editorUrl}

【文章内容】
【标题】${title}
【正文】（markdown 格式；如需插图位置写 [IMAGE]）：
${content}
${htmlPathLine}

${tagsLine}
${imagesLine}

${cfg.tips}

【标准发布流程（请严格按序）】
1. web_open 登录页 → humanizer.wait(2-3秒) 等页面加载
2. web_snapshot 看登录页结构；如果默认是手机验证码/扫码，**必须**先 web_click 切换到"密码登录"tab
3. 自动登录：调 web_auth_login({"profile": "${account.id}"})
   - 当前是**远程预览（Puppeteer）模式**：服务端从本机加密凭据解密后，用真实鼠标+键盘填表 + Enter 提交 + 等跳转
   - **凭据由服务端处理，你看不到账号密码**（不要向用户索要密码）
   - ⚠️ 绝对不要用 web_eval 执行 shell/npx 命令（浏览器页面环境没有 Node/child_process，必失败）
   - 返回 {ok:true, filled, urlChanged} → urlChanged=true 说明提交成功，接着 web_snapshot 确认；urlChanged=false（需验证码/密码错）→ 立即 request_user_help
   - 返回 {ok:false, error:'账号未保存可用凭据'} → 告诉用户去「内容运营平台 → 账号 → ✏️ 编辑」重填一次密码
4. 如果登录失败（验证码/风控/账号密码错/web_auth_login 返回 error）→ **立即**调 request_user_help（A 手动登录 / B 换账号 / C 取消）
5. web_open 编辑器页 → 等编辑器加载（看到标题输入框）
6. web_type 填标题（模拟人类打字，每次填 1-3 字，间隔 100-300ms）
7. **填正文（v0.119.8 首选）**：若任务里有【正文HTML文件】路径 → 先 web_snapshot 确认编辑器 selector → **调 web_paste({"file_path":"<该路径>", "selector":".ProseMirror"})** 一次贴完文字+图（平台自动上传图到 CDN）。
   - 没有正文HTML文件时才回退：web_eval 一次性 innerHTML 填正文
   - ⚠️ 绝对不要用 web_eval 强行设置 input[type=file].files（假的，平台不认）
8. 填标签（如有）：web_snapshot 找标签输入框 → web_type 输入 → web_press Enter
9. **发布前必须调 request_user_help 确认**（A 已填好/发布 / B 修改 / C 取消）
10. 用户确认后 web_click 发布按钮（按上面平台 tips 给的发布按钮位置）
11. 等 3-5 秒 → web_read 当前页 URL；如跳转到 post_url（包含 /c/ 或 /item/ 或 /p/），提取 URL
12. 中文总结：
    ✅ 成功：发布到 ${cfg.displayName} 成功，URL=...
    ❌ 失败：原因 + 当前页面状态

【重要规则 — 违反会重置任务】
- 不要自己尝试填账号密码（agent-browser auth 系统已接管）
- 不要擅自切换平台/换数据源
- 遇到任何障碍（登录墙/验证码/风控/页面空白/选择器找不到）→ **立即**调 request_user_help 三选一模板
- 同一操作失败 2 次 → 立即求助（不要第 3 次）
- 发布是不可逆操作，**必须**等用户确认才能点发布按钮
`.trim();
}

// ── 主入口 ──
//  启动一次 goal-driven 发布（作为 browser-agent 的一次性 session 运行）
//  opts.appSessionId（v0.119.5）—— 前端可传用户的 ws-* Web 机器人 sessionId，
//    让 gp-* session 共享那个浏览器，触发登录墙/验证码时用户可直接接管（handoff）
//  v0.119.6 强化 —— opts.appSessionId 为空时，服务端**自动起一个 Puppeteer Chrome** 作为
//    gp-* session 自带的远程预览浏览器（接管时画面直接渲染到 AI modal，不依赖用户先开 Web 机器人）
async function goPublish(account, params, opts = {}) {
  const sessionId = 'gp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

  // v0.119.7: buildGoal 净化 —— 抽 content 内嵌的 base64 到临时文件 + [IMAGE:n] 占位符
  //   避免整段塞进 goal 让 LLM 收到 16K tokens 垃圾 + 触发 DeepSeek 9.2M 超限
  //   错误（size_too_large / too_many_images）同步抛给 routes 返 400
  //
  // v0.119.7.2: 同时处理 params.images 数组里的 base64 data URI（前端传的"图片路径"
  //   可能本身就是 data URI 而不是 URL —— 这是 2026-09-15 实测撑爆 4.37MB 的真凶）
  let sanitized = null;
  let sanitizedImages = null;
  try {
    sanitized = sanitizeContent.sanitizeContent(params.content, sessionId);
    sanitizedImages = sanitizeContent.sanitizeImages(params.images || [], sessionId);
  } catch (e) {
    console.error(`[go-publisher] v0.119.7 sanitize failed: ${e.message}`);
    const err = new Error(e.message);
    err.code = e.code || 'sanitize_failed';
    throw err;
  }
  // 合并：content 内嵌的临时文件 + params.images 里抽出的临时文件
  const allEmbeddedPaths = [...sanitized.paths, ...sanitizedImages.paths];
  const goalParams = {
    ...params,
    content: sanitized.text,
    embeddedImagePaths: allEmbeddedPaths,
    images: sanitizedImages.sanitized,  // data URI → 绝对路径；URL 原样保留
    contentHtmlPath: sanitized.htmlPath || null,  // v0.119.8: 完整 HTML（含图）路径，供 web_paste
  };
  const goal = buildGoal(account, goalParams);

  let appSessionId = opts.appSessionId || null;

  // v0.119.6: 自动起 PP 浏览器 —— 用户没指定就新建一个（AI 发布自带画面 + 接管能力）
  if (!appSessionId) {
    try {
      const pp = await appRuntime.openSession({ url: 'about:blank', w: 1100, h: 700 });
      appSessionId = pp && pp.sessionId;
      if (appSessionId) {
        console.log(`[go-publisher] v0.119.6 auto-started PP session ${appSessionId} for ${sessionId}`);
      } else {
        console.warn(`[go-publisher] v0.119.6 PP session open returned no sessionId — handoff will be disabled`);
      }
    } catch (e) {
      console.error(`[go-publisher] v0.119.6 PP session open failed: ${e.message} — handoff will be disabled (will fall back to LLM-only)`);
    }
  }

  // 异步跑（不 await，前端经 /api/browser-agent/session/:id/stream 订阅进度）
  // onDone 只在终态（done/error）触发一次 —— waiting_user 状态由 resume 继续，不会重复落库
  runPublishSession(sessionId, account, params, goal, appSessionId).catch((e) => {
    console.error('[go-publisher] session failed:', e.message);
    recordResult(sessionId, account, params, { status: 'error', content: '', error: e.message });
    cleanupPpSession(appSessionId);  // 失败也要清 PP 浏览器
  });

  return { taskId: sessionId, status: 'starting', appSessionId };
}

async function runPublishSession(sessionId, account, params, goal, appSessionId) {
  await taskRunner.runSessionTurn(sessionId, goal, {
    title: `${params.platform} AI 发布 · ${String(params.title || '').slice(0, 24)}`,
    maxRounds: 25,
    appSessionId,  // v0.119.5+: 让 gp-* session 共享用户的 Web 机器人浏览器
    // v0.118.12: domainOnDone（非 onDone）——onDone 是 SSE 回调、resume 时被 routes 替换；
    //   domainOnDone 注册在 session 上，无论是否经过 waiting_user/resume 都只落库一次
    domainOnDone: (r) => {
      recordResult(sessionId, account, params, r);
      // v0.119.6: 终态清理 PP 浏览器（自动起的 session —— handoff 续跑会重新拿锁）
      cleanupPpSession(appSessionId);
      // v0.119.7: 延迟 60s 清 sanitize-content 抽出来的临时文件（让前端收完 done/查历史后再清）
      setTimeout(() => {
        try { sanitizeContent.cleanupSession(sessionId); } catch (_) { /* ignore */ }
      }, 60000);
    },
  });
}

// v0.119.6: 清理 PP 浏览器 —— 自动起的 session 任务终态时关掉
//   注意：只在 status=done/error 调，不在 waiting_user/handoff_paused 调（hendoff 续跑会复用）
function cleanupPpSession(appSessionId) {
  if (!appSessionId) return;
  try {
    appRuntime.closeSession(appSessionId).catch((e) => {
      console.warn(`[go-publisher] v0.119.6 PP close failed for ${appSessionId}: ${e.message}`);
    });
  } catch (_) { /* ignore sync errors */ }
}

// ── 完成后落库（与老 provider 同一张 social_task_history + platform-memory）──
function recordResult(sessionId, account, params, r) {
  const status = r.status || 'error';
  const content = r.content || '';
  const error = r.error || null;
  const ok = status === 'done';

  // 执行步骤从 session 的 toolCalls 取（{round,maxRounds,message,toolNames,ts,screenshot?}）
  let steps = [];
  try {
    const s = taskRunner.getSession(sessionId);
    if (s && Array.isArray(s.toolCalls)) steps = s.toolCalls;
  } catch (_) { /* ignore */ }

  // 从 LLM 总结提取 post_url（平台域 URL）
  let postUrl = null;
  if (content) {
    const m = content.match(/https?:\/\/[^\s)]+(?:toutiao|xiaohongshu|zhihu|douyin|weixin|mp\.[a-z]+\.com)[^\s)]*/);
    if (m) postUrl = m[0];
  }

  try {
    require('./persistence').recordTaskHistory({
      task_id: sessionId,
      platform: account.platform,
      account_id: account.id,
      title: params.title,
      content: params.content,
      result: {
        ok,
        content,
        error,
        steps,
        post_url: postUrl,
        source: 'goal-driven',  // 标记是 AI goal 模式（区别老 provider）
      },
    });
  } catch (e) {
    console.error('[go-publisher] persist history failed:', e.message);
  }

  // v0.118.14: 一次性发布会话生命周期管理 —— 历史已落 SQLite（权威档案），
  //   延迟 60s 删掉 gp-* session（Web机器人不展示它，留着只占 data/browser-sessions.json）
  //   waiting_user 期间不会走到这里（domainOnDone 只在终态触发）；60s 让前端有足够时间收 done/查 messages
  if (ok || error) {
    try {
      setTimeout(() => {
        try { taskRunner.deleteSession(sessionId); } catch (_) { /* ignore */ }
      }, 60000);
    } catch (_) { /* ignore */ }
  }

  // 写平台经验库（下次同平台发布时注入 goal 复用）——失败也写（最有价值）
  try {
    platformMemory.append(account.platform, {
      task_id: sessionId,
      ok,
      summary: error
        ? `❌ ${String(error).slice(0, 200)}`
        : (postUrl ? `✅ 发布成功：${postUrl}` : '✅ 完成（无 post_url）'),
      content: content || error || '',
    });
  } catch (e) {
    console.error('[go-publisher] append memory failed:', e.message);
  }
}

module.exports = {
  goPublish,
  // export for testing / routes
  buildGoal,
  PLATFORM_INSTRUCTIONS,
};
