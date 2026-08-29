// ACMS GEO — 旧 query 迁移脚本（v0.26 C5）
// 路径：server/services/geo-migrate.js
//
// 背景（多多：目前分析出来的指标看着都有问题）：
//   - 旧版 prompt 是完整问句（"请介绍 中展国际 这家公司，重点说明商业模式..."）→ AI 回答像客服话术 → 指标失真
//   - v0.26 新版 prompt 是短搜索片段（"展览设计公司 行业排名"）
//   - 旧 query 不应再跑（浪费 API + 污染指标），但保留数据（历史快照对比用）
//
// 迁移策略：
//   - 完整问句特征：长度 > 20 且（含句号/问号/感叹号 或 以"请/谁/如何/怎样/什么"开头）
//   - 命中 → source: 'legacy' + enabled: false（停用但保留）+ systemTags 补算 branded/unbranded
//   - 短查询（≤20 字）→ 保持 enabled（不误伤）

const GEO_STORE = require('./geo-store');

// 判断是否为"完整问句"（legacy）
function isLegacyFullSentence(prompt) {
  const p = String(prompt || '').trim();
  if (!p) return false;
  // 长度 > 15 且含句子标点（句号/问号/感叹号）
  if (p.length > 15 && /[。？！?！.]/.test(p)) return true;
  // 以"请/谁/如何/怎样/什么/为什么/怎么"开头（问句特征）
  if (/^(请|谁|如何|怎样|什么|为什么|怎么|请问)/.test(p)) return true;
  return false;
}

/**
 * 迁移单个品牌的所有 legacy queries
 * @param {string} brandId
 * @param {Object} options { disableLegacy = true }
 * @returns {{ migrated: number, kept: number, legacy: Array<{id, prompt, action}> }}
 */
function migrateLegacyQueries(brandId, options = {}) {
  const { disableLegacy = true } = options;
  const queries = GEO_STORE.listQueries(brandId);
  const brand = GEO_STORE.getBrand(brandId);
  const brandName = brand?.name || '';

  const migrated = [];
  let kept = 0;

  for (const q of queries) {
    const legacy = isLegacyFullSentence(q.prompt);
    // 补算 systemTags（branded/unbranded — 无论 legacy 与否都对齐）
    const sysTags = GEO_STORE.computeSystemTags
      ? GEO_STORE.computeSystemTags(q.prompt, brandName)
      : (q.prompt.toLowerCase().includes(brandName.toLowerCase()) ? ['branded'] : ['unbranded']);

    const updates = { systemTags: sysTags };
    if (legacy && disableLegacy && q.enabled !== false) {
      updates.enabled = false; // 停用旧完整问句
      updates.source = q.source || 'legacy';
      migrated.push({ id: q.id, prompt: q.prompt.slice(0, 40), action: 'disable' });
    } else if (legacy) {
      updates.source = q.source || 'legacy';
      migrated.push({ id: q.id, prompt: q.prompt.slice(0, 40), action: 'keep-enabled' });
    } else {
      kept++;
    }

    GEO_STORE.updateQuery(q.id, updates);
  }

  return {
    ok: true,
    brand_id: brandId,
    brand_name: brandName,
    total: queries.length,
    migrated: migrated.length,
    kept,
    legacy: migrated,
  };
}

module.exports = {
  isLegacyFullSentence,
  migrateLegacyQueries,
};
