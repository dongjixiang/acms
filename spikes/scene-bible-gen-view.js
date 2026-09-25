// ============================================================
// spikes/scene-bible-gen-view.js — 场景圣经多视角 E2E（生成一个机位图并写入 assets）
//   用真 client 的 buildScenePrompt(sp, ts, style, view) 出 prompt（vm 载 ip-dict + screenplay-core），
//   再走 image-tools-service.coreGenerate 生成，最后 svc.setAsset 写进 assets.scenes['0#<view>']
//   run: node spikes/scene-bible-gen-view.js <REQ> <view>   （view = wide|medium|close）
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const reqStore = require('../server/stores/requirement-store');
const svc = require('../server/services/assists/screenplay');
const imageSvc = require('../server/services/image-tools-service');

const REQ = process.argv[2] || 'REQ-MT4D51CF';
const VIEW = process.argv[3] || 'close';
const slug = 'agent-buddy-actions';

const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sandbox = { console, escHtml, document: { getElementById: () => null }, window: {} };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'client', 'js', 'views', 'assists', 'ip-dict.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'client', 'js', 'views', 'assists', 'screenplay-core.js'), 'utf8'), sandbox);
const card = sandbox.window.ACMSScreenplayCard;

(async () => {
  const req = reqStore.getById(REQ);
  const assist = JSON.parse(req.assist_screenplay);
  const sp = assist.screenplays[Number.isInteger(assist.picked) ? assist.picked : 0];
  const prompt = card.buildScenePrompt(sp, sp.target_seconds || assist.target_seconds, sp.art_style, VIEW);
  console.log(`REQ=${REQ} view=${VIEW} prompt ${prompt.length} 字`);
  console.log('  含「场景圣经·' + ({ wide: '全景', medium: '中景', close: '特写' }[VIEW]) + '机位」:', /场景圣经·/.test(prompt));

  console.log('生成中…');
  const t0 = Date.now();
  const genR = await imageSvc.coreGenerate({
    prompt, size: '1K', n: 1, projectSlug: slug, targetWidth: 1920, targetHeight: 1080,
  });
  if (!genR || !genR.ok) { console.error('生成失败:', (genR && genR.error) || '未知'); process.exit(2); }
  console.log(`完成 ${((Date.now() - t0) / 1000).toFixed(1)}s → ${(genR.options[0].asset_path || '').slice(-26)}`);

  const r = svc.setAsset(REQ, {
    asset_type: 'scene', asset_key: `0#${VIEW}`, options: genR.options, picked_idx: 0,
  });
  console.log('setAsset:', r ? 'OK' : 'null');

  const after = JSON.parse(reqStore.getById(REQ).assist_screenplay);
  const slot = after.assets.scenes[`0#${VIEW}`];
  console.log('DB 校验: 键存在 =', !!slot, '| asset_path =', (slot && slot.asset_path || '').slice(-20));
  console.log('现有场景键:', Object.keys(after.assets.scenes));
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
setTimeout(() => { console.error('FORCE_TIMEOUT'); process.exit(3); }, 240000);
