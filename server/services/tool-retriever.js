// ACMS Tool Retriever — 智能工具检索器（v0.89）
//
// 支持模式切换：
//   'keyword'  (默认，纯 JS 零依赖，TF-IDF 关键词匹配 + DOMAIN_TERMS 中文意图词)
//   'bge'      (embedding-service 语义匹配，可换模型；向量全量就绪才生效)
//
// 用法：
//   const retriever = require('./tool-retriever');
//   await retriever.init();                              // 启动时初始化
//   const tools = await retriever.retrieve('做个PPT', 5); // top-5
//   retriever.setMode('bge');                            // 切换模式
//
// API 端点（routes/agent-buddy.js 可暴露）：
//   GET /api/tool-retriever/status — 当前模式 + 统计
//   POST /api/tool-retriever/mode  — { mode: 'keyword'|'bge' }

const toolRegistry = require('./tool-registry');
// v0.89: 改用通用 embedding-service（模型可配置，工具检索/知识库检索共用）
const embeddingService = require('./embedding-service');

// ── 配置 ──────────────────────────────────────────
const RETRIEVER_MODE_KEY = 'acms_tool_retriever_mode';
const DEFAULT_TOP_K = 5;

// ── 状态 ──────────────────────────────────────────
let mode = 'keyword';  // 'keyword' | 'embedding' | 'bge'
let tools = [];        // { name, description, terms[], fulltext }
let tfidf = {};        // term → { name → tfidfScore }
let idf = {};          // term → idf
let ready = false;

// ── 同义词扩展（提升 keyword 模式语义覆盖率）──
const SYNONYM_MAP = {
  'ppt': ['ppt', '演示', '幻灯片', '演讲', 'presentation', 'pptx', '汇报', '展示'],
  'docx': ['docx', 'word', '文档', '报告', '纪要', '文稿', '文件', '文字'],
  'xlsx': ['xlsx', 'excel', '表格', '电子表', '数据表', 'excel'],
  'email': ['email', '邮件', 'mail', '通知', '发送', '发信', 'mail'],
  'search': ['search', '搜索', '搜', '查找', '找', '查', '寻找', 'query'],
  '图片': ['图片', '图像', '图', 'image', 'photo', '照片', '插图', 'pic'],
  '视频': ['视频', 'video', '影片', '电影', '录像', 'clip'],
  '音乐': ['音乐', 'music', '歌', '歌曲', '播放', '听', 'audio', 'mp3'],
  'task': ['task', '任务', '工作', '事项', 'todo', '待办', '分配', '指派'],
  'requirement': ['requirement', '需求', '要求', '功能', 'feature', 'prd', '规格'],
  // 注意：不要把"需求"映射到 search——"查需求是谁提的"应该匹配 requirement 工具，不是 search 工具
  'bug': ['bug', '缺陷', '问题', '故障', '错误', 'issue', '故障'],
  'dashboard': ['dashboard', '仪表盘', '统计', '概览', '数据', '图表', '总览', '看板'],
  'user': ['user', '用户', '成员', '人', '团队', '账号', '登录'],
  'generate': ['generate', '生成', '创建', '新建', '写', '制作', '创建', '建立'],
};

/** 扩展查询词（原词 + 同义词）——只有原词完整匹配同义词才扩展 */
function expandQuery(tokens) {
  const expanded = new Set(tokens);
  tokens.forEach(t => {
    const lower = t.toLowerCase();
    Object.keys(SYNONYM_MAP).forEach(key => {
      const syns = SYNONYM_MAP[key];
      // 只当原词完全等于某个同义词时才扩展（避免"需"→"需求"的误匹配）
      if (syns.includes(lower)) {
        syns.forEach(s => expanded.add(s));
      }
    });
  });
  return [...expanded];
}

// ── 分词辅助 ──────────────────────────────────────

/** 简单中英文分词：英文按空格/标点，中文按 bi-gram */
function tokenize(text) {
  const t = String(text).toLowerCase();
  const tokens = new Set();

  // 英文/数字词
  const enTokens = t.match(/[a-z][a-z0-9_]+/g) || [];
  enTokens.forEach(w => tokens.add(w));

  // 中文 bi-gram（2-gram，比单字更准）
  const chChars = t.match(/[\u4e00-\u9fff\u3400-\u4dbf]+/g) || [];
  chChars.forEach(chunk => {
    // 单字
    for (let i = 0; i < chunk.length; i++) tokens.add(chunk[i]);
    // bi-gram
    for (let i = 0; i < chunk.length - 1; i++) tokens.add(chunk.substring(i, i + 2));
  });

  // 数字
  const nums = t.match(/\d+/g) || [];
  nums.forEach(n => tokens.add(n));

  // 中文常用停用词过滤
  const stopWords = new Set(['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
    '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这',
    '他', '她', '它', '们', '那', '些', '来', '为', '以', '能', '下', '过', '个', '之', '与', '及']);

  return [...tokens].filter(t => t.length >= 1 && !stopWords.has(t));
}

