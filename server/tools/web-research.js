// ACMS 工具 — web_research（v0.15，2026-06-21）
// 综合网络调研：LLM 提取关键词 → 搜狗搜索 → 抓取 Top N → LLM 综合分析 → 结构化答案
//
// 流程：
//   1. LLM 提取关键词：把用户自然语言转成搜索引擎友好的查询词（去掉「我」「请」「帮我」等噪音词）
//   2. 浏览器搜索（搜狗）
//   3. 抓取 top N URL 正文（并发）
//   4. LLM 综合分析：基于搜索结果 + 抓取内容，生成带引用的答案
//
// 与 web_search 的区别：
//   - web_search：只返回搜索结果（标题+摘要+URL）
//   - web_research：搜索 + 抓取 top N + LLM 综合分析 一站式返回答案
//
// 为什么需要两阶段 LLM 调用：
//   - 用户说"我前几天看过一个 AI 新工具"，要 LLM 提取「AI 新工具」作为关键词
//   - 用户问"帮我看下 2026 年世界杯分组情况"，要去掉"帮我看下"等噪音
//   - 综合分析需要 LLM 在抓取内容基础上做推理，不是简单拼接

const { fetchUrlCore } = require('./url-fetch');
const { callLLM } = require('../services/llm-adapter');
const { extractJSON } = require('../services/json-extractor');
const { searchWeb } = require('../services/web-search');
const modelStore = require('../stores/model-store');

// ═══════════════════════════════════════════════════════════
// 搜索缓存（5 分钟 TTL）
// ═══════════════════════════════════════════════════════════
const _researchCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCachedResult(query, maxResults, deepFetch) {
  const key = `${query}|${maxResults}|${deepFetch}`.toLowerCase().trim();
  const cached = _researchCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  return null;
}
function setCachedResult(query, maxResults, deepFetch, data) {
  const key = `${query}|${maxResults}|${deepFetch}`.toLowerCase().trim();
  _researchCache.set(key, { data, ts: Date.now() });
  // 清理过期缓存（最多 50 条）
  if (_researchCache.size > 50) {
    const now = Date.now();
    for (const [k, v] of _researchCache) {
      if (now - v.ts > CACHE_TTL) _researchCache.delete(k);
    }
  }
}

/**
 * 解析 modelId：null → 默认思路模型
 */
function resolveModelId(modelId) {
  if (modelId) return modelId;
  const def = modelStore.getDefaultGenModel();
  return def?.id || null;
}

const DEFAULT_MAX_RESULTS = 20;
const DEFAULT_DEEP_FETCH = 10;
const MAX_RESULTS_LIMIT = 20;
const DEEP_FETCH_LIMIT = 10;
const FETCH_BODY_LIMIT = 12000;
const SYNTHESIS_EXCERPT_LIMIT = 8000;

function clampInteger(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/**
 * LLM tool schema 使用 snake_case，内部历史调用也有 camelCase；两种都接受，避免参数静默失效。
 */
function normalizeResearchArgs(args = {}) {
  const maxResults = clampInteger(
    args.max_results ?? args.maxResults,
    1,
    MAX_RESULTS_LIMIT,
    DEFAULT_MAX_RESULTS,
  );
  const deepFetch = clampInteger(
    args.deep_fetch ?? args.deepFetch,
    0,
    DEEP_FETCH_LIMIT,
    DEFAULT_DEEP_FETCH,
  );
  return {
    maxResults,
    deepFetch: Math.min(deepFetch, maxResults),
    modelId: args.model_id ?? args.modelId ?? null,
  };
}

function buildCurrentTimeContext(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now).filter(p => p.type !== 'literal').map(p => [p.type, p.value]),
  );
  const monthNumber = Number(parts.month);
  const dayNumber = Number(parts.day);
  return {
    utcIso: now.toISOString(),
    shanghaiDate: `${parts.year}-${parts.month}-${parts.day}`,
    shanghaiDateZh: `${parts.year}年${monthNumber}月${dayNumber}日`,
    shanghaiDateTime: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`,
    englishDate: new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric',
    }).format(now),
  };
}

function isFreshnessRequest(originalQuery, keywords = {}) {
  const timeText = `${keywords.time_constraint || ''} ${originalQuery || ''}`;
  return /最新|最近|当前|现在|今天|今日|实时|目前|进展|动态|latest|current|today|now|live/i.test(timeText);
}

function augmentFreshnessQuery(searchQuery, originalQuery, keywords, currentTime) {
  if (!isFreshnessRequest(originalQuery, keywords)) return searchQuery;
  if (String(searchQuery).includes(currentTime.shanghaiDateZh)
      || String(searchQuery).includes(currentTime.shanghaiDate)) return searchQuery;
  return `${searchQuery} ${currentTime.shanghaiDateZh}`.trim();
}

function inferOfficialQuery(searchQuery, keywords = {}) {
  if (keywords.official_query) return keywords.official_query;
  const source = `${(keywords.key_entities || []).join(' ')} ${searchQuery || ''}`;
  // 关键词模型漏字段时的高置信度标准名称兜底；其余主题保留实体原文。
  if (/世界杯/.test(source)) {
    const year = source.match(/\b(20\d{2})\b/)?.[1];
    return `${year ? `${year} ` : ''}FIFA World Cup`.trim();
  }
  return Array.isArray(keywords.key_entities) && keywords.key_entities.length > 0
    ? keywords.key_entities.join(' ')
    : searchQuery;
}

/**
 * 实时问题至少做两种检索表达：中文具体日期 + 官方英文实体/日期/results。
 */
function buildFreshnessSearchQueries(searchQuery, originalQuery, keywords, currentTime) {
  const primary = augmentFreshnessQuery(searchQuery, originalQuery, keywords, currentTime);
  if (!isFreshnessRequest(originalQuery, keywords)) return [primary];
  const officialEntity = inferOfficialQuery(searchQuery, keywords);
  const official = `${officialEntity} results ${currentTime.englishDate} official`.trim();
  return Array.from(new Set([primary, official]));
}

function excerptForSynthesis(content, freshness) {
  const text = String(content || '');
  if (text.length <= SYNTHESIS_EXCERPT_LIMIT) return text;
  if (freshness) {
    const headLength = 1500;
    const tailLength = SYNTHESIS_EXCERPT_LIMIT - headLength;
    return text.slice(0, headLength)
      + '\n\n...[为实时查询省略中段，保留页面最新尾部]...\n\n'
      + text.slice(-tailLength);
  }
  const headLength = 5000;
  return text.slice(0, headLength)
    + '\n\n...[中段省略]...\n\n'
    + text.slice(-(SYNTHESIS_EXCERPT_LIMIT - headLength));
}

function rankResultsForResearch(results, freshness) {
  if (!Array.isArray(results)) return [];
  if (!freshness) return results.slice();
  const evidencePath = /match[-_/ ]?schedule|fixtures?|results?|scores?|standings?|bracket|live|赛程|比分|战报|积分榜|射手榜|淘汰赛|半决赛|决赛/i;
  const genericPath = /hosts?[-_/ ]cities[-_/ ]dates|calendar|holidays?|百科|baike|zidian|字典|政府工作报告|放假/i;
  return results
    .map((item, index) => {
      const url = String(item?.url || '');
      const titleAndSnippet = `${item?.title || ''} ${item?.snippet || ''}`;
      let score = 0;
      if (evidencePath.test(url)) score += 10;
      if (evidencePath.test(titleAndSnippet)) score += 5;
      if (genericPath.test(url)) score -= 6;
      if (genericPath.test(titleAndSnippet)) score -= 4;
      return { item, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(x => x.item);
}

// ═══════ Prompt: 关键词提取 ═══════
const EXTRACT_PROMPT = `你是查询关键词提取助手。根据用户输入，提取最适合搜索引擎的查询词。

## 输出要求（严格 JSON）
{
  "query": "提取后的关键词（多个词用空格分隔）",
  "official_query": "面向全球官方来源的英文查询实体/标准名称" | null,
  "key_entities": ["实体1", "实体2", ...],   // 核心实体（人名/产品名/事件名等）
  "time_constraint": "时间限定" | null,      // 如 "2026"、"最近" 等
  "intent": "factual | comparative | exploratory | playable",  // 查询意图
  "search_modifier": "搜索修饰词" | null     // 用于让搜索引擎拿到更精准的结果
}

## 提取规则
1. 去掉疑问词、口语化表达、礼貌用语（"请帮我"、"我想知道"、"怎么看"等）
2. 去掉代词（"它"、"这个"、"那个"），保留核心实体
3. 如果有时间相关词，加入到 time_constraint
4. 提取核心实体到 key_entities（即使 query 里没有重复也保留）
5. 如果主题有国际官方英文名称，official_query 必须填写标准英文实体（不要翻译整句）：
   - "2026世界杯" → "2026 FIFA World Cup"
   - "欧盟人工智能法案" → "EU AI Act"
   - 纯中文本地事件或没有可靠英文名 → null
6. 判断 intent：
   - factual：问客观事实（"是什么"、"有多少"、"排名"）
   - comparative：对比类（"区别"、"对比"、"vs"）
   - exploratory：探索类（"怎么样"、"如何"、"有什么"）
   - playable：用户想直接听/看/下载 → search_modifier 自动补 "在线 试听 播放"
7. 判断 search_modifier（关键！）：
   - intent=playable → "在线 试听 播放"（让搜索结果偏向可直接播放的源）
   - intent=exploratory + 涉及"推荐" → "推荐 排行 热门"
   - 涉及下载 → "下载"
   - 涉及视频 → "在线观看"
   - 其他 → null

## 示例
输入："最近 2026 世界杯小组赛的排名是什么？"
输出：{"query": "2026世界杯 小组赛 排名", "official_query": "2026 FIFA World Cup", "key_entities": ["2026世界杯"], "time_constraint": "最近", "intent": "factual", "search_modifier": null}

输入："帮我对比下钉钉和企业微信"
输出：{"query": "钉钉 企业微信 对比", "key_entities": ["钉钉", "企业微信"], "time_constraint": null, "intent": "comparative", "search_modifier": null}

输入："我想听Beyond的海阔天空"
输出：{"query": "Beyond 海阔天空", "key_entities": ["Beyond", "海阔天空"], "time_constraint": null, "intent": "playable", "search_modifier": "在线 试听 播放"}

输入："AI 编程助手哪个好用"
输出：{"query": "AI 编程助手 推荐", "key_entities": ["AI编程助手"], "time_constraint": null, "intent": "exploratory", "search_modifier": "推荐 排行"}`;

// ═══════ Prompt: 综合分析 ═══════
const SYNTHESIS_PROMPT_BASE = `你是 ACMS 系统的「网络调研助手」。基于搜索结果 + 抓取的网页正文，回答用户问题。

## 输入
- 用户原始问题：用户的自然语言描述
- 提取的关键词：经 LLM 提取的搜索词
- 搜索结果：标题+摘要+URL
- 网页正文：已抓取的关键网页内容（带 URL 标记）

## 输出要求
1. **直接回答问题**：基于网页内容给出准确答案
2. **引用来源**：每个关键事实后标注来源编号 [1][2][3]，末尾列出「## 参考来源」段落，格式：[N] 标题 - URL
3. **结构清晰**：用 markdown（标题/列表/加粗）组织信息
4. **承认局限**：如果搜索+抓取都不够，只能说明资料不足，不能把资料不足推导为事件尚未发生或事实不存在

## 证据纪律
- 当前日期是判断“最新/当前/尚未开始/已经结束”的硬约束，必须先核对当前日期与来源日期
- 搜索结果旁的日期可能是网页发布日期或更新时间，不能擅自当作赛事/事件开始日期
- 涉及开赛时间等时区换算时，只有来源明确标注原时区才能换算；必须同时写原时区、目标时区、UTC 偏移和是否跨日。无法确认夏令时时保留原时间，不得猜测北京时间
- “没抓到正文”“页面为空”“搜索无结果”只代表证据不足，不代表事件未发生
- 只有权威来源明确说明，且其日期与当前日期一致时，才可以断言“尚未开始”“尚未发布”“不存在”
- 如果来源之间冲突，明确写出冲突，不要选择性补全或凭模型记忆猜测

## 注意事项
- 综合多个来源，不要只依赖单个网页
- 区分事实与推测
- 数字、日期、人名等关键信息保持原文精确度
- 输出长度 ≤ 1200 字`;

function buildSynthesisPrompt(currentTime) {
  return `${SYNTHESIS_PROMPT_BASE}

## 当前时间基准（系统提供，不得忽略）
- 北京时间（Asia/Shanghai）：${currentTime.shanghaiDateTime}
- UTC：${currentTime.utcIso}`;
}

/**
 * MiniMax 等模型在 jsonMode 下仍可能返回 ```json 代码围栏；统一复用公共 JSON 提取器。
 */
function parseKeywordExtractionContent(content) {
  const jsonText = extractJSON(content);
  if (!jsonText) throw new Error('关键词提取结果不含有效 JSON');
  return JSON.parse(jsonText);
}

/**
 * 提取关键词（Stage 1）
 * @returns {Promise<{query, key_entities, time_constraint, intent}>}
 */
async function extractKeywords(query, modelId) {
  const realModelId = resolveModelId(modelId);
  try {
    const result = await callLLM(realModelId, [
      { role: 'system', content: EXTRACT_PROMPT },
      { role: 'user', content: query },
    ], {
      temperature: 0,
      maxTokens: 300,
      jsonMode: true,
      caller: 'web_research.extract',
    });

    const parsed = parseKeywordExtractionContent(result.content || '{}');
    // 把 search_modifier 拼到 query 后面
    const baseQuery = parsed.query || query;
    const finalQuery = parsed.search_modifier
      ? `${baseQuery} ${parsed.search_modifier}`
      : baseQuery;
    return {
      query: finalQuery,
      official_query: parsed.official_query || null,
      key_entities: parsed.key_entities || [],
      time_constraint: parsed.time_constraint || null,
      intent: parsed.intent || 'exploratory',
      search_modifier: parsed.search_modifier || null,
    };
  } catch (e) {
    // 提取失败时回退：用原 query 直接搜索
    return {
      query,
      key_entities: [],
      time_constraint: null,
      intent: 'exploratory',
      fallback: true,
      fallbackReason: e.message,
    };
  }
}

/**
 * 网络调研（提取关键词 → 搜索 → 抓取 → 综合分析）
 * @param {object} args - snake_case 与 camelCase 均兼容
 *   - query: 调研问题（自然语言）
 *   - max_results/maxResults: 搜索返回条数（默认 20，上限 20）
 *   - deep_fetch/deepFetch: 自动抓取 URL 数（默认 10，上限 10，0 = 不抓正文）
 *   - model_id/modelId: 用于提取 + 综合分析的 LLM（默认用系统默认模型）
 */
async function research(args) {
  const query = args?.query;
  if (!query) return { error: '查询问题必填', answer: '', sources: [] };

  const { maxResults, deepFetch, modelId } = normalizeResearchArgs(args);
  const realModelId = resolveModelId(modelId);
  const currentTime = buildCurrentTimeContext();

  // ── 缓存命中直接返回 ──
  const cached = getCachedResult(query, maxResults, deepFetch);
  if (cached) {
    console.log(`[web-research] 缓存命中: "${query.slice(0, 50)}"`);
    return { ...cached, _cached: true };
  }

  // ── 流式进度回调 ──
  function writeProgress(stage, msg) {
    console.log(`[web-research] ${stage}: ${msg}`);
    try {
      // 如果有 reqId，写进 supplement_history 让前端可见
      if (args._reqId) {
        var { collection } = require('../db/connection');
        var reqStore = require('../stores/requirement-store');
        var req = reqStore.getById(args._reqId);
        if (req) {
          var hist = [];
          try { hist = JSON.parse(req.supplement_history || '[]'); } catch {}
          if (!Array.isArray(hist)) hist = [];
          hist.push({ role: 'system', text: `[调研进度] ${stage}: ${msg}`, at: new Date().toISOString(), source: 'research_progress' });
          reqStore.update(args._reqId, { supplement_history: JSON.stringify(hist) });
        }
      }
    } catch (e) { /* 非关键 */ }
  }

  try {
    writeProgress('Stage1', '正在分析搜索意图...');

    // ═══ Stage 1: 提取关键词 + 实时查询扩展 ═══
    const keywords = await extractKeywords(query, modelId);
    console.log(`[web-research] Stage1 提取关键词:`, JSON.stringify(keywords));
    const baseSearchQuery = keywords.query;
    const searchQueries = buildFreshnessSearchQueries(baseSearchQuery, query, keywords, currentTime);
    const freshness = isFreshnessRequest(query, keywords);

    writeProgress('Stage2', '正在搜索互联网...');

    // ═══ Stage 2: 搜索 ═══
    const resultSets = [];
    const searchErrors = [];
    for (const q of searchQueries) {
      const searchResult = await searchWeb(q, { maxResults });
      const count = searchResult.results?.length || 0;
      console.log(`[web-research] Stage2 搜索 [${q}]:`, searchResult.error ? `失败: ${searchResult.error}` : `${count} 条`);
      if (searchResult.error) searchErrors.push(`${q}: ${searchResult.error}`);
      if (count > 0) resultSets.push(searchResult.results);
    }

    const mergedResults = [];
    const seenUrls = new Set();
    const longestSet = resultSets.reduce((max, set) => Math.max(max, set.length), 0);
    for (let rank = 0; rank < longestSet && mergedResults.length < maxResults; rank++) {
      for (const set of resultSets) {
        const item = set[rank];
        if (!item?.url || seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);
        mergedResults.push(item);
        if (mergedResults.length >= maxResults) break;
      }
    }
    const results = rankResultsForResearch(mergedResults, freshness);

    if (results.length === 0) {
      const errResult = { error: searchErrors.join(' | ') || '搜索无结果', answer: '', sources: [], keywords, searchResults: [], searchQueries, currentTime };
      setCachedResult(query, maxResults, deepFetch, errResult);
      return errResult;
    }

    writeProgress('Stage3', `正在抓取 ${Math.min(deepFetch, results.length)} 个网页...`);

    // ═══ Stage 3: 抓取 top N URL 正文 ═══
    const topUrls = results.slice(0, deepFetch);
    const fetchAttempts = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < topUrls.length) {
        const idx = cursor++;
        const r = topUrls[idx];
        try {
          const fetched = await fetchUrlCore({ url: r.url, max_length: FETCH_BODY_LIMIT });
          if (fetched.error) {
            fetchAttempts[idx] = { index: idx + 1, url: r.url, title: r.title, error: fetched.error };
            continue;
          }
          const rawContent = fetched.text || fetched.content || '';
          fetchAttempts[idx] = {
            index: idx + 1, url: r.url, title: fetched.title || r.title,
            content: excerptForSynthesis(rawContent, freshness),
            fetchedAt: fetched.fetchedAt || null, browserFallback: Boolean(fetched.rawHtml || fetched.screenshot),
          };
        } catch (e) {
          fetchAttempts[idx] = { index: idx + 1, url: r.url, title: r.title, error: e.message };
        }
      }
    };
    const workerCount = Math.min(3, topUrls.length);
    if (workerCount > 0) await Promise.all(Array.from({ length: workerCount }, () => worker()));
    const fetchedContents = fetchAttempts.filter(f => f?.content);
    const failedFetches = fetchAttempts.filter(f => f?.error);
    console.log(`[web-research] Stage3 抓取: 成功 ${fetchedContents.length}/${topUrls.length}, 失败 ${failedFetches.length}`);

    writeProgress('Stage4', `正在综合分析 ${fetchedContents.length} 个来源...`);

    // ═══ Stage 4: LLM 综合分析 ═══
    function buildSynthesisMessages(currentTime, query, keywords, searchQueries, results, fetchAttempts, fetchedContents, topUrls) {
      const searchList = results.map((r, i) =>
        `[${i + 1}] ${r.title}\n   URL: ${r.url}\n   摘要: ${(r.snippet || '').slice(0, 300)}`
      ).join('\n\n');
      const fetchList = fetchAttempts.length > 0
        ? fetchAttempts.map(f => f?.content
          ? `[${f.index}] ${f.title}\n   URL: ${f.url}\n   抓取时间: ${f.fetchedAt || '未知'}\n   正文: ${f.content}`
          : `[${f?.index || '?'}] ${f?.title || '未知页面'}\n   URL: ${f?.url || '未知'}\n   抓取失败: ${f?.error || '未知错误'}`
        ).join('\n\n---\n\n')
        : '（deep_fetch=0，未抓取正文）';
      const userMsg = `## 当前时间\n北京时间：${currentTime.shanghaiDateTime}\nUTC：${currentTime.utcIso}\n\n## 用户原始问题\n${query}\n\n## 实际搜索表达\n${searchQueries.join('\n')}\n（意图: ${keywords.intent}, 实体: ${(keywords.key_entities || []).join('、') || '无'}, 时间限定: ${keywords.time_constraint || '无'}）\n\n## 搜索结果（${results.length}条）\n${searchList}\n\n## 网页抓取（成功 ${fetchedContents.length}/${topUrls.length}）\n${fetchList}\n\n请严格基于当前时间和以上证据回答。资料不足时只说无法确认，不得推导为事件尚未发生。`;
      return [
        { role: 'system', content: buildSynthesisPrompt(currentTime) },
        { role: 'user', content: userMsg },
      ];
    }

    let answer = '';
    try {
      const result = await callLLM(realModelId, buildSynthesisMessages(currentTime, query, keywords, searchQueries, results, fetchAttempts, fetchedContents, topUrls), {
        temperature: 0.2, maxTokens: 2200, caller: 'web_research.synthesize',
      });
      answer = result.content || '';
    } catch (e) {
      answer = `（LLM 综合分析失败: ${e.message}）\n\n**原始搜索结果：**\n${results.map((r, i) => `[${i + 1}] ${r.title}\n   URL: ${r.url}`).join('\n\n')}`;
    }

    // ═══ Stage 5: 迭代深搜（如果资料不足，再搜一轮）═══
    const insufficientEvidence = /资料不足|无法确认|没有找到|未找到|不能确定|未能找到|无相关信息/i.test(answer);
    if (insufficientEvidence && deepFetch > 0 && !args._skipIterative) {
      writeProgress('Stage5', '资料不足，正在提炼新关键词再搜一轮...');
      console.log(`[web-research] 资料不足，启动迭代搜索`);
      try {
        // 用当前答案作为上下文，提炼更精准的关键词
        const refineResult = await callLLM(realModelId, [
          { role: 'system', content: '你是搜索策略优化助手。用户问了一个问题，但第一次搜索没有得到足够的信息。基于以下回答，提炼一个更精准、更专业的搜索关键词。只返回关键词，不要其他文字。' },
          { role: 'user', content: `原始问题：${query}\n第一次回答：${answer.slice(0, 800)}\n\n请给出一个更精准的搜索关键词：` },
        ], { temperature: 0.1, maxTokens: 100, caller: 'web_research.refine' });
        const refinedQuery = (refineResult.content || '').trim();
        if (refinedQuery && refinedQuery.length > 5 && refinedQuery !== query) {
          console.log(`[web-research] 迭代搜索: "${refinedQuery}"`);
          const refinedArgs = { ...args, query: refinedQuery, _skipIterative: true, _reqId: args._reqId };
          const iterResult = await research(refinedArgs);
          if (iterResult.answer && !/资料不足|无法确认/.test(iterResult.answer)) {
            // 迭代成功：合并两次结果
            answer = iterResult.answer + '\n\n---\n\n> 补充搜索关键词：' + refinedQuery;
          }
        }
      } catch (e) {
        console.log(`[web-research] 迭代搜索失败: ${e.message}`);
      }
    }

    // 构造 sources
    const sources = results.map((r, i) => {
      const attempt = fetchAttempts.find(f => f?.index === i + 1);
      return { index: i + 1, title: r.title, url: r.url, snippet: r.snippet, fetched: Boolean(attempt?.content), fetch_error: attempt?.error || null };
    });

    const result = { answer, sources, keywords, searchResults: results, fetchedCount: fetchedContents.length, failedFetchCount: failedFetches.length, query, searchQuery: searchQueries[0], searchQueries, currentTime, config: { maxResults, deepFetch }, intent: keywords.intent };
    setCachedResult(query, maxResults, deepFetch, result);
    writeProgress('完成', `调研完成，${fetchedContents.length} 个来源`);
    return result;
  } catch (e) {
    return { error: `网络调研失败: ${e.message}`, answer: '', sources: [] };
  }
}

module.exports = {
  research,
  extractKeywords,
  parseKeywordExtractionContent,
  normalizeResearchArgs,
  buildCurrentTimeContext,
  augmentFreshnessQuery,
  buildFreshnessSearchQueries,
  buildSynthesisPrompt,
  excerptForSynthesis,
  rankResultsForResearch,
};