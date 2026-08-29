// ACMS GEO 情感分析（v0.19 — P2 规则版，零 LLM 成本）
// 用途：对 AI 回答中品牌被提及的上下文做情感分类（正面/中性/负面/条件）
// 路径：server/services/geo-sentiment.js
//
// 设计（规则版，后续可升级 LLM 分类）：
//   - 定位品牌首次提及位置，取前后上下文窗口
//   - 负面词命中 → negative；正面词命中 → positive；否则 neutral
//   - 条件模式：品牌附近出现"但是/不过/然而/但"且后续有负面词 → negative（"X 很好，但太贵"）
//   - 对比模式：品牌附近出现"不如/比不过/比不上" → negative

// 词表（中英混合，覆盖 AI 回答常用表述）
const POSITIVE_WORDS = [
  '推荐', '值得', '最佳', '优秀', '领先', '强大', '好用', '可靠', '喜欢', '出色',
  '卓越', '好评', '优势', '一流', '创新', '专业', '高效', '性价比高', '首选', '热门',
  '称赞', '称赞', '口碑', '备受好评', '广受好评', '备受青睐', '口碑佳', '好评如潮',
  'recommend', 'best', 'great', 'excellent', 'love', 'robust', 'top', 'reliable',
  'outstanding', 'amazing', 'leading', 'powerful', 'popular', 'well-regarded',
];
const NEGATIVE_WORDS = [
  '差', '糟糕', '缺点', '不足', '落后', '不如', '失望', '投诉', '坑', '垃圾',
  '太贵', '不好用', '难用', '卡顿', '问题多', '差评', '缺陷', '短板', '糟糕体验',
  '太慢', '响应慢', '服务差', '客服差', '质量差', '不稳定', '容易崩', '经常断',
  'bad', 'worse', 'disappoint', 'complain', 'outdated', 'expensive', 'overpriced',
  'poor', 'terrible', 'awful', 'buggy', 'slow', 'unreliable', 'outdated',
];
const CONDITIONAL_WORDS = ['但是', '不过', '然而', '虽然', '但', '可惜', '遗憾', 'however', 'but', 'though', 'unfortunately', 'yet'];
const COMPARISON_NEGATIVE = ['不如', '比不过', '比不上', '输给', '落后于', '远不及', 'not as good', 'worse than', 'behind'];

function normalize(text) {
  return String(text || '').toLowerCase();
}

/**
 * 单条回答情感分类
 * @param {string} brand - 品牌名
 * @param {string} text - AI 回答全文
 * @returns {{sentiment: 'positive'|'neutral'|'negative', context: string, score: number}}
 */
function classifySentiment(brand, text) {
  if (!text || !brand) return { sentiment: 'neutral', context: '', score: 0 };
  const lower = normalize(text);
  const brandLower = normalize(brand);
  const idx = lower.indexOf(brandLower);
  if (idx < 0) return { sentiment: 'neutral', context: '', score: 0 };

  // 上下文窗口（品牌前后各 80 字符）
  const start = Math.max(0, idx - 80);
  const end = Math.min(text.length, idx + brand.length + 80);
  const context = text.slice(start, end);

  const ctxLower = normalize(context);

  // 1. 对比模式（"X 不如 Y"）→ 负面
  if (COMPARISON_NEGATIVE.some(w => ctxLower.includes(w))) {
    return { sentiment: 'negative', context, score: -1 };
  }

  // 2. 负面词直接命中（排除"不推荐"双否定：先查负面，但"不差"→ 正面）
  const hasNeg = NEGATIVE_WORDS.some(w => ctxLower.includes(w));
  const hasPos = POSITIVE_WORDS.some(w => ctxLower.includes(w));

  // 3. 条件模式：转折词之后的窗口内有负面词 → "X 很好，但太贵" = 负面
  //    定位转折词位置，取其后的 60 字符检查负面词（更精准，避免全文误伤）
  let hasCondAfterNeg = false;
  for (const w of CONDITIONAL_WORDS) {
    const ci = ctxLower.indexOf(w);
    if (ci >= 0) {
      const after = ctxLower.slice(ci + w.length, ci + w.length + 60);
      if (NEGATIVE_WORDS.some(n => after.includes(n))) { hasCondAfterNeg = true; break; }
    }
  }
  const hasCond = CONDITIONAL_WORDS.some(w => ctxLower.includes(w));

  if (hasCondAfterNeg) return { sentiment: 'negative', context, score: -0.5 }; // 转折后负面压过正面
  if (hasNeg && hasPos && hasCond) return { sentiment: 'negative', context, score: -0.5 };
  if (hasNeg) return { sentiment: 'negative', context, score: -1 };
  if (hasPos) return { sentiment: 'positive', context, score: 1 };
  return { sentiment: 'neutral', context, score: 0 };
}

/**
 * 聚合品牌情感分布
 * @param {Array} responses - geo_responses 数组
 * @param {string} brand - 品牌名
 * @param {string} brandDomain - 品牌域名（匹配用）
 * @returns {{ok, distribution, samples, positive_ratio, message}}
 */
function aggregateSentiment(responses, brand) {
  const counted = { positive: 0, neutral: 0, negative: 0 };
  const samples = [];
  let mentionedCount = 0;

  (responses || []).forEach(r => {
    if (r.error) return;
    const text = r.raw_answer || r.text || '';
    const lower = normalize(text);
    const brandLower = normalize(brand);
    const mentioned = lower.includes(brandLower);
    if (!mentioned) return;
    mentionedCount++;
    const s = classifySentiment(brand, text);
    counted[s.sentiment]++;
    if (samples.length < 8) {
      samples.push({
        engine: r.engine,
        ts: r.ts,
        sentiment: s.sentiment,
        context: (s.context || '').slice(0, 120),
      });
    }
  });

  const total = counted.positive + counted.neutral + counted.negative;
  if (total === 0) {
    return {
      ok: true,
      mentioned_count: 0,
      distribution: counted,
      positive_ratio: 0,
      message: '没有检测到品牌被提及的回答（先跑跟踪）',
      samples: [],
    };
  }

  const positiveRatio = Math.round((counted.positive / total) * 1000) / 1000;
  const negativeRatio = counted.negative / total;
  let message;
  if (negativeRatio >= 0.2) {
    message = `⚠️ 负面提及占比 ${Math.round(negativeRatio * 100)}%——AI 引擎对品牌的描述有负面倾向，建议立即核查并优化内容。`;
  } else if (positiveRatio >= 0.6) {
    message = `✅ 正面提及占比 ${Math.round(positiveRatio * 100)}%——AI 引擎整体在正面推荐你的品牌。`;
  } else {
    message = `品牌被提及但多为中性描述（${Math.round((counted.neutral / total) * 100)}%）——内容可读但缺乏「推荐」信号，建议增加具体卖点与第三方背书。`;
  }

  return {
    ok: true,
    mentioned_count: total,
    distribution: counted,
    positive_ratio: positiveRatio,
    message,
    samples,
  };
}

module.exports = {
  classifySentiment,
  aggregateSentiment,
  POSITIVE_WORDS,
  NEGATIVE_WORDS,
};
