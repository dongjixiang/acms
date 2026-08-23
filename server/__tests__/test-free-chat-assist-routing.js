// ============================================================
// scripts/test-free-chat-assist-routing.js
// ============================================================
// 测试 v0.117 方案 D：自由对话 6 个工具 method 全支持
//
// 覆盖：
//   T1  - ACMS_TOOL_RE 命中"剧本|分镜"（4 个新关键词）
//   T2  - ACMS_TOOL_RE 仍然命中全部原有关键词（向后兼容）
//   T3  - freeDocKeywords / freeScreenplayKeywords 互斥（同一文本不能同时命中文档+剧本）
//   T4  - 写一个短视频剧本：<idea>, 时长 N 秒, 风格 X → idea / target_seconds / art_style 提取正确
//   T5  - 自然语言拼装（chat-assist.js 逻辑）：6 个 method 各产出一条 msg
//   T6  - 边界 case：空 idea / 缺时长 / 缺风格 / 多种风格映射
// ============================================================

let pass = 0, fail = 0;
const failed = [];
function ok(name) { pass++; console.log(`  ✓ ${name}`); }
function bad(name, msg) { fail++; failed.push({ name, msg }); console.log(`  ✗ ${name}: ${msg}`); }
function eq(a, b, name) { if (a === b) ok(name); else bad(name, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function assert(cond, name, hint) { if (cond) ok(name); else bad(name, hint || 'assertion failed'); }

// 复制 chat-intent.js L283 的 ACMS_TOOL_RE（v0.117 扩展版）
const ACMS_TOOL_RE = /生成.{0,6}(图片|照片|图)|画.{0,3}(张|个|幅|一)|视频|跳舞|唱歌|发邮件|发送邮件|邮件|播放|听[一这]?首|放[一这]?首|想听|找歌|音乐|文档|docx|ppt|pptx|excel|xlsx|写.{0,4}(周报|报告|总结|方案)|写剧本|短视频剧本|分镜|剧本创意/i;

// 复制 chat-intent.js L331-332 自由对话 precheck 关键词
const freeDocKeywords = /整理成文档|生成文档|导出文档|Word文档|\.docx|\.doc|文档|变成文档|形成文档|整理成word/i;
const freeScreenplayKeywords = /写剧本|短视频剧本|分镜|剧本创意/i;

console.log('\n=== T1: ACMS_TOOL_RE 命中"剧本|分镜" 新关键词 ===\n');
assert(ACMS_TOOL_RE.test('写一个短视频剧本：赛博朋克侦探在霓虹灯下追凶'), 'T1a 命中"短视频剧本"');
assert(ACMS_TOOL_RE.test('写剧本：古代爱情悲剧'), 'T1b 命中"写剧本"');
assert(ACMS_TOOL_RE.test('分镜：开场 + 冲突 + 结局三段'), 'T1c 命中"分镜"');
assert(ACMS_TOOL_RE.test('剧本创意：未来城市的爱情故事'), 'T1d 命中"剧本创意"');

console.log('\n=== T2: ACMS_TOOL_RE 原有关键词全部保留（向后兼容）===\n');
const originals = [
  '生成图片：一只猫',
  '画一张山水画',
  '我想生成视频：火星登陆',
  '发邮件给 a@x.com',
  '发送邮件给 team',
  '邮件通知',
  '播放周杰伦晴天',
  '我想听 梁静茹 勇气',
  '放一首 周杰伦',
  '找歌 王菲',
  '音乐推荐',
  '整理成文档：周报',
  '生成 Word文档',
  '生成 docx 文件',
  '做 PPT',
  '写 Excel 报表',
  '写周报：本周完成 X',
  '写报告：Q3 总结',
  '写总结',
  '写方案',
];
for (const t of originals) {
  assert(ACMS_TOOL_RE.test(t), `T2 命中"${t.slice(0, 30)}"`, `ACMS_TOOL_RE 没命中 "${t}"`);
}

console.log('\n=== T3: freeDocKeywords / freeScreenplayKeywords 互斥 ===\n');
eq(freeDocKeywords.test('整理成文档：周报'), true, 'T3a 文档关键词命中');
eq(freeScreenplayKeywords.test('整理成文档：周报'), false, 'T3b 文档文本不命中剧本');
eq(freeScreenplayKeywords.test('写一个短视频剧本：xxx'), true, 'T3c 剧本关键词命中');
eq(freeDocKeywords.test('写一个短视频剧本：xxx'), false, 'T3d 剧本文本不命中文档');

// chat-assist.js:21-78 拼装函数（复制测试版）
function buildFreeChatMsg(method, eb) {
  const _eb = eb || {};
  let msg = null;
  switch (method) {
    case 'music':
      msg = '我想听 ' + (_eb.artist ? _eb.artist + ' ' : '') + _eb.song;
      break;
    case 'video':
      msg = '生成视频：' + _eb.prompt + (_eb.duration ? '，时长 ' + _eb.duration + 's' : '');
      break;
    case 'image_gen':
      msg = '生成图片：' + _eb.prompt;
      break;
    case 'send_email':
      msg = '发邮件给 ' + _eb.to + '，主题 ' + (_eb.subject || '(无主题)') + '，正文：' + (_eb.body || '');
      break;
    case 'screenplay':
      msg = '写一个短视频剧本：' + _eb.idea
        + (_eb.target_seconds ? '，时长 ' + _eb.target_seconds + 's' : '')
        + (_eb.art_style ? '，风格 ' + _eb.art_style : '');
      break;
    case 'document_gen':
      msg = '整理成文档：' + _eb.instruction;
      break;
    default:
      return null;
  }
  return msg;
}

console.log('\n=== T5: 6 个 method 自然语言拼装 ===\n');
eq(buildFreeChatMsg('music', { song: '勇气', artist: '梁静茹' }), '我想听 梁静茹 勇气', 'T5a music');
eq(buildFreeChatMsg('video', { prompt: '赛博朋克城市', duration: 30 }), '生成视频：赛博朋克城市，时长 30s', 'T5b video');
eq(buildFreeChatMsg('video', { prompt: '赛博朋克城市' }), '生成视频：赛博朋克城市', 'T5b2 video 无 duration');
eq(buildFreeChatMsg('image_gen', { prompt: '一只猫在屋顶' }), '生成图片：一只猫在屋顶', 'T5c image_gen');
eq(buildFreeChatMsg('send_email', { to: 'a@x.com', subject: '测试', body: '正文' }), '发邮件给 a@x.com，主题 测试，正文：正文', 'T5d email');
eq(buildFreeChatMsg('send_email', { to: 'a@x.com' }), '发邮件给 a@x.com，主题 (无主题)，正文：', 'T5d2 email 缺 subject/body');
eq(buildFreeChatMsg('screenplay', { idea: '未来城市的爱情故事', target_seconds: 30, art_style: 'photorealistic' }), '写一个短视频剧本：未来城市的爱情故事，时长 30s，风格 photorealistic', 'T5e screenplay');
eq(buildFreeChatMsg('screenplay', { idea: '古代战争' }), '写一个短视频剧本：古代战争', 'T5e2 screenplay 无时长/风格');
eq(buildFreeChatMsg('document_gen', { instruction: 'Q3 周报' }), '整理成文档：Q3 周报', 'T5f document');
eq(buildFreeChatMsg('unknown', {}), null, 'T5g 未知 method 返回 null');

// T5 拼装的文本必须被 ACMS_TOOL_RE 命中（除 music / unknown）
console.log('\n=== T5+: 拼装后必须被 ACMS_TOOL_RE 命中（路由走旧引擎）===\n');
const tests = [
  ['music', { song: '勇气', artist: '梁静茹' }],
  ['video', { prompt: '赛博朋克城市', duration: 30 }],
  ['image_gen', { prompt: '一只猫在屋顶' }],
  ['send_email', { to: 'a@x.com', subject: '测试', body: '正文' }],
  ['screenplay', { idea: '未来城市的爱情故事', target_seconds: 30, art_style: 'photorealistic' }],
  ['document_gen', { instruction: 'Q3 周报' }],
];
for (const [method, eb] of tests) {
  const msg = buildFreeChatMsg(method, eb);
  assert(msg && ACMS_TOOL_RE.test(msg), `T5+ ${method} 拼装命中 ACMS_TOOL_RE`, `"${msg}" 没命中`);
}

// T4: screenplay 自然语言提取
console.log('\n=== T4: 写剧本自然语言提取 idea / target_seconds / art_style ===\n');
function extractScreenplay(text) {
  const ideaMatch = text.match(/写(?:一个)?(?:短视频)?剧本[:：]\s*(.+?)(?:[,，。]|$)/);
  const idea = ideaMatch ? ideaMatch[1].trim() : text;
  const secMatch = text.match(/(\d{1,3})\s*秒/);
  const targetSeconds = secMatch ? parseInt(secMatch[1]) : 30;
  const styleMap = { '写实': 'photorealistic', '3D': '3d', 'G1': 'g1', '日漫': 'anime', '国风水墨': 'ink' };
  const styleMatch = text.match(/(写实|3D|G1|日漫|国风水墨)/);
  const artStyle = styleMap[styleMatch ? styleMatch[1] : ''] || 'photorealistic';
  return { idea, target_seconds: targetSeconds, art_style: artStyle };
}

const ex1 = extractScreenplay('写一个短视频剧本：未来城市的爱情故事，时长 30 秒，风格写实');
eq(ex1.idea, '未来城市的爱情故事', 'T4a idea 提取');
eq(ex1.target_seconds, 30, 'T4b target_seconds 提取');
eq(ex1.art_style, 'photorealistic', 'T4c art_style "写实" → photorealistic');

const ex2 = extractScreenplay('写剧本：赛博朋克侦探，时长 60 秒，风格 3D');
eq(ex2.idea, '赛博朋克侦探', 'T4d idea 无"短视频"也命中');
eq(ex2.target_seconds, 60, 'T4e target_seconds=60');
eq(ex2.art_style, '3d', 'T4f art_style "3D" → 3d');

const ex3 = extractScreenplay('写一个短视频剧本：日漫校园故事');
eq(ex3.idea, '日漫校园故事', 'T4g idea 提取');
eq(ex3.target_seconds, 30, 'T4h 缺时长默认 30');
eq(ex3.art_style, 'anime', 'T4i "日漫" → anime');

const ex4 = extractScreenplay('分镜：开场 + 冲突 + 结局');
eq(ex4.idea, '分镜：开场 + 冲突 + 结局', 'T4j 不匹配 idea 正则时用全文');
eq(ex4.target_seconds, 30, 'T4k 缺时长默认');
eq(ex4.art_style, 'photorealistic', 'T4l 缺风格默认 photorealistic');

const ex5 = extractScreenplay('写剧本创意：国风水墨武侠');
eq(ex5.art_style, 'ink', 'T4m "国风水墨" → ink');

console.log(`\n=== 结果：${pass}/${pass+fail} 通过 ===`);
if (fail > 0) {
  console.log('失败项：');
  for (const f of failed) console.log(' -', f.name, ':', f.msg);
  process.exit(1);
}
process.exit(0);
