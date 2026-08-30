// ACMS GEO — 别名匹配工具（v0.30，独立模块治循环依赖）
// 路径：server/services/geo-match.js
//
// 为什么独立：
//   scoring 引用 store 拉数据 → store 别名清洗又要引用 scoring 的工具 → 循环依赖
//   把 normalizeAliases + getMatchTerms 抽到 geo-match.js，scoring 和 store 都引用同一份
//
// 用途：
//   1. brand.aliases / brand.settings.aliases 读取时清洗
//   2. createBrand / updateBrand 写入时清洗
//   3. competitorNames / competitorBrands 展开时清洗
//
// 设计：
//   - 别名长度 ≥2 字符（防 "x"、"AI" 单字符撞车）
//   - 停用词表（"公司/集团/Co/Ltd/AI/IT" 等通用词不入别名）
//   - 子串压扁（"中展" ⊂ "中展集团" 只保留长串 — 子串匹配已经覆盖）
//   - 与 brandName 同值的不保留（brandName 单独处理）

// 停用词表（别名收集 + 通用词不入别名，避免单字符/通用词撞车 false-positive）
const ALIAS_STOPWORDS = new Set([
  // 中文通用词
  '公司', '集团', '有限', '股份', '品牌', '产品', '服务', '平台', '官网', '官方',
  '有限公司', '股份有限公司', '集团股份有限公司', '中国', '国际',
  // 英文通用词
  'co', 'ltd', 'inc', 'llc', 'corp', 'company', 'group', 'official', 'china',
  // 缩写噪声
  'ai', 'it', 'app', 'web',
]);

// 别名清理：去重 + 子串压扁 + 长度 ≥2 + 去掉停用词
// 入参：原始 alias 数组（来自用户输入 / LLM 推断 / settings.aliases）
// 返回：标准化后的字符串数组
function normalizeAliases(aliases, brandName) {
  if (!Array.isArray(aliases)) return [];
  const nameLower = String(brandName || '').toLowerCase().trim();
  // 第一遍：去 trim、转小写、去空、去停用词、过滤 <2 字符
  let list = aliases
    .map(a => String(a || '').trim())
    .filter(a => a.length >= 2 && !ALIAS_STOPWORDS.has(a.toLowerCase()));
  // 第二遍：去重 + 过滤"等于 brandName"的（brandName 单独处理）
  const seen = new Set();
  if (nameLower) seen.add(nameLower);
  list = list.filter(a => {
    const key = a.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // 第三遍：子串压扁 — 如果 A ⊂ B（同语言），只保留长的；按长度倒序后两两比较
  list.sort((a, b) => b.length - a.length);
  const result = [];
  for (const cand of list) {
    const candLower = cand.toLowerCase();
    // 如果 cand 是已有 result 的子串 → 跳过（保留更长的）
    const isSubstring = result.some(r => r.toLowerCase().includes(candLower));
    if (!isSubstring) result.push(cand);
  }
  return result;
}

// 获取品牌的所有可匹配项：[brandName, ...aliases]
// brand 可以是 string / brand object — 兼容历史调用
// 读取顺序（优先级）：brand.aliases (顶层) → brand.settings.aliases (legacy) → []
// alias 一律过 normalizeAliases 清洗
function getMatchTerms(brand) {
  if (!brand) return [];
  if (typeof brand === 'string') {
    const t = brand.trim();
    return t ? [t] : [];
  }
  const name = String(brand.name || brand.domain || '').trim();
  const rawAliases = Array.isArray(brand.aliases)
    ? brand.aliases
    : (brand.settings && Array.isArray(brand.settings.aliases) ? brand.settings.aliases : []);
  const aliases = normalizeAliases(rawAliases, name);
  return name ? [name, ...aliases] : aliases;
}

module.exports = {
  ALIAS_STOPWORDS,
  normalizeAliases,
  getMatchTerms,
};