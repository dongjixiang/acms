// ACMS · video 工具错误传递冒烟测试（v0.94 起，2026-08-20）
// 触发场景：小吉调 play_video → AGNES API 失败 → handler 必须返回 ok=false
//          （不能像之前 catch 吞错返回 ok=true，LLM 撒谎"已提交"）
//
// 测试分层：
//   [1] mock AGNES API 失败 → runAssistJob 必须 throw（不让 handler 拿到 ok=true）
//   [2] mock AGNES error=undefined → 错误信息不能是 undefined（兜底"无 message"）
//   [3] play_video handler 拿到 runAssistJob 抛错 → 必须返回 {ok:false}
//
// 用法: node scripts/test-video-error-propagation.js

const path = require('path');
const Module = require('module');

const ACMS_ROOT = path.join(__dirname, '..');
const SERVER = path.join(ACMS_ROOT, 'server');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

// ─── Helper：替换 require.cache 中的模块 ───────────────────────────────
function swapModule(modulePath, fakeExports) {
  const resolved = require.resolve(modulePath);
  const fake = { exports: fakeExports, loaded: true, id: resolved, filename: resolved };
  const old = require.cache[resolved];
  require.cache[resolved] = fake;
  return () => {  // restore
    if (old) require.cache[resolved] = old;
    else delete require.cache[resolved];
  };
}

// ─── Setup：建一个临时 requirement（返回真实 id） ───────────────────────
function makeRequirement(label) {
  const reqStore = require(path.join(SERVER, 'stores', 'requirement-store'));
  const projectStore = require(path.join(SERVER, 'stores', 'project-store'));
  if (!projectStore.getById('proj_agent-buddy-actions')) {
    try { projectStore.create({
      id: 'proj_agent-buddy-actions',
      slug: 'agent-buddy-actions',
      name: 'Buddy Actions',
    }); } catch {}
  }
  try {
    const created = reqStore.create({
      projectId: 'proj_agent-buddy-actions',
      title: `test ${label}`,
      description: 'mock test',
      priority: 3,
      type: 'chat',
      status: 'idea',
    });
    return created.id;
  } catch { return null; }
}

// ─── 测试 ──────────────────────────────────────────────────────────

