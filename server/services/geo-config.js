// ACMS GEO 配置服务（v0.2 — Phase 0）
// 用途：复用现有 modelStore + crypto 体系，按 provider 名读 AI 引擎 API key
// 路径：server/services/geo-config.js
//
// 核心设计（2026-08-29 多多决策）：
//   - 不另存 key，直接复用 modelStore.getDecryptedKey(modelId)
//   - 按 provider 查找 active 模型（一个 provider 多模型取第一个）
//   - setApiKey 改为"更新 modelStore 里的 key"（会同时影响 LLM 调用和 GEO 追踪）
//
// 参考：P150 llm_models.apiKey 是 AES-256-GCM 加密（master key = env ACMS_MASTER_KEY || sha256('acms-dev-master-key')）

const modelStore = require('../stores/model-store');
const { collection } = require('../db/connection');

// provider 名 → modelStore 里的 provider 字段映射
// (perplexity / copilot / grok 都用 OpenAI 兼容协议，映射到同一类)
const PROVIDER_MODEL_MAP = {
  deepseek: 'deepseek',
  openai: 'openai',
  anthropic: 'anthropic',
  perplexity: 'perplexity',
  google: 'google',
  copilot: 'openai',      // 协议同 OpenAI（baseUrl 不同）
  grok: 'openai',         // 协议同 OpenAI（baseUrl 不同）
  minimax: 'minimax',     // v0.27: MiniMax 独立 provider（OpenAI 兼容协议，但独立 provider 名避免与 openai/copilot/grok 抢第一个模型）
  google_ai_mode: 'google', // 协议同 Google
  // v0.1: DeepSeek 网页版引擎（browser-agent 自动化）。
  //   不走 modelStore API key —— 凭据是 agent-browser auth save（chat.deepseek.com 账号密码）。
  //   getModelInfo('deepseek-web') 会返回 null（无 modelStore 记录），由 getProviderStatus 特殊分支处理。
  'deepseek-web': 'deepseek-web',
};

function listProviders() {
  return Object.keys(PROVIDER_MODEL_MAP);
}

// === 设置（调度频率 + 引擎白名单，Phase 3 #3）===
const SETTING_TRACK_INTERVAL_DAYS = 'geo_track_interval_days';
const SETTING_ENGINE_WHITELIST = 'geo_engine_whitelist';
const DEFAULT_TRACK_INTERVAL_DAYS = 7;

function getSettings() {
  try {
    const sysConfigs = collection('system_configs');
    const intervalCfg = sysConfigs.findOne(c => c.key === SETTING_TRACK_INTERVAL_DAYS);
    const whitelistCfg = sysConfigs.findOne(c => c.key === SETTING_ENGINE_WHITELIST);

    let whitelist = [];
    try {
      whitelist = whitelistCfg ? JSON.parse(whitelistCfg.value || '[]') : [];
    } catch { /* 忽略坏 JSON */ }

    return {
      track_interval_days: parseInt(intervalCfg?.value, 10) || DEFAULT_TRACK_INTERVAL_DAYS,
      engine_whitelist: Array.isArray(whitelist) ? whitelist : [],
      // 默认白名单 = 全部已注册引擎
      all_engines: Object.keys(PROVIDER_MODEL_MAP),
    };
  } catch (e) {
    return {
      track_interval_days: DEFAULT_TRACK_INTERVAL_DAYS,
      engine_whitelist: [],
      all_engines: Object.keys(PROVIDER_MODEL_MAP),
    };
  }
}

function setSettings(updates) {
  const sysConfigs = collection('system_configs');
  const results = {};

  if (updates.track_interval_days != null) {
    const days = parseInt(updates.track_interval_days, 10);
    if (isNaN(days) || days < 1 || days > 90) {
      throw new Error('track_interval_days 必须是 1-90 的整数');
    }
    const existing = sysConfigs.findOne(c => c.key === SETTING_TRACK_INTERVAL_DAYS);
    if (existing) sysConfigs.update(c => c.key === SETTING_TRACK_INTERVAL_DAYS, { value: String(days) });
    else sysConfigs.insert({ key: SETTING_TRACK_INTERVAL_DAYS, value: String(days) });
    results.track_interval_days = days;
  }

  if (updates.engine_whitelist != null) {
    if (!Array.isArray(updates.engine_whitelist)) {
      throw new Error('engine_whitelist 必须是数组');
    }
    // 校验引擎名
    const valid = Object.keys(PROVIDER_MODEL_MAP);
    const filtered = updates.engine_whitelist.filter(e => valid.includes(e));
    const existingW = sysConfigs.findOne(c => c.key === SETTING_ENGINE_WHITELIST);
    if (existingW) sysConfigs.update(c => c.key === SETTING_ENGINE_WHITELIST, { value: JSON.stringify(filtered) });
    else sysConfigs.insert({ key: SETTING_ENGINE_WHITELIST, value: JSON.stringify(filtered) });
    results.engine_whitelist = filtered;
  }

  return { ok: true, ...results, ...getSettings() };
}

// 实际跟踪用引擎列表（白名单优先，空则全部）
// v0.1: 默认排除 slow 的网页版引擎（deepseek-web 30-60s/轮），
//       用户在白名单显式勾选后才参与追踪
const WEB_ONLY_ENGINES = ['deepseek-web'];
function getTrackEngines() {
  const settings = getSettings();
  if (settings.engine_whitelist && settings.engine_whitelist.length > 0) {
    return settings.engine_whitelist;
  }
  return Object.keys(PROVIDER_MODEL_MAP).filter(e => !WEB_ONLY_ENGINES.includes(e));
}

// 找到某 provider 在 modelStore 里的 active model id
function findModelIdForProvider(provider) {
  const modelProvider = PROVIDER_MODEL_MAP[provider];
  if (!modelProvider) return null;
  const active = modelStore.getActive();
  const match = active.find(m => m.provider === modelProvider);
  return match ? match.id : null;
}

// 取完整 model 记录（含 baseUrl / model 字段），给引擎适配器用
function getModelInfo(provider) {
  const modelProvider = PROVIDER_MODEL_MAP[provider];
  if (!modelProvider) return null;
  const active = modelStore.getActive();
  const match = active.find(m => m.provider === modelProvider);
  if (!match) return null;
  // 拿真实 key（不要 modelStore.getById 拿到的 '***'）
  const apiKey = modelStore.getDecryptedKey(match.id);
  if (!apiKey) return null;
  return {
    id: match.id,
    name: match.name,
    provider: match.provider,
    model: match.model,
    baseUrl: match.baseUrl,
    apiKey,
    capabilities: match.capabilities || [],
  };
}

function getApiKey(provider) {
  const info = getModelInfo(provider);
  return info ? info.apiKey : null;
}

function setApiKey(provider, apiKey) {
  const modelId = findModelIdForProvider(provider);
  if (!modelId) {
    throw new Error(
      `${provider} 未在模型管理里注册。`
      + `请先在系统管理 → AI 模型配置里添加 ${PROVIDER_MODEL_MAP[provider] || provider} 模型，`
      + `配置 API Key 后 GEO 工具自动可用。`
    );
  }
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('API Key 必须是非空字符串');
  }
  // 修复（2026-08-29）：之前没 try/catch 包 modelStore.update，遇到 model-store.js line 49 JSON.parse bug
  //   → silent write（DB 写入成功但 throw 让调用方误以为失败）→ 我自己脚本测试时覆盖了多多的真实 DeepSeek key
  //   防御：try/catch 包整个 update 调用；写失败要恢复 DB（实际写入了但 return 失败的可能性也包含）
  //   简化策略：依赖 model-store.js line 49 的 try/catch 修复，调用方只信任 result 返回值
  let result;
  try {
    result = modelStore.update(modelId, { apiKey });
  } catch (e) {
    throw new Error(`更新模型 ${modelId} 失败：${e.message}（请检查 model-store.js JSON.parse bug）`);
  }
  if (!result) throw new Error(`模型 ${modelId} 不存在`);
  return { ok: true, provider, model_id: modelId, length: apiKey.length };
}

function getProviderStatus() {
  const result = {};
  for (const name of Object.keys(PROVIDER_MODEL_MAP)) {
    // v0.1: 网页版引擎特殊分支 —— 不走 modelStore，凭据是 agent-browser auth save
    if (name === 'deepseek-web') {
      result[name] = {
        configured: true,
        web: true,
        model_name: 'chat.deepseek.com（网页版 + 智能搜索）',
        base_url: 'https://chat.deepseek.com/',
        note: '凭据走 agent-browser auth save（DeepSeek 账号密码，2026-08-31 已配置）。每轮 30-60s，适合抽样追踪。',
      };
      continue;
    }
    const info = getModelInfo(name);
    if (info) {
      const key = info.apiKey;
      result[name] = {
        configured: true,
        model_id: info.id,
        model_name: info.name,
        model_field: info.model,
        base_url: info.baseUrl,
        key_length: key.length,
        key_preview: key.slice(0, 4) + '...' + key.slice(-4),
      };
    } else {
      result[name] = {
        configured: false,
        reason: !PROVIDER_MODEL_MAP[name] ? 'unknown_provider' : 'no_active_model_in_modelstore',
      };
    }
  }
  return result;
}

module.exports = {
  PROVIDERS: Object.keys(PROVIDER_MODEL_MAP),
  PROVIDER_MODEL_MAP,
  findModelIdForProvider,
  getModelInfo,
  getApiKey,
  setApiKey,
  listProviders,
  getProviderStatus,
  // Phase 3 #3
  getSettings,
  setSettings,
  getTrackEngines,
  SETTING_TRACK_INTERVAL_DAYS,
  SETTING_ENGINE_WHITELIST,
};