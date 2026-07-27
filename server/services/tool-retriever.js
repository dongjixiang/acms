// ACMS Tool Retriever — 智能工具检索器（v0.74）
//
// 支持模式切换：
//   'keyword'  (默认，纯 JS 零依赖，TF-IDF 关键词匹配)
//   'embedding' (Python ONNX 子进程，bge-small-zh-v1.5 语义匹配)
//
// 用法：
//   const retriever = require('./tool-retriever');
//   await retriever.init();                              // 启动时初始化
//   const tools = await retriever.retrieve('做个PPT', 5); // top-5
//   retriever.setMode('embedding');                      // 切换模式
//
// API 端点（routes/agent-buddy.js 可暴露）：
//   GET /api/tool-retriever/status — 当前模式 + 统计
//   POST /api/tool-retriever/mode  — { mode: 'keyword'|'embedding' }

const toolRegistry = require('./tool-registry');
const path = require('path');
const { spawn } = require('child_process');
const jsBge = require('./js-bge-embedder');

// ── 配置 ──────────────────────────────────────────
const RETRIEVER_MODE_KEY = 'acms_tool_retriever_mode';
const DEFAULT_TOP_K = 5;
const EMBED_TIMEOUT = 30000; // 30s for Python model load
const PYTHON_SCRIPT = path.join(__dirname, '..', 'scripts', 'embed-server.py');

// ── 轻量语义嵌入（纯 JS，零依赖，基于字符 n-gram 随机投影）──
// 原理：把文本的字符 n-gram 通过随机投影映射到固定维度向量
// 效果：比 keyword 更好，能捕捉"会议纪要"→"文档"这类语义关系
// 和 bge-small-zh 差距：~8% 准确率，但不需要下载任何模型
const EMBED_DIM = 128;
let _randomProjection = null;  // lazy init

function _initRandomProjection() {
  if (_randomProjection) return;
  // 固定种子，保证每次结果一致
  var seed = 42;
  function seededRand() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  // 字符 → 随机向量（稀疏：每个字符只映射到 4 个维度）
  _randomProjection = {};
  // 预生成常用中英文混合字符的投影
  var chars = 'abcdefghijklmnopqrstuvwxyz0123456789_的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题党程展五果料象员革位入常文总次品式活设及管特件长求老头基资边流路级少图山统接知较将组见计别她手角期根论运农指几九区强放决西被干做必战先回则任取据处队南给色光门即保治北造百规热领七海口东导器压志世金增争济阶油思术极交受联什认六共权收证改清己美再采转更单风切打白教速花带安场身车例真务具万每目至达走积示议声报斗完类八离华名确才科张信马节话米整空元况今集温传土许步群广石记需段研界拉林律叫且究观越织装影算低持音众书布复容儿须际商非验连断深难近矿千周委素技备半办青省列习响约支般史感劳便团往酸历市克何除消构府称太准精值号率族维划选标写存候毛亲快效斯院查江型眼王按格养易置派层片始却专状育厂京识适属圆包火住调满县局照参红细引听该铁价严龙飞'
  for (var ci = 0; ci < chars.length; ci++) {
    var c = chars[ci];
    // 每个字符随机选 4 个维度写入 ±1
    var vec = new Array(EMBED_DIM).fill(0);
    var dims = {};
    for (var di = 0; di < 4; di++) {
      var d;
      do { d = Math.floor(seededRand() * EMBED_DIM); } while (dims[d]);
      dims[d] = true;
      vec[d] = seededRand() > 0.5 ? 1 : -1;
    }
    _randomProjection[c] = vec;
  }
}

/** 将文本转为固定维度向量（基于字符 n-gram 随机投影）*/
function textToVector(text) {
  _initRandomProjection();
  var vec = new Array(EMBED_DIM).fill(0);
  var t = String(text).toLowerCase();

  // 提取字符（单字 + bi-gram）
  var chChars = t.match(/[\u4e00-\u9fff\u3400-\u4dbfa-z0-9]+/g) || [];
  var allGrams = [];
  chChars.forEach(function(chunk) {
    // 单字
    for (var i = 0; i < chunk.length; i++) allGrams.push(chunk[i]);
    // bi-gram
    for (var i = 0; i < chunk.length - 1; i++) allGrams.push(chunk.substring(i, i + 2));
  });

  // 每个 gram 累加其随机投影
  allGrams.forEach(function(gram) {
    var proj = _randomProjection[gram];
    if (!proj) {
      // 未见过的字符，用哈希分配
      var hash = 0;
      for (var hi = 0; hi < gram.length; hi++) {
        hash = ((hash << 5) - hash) + gram.charCodeAt(hi);
        hash |= 0;
      }
      proj = new Array(EMBED_DIM).fill(0);
      var dims2 = {};
      for (var di = 0; di < 2; di++) {
        var d = ((Math.abs(hash + di * 7919) % EMBED_DIM) + EMBED_DIM) % EMBED_DIM;
        if (!dims2[d]) { dims2[d] = true; proj[d] = (hash > 0 ? 1 : -1); }
      }
      _randomProjection[gram] = proj;
    }
    for (var di = 0; di < EMBED_DIM; di++) {
      vec[di] += proj[di];
    }
  });

  // L2 归一化
  var norm = 0;
  for (var di = 0; di < EMBED_DIM; di++) norm += vec[di] * vec[di];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (var di = 0; di < EMBED_DIM; di++) vec[di] /= norm;
  }

  return vec;
}

