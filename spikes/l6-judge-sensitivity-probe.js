// L6 检测器灵敏度实测：把「已知有问题」的旧首帧图喂进去，看它能不能抓出来
//   不生成新图、不改任何数据，只调 vision 自检
const fs = require('fs');
const path = require('path');
const screenplay = require('../server/services/assists/screenplay');
const reqStore = require('../server/stores/requirement-store');

const DIR = path.join(__dirname, '..', 'workspaces', 'agent-buddy-actions', 'assets', '2026-09-25');
const req = reqStore.getById('REQ-MUGOR3KP');
const assist = JSON.parse(req.assist_screenplay);
const sp = assist.screenplays[assist.picked || 0];
const scene = sp.scenes[1];
const castNames = (scene.characters && scene.characters.length) ? scene.characters : ['淑女'];

const files = fs.readdirSync(DIR)
  .filter(f => f.startsWith('电影感写实画面：春日河畔') && f.endsWith('.png'))
  .map(f => ({ f, m: fs.statSync(path.join(DIR, f)).mtimeMs }))
  .sort((a, b) => a.m - b.m);

const candidates = process.argv[2] ? files.filter(x => x.f.includes(process.argv[2])) : files;
console.log(`候选首帧图 ${files.length} 张，本次测 ${candidates.length} 张\n`);

(async () => {
  for (const c of candidates) {
    const t = new Date(c.m).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const r = await screenplay.runL6FrameCheck('REQ-MUGOR3KP', sp, scene, 1, castNames, 'assets/2026-09-25/' + c.f, 'agent-buddy-actions');
    console.log('─'.repeat(70));
    console.log('图:', c.f.slice(-20), '| 生成于', t);
    console.log('结果: ok=' + r.ok, '| violations=' + JSON.stringify(r.violations));
    console.log('理由:', (r.reason || '').slice(0, 300));
  }
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
setTimeout(() => { console.error('FORCE_TIMEOUT'); process.exit(3); }, 240000);
