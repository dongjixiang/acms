
const { callLLM } = require('./server/services/llm-adapter');
const modelStore = require('./server/stores/model-store');
async function main() {
  const model = modelStore.getDefaultGenModel();
  console.log('Model:', model ? model.id : 'NONE');
  const r = await callLLM(model.id, [
    { role: 'system', content: 'You are a helper.' },
    { role: 'user', content: 'Reply with just: OK' }
  ], { maxTokens: 100, temperature: 0.1 });
  console.log('Result:', r);
}
main().catch(e => console.error('Error:', e.message));