// ── TF-IDF 索引构建 ───────────────────────────────

function buildIndex() {
  tfidf = {};
  idf = {};
  const docCount = tools.length;

  tools.forEach(tool => {
    const terms = tokenize(tool.fulltext);
    const termFreq = {};
    terms.forEach(t => { termFreq[t] = (termFreq[t] || 0) + 1; });

    // 工具名中的词额外加权
    const nameTerms = tokenize(tool.name);
    nameTerms.forEach(t => { termFreq[t] = (termFreq[t] || 0) + 3; });

    Object.entries(termFreq).forEach(([term, count]) => {
      if (!tfidf[term]) tfidf[term] = {};
      // TF = log(1 + count), normalized by max freq
      tfidf[term][tool.name] = 1 + Math.log(count);
      idf[term] = (idf[term] || 0) + 1;
    });
  });

  // 计算 IDF
  Object.keys(idf).forEach(term => {
    idf[term] = 1 + Math.log(docCount / (1 + idf[term]));
  });
}

/** TF-IDF 检索，返回 [{ name, score }] */
function keywordSearch(query, topK = DEFAULT_TOP_K) {
  const queryTerms = expandQuery(tokenize(query));
  if (queryTerms.length === 0) return [];

  // 工具名精确匹配加分
  const exactNameBonus = 10;

  const scores = {};
  tools.forEach(t => { scores[t.name] = 0; });

  queryTerms.forEach(qt => {
    const postings = tfidf[qt];
    if (!postings) return;
    const qtIdf = idf[qt] || 0;
    Object.entries(postings).forEach(([toolName, tf]) => {
      scores[toolName] = (scores[toolName] || 0) + tf * qtIdf;
    });
  });

  // 精确匹配工具名额外加分
  queryTerms.forEach(qt => {
    tools.forEach(t => {
      if (t.name === qt || t.name.replace('_', '') === qt) {
        scores[t.name] = (scores[t.name] || 0) + exactNameBonus;
      }
    });
  });

  return Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([name, score]) => ({
      name,
      score: Math.round(score * 100) / 100,
    }));
}

// ── BGE Embedding 模式（v0.89 改用通用 embedding-service）──

let _bgeReady = false;
let _bgeToolVectors = {};
let _bgeInitStarted = false;

/** 后台初始化 BGE 模型（不阻塞服务启动） */
function initBgeAsync() {
  if (_bgeInitStarted) return;
  _bgeInitStarted = true;
  embeddingService.init().then(function(s) {
    if (s.ready) {
      console.log('[bge] ✅ 模型就绪，预计算工具向量...');
      return _precomputeBgeVectors();
    } else {
      console.warn('[bge] ❌ 初始化失败:', s.error);
    }
  }).then(function() {
    // v0.89 fix: _bgeReady 在向量全部预计算完成后才置位
    //   之前 init() 一 resolve 就置 ready，用户立即查询时只有部分向量可检索
    //   （实测 16/87），检索结果严重缺失。
    if (Object.keys(_bgeToolVectors).length > 0) {
      _bgeReady = true;
      console.log('[bge] ✅ 全部工具向量就绪:', Object.keys(_bgeToolVectors).length, '个');
    }
  }).catch(function(e) {
    console.warn('[bge] ❌ 初始化失败:', e.message);
  });
}

async function _precomputeBgeVectors() {
  _bgeToolVectors = {};
  var count = 0;
  for (var i = 0; i < tools.length; i++) {
    try {
      var vec = await embeddingService.embed(tools[i].fulltext, false);
      _bgeToolVectors[tools[i].name] = vec;
      count++;
    } catch (e) {
      console.warn('[bge] 工具向量计算失败:', tools[i].name, e.message);
    }
  }
  console.log('[bge] 工具向量计算完成:', count, '/' + tools.length);
  return count;
}

async function bgeSearch(query, topK) {
  // v0.89: 必须模型就绪 + 全部向量算完才走 bge；否则降级 keyword
  if (!_bgeReady || Object.keys(_bgeToolVectors).length < tools.length) {
    return keywordSearch(query, topK);
  }

  try {
    var qVec = await embeddingService.embed(query, true);
    var scored = tools.map(function(t) {
      var tVec = _bgeToolVectors[t.name];
      if (!tVec) return { name: t.name, score: 0 };
      var sim = embeddingService.cosineSimilarity(qVec, tVec);
      return { name: t.name, score: Math.round(sim * 10000) / 100 };
    });
    return scored
      .filter(function(s) { return s.score > 0; })
      .sort(function(a, b) { return b.score - a.score; })
      .slice(0, topK);
  } catch (e) {
    console.warn('[bge] 检索失败:', e.message);
    return keywordSearch(query, topK);
  }
}

// ── 公开 API ──────────────────────────────────────

/**
 * 初始化检索器（必须在 tool-registry 加载后调用）
 * 自动加载所有已注册工具 + app-tools
 */
async function init() {
  tools = [];
  // v0.88: 域词典（agent_* 描述是英文，中文检索捞不出执行工具 → 注入中文意图词）
  let domainTerms = {};
  try {
    const { DOMAIN_TERMS } = require('./tool-pools');
    domainTerms = DOMAIN_TERMS || {};
  } catch (e) { /* tool-pools 不可用时忽略 */ }

  const registryTools = toolRegistry.listTools() || [];
  registryTools.forEach(t => {
    if (!t || !t.name) return;
    const desc = t.description || '';
    const params = (t.parameters && t.parameters.properties) || {};
    const paramStr = Object.keys(params).join(' ');
    // v0.88: 附加中文意图词（按 pool domain 匹配）
    let intentTerms = '';
    try {
      const pool = toolRegistry.getToolPool(t.name);
      if (pool && pool.domain && domainTerms[pool.domain]) {
        intentTerms = ' ' + domainTerms[pool.domain].join(' ');
      }
    } catch (e) { /* 忽略 */ }
    tools.push({
      name: t.name,
      description: desc,
      fulltext: `${t.name} ${desc} ${paramStr} ${intentTerms}`,
    });
  });

  // 也加载 app-tools
  try {
    const appToolsRegistry = require('./app-tools-registry');
    const appToolNames = appToolsRegistry.listAppToolNames ? appToolsRegistry.listAppToolNames() : [];
    appToolNames.forEach(name => {
      // app-tools might not have full schemas, use name-based
      if (!tools.find(t => t.name === name)) {
        tools.push({
          name,
          description: `App tool: ${name}`,
          fulltext: `${name} app tool ${name.replace(/_/g, ' ')}`,
        });
      }
    });
  } catch (e) { /* app-tools-registry not available */ }

  buildIndex();

  // 后台加载 BGE 模型（不阻塞服务）
  // v0.89: 'embedding' 是旧 Python 子进程模式名，统一收敛为 'bge'（保留别名兼容）
  if (mode === 'embedding' || mode === 'bge') {
    initBgeAsync();
  }

  ready = true;
  console.log(`[tool-retriever] ✅ 就绪: ${tools.length} 个工具, mode=${mode}`);

  return { count: tools.length, mode };
}

/**
 * 检索与查询最相关的工具
 * @param {string} query - 用户消息
 * @param {number} topK - 返回数量
 * @returns {Promise<{name: string, score: number}[]>}
 */
async function retrieve(query, topK = DEFAULT_TOP_K) {
  if (!ready) await init();
  if (!query || typeof query !== 'string') return [];

  if (mode === 'embedding' || mode === 'bge') {
    return bgeSearch(query, topK);
  }
  return keywordSearch(query, topK);
}

/**
 * 切换检索模式
 */
function setMode(newMode) {
  // v0.89: 统一模式名（'embedding' 保留为 'bge' 别名，兼容前端 badge 切换）
  if (newMode === 'embedding') newMode = 'bge';
  if (newMode !== 'keyword' && newMode !== 'bge') {
    console.warn(`[tool-retriever] Unknown mode: ${newMode}, using keyword`);
    return false;
  }
  mode = newMode;

  if (mode === 'bge') {
    // 如果 BGE 还未加载，后台加载
    if (!_bgeReady) initBgeAsync();
  }
  return true;
}

function getMode() { return mode; }

/**
 * 状态报告
 */
function status() {
  return {
    mode,
    ready,
    toolsCount: tools.length,
    bgeReady: _bgeReady,
    bgeToolVectors: Object.keys(_bgeToolVectors).length,
    topK: DEFAULT_TOP_K,
  };
}

module.exports = {
  init,
  retrieve,
  setMode,
  getMode,
  status,
  // 测试/调试用
  _tokenize: tokenize,
  _keywordSearch: keywordSearch,
};
