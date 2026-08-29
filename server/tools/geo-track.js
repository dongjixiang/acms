// ACMS GEO 工具注册（v0.2 — Phase 1 Week 1）
// 用途：暴露 4 个 GEO 工具给 LLM（小吉 / 需求流 / Kanban agent）
// 路径：server/tools/geo-track.js
//
// 四个工具：
//   1. geo_track_brand          — 查单个引擎怎么介绍某品牌/话题
//   2. geo_track_brand_multi    — 同时查 N 个引擎返回对比（Phase 1 新增）
//   3. geo_check_visibility     — 检查品牌是否被引擎引用
//   4. geo_list_engines         — 列出已配置引擎状态
//
// v0.2 修订（2026-08-29）：
//   - engine enum 从 ['deepseek'] 扩到 4 个（DeepSeek/OpenAI/Claude/Perplexity）
//   - 新增 geo_track_brand_multi 支持多引擎对比
//   - 所有适配器统一返回 citations 字段（Perplexity 带数据，其他空数组）

const { registerTool } = require('../services/tool-registry');
const GEO_ENGINES = require('../services/geo-engines');
const GEO_CONFIG = require('../services/geo-config');

const SUPPORTED_ENGINES = ['deepseek', 'openai', 'claude', 'perplexity', 'gemini', 'copilot', 'grok', 'google_ai_mode'];

// === 工具 1: geo_track_brand（单引擎） ===
registerTool({
  name: 'geo_track_brand',
  description: '查询单个 AI 搜索引擎怎么介绍/回答某个品牌、产品或话题。'
    + '当用户指定某个引擎（"用 deepseek 查..."）或只关心一个引擎时使用。'
    + '返回 AI 引擎的原始回答 + 元数据（模型、耗时、token 消耗、citations）。'
    + '【Phase 1】支持 deepseek / openai / claude / perplexity（key 复用 AI 模型管理里的配置）。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '向 AI 引擎提出的问题（必填）' },
      engine: { type: 'string', enum: SUPPORTED_ENGINES, description: '目标 AI 引擎，默认 deepseek', default: 'deepseek' },
      brand: { type: 'string', description: '品牌/产品名（可选，用于数据追踪归档）' },
      model: { type: 'string', description: '模型版本（可选，留空用模型管理里的默认）' },
    },
    required: ['query'],
  },
  pool: { domain: 'web', risk: 'read' },
  async handler(args, ctx = {}) {
    const { query, engine = 'deepseek', brand = null, model = null } = args;
    const eng = GEO_ENGINES.getEngine(engine);
    if (!eng) {
      return {
        ok: false,
        error: 'UNKNOWN_ENGINE',
        message: `引擎 ${engine} 未配置或不支持。当前支持：${GEO_ENGINES.listEngines().join(', ')}`,
      };
    }
    const result = await eng.query(query, model ? { model } : {});
    if (result.ok) {
      result.brand = brand;
      result.user_query = query;
      result.ts = Date.now();
    }
    return result;
  },
});

// === 工具 2: geo_track_brand_multi（多引擎对比，Phase 1 新增） ===
registerTool({
  name: 'geo_track_brand_multi',
  description: '同时查询多个 AI 搜索引擎并返回对比结果。'
    + '当用户说"对比一下 X 在所有 AI 里怎么被介绍""X 在不同 AI 引擎的可见性"等时使用。'
    + '返回每个引擎的独立结果 + 汇总（成功率/平均耗时/total_tokens）。'
    + '【Phase 1】支持 deepseek / openai / claude / perplexity 并发查询（最慢的引擎决定总耗时）。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '向 AI 引擎提出的问题（必填）' },
      engines: {
        type: 'array',
        items: { type: 'string', enum: SUPPORTED_ENGINES },
        description: '要查询的引擎列表（必填，2-4 个）',
      },
      brand: { type: 'string', description: '品牌/产品名（可选）' },
    },
    required: ['query', 'engines'],
  },
  pool: { domain: 'web', risk: 'read' },
  async handler(args, ctx = {}) {
    const { query, engines, brand = null } = args;
    if (!Array.isArray(engines) || engines.length === 0) {
      return { ok: false, error: 'INVALID_ENGINES', message: 'engines 必须是非空数组' };
    }
    if (engines.length > 4) {
      return { ok: false, error: 'TOO_MANY_ENGINES', message: '最多 4 个引擎（Phase 1 限制）' };
    }

    // 并发查询所有引擎（Promise.allSettled 不让一个失败拖垮所有）
    const startTs = Date.now();
    const promises = engines.map(async (engineName) => {
      const eng = GEO_ENGINES.getEngine(engineName);
      if (!eng) {
        return {
          engine: engineName,
          ok: false,
          error: 'UNKNOWN_ENGINE',
          message: `引擎 ${engineName} 不支持`,
        };
      }
      try {
        return await eng.query(query);
      } catch (e) {
        return {
          engine: engineName,
          ok: false,
          error: 'EXCEPTION',
          message: e.message,
        };
      }
    });

    const results = await Promise.all(promises);
    const totalLatency = Date.now() - startTs;

    // 汇总
    const successCount = results.filter(r => r.ok).length;
    const totalTokens = results.reduce((sum, r) => {
      return sum + (r.usage?.total_tokens || 0);
    }, 0);

    return {
      ok: true,
      query,
      brand,
      ts: Date.now(),
      engines: results.map(r => ({
        engine: r.engine,
        ok: r.ok,
        text: r.ok ? r.text : null,
        citations: r.ok ? r.citations || [] : null,
        error: r.ok ? null : r.error,
        message: r.ok ? null : r.message,
        model: r.model || null,
        latency_ms: r.latency_ms || 0,
        usage: r.usage || null,
      })),
      summary: {
        total_engines: engines.length,
        success_count: successCount,
        error_count: engines.length - successCount,
        success_rate: engines.length > 0 ? Math.round((successCount / engines.length) * 100) / 100 : 0,
        total_latency_ms: totalLatency,
        total_tokens: totalTokens,
      },
    };
  },
});

// === 工具 3: geo_check_visibility ===
registerTool({
  name: 'geo_check_visibility',
  description: '检查某个品牌/产品在 AI 引擎的回答里是否被引用，输出提及次数。'
    + '当用户问"X 在 AI 搜索里被提了几次""X 在 AI 里被提到了吗"等可见性问题时使用。'
    + '返回 AI 原始回答 + visibility 子对象（mentioned/mention_count）。',
  parameters: {
    type: 'object',
    properties: {
      brand: { type: 'string', description: '品牌名（必填，会在 AI 回答里大小写不敏感地检索）' },
      query: { type: 'string', description: '查询问题（必填）' },
      engine: { type: 'string', enum: SUPPORTED_ENGINES, default: 'deepseek' },
    },
    required: ['brand', 'query'],
  },
  pool: { domain: 'web', risk: 'read' },
  async handler(args, ctx = {}) {
    const { brand, query, engine = 'deepseek' } = args;
    const eng = GEO_ENGINES.getEngine(engine);
    if (!eng) {
      return { ok: false, error: 'UNKNOWN_ENGINE', message: `引擎 ${engine} 不支持` };
    }
    const result = await eng.query(query);
    if (!result.ok) return result;

    // 大小写不敏感计数（处理正则特殊字符）
    const text = result.text || '';
    const escapedBrand = brand.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = text.toLowerCase().match(new RegExp(escapedBrand, 'g')) || [];

    result.brand = brand;
    result.user_query = query;
    result.ts = Date.now();
    result.visibility = {
      brand,
      mentioned: matches.length > 0,
      mention_count: matches.length,
      text_length: text.length,
      query,
      engine,
    };
    return result;
  },
});

// === 工具 4: geo_list_engines ===
registerTool({
  name: 'geo_list_engines',
  description: '列出 GEO 应用当前支持的 AI 搜索引擎及其 API Key 配置状态。'
    + '用于排查"为什么工具调不通"问题（未配置的引擎会显示 configured=false）。'
    + '返回每个引擎的状态：configured / model_name / base_url / key_preview。'
    + '【重要】API Key 复用系统管理 → AI 模型管理里的配置，无需在 GEO 单独配。',
  parameters: { type: 'object', properties: {} },
  pool: { domain: 'web', risk: 'read' },
  async handler() {
    const engines = GEO_ENGINES.listEngines();
    const status = GEO_CONFIG.getProviderStatus();
    return {
      ok: true,
      total_supported: engines.length,
      total_configured: engines.filter(n => status[n]?.configured).length,
      engines: engines.map(name => ({
        name,
        info: GEO_ENGINES.getEngineInfo(name),
        status: status[name],
      })),
      note: '【Phase 1 Week 1】支持 deepseek / openai / claude / perplexity；Week 2 接入 google / copilot / grok / google_ai_mode',
      hint: 'key 配置位置: 系统管理 → AI 模型管理（共享 LLM 配置）',
    };
  },
});

console.log('[geo-track] GEO 工具已注册: geo_track_brand, geo_track_brand_multi, geo_check_visibility, geo_list_engines');