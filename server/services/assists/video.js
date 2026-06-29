// ACMS · 视频生成辅助（v0.22.24，2026-06-29）
//   用户输入 prompt + 时长 → 调用 Agnes AI Video V2.0 创建任务
//   支持：文生视频 / 图生视频 / 多图视频 / 关键帧动画
//   异步任务：创建 → 前端轮询查进度 → 完成展示视频 URL
//
// v0.22.24 fix: 多图视频/单图视频的图片源智能解析（端到端 P21 验证后修复）
//   问题：前端剧本传来的 image_urls 是 /api/generate/assets/<id>/<path>（ACMS 本地相对路径）
//         Agnes Video API 是外部服务，无法访问本地 server 的相对路径
//   文档说 image 字段必须是"可公开访问的图片 URL"，但实测发现纯 base64 字符串也接受
//   修法：加 resolveImageUrlToBase64() helper，4 种输入统一转 base64
//     1. data: URI → strip 前缀
//     2. /api/generate/assets/<id>/<path> → 读本地文件转 base64（Agnes 外部可访问）
//     3. http(s):// → curl 下载转 base64（绕开 Node TLS 对 platform-outputs.agnes-ai.space 的 ECONNRESET）
//     4. 纯 base64 字符串 → 直接用
//
// 字段：requirement.assist_video（status / video_id / task_id / prompt / progress / video_url / asset_path / error）

const reqStore = require('../../stores/requirement-store');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../../config');

// v0.22.20: 改用 config.workspaceRoot（之前 2 层 `..` 错位到 server/workspaces/，与 gen.js 读取路径不一致 → 404）
const WORKSPACE_ROOT = config.workspaceRoot;

/**
 * v0.22.24: 把任意图片引用解析成纯 base64 字符串（Agnes Video API 实际接受纯 base64 — 实测确认）
 *   文档说"必须可公开访问的图片 URL"，但端到端测试发现纯 base64 字符串也接受（HTTP 200）
 *   4 种输入统一处理：
 *     1. data: URI（如 data:image/png;base64,XXX）→ strip 前缀取 base64
 *     2. /api/generate/assets/<projectId>/<path>（ACMS 本地相对路径）→ 读本地文件转 base64
 *     3. http(s):// 公网 URL → 用 curl 子进程下载（绕开 Node TLS 对 platform-outputs.agnes-ai.space 的 ECONNRESET）
 *     4. 纯 base64 字符串（无前缀）→ 直接返回
 *   失败返回 null（warn 而不报错，让调用方决定是否跳过这张图）
 */
function resolveImageUrlToBase64(input) {
  if (!input || typeof input !== 'string') return null;
  const url = input.trim();

  // 1. data URI → strip 前缀
  if (url.startsWith('data:')) {
    const idx = url.indexOf('base64,');
    if (idx < 0) return null;
    return url.substring(idx + 'base64,'.length);
  }

  // 2. ACMS 本地路径 → 读文件
  //    路由格式：/api/generate/assets/<projectId>/<workspace-relative-path>
  //    projectId 可能是 ID（用 projectStore.getById 找 slug），对应实际文件路径 workspaces/{slug}/{path}
  const localMatch = url.match(/^\/api\/generate\/assets\/([^/]+)\/(.+)$/);
  if (localMatch) {
    try {
      const projectId = decodeURIComponent(localMatch[1]);
      const relPath = decodeURIComponent(localMatch[2]);
      const projectStore = require('../../stores/project-store');
      const proj = projectStore.getById(projectId);
      const slug = proj?.slug || projectId;
      const fullPath = path.join(WORKSPACE_ROOT, slug, relPath);
      if (!fs.existsSync(fullPath)) {
        console.warn(`[assist:video] 本地图片不存在: ${fullPath}`);
        return null;
      }
      const buf = fs.readFileSync(fullPath);
      return buf.toString('base64');
    } catch (e) {
      console.warn(`[assist:video] 读本地图片失败: ${url.slice(0, 80)}`, e.message);
      return null;
    }
  }

  // 3. 公网 URL → curl 下载（HTTP/1.1 + Schannel，绕开 Node OpenSSL TLS 问题）
  if (/^https?:\/\//i.test(url)) {
    try {
      const { execFileSync } = require('child_process');
      const os = require('os');
      const tmpFile = path.join(os.tmpdir(), `acms-vid-img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
      execFileSync('curl', [
        '-sk', '--http1.1',
        '--connect-timeout', '10', '--max-time', '60',
        '-o', tmpFile, url,
      ], { stdio: ['pipe', 'pipe', 'pipe'] });
      const buf = fs.readFileSync(tmpFile);
      try { fs.unlinkSync(tmpFile); } catch {}
      return buf.toString('base64');
    } catch (e) {
      console.warn(`[assist:video] 下载公网图片失败: ${url.slice(0, 80)}`, e.message || e);
      return null;
    }
  }

  // 4. 纯 base64 字符串（无前缀） → 直接返回
  return url;
}

/**
 * v0.22.7: 保存视频到 workspace assets（与 image_gen 一致）
 *   避免 Agnes CDN expires_at 过期后 ACMS 永远拿不到
 *   路径：workspaces/{projectSlug}/assets/{date}/{safeName}_{hash}.mp4
 */
function saveVideoAsset(projectSlug, buffer, ext, metadata) {
  const dateStr = new Date().toISOString().split('T')[0];
  const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 8);
  const assetsDir = path.join(WORKSPACE_ROOT, projectSlug, 'assets', dateStr);
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
  const safePrompt = (metadata.prompt || 'video').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').substring(0, 40);
  const fileName = `${safePrompt}_${hash}${ext}`;
  const filePath = path.join(assetsDir, fileName);
  fs.writeFileSync(filePath, buffer);
  const assetPath = `assets/${dateStr}/${fileName}`;
  return { assetPath, size: buffer.length };
}

/**
 * v0.22.7: 找项目目录名（与 /api/generate/assets/:projectId/* 路由一致用 slug）
 *   路由用 project.slug 拼路径（workspaces/{slug}/{filePath}）
 *   所以本地保存也必须用 slug，否则 URL 找不到文件
 *   project store 只有 getById（没 getByReqId），用 req.project_id 查
 */
function getProjectDirForReq(reqRec) {
  if (!reqRec?.project_id) return 'default';
  try {
    const projectStore = require('../../stores/project-store');
    const proj = projectStore.getById(reqRec.project_id);
    if (proj?.slug) return proj.slug;
    return reqRec.project_id;  // fallback: project 不存在或没 slug
  } catch (e) { return reqRec.project_id || 'default'; }
}

/**
 * v0.22.7: 下载远程视频到 workspace（供 queryAssistJob + 迁移脚本用）
 *   返回 { assetPath, size } 或 null（失败）
 */
async function downloadVideoToWorkspace(requirementId, videoUrl, metadata) {
  try {
    const c = new AbortController();
    const tid = setTimeout(() => c.abort(), 60000);  // 60s
    const r = await fetch(videoUrl, { signal: c.signal });
    clearTimeout(tid);
    if (!r.ok) {
      console.warn(`[assist:video] ${requirementId} 下载视频失败: HTTP ${r.status}`);
      return null;
    }
    const buffer = Buffer.from(await r.arrayBuffer());
    const slug = getProjectDirForReq(req);
    const saved = saveVideoAsset(slug, buffer, '.mp4', metadata);
    console.log(`[assist:video] ${requirementId} 已保存视频到 ${saved.assetPath} (${(saved.size/1024).toFixed(1)}KB)`);
    return saved;
  } catch (e) {
    console.warn(`[assist:video] ${requirementId} 下载视频异常: ${e.message}`);
    return null;
  }
}

/**
 * 根据目标时长(秒)和帧率计算 num_frames (8n+1 规则)
 */
function calcNumFrames(targetSeconds, frameRate = 24) {
  const targetFrames = Math.round(targetSeconds * frameRate);
  // 8n+1 规则：最接近 targetFrames 的合法值
  let n = Math.round((targetFrames - 1) / 8);
  if (n < 6) n = 6;          // 最小值 n=6 → 49帧 ≈ 2s@24fps
  if (n > 55) n = 55;        // 最大值 n=55 → 441帧 ≈ 18s@24fps
  return 8 * n + 1;
}

/**
 * 运行视频生成任务
 */
async function runAssistJob(requirementId, opts = {}) {
  const req = reqStore.getById(requirementId);
  if (!req) return;

  const prompt = (opts.prompt || '').trim();
  const duration = parseFloat(opts.duration) || 5; // 默认 5 秒
  const imageUrl = (opts.image_url || '').trim();
  const imageFileId = (opts.image_file_id || '').trim(); // v0.19：上传文件 ID
  const imageUrls = opts.image_urls; // v0.22.23：多图视频参考图数组（来自 screenplay）
  const frameRate = parseInt(opts.frame_rate) || 24;

  if (!prompt) {
    reqStore.update(requirementId, {
      assist_video: JSON.stringify({
        status: 'failed',
        error: 'NO_PROMPT',
        prompt: '',
        generated_at: new Date().toISOString(),
      }),
    });
    return;
  }

  // 写 pending 状态
  const numFrames = calcNumFrames(duration, frameRate);
  reqStore.update(requirementId, {
    assist_video: JSON.stringify({
      status: 'generating',
      prompt,
      duration,
      image_url: imageUrl || null,
      image_urls: (imageUrls && Array.isArray(imageUrls)) ? imageUrls : null, // v0.22.23
      num_frames: numFrames,
      frame_rate: frameRate,
      video_id: null,
      task_id: null,
      progress: 0,
      video_url: null,
      error: null,
      started_at: new Date().toISOString(),
    }),
  });

  try {
    const toolRegistry = require('../tool-registry');
    const videoTool = toolRegistry.getTool('agnes_generate_video');
    if (!videoTool) throw new Error('视频生成工具未注册');

let finalImage = imageUrl || null;
    if (imageFileId) {
      try {
        const chatUpload = require('../../services/chat-upload');
        finalImage = chatUpload.readImageAsDataURI(imageFileId) || finalImage;
        // 视频 API 的 image 参数接受图片 URL 或原始 base64
        // data: URI 格式不被接受，去掉前缀只传 base64 数据
        if (finalImage && finalImage.includes('base64,')) {
          finalImage = finalImage.split('base64,')[1] || finalImage;
          console.log(`[assist:video] ${requirementId} 图片已转为 base64 数据`);
        }
      } catch (e) {
        console.warn(`[assist:video] ${requirementId} 读取上传文件失败:`, e.message);
      }
    }

    // v0.22.23: 多图视频支持（screenplay 传入 image_urls 数组）
    //   优先级：image_urls 数组 > 单图 finalImage > 纯文生视频
    //   v0.22.24: image_urls 和 image_url 在传给 Agnes API 前统一转 base64
    //     原因：1) ACMS 本地相对路径 Agnes 外部无法访问
    //           2) image_url_output CDN URL Node fetch ECONNRESET（用 curl 绕开）
    //           3) Agnes 实测接受纯 base64 字符串（http 200）
    const params = { prompt, num_frames: numFrames, frame_rate: frameRate };
    if (imageUrls && Array.isArray(imageUrls) && imageUrls.length > 0) {
      // 多图模式：每张图转 base64，跳过失败的（warn 而不报错）
      const base64Images = [];
      for (const u of imageUrls) {
        const b64 = resolveImageUrlToBase64(u);
        if (b64) base64Images.push(b64);
      }
      if (base64Images.length > 0) {
        // 传给 agnes-video.js 工具（它会把 args.extra_images / extra_mode 转成 body.extra_body.image / mode）
        params.extra_images = base64Images;
        if (base64Images.length > 1) {
          params.extra_mode = 'keyframes';  // 多图用关键帧模式
        }
        console.log(`[assist:video] ${requirementId} 多图视频模式: ${base64Images.length}/${imageUrls.length} 张参考图（已转 base64）`);
      } else {
        console.warn(`[assist:video] ${requirementId} 所有 image_urls 都解析失败，降级为文生视频`);
      }
    } else if (finalImage) {
      // 单图模式：图生视频（同样先转 base64 兼容本地路径/CDN）
      const b64 = resolveImageUrlToBase64(finalImage);
      if (b64) {
        params.image = b64;
      } else {
        console.warn(`[assist:video] ${requirementId} finalImage 解析失败，降级为文生视频`);
      }
    }
    const result = await videoTool.handler(params);

    if (result.error) {
      throw new Error(result.error);
    }

    reqStore.update(requirementId, {
      assist_video: JSON.stringify({
        status: 'done',  // v0.19 fix: 设 done 让 SSE 能正常结束（视频是异步的，用户手动查进度）
        prompt,
        duration,
        image_url: finalImage || null,
        image_urls: (imageUrls && Array.isArray(imageUrls)) ? imageUrls : null, // v0.22.23
        num_frames: numFrames,
        frame_rate: frameRate,
        video_id: result.video_id || null,
        task_id: result.task_id || null,
        progress: result.progress ?? 0,
        video_url: null,
        error: null,
        created_at: new Date().toISOString(),
        raw_response: result,
        // v0.19: 标记是异步任务，前端显示刷新按钮
        async_task: true,
      }),
    });

    console.log(`[assist:video] ${requirementId} 任务已创建, video_id=${result.video_id}, status=${result.status}`);
  } catch (e) {
    console.error(`[assist:video] ${requirementId} 创建失败:`, e.message);
    reqStore.update(requirementId, {
      assist_video: JSON.stringify({
        status: 'failed',
        prompt,
        duration,
        image_url: imageUrl || null,
        image_urls: (imageUrls && Array.isArray(imageUrls)) ? imageUrls : null, // v0.22.23
        num_frames: numFrames,
        frame_rate: frameRate,
        video_id: null,
        task_id: null,
        progress: 0,
        video_url: null,
        error: e.message || '未知错误',
        generated_at: new Date().toISOString(),
      }),
    });
  }
}

/**
 * 查询视频生成进度（用户点「刷新进度」时调用）
 */
async function queryAssistJob(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return { error: '需求不存在' };

  let assist;
  try { assist = JSON.parse(req.assist_video || 'null'); } catch { assist = null; }
  if (!assist) return { error: '没有视频生成记录' };
  if (assist.status === 'failed') return assist;
  // v0.22.6 fix: async_task 模式（v0.19 把 status 一直设 'done' 让 SSE 正常结束），
  //   只有 video_url 拿到才算真完成；否则必须去查 Agnes API
  if (assist.async_task && assist.video_url) return assist;
  if (assist.status === 'done' && !assist.async_task) return assist;

  const videoId = assist.video_id || assist.raw_response?.video_id;
  const taskId = assist.task_id || assist.raw_response?.task_id;

  if (!videoId && !taskId) {
    return { error: '无 video_id/task_id' };
  }

  try {
    const toolRegistry = require('../tool-registry');
    const queryTool = toolRegistry.getTool('agnes_query_video');
    if (!queryTool) throw new Error('视频查询工具未注册');

    const result = await queryTool.handler({ video_id: videoId, task_id: taskId });
    console.log(`[assist:video] ${requirementId} query result: status=${result.status} progress=${result.progress} kind=${result._query_kind || '?'} error=${result.error || '(none)'}`);

    // v0.22.20: error 字段用新查询结果，不要保留旧 error
    //   之前用 result.error || assist.error → 之前 query 失败留的旧 error 一直显示
    //   现在: result 里有 error 就用 result 的（说明这次 query 失败了），否则置 null
    const finalError = (result.status === 'failed') ? (result.error || '未知错误') : (result.error || null);

    const updated = {
      ...assist,
      status: result.status === 'completed' ? 'done'
            : result.status === 'failed' ? 'failed'
            : result.status === 'in_progress' ? 'pending'
            : result.status || assist.status,
      progress: result.progress ?? assist.progress ?? 0,
      video_url: result.video_url || assist.video_url,
      error: finalError,
      last_queried_at: new Date().toISOString(),
    };

    // v0.22.7: Agnes 端完成 + 拿到 video_url + 本地还没保存 → 下载到 workspace
    //   避免 CDN expires_at 过期后 ACMS 永远拿不到这个视频
    if (result.status === 'completed' && result.video_url && !assist.asset_path) {
      const saved = await downloadVideoToWorkspace(requirementId, result.video_url, {
        prompt: assist.prompt || '',
        video_id: videoId,
      });
      if (saved) {
        updated.asset_path = saved.assetPath;
        updated.local_size = saved.size;
        updated.saved_at = new Date().toISOString();
      }
    }

    if (result.raw) updated.last_raw_response = result.raw;

    reqStore.update(requirementId, { assist_video: JSON.stringify(updated) });
    return updated;
  } catch (e) {
    console.error(`[assist:video] ${requirementId} 查询失败:`, e.message);
    // v0.22.20: 只返 error，不 spread 整个 assist（避免带其他陈旧字段）
    return { error: `查询工具异常: ${e.message}` };
  }
}

function getAssist(requirementId) {
  const req = reqStore.getById(requirementId);
  if (!req) return null;
  try { return JSON.parse(req.assist_video || 'null'); } catch { return null; }
}

module.exports = {
  name: 'AI 视频生成（Agnes Video）',
  field: 'assist_video',
  runAssistJob,
  queryAssistJob,
  getAssist,
};
