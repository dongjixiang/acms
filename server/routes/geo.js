// ACMS GEO 应用 REST API（v0.1 — Phase 0 D5）
// 路径：server/routes/geo.js
//
// 设计参考：
//   - server/routes/skills.js（最简单模板：router.get('/') + router.get('/:id')）
//   - server/routes/admin.js（认证 + 错误处理）
//   - P105：参数化路由（:id）必须注册在静态路由之后

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const store = require('../services/geo-store');
const llmsGen = require('../services/geo-llms-txt-generator');
const geoConfig = require('../services/geo-config');
const geoEngines = require('../services/geo-engines');
const eventBus = require('../services/event-bus');
const pdfReport = require('../services/geo-pdf-report'); // v0.29: PDF 报告下载用 (OUTPUT_DIR)

// v0.3 (Phase 4): 报告生成完成 → 前端通知（链路见 P177）
async function notifyReportDone(title, desc, type) {
  try {
    await eventBus.emit('geo.report.done', { payload: { title, desc, type: type || 'success' } });
  } catch (e) { /* 通知失败不影响主流程 */ }
}

// === 健康检查（必须注册在 :id 之前）===
router.get('/health', (req, res) => {
  try {
    const engineStatus = geoConfig.getProviderStatus();
    const tableCount = Object.keys(store.COLLECTIONS).length;
    const brandCount = store.listBrands().length;
    res.json({
      ok: true,
      phase: 'Phase 0 D5',
      timestamp: new Date().toISOString(),
      tables: tableCount,
      brands: brandCount,
      engines_configured: Object.values(engineStatus).filter(s => s.configured).length,
      engines_total: Object.keys(engineStatus).length,
      llms_txt_dir: llmsGen.OUTPUT_DIR,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === 引擎配置（类似 geo_list_engines 工具的 HTTP 版本）===
router.get('/engines', (req, res) => {
  try {
    const status = geoConfig.getProviderStatus();
    // v0.25: 附加每个引擎的联网搜索能力位
    const capabilities = {};
    for (const name of Object.keys(geoEngines.ENGINES)) {
      const info = geoEngines.getEngineInfo(name);
      capabilities[name] = info?.capability || { search: 'none' };
    }
    res.json({
      ok: true,
      engines: status,
      capabilities,
      note: 'search 能力位: native=引擎自带联网搜索 / planned=官方支持但适配器待改造 / none=官方无搜索参数（裸 LLM）',
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === Brands（增删改查）===
router.get('/brands', (req, res) => {
  try {
    res.json({ ok: true, brands: store.listBrands(), count: store.listBrands().length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// v0.26 C7: 创建品牌（auto_generate_prompts=true 时自动 LLM 生成 prompts — 简化版 onboarding）
router.post('/brands', async (req, res) => {
  try {
    const { auto_generate_prompts = false } = req.body || {};
    const brand = store.createBrand(req.body || {});
    // C7 钩子：创建后自动生成 prompts（复用 C2a LLM 生成器，非阻塞 — 失败不影响品牌创建）
    let autoGen = null;
    if (auto_generate_prompts) {
      try {
        const promptLLM = require('../services/geo-prompt-llm');
        const genResult = await promptLLM.generateAndPersistPrompts(brand.id);
        autoGen = { ok: genResult.ok, count: genResult.count || 0, error: genResult.error || null };
      } catch (e) {
        autoGen = { ok: false, error: e.message };
      }
    }
    res.json({ ok: true, brand, auto_generated_prompts: autoGen });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ⚠️ P105：静态路由 /brands/:id/stats 必须在 :id 之前注册
router.get('/brands/:id/stats', (req, res) => {
  try {
    const stats = store.getBrandStats(req.params.id);
    res.json({ ok: true, stats });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/brands/:id', (req, res) => {
  try {
    const brand = store.getBrand(req.params.id);
    if (!brand) return res.status(404).json({ ok: false, error: 'BRAND_NOT_FOUND' });
    res.json({ ok: true, brand });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.patch('/brands/:id', (req, res) => {
  try {
    const brand = store.updateBrand(req.params.id, req.body || {});
    if (!brand) return res.status(404).json({ ok: false, error: 'BRAND_NOT_FOUND' });
    res.json({ ok: true, brand });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.delete('/brands/:id', (req, res) => {
  try {
    const ok = store.deleteBrand(req.params.id);
    if (!ok) return res.status(404).json({ ok: false, error: 'BRAND_NOT_FOUND' });
    res.json({ ok: true, deleted: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === Queries ===
router.get('/queries', (req, res) => {
  try {
    const queries = store.listQueries(req.query.brand_id);
    res.json({ ok: true, queries, count: queries.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// v0.26 C2a: LLM 自动生成 prompts（借鉴 elmo onboarding analyze）— v0.29 增 replace 选项
router.post('/queries/ai-generate', async (req, res) => {
  try {
    const { brand_id, engine_targets, replace = false } = req.body || {};
    if (!brand_id) return res.status(400).json({ ok: false, error: 'BRAND_ID_REQUIRED' });
    const promptLLM = require('../services/geo-prompt-llm');
    const result = await promptLLM.generateAndPersistPrompts(brand_id, { engine_targets, replace });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// v0.26 C1c: 批量导入 prompts（借鉴 elmo parseBulkPrompts）
router.post('/queries/bulk', (req, res) => {
  try {
    const { brand_id, text, engine_targets = ['deepseek', 'openai', 'claude', 'perplexity'], tags = [] } = req.body || {};
    if (!brand_id) return res.status(400).json({ ok: false, error: 'BRAND_ID_REQUIRED' });
    if (!text) return res.status(400).json({ ok: false, error: 'TEXT_REQUIRED' });
    const bulk = require('../services/geo-bulk-prompts');
    const existing = store.listQueries(brand_id).map(q => q.prompt);
    const parsed = bulk.parseBulkPrompts(text, { existing });
    const created = store.bulkCreateQueries({
      brand_id,
      prompts: parsed.added,
      engine_targets,
      source: 'bulk_import',
      tags,
    });
    res.json({ ok: true, count: created.length, queries: created, skipped: parsed.skipped, skipped_desc: bulk.describeSkipped(parsed.skipped) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// v0.26 C1a: 更新 query（enabled 开关 / tags 编辑）
router.patch('/queries/:id', (req, res) => {
  try {
    const { enabled, tags, category } = req.body || {};
    const updates = {};
    if (enabled !== undefined) updates.enabled = !!enabled;
    if (Array.isArray(tags)) updates.tags = tags;
    if (category !== undefined) updates.category = category;
    const result = store.updateQuery(req.params.id, updates);
    res.json({ ok: true, updated: result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// v0.26 C5: 迁移旧 legacy queries（完整问句 → 标记 + 停用）
router.post('/queries/migrate', (req, res) => {
  try {
    const { brand_id, disable_legacy = true } = req.body || {};
    if (!brand_id) return res.status(400).json({ ok: false, error: 'BRAND_ID_REQUIRED' });
    const migrate = require('../services/geo-migrate');
    const result = migrate.migrateLegacyQueries(brand_id, { disableLegacy: disable_legacy });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === Onboarding 向导（v0.26 C7 完整版 — 借鉴 elmo analyze/apply） ===

// 1. 分析品牌 → 返回 5 类建议（LLM 跑 10-30 秒）
router.post('/onboarding/analyze', async (req, res) => {
  try {
    const { brand_id } = req.body || {};
    if (!brand_id) return res.status(400).json({ ok: false, error: 'BRAND_ID_REQUIRED' });
    const brand = store.getBrand(brand_id);
    if (!brand) return res.status(404).json({ ok: false, error: 'BRAND_NOT_FOUND' });
    const onboarding = require('../services/geo-onboarding');
    const result = await onboarding.analyzeBrand(brand);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 2. 应用 review 结果 → 保存 brand/competitors/prompts
router.post('/onboarding/apply', (req, res) => {
  try {
    const { brand_id, data } = req.body || {};
    if (!brand_id) return res.status(400).json({ ok: false, error: 'BRAND_ID_REQUIRED' });
    const onboarding = require('../services/geo-onboarding');
    const result = onboarding.applyOnboarding(brand_id, data || {});
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// v0.24: 模板健康度——数量/类别覆盖/触发率/0 触发清单
router.get('/queries/health', (req, res) => {
  try {
    const brandId = req.query.brand_id;
    const queries = store.listQueries(brandId);
    const responses = store.listResponses({ brand_id: brandId });
    const categoryCount = {};
    queries.forEach(q => { categoryCount[q.category || 'general'] = (categoryCount[q.category || 'general'] || 0) + 1; });
    // 每 query 触发率（提及率）
    const qTriggers = {};
    const brand = brandId ? store.getBrand(brandId) : null;
    responses.forEach(r => {
      if (r.error) return;
      if (!qTriggers[r.query_id]) qTriggers[r.query_id] = { total: 0, mentioned: 0 };
      qTriggers[r.query_id].total++;
      const text = (r.raw_answer || '').toLowerCase();
      const bName = (brand?.name || '').toLowerCase();
      const bDomain = (brand?.domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
      if ((bName && text.includes(bName)) || (bDomain && text.includes(bDomain))) qTriggers[r.query_id].mentioned++;
    });
    const zeroTrigger = queries
      .filter(q => qTriggers[q.id] && qTriggers[q.id].mentioned === 0)
      .map(q => ({ id: q.id, prompt: q.prompt, category: q.category || 'general' }));
    const unrun = queries
      .filter(q => !qTriggers[q.id])
      .map(q => ({ id: q.id, prompt: q.prompt, category: q.category || 'general' }));
    const triggered = queries.filter(q => qTriggers[q.id] && qTriggers[q.id].mentioned > 0).length;
    res.json({
      ok: true,
      total: queries.length,
      triggered,
      zero_trigger: zeroTrigger.length,
      unrun: unrun.length,
      zero_trigger_ratio: queries.length ? Math.round((zeroTrigger.length / queries.length) * 100) : 0,
      by_category: categoryCount,
      zero_trigger_list: zeroTrigger.slice(0, 20),
      note: '触发率 = 该模板问出的回答里提到品牌的比例。「跑过未触发」= 问不出品牌，建议调整措辞或删除；「未跑过」= 还没跟踪到，跑一次跟踪后自动判定。',
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/queries', (req, res) => {
  try {
    const q = store.createQuery(req.body || {});
    res.json({ ok: true, query: q });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.delete('/queries/:id', (req, res) => {
  try {
    const result = store.deleteQuery(req.params.id, { cascade: true }); // v0.26: 级联删 responses
    res.json({ ok: true, deleted: result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// v0.26: 批量清理历史 legacy 模板（完整问句 — 指标失真根源，级联删 responses）
router.delete('/queries/legacy', (req, res) => {
  try {
    const { include_test = false } = req.query || {};
    const result = store.cleanupLegacyQueries({ includeTest: include_test === 'true' });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === Responses ===
router.get('/responses', (req, res) => {
  try {
    const responses = store.listResponses({
      brand_id: req.query.brand_id,
      query_id: req.query.query_id,
      engine: req.query.engine,
    });
    res.json({ ok: true, responses, count: responses.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === Scores ===
router.get('/scores', (req, res) => {
  try {
    const scores = store.listScores({
      brand_id: req.query.brand_id,
      dimension: req.query.dimension,
      snapshot_id: req.query.snapshot_id,
    });
    res.json({ ok: true, scores, count: scores.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === Snapshots ===
router.get('/snapshots', (req, res) => {
  try {
    const snapshots = store.listSnapshots(req.query.brand_id);
    res.json({ ok: true, snapshots, count: snapshots.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === llms.txt 生成（HTTP 版本，绕过工具调用）===
router.post('/llms-txt/generate', async (req, res) => {
  try {
    const { url, save = true, filename = null } = req.body || {};
    if (!url) return res.status(400).json({ ok: false, error: 'URL_REQUIRED' });
    const result = await llmsGen.generate(url, { save, filename });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === 数据导出（CSV / JSON）===
router.get('/export', (req, res) => {
  try {
    const { brand_id, format = 'json', type = 'responses' } = req.query;
    const store = require('../services/geo-store');
    const formatLower = String(format).toLowerCase();
    const typeLower = String(type).toLowerCase();

    let data = null;
    let filename = 'geo_export';

    if (typeLower === 'responses') {
      const responses = store.listResponses({ brand_id });
      if (formatLower === 'csv') {
        const header = ['ts', 'brand_id', 'query_id', 'engine', 'model', 'status', 'latency_ms', 'total_tokens', 'text_preview'];
        const rows = responses.map(r => [
          new Date(r.ts || 0).toISOString(),
          r.brand_id, r.query_id, r.engine, r.model || '',
          r.error ? 'error' : 'ok',
          r.latency_ms || 0,
          r.usage?.total_tokens || 0,
          String(r.raw_answer || '').replace(/[\r\n,]/g, ' ').slice(0, 200),
        ]);
        const csv = [header.join(','), ...rows.map(row => row.join(','))].join('\n');
        filename = `geo_responses_${brand_id || 'all'}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send('\uFEFF' + csv); // BOM 让 Excel 正确识别 UTF-8
      }
      if (formatLower === 'xlsx') {
        // Phase 4: 用 exceljs 生成真 xlsx
        const ExcelJS = require('exceljs');
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('GEO Responses');
        ws.columns = [
          { header: '时间', key: 'ts', width: 24 },
          { header: '引擎', key: 'engine', width: 14 },
          { header: '模型', key: 'model', width: 20 },
          { header: '状态', key: 'status', width: 10 },
          { header: '耗时(ms)', key: 'latency', width: 12 },
          { header: 'Tokens', key: 'tokens', width: 10 },
          { header: '回答', key: 'text', width: 80 },
        ];
        responses.forEach(r => ws.addRow({
          ts: new Date(r.ts || 0).toISOString(),
          engine: r.engine,
          model: r.model || '',
          status: r.error ? 'error' : 'ok',
          latency: r.latency_ms || 0,
          tokens: r.usage?.total_tokens || 0,
          text: String(r.raw_answer || '').slice(0, 500),
        }));
        // 表头样式
        ws.getRow(1).font = { bold: true };
        filename = `geo_responses_${brand_id || 'all'}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return wb.xlsx.write(res).then(() => res.end());
      }
      filename = `geo_responses_${brand_id || 'all'}.json`;
      data = { ok: true, type: 'responses', count: responses.length, responses };
    } else if (typeLower === 'scores') {
      const scores = store.listScores({ brand_id });
      if (formatLower === 'csv') {
        const header = ['computed_at', 'brand_id', 'dimension', 'score', 'snapshot_id'];
        const rows = scores.map(s => [s.computed_at, s.brand_id, s.dimension, s.score, s.snapshot_id || '']);
        const csv = [header.join(','), ...rows.map(row => row.join(','))].join('\n');
        filename = `geo_scores_${brand_id || 'all'}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send('\uFEFF' + csv);
      }
      if (formatLower === 'xlsx') {
        const ExcelJS = require('exceljs');
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('GEO Scores');
        ws.columns = [
          { header: '时间', key: 'computed_at', width: 24 },
          { header: '维度', key: 'dimension', width: 20 },
          { header: '分数', key: 'score', width: 12 },
          { header: '快照', key: 'snapshot', width: 20 },
        ];
        scores.forEach(s => ws.addRow({
          computed_at: s.computed_at || '',
          dimension: s.dimension || '',
          score: s.score,
          snapshot: s.snapshot_id || '',
        }));
        ws.getRow(1).font = { bold: true };
        filename = `geo_scores_${brand_id || 'all'}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return wb.xlsx.write(res).then(() => res.end());
      }
      filename = `geo_scores_${brand_id || 'all'}.json`;
      data = { ok: true, type: 'scores', count: scores.length, scores };
    } else {
      return res.status(400).json({ ok: false, error: 'INVALID_TYPE', message: 'type 必须是 responses 或 scores' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === Tracker Agent（手动触发跑跟踪）— v0.29: 透传 maxQueries 给前端可控 ===
router.post('/tracker/run', async (req, res) => {
  try {
    const { brand_id, language = 'zh', rag = false, maxQueries } = req.body || {}; // v0.24: 多语言 / v0.25: RAG 检索增强 / v0.29: maxQueries 透传（默认 50）
    if (!brand_id) return res.status(400).json({ ok: false, error: 'BRAND_ID_REQUIRED' });
    const tracker = require('../services/geo-tracker-agent');
    const result = await tracker.runTracker(brand_id, { language, rag, maxQueries });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === Tracker All（跑所有 active brands）===
router.post('/tracker/run-all', async (req, res) => {
  try {
    const tracker = require('../services/geo-tracker-agent');
    const result = await tracker.runTrackerAll(req.body || {});
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === Audit Agent（生成结构化审计报告）===
router.post('/audit', async (req, res) => {
  try {
    const { brand_id, runTracker, lookbackDays, includeLLMSTxtCheck } = req.body || {};
    if (!brand_id) return res.status(400).json({ ok: false, error: 'BRAND_ID_REQUIRED' });
    const audit = require('../services/geo-audit-agent');
    const result = await audit.runAudit(brand_id, { runTracker, lookbackDays, includeLLMSTxtCheck });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === Optimizer Agent（AI 自动优化建议 — Phase 2 #1）===
router.post('/optimize', async (req, res) => {
  try {
    const { brand_id, lookbackDays, includeAudit } = req.body || {};
    if (!brand_id) return res.status(400).json({ ok: false, error: 'BRAND_ID_REQUIRED' });
    const optimizer = require('../services/geo-optimizer-agent');
    const result = await optimizer.runOptimization(brand_id, { lookbackDays, includeAudit });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Phase 3 #6: 建议一键落地为 Kanban 任务
router.post('/optimize/apply', (req, res) => {
  try {
    const { brand_id, recommendation_index, project_id } = req.body || {};
    if (!brand_id) return res.status(400).json({ ok: false, error: 'BRAND_ID_REQUIRED' });
    if (recommendation_index == null) return res.status(400).json({ ok: false, error: 'RECOMMENDATION_INDEX_REQUIRED' });
    const optimizer = require('../services/geo-optimizer-agent');
    const result = optimizer.applyRecommendationToTask(brand_id, Number(recommendation_index), { projectId: project_id });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === 设置（调度频率 + 引擎白名单，Phase 3 #3）===
router.get('/settings', (req, res) => {
  try {
    const geoConfig = require('../services/geo-config');
    res.json({ ok: true, settings: geoConfig.getSettings() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/settings', (req, res) => {
  try {
    const geoConfig = require('../services/geo-config');
    const result = geoConfig.setSettings(req.body || {});
    res.json(result);
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// === 推送配置（Email / Webhook）===
router.get('/push/config', (req, res) => {
  try {
    const push = require('../services/geo-push-service');
    const config = push.getPushConfig();
    res.json({
      ok: true,
      email_to: config.emailTo ? config.emailTo.split(',').map(s => s.trim()) : [],
      webhook_url: config.webhookUrl || '',
      // 不返回完整收件人，只返回配置状态
      email_configured: !!config.emailTo,
      webhook_configured: !!config.webhookUrl,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/push/config', (req, res) => {
  try {
    const { email_to, webhook_url } = req.body || {};
    const push = require('../services/geo-push-service');
    const sysConfigs = collection('system_configs');
    const keys = [
      { key: push.CONFIG_EMAIL_TO, value: email_to },
      { key: push.CONFIG_WEBHOOK_URL, value: webhook_url },
    ];
    for (const { key, value } of keys) {
      if (value === undefined) continue;
      const existing = sysConfigs.findOne(c => c.key === key);
      if (existing) sysConfigs.update(c => c.key === key, { value });
      else sysConfigs.insert({ key, value });
    }
    res.json({ ok: true, email_configured: !!email_to, webhook_configured: !!webhook_url });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === 推送月报（手动触发）===
router.post('/push/monthly', async (req, res) => {
  try {
    const { brand_id, month, includePdf } = req.body || {};
    if (!brand_id) return res.status(400).json({ ok: false, error: 'BRAND_ID_REQUIRED' });
    const push = require('../services/geo-push-service');
    const result = await push.pushMonthlyReport(brand_id, { month, includePdf });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === 竞品 Watch（Phase 4 v0.11）===
// GET  /api/geo/watch          — 列出全部 watch
// POST /api/geo/watch          — 创建 {focus_brand_id, competitor_ids, enabled}
// PUT  /api/geo/watch/:id      — 更新
// DELETE /api/geo/watch/:id    — 删除
// POST /api/geo/watch/:id/run  — 跑一次对比
// GET  /api/geo/watch/:id/report — markdown 对比报告
// POST /api/geo/watch/run-all  — 跑全部 enabled（cron 用）
router.get('/watch', (req, res) => {
  try {
    const watches = store.listWatches().map(w => {
      const r = w.last_result;
      return {
        ...w,
        last_result: r ? { ok: r.ok, focus_score: r.focus_score, focus_grade: r.focus_grade, leader: r.leader, changes: r.changes || [], computed_at: r.computed_at, competitor_count: (r.competitors || []).length } : null,
      };
    });
    res.json({ ok: true, count: watches.length, watches });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/watch', (req, res) => {
  try {
    const { focus_brand_id, competitor_ids, enabled } = req.body || {};
    if (!focus_brand_id) return res.status(400).json({ ok: false, error: 'FOCUS_BRAND_REQUIRED' });
    const w = store.createWatch({ focus_brand_id, competitor_ids, enabled });
    res.json({ ok: true, watch: w });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.put('/watch/:id', (req, res) => {
  try {
    const { competitor_ids, enabled } = req.body || {};
    const w = store.updateWatch(req.params.id, { competitor_ids, enabled });
    if (!w) return res.status(404).json({ ok: false, error: 'WATCH_NOT_FOUND' });
    res.json({ ok: true, watch: w });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.delete('/watch/:id', (req, res) => {
  try {
    const ok = store.deleteWatch(req.params.id);
    if (!ok) return res.status(404).json({ ok: false, error: 'WATCH_NOT_FOUND' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/watch/:id/run', async (req, res) => {
  try {
    const watchSvc = require('../services/geo-watch-service');
    const result = await watchSvc.runWatch(req.params.id);
    if (!result.ok) return res.status(400).json(result);
    // 变化告警走通知中心（P177 链路）
    if (result.changes && result.changes.length) {
      await eventBus.emit('geo.watch.alert', {
        payload: {
          title: `👁 竞品 Watch 变化: ${result.focus_brand_name}`,
          desc: result.changes.map(c => `${c.type === 'up' ? '🔺' : '🔻'} ${c.brand_name} ${c.delta > 0 ? '+' : ''}${c.delta}（${c.from}→${c.to}）`).join('；'),
          type: 'warning',
        },
      });
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/watch/:id/report', (req, res) => {
  try {
    const watchSvc = require('../services/geo-watch-service');
    const md = watchSvc.generateWatchReport(req.params.id);
    res.type('text/markdown').send(md);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/watch/run-all', async (req, res) => {
  try {
    const watchSvc = require('../services/geo-watch-service');
    const result = await watchSvc.runAllWatches();
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === 引用源分类分析（v0.16 — 移植 elmo 分类体系）===
// GET /api/geo/citations?brand_id=X → URL/域名级 rollup + 来源分类 + 页面类型 tally
router.get('/citations', (req, res) => {
  try {
    const classifier = require('../services/geo-citation-classifier');
    const brandId = req.query.brand_id;
    const responses = store.listResponses({ brand_id: brandId });
    // 自有品牌域名（判定 brand 类引用）
    const allBrands = store.listBrands();
    const brandDomains = allBrands
      .map(b => (b.domain || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase())
      .filter(Boolean);
    const result = classifier.rollupCitations(responses, brandDomains);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === 行动→影响归因（v0.17 — Sitepoint 分析 P0，CMO 五件套第 5 项）===
// GET /api/geo/attribution?brand_id=X → 每周 {score, score_delta, tasks[]}
router.get('/attribution', (req, res) => {
  try {
    const brandId = req.query.brand_id;
    if (!brandId) return res.status(400).json({ ok: false, error: 'BRAND_ID_REQUIRED' });
    const taskStore = require('../stores/task-store');
    const allSnaps = store.listSnapshots(brandId);
    // v0.27: 按周去重（同周重复快照只保留最新一份，与 createSnapshot upsert 配套）
    const byWeek = new Map();
    for (const s of allSnaps) {
      const cur = byWeek.get(s.week);
      if (!cur || (s.computed_at || '') > (cur.computed_at || '')) byWeek.set(s.week, s);
    }
    const snapshots = Array.from(byWeek.values()).sort((a, b) => a.week.localeCompare(b.week));
    const weeks = snapshots.map(s => ({ week: s.week, score: s.summary_json?.score ?? null }));

    // 该品牌的 geo 任务（artifacts.geo.brand_id 匹配）
    let allTasks = [];
    try { allTasks = taskStore.list({ limit: 500 }); } catch (_) { /* tasks 表可能不存在 */ }
    const geoTasks = allTasks.filter(t => {
      try {
        const arts = JSON.parse(t.artifacts || '{}');
        return arts.geo && arts.geo.brand_id === brandId;
      } catch (_) { return false; }
    });

    // 任务归周：优先 assigned_at（开始执行），fallback task id 内嵌时间戳
    const weekOf = ts => {
      const d = new Date(ts);
      const onejan = new Date(d.getFullYear(), 0, 1);
      const wk = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
      return `${d.getFullYear()}-W${String(wk).padStart(2, '0')}`;
    };
    const decodeTaskTime = taskId => {
      const m = String(taskId || '').match(/^T-([A-Z0-9]+)$/);
      if (!m) return null;
      const ts = parseInt(m[1], 36);
      return ts > 1000000000000 ? new Date(ts).toISOString() : null;
    };
    const tasksByWeek = {};
    geoTasks.forEach(t => {
      const ts = t.assigned_at || decodeTaskTime(t.id) || t.last_progress_update;
      if (!ts) return;
      const wk = weekOf(ts);
      if (!tasksByWeek[wk]) tasksByWeek[wk] = [];
      tasksByWeek[wk].push({ id: t.id, title: t.title, type: t.type, status: t.status });
    });

    const rows = weeks.map((w, i) => {
      const prev = i > 0 ? weeks[i - 1].score : null;
      const tasks = tasksByWeek[w.week] || [];
      return {
        week: w.week,
        score: w.score,
        score_delta: (w.score != null && prev != null) ? Math.round((w.score - prev) * 100) / 100 : null,
        task_count: tasks.length,
        tasks,
      };
    });

    res.json({ ok: true, brand_id: brandId, has_tasks: geoTasks.length > 0, rows: rows.slice(-8) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === 情感分析（v0.19 — P2 规则版）===
// GET /api/geo/sentiment?brand_id=X → 品牌提及的情感分布
router.get('/sentiment', (req, res) => {
  try {
    const sentiment = require('../services/geo-sentiment');
    const brandId = req.query.brand_id;
    if (!brandId) return res.status(400).json({ ok: false, error: 'BRAND_ID_REQUIRED' });
    const brand = store.getBrand(brandId);
    if (!brand) return res.status(404).json({ ok: false, error: 'BRAND_NOT_FOUND' });
    const responses = store.listResponses({ brand_id: brandId });
    const result = sentiment.aggregateSentiment(responses, brand.name);
    res.json({ ...result, brand_id: brandId, brand_name: brand.name });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === 拓词工作台（v0.20 — 借鉴 GEORank）===
// POST /api/geo/keywords/expand {seeds: ['AI 客服'], profile?} → 8 维关键词
router.post('/keywords/expand', (req, res) => {
  try {
    const expander = require('../services/geo-keyword-expander');
    const { seeds, profile } = req.body || {};
    const result = expander.expandKeywords(seeds, profile);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/geo/queries/import {brand_id, keywords:[{keyword, category}]} → 批量转提问模板
router.post('/queries/import', (req, res) => {
  try {
    const { brand_id, keywords } = req.body || {};
    if (!brand_id) return res.status(400).json({ ok: false, error: 'BRAND_ID_REQUIRED' });
    if (!Array.isArray(keywords) || !keywords.length) return res.status(400).json({ ok: false, error: 'KEYWORDS_REQUIRED' });
    const brand = store.getBrand(brand_id);
    if (!brand) return res.status(404).json({ ok: false, error: 'BRAND_NOT_FOUND' });
    const allowed = ['brand_intro', 'product', 'comparison', 'pricing', 'use_case', 'industry'];
    let imported = 0;
    const existing = new Set(store.listQueries(brand_id).map(q => q.prompt));
    for (const item of keywords) {
      const kw = String(item.keyword || '').trim();
      if (!kw) continue;
      const category = allowed.includes(item.category) ? item.category : 'general';
      if (existing.has(kw)) continue; // 去重（含本次批次内重复）
      store.createQuery({ brand_id, prompt: kw, category, engine_targets: ['deepseek'] });
      existing.add(kw);
      imported++;
    }
    res.json({ ok: true, imported, total_keywords: keywords.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === GEO LLM 工具（v0.21 — 借鉴 GEORank tools 模块）===
// POST /api/geo/tools/:kind  kind = jsonld | titles | kb
router.post('/tools/:kind', async (req, res) => {
  try {
    const { brief } = req.body || {};
    const kind = req.params.kind;
    const tools = require('../services/geo-llm-tools');
    const fn = { jsonld: tools.generateJsonLD, titles: tools.generateTitles, kb: tools.generateKB }[kind];
    if (!fn) return res.status(400).json({ ok: false, error: 'UNKNOWN_TOOL', message: 'kind 必须是 jsonld / titles / kb' });
    if (!brief || !String(brief).trim()) return res.status(400).json({ ok: false, error: 'BRIEF_REQUIRED', message: '请输入品牌信息 brief' });
    const result = await fn(String(brief).trim().slice(0, 2000));
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === 竞品自动推荐（v0.22）===
// POST /api/geo/competitors/suggest {brand_id} → LLM + AI 回答提取的候选竞品
router.post('/competitors/suggest', async (req, res) => {
  try {
    const { brand_id } = req.body || {};
    if (!brand_id) return res.status(400).json({ ok: false, error: 'BRAND_ID_REQUIRED' });
    const suggester = require('../services/geo-competitor-suggest');
    const result = await suggester.suggestCompetitors(brand_id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === 行业排名/指数（v0.23）===
// GET /api/geo/ranking?brand_id=X → 基准池排名 + 指数 + 分位 + SoV
router.get('/ranking', (req, res) => {
  try {
    const ranking = require('../services/geo-ranking');
    const brandId = req.query.brand_id;
    if (!brandId) return res.status(400).json({ ok: false, error: 'BRAND_ID_REQUIRED' });
    const lookbackDays = parseInt(req.query.lookback_days || '30', 10);
    const result = ranking.computeIndustryRanking(brandId, { lookbackDays });
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === Reporter（生成 Markdown 周报/月报）===
router.get('/report/weekly/:brandId', (req, res) => {
  try {
    const reporter = require('../services/geo-reporter-agent');
    const md = reporter.generateWeeklyReport(req.params.brandId);
    res.type('text/markdown').send(md);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/report/comparison', (req, res) => {
  try {
    const brandIds = (req.query.brand_ids || '').split(',').filter(Boolean);
    if (brandIds.length === 0) return res.status(400).json({ ok: false, error: 'BRAND_IDS_REQUIRED' });
    const reporter = require('../services/geo-reporter-agent');
    const md = reporter.generateComparisonReport(brandIds);
    res.type('text/markdown').send(md);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === Cronjob 状态 ===
router.get('/cron/status', (req, res) => {
  try {
    const cron = require('../jobs/geo-snapshot-cron');
    res.json({ ok: true, status: cron.getStatus() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === Query templates（生成批量 prompt）===
router.post('/queries/generate', (req, res) => {
  try {
    const { brand_id, personas, categories, persist } = req.body || {};
    if (!brand_id) return res.status(400).json({ ok: false, error: 'BRAND_ID_REQUIRED' });
    const store = require('../services/geo-store');
    const templates = require('../services/geo-query-templates');
    const brand = store.getBrand(brand_id);
    if (!brand) return res.status(404).json({ ok: false, error: 'BRAND_NOT_FOUND' });

    if (persist) {
      templates.persistBrandQueries(brand_id, { personas, categories }).then(r => {
        res.json(r);
      }).catch(e => res.status(500).json({ ok: false, error: e.message }));
    } else {
      const queries = templates.generateBrandQueries(brand.name, { personas, categories });
      res.json({ ok: true, count: queries.length, queries });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === Score（手动触发算分）===
router.get('/score/:brandId', (req, res) => {
  try {
    const store = require('../services/geo-store');
    const scoring = require('../services/geo-scoring');
    const brand = store.getBrand(req.params.brandId);
    if (!brand) return res.status(404).json({ ok: false, error: 'BRAND_NOT_FOUND' });
    const lookbackDays = parseInt(req.query.lookback_days || '30', 10);
    const score = scoring.calculateCiteAbilityScore(brand, { lookbackDays });
    res.json(score);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/score', (req, res) => {
  try {
    const store = require('../services/geo-store');
    const scoring = require('../services/geo-scoring');
    const brandIds = (req.query.brand_ids || '').split(',').filter(Boolean);
    if (brandIds.length === 0) return res.status(400).json({ ok: false, error: 'BRAND_IDS_REQUIRED' });
    const compare = scoring.compareBrands(brandIds);
    res.json(compare);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === PDF 报告 ===
router.post('/report/pdf/weekly', async (req, res) => {
  try {
    const { brand_id, week } = req.body || {};
    if (!brand_id) return res.status(400).json({ ok: false, error: 'BRAND_ID_REQUIRED' });
    const pdf = require('../services/geo-pdf-report');
    const result = await pdf.generateWeeklyPDF(brand_id, { week });
    await notifyReportDone(`📊 GEO 周报 PDF 已生成`, `brand=${brand_id} week=${week || '最新'}`, 'success');
    res.json(result);
  } catch (e) {
    await notifyReportDone(`📊 GEO 周报 PDF 生成失败`, e.message, 'error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/report/pdf/comparison', async (req, res) => {
  try {
    const { brand_ids } = req.body || {};
    if (!Array.isArray(brand_ids) || brand_ids.length === 0) {
      return res.status(400).json({ ok: false, error: 'BRAND_IDS_REQUIRED' });
    }
    const pdf = require('../services/geo-pdf-report');
    const result = await pdf.generateComparisonPDF(brand_ids);
    await notifyReportDone(`📊 GEO 对比报告 PDF 已生成`, `${brand_ids.length} 个品牌`, 'success');
    res.json(result);
  } catch (e) {
    await notifyReportDone(`📊 GEO 对比报告生成失败`, e.message, 'error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === 月报 ===
router.post('/report/monthly', async (req, res) => {
  try {
    const { brand_id, month, persist } = req.body || {};
    if (!brand_id) return res.status(400).json({ ok: false, error: 'BRAND_ID_REQUIRED' });
    const monthly = require('../services/geo-monthly-report');
    const md = monthly.generateMonthlyReport(brand_id, { month });
    if (persist) {
      const result = await monthly.saveMonthlyReport(brand_id, { month });
      await notifyReportDone(`📊 GEO 月报已生成`, `brand=${brand_id} month=${month || '当前'}`, 'success');
      res.json({ ...result, markdown: md });
    } else {
      res.type('text/markdown').send(md);
    }
  } catch (e) {
    await notifyReportDone(`📊 GEO 月报生成失败`, e.message, 'error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/report/pdf/monthly', async (req, res) => {
  try {
    const { brand_id, month } = req.body || {};
    if (!brand_id) return res.status(400).json({ ok: false, error: 'BRAND_ID_REQUIRED' });
    const monthly = require('../services/geo-monthly-report');
    const pdf = require('../services/geo-pdf-report');
    const md = monthly.generateMonthlyReport(brand_id, { month });
    const result = await pdf.generatePDF({
      markdown: md,
      brand: brand_id,
      reportType: 'monthly',
      week: month,
    });
    await notifyReportDone(`📊 GEO 月报 PDF 已生成`, `brand=${brand_id} month=${month || '当前'}`, 'success');
    res.json(result);
  } catch (e) {
    await notifyReportDone(`📊 GEO 月报 PDF 生成失败`, e.message, 'error');
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === v0.29: PDF 报告下载（前端从 POST /report/pdf/* 拿到 saved_path 后触发） ===
// 多多报「导出 PDF 不知道在哪里」根因：之前 PDF 写盘后只 res.json(saved_path)，前端没下载动作。
// 修法：前端拿到 saved_path → 提取 basename → window.open 这个 URL，浏览器原生下载。
// 防 path traversal：path.basename + startsWith(OUTPUT_DIR + sep)
router.get('/reports/download/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename); // 防 ../ 注入
    const fullPath = path.join(pdfReport.OUTPUT_DIR, filename);
    const expected = pdfReport.OUTPUT_DIR.endsWith(path.sep)
      ? pdfReport.OUTPUT_DIR
      : pdfReport.OUTPUT_DIR + path.sep;
    if (!fullPath.startsWith(expected)) {
      return res.status(400).json({ ok: false, error: 'INVALID_PATH' });
    }
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ ok: false, error: 'FILE_NOT_FOUND', message: fullPath });
    }
    res.download(fullPath, filename, (err) => {
      if (err) console.error('[geo-pdf-download] error:', err);
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === Kanban 集成 ===
router.post('/kanban/task', (req, res) => {
  try {
    const { project_id, brand_id, type, title, description, priority, engine_targets } = req.body || {};
    if (!project_id) return res.status(400).json({ ok: false, error: 'PROJECT_ID_REQUIRED' });
    if (!brand_id) return res.status(400).json({ ok: false, error: 'BRAND_ID_REQUIRED' });
    if (!type) return res.status(400).json({ ok: false, error: 'TYPE_REQUIRED' });
    const helper = require('../services/geo-kanban-helper');
    const task = helper.createGEOTask({ projectId: project_id, brandId: brand_id, type, title, description, priority, engineTargets: engine_targets });
    res.json({ ok: true, task });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/kanban/task-types', (req, res) => {
  try {
    const helper = require('../services/geo-kanban-helper');
    res.json({ ok: true, types: helper.getGEOTaskTypes() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/kanban/tasks', (req, res) => {
  try {
    const { project_id, brand_id } = req.query;
    if (!project_id) return res.status(400).json({ ok: false, error: 'PROJECT_ID_REQUIRED' });
    const helper = require('../services/geo-kanban-helper');
    const tasks = helper.listGEOTasks(project_id, brand_id);
    res.json({ ok: true, tasks, count: tasks.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/llms-txt/validate', (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content) return res.status(400).json({ ok: false, error: 'CONTENT_REQUIRED' });
    // 复用工具的 handler
    const { registerTool } = require('../services/tool-registry');
    const tool = require('../services/tool-registry').getTool('validate_llms_txt');
    if (!tool) return res.status(500).json({ ok: false, error: 'TOOL_NOT_FOUND' });
    tool.handler({ content }).then(r => res.json(r)).catch(e => res.status(500).json({ ok: false, error: e.message }));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;