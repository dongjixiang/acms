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
const { searchWeb } = require('../services/web-search');
const modelStore = require('../stores/model-store');

/**
 * 解析 modelId：null → 默认思路模型
 */
function resolveModelId(modelId) {
  if (modelId) return modelId;
  const def = modelStore.getDefaultGenModel();
  return def?.id || null;
}

// ═══════ Prompt: 关键词提取 ═══════
const EXTRACT_PROMPT = `你是查询关键词提取助手。根据用户输入，提取最适合搜索引擎的查询词。

## 输出要求（严格 JSON）
{
  "query": "提取后的关键词（多个词用空格分隔）",
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
5. 判断 intent：
   - factual：问客观事实（"是什么"、"有多少"、"排名"）
   - comparative：对比类（"区别"、"对比"、"vs"）
   - exploratory：探索类（"怎么样"、"如何"、"有什么"）
   - playable：用户想直接听/看/下载 → search_modifier 自动补 "在线 试听 播放"
6. 判断 search_modifier（关键！）：
   - intent=playable → "在线 试听 播放"（让搜索结果偏向可直接播放的源）
   - intent=exploratory + 涉及"推荐" → "推荐 排行 热门"
   - 涉及下载 → "下载"
   - 涉及视频 → "在线观看"
   - 其他 → null

## 示例
输入："最近 2026 世界杯小组赛的排名是什么？"
输出：{"query": "2026世界杯 小组赛 排名", "key_entities": ["2026世界杯"], "time_constraint": "最近", "intent": "factual", "search_modifier": null}

输入："帮我对比下钉钉和企业微信"
输出：{"query": "钉钉 企业微信 对比", "key_entities": ["钉钉", "企业微信"], "time_constraint": null, "intent": "comparative", "search_modifier": null}

输入："我想听Beyond的海阔天空"
输出：{"query": "Beyond 海阔天空", "key_entities": ["Beyond", "海阔天空"], "time_constraint": null, "intent": "playable", "search_modifier": "在线 试听 播放"}

输入："AI 编程助手哪个好用"
输出：{"query": "AI 编程助手 推荐", "key_entities": ["AI编程助手"], "time_constraint": null, "intent": "exploratory", "search_modifier": "推荐 排行"}`;

// ═══════ Prompt: 综合分析 ═══════
const SYNTHESIS_PROMPT = `你是 ACMS 系统的「网络调研助手」。基于搜索结果 + 抓取的网页正文，回答用户问题。

## 输入
- 用户原始问题：用户的自然语言描述
- 提取的关键词：经 LLM 提取的搜索词
- 搜索结果：标题+摘要+URL
- 网页正文：已抓取的关键网页内容（带 URL 标记）

## 输出要求
1. **直接回答问题**：基于网页内容给出准确答案
2. **引用来源**：每个关键事实后标注来源编号 [1][2][3]，末尾列出「## 参考来源」段落，格式：[N] 标题 - URL
3. **结构清晰**：用 markdown（标题/列表/加粗）组织信息
4. **承认局限**：如果搜索+抓取都不够，诚实说明已检索的资料不足以回答

## 注意事项
- 综合多个来源，不要只依赖单个网页
- 区分事实与推测
- 数字、日期、人名等关键信息保持原文精确度
- 输出长度 ≤ 800 字`;

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

    const parsed = JSON.parse(result.content || '{}');
    // 把 search_modifier 拼到 query 后面
    const baseQuery = parsed.query || query;
    const finalQuery = parsed.search_modifier
      ? `${baseQuery} ${parsed.search_modifier}`
      : baseQuery;
    return {
      query: finalQuery,
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
 * @param {object} args - { query, maxResults?, deepFetch?, modelId? }
 *   - query: 调研问题（自然语言）
 *   - maxResults: 搜索返回条数（默认 6）
 *   - deepFetch: 自动抓取的 URL 数（默认 3，0 = 不抓只返回搜索结果）
 *   - modelId: 用于提取 + 综合分析的 LLM（默认用系统默认模型）
 */
async function research(args) {
  const query = args?.query;
  if (!query) return { error: '查询问题必填', answer: '', sources: [] };

  const maxResults = Math.min(args?.maxResults || 6, 10);
  const deepFetch = args?.deepFetch ?? 3;
  const modelId = args?.modelId || null;
  const realModelId = resolveModelId(modelId);  // null → 默认模型

  try {
    // ═══ Stage 1: 提取关键词 ═══
    const keywords = await extractKeywords(query, modelId);
    console.log(`[web-research] Stage1 提取关键词:`, JSON.stringify(keywords));
    const searchQuery = keywords.query;

    // ═══ Stage 2: 搜索（走 searchWeb 多级 fallback：浏览器 → 搜狗 HTML → Bing HTML）═══
    const searchResult = await searchWeb(searchQuery, { maxResults });
    console.log(`[web-research] Stage2 搜索:`, searchResult.error ? `失败: ${searchResult.error}` : `${searchResult.results?.length || 0} 条`);
    if (searchResult.error || !searchResult.results?.length) {
      return {
        error: searchResult.error || '搜索无结果',
        answer: '',
        sources: [],
        keywords,
        searchResults: [],
      };
    }
    const results = searchResult.results;

    // ═══ Stage 3: 抓取 top N URL 正文（并发）═══
    const fetchedContents = [];
    if (deepFetch > 0) {
      const topUrls = results.slice(0, deepFetch);
      const fetchPromises = topUrls.map(async (r, idx) => {
        try {
          const fetched = await fetchUrlCore({ url: r.url, max_length: 3000 });
          if (fetched.error) return { index: idx + 1, url: r.url, title: r.title, error: fetched.error };
          return {
            index: idx + 1,
            url: r.url,
            title: r.title,
            content: (fetched.text || fetched.content || '').slice(0, 3000),
          };
        } catch (e) {
          return { index: idx + 1, url: r.url, title: r.title, error: e.message };
        }
      });
      const fetched = await Promise.all(fetchPromises);
      fetchedContents.push(...fetched.filter(f => f.content));
    }

    // ═══ Stage 4: LLM 综合分析 ═══
    const searchList = results.map((r, i) =>
      `[${i + 1}] ${r.title}\n   URL: ${r.url}\n   摘要: ${(r.snippet || '').slice(0, 200)}`
    ).join('\n\n');

    const fetchList = fetchedContents.length > 0
      ? fetchedContents.map(f => `[${f.index}] ${f.title}\n   URL: ${f.url}\n   正文: ${f.content}`).join('\n\n---\n\n')
      : '（未抓取正文）';

    const userMessage = `## 用户原始问题\n${query}\n\n## 提取的关键词\n${searchQuery}\n（意图: ${keywords.intent}, 实体: ${(keywords.key_entities || []).join('、') || '无'}, 时间限定: ${keywords.time_constraint || '无'}）\n\n## 搜索结果（${results.length}条）\n${searchList}\n\n## 抓取的网页正文（${fetchedContents.length}条）\n${fetchList}\n\n请基于以上信息综合回答用户问题。`;

    let answer = '';
    try {
      const result = await callLLM(realModelId, [
        { role: 'system', content: SYNTHESIS_PROMPT },
        { role: 'user', content: userMessage },
      ], {
        temperature: 0.3,
        maxTokens: 1500,
        caller: 'web_research.synthesize',
      });
      answer = result.content || '';
    } catch (e) {
      answer = `（LLM 综合分析失败: ${e.message}）\n\n**原始搜索结果：**\n${searchList}`;
    }

    // 构造 sources 数组
    const sources = results.map((r, i) => ({
      index: i + 1,
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      fetched: fetchedContents.some(f => f.index === i + 1),
    }));

    return {
      answer,
      sources,
      keywords,                  // Stage 1 输出（调试用）
      searchResults: results,    // Stage 2 输出（调试用）
      fetchedCount: fetchedContents.length,
      query,                     // 原始问题
      searchQuery,               // 提取后的关键词
      intent: keywords.intent,
    };
  } catch (e) {
    return { error: `网络调研失败: ${e.message}`, answer: '', sources: [] };
  }
}

module.exports = { research, extractKeywords };