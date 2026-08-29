// ACMS GEO 应用 REST API（v0.1 — Phase 0 D5）
// 路径：server/routes/geo.js
//
// 设计参考：
//   - server/routes/skills.js（最简单模板：router.get('/') + router.get('/:id')）
//   - server/routes/admin.js（认证 + 错误处理）
//   - P105：参数化路由（:id）必须注册在静态路由之后

const express = require('express');
const router = express.Router();
const store = require('../services/geo-store');
const llmsGen = require('../services/geo-llms-txt-generator');
const geoConfig = require('../services/geo-config');

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
    res.json({
      ok: true,
      engines: status,
      note: 'Phase 0 仅 deepseek 可用；其他 7 个引擎在 Phase 1 接入',
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

router.post('/brands', (req, res) => {
  try {
    const brand = store.createBrand(req.body || {});
    res.json({ ok: true, brand });
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
    const ok = store.deleteQuery(req.params.id);
    res.json({ ok, deleted: ok });
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

// === Tracker Agent（手动触发跑跟踪）===
router.post('/tracker/run', async (req, res) => {
  try {
    const { brand_id, engines, maxQueries, dryRun, autoGenerateQueries } = req.body || {};
    if (!brand_id) return res.status(400).json({ ok: false, error: 'BRAND_ID_REQUIRED' });
    const tracker = require('../services/geo-tracker-agent');
    const result = await tracker.runTracker(brand_id, {
      engines,
      maxQueries,
      dryRun,
      autoGenerateQueries,
    });
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
    res.json(result);
  } catch (e) {
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
    res.json(result);
  } catch (e) {
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
      res.json({ ...result, markdown: md });
    } else {
      res.type('text/markdown').send(md);
    }
  } catch (e) {
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
    res.json(result);
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