// 直测 Agnes AI vision 能力（绕过 MiniMax 429）
const path = require('path');
const knowledgeScanner = require(path.resolve('server/services/knowledge-scanner'));

const target = process.argv[2] || 'C:\\Users\\swede\\Pictures\\_analyze_zhm.jpg';

(async () => {
  // analyzeFileWithLLM 会自己选 vision 模型（目前选 MiniMax）—— 这里强制测 Agnes
  // 直接模拟 analyzeFileWithLLM 内部逻辑，但指定 Agnes 模型
  const modelStore = require(path.resolve('server/stores/model-store'));
  const { callLLM } = require(path.resolve('server/services/llm-adapter'));
  const fs = require('fs');

  const visionModels = modelStore.getActiveWithCapability('vision');
  console.log('[TEST] vision models (order):', visionModels.map(m => `${m.name}(${m.id})`).join(' | '));

  // 测每个 vision 模型
  for (const model of visionModels) {
    const t0 = Date.now();
    try {
      const imageBuffer = fs.readFileSync(target);
      const base64Data = imageBuffer.toString('base64');
      const mimeType = 'image/jpeg';
      const messages = [{ role: 'user', content: [{ type: 'text', text: '用一句话描述这张图' }, { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } }] }];
      const result = await callLLM(model.id, messages, { temperature: 0.3, maxTokens: 200 });
      console.log(`[TEST] ${model.name}: OK (${Date.now()-t0}ms) -> ${(result.content||'').slice(0,80)}`);
    } catch (e) {
      console.log(`[TEST] ${model.name}: FAIL (${Date.now()-t0}ms) -> ${e.message.slice(0,200)}`);
    }
  }
  process.exit(0);
})().catch(e => { console.error('[TEST] ERR', e.message); process.exit(1); });
setTimeout(() => { console.error('[TEST] FORCE_TIMEOUT'); process.exit(3); }, 60000);
