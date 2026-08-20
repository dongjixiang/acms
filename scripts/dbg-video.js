// 极简 dbg：直接测 throw 链路
const path = require('path');
const SERVER = path.join(__dirname, '..', 'server');

// 1) 预先 require tool-registry（避免 module cache 错误）
require(SERVER + '/services/tool-registry');

// 2) mock 替换
const resolved = require.resolve(SERVER + '/services/tool-registry');
const fakeTool = {
  name: 'agnes_generate_video',
  handler: async () => ({ error: 'mock err from fakeTool', status_code: 0 }),
};
const old = require.cache[resolved];
require.cache[resolved] = {
  exports: {
    getTool: (n) => { console.log('[mock getTool]', n); return n === 'agnes_generate_video' ? fakeTool : null; },
    registerTool: () => {},
    listTools: () => [{name:'agnes_generate_video'}],
  },
  loaded: true, id: resolved, filename: resolved,
};
console.log('[setup] mock installed. verifying:', require.cache[resolved].exports.getTool('agnes_generate_video')?.name);

// 3) fresh require video.js
delete require.cache[require.resolve(SERVER + '/services/assists/video')];
const videoSvc = require(SERVER + '/services/assists/video');

// 4) 准备 req
const reqStore = require(SERVER + '/stores/requirement-store');
const TEST = 'REQ-DBG-003';
try { reqStore.create({ id: TEST, project_id: 'proj_agent-buddy-actions', title: 'dbg3', description: 'x', priority: 3, type: 'chat', status: 'idea', phase: '孵化' }); } catch {}

// 5) 测试 writeVideoChatEntry（不调 AGNES）
console.log('[test] writeVideoChatEntry...');
try {
  videoSvc.writeVideoChatEntry(TEST, 'loading', { prompt: 'test loading', message: 'test loading msg' });
  console.log('[ok] writeVideoChatEntry loading');
  videoSvc.writeVideoChatEntry(TEST, 'failed', { prompt: 'test loading', error: 'mock fail', message: 'failed msg' });
  console.log('[ok] writeVideoChatEntry failed');
  const req = reqStore.getById(TEST);
  console.log('[raw] req keys:', req ? Object.keys(req).join(',') : 'null');
  console.log('[raw] supplement_history:', req?.supplement_history?.slice(0, 400));
  let sh = []; try { sh = JSON.parse(req.supplement_history || '[]'); } catch (e) { console.log('[raw] sh parse err:', e.message); }
  console.log('[raw] sh array length:', sh.length);
  const vids = sh.filter(e => e.source && String(e.source).startsWith('video_'));
  console.log('[ok] video_ entries:', vids.length);
  vids.forEach((e,i) => console.log(`  [${i}] source=${e.source} text=${e.text.slice(0,120)}`));
} catch (e) {
  console.log('[FAIL] writeVideoChatEntry:', e.message);
}

// 6) 测试 runAssistJob 抛错
console.log('\n[test] runAssistJob (mock AGNES fail)...');
(async () => {
  let threw = false, msg = '';
  try {
    const r = await videoSvc.runAssistJob(TEST, { prompt: 'dbg3', duration: 5 });
    console.log('[unexpected] returned (no throw):', JSON.stringify(r).slice(0, 200));
  } catch (e) {
    console.error(`[dbg] caught error stack:`, e.stack);
    threw = true; msg = e.message;
    console.log('[ok] THREW:', e.message);
  }
  const req = reqStore.getById(TEST);
  let av = null; try { av = JSON.parse(req.assist_video || 'null'); } catch {}
  console.log('[check] DB assist_video status:', av?.status, 'error:', av?.error?.slice(0,100));

  if (old) require.cache[resolved] = old;
  process.exit(0);
})();