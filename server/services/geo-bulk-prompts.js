// ACMS GEO — 批量导入解析器（v0.26 C1c — 移植 elmo bulk-prompts.ts，MIT）
// 路径：server/services/geo-bulk-prompts.js
//
// 用途：用户粘贴多行 prompt 文本 → 智能解析成 prompt 列表
// 借鉴 elmo parseBulkPrompts 设计：
//   - 每个被 drop 的 line 都说明原因（"9 of 50 are duplicates" 不是沉默 drop）
//   - 去重：trim + lowercase + 内部空白折叠（避免文档换行产生假重复）
//   - 4 类 skip: blank / duplicateInPaste / duplicateOfExisting / overCapacity

const MAX_PROMPTS = 200; // 单品牌 prompt 上限（elmo 默认上限，防 tracker 跑太多）

/**
 * 比较键：trim + lowercase + 内部空白折叠
 * "A  B" 和 "a b" 视为同一条
 */
function dedupeKey(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * 解析粘贴文本为 prompt 列表
 * @param {string} text - 粘贴的多行文本
 * @param {Object} options
 * @param {string[]} [options.existing=[]] - 已在列表里的 prompt（用于查重）
 * @param {number} [options.limit=MAX_PROMPTS] - 列表总容量
 * @returns {{ added: string[], skipped: { blank: number, duplicateOfExisting: string[], duplicateInPaste: string[], overCapacity: string[] } }}
 */
function parseBulkPrompts(text, options = {}) {
  const { existing = [], limit = MAX_PROMPTS } = options;

  const seen = new Set(existing.map(dedupeKey));
  const room = Math.max(0, limit - existing.length);

  const added = [];
  const skipped = {
    blank: 0,
    duplicateOfExisting: [],
    duplicateInPaste: [],
    overCapacity: [],
  };

  const withinPaste = new Set();

  for (const raw of String(text || '').split(/\r?\n/)) {
    const value = raw.trim();
    if (value.length === 0) {
      skipped.blank += 1;
      continue;
    }

    const key = dedupeKey(value);
    if (withinPaste.has(key)) {
      skipped.duplicateInPaste.push(value);
      continue;
    }
    if (seen.has(key)) {
      skipped.duplicateOfExisting.push(value);
      continue;
    }

    // 容量检查在查重之后（elmo 设计：占位的 line 不算超容）
    if (added.length >= room) {
      skipped.overCapacity.push(value);
      continue;
    }

    withinPaste.add(key);
    added.push(value);
  }

  return { added, skipped };
}

/**
 * 一句话描述 skip 了哪些（没有 skip 时返回 null）
 */
function describeSkipped(skipped) {
  const parts = [];
  const duplicates = (skipped.duplicateOfExisting || []).length + (skipped.duplicateInPaste || []).length;
  if (duplicates > 0) parts.push(`${duplicates} 条重复`);
  if ((skipped.blank || 0) > 0) parts.push(`${skipped.blank} 条空行`);
  if ((skipped.overCapacity || []).length > 0) parts.push(`${skipped.overCapacity.length} 条超出上限`);
  if (parts.length === 0) return null;
  return `跳过 ${parts.join('、')}。`;
}

module.exports = {
  parseBulkPrompts,
  describeSkipped,
  dedupeKey,
  MAX_PROMPTS,
};
