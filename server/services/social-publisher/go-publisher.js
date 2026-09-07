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
- 编辑器是 ProseMirror 富文本。填正文时用 web_eval 一次性 innerHTML 赋值（避免 ProseMirror 同步问题）：
    document.querySelector('.ProseMirror, .editor-content [contenteditable]').innerHTML = HTML_CONTENT
- 发布按钮文本就是"发布"（可能在底部 toolbar 或右侧发布栏；用 web_find text='发布' click，但避开顶栏/营销区的"发布"链接）`.trim(),
  },
  xiaohongshu: {
    displayName: '小红书',
    loginUrl: 'https://creator.xiaohongshu.com/login',
    editorUrl: 'https://creator.xiaohongshu.com/publish/publisher?type=image',
    tips: `
【小红书特有提示】
- 小红书必须先上传图片才能填标题/正文
- 图片上传：在页面找"上传图片"或"+ 添加图片"按钮，点击后用 web_upload 或拖拽文件
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
- 填正文用 web_eval 一次性 innerHTML 赋值`.trim(),
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
- 一次只能发布一篇文章，但支持图文/视频/语音多种`.trim(),
  },
};

// ── goal 模板生成（核心）──
//  把发布任务的所有信息塞进 goal 字符串，LLM 看 goal 自己操作
function buildGoal(account, params) {
  const { platform, title, content, tags, images } = params;
  const cfg = PLATFORM_INSTRUCTIONS[platform];
  if (!cfg) throw new Error(`unsupported_platform: ${platform}`);

  const tagsLine = (tags && tags.length)
    ? `【标签】${tags.map(t => t.startsWith('#') ? t : '#' + t).join(' ')}`
    : '【标签】无（自动从正文提取或留空）';
  const imagesLine = (images && images.length)
    ? `【图片】${images.length} 张（路径：${JSON.stringify(images)}）`
    : '【图片】无';

  // v0.118.x: 注入本平台历史经验（从 data/social-publisher-memory/<platform>.json 读）
  //  LLM 看到这些会避开已知坑、复用成功路径
  const memoryBlock = platformMemory.renderForGoal(platform);

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

${tagsLine}
${imagesLine}

${cfg.tips}

【标准发布流程（请严格按序）】
1. web_open 登录页 → humanizer.wait(2-3秒) 等页面加载
2. web_snapshot 看登录页结构；如果默认是手机验证码/扫码，**必须**先 web_click 切换到"密码登录"tab
3. 自动登录：调 web_auth_login({"profile": "${account.id}"})
   - 服务端执行 agent-browser auth login（账号密码已 auth save）：自动填表单 + 提交 + 等跳转
   - ⚠️ 绝对不要用 web_eval 执行 shell/npx 命令（浏览器页面环境没有 Node/child_process，必失败）
   - 登录成功后用 web_snapshot 确认页面不再是登录页
4. 如果登录失败（验证码/风控/账号密码错/web_auth_login 返回 error）→ **立即**调 request_user_help（A 手动登录 / B 换账号 / C 取消）
5. web_open 编辑器页 → 等编辑器加载（看到标题输入框）
6. web_type 填标题（模拟人类打字，每次填 1-3 字，间隔 100-300ms）
7. web_snapshot 看编辑器结构 → web_eval 一次性 innerHTML 填正文（按上面平台 tips 给的 selector）
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
async function goPublish(account, params) {
  const sessionId = 'gp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  const goal = buildGoal(account, params);

  // 异步跑（不 await，前端经 /api/browser-agent/session/:id/stream 订阅进度）
  // onDone 只在终态（done/error）触发一次 —— waiting_user 状态由 resume 继续，不会重复落库
  runPublishSession(sessionId, account, params, goal).catch(e => {
    console.error('[go-publisher] session failed:', e.message);
    recordResult(sessionId, account, params, { status: 'error', content: '', error: e.message });
  });

  return { taskId: sessionId, status: 'starting' };
}

async function runPublishSession(sessionId, account, params, goal) {
  await taskRunner.runSessionTurn(sessionId, goal, {
    title: `${params.platform} AI 发布 · ${String(params.title || '').slice(0, 24)}`,
    maxRounds: 25,
    // v0.118.12: domainOnDone（非 onDone）——onDone 是 SSE 回调、resume 时被 routes 替换；
    //   domainOnDone 注册在 session 上，无论是否经过 waiting_user/resume 都只落库一次
    domainOnDone: (r) => recordResult(sessionId, account, params, r),
  });
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
