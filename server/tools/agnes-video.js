// Agnes AI Video V2.0 视频生成工具
// API 文档: https://agnes-ai.com/zh-Hans/docs/agnes-video-v20
// 异步任务模式：create → query 轮询直到 completed
const config = require('../config');
const { collection } = require('../db/connection');

const API_BASE = 'https://apihub.agnes-ai.com';

/**
 * 读取 Agnes API Key
 * 优先级：环境变量/配置文件 > DB system_configs
 */
function getApiKey() {
  // 1. 环境变量或 config.json（本地开发 / 部署时设置）
  if (config.agnesApiKey) return config.agnesApiKey;
  if (process.env.AGNES_API_KEY) return process.env.AGNES_API_KEY;
  // 2. DB system_configs（管理界面配置）
  try {
    const cfg = collection('system_configs').findOne(c => c.key === 'agnes_api_key');
    if (cfg && cfg.value) return cfg.value;
  } catch (e) { /* DB 未就绪时不报错 */ }
  return '';
}

/**
 * 创建视频生成任务
 * 支持：文生视频 / 图生视频 / 多图视频 / 关键帧动画
 */
async function generateVideo(args) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { error: 'Agnes API Key 未配置。请在管理后台「高级设置」中配置 Agnes API Key，或在 config.json 中设置 agnesApiKey，或设置环境变量 AGNES_API_KEY' };
  }

  const body = {
    model: 'agnes-video-v2.0',
    prompt: args.prompt,
  };

  if (args.image) body.image = args.image;
  if (args.mode) body.mode = args.mode;
  if (args.height) body.height = args.height;
  if (args.width) body.width = args.width;
  if (args.num_frames) body.num_frames = args.num_frames;
  if (args.frame_rate) body.frame_rate = args.frame_rate;
  if (args.seed !== undefined) body.seed = args.seed;
  if (args.negative_prompt) body.negative_prompt = args.negative_prompt;

  // 多图/关键帧：extra_body 参数
  if (args.extra_images || args.extra_mode) {
    body.extra_body = {};
    if (args.extra_images) body.extra_body.image = args.extra_images;
    if (args.extra_mode) body.extra_body.mode = args.extra_mode;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);

    const resp = await fetch(`${API_BASE}/v1/videos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return {
        error: `Agnes API 创建任务失败 (${resp.status}): ${errText || resp.statusText}`,
        status_code: resp.status,
      };
    }

    const data = await resp.json();
    return {
      video_id: data.video_id || null,
      task_id: data.task_id || data.id || null,
      status: data.status || 'unknown',
      progress: data.progress ?? 0,
      seconds: data.seconds || null,
      size: data.size || null,
      model: data.model || 'agnes-video-v2.0',
      created_at: data.created_at || null,
      raw: data,
    };
  } catch (e) {
    return {
      error: `Agnes API 请求失败: ${e.message}`,
      status_code: e.name === 'TimeoutError' ? 408 : 0,
    };
  }
}

/**
 * 查询视频生成任务状态/结果
 * 优先用 video_id（推荐方式），其次 task_id（兼容旧版）
 */
async function queryVideo(args) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { error: 'Agnes API Key 未配置。请在管理后台「高级设置」中配置 Agnes API Key，或在 config.json 中设置 agnesApiKey，或设置环境变量 AGNES_API_KEY' };
  }

  const videoId = args.video_id;
  const taskId = args.task_id;

  if (!videoId && !taskId) {
    return { error: '请提供 video_id（推荐）或 task_id' };
  }

  try {
    let url;
    if (videoId) {
      // 推荐方式：video_id 查询
      url = `${API_BASE}/agnesapi?video_id=${encodeURIComponent(videoId)}`;
      if (args.model_name) url += `&model_name=${encodeURIComponent(args.model_name)}`;
    } else {
      // 兼容旧版：task_id 查询
      url = `${API_BASE}/v1/videos/${encodeURIComponent(taskId)}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return {
        error: `Agnes API 查询失败 (${resp.status}): ${errText || resp.statusText}`,
        status_code: resp.status,
      };
    }

    const data = await resp.json();
    const result = {
      video_id: data.video_id || null,
      task_id: data.task_id || data.id || null,
      status: data.status || 'unknown',
      progress: data.progress ?? null,
    };

    if (data.status === 'completed') {
      result.video_url = data.remixed_from_video_id || data.video_url || null;
      result.seconds = data.seconds || null;
      result.size = data.size || null;
    }

    if (data.status === 'failed') {
      result.error = data.error || '未知错误';
    }

    result.raw = data;
    return result;
  } catch (e) {
    return {
      error: `Agnes API 查询失败: ${e.message}`,
      status_code: e.name === 'TimeoutError' ? 408 : 0,
    };
  }
}

module.exports = { generateVideo, queryVideo };
