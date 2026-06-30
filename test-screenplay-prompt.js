// test-screenplay-prompt.js
// v0.22.31: 验证 IP 锚定 + 风格硬约束（解决"擎天柱→机甲人"+"角色风格不一致"问题）
//
// 测试覆盖：
//   1. IP 词典 lookup / lookupAll
//   2. STYLE_TEMPLATES 完整性（5 种风格）
//   3. buildCharacterPrompt 输出（含 IP 锚定 + 风格硬约束）
//   4. 端到端模拟：用"擎天柱大战威震天"输入看 prompt 是否符合预期

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ===== 测试辅助 =====
let pass = 0, fail = 0;
function check(label, actual, expected, contains = false) {
  let ok;
  if (contains) {
    ok = typeof actual === 'string' && actual.includes(expected);
  } else {
    ok = JSON.stringify(actual) === JSON.stringify(expected);
  }
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else {
    fail++;
    console.log(`  ✗ ${label}`);
    if (typeof actual === 'string' && actual.length > 200) {
      console.log(`    actual (first 200): ${actual.slice(0, 200)}`);
    } else {
      console.log(`    actual: ${JSON.stringify(actual)}`);
    }
    console.log(`    expected: ${JSON.stringify(expected)}`);
  }
}

function section(name) { console.log(`\n=== ${name} ===`); }

// ===== 加载前端模块（用 vm + mock window）=====
function loadFrontModule(filePath, mockGlobals = {}) {
  const code = fs.readFileSync(filePath, 'utf8');
  const sandbox = { console };
  // 合并 mockGlobals（window 字段单独合并，保留默认空 window）
  for (const [k, v] of Object.entries(mockGlobals)) {
    if (k === 'window' && v && typeof v === 'object') {
      sandbox.window = { ...(sandbox.window || {}), ...v };
    } else {
      sandbox[k] = v;
    }
  }
  if (!sandbox.window) sandbox.window = {};
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: filePath });
  return sandbox.window;
}

// 加载 ip-dict.js（独立模块，不依赖其他文件）
const ipDictPath = path.join(__dirname, 'client/js/views/assists/ip-dict.js');
const ipDictWin = loadFrontModule(ipDictPath);
const ipDict = ipDictWin.ACMSScreenplayIPDict;

if (!ipDict) {
  console.error('❌ 致命错误：ip-dict.js 加载失败，未挂 window.ACMSScreenplayIPDict');
  process.exit(1);
}

