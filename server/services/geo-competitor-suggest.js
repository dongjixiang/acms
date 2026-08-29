// ACMS GEO 竞品自动推荐（v0.22）
// 用途：输入焦点品牌 → LLM 生成 Top 竞品候选 + 从已有 AI 回答提取竞品名 → 一键创建
// 路径：server/services/geo-competitor-suggest.js
//
// 设计：
//   1. LLM 推荐（主）：DeepSeek 返回品牌在所属行业的主要竞品（结构化 JSON）
//   2. AI 回答提取（辅）：从该品牌 comparison 类 query 的回答里正则提取「与 X 相比」的竞品
//   3. 合并去重 → candidates（含 already_exists 标记，避免重复创建）

const LLM_TOOLS = require('./geo-llm-tools');
const GEO_STORE = require('./geo-store');

const LLM_TIMEOUT_MS = 60000;

// 从回答文本里提取候选竞品名（v0.24：只保留「已知品牌库」高置信匹配，删除启发式噪音提取）
function extractFromAnswers(brandId) {
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) return [];
  const responses = GEO_STORE.listResponses({ brand_id: brandId });
  const candidates = [];
  // 已知品牌库（除焦点外）出现在回答里 = 高置信竞品
  const knownBrands = GEO_STORE.listBrands()
    .filter(b => b.id !== brandId)
    .map(b => b.name);

  for (const resp of responses) {
    if (resp.error) continue;
    const text = resp.raw_answer || resp.text || '';
    if (!text) continue;
    for (const kb of knownBrands) {
      if (kb && kb.length >= 2 && text.includes(kb) && !candidates.includes(kb)) {
        candidates.push(kb);
      }
    }
  }
  return candidates.slice(0, 15);
}

// LLM 推荐：品牌 + 已知竞品 → Top 10 竞品（结构化 JSON）
async function suggestByLLM(brandId) {
  const brand = GEO_STORE.getBrand(brandId);
  if (!brand) return { ok: false, error: 'BRAND_NOT_FOUND' };
  const known = GEO_STORE.listBrands()
    .filter(b => b.id !== brandId)
    .map(b => `${b.name}(${b.domain || ''})`)
    .join('、') || '（无）';

  const prompt = `你是行业分析专家。请列出「${brand.name}」（官网 ${brand.domain || '未知'}）在所属行业的直接竞品。

硬性要求：
1. 只列出真实存在、公开可查的公司/产品品牌（不是行业术语、不是产品类别、不是抽象概念）
2. 返回 Top 8-12 个直接竞品（同一赛道、用户群重叠、用户比较时通常并列出现的）
3. 只输出一个 JSON 数组，不要任何其他文字、不要 markdown 代码块，格式：
[{"name":"公司名","domain":"官网域名（不带https://和路径，不知道就填空字符串）","industry":"所属行业（如 AI 工具 / 会展服务 / 教育培训，8字内）","why":"10字内理由"}]
4. 知名竞品的域名必须准确（如 openai.com、anthropic.com）；不熟悉的品牌域名留空
5. industry 要与焦点品牌同一细分赛道（如焦点是 AI 对话助手，竞品就写 AI 对话助手，不写笼统的 AI）
6. why 必须 ≤ 12 个中文字符，保持简洁

已知已有品牌（可能包含部分竞品，可跳过或补充）：${known}`;

  const r = await LLM_TOOLS.generate(prompt, { temperature: 0.4, maxTokens: 2500 });
  if (!r.ok) return r;

  // 解析 JSON（只接受完整 JSON 数组；解析失败返回空，绝不回退行拆分——宁缺毋滥）
  let list = [];
  try {
    const text = (r.text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/g, '');
    // 提取第一个 [ ... ] 块
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    const json = start >= 0 && end > start ? text.slice(start, end + 1) : text;
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) list = arr;
  } catch (_) {
    return { ok: true, candidates: [], note: 'LLM 输出解析失败（未返回 JSON 数组）' };
  }

  // 域名清理 + 过滤
  const cleanDomain = d => {
    if (!d) return '';
    return String(d)
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      .split('?')[0]
      .toLowerCase()
      .slice(0, 80);
  };

  return {
    ok: true,
    candidates: list
      .filter(c => c && typeof c === 'object' && c.name && String(c.name).trim())
      .map(c => ({
        name: String(c.name).trim().replace(/^[【\[]|[\】\]]$/g, '').slice(0, 40),
        domain: cleanDomain(c.domain),
        industry: String(c.industry || '').trim().slice(0, 30),
        why: String(c.why || '').slice(0, 60),
      }))
      .filter(c => c.name && c.name !== brand.name)
      .slice(0, 12),
  };
}

// 汇总推荐：LLM + 回答提取 → 去重 + 已存在标记
async function suggestCompetitors(brandId) {
  const llmRes = await suggestByLLM(brandId);
  const fromAnswers = extractFromAnswers(brandId);

  const existingBrands = GEO_STORE.listBrands();
  const existingNames = new Set(existingBrands.map(b => b.name.toLowerCase()));
  const seen = new Set();
  const candidates = [];

  // LLM 结果优先
  if (llmRes.ok) {
    for (const c of llmRes.candidates) {
      const key = c.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        ...c,
        source: 'llm',
        already_exists: existingNames.has(key),
        existing_id: existingNames.has(key) ? (existingBrands.find(b => b.name.toLowerCase() === key)?.id || '') : '',
      });
    }
  }

  // 回答提取补充
  for (const name of fromAnswers) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      name,
      domain: '',
      industry: '',
      why: 'AI 回答中提到',
      source: 'answer',
      already_exists: existingNames.has(key),
      existing_id: existingNames.has(key) ? (existingBrands.find(b => b.name.toLowerCase() === key)?.id || '') : '',
    });
  }

  return {
    ok: true,
    brand_id: brandId,
    brand_name: GEO_STORE.getBrand(brandId)?.name || brandId,
    total: candidates.length,
    candidates,
    note: llmRes.ok ? 'LLM 推荐 + AI 回答提取' : `LLM 推荐失败（${llmRes.message || llmRes.error}），仅回答提取`,
  };
}

module.exports = { suggestCompetitors, extractFromAnswers, suggestByLLM };
