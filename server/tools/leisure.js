// ACMS 内建工具 — 休闲娱乐类（3 工具）
// 原 tools/index.js 178-309 行提取
// v0.23 L3 拆分：fire-and-forget 的 assist 包装工具独立
//   LLM 看到用户说"想听 X"/"生成图片 Y"等 → 主动 tool-call → 触发对应 assist
//   handler 立刻返回成功响应给 LLM，context 由 chat-intent.js 注入（含 reqId）
const { registerTool } = require('../services/tool-registry');

registerTool({
  name: 'play_music',
  description: '为用户找歌曲的免费播放源（网易云/QQ/B站/YouTube 等）。'
    + '当用户表达"想听 X""播放 X""找一首 X""搜 X 歌""放 X 歌"等音乐意图时使用。'
    + 'song 必填，artist 可选（帮助 LLM 推断更准的搜索）。'
    + '返回 ok=true 表示已触发异步搜索，用户会在 10-30 秒内看到播放卡片。'
    + '【重要】这是 fire-and-forget 异步任务，**调用一次即可，不要重复调用**。',
  parameters: {
    type: 'object',
    properties: {
      song: { type: 'string', description: '歌曲名（必填）' },
      artist: { type: 'string', description: '艺人名（可选，LLM 可从对话历史推断）' },
    },
    required: ['song'],
  },
  async handler(args, ctx = {}) {
    const { reqId } = ctx;
    if (!reqId) return { ok: false, error: 'NO_REQ_ID', message: '工具调用上下文缺少 reqId' };
    if (!args?.song) return { ok: false, error: 'NO_SONG', message: '必须提供 song 参数' };
    try {
      const reqStore = require('../stores/requirement-store');
      const req = reqStore.getById(reqId);
      if (req && req.assist_music) {
        let existing;
        try { existing = JSON.parse(req.assist_music); } catch {}
        if (existing && existing.status === 'done') {
          console.log(`[tool:play_music] ${reqId} 音乐已由预检触发，跳过重复`);
          return { ok: true, skipped: true, message: `已找到「${args.song}」的播放源，等待卡片出现即可。` };
        }
      }
      const musicSvc = require('../services/assists/music');
      console.log(`[tool:play_music] ${reqId} song="${args.song}" artist="${args.artist || ''}"`);
      setImmediate(() => {
        musicSvc.runAssistJob(reqId, { song: args.song, artist: args.artist })
          .catch(e => console.error(`[tool:play_music] runAssistJob failed:`, e.message));
      });
      return {
        ok: true,
        message: `正在为你找「${args.song}${args.artist ? ' - ' + args.artist : ''}」的免费播放源，预计 10-30 秒内显示卡片。`,
        song: args.song,
        artist: args.artist || null,
        reqId,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
});

registerTool({
  name: 'play_video',
  description: '用视频生成辅助工具创建视频任务。'
    + '当用户表达"生成视频 X""做一个视频""给我生成一段视频""画一个视频"等视频生成意图时使用。'
    + '需要从用户消息中提取视频主题/描述作为 prompt。'
    + '返回 ok=true 表示已触发异步生成（通常 60-300 秒），完成后用户看到视频卡片。'
    + '【重要】这是 fire-and-forget 异步任务，**调用一次即可，不要重复调用**。',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '视频内容描述（必填，从用户消息提炼）' },
      duration: { type: 'number', description: '目标时长（秒，可选，用于 frame 数估算）' },
    },
    required: ['prompt'],
  },
  async handler(args, ctx = {}) {
    const { reqId } = ctx;
    if (!reqId) return { ok: false, error: 'NO_REQ_ID', message: '工具调用上下文缺少 reqId' };
    if (!args?.prompt) return { ok: false, error: 'NO_PROMPT', message: '必须提供 prompt 参数' };
    try {
      const videoSvc = require('../services/assists/video');
      console.log(`[tool:play_video] ${reqId} prompt="${args.prompt.slice(0, 80)}"`);
      setImmediate(() => {
        videoSvc.runAssistJob(reqId, { prompt: args.prompt, duration: args.duration })
          .catch(e => console.error(`[tool:play_video] runAssistJob failed:`, e.message));
      });
      return {
        ok: true,
        message: `正在为你生成视频「${args.prompt.slice(0, 30)}...」，预计 60-300 秒完成，完成后显示视频卡片。`,
        prompt: args.prompt,
        reqId,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
});

registerTool({
  name: 'generate_image',
  description: '用图片生成辅助工具创建图片。'
    + '当用户表达"生成图片 X""画一张 X""画一个 X""给我生成一张图"等图片生成意图时使用。'
    + '需要从用户消息中提取图片描述作为 prompt。'
    + '返回 ok=true 表示已触发异步生成（通常 10-60 秒），完成后用户看到图片卡片。'
    + '【重要】这是 fire-and-forget 异步任务，**调用一次即可，不要重复调用**。',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '图片内容描述（必填，从用户消息提炼）' },
    },
    required: ['prompt'],
  },
  async handler(args, ctx = {}) {
    const { reqId } = ctx;
    if (!reqId) return { ok: false, error: 'NO_REQ_ID', message: '工具调用上下文缺少 reqId' };
    if (!args?.prompt) return { ok: false, error: 'NO_PROMPT', message: '必须提供 prompt 参数' };
    try {
      const imageSvc = require('../services/assists/image-gen');
      console.log(`[tool:generate_image] ${reqId} prompt="${args.prompt.slice(0, 80)}"`);
      setImmediate(() => {
        imageSvc.runAssistJob(reqId, { prompt: args.prompt })
          .catch(e => console.error(`[tool:generate_image] runAssistJob failed:`, e.message));
      });
      return {
        ok: true,
        message: `正在为你生成图片「${args.prompt.slice(0, 30)}...」，预计 10-60 秒完成，完成后显示图片卡片。`,
        prompt: args.prompt,
        reqId,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
});
