// ACMS · 音乐播放辅助（v0.19，2026-06-27）
//   用户提供歌曲名 → 直接构造 4-5 个免费平台搜索 URL → 卡片渲染
//   可选：用 web_search 验证 + 找具体歌单链接（更精准，但不可靠时降级到平台搜索 URL）
//
// 设计原则：
//   - 零 LLM 综合分析（音乐搜索 LLM 解析不可靠 + 浪费 token）
//   - 优先 web_search 验证（找到具体歌单时链接更精准）
//   - 验证失败 / 找不到时降级到平台搜索 URL（5 个平台兜底）
//   - 字段：requirement.assist_music（status / song / sources / verified）

const reqStore = require('../../stores/requirement-store');

// 5 个免费平台搜索 URL 构造（无版权风险，纯跳转）
const PLATFORM_TEMPLATES = [
  { platform: '网易云音乐', icon: '🎵', search: (q) => `https://music.163.com/#/search/m/?s=${q}&type=1` },
  { platform: 'QQ音乐',     icon: '🎶', search: (q) => `https://y.qq.com/n/ryqq/search?w=${q}` },
  { platform: '酷狗音乐',   icon: '🎤', search: (q) => `https://www.kugou.com/yy/html/search.html?searchKeyword=${q}` },
  { platform: 'Bilibili',   icon: '📺', search: (q) => `https://search.bilibili.com/all?keyword=${q}` },
  { platform: 'YouTube',    icon: '▶️', search: (q) => `https://www.youtube.com/results?search_query=${q}` },
];

function buildPlatformSearchLinks(song) {
  const q = encodeURIComponent(song);
  return PLATFORM_TEMPLATES.map(t => ({
    platform: t.platform,
    icon: t.icon,
    url: t.search(q),
    title: song,
    verified: false,
  }));
}

// 从 supplement_history 里解析最近一条 user message 提到的歌名
function extractSongFromHistory(req) {
  try {
    const history = JSON.parse(req.supplement_history || '[]');
    if (!Array.isArray(history)) return null;
    for (let i = history.length - 1; i >= 0; i--) {
      const e = history[i];
      if (!e || e.role !== 'user') continue;
      const text = (e.text || '').trim();
      if (!text) continue;
      // 匹配模式：播放/听/放/想听/找歌 X | 帮我放 X | 搜 X 歌
      const patterns = [
        /(?:播放|听一下|听首|放一首|想听|想找|找一首|搜一首)\s*[\s:：]?\s*([^，。！？\n]{1,30})/,
        /(?:播放|听|放)\s*[\s:：]?\s*([^，。！？\n]{1,30})\s*这?首歌?/,
      ];
      for (const pat of patterns) {
        const m = text.match(pat);
        if (m && m[1]) return m[1].trim();
      }
    }
  } catch { /* ignore */ }
  return null;
}

// 从 web_search 结果里挑平台链接（按 URL 域名匹配）
function pickVerifiedLinks(results, song, fallbackLinks) {
  if (!Array.isArray(results) || results.length === 0) return null;
  const verified = [];
  const seenPlatforms = new Set();

  for (const r of results) {
    const url = r.url || '';
    const title = r.title || song;
    let platform = null;
    if (url.includes('music.163.com')) platform = '网易云音乐';
    else if (url.includes('y.qq.com') || url.includes('qq.com')) platform = 'QQ音乐';
    else if (url.includes('kugou.com')) platform = '酷狗音乐';
    else if (url.includes('bilibili.com')) platform = 'Bilibili';
    else if (url.includes('youtube.com') || url.includes('youtu.be')) platform = 'YouTube';
    if (platform && !seenPlatforms.has(platform)) {
      const fallback = fallbackLinks.find(f => f.platform === platform);
      verified.push({
        platform,
        icon: fallback?.icon || '🔗',
        url,
        title,
        verified: true,
      });
      seenPlatforms.add(platform);
    }
  }

  // verified < 2 时用 fallback 补齐
  if (verified.length < 2) {
    for (const f of fallbackLinks) {
      if (!seenPlatforms.has(f.platform)) {
        verified.push({ ...f, verified: false });
      }
    }
  }
  return verified.slice(0, 5);
}

async function runAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  // 歌名优先级：opts.song（chip 输入框） > 解析 user message > req.title
  const song = (opts.song || extractSongFromHistory(req) || req.title || '').trim();

  // 兜底：生成状态先写
  reqStore.update(requirementId, {
    assist_music: JSON.stringify({
      status: 'generating',
      song,
      sources: [],
      started_at: new Date().toISOString(),
    }),
  });

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

  try {
    // 1. 永远构造平台搜索链接（兜底）
    const platformLinks = buildPlatformSearchLinks(song);

    // 2. 可选：用 web_search 验证（找具体歌单）
    let sources = platformLinks;
    let verified = false;
    try {
      const toolRegistry = require('../tool-registry');
      const searchTool = toolRegistry.getTool('web_search');
      if (searchTool) {
        console.log(`[assist:music] ${requirementId} web_search 验证: ${song}`);
        const result = await searchTool.handler({
          query: `${song} 网易云 OR QQ音乐 OR 酷狗 OR Bilibili`,
          max_results: 6,
        });
        const picked = pickVerifiedLinks(result?.results || [], song, platformLinks);
        if (picked && picked.length > 0) {
          sources = picked;
          verified = picked.some(s => s.verified);
          console.log(`[assist:music] ${requirementId} verified=${verified}, ${sources.length} 个来源`);
        }
      }
    } catch (e) {
      console.warn(`[assist:music] ${requirementId} web_search 验证失败（降级到平台链接）:`, e.message);
    }

    // 3. v0.19：搜索可播放音频源（Bilibili 视频 + 直接音频链接）
    let playableUrl = null;
    try {
      // 3a. 搜 Bilibili 可播放视频（国内可用，几乎每首歌都有）
      const biliResp = await fetch(`https://api.bilibili.com/x/web-interface/search/all/v2?keyword=${encodeURIComponent(song)}`, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (biliResp.ok) {
        const biliData = await biliResp.json();
        const videos = biliData?.data?.result || [];
        let foundBvid = '';
        for (const res of videos) {
          if (res.result_type === 'video' && Array.isArray(res.data) && res.data.length > 0) {
            foundBvid = res.data[0].bvid || '';
            break;
          }
        }
        if (foundBvid) {
          playableUrl = `https://player.bilibili.com/player.html?bvid=${foundBvid}&autoplay=0`;
          console.log(`[assist:music] ${requirementId} 找到 Bilibili 播放源: ${foundBvid}`);
        }
      }
    } catch (e) {
      console.warn(`[assist:music] ${requirementId} Bilibili 搜索失败（可忽略）:`, e.message);
    }

    // 3b. 如果 Bilibili 没找到，再用 web_search 找其他音频链接
    if (!playableUrl) {
      try {
      const toolRegistry = require('../tool-registry');
      const searchTool = toolRegistry.getTool('web_search');
      if (searchTool) {
        const audioResult = await searchTool.handler({
          query: `${song} site:soundcloud.com OR site:audiomack.com OR site:piponazip.com audio`,
          max_results: 5,
        });
        if (Array.isArray(audioResult?.results)) {
          for (const r of audioResult.results) {
            const url = r.url || '';
            // 优先用 SoundCloud 链接（可 iframe 嵌入）
            if (url.includes('soundcloud.com') && !playableUrl) {
              playableUrl = url;
            }
            // 其次直接音频文件
            if (/\.(mp3|wav|ogg|m4a|flac)(\?|$)/i.test(url) && !playableUrl) {
              playableUrl = url;
            }
          }
        }
      }
    } catch (e) {
      console.warn(`[assist:music] ${requirementId} 播放源搜索失败（可忽略）:`, e.message);
    }
    }  // end if(!playableUrl)

    reqStore.update(requirementId, {
      assist_music: JSON.stringify({
        status: 'done',
        song,
        sources,
        verified,
        playable_url: playableUrl,  // v0.19 可播放音频链接
        generated_at: new Date().toISOString(),
        generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
        model: null,
        used: false,
      }),
    });
    console.log(`[assist:music] ${requirementId} 完成, song="${song}", ${sources.length} 个来源`);
  } catch (e) {
    console.error(`[assist:music] ${requirementId} 失败:`, e.message);
    reqStore.update(requirementId, {
      assist_music: JSON.stringify({
        status: 'failed',
        song,
        sources: buildPlatformSearchLinks(song),  // 失败也返回平台链接兜底
        error: e.message || '未知错误',
        generated_at: new Date().toISOString(),
      }),
    });
  }
}

function markUsed(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  let assist;
  try { assist = JSON.parse(req.assist_music || 'null'); } catch { assist = null; }
  if (!assist) return null;
  assist.used = true;
  assist.used_at = new Date().toISOString();
  reqStore.update(requirementId, { assist_music: JSON.stringify(assist) });
  return assist;
}

function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try { return JSON.parse(req.assist_music || 'null'); } catch { return null; }
}

module.exports = {
  name: '音乐播放（找免费播放源）',
  field: 'assist_music',
  runAssistJob,
  markUsed,
  getAssist,
};
