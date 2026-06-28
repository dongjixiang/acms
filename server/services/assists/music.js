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

// 6 个免费平台搜索 URL 构造（无版权风险，纯跳转）
const PLATFORM_TEMPLATES = [
  { platform: '网易云音乐', icon: '🎵', search: (q) => `https://music.163.com/#/search/m/?s=${q}&type=1` },
  { platform: 'QQ音乐',     icon: '🎶', search: (q) => `https://y.qq.com/n/ryqq/search?w=${q}` },
  { platform: '酷狗音乐',   icon: '🎤', search: (q) => `https://www.kugou.com/yy/html/search.html?searchKeyword=${q}` },
  { platform: '酷我音乐',   icon: '🎼', search: (q) => `https://search.kuwo.cn/search_result?key=${q}` },
  { platform: '咪咕音乐',   icon: '🪕', search: (q) => `https://music.migu.cn/v3/search?keyword=${q}&type=song` },
  { platform: 'Bilibili',   icon: '📺', search: (q) => `https://search.bilibili.com/all?keyword=${q}` },
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
    else if (url.includes('kuwo.cn')) platform = '酷我音乐';
    else if (url.includes('migu.cn')) platform = '咪咕音乐';
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

// v0.20c: Windows 兼容的 fetch 超时（AbortSignal.timeout 在 Windows Node 下不可靠）
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return resp;
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
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
    // 写失败到聊天流（替换 loading）
    writeMusicChatEntry(requirementId, '', '', [], [], true);
    return;
  }

  const artist = opts.artist || '';

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

    // 3. v0.19：搜索可播放音频源
    let playableUrl = null;
    let playableSources = [];  // v0.19：多个可播放源
    try {
      // 3a. 搜 Bilibili 可播放视频（国内可用，几乎每首歌都有）
      const biliResp = await fetchWithTimeout(`https://api.bilibili.com/x/web-interface/search/all/v2?keyword=${encodeURIComponent(song)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }, 10000);
      if (biliResp.ok) {
        const biliData = await biliResp.json();
        const videos = biliData?.data?.result || [];
        const bvidList = [];
        for (const res of videos) {
          if (res.result_type === 'video' && Array.isArray(res.data)) {
            for (const v of res.data.slice(0, 5)) { // 取前 5 个
              if (v.bvid) bvidList.push(v.bvid);
            }
            break;
          }
        }
        // 构建可播放源列表
        playableSources = [];
        for (const bvid of bvidList) {
          playableSources.push({
            type: 'bilibili',
            label: `B站 #${playableSources.length + 1}`,
            url: `https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=0`,
            title: '哔哩哔哩',
          });
        }
        if (playableSources.length > 0) {
          playableUrl = playableSources[0].url;
          console.log(`[assist:music] ${requirementId} 找到 ${playableSources.length} 个 Bilibili 源`);
        }
      }
    } catch (e) {
      console.warn(`[assist:music] ${requirementId} Bilibili 搜索失败（可忽略）:`, e.message);
    }

    // 3b. 搜网易云音乐可播放源
    try {
      const neteaseResp = await fetchWithTimeout(`https://music.163.com/api/search/get/web?csrf_token=&type=1&s=${encodeURIComponent(song)}&offset=0&limit=5`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://music.163.com/' },
      }, 10000);
      if (neteaseResp.ok) {
        const neteaseData = await neteaseResp.json();
        const songs = neteaseData?.result?.songs || [];
        for (const s of songs.slice(0, 3)) {
          if (s.id) {
            const existingLabels = new Set(playableSources.map(p => p.title));
            const label = `网易云 #${s.id}`;
            if (!existingLabels.has('网易云音乐')) {
              playableSources.push({
                type: 'netease',
                label: `网易云`,
                url: `https://music.163.com/outchain/player?type=2&id=${s.id}&auto=0`,
                title: '网易云音乐',
              });
              if (!playableUrl) playableUrl = playableSources[playableSources.length - 1].url;
            }
          }
        }
        if (playableSources.length > 0) {
          console.log(`[assist:music] ${requirementId} 网易云搜索完成`);
        }
      }
    } catch (e) {
      console.warn(`[assist:music] ${requirementId} 网易云搜索失败（可忽略）:`, e.message);
    }

    // 3d. 酷我音乐（API 公开 + iframe 嵌入可达，2026-06-28 实测）
    //   国内老牌，覆盖 B站/网易云缺版权的部分独立音乐
    try {
      const kw = encodeURIComponent(song);
      const kuwoResp = await fetchWithTimeout(
        `https://search.kuwo.cn/r.s?all=${kw}&ft=music&itemset=web_2013&client=kt&pn=0&rn=5&rformat=json&encoding=utf8&vipver=MUSIC_9.0.5.0_W7&newver=1&uid=0&ver=1810&plat=pc&devid=0&mid=0&fmac=0&resmerge=1&issubtitle=0&showtype=14`,
        { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.kuwo.cn/' } },
        10000
      );
      if (kuwoResp.ok) {
        const body = await kuwoResp.text();
        // 酷我返 JSONP 风格（单引号），用 ast.literal_eval 解析
        let kuwoData;
        try {
          // 直接试 JSON
          kuwoData = JSON.parse(body);
        } catch {
          // 兜底：替换单引号为双引号
          try { kuwoData = JSON.parse(body.replace(/'/g, '"')); } catch {}
        }
        const songs = kuwoData?.abslist || [];
        let added = 0;
        for (const s of songs) {
          if (added >= 2) break;  // 酷我最多加 2 个源（避免挤占其他平台）
          const rid = s.MUSICRID || s.MP3RID;
          if (!rid) continue;
          playableSources.push({
            type: 'kuwo',
            label: `酷我 ${s.NAME || ''}`.trim(),
            url: `https://player.kuwo.cn/song/${rid}`,
            title: '酷我音乐',
          });
          if (!playableUrl) playableUrl = playableSources[playableSources.length - 1].url;
          added++;
        }
        if (added > 0) {
          console.log(`[assist:music] ${requirementId} 酷我搜索完成: ${added} 个源`);
        }
      }
    } catch (e) {
      console.warn(`[assist:music] ${requirementId} 酷我搜索失败（可忽略）:`, e.message);
    }

    // 3e. 如果还没找到源，用 web_search 搜国内其他音频链接（SoundCloud/Audiomack 国内被墙移除）
    if (!playableUrl) {
      try {
      const toolRegistry = require('../tool-registry');
      const searchTool = toolRegistry.getTool('web_search');
      if (searchTool) {
        const audioResult = await searchTool.handler({
          query: `${song} site:kuwo.cn OR site:piponazip.com audio 音频 试听`,
          max_results: 5,
        });
        if (Array.isArray(audioResult?.results)) {
          for (const r of audioResult.results) {
            const url = r.url || '';
            // 酷我已通过专门 API 搜过，这里跳过避免重复
            // 直接音频文件
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
        playable_url: playableUrl,
        playable_sources: playableSources,
        generated_at: new Date().toISOString(),
        generated_at_round: typeof opts.chatRound === 'number' ? opts.chatRound : null,
        model: null,
        used: false,
      }),
    });
    console.log(`[assist:music] ${requirementId} 完成, song="${song}", ${sources.length} 个来源`);

    // v0.20d fix：把音乐结果写进聊天流（chat.js renderMusicBubble 渲染）
    writeMusicChatEntry(requirementId, song, artist, playableSources, sources, false);
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

    // v0.20d fix：失败也写聊天流，用户能看到平台搜索链接
    writeMusicChatEntry(requirementId, song, artist, [], buildPlatformSearchLinks(song), true);
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

// v0.20c：把音乐结果写进聊天流（system 气泡 — 含可播放的 Bilibili/网易云 iframe）
function writeMusicChatEntry(reqId, song, artist, playableSources, platformSources, isError) {
  const req = reqStore.getById(reqId);
  if (!req) return;

  // 构造结构化数据给前端渲染（前端 renderMusicBubble 解析 JSON）
  const card = {
    type: 'music_card',
    song: song || '',
    artist: artist || null,
    error: isError ? (playableSources.length === 0 ? '搜索失败' : null) : null,
    playable: (playableSources || []).filter(s => s.url).map(s => ({
      type: s.type || 'audio',
      label: s.label || '源',
      url: s.url,
    })),
    platforms: (platformSources || []).map(s => ({
      name: s.platform || '',
      icon: s.icon || '🔗',
      url: s.url || '',
    })),
  };

  const text = JSON.stringify(card);

  let history = [];
  try { history = JSON.parse(req.supplement_history || '[]'); } catch { history = []; }
  if (!Array.isArray(history)) history = [];
  // v0.21 fix：去重要按 (song, artist) 判断，允许多首歌同时存在
  //   旧逻辑只看 source === 'music_result' 就跳过，导致第 2 首歌永远写不进去（用户报告 REQ-MQVQ38FY）
  const sameSong = history.some(e => {
    if (e.source !== 'music_result') return false;
    try {
      const old = JSON.parse(e.text || '{}');
      return old.song === (song || '') && (old.artist || null) === (artist || null);
    } catch { return false; }
  });
  if (sameSong) {
    console.log(`[assist:music] ${reqId} 跳过重复 music_result: ${song} - ${artist || ''}`);
    return;
  }
  // v0.20d fix：移除之前的 loading 条目（source: music_precheck），避免同时显示 loading + 结果
  // ⚠️ v0.21.3 FIX: 不能真的从 history 中移除！前端 polling 检测 history.length > state.histCount
  //   如果移除 loading + 追加 result 总条数不变 → polling 认为无新数据 → music_result 永不 DOM 渲染
  //   代替方案：保留 loading，前端在渲染时自动移除旧 loading 卡片
  // history = history.filter(e => e.source !== 'music_precheck');
  history.push({
    role: 'system',
    text,
    at: new Date().toISOString(),
    source: 'music_result',
  });
  reqStore.update(reqId, { supplement_history: JSON.stringify(history) });
}

module.exports = {
  name: '音乐播放（找免费播放源）',
  field: 'assist_music',
  runAssistJob,
  markUsed,
  getAssist,
};
