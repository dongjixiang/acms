// ============================================================
// test-l6-frame-check.js — v0.22.X L6 闭环验证（单元自测，不依赖真实 LLM）
//   覆盖：
//     ① parseL6CheckResult：干净 / 违规 / 带 ```json 包裹 / 垃圾 / 空
//     ② buildL6CheckPrompt：含 continuity_props 的 [PR_xx] 锚点、空镜分支、缺 props 分支
//   跑法：node server/__tests__/test-l6-frame-check.js
// ============================================================
const assert = require('assert');
const path = require('path');

// 直接从真实模块取（不 mock LLM，只测纯函数）
const screenplay = require('../services/assists/screenplay');

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.error('  ✗', name); }
}

// ---------- parseL6CheckResult ----------
console.log('\n[1] parseL6CheckResult');
const P = screenplay.parseL6CheckResult;

ok(P('').ok === true, '空字符串 → 降级通过');
ok(P(null).ok === true, 'null → 降级通过');
ok(P('我不确定怎么看这个图').ok === true, '非 JSON 废话 → 降级通过');

let r = P('{"violations":[],"ok":true,"reason":"画面干净"}');
ok(r.ok === true && r.violations.length === 0, '干净 JSON → ok:true');

r = P('{"violations":["楼阁","亭子"],"ok":false,"reason":"出现未登记建筑"}');
ok(r.ok === false && r.violations.length === 2, '违规 JSON → ok:false + violations 提取');
ok(r.violations[0] === '楼阁' && r.violations[1] === '亭子', 'violations 顺序保留');

r = P('```json\n{"violations":["塔"],"ok":false}\n```');
ok(r.ok === false && r.violations[0] === '塔', '```json 包裹 → 剥壳解析');

// v0.22.79 新增：解析失败/截断 不再冒充「通过」
r = P('{"violations":["大量樱花树","背景远山","石阶');
ok(r.ok === false && r.violations.length === 3, '截断 JSON → 容错捞出违规项（不再假通过）');
ok(r.degraded === true, '截断容错 → 标 degraded（UI 走灰字而非绿色 ✅）');
r = P('我完全看不懂这张图');
ok(r.ok === true && r.degraded === true, '纯废话 → ok:true 但 degraded:true（不再冒充干净通过）');

// ---------- buildL6CheckPrompt ----------
console.log('\n[2] buildL6CheckPrompt');
const B = screenplay.buildL6CheckPrompt;

// 有 props + 有 location + 有出场人物
let p = B(
  { setting: '初夏江南水乡荷塘', continuity_props: [{ label: '古琴' }, { label: '荇菜' }, { label: '白鹿' }] },
  { scene_location: '荷塘深处' },
  1,
  ['淑女', '君子']
);
ok(/PR_01/.test(p), '含 [PR_01] 锚点');
ok(/PR_02/.test(p), '含 [PR_02] 锚点');
ok(/PR_03/.test(p), '含 [PR_03] 锚点');
ok(p.includes('古琴') && p.includes('荇菜') && p.includes('白鹿'), '锚点带 label 文本');
ok(p.includes('荷塘深处'), '含 scene_location');
ok(p.includes('淑女') && p.includes('君子'), '含出场人物');
ok(/出场人物/.test(p), '有 cast → 用「出场人物」措辞');

// 空镜分支（无 cast）
p = B({ setting: '空山', continuity_props: [] }, { scene_location: '山巅' }, 0, []);
ok(/环境空镜/.test(p), '无 cast → 用「环境空镜」措辞');
ok(!/PR_/.test(p), '无 props → 不含 [PR_xx]');

// 缺 location
p = B({ setting: '城', continuity_props: [{ label: '灯笼' }] }, {}, 0, ['甲']);
ok(!/本场空间/.test(p) || p.includes(''), '缺 scene_location 不崩');
ok(p.includes('灯笼'), '单 prop 锚点正常');

// ---------- v0.22.80 判官判定面收窄（误报修复） ----------
//   背景：判官只拿到「文字白名单 + 首帧图」，看不到参考图 → 把场景基准图自带的
//        樱花林/远山判成「未登记」→ 误报 → 白烧 1-2 轮重生成 + 前端假警报。
//   修法：判定面收窄到 4 类硬伤（建筑 / 现代物件 / 人数 / 前景大件），
//        自然元素（植被、远景地貌）明确豁免。
console.log('\n[2b] buildL6CheckPrompt v0.22.80 收窄判定面');
p = B(
  { setting: '春日河畔', continuity_props: [{ label: '雎鸠鸟' }, { label: '花篮' }] },
  { scene_location: '河中小洲' },
  1,
  ['淑女']
);
ok(/A\. 剧本未登记的建筑/.test(p), '违规清单含 A 类（建筑/构筑物）');
ok(/B\. 时代或场景不符的现代物件/.test(p), '违规清单含 B 类（现代物件）');
ok(/C\. 人物不符/.test(p), '违规清单含 C 类（人数/身份）');
ok(/D\. 前景\/中景新增的大件实体物件/.test(p), '违规清单含 D 类（前景大件）');
ok(/明确豁免/.test(p) && /不得列入 violations/.test(p), '含「明确豁免」段 + 禁止列入 violations');
ok(p.indexOf('明确豁免') < p.indexOf('樱花') && p.indexOf('明确豁免') < p.indexOf('远山'),
   '樱花/远山 出现在豁免段（不再当违规）');
ok(/宁可漏报也不要误报/.test(p), '拿不准 → 宁漏勿误（防误报烧钱）');
ok(!/高频漏报项/.test(p), '旧 v0.22.79 的过严清单已回退（未登记植被/远山不再算违规）');

// ---------- v0.22.83 L6 模式解析（warn 默认 / auto / off） ----------
//   背景：实测「检测到违规自动重画 2 轮」= 1.7x 时间 + 常不收敛；prev-frame A/B 实验又证明
//        单点调参两头不能兼得 → 默认改为 warn（只检测 + 标 ⚠️ + 人决定）。
console.log('\n[2c] resolveL6Mode（v0.22.83）');
ok(typeof screenplay.resolveL6Mode === 'function', 'resolveL6Mode 已导出');
const { collection } = require('../db/connection');
const sc = collection('system_configs');
const hadRow = !!sc.findOne(c => c.key === 'screenplay_l6_mode');
ok(screenplay.resolveL6Mode() === 'warn', '默认（无配置）= warn');
// 写 API 注意：update(predicate, updates) / remove(predicate) —— 不是 id 版（id 版会静默不匹配）
const put = (v) => {
  const ex = sc.findOne(c => c.key === 'screenplay_l6_mode');
  if (ex) sc.update(c => c.key === 'screenplay_l6_mode', { value: v });
  else sc.insert({ key: 'screenplay_l6_mode', value: v, created_at: new Date().toISOString() });
};
put('auto');
ok(screenplay.resolveL6Mode() === 'auto', "DB 配 'auto' → auto（恢复旧行为）");
put('OFF');
ok(screenplay.resolveL6Mode() === 'off', "配置大小写不敏感（'OFF' → off）");
put('乱填的值');
ok(screenplay.resolveL6Mode() === 'warn', '非法值 → 回落 warn（不会因脏配置把功能关掉/开炸）');
// 清理（remove 是 predicate 版）
try { sc.remove(c => c.key === 'screenplay_l6_mode'); } catch (e) { /* ignore */ }
ok(!sc.findOne(c => c.key === 'screenplay_l6_mode'), '测试后已清理配置行（不留脏数据）');

// 前端措辞：warn 模式不能再说"已自动重生成"
const coreSrc = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'client', 'js', 'views', 'assists', 'screenplay-core.js'), 'utf8');
ok(/未自动重画/.test(coreSrc), '前端徽章措辞已改 warn 模式（不再声称已自动重生成）');
ok(!/已自动重生成；若仍存留/.test(coreSrc), '旧的"已自动重生成"措辞已移除');

// ---------- resolveFrameAbsPath（v0.22.79 修：相对 asset_path → 绝对路径） ----------
//   背景：L6 自检曾传相对路径给 vision-service → 按 process.cwd() 解析 → 文件不存在
//        → 每次都「降级通过」，L6 完全空转。此处锁死该回归。
console.log('\n[3] resolveFrameAbsPath');
(async () => {
  const fs = require('fs');
  const pathMod = require('path');
  const compose = require('../services/video-compose');
  const slug = 'agent-buddy-actions';
  const dateStr = new Date().toISOString().slice(0, 10);
  const dir = pathMod.join(compose.WORKSPACE_ROOT, slug, 'assets', dateStr);
  fs.mkdirSync(dir, { recursive: true });
  const fname = `__l6-fixture-${Date.now()}.png`;
  fs.writeFileSync(pathMod.join(dir, fname), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const rel = `assets/${dateStr}/${fname}`;
  const abs = await screenplay.resolveFrameAbsPath(slug, rel, null);
  ok(pathMod.isAbsolute(abs) && fs.existsSync(abs), '相对 asset_path + slug → 绝对路径且存在');
  ok(abs.replace(/\\/g, '/').endsWith(rel), '绝对路径尾部 = 原相对路径');

  const abs2 = await screenplay.resolveFrameAbsPath(slug, abs, null);
  ok(abs2 === abs, '已是绝对路径 → 原样返回（幂等）');

  const missing = await screenplay.resolveFrameAbsPath(slug, 'assets/1970-01-01/nope.png', null);
  ok(!pathMod.isAbsolute(missing) || !fs.existsSync(missing), '不存在的文件 → 不假装成功');

  fs.unlinkSync(pathMod.join(dir, fname));
  console.log(`\n=== L6 自测: ${passed} 通过 / ${failed} 失败 ===`);
  if (failed) process.exit(1);
  else { console.log('ALL PASS ✓'); process.exit(0); }
})();
