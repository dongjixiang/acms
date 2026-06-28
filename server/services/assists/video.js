// ACMS · 视频生成辅助（v0.19，2026-06-27）
//   用户输入 prompt + 时长 → 调用 Agnes AI Video V2.0 创建任务
//   支持：文生视频 / 图生视频
//   异步任务：创建 → 前端轮询查进度 → 完成展示视频 URL
//
// 字段：requirement.assist_video（status / video_id / task_id / prompt / progress / video_url / error）

const reqStore = require('../../stores/requirement-store');

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
    const params = { prompt, num_frames: numFrames, frame_rate: frameRate };
    if (finalImage) params.image = finalImage;

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
  if (assist.status === 'done' || assist.status === 'failed') return assist;

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

    const updated = {
      ...assist,
      status: result.status === 'completed' ? 'done'
            : result.status === 'failed' ? 'failed'
            : result.status === 'in_progress' ? 'pending'
            : result.status || assist.status,
      progress: result.progress ?? assist.progress ?? 0,
      video_url: result.video_url || assist.video_url,
      error: result.error || assist.error,
      last_queried_at: new Date().toISOString(),
    };

    if (result.raw) updated.last_raw_response = result.raw;

    reqStore.update(requirementId, { assist_video: JSON.stringify(updated) });
    return updated;
  } catch (e) {
    console.error(`[assist:video] ${requirementId} 查询失败:`, e.message);
    return { ...assist, error: e.message };
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
