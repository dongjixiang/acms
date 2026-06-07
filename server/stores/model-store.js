// 大模型配置存储 + 能力标注
// capabilities: text(文本) | vision(视觉理解) | json-mode(结构化输出) | extended-thinking(扩展思考) | audio-input(音频输入) | function-calling(工具调用)
const { collection } = require('../db/connection');
const { encrypt, decrypt } = require('../services/crypto');

const store = {
  list() {
    const models = collection('llm_models').all();
    return models.map(m => ({
      ...m, apiKey: '***',
      capabilities: typeof m.capabilities === 'string'
        ? JSON.parse(m.capabilities || '["text"]')
        : (m.capabilities || ['text']),
    }));
  },

  getById(id) {
    const m = collection('llm_models').findOne(mm => mm.id === id);
    if (!m) return null;
    return {
      ...m, apiKey: '***',
      capabilities: typeof m.capabilities === 'string'
        ? JSON.parse(m.capabilities || '["text"]')
        : (m.capabilities || ['text']),
    };
  },

  create({ name, provider, model, baseUrl, apiKey, systemPrompt, api, capabilities }) {
    const id = `model_${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const entry = {
      id, name, provider, model, status: 'active',
      baseUrl: baseUrl || '',
      apiKey: encrypt(apiKey || ''),
      systemPrompt: systemPrompt || '',
      api: api || 'openai-chat',
      capabilities: JSON.stringify(capabilities || ['text']),
      created_at: now, updated_at: now,
    };
    collection('llm_models').insert(entry);
    return { ...entry, apiKey: '***', capabilities: entry.capabilities };
  },

  update(id, updates) {
    if (updates.apiKey) updates.apiKey = encrypt(updates.apiKey);
    if (updates.capabilities) updates.capabilities = JSON.stringify(updates.capabilities);
    const now = new Date().toISOString();
    const result = collection('llm_models').update(m => m.id === id, { ...updates, updated_at: now });
    if (result) return { ...result, apiKey: '***', capabilities: JSON.parse(result.capabilities || '["text"]') };
    return null;
  },

  remove(id) {
    return collection('llm_models').remove(m => m.id === id);
  },

  getDecryptedKey(id) {
    const m = collection('llm_models').findOne(mm => mm.id === id);
    return m ? decrypt(m.apiKey) : '';
  },

  getActive() {
    return collection('llm_models').find(m => m.status === 'active')
      .map(m => ({
        ...m, apiKey: '***',
        capabilities: typeof m.capabilities === 'string'
          ? JSON.parse(m.capabilities || '["text"]')
          : (m.capabilities || ['text']),
      }));
  },

  // ★ 按能力查找活跃模型
  getActiveWithCapability(capability) {
    return collection('llm_models')
      .find(m => {
        if (m.status !== 'active') return false;
        const caps = typeof m.capabilities === 'string'
          ? JSON.parse(m.capabilities || '["text"]')
          : (m.capabilities || ['text']);
        return caps.includes(capability);
      })
      .map(m => ({ ...m, apiKey: '***', capabilities: typeof m.capabilities === 'string'
        ? JSON.parse(m.capabilities || '["text"]')
        : (m.capabilities || ['text'])
      }));
  },

  hasCapability(id, capability) {
    const m = collection('llm_models').findOne(mm => mm.id === id);
    if (!m) return false;
    const caps = typeof m.capabilities === 'string'
      ? JSON.parse(m.capabilities || '["text"]')
      : (m.capabilities || ['text']);
    return caps.includes(capability);
  },
};

module.exports = store;