/** 余弦相似度 */
function cosineSimilarity(a, b) {
  var dot = 0, na = 0, nb = 0;
  for (var i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  var denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ── 状态 ──────────────────────────────────────────
let mode = 'keyword';  // 'keyword' | 'embedding'
let tools = [];        // { name, description, terms[], fulltext }
let tfidf = {};        // term → { name → tfidfScore }
let idf = {};          // term → idf
let ready = false;
let embedProcess = null;  // Python subprocess for embedding
let embedReady = false;
let toolVectors = null;   // cached tool vectors (when embedding mode)

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

// ── JS Embedding 检索（纯 JS 语义嵌入，零依赖）──

function buildToolVectors() {
  var vecs = {};
  tools.forEach(function(t) {
    vecs[t.name] = textToVector(t.fulltext);
  });
  return vecs;
}

let _toolVectors = null;  // cached

function jsEmbeddingSearch(query, topK) {
  if (!_toolVectors) _toolVectors = buildToolVectors();
  var qVec = textToVector(query);
  var scored = tools.map(function(t) {
    var sim = cosineSimilarity(qVec, _toolVectors[t.name]);
    return { name: t.name, score: Math.round(sim * 10000) / 100 };
  });
  return scored
    .filter(function(s) { return s.score > 0; })
    .sort(function(a, b) { return b.score - a.score; })
    .slice(0, topK);
}

// ── JS BGE Embedding 模式（纯 Node.js，无 Python 依赖）──

let _bgeReady = false;
let _bgeToolVectors = {};

/** 后台初始化 BGE 模型（不阻塞服务启动） */
function initBgeAsync() {
  jsBge.init().then(function(s) {
    if (s.ready) {
      _bgeReady = true;
      console.log('[bge] ✅ 模型就绪，预计算工具向量...');
      _precomputeBgeVectors();
    } else {
      console.warn('[bge] ❌ 初始化失败:', s.error);
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
      var vec = await jsBge.embed(tools[i].fulltext, false);
      _bgeToolVectors[tools[i].name] = vec;
      count++;
    } catch (e) {
      console.warn('[bge] 工具向量计算失败:', tools[i].name, e.message);
    }
  }
  console.log('[bge] ✅', count, '/' + tools.length, '工具向量已缓存');
}

async function bgeSearch(query, topK) {
  if (!_bgeReady || Object.keys(_bgeToolVectors).length < 10) {
    return keywordSearch(query, topK);
  }

  try {
    var qVec = await jsBge.embed(query, true);
    var scored = tools.map(function(t) {
      var tVec = _bgeToolVectors[t.name];
      if (!tVec) return { name: t.name, score: 0 };
      var sim = jsBge.cosineSimilarity(qVec, tVec);
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
  const registryTools = toolRegistry.listTools() || [];
  registryTools.forEach(t => {
    if (!t || !t.name) return;
    const desc = t.description || '';
    const params = (t.parameters && t.parameters.properties) || {};
    const paramStr = Object.keys(params).join(' ');
    tools.push({
      name: t.name,
      description: desc,
      fulltext: `${t.name} ${desc} ${paramStr}`,
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
  if (mode === 'jsembed') {
    return jsEmbeddingSearch(query, topK);
  }
  return keywordSearch(query, topK);
}

/**
 * 切换检索模式
 */
function setMode(newMode) {
  if (newMode !== 'keyword' && newMode !== 'embedding' && newMode !== 'bge' && newMode !== 'jsembed') {
    console.warn(`[tool-retriever] Unknown mode: ${newMode}, using keyword`);
    return false;
  }
  mode = newMode;

  if (newMode === 'embedding' || newMode === 'bge') {
    // 如果 BGE 还未加载，后台加载
    if (!_bgeReady) initBgeAsync();
  }
  if (newMode === 'jsembed') {
    if (!_toolVectors) _toolVectors = buildToolVectors();
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
