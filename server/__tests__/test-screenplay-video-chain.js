// ============================================================
// test-screenplay-video-chain.js — 分镜头视频「自动续跑」的前置条件
//
//   为什么要有这个测试：2026-09-25 用户实测反馈
//     「但是存在有些首帧图片还没有的时候，也自动续跑了」
//   根因 = v0.22.12 的续跑只检查「角色图 + 场景图」，从没检查首帧图。
//   而首帧图是「首尾帧衔接模式」的命根子：缺首帧的段只能退回「多图参考」模式，
//   段与段之间没有共享帧 → 画面跳变。续跑却会一路跑到尾，用户看到成品才发现。
//
//   修法：把「挑下一个续跑场」抽成纯函数 pickNextChainScene()，
//   要求候选场已有「公网可访问的首帧图」（image_url_output），否则停下并说明原因。
//
//   跑法：node server/__tests__/test-screenplay-video-chain.js
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'client', 'js', 'views', 'assists', 'screenplay.js');

let passed = 0, failed = 0;
const ok = (cond, name) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.error('  ✗', name); }
};

// ---- 用 vm 把浏览器端的 screenplay.js 载进来（只取纯函数） ----
const noop = () => {};
const sandbox = {
  console: { log: noop, warn: noop, error: console.error },
  document: { createElement: () => ({ style: {}, dataset: {}, classList: { add: noop, remove: noop }, appendChild: noop, remove: noop, querySelector: () => null, querySelectorAll: () => [], scrollIntoView: noop }), getElementById: () => null, body: { appendChild: noop }, querySelector: () => null, querySelectorAll: () => [] },
  window: { ACMSAssists: { register: noop }, ACMSAssistDispatcher: { poll: noop, loadAll: noop } },
  escHtml: (s) => String(s == null ? '' : s),
  api: noop, toast: noop, chatAssist: noop, refreshScreenplayChatCard: noop, startChatPolling: noop,
  setTimeout: noop, clearTimeout: noop, Promise,
};
sandbox.window.window = sandbox.window;
sandbox.window.document = sandbox.document;
vm.createContext(sandbox);
try {
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox);
} catch (e) {
  console.error('  ✗ screenplay.js 载入失败：', e.message);
  failed++;
}
const pick = (sandbox.window.ACMSScreenplayChain || {}).pickNextChainScene;

console.log('\n== 1. 函数可用性 ==');
ok(typeof pick === 'function', 'window.ACMSScreenplayChain.pickNextChainScene 已导出');

// ---- 造数据小工具 ----
const scenes = (n) => Array.from({ length: n }, (_, i) => ({ idx: i + 1, shot: '中景' }));
const framePub = (i) => ({ asset_path: `assets/x/f${i}.png`, image_url_output: `https://cdn/${i}.png` });
const frameLocalOnly = (i) => ({ asset_path: `assets/x/f${i}.png` });  // 打磨图：只有本地路径
const vid = (i) => ({ video_url: `https://cdn/v${i}.mp4` });

console.log('\n== 2. 核心回归：缺首帧 → 必须停下（用户报的 bug） ==');
{
  // 场 1 刚生成完，场 2 缺首帧图 → 以前会续跑（bug），现在必须 blockedBy:1
  const r = pick(scenes(3), {}, { '0': framePub(0) }, 0);
  ok(r.blockedBy === 1, '续跑前发现「场 2 缺首帧」→ blockedBy=1（不再自动续跑）');
  ok(r.next === undefined, 'blockedBy 分支不带 next');
}
{
  // 场 1、2 有事首帧，场 3 缺 → 场 1 生成完应续到场 2（接下来会在场 2 停下）
  const r = pick(scenes(3), {}, { '0': framePub(0), '1': framePub(1) }, 0);
  ok(r.next === 1, '下一候选场首帧齐全 → next=1（正常续跑）');
}
{
  // 全部有首帧
  const frames = { '0': framePub(0), '1': framePub(1), '2': framePub(2) };
  ok(pick(scenes(3), {}, frames, 0).next === 1, '首帧全齐 → 续跑到最近一场');
}
{
  // 场 2 已生成视频、场 3 缺首帧 → 应停在门 3（blockedBy:2）
  const r = pick(scenes(3), { '1': vid(1) }, { '0': framePub(0) }, 0);
  ok(r.blockedBy === 2, '已有视频的场跳过；下一个未生成的场（3）缺首帧 → blockedBy=2');
}
{
  // 场 2 无首帧、门 3 有首帧 → 不能"跳过缺口"去续场 3（顺序链断了）
  const r = pick(scenes(3), {}, { '0': framePub(0), '2': framePub(2) }, 0);
  ok(r.blockedBy === 1, '不跨过缺首帧的场（不跳跃续跑）→ blockedBy=1');
}
{
  // 本地打磨图（无 image_url_output）→ 首尾帧模式用不了 → 同样停下
  const r = pick(scenes(2), {}, { '0': framePub(0), '1': frameLocalOnly(1) }, 0);
  ok(r.blockedBy === 1, '候选场只有本地打磨图（无公网地址）→ blockedBy=1');
}

