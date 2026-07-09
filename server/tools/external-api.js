// ACMS 内建工具 — External API（Agnes 视频 v2.0）类（2 工具）
// 原 tools/index.js 130-175 行提取
// v0.23 L3 拆分：外部 SaaS API 工具独立（API 凭证、限流、稳定性问题隔离）
const { registerTool } = require('../services/tool-registry');
const { generateVideo, queryVideo } = require('./agnes-video');

registerTool({
  name: 'agnes_generate_video',
  description: '使用 Agnes AI Video V2.0 创建视频生成任务。'
    + '支持：文生视频（只需 prompt）、图生视频（+image URL）、多图视频（+extra_images[]）、关键帧动画（+extra_mode="keyframes"）。'
    + '返回 video_id 和 task_id。任务异步执行，之后用 agnes_query_video 查询结果。',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '视频内容的文本描述（文生视频必填）' },
      image: { type: 'string', description: '图生视频：单张参考图片 URL' },
      mode: { type: 'string', enum: ['ti2vid', 'keyframes'], description: '生成模式（ti2vid=图生视频, keyframes=关键帧动画）' },
      height: { type: 'number', description: '视频高度（默认 768）' },
      width: { type: 'number', description: '视频宽度（默认 1152）' },
      num_frames: { type: 'number', description: '视频帧数（≤441，需满足 8n+1 规则，如 81/121/241/441）', default: 121 },
      frame_rate: { type: 'number', description: '视频帧率（1-60，推荐 24）', default: 24 },
      seed: { type: 'number', description: '随机种子，用于生成可复现的结果' },
      negative_prompt: { type: 'string', description: '反向提示词，描述需要避免的内容' },
      extra_images: { type: 'array', items: { type: 'string' }, description: '多图视频/关键帧：额外图片 URL 数组' },
      extra_mode: { type: 'string', description: '附加模式设置，如 "keyframes"' },
    },
    required: ['prompt'],
  },
  async handler(args) {
    return await generateVideo(args);
  },
});

registerTool({
  name: 'agnes_query_video',
  description: '查询 Agnes AI 视频生成任务的状态和结果。'
    + '在 agnes_generate_video 创建任务后使用，返回当前进度和最终视频 URL。'
    + '建议创建任务后间隔 15-30 秒查询，直到 status 为 "completed" 或 "failed"。',
  parameters: {
    type: 'object',
    properties: {
      video_id: { type: 'string', description: '视频 ID（推荐，由 agnes_generate_video 返回）' },
      task_id: { type: 'string', description: '任务 ID（兼容旧版查询）' },
      model_name: { type: 'string', description: '显式指定模型名称（可选，默认 agnes-video-v2.0）' },
    },
  },
  async handler(args) {
    return await queryVideo(args);
  },
});
