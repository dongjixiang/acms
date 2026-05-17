// 大模型配置存储
const { collection } = require('../db/connection');
const { encrypt, decrypt } = require('../services/crypto');

const store = {
  list() {
    const models = collection('llm_models').all();
    return models.map(m => ({ ...m, apiKey: '***' })); // 不返回明文
  },

  getById(id) {
    const m = collection('llm_models').findOne(mm => mm.id === id);
    return m ? { ...m, apiKey: '***' } : null;
  },

  create({ name, provider, model, baseUrl, apiKey, systemPrompt, api }) {
    const id = `model_${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const entry = {
      id, name, provider, model, status: 'active',
      baseUrl: baseUrl || '',
      apiKey: encrypt(apiKey || ''),
      systemPrompt: systemPrompt || '',
      api: api || 'openai-chat',
      created_at: now, updated_at: now,
    };
    collection('llm_models').insert(entry);
    return { ...entry, apiKey: '***' };
  },

  update(id, updates) {
    if (updates.apiKey) updates.apiKey = encrypt(updates.apiKey);
    const now = new Date().toISOString();
    return collection('llm_models').update(m => m.id === id, { ...updates, updated_at: now });
  },

  remove(id) {
    return collection('llm_models').remove(m => m.id === id);
  },

  getDecryptedKey(id) {
    const m = collection('llm_models').findOne(mm => mm.id === id);
    return m ? decrypt(m.apiKey) : '';
  },

  getActive() {
    return collection('llm_models').find(m => m.status === 'active').map(m => ({ ...m, apiKey: '***' }));
  },
};

module.exports = store;
