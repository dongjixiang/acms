// test-video-bucket-fix.js
// v0.22.30: 验证分桶存储 helper + module 导出 + 不污染真实数据
const videoSvc = require('./server/services/assists/video');

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  ✓ ${label}: ${JSON.stringify(actual)}`); }
  else { fail++; console.log(`  ✗ ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
}

console.log('=== Test 1: getVideoField 分桶字段名 ===');
check('null → assist_video', videoSvc.getVideoField(null), 'assist_video');
check('undefined → assist_video', videoSvc.getVideoField(undefined), 'assist_video');
check('0 → assist_video_scene_0', videoSvc.getVideoField(0), 'assist_video_scene_0');
check('1 → assist_video_scene_1', videoSvc.getVideoField(1), 'assist_video_scene_1');
check('2 → assist_video_scene_2', videoSvc.getVideoField(2), 'assist_video_scene_2');
check('5 → assist_video_scene_5', videoSvc.getVideoField(5), 'assist_video_scene_5');

console.log('\n=== Test 2: getVideoDebounceKey 防抖 key ===');
check('REQ-X + null → _scene__main', videoSvc.getVideoDebounceKey('REQ-X', null), 'REQ-X_scene__main');
check('REQ-X + 0 → _scene_0', videoSvc.getVideoDebounceKey('REQ-X', 0), 'REQ-X_scene_0');
check('REQ-Y + 1 → _scene_1', videoSvc.getVideoDebounceKey('REQ-Y', 1), 'REQ-Y_scene_1');

console.log('\n=== Test 3: module 导出 ===');
check('getVideoField is function', typeof videoSvc.getVideoField, 'function');
check('getVideoDebounceKey is function', typeof videoSvc.getVideoDebounceKey, 'function');
check('runAssistJob is function', typeof videoSvc.runAssistJob, 'function');
check('queryAssistJob is function', typeof videoSvc.queryAssistJob, 'function');
check('getAssist is function', typeof videoSvc.getAssist, 'function');
check('field = assist_video (向后兼容)', videoSvc.field, 'assist_video');

console.log('\n=== Test 4: 模拟 _attach_to.sceneIdx 解析逻辑 ===');
// 直接复刻 runAssistJob 里的 sceneIdx 解析逻辑验证（因为 runAssistJob 会真调 Agnes API）
function parseSceneIdx(opts) {
  return (opts && opts._attach_to && typeof opts._attach_to.sceneIdx === 'number')
    ? opts._attach_to.sceneIdx : null;
}
check('opts 空 → null', parseSceneIdx({}), null);
check('_attach_to 空 → null', parseSceneIdx({ _attach_to: {} }), null);
check('sceneIdx=0 → 0', parseSceneIdx({ _attach_to: { sceneIdx: 0 } }), 0);
check('sceneIdx=2 → 2', parseSceneIdx({ _attach_to: { sceneIdx: 2 } }), 2);
check('sceneIdx="0" string → null（严格 number 判断）', parseSceneIdx({ _attach_to: { sceneIdx: '0' } }), null);

console.log('\n=== Test 5: 模拟 3 个 scene 同时启动 → 独立字段 ===');
// 模拟 3 个 scene 几乎同时跑 runAssistJob（只测 VIDEO_FIELD，不真的调 API）
const reqId = 'TEST-VIDEO-BUCKET';
const mockReq = { id: reqId };
const scenes = [
  { idx: 0, prompt: 'Scene 0: 办公室早晨' },
  { idx: 1, prompt: 'Scene 1: 同事密谋' },
  { idx: 2, prompt: 'Scene 2: 老板突袭' },
];
const writes = {};  // 模拟 DB 写入
for (const sc of scenes) {
  const opts = { prompt: sc.prompt, _attach_to: { type: 'screenplay', sceneIdx: sc.idx } };
  const sceneIdx = parseSceneIdx(opts);
  const VIDEO_FIELD = videoSvc.getVideoField(sceneIdx);
  writes[VIDEO_FIELD] = { prompt: sc.prompt, status: 'generating', sceneIdx, mock: true };
}
check('scene 0 写到 assist_video_scene_0', writes['assist_video_scene_0']?.prompt, 'Scene 0: 办公室早晨');
check('scene 1 写到 assist_video_scene_1', writes['assist_video_scene_1']?.prompt, 'Scene 1: 同事密谋');
check('scene 2 写到 assist_video_scene_2', writes['assist_video_scene_2']?.prompt, 'Scene 2: 老板突袭');
check('无 scene 写入 assist_video 字段', writes['assist_video'], undefined);

// 模拟 query 各自独立
console.log('\n=== Test 6: 模拟 query 各自独立 ===');
const queries = {};
for (const sc of scenes) {
  const VIDEO_FIELD = videoSvc.getVideoField(sc.idx);
  queries[sc.idx] = writes[VIDEO_FIELD]?.prompt;
}
check('query scene 0 拿到 scene 0 prompt', queries[0], 'Scene 0: 办公室早晨');
check('query scene 1 拿到 scene 1 prompt', queries[1], 'Scene 1: 同事密谋');
check('query scene 2 拿到 scene 2 prompt', queries[2], 'Scene 2: 老板突袭');

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);