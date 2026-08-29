// ACMS GEO — 统一引用解析器（v0.26 — 借鉴 elmo text-extraction.ts，MIT）
// 路径：server/services/geo-citation-extractor.js
//
// 用途：派发式统一解析各 engine 适配器的 raw response → 归一化 Citation[] 数组
//
// 设计目标（elmo text-extraction.ts 同款）：
//   - 统一 Citation interface：{url, title?, domain, citationIndex}
//   - 每个 engine 一个 extractCitationsFromXxx() 独立函数
//   - extractCitations(rawOutput, engineId) 派发入口
//   - collectCitations() 通用遍历 + 去重 + 域名解析
//   - probe 链式 fallback（"firstText(emptyMessage, probes[])"）
//
// 当前支持：perplexity（真正实现），其他 7 个 engine = stub（return []）
// 未来加新 engine 时：写 extractCitationsFromXxx() + 注册到 dispatch

/**
 * @typedef {Object} Citation
 * @property {string} url
 * @property {string} [title]
 * @property {string} domain
 * @property {number} citationIndex
 */

/**
 * 解析 URL → domain（与 geo-citation-classifier.js 的 extractDomain 等价）
 */
function extractDomain(urlOrDomain) {
  try {
    const u = new URL(urlOrDomain);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch (_) {
    return String(urlOrDomain || '').replace(/^www\./, '').split('/')[0].toLowerCase();
  }
}

/**
 * 解析单条 citation（elmo parseCitationUrl 同款）
 */
function parseCitationUrl(url, title, idx) {
  if (!url || typeof url !== 'string') return null;
  if (!url.startsWith('http')) return null;
  try {
    const parsed = new URL(url);
    return {
      url,
      title: title || undefined,
      domain: parsed.hostname.replace(/^www\./, '').toLowerCase(),
      citationIndex: idx,
    };
  } catch (_) {
    return null;
  }
}

/**
 * 通用遍历 + 去重（elmo collectCitations 同款）
 * traverse(add) 里 add(url, title) 收集每个候选
 */
function collectCitations(traverse) {
  const citations = [];
  const seen = new Set();
  const add = (url, title) => {
    if (typeof url !== 'string' || !url.startsWith('http') || seen.has(url)) return;
    seen.add(url);
    const c = parseCitationUrl(url, typeof title === 'string' ? title : undefined, citations.length);
    if (c) citations.push(c);
  };
  try {
    traverse(add);
  } catch (_) { /* 容错：解析失败返空数组，不阻塞上层 */ }
  return citations;
}

// =====================================================================
// 各 engine 的 extractCitationsFromXxx 实现
// 命名与 elmo 一致（snake_case + FromXxx）
// =====================================================================

/**
 * Perplexity（v0.26: 唯一真正实现）
 * 位置：data.choices[0].message.citations[] 或顶层 data.citations[]
 * elmo 等价：extractCitationsFromPerplexity
 */
function extractCitationsFromPerplexity(rawOutput) {
  return collectCitations((add) => {
    // 位置 1：data.choices[0].message.citations
    if (Array.isArray(rawOutput?.choices?.[0]?.message?.citations)) {
      for (const c of rawOutput.choices[0].message.citations) {
        add(c?.url, c?.title);
      }
    }
    // 位置 2：data.citations 顶层
    if (Array.isArray(rawOutput?.citations)) {
      for (const c of rawOutput.citations) {
        add(c?.url, c?.title);
      }
    }
  });
}

/**
 * OpenAI（v0.26: stub — 当前 Chat Completions API 不返回 citations）
 * 未来切到 Responses API + web_search tool 时启用：
 *   data.output[].content[].annotations[].type === 'url_citation' → {url, title}
 * elmo 等价：extractCitationsFromOpenAI
 */
function extractCitationsFromOpenAI(rawOutput) {
  // TODO: 当切到 Responses API + web_search tool 时实现
  // 探针 1：data.output[] message → content[].annotations[].url_citation
  // 探针 2：data.choices[0].message.annotations[].url_citation
  return collectCitations((add) => {
    if (Array.isArray(rawOutput?.output)) {
      for (const item of rawOutput.output) {
        if (item?.type !== 'message') continue;
        const content = Array.isArray(item.content) ? item.content : [];
        for (const c of content) {
          if (c?.type !== 'output_text') continue;
          for (const ann of (c.annotations || [])) {
            if (ann?.type === 'url_citation') add(ann.url, ann.title);
          }
        }
      }
    }
  });
}

/**
 * Claude / Anthropic（v0.26: stub — 当前 Messages API 不返回 citations）
 * 未来加 web_search_20250305 tool 时启用：
 *   data.content[].type === 'web_search_tool_result' → content[].url
 * elmo 等价：extractCitationsFromAnthropic
 */
function extractCitationsFromClaude(rawOutput) {
  return collectCitations((add) => {
    if (Array.isArray(rawOutput?.content)) {
      for (const block of rawOutput.content) {
        // web_search_tool_result 类型
        if (block?.type === 'web_search_tool_result') {
          for (const r of (Array.isArray(block.content) ? block.content : [])) {
            if (r?.type === 'web_search_result') add(r.url, r.title);
          }
        }
        // 未来：text block 的 citations 字段
        if (block?.type === 'text' && Array.isArray(block.citations)) {
          for (const c of block.citations) {
            if (c?.type === 'web_search_result_location') add(c.url, c.title);
          }
        }
      }
    }
  });
}

/**
 * 其他 engine 的 stub（v0.26: 全 return []）
 * 未来加新 provider 时按 elmo 模式扩展
 */
function extractCitationsFromDeepseek() { return []; }
function extractCitationsFromGoogle() { return []; }
function extractCitationsFromCopilot() { return []; }
function extractCitationsFromGrok() { return []; }
function extractCitationsFromUnknown() { return []; }

// =====================================================================
// 派发表（v0.26: 与 server/services/geo-engines/index.js 保持一致）
// =====================================================================

const EXTRACTORS = {
  perplexity: extractCitationsFromPerplexity,
  openai: extractCitationsFromOpenAI,
  claude: extractCitationsFromClaude,
  anthropic: extractCitationsFromClaude, // 兼容 anthropic 引擎名
  deepseek: extractCitationsFromDeepseek,
  google: extractCitationsFromGoogle,
  copilot: extractCitationsFromCopilot,
  grok: extractCitationsFromGrok,
};

/**
 * 派发入口：按 engine 名字派发到对应 extractor
 * @param {Object} rawOutput - engine 适配器返回的 raw response（或 response.raw_answer 当 raw 没存时）
 * @param {string} engineId - 引擎名（openai/claude/perplexity/...）
 * @returns {Citation[]}
 */
function extractCitations(rawOutput, engineId) {
  if (!rawOutput) return [];
  const fn = EXTRACTORS[engineId] || extractCitationsFromUnknown;
  try {
    return fn(rawOutput) || [];
  } catch (_) {
    return [];
  }
}

/**
 * 规范化 citations 数组到 Citation[]（与 raw shape 兼容）
 * 输入可能是 {url, title, snippet}[] 或 {url, title}[]，统一归一化
 */
function normalizeCitations(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((c, i) => parseCitationUrl(c?.url, c?.title, i))
    .filter(Boolean);
}

module.exports = {
  extractCitations,
  normalizeCitations,
  parseCitationUrl,
  extractDomain,
  collectCitations,
  // 导出各 engine 实现（便于未来测试 + 单独调用）
  extractCitationsFromPerplexity,
  extractCitationsFromOpenAI,
  extractCitationsFromClaude,
  EXTRACTORS,
};
