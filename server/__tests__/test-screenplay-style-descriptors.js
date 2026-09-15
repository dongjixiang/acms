// 测试: ACMS 剧本艺术风格 descriptors 字段完整性
//   bug 背景: 之前 buildCharacterPrompt/buildScenePrompt/buildSceneVideoPrompt
//   在 Style 行硬编码了"电影感人物肖像/影棚主光/4K 写实"等写实摄影描述，
//   stylePrefix 被直接压过，导致选国风水墨/3D/动漫却出写实图。
//
//   修法: STYLE_TEMPLATES 每种风格加 descriptors 字段（character/scene/video），
//   build 函数查表替换。
//
// 测试目标: 验证 ip-dict.js 的 5 个风格都正确加了 descriptors 字段，且每个风格描述与风格一致。
//
// 用法: node server/__tests__/test-screenplay-style-descriptors.js

const fs = require('fs');
const path = require('path');

const IP_DICT_PATH = path.join(__dirname, '../../client/js/views/assists/ip-dict.js');
const SCREENPLAY_CORE_PATH = path.join(__dirname, '../../client/js/views/assists/screenplay-core.js');
const src = fs.readFileSync(IP_DICT_PATH, 'utf8');
const screenplayCoreSrc = fs.readFileSync(SCREENPLAY_CORE_PATH, 'utf8');

let pass = 0, fail = 0;
function eq(actual, expected, name) {
  const ok = actual === expected;
  console.log((ok ? '  ✓' : '  ✗') + ' ' + name + (ok ? '' : ` : expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`));
  if (ok) pass++; else fail++;
}
function ok(cond, name) {
  console.log((cond ? '  ✓' : '  ✗') + ' ' + name);
  if (cond) pass++; else fail++;
}

// === T1: 5 个风格都存在 ===
const EXPECTED_STYLES = ['photorealistic', "'3d-render'", 'g1_animation', 'anime', 'guofeng'];
console.log('\n=== T1: 5 种艺术风格都在 STYLE_TEMPLATES 里 ===');
EXPECTED_STYLES.forEach(style => {
  const re = new RegExp(`^\\s*${style}:\\s*\\{`, 'm');
  ok(re.test(src), `风格 ${style.replace(/'/g, '')} 定义存在`);
});

// === T2: 5 个风格都有 descriptors 字段 ===
console.log('\n=== T2: 5 种风格都加了 descriptors 字段 ===');
EXPECTED_STYLES.forEach(style => {
  // 匹配风格块到下一个 "};" 之间的 descriptors: { ... }
  const blockRe = new RegExp(`${style}:\\s*\\{[\\s\\S]*?descriptors:\\s*\\{`, 'm');
  ok(blockRe.test(src), `${style.replace(/'/g, '')}.descriptors 字段存在`);
});

// === T3: 每种风格的 descriptors 都含 6 个子字段 ===
console.log('\n=== T3: 每种风格 descriptors 都含 6 个子字段 ===');
const REQUIRED_FIELDS = ['character', 'characterQuality', 'scene', 'sceneQuality', 'video', 'videoQuality'];
function extractStyleBlock(style) {
  const styleStart = src.indexOf(`${style}:`);
  if (styleStart < 0) return '';
  // 大括号配对找风格块结束
  let depth = 0, i = src.indexOf('{', styleStart), endIdx = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
  }
  return src.slice(styleStart, endIdx + 1);
}
function extractDescriptorsBlock(style) {
  const block = extractStyleBlock(style);
  const descStart = block.indexOf('descriptors:');
  if (descStart < 0) return '';
  let depth = 0, i = block.indexOf('{', descStart), endIdx = -1;
  for (; i < block.length; i++) {
    if (block[i] === '{') depth++;
    else if (block[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
  }
  return block.slice(descStart, endIdx + 1);
}
EXPECTED_STYLES.forEach(style => {
  const descBlock = extractDescriptorsBlock(style);
  REQUIRED_FIELDS.forEach(field => {
    const fieldRe = new RegExp(`\\b${field}:\\s*['"]`);
    ok(fieldRe.test(descBlock), `${style.replace(/'/g, '')}.descriptors.${field} 存在`);
  });
});

// === T4: 每种风格的 descriptors 内容与风格匹配（关键回归测试） ===
console.log('\n=== T4: 5 种风格的 descriptors 内容与风格匹配 ===');
const STYLE_KEYWORDS = {
  photorealistic: { character: '电影感', scene: '电影感建立', video: '电影感' },
  '3d-render':    { character: '3D',     scene: '3D',          video: '3D' },
  g1_animation:   { character: '80/90',  scene: '80/90',       video: '卡通动画' },
  anime:          { character: '日漫',   scene: '日漫',        video: '日漫动画' },
  guofeng:        { character: '水墨',   scene: '水墨山水',    video: '水墨动画' },
};
Object.entries(STYLE_KEYWORDS).forEach(([style, fields]) => {
  // 抽出风格块（简化版：用 lazy match）
  const styleStart = src.indexOf(`${style}:`);
  if (styleStart < 0) return;
  // 找到 descriptors: { 起点
  const descStart = src.indexOf('descriptors:', styleStart);
  if (descStart < 0) return;
  // 找 descriptors 块的结束：descriptors: { ... } 配对
  let depth = 0, i = src.indexOf('{', descStart), endIdx = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
  }
  const descBlock = src.slice(descStart, endIdx + 1);
  Object.entries(fields).forEach(([field, keyword]) => {
    const fieldRe = new RegExp(`${field}:\\s*'[^']*${keyword}[^']*'`);
    ok(fieldRe.test(descBlock), `${style} descriptors.${field} 含 "${keyword}"`);
  });
});

// === T5: video 描述含 $TS$ 占位符 ===
console.log('\n=== T5: video 描述含 $TS$ 占位符（buildSceneVideoPrompt 会替换）===');
EXPECTED_STYLES.forEach(style => {
  const styleStart = src.indexOf(`${style}:`);
  if (styleStart < 0) return;
  const descStart = src.indexOf('descriptors:', styleStart);
  if (descStart < 0) return;
  let depth = 0, i = src.indexOf('{', descStart), endIdx = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
  }
  const descBlock = src.slice(descStart, endIdx + 1);
  const videoMatch = descBlock.match(/video:\s*'([^']*)'/);
  if (videoMatch) {
    ok(videoMatch[1].includes('$TS$'), `${style} descriptors.video 含 $TS$`);
  }
});

// === T6: 注入 sp.art_style = data.art_style 逻辑存在 ===
//   防止"sp 是 screenplay 数组元素没 art_style，导致 build 函数 L47 fallback 永远 photorealistic"bug
console.log('\n=== T6: renderSelectedScreenplay 注入 sp.art_style 逻辑存在 ===');
ok(/sp\.art_style\s*=\s*data\.art_style/.test(screenplayCoreSrc), 'sp.art_style = data.art_style 注入语句存在');
ok(/function\s+renderSelectedScreenplay/.test(screenplayCoreSrc), 'renderSelectedScreenplay 函数存在');

// === T7: renderFromChatEntry 也要带 art_style（chat 流路径） ===
//   之前漏了 → chat 流打开剧本 → buildCharacterPrompt 永远 fallback photorealistic
console.log('\n=== T7: renderFromChatEntry 把 art_style 写入 data ===');
ok(/function\s+renderFromChatEntry/.test(screenplayCoreSrc), 'renderFromChatEntry 函数存在');
ok(/art_style:\s*card\.art_style/.test(screenplayCoreSrc), 'renderFromChatEntry 读 card.art_style 写入 data');

// === T8: server writeScreenplayChatEntry 写入 card.art_style（server 端） ===
//   修复 chat 流路径：card 之前没 art_style 字段，renderFromChatEntry 拿不到
console.log('\n=== T8: server writeScreenplayChatEntry 把 art_style 写入 card ===');
const SCREENPLAY_SERVER_PATH = path.join(__dirname, '../services/assists/screenplay.js');
const screenplayServerSrc = fs.readFileSync(SCREENPLAY_SERVER_PATH, 'utf8');
ok(/function\s+writeScreenplayChatEntry/.test(screenplayServerSrc), 'writeScreenplayChatEntry 函数存在');
ok(/art_style:\s*currentAssist\?\.art_style/.test(screenplayServerSrc), 'card 构造里 art_style: currentAssist?.art_style 存在');

// === T9: server schema scene 加 characters 字段（防止生图 LLM 脑补人物） ===
console.log('\n=== T9: server schema scene 加 characters 字段 + 解析保留 ===');
ok(/scenes:\s*\[\{[^}]*characters[^}]*\}\]/.test(screenplayServerSrc) ||
   /scenes:\s*\[\{characters,\s*time/.test(screenplayServerSrc),
   'server schema L37 scene 包含 characters 字段');
ok(/characters:\s*Array\.isArray\(sc\.characters\)/.test(screenplayServerSrc),
   'server scene 解析保留 characters 字段');

// === T10: client buildSceneVideoPrompt 注入角色 desc（兜底旧剧本） ===
console.log('\n=== T10: client buildSceneVideoPrompt 注入场景角色 desc ===');
ok(/function\s+buildSceneVideoPrompt/.test(screenplayCoreSrc), 'buildSceneVideoPrompt 函数存在');
ok(/scene\.characters/.test(screenplayCoreSrc), 'buildSceneVideoPrompt 读 scene.characters');
ok(/出场人物/.test(screenplayCoreSrc), 'buildSceneVideoPrompt 注入 "出场人物：..." 行');
ok(/allChars\.find\(c\s*=>\s*c\.name\s*===\s*name\)/.test(screenplayCoreSrc),
  'buildSceneVideoPrompt 从 sp.characters 按 name 查 desc');

// === 总结 ===
console.log(`\n=== 结果：${pass}/${pass + fail} 通过 ===`);
if (fail > 0) {
  console.error(`\n失败项: ${fail}`);
  process.exit(1);
}
process.exit(0);
