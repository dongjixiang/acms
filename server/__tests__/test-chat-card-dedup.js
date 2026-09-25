// ============================================================
// test-chat-card-dedup.js — 聊天流「同一条目渲染两遍」的守卫
//
//   为什么要有这个测试：2026-09-25 用户实测报
//     「点选中这个剧本后，在对话框中，渲染出 2 遍 🎬 诗仙的顿悟 / 基于：望庐山瀑布 · 30s · 5 场」
//
//   根因（浏览器里实测复现：bubbles=2，一张 data-at='' 一张带时间戳）= **两个写入者、两套去重键**：
//     ① `refreshScreenplayChatCard`（image-gen.js）在聊天流里没有剧本卡时「补一张」，
//        原来补的卡 data-at=''（无指纹）；
//     ② 同一次选中，服务端还往 supplement_history 追加了一条 screenplay_result（idea 与旧卡
//        不同 → 条数 +1）→ 轮询的**增量**分支把这条条目再渲染一遍 → 两张同内容卡。
//     ③ 尾部重写分支清不掉无指纹那张（它只在「条数不变」时跑，且按 data-source 匹配最后一张
//        → 删掉的恰好是有指纹的那张）。
//
//   修法两件套（必须两处一起改，单改一处仍剩两张）：
//     A. image-gen.js：补卡前清掉旧的无指纹临时卡；补卡时用历史里最后一条 screenplay_result
//        的 at 当指纹（`supplement-history` 拉一次）。
//     B. chat.js：轮询增量渲染前先收集 DOM 里已有的 (data-at|data-source) 键，命中则跳过。
//
//   跑法：node server/__tests__/test-chat-card-dedup.js
//         （真浏览器行为复现见 spikes/dup-chat-card-repro.js）
// ============================================================
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
const ok = (cond, name) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.error('  ✗', name); }
};

const chatJs = fs.readFileSync(path.join(ROOT, 'client', 'js', 'views', 'requirements', 'chat.js'), 'utf8');
const imgJs = fs.readFileSync(path.join(ROOT, 'client', 'js', 'views', 'assists', 'image-gen.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(ROOT, 'client', 'index.html'), 'utf8');

console.log('\n== 1. 轮询增量路径：按 (data-at, data-source) 去重 ==');
ok(/const domKeys = new Set\(\)/.test(chatJs), 'chat.js 增量渲染前收集已渲染指纹 domKeys');
ok(/domKeys\.has\(\(_e\.at \|\| ''\) \+ '\|' \+ \(_e\.source \|\| ''\)\)/.test(chatJs), '命中去重键 → 跳过渲染');
ok(/v0\.22\.87 跳过已渲染条目/.test(chatJs), '跳过时打日志（可取证，不静默）');
ok(/for \(let i = state\.histCount; i < history\.length; i\+\+\)/.test(chatJs), '仍在循环里逐条渲染（改动是加守卫、不是换渲染方式）');
ok(/renderChatBubble\(container, _e\)/.test(chatJs), '未命中的条目照常 renderChatBubble');

console.log('\n== 2. 补卡路径：带指纹 + 清理旧临时卡 ==');
ok(/\.chat-bubble\[data-source="screenplay_result"\]\[data-at=""\]/.test(imgJs), 'image-gen.js 补卡前先清掉旧的无指纹临时卡');
ok(/supplement-history/.test(imgJs) && /keyAt/.test(imgJs), '补卡时拉 supplement-history 取指纹');
ok(/wrap\.dataset\.at = keyAt/.test(imgJs), '补卡的 data-at 用的是历史条目指纹（不再是空串）');
ok(/wrap\.dataset\.source = 'screenplay_result'/.test(imgJs), '补卡仍带 data-source');

console.log('\n== 3. 负向：旧写法不该还在（回退必须变红） ==');
ok(!/wrap\.dataset\.at = '';\s*\/\/ v0\.22\.68: 打标记/.test(imgJs), '旧的「data-at = 空串 + v0.22.68 打标记」写法已移除');
ok(!/^\s*for \(let i = state\.histCount; i < history\.length; i\+\+\) renderChatBubble\(container, history\[i\]\);/m.test(chatJs),
  '旧的「单行无去重循环」写法已移除');

console.log('\n== 4. 缓存版本号（前端改动必须改 ?v=，否则用户刷新拿不到） ==');
ok(/requirements\/chat\.js\?v=0\.22\.87/.test(indexHtml), 'index.html: chat.js?v=0.22.87');
ok(/assists\/image-gen\.js\?v=0\.22\.87/.test(indexHtml), 'index.html: image-gen.js?v=0.22.87');

console.log('\n' + (failed === 0
  ? `✅ test-chat-card-dedup: ${passed} 项全过`
  : `❌ test-chat-card-dedup: ${passed} 过 / ${failed} 失败`));
process.exit(failed === 0 ? 0 : 1);