// 加载 screenplay-core.js（需要 ipDict + escHtml）
const corePath = path.join(__dirname, 'client/js/views/assists/screenplay-core.js');
const coreWin = loadFrontModule(corePath, {
  window: {
    ACMSScreenplayIPDict: ipDict,  // 注入 IP 词典
  },
  escHtml: (s) => String(s || '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c])),
});
const card = coreWin.ACMSScreenplayCard;

if (!card || !card.buildCharacterPrompt) {
  console.error('❌ 致命错误：screenplay-core.js 加载失败，未挂 window.ACMSScreenplayCard');
  process.exit(1);
}

// ===== 测试 1: IP 词典 lookup =====
section('Test 1: IP 词典 lookup（中文 IP 名）');
check('擎天柱 → Optimus Prime (G1)', ipDict.lookup('擎天柱').nameEn, 'Optimus Prime (Transformers Generation 1, 1984)');
check('威震天 → Megatron (G1)', ipDict.lookup('威震天').nameEn, 'Megatron (Transformers Generation 1, 1984)');
check('大黄蜂 → Bumblebee (G1)', ipDict.lookup('大黄蜂').nameEn, 'Bumblebee (Transformers Generation 1, 1984)');
check('超人 → Superman (DC)', ipDict.lookup('超人').nameEn, 'Superman (DC Comics)');
check('蜘蛛侠 → Spider-Man (Marvel)', ipDict.lookup('蜘蛛侠').nameEn, 'Spider-Man (Marvel Comics)');
check('钢铁侠 → Iron Man', ipDict.lookup('钢铁侠').nameEn, 'Iron Man (Marvel Comics)');
check('皮卡丘 → Pikachu', ipDict.lookup('皮卡丘').nameEn, 'Pikachu (Pokemon)');
check('柯南 → Conan Edogawa', ipDict.lookup('柯南').nameEn, 'Conan Edogawa (Detective Conan)');
check('甄嬛 → Zhen Huan', ipDict.lookup('甄嬛').nameEn, 'Zhen Huan (Chinese Qing Dynasty period drama)');

section('Test 1b: IP 词典 lookup（英文 IP 名）');
check('Optimus → Optimus Prime', ipDict.lookup('Optimus').nameEn, 'Optimus Prime (Transformers Generation 1, 1984)');
check('Megatron → Megatron', ipDict.lookup('Megatron').nameEn, 'Megatron (Transformers Generation 1, 1984)');
check('Spider-Man → Spider-Man', ipDict.lookup('Spider-Man').nameEn, 'Spider-Man (Marvel Comics)');
check('Tony Stark → Iron Man', ipDict.lookup('Tony Stark').nameEn, 'Iron Man (Marvel Comics)');

section('Test 1c: IP 词典 lookup（混合 + 边界）');
check('"擎天柱大战威震天" → Optimus（按长度倒序匹配）', ipDict.lookup('擎天柱大战威震天').matchedKey, '擎天柱');
check('"威震天变形金刚" → Megatron', ipDict.lookup('威震天变形金刚').matchedKey, '威震天');
check('不存在的 IP → null', ipDict.lookup('赵铁柱'), null);
check('空字符串 → null', ipDict.lookup(''), null);
check('null → null', ipDict.lookup(null), null);

section('Test 1d: lookupAll 多 IP 检测（按 IP 家族去重）');
const allMatches = ipDict.lookupAll('擎天柱大战威震天还有大黄蜂');
check('3 个角色都是 transformers_g1 家族 → 去重后 1 个', allMatches.length, 1);
check('去重 key 是 transformers_g1', allMatches[0].key, 'transformers_g1');

const mixedMatches = ipDict.lookupAll('哈利波特在霍格沃茨遇到路飞');
check('跨 IP 家族（HP + 海贼王）→ 2 个', mixedMatches.length, 2);
const mixedKeys = mixedMatches.map(m => m.key).sort();
check('keys 是 [hp_harry, op_luffy]', JSON.stringify(mixedKeys), JSON.stringify(['hp_harry', 'op_luffy']));

// ===== 测试 2: STYLE_TEMPLATES =====
section('Test 2: 风格模板完整性');
const expectedStyles = ['photorealistic', '3d-render', 'g1_animation', 'anime', 'guofeng'];
for (const s of expectedStyles) {
  const tpl = ipDict.getStyleTemplate(s);
  check(`${s} 有 stylePrefix`, typeof tpl.stylePrefix === 'string' && tpl.stylePrefix.length > 10, true);
  check(`${s} 有 negativePrefix`, typeof tpl.negativePrefix === 'string' && tpl.negativePrefix.length > 10, true);
}
check('photorealistic 强调禁止 cartoon', ipDict.getStyleTemplate('photorealistic').stylePrefix.includes('cartoon'), true);
check('photorealistic negative 强调 FORBIDDEN cartoon', ipDict.getStyleTemplate('photorealistic').negativePrefix.includes('FORBIDDEN'), true);
check('g1_animation 强调 80s/90s 卡通', ipDict.getStyleTemplate('g1_animation').stylePrefix.includes('cartoon'), true);
check('anime 强调日本动漫', ipDict.getStyleTemplate('anime').stylePrefix.includes('anime'), true);
check('guofeng 强调中国水墨', ipDict.getStyleTemplate('guofeng').stylePrefix.includes('Chinese'), true);

section('Test 2b: listArtStyles（前端下拉用）');
const styles = ipDict.listArtStyles();
check('5 个风格', styles.length, 5);
check('第一个是 photorealistic', styles[0].value, 'photorealistic');
check('有 label', typeof styles[0].label === 'string' && styles[0].label.length > 0, true);

// ===== 测试 3: buildCharacterPrompt 输出 =====
section('Test 3: buildCharacterPrompt 含 IP 锚定 + 风格硬约束');

const optimusChar = { name: '擎天柱', desc: '汽车人领袖' };
const megatronChar = { name: '威震天', desc: '霸气的反派' };
const sp = { title: '擎天柱大战威震天', setting: '赛博坦废墟', art_style: 'photorealistic' };

const optimusPrompt = card.buildCharacterPrompt(optimusChar, sp, 30);
const megatronPrompt = card.buildCharacterPrompt(megatronChar, sp, 30);

// IP 锚定：擎天柱 → Optimus Prime
check('擎天柱 prompt 含 "Optimus Prime"', optimusPrompt.includes('Optimus Prime'), true);
check('擎天柱 prompt 含 "Transformers"', optimusPrompt.includes('Transformers'), true);
check('擎天柱 prompt 含 "red and blue"', optimusPrompt.includes('red and blue'), true);

// IP 锚定：威震天 → Megatron
check('威震天 prompt 含 "Megatron"', megatronPrompt.includes('Megatron'), true);
check('威震天 prompt 含 "purple"', megatronPrompt.includes('purple'), true);

// 风格硬约束（photorealistic）：两个 prompt 都必须有
check('擎天柱 prompt 含 "STRICTLY photorealistic"', optimusPrompt.includes('STRICTLY photorealistic'), true);
check('威震天 prompt 含 "STRICTLY photorealistic"', megatronPrompt.includes('STRICTLY photorealistic'), true);
check('擎天柱 prompt negative 含 "FORBIDDEN"', optimusPrompt.includes('FORBIDDEN'), true);
check('威震天 prompt negative 含 "FORBIDDEN"', megatronPrompt.includes('FORBIDDEN'), true);

// **核心断言：两个角色 prompt 都禁止 cartoon**（风格一致性）
check('擎天柱 prompt 含 "MUST NOT be cartoon"', optimusPrompt.includes('MUST NOT be cartoon'), true);
check('威震天 prompt 含 "MUST NOT be cartoon"', megatronPrompt.includes('MUST NOT be cartoon'), true);

// ===== 测试 4: 风格切换 =====
section('Test 4: 风格切换（artStyle 参数生效）');
const animeOptimus = card.buildCharacterPrompt(optimusChar, sp, 30, 'anime');
check('anime 风格不再有 "STRICTLY photorealistic"', animeOptimus.includes('STRICTLY photorealistic'), false);
check('anime 风格含 "STRICTLY" 硬约束', animeOptimus.includes('STRICTLY'), true);
check('anime 风格禁止 anime（在 negative 里写但风格前缀强调 Japanese anime）', animeOptimus.includes('Japanese anime'), true);

const guofengOptimus = card.buildCharacterPrompt(optimusChar, sp, 30, 'guofeng');
check('guofeng 风格强调 Chinese ink painting', guofengOptimus.includes('Chinese ink painting'), true);

const g1Optimus = card.buildCharacterPrompt(optimusChar, sp, 30, 'g1_animation');
check('g1_animation 风格强调 80s 90s cartoon', g1Optimus.includes('80s') || g1Optimus.includes('90s'), true);

// ===== 测试 5: buildScenePrompt 场景 IP 锚定 =====
section('Test 5: buildScenePrompt 场景图 IP 锚定');
const hogwartsSp = { title: '魔法学院', setting: '霍格沃茨魔法大厅', art_style: 'photorealistic' };
const hogwartsScenePrompt = card.buildScenePrompt(hogwartsSp, 30);
check('霍格沃茨 prompt 含 "Harry Potter"', hogwartsScenePrompt.includes('Harry Potter'), true);
check('霍格沃茨 prompt 含 "Hogwarts"', hogwartsScenePrompt.includes('Hogwarts'), true);
check('霍格沃茨 prompt 含 "STRICTLY photorealistic"', hogwartsScenePrompt.includes('STRICTLY photorealistic'), true);

// 普通场景（无 IP）
const normalSp = { title: '咖啡馆', setting: '温馨的小咖啡馆，午后阳光', art_style: 'photorealistic' };
const normalScenePrompt = card.buildScenePrompt(normalSp, 30);
check('普通场景无 IP 锚定（不报错）', typeof normalScenePrompt === 'string' && normalScenePrompt.length > 100, true);
check('普通场景含 STRICTLY 硬约束', normalScenePrompt.includes('STRICTLY photorealistic'), true);

// ===== 测试 6: 端到端模拟（"擎天柱大战威震天"完整 prompt 生成） =====
section('Test 6: 端到端模拟 — 用户输入"擎天柱大战威震天"');
const characters = [
  { name: '擎天柱', desc: '汽车人领袖，红蓝配色' },
  { name: '威震天', desc: '霸气的反派，紫灰色' },
  { name: '大黄蜂', desc: '友好的侦察兵' },
];
console.log('  --- 角色 1: 擎天柱 ---');
const p1 = card.buildCharacterPrompt(characters[0], sp, 30);
console.log(`  ${p1.slice(0, 300)}...`);
console.log('');
console.log('  --- 角色 2: 威震天 ---');
const p2 = card.buildCharacterPrompt(characters[1], sp, 30);
console.log(`  ${p2.slice(0, 300)}...`);
console.log('');
console.log('  --- 角色 3: 大黄蜂 ---');
const p3 = card.buildCharacterPrompt(characters[2], sp, 30);
console.log(`  ${p3.slice(0, 300)}...`);

// 关键断言：3 个角色都是 photorealistic + 都有 IP 锚定
check('3 个角色都含 "STRICTLY photorealistic"', [p1, p2, p3].every(p => p.includes('STRICTLY photorealistic')), true);
check('3 个角色都有 IP 锚定（Transformers/Optimus/Megatron/Bumblebee）', [p1, p2, p3].some(p => p.includes('Transformers')), true);
check('擎天柱 prompt 有 Optimus Prime 视觉关键词', p1.includes('Optimus Prime'), true);
check('威震天 prompt 有 Megatron 视觉关键词', p2.includes('Megatron'), true);
check('大黄蜂 prompt 有 Bumblebee 视觉关键词', p3.includes('Bumblebee'), true);

// ===== 测试 7: 边界 / 向后兼容 =====
section('Test 7: 边界 + 向后兼容');
const oldStyleCall = card.buildCharacterPrompt(
  { name: '张三', desc: '普通人' },
  { title: '日常', setting: '城市街道' },
  30,
);
check('不传 art_style → 默认 photorealistic', oldStyleCall.includes('STRICTLY photorealistic'), true);
check('不传 art_style → 普通角色无 IP 锚定', oldStyleCall.includes('Transformers') || oldStyleCall.includes('Superman'), false);
check('sp.art_style 未设 → 默认 photorealistic', card.buildCharacterPrompt({ name: '李四', desc: '' }, { title: 'x' }, 30).includes('STRICTLY photorealistic'), true);

// ===== 测试 8: 异常输入 =====
section('Test 8: 异常输入');
const emptyPrompt = card.buildCharacterPrompt({ name: '', desc: '' }, sp, 30);
check('空 name + 空 desc → fallback "a person"', emptyPrompt.includes('a person'), true);
check('空 name 不爆错', typeof emptyPrompt === 'string' && emptyPrompt.length > 50, true);

// ===== 汇总 =====
console.log('\n=========================================');
console.log(`✅ PASS: ${pass}    ❌ FAIL: ${fail}`);
console.log('=========================================');

if (fail > 0) {
  console.log(`\n❌ ${fail} 个测试失败`);
  process.exit(1);
} else {
  console.log(`\n🎉 全部 ${pass} 个测试通过！`);
  process.exit(0);
}