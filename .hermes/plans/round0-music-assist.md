# Round 0: 音乐播放辅助工具（music assist）

> **Date**: 2026-06-27
> **Trigger**: 用户在 chat 里问"能播放 天天阙歌 这首歌吗？" LLM 答"无法播放音频"，多多想加音乐辅助工具
> **方案 A**: web_search 找播放源 + 平台搜索链接卡片（零 LLM 综合分析，1-2h 上线）

---

## 现状（已验证）

### 痛点
- 用户在 ACMS chat 里说"播放 X 歌" → LLM 只能回答"我是文本助手" → 用户挫败
- ACMS 是 PM 工作流系统，但用户场景可能涉及"工作间隙想听歌"或"为方案找音乐素材"

### 现有 assist 架构
- 16 个 assist 在 `server/services/assists/`（decision_tree, scenarios, diagnosis, ...）
- 每个暴露 `name / runAssistJob / markUsed / getAssist`（看 `health-check.js`）
- 在 `index.js` ASSISTS map 注册即可启用
- 前端 chip 调用 `chatAssist(reqId, method, body)` → SSE 流式 → render 卡片
- 不需要改 routes（mount 是 app.js 层的）

### web_search tool 集成模式（`server/tools/index.js` L80-99）
```js
registerTool({
  name: 'web_search',
  parameters: { query, max_results },
  handler: (args) => webSearch(args),  // 返回 {results: [{title, url, snippet}]}
});
```

---

## 方案 A 设计

### 数据模型
- `requirement.assist_music`: `{ status, song, sources: [{platform, url, title, duration?}], generated_at, model, used }`
- NeDB 风格动态字段，无 schema 迁移

### 后端（2 文件）

#### 1. `server/services/assists/music.js`（新建 ~80 行）

```js
// v0.19 音乐播放辅助
// 思路：用户给歌名 → 直接构造 4 大平台搜索 URL → 卡片渲染
// 可选：用 web_search 验证 + 找具体歌单（如果搜得到）

function buildPlatformSearchLinks(song) {
  const q = encodeURIComponent(song);
  return [
    { platform: '网易云音乐', icon: '🎵', url: `https://music.163.com/#/search/m/?s=${q}&type=1` },
    { platform: 'QQ音乐',     icon: '🎶', url: `https://y.qq.com/n/ryqq/search?w=${q}` },
    { platform: '酷狗音乐',   icon: '🎤', url: `https://www.kugou.com/yy/html/search.html?searchKeyword=${q}` },
    { platform: 'Bilibili',   icon: '📺', url: `https://search.bilibili.com/all?keyword=${q}` },
    { platform: 'YouTube',    icon: '▶️', url: `https://www.youtube.com/results?search_query=${q}` },
  ];
}

async function runAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  // 歌名优先级：opts.song > 解析 user message > req.title
  const song = (opts.song || extractSongFromHistory(req) || req.title || '').trim();
  if (!song) {
    reqStore.update(requirementId, {
      assist_music: JSON.stringify({
        status: 'failed',
        error: 'NO_SONG_NAME',
        song: '',
        sources: [],
        generated_at: new Date().toISOString(),
      }),
    });
    return;
  }

  // 先写 generating 状态
  reqStore.update(requirementId, {
    assist_music: JSON.stringify({
      status: 'generating',
      song,
      sources: [],
      started_at: new Date().toISOString(),
    }),
  });

  try {
    // 1. 直接构造平台搜索链接（4-5 个，免费 + 国内可用）
    const platformLinks = buildPlatformSearchLinks(song);

    // 2. 可选：用 web_search 找具体歌单（更精准，但 LLM 解析未必可靠）
    let verifiedLinks = null;
    try {
      const toolRegistry = require('../tool-registry');
      const searchTool = toolRegistry.getTool('web_search');
      if (searchTool) {
        const result = await searchTool.handler({
          query: `${song} 网易云音乐 OR QQ音乐 OR 酷狗 播放`,
          max_results: 6,
        });
        if (result?.results?.length > 0) {
          verifiedLinks = pickVerifiedLinks(result.results, song, platformLinks);
        }
      }
    } catch (e) { /* ignore, use platform links */ }

    reqStore.update(requirementId, {
      assist_music: JSON.stringify({
        status: 'done',
        song,
        sources: verifiedLinks || platformLinks,
        verified: !!verifiedLinks,
        generated_at: new Date().toISOString(),
        generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
        model: null,
        used: false,
      }),
    });
  } catch (e) {
    reqStore.update(requirementId, {
      assist_music: JSON.stringify({
        status: 'failed',
        song,
        sources: buildPlatformSearchLinks(song),  // 失败也返回平台链接兜底
        error: e.message,
        generated_at: new Date().toISOString(),
      }),
    });
  }
}

// 从 supplement_history 里找最近一条 user message 提到歌名
function extractSongFromHistory(req) {
  try {
    const history = JSON.parse(req.supplement_history || '[]');
    // 找最近的 user message 提到"播放/听 X"
    for (let i = history.length - 1; i >= 0; i--) {
      const e = history[i];
      if (e?.role !== 'user') continue;
      const text = e.text || '';
      const m = text.match(/(?:播放|听|放|想听|想看|找歌)\s*[\s:：]?\s*([^，。！？\n]{1,30})/);
      if (m && m[1]) return m[1].trim();
    }
  } catch { /* ignore */ }
  return null;
}

function pickVerifiedLinks(results, song, fallbackLinks) {
  // 从搜索结果里挑平台相关链接
  const song_ = song.toLowerCase();
  const verified = [];
  const seenPlatforms = new Set();
  for (const r of results) {
    const url = r.url || '';
    const title = (r.title || '').toLowerCase();
    if (title.includes(song_) || url.includes(song_)) {
      let platform = null;
      if (url.includes('music.163.com')) platform = '网易云音乐';
      else if (url.includes('y.qq.com')) platform = 'QQ音乐';
      else if (url.includes('kugou.com')) platform = '酷狗音乐';
      else if (url.includes('bilibili.com')) platform = 'Bilibili';
      else if (url.includes('youtube.com')) platform = 'YouTube';
      if (platform && !seenPlatforms.has(platform)) {
        verified.push({ platform, icon: fallbackLinks.find(f => f.platform === platform)?.icon || '🔗', url, title: r.title || song, verified: true });
        seenPlatforms.add(platform);
      }
    }
  }
  // 如果 verified 数量 < 2，用 fallback 补齐
  if (verified.length < 2) {
    for (const f of fallbackLinks) {
      if (!seenPlatforms.has(f.platform)) {
        verified.push({ ...f, verified: false });
      }
    }
  }
  return verified.slice(0, 5);
}

module.exports = {
  name: '音乐播放（找免费播放源）',
  field: 'assist_music',
  runAssistJob,
  markUsed: (reqId) => markUsedImpl(reqId),
  getAssist: (reqId) => getAssistImpl(reqId),
};
```

#### 2. `server/services/assists/index.js` — 注册 music

```js
const music = require('./music');
// ...
const ASSISTS = {
  // ... 现有 16 个 ...
  music,  // v0.19 音乐播放辅助
};
```

### 前端（3 文件 + 2 i18n）

#### 3. `client/js/views/assists/music.js`（新建 ~120 行）

```js
// v0.19 音乐播放辅助 — 卡片渲染
// 依赖：window.ACMSAssists.get('music') → mod（参考 reference.js）