(async () => {
  console.log('== [1] mock AGNES API 失败 → runAssistJob 必须 throw ==');
  // mock agnes_generate_video tool 返回 transport error（status_code=0）
  const fakeTool = {
    name: 'agnes_generate_video',
    handler: async (params) => ({
      error: 'simulated AGNES API failure (status_code=0)',  // 必须有 error 才能让 retried.ok=false → throw
      status_code: 0,
    }),
  };
  const restoreTool = swapModule(
    path.join(SERVER, 'services', 'tool-registry'),
    { getTool: () => fakeTool, registerTool: () => {}, listTools: () => [] }
  );

  try {
    const videoSvc = require(path.join(SERVER, 'services', 'assists', 'video'));
    const TEST_REQ = makeRequirement('video-err-001');
    if (!TEST_REQ) { console.log('  ❌ 无法创建测试 req'); }
    let threw = false;
    let thrownMsg = '';
    try {
      await videoSvc.runAssistJob(TEST_REQ, { prompt: '测试寓言视频', duration: 5 });
    } catch (e) {
      threw = true;
      thrownMsg = e.message || '';
    }
    check('runAssistJob 抛错（AGNES 失败时）', threw,
      `应该 throw 让 handler catch，但没抛。thrownMsg="${thrownMsg}"`);
    check('错误信息不是 "undefined"',
      threw && thrownMsg && !/undefined/.test(thrownMsg) && thrownMsg !== '视频生成失败: undefined',
      `thrownMsg="${thrownMsg}"`);

    // 验证 DB 已写 status=failed
    const reqStore = require(path.join(SERVER, 'stores', 'requirement-store'));
    const req = reqStore.getById(TEST_REQ);
    let assistVideo = null;
    try { assistVideo = JSON.parse(req.assist_video || 'null'); } catch {}
    check('DB 已写 assist_video.status=failed',
      assistVideo && assistVideo.status === 'failed',
      `实际 status=${assistVideo?.status}`);
    check('DB 写 error 字段非 undefined',
      assistVideo && assistVideo.error && assistVideo.error !== 'undefined' && !/undefined$/.test(assistVideo.error || ''),
      `实际 error="${assistVideo?.error}"`);
  } finally {
    restoreTool();
  }

  console.log('\n== [2] AGNES tool 返回 error=undefined → 错误兜底 ==');
  // mock：模拟 http1Fetch 返回 ok=false 但 resp.error=undefined（治 AGNES undefined bug）
  const fakeTool2 = {
    name: 'agnes_generate_video',
    handler: async (params) => ({ error: undefined, status_code: 0 }),  // ← undefined error
  };
  const restoreTool2 = swapModule(
    path.join(SERVER, 'services', 'tool-registry'),
    { getTool: () => fakeTool2, registerTool: () => {}, listTools: () => [] }
  );
  try {
    delete require.cache[require.resolve(path.join(SERVER, 'tools', 'agnes-video'))];
    delete require.cache[require.resolve(path.join(SERVER, 'services', 'assists', 'video'))];
    const agnesTool = require(path.join(SERVER, 'tools', 'agnes-video'));
    const realResult = await agnesTool.generateVideo({ prompt: 'test', num_frames: 49, frame_rate: 24 });
    check('generateVideo 返回 error 字段',
      !!realResult.error,
      `实际 result=${JSON.stringify(realResult).slice(0, 200)}`);
    check('error 不是 "undefined" 字面量（兜底生效）',
      realResult.error && realResult.error !== 'undefined' && !/undefined$/.test(realResult.error),
      `实际 error="${realResult.error}"`);
  } finally {
    restoreTool2();
  }

  console.log('\n== [3] play_video handler → 拿 runAssistJob 抛错必须返回 ok=false ==');
  // 重新 mock runAssistJob 抛错
  // mock 真实 runAssistJob 抛错，但保留 writeVideoChatEntry 等其他方法
  const realVideoSvcForMock = require(path.join(SERVER, 'services', 'assists', 'video'));
  const fakeVideoSvc = {
    ...realVideoSvcForMock,
    runAssistJob: async (reqId, opts) => {
      throw new Error('AGNES API 失败模拟: invalid key');
    },
  };
  const restoreVideoSvc = swapModule(
    path.join(SERVER, 'services', 'assists', 'video'),
    fakeVideoSvc
  );
  // mock reqStore.update 让 writeVideoChatEntry 不报错（chat 流 entry 是新功能，可能还没写）
  // 不 mock，写到真实 DB

  try {
    // 清掉 module cache 强制重读 leisure.js
    delete require.cache[require.resolve(path.join(SERVER, 'tools', 'leisure'))];
    const leisure = require(path.join(SERVER, 'tools', 'leisure'));
    // 找到 play_video tool
    const tr = require(path.join(SERVER, 'services', 'tool-registry'));
    // 重读 tool-registry
    const pv = tr.getTool('play_video');
    check('play_video 已注册', !!pv, 'tool-registry 找不到 play_video');
    if (pv) {
      const TEST_REQ2 = makeRequirement('video-err-002');
      if (!TEST_REQ2) { console.log('  ❌ 无法创建测试 req2'); }
      const result = await pv.handler({ prompt: '测试', duration: 5 }, { reqId: TEST_REQ2 });
      check('handler 返回 ok=false', result.ok === false, `result=${JSON.stringify(result).slice(0, 200)}`);
      check('handler 返回 error 信息', !!result.error && result.error !== 'undefined',
        `error="${result.error}"`);
      // 验证 chat 流写了 entry（如果是新功能）
      const reqStore = require(path.join(SERVER, 'stores', 'requirement-store'));
      const req2 = reqStore.getById(TEST_REQ2);
      let sh = [];
      try { sh = JSON.parse(req2.supplement_history || '[]'); } catch {}
      const videoEntries = sh.filter(e => e.source && e.source.startsWith('video_'));
      check('chat 流 supplement_history 含 video_* entry', videoEntries.length > 0,
        `实际 ${videoEntries.length} 条 video entry（这是新功能，如果修复后仍为 0 说明 B 项没做）`);
    }
  } finally {
    restoreVideoSvc();
  }

  console.log('\n== 汇总 ==');
  console.log(`  PASS: ${pass} / ${pass + fail}`);
  console.log(`  FAIL: ${fail}`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => {
  console.error('Test crashed:', e);
  process.exit(1);
});