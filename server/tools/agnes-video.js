// Agnes AI Video V2.0 视频生成工具
// API 文档: https://agnes-ai.com/zh-Hans/docs/agnes-video-v20
// 异步任务模式：create → query 轮询直到 completed
// v0.22.16: 改用 http1Fetch（HTTP/1.1）修复 Cloudflare HTTP/2 挂死
const { http1Fetch } = require('./http1-fetch');
const config = require('../config');

// v0.XX: 域名 apihub.agnes-ai.com → api.agnes-ai.cn（对齐 LLM 模型 + 新 key）
const API_BASE = 'https://api.agnes-ai.cn';

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
    const { collection } = require('../db/connection');
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
    const resp = await http1Fetch(`${API_BASE}/v1/videos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      timeout: 60000,
    });

    if (!resp.ok) {
      // v0.113f: http1Fetch 返回 status 字段（不是 status_code），之前读 status_code → undefined → 0
      //   → 429 限流被误判为 transport 错误 + "(无 message)" 文案。现在透传 status + 清晰报错。
      return {
        error: `Agnes API 请求失败: ${resp.error || (resp.status ? `HTTP ${resp.status}` : '(无 message — http1Fetch catch 块异常吞了 e.message，需查 e.cause)')}`,
        status_code: resp.status_code || resp.status || 0,
      };
    }

    if (resp.status < 200 || resp.status >= 300) {
      return {
        error: `Agnes API 创建任务失败 (${resp.status}): ${resp.body ? resp.body.slice(0, 200) : resp.status_code}`,
        status_code: resp.status,
      };
    }

    let data;
    try { data = JSON.parse(resp.body); } catch { data = null; }
    if (!data) {
      return { error: 'Agnes API 返回非 JSON', status_code: 0 };
    }

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
    // v0.94 (2026-08-20): error 兜底（e.message 在 undici 边缘场景可能 undefined）
    return {
      error: `Agnes API 请求失败: ${e.message || e.cause?.message || e.name || '未知异常（无 message）'}`,
      status_code: e.name === 'TimeoutError' ? 408 : 0,
    };
  }
}

/**
 * 查询视频生成任务状态/结果
 * 优先用 task_id 调 /v1/videos/{task_id}（litellm proxy 标准端点，agnes-video-v2.0 走这个）
 *   之前用 /agnesapi?video_id=... 对 v2.0 永远 404 "task not found"（2026-06-28 多多实测）
 * 旧版 /agnesapi 作为兜底
 */
async function queryVideo(args) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { error: 'Agnes API Key 未配置。请在管理后台「高级设置」中配置 Agnes API Key，或在 config.json 中设置 agnesApiKey，或设置环境变量 AGNES_API_KEY' };
  }

  const videoId = args.video_id;
  const taskId = args.task_id;

  if (!videoId && !taskId) {
    return { error: '请提供 video_id 或 task_id' };
  }

  // 候选端点（按优先级）
  //   1) /agnesapi?video_id=... — 推荐方式（官方文档），completed 时返回 url 字段（视频真实地址）
  //      v0.113e 修复: 之前放第 2 位兜底，v1 端点总是先返回 → url 永远拿不到 → 前端 video_url 恒 null
  //   2) /v1/videos/{task_id} — 旧版兼容端点（有 status/progress 但无 url）
  const candidates = [];
  if (videoId) candidates.push({ url: `${API_BASE}/agnesapi?video_id=${encodeURIComponent(videoId)}` + (args.model_name ? `&model_name=${encodeURIComponent(args.model_name)}` : ''), kind: 'agnesapi' });
  if (taskId) candidates.push({ url: `${API_BASE}/v1/videos/${encodeURIComponent(taskId)}`, kind: 'v1' });

  let lastErr = null;
  for (const { url, kind } of candidates) {
    try {
      const resp = await http1Fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        timeout: 30000,
      });

      if (!resp.ok) {
        lastErr = `Agnes API 查询失败: ${resp.error}`;
        continue;  // 试下一个候选
      }

      if (resp.status < 200 || resp.status >= 300) {
        const errText = resp.body ? resp.body.slice(0, 200) : '';
        // 404 走兜底
        if (resp.status === 404) {
          lastErr = `Agnes API 查询失败 (404): ${errText}`;
          continue;
        }
        return { error: `Agnes API 查询失败 (${resp.status}): ${errText}`, status_code: resp.status };
      }

      let data;
      try { data = JSON.parse(resp.body); } catch { data = null; }
      if (!data) {
        lastErr = 'Agnes API 返回非 JSON';
        continue;
      }

      // 命中！按端点格式解析
      const result = {
        video_id: data.video_id || (data.id && data.id.startsWith('video_') ? data.id : null) || null,
        task_id: data.task_id || data.id || null,
        status: data.status || 'unknown',
        progress: data.progress ?? null,
      };

      if (data.status === 'completed') {
        // v0.113e: url 在 agnesapi 响应的顶层 url 字段（官方文档 metadata.url 的等价物）；
        //   兼容老字段 remixed_from_video_id / video_url / metadata.url
        result.video_url = data.url
          || (data.metadata && data.metadata.url)
          || data.remixed_from_video_id
          || data.video_url
          || null;
        result.seconds = data.seconds || null;
        result.size = data.size || null;
      }

      if (data.status === 'failed') {
        result.error = data.error || '未知错误';
      }

      result.raw = data;
      result._query_kind = kind;  // 调试用
      return result;
    } catch (e) {
      lastErr = `Agnes API 查询失败: ${e.message}`;
      // 网络/超时错误不试下一个
      return { error: lastErr, status_code: e.name === 'TimeoutError' ? 408 : 0 };
    }
  }

  // 所有候选都失败
  return { error: lastErr || 'Agnes API 查询失败（所有候选端点都失败）' };
}

module.exports = { generateVideo, queryVideo };
