// 生成器配置存储 — 管理图片/音频生成器的 provider 配置和密钥
// 设计模式: 仿 model-store.js（加密 API Key + JSON 存储）
const { collection } = require('../db/connection');
const { encrypt, decrypt } = require('../services/crypto');

const store = {
  // 列出所有生成器
  list(type) {
    let gens = collection('generators').all();
    if (type) gens = gens.filter(g => g.type === type);
    return gens.map(g => ({ ...g, config: { ...JSON.parse(g.config || '{}'), apiKey: '***' } }));
  },

  // 获取单个生成器
  getById(id) {
    const g = collection('generators').findOne(gg => gg.id === id);
    return g ? { ...g, config: { ...JSON.parse(g.config || '{}'), apiKey: '***' } } : null;
  },

  // 创建生成器
  create({ id, type, provider, name, config = {}, modelRef = '' }) {
    const now = new Date().toISOString();
    const configStore = { ...config };
    if (configStore.apiKey) configStore.apiKey = encrypt(configStore.apiKey);
    const entry = {
      id, type, provider, name,
      status: 'active',
      model_ref: modelRef || '',
      config: JSON.stringify(configStore),
      created_at: now, updated_at: now,
    };
    collection('generators').insert(entry);
    return { ...entry, config: { ...config, apiKey: '***' } };
  },

  // 更新生成器
  update(id, updates) {
    if (updates.config && typeof updates.config === 'object') {
      // v0.3.6：合并现有 config，避免覆盖已有加密字段
      const existing = collection('generators').findOne(g => g.id === id);
      let existingConfig = {};
      try { existingConfig = JSON.parse(existing?.config || '{}'); } catch {}
      // 保留已有的 apiKey（如果本次没传新 key）和 _fromModelRef 标记
      const merged = { ...existingConfig, ...updates.config };
      if (updates.config.apiKey) {
        merged.apiKey = encrypt(updates.config.apiKey);
      } else {
        // 没传新 key，保留已有的（可能已加密）
        merged.apiKey = existingConfig.apiKey || '';
      }
      delete merged._fromModelRef;
      updates.config = JSON.stringify(merged);
    }
    const now = new Date().toISOString();
    return collection('generators').update(g => g.id === id, { ...updates, updated_at: now });
  },

  // 删除生成器
  remove(id) {
    return collection('generators').remove(g => g.id === id);
  },

  // 加密密钥读取（给 gen-adapter 内部使用）
  getDecryptedConfig(id) {
    const g = collection('generators').findOne(gg => gg.id === id);
    if (!g) return null;
    const cfg = JSON.parse(g.config || '{}');
    // 如果没有配置 apiKey，但有 modelRef，从模型取
    if (!cfg.apiKey && g.model_ref) {
      try {
        const modelStore = require('./model-store');
        const modelKey = modelStore.getDecryptedKey(g.model_ref);
        if (modelKey) {
          cfg.apiKey = modelKey;
          cfg._fromModelRef = true;  // 标记来源，避免重复解密
        }
      } catch (e) { /* 模型不存在或无法解密 */ }
    }
    if (cfg.apiKey && cfg.apiKey !== '***' && !cfg._fromModelRef) cfg.apiKey = decrypt(cfg.apiKey);
    return { ...g, config: cfg };
  },

  // 根据类型和标签获取最佳匹配的生成器
  getBestMatch(type, tags = []) {
    const gens = collection('generators')
      .find(g => g.type === type && g.status === 'active')
      .sort((a, b) => (JSON.parse(a.config || '{}').priority || 99) - (JSON.parse(b.config || '{}').priority || 99));
    if (gens.length === 0) return null;

    // 如果有标签匹配，优先返回匹配度高的
    if (tags.length > 0) {
      for (const gen of gens) {
        const cfg = JSON.parse(gen.config || '{}');
        const matchTags = cfg.matchTags || [];
        if (matchTags.some(t => tags.includes(t))) {
          return module.exports.getDecryptedConfig(gen.id);
        }
      }
    }
    // 无标签匹配，返回优先级最高的
    return module.exports.getDecryptedConfig(gens[0].id);
  },
};

module.exports = store;