console.log('\n== 3. 完成态与边界 ==');
{
  ok(pick(scenes(2), { '0': vid(0), '1': vid(1) }, {}, 1).next === -1, '所有场都有视频 → next=-1（走"全部完成"提示）');
}
{
  const frames = { '0': framePub(0), '1': framePub(1) };
  ok(pick(scenes(2), { '0': vid(0) }, frames, 0).next === 1, '当前场已在 scene_videos 里也照常找下一场');
}
{
  ok(pick([], {}, {}, 0).next === -1, '空场景数组 → next=-1（不抛错）');
  ok(pick(null, null, null, 0).next === -1, '全 null 入参 → next=-1（防御式）');
  ok(pick(scenes(3), { '0': vid(0) }, null, 0).blockedBy === 1,
    '首帧表整个缺失（null）→ 视为「没有可用的首帧」→ blockedBy=1（宁可停下不烧额度）');
  ok(pick(scenes(2), { '0': vid(0), '1': vid(1) }, null, 0).next === -1,
    '首帧表缺失但视频都齐了 → 仍报 next=-1（走"全部完成"提示）');
}
{
  // 单场剧本：只有自己 → 全部完成
  ok(pick(scenes(1), { '0': vid(0) }, {}, 0).next === -1, '单场剧本生成完 → next=-1');
}
{
  // 场 2 是「别的场次正在生成」→ 没有 video_url 就该被选中（只要首帧在）
  const r = pick(scenes(2), { '1': { status: 'running' } }, { '0': framePub(0), '1': framePub(1) }, 0);
  ok(r.next === 1, '无 video_url 的在场任务仍算"未生成"→ next=1（由 in-flight 锁去防重复）');
}

console.log('\n== 4. 接线断言（改回旧逻辑必须变红） ==');
{
  const src = fs.readFileSync(SRC, 'utf8');
  ok(/pickNextChainScene\(allScenes, sceneVideos, chainFrames, sceneIdx\)/.test(src),
    '续跑分支调用 pickNextChainScene(...)');
  ok(/pick\.blockedBy != null/.test(src), '有 blockedBy 分支（停下 + 提示原因）');
  ok(/pick\.next >= 0/.test(src), '有 next >= 0 分支（继续）');
  ok(/已停止自动续跑/.test(src), '停下时有明确 toast 文案（告诉用户缺首帧 + 怎么继续）');
  ok(/freshSp\.scene_frames \|\| screenplay\.scene_frames/.test(src),
    '首帧表取新鲜 assist 数据（回退 screenplay.scene_frames）');
  // 负向：旧的内联 for 循环（只看有没有视频、不看首帧）不该再存在
  ok(!/sceneVideos\[String\(i\)\]\?\.video_url\) continue;/.test(src),
    '旧的内联续跑 for 循环已移除（防止回退到只看角色/场景图的版本）');
}

console.log('\n' + (failed === 0
  ? `✅ test-screenplay-video-chain: ${passed} 项全过`
  : `❌ test-screenplay-video-chain: ${passed} 过 / ${failed} 失败`));
process.exit(failed === 0 ? 0 : 1);