window.ACMSAssists = window.ACMSAssists || { _mods: {} };
window.ACMSAssists._mods.music = {
  render(reqId, data) {
    if (!data || data.status !== 'done') return '';
    const sources = data.sources || [];
    if (sources.length === 0) return '';
    return `
      <div class="assist-section-title">🎵 ${escHtml(data.song || '音乐')}</div>
      <div class="music-assist-intro">
        ${data.verified
          ? '已为你找到以下播放源（点击跳转）：'
          : '在以下平台搜索这首歌曲：'}
      </div>
      <div class="music-assist-list">
        ${sources.map(s => `
          <a href="${escHtml(s.url)}" target="_blank" rel="noopener noreferrer"
             class="music-assist-card ${s.verified ? 'verified' : ''}">
            <span class="music-assist-icon">${s.icon || '🔗'}</span>
            <span class="music-assist-platform">${escHtml(s.platform)}</span>
            ${s.verified ? '<span class="music-assist-badge">✓ 找到</span>' : '<span class="music-assist-badge search">搜</span>'}
          </a>
        `).join('')}
      </div>
      <div class="music-assist-note">
        💡 点击跳转对应平台播放。ACMS 不存储音频文件，仅提供搜索跳转。
      </div>
    `;
  },
};
```

#### 4. `client/js/views/requirements/idea-panel.js` — 加 chip + 输入框

在 chat-extras 加 chip："🎵 音乐" → 弹输入框（sweetalert 或 inline）→ 调 chatAssist。

```js
// 在 chat-extras 末尾加：
<button onclick="chatMusicPrompt('${req.id}')">🎵 音乐</button>

// 全局函数（在 chat-assist.js 或新文件）
async function chatMusicPrompt(reqId) {
  const song = prompt('🎵 输入想听的歌曲名：');
  if (!song?.trim()) return;
  await chatAssist(reqId, 'music', { song: song.trim() });
}
```

#### 5. `client/index.html` — 加载 music.js

```html
<script src="/client/js/views/assists/music.js?v=0.19.0"></script>
```

#### 6. i18n（zh + en）

```json
"requirements": {
  "music": {
    "chip": "🎵 音乐",
    "prompt": "🎵 输入想听的歌曲名：",
    "verified": "已找到播放源",
    "search": "搜",
    "note": "点击跳转对应平台播放"
  }
}
```

### 不改的东西

- ❌ routes（music 是 assist 注册，不动 mount）
- ❌ chat-assist.js（chatAssist 自动 dispatch 新 method）
- ❌ dispatcher.js（已有的 ACMSAssistDispatcher 自动 get）
- ❌ requirements.js 路由（不增加新端点）

---

## 风险与防退化

| 风险 | 缓解 |
|---|---|
| web_search 解析不可靠 | verified 兜底 fallbackLinks，至少 2 个链接可见 |
| 平台 URL 改版失效 | 平台链接是 search URL（含参数），平台一般保留 |
| 用户敏感内容（版权歌曲） | ACMS 不存音频，纯外链不算侵权 |
| chip 数量太多 | v0.18b 加了 chip 排版（chat-extras flex-wrap），加 1 个不挤 |
| router.stack 验证 | **不需要**（没改 routes，只改了 assists/index.js 的 ASSISTS map）|

---

## 验收清单（多多浏览器手测）

1. 打开 REQ → chat-extras 看到新增 "🎵 音乐" 按钮
2. 点 chip → 弹输入框"输入想听的歌曲名" → 输入"天天阙歌" → 确认
3. loading 卡片出现 → 完成后显示"已为你找到播放源"卡片
4. 卡片含 4-5 个平台按钮（网易云 / QQ / 酷狗 / Bilibili / YouTube）
5. 点任一按钮 → 新窗口跳对应平台搜索结果
6. 输入不存在的歌名 → 仍然显示 5 个平台搜索链接（兜底）
7. 切到 free 模式下也能用（music assist 在 free 模式下也工作）

---

## 不做（明确范围控制）

- ❌ 播放历史 / 收藏 / 歌单
- ❌ 歌词显示
- ❌ 视频 MV（只音频搜索跳转）
- ❌ 付费音源（QQ 绿钻 / 网易黑胶）
- ❌ 录音 / 上传本地音乐
- ❌ iframe 嵌入播放（B 方案）
- ❌ 第三方 API 流式播放（C 方案）
- ❌ chat 文本自动 detect "播放 X" 触发（留待后续）
