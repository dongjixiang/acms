// 图片专家 Agent — 调 AGNES AI 生图 API
const llmAdapter = require('../services/llm-adapter');
const modelStore = require('../stores/model-store');

const SYSTEM_PROMPT = `你是 ACMS 的图片生成专家。根据画面描述调生图 API，返回 dataUrl。
只输出 JSON：{"op":"genImageResult","imageDataUrl":"data:image/png;base64,...","width":1024,"height":1024}`;

async function handle({ instruction, context, modelId, caller, agentId }) {
  const model = modelId ? modelStore.getById(modelId) : modelStore.getDefaultGenModel();
  if (!model) return { ok: false, error: '模型未配置' };

  // 这里先返回占位，实际生图由前端 bridge 完成
  // Word 专家在收到 genImageResult 后调生图 API
  return {
    ok: true,
    action: {
      op: 'genImageRequest',
      prompt: instruction,
      summary: context?.summary || 'AI 生成插图'
    }
  };
}

module.exports = {
  id: 'agent-image-expert',
  name: '图片专家',
  domain: 'image',
  role: 'worker',
  systemPrompt: SYSTEM_PROMPT,
  handler: handle
};
