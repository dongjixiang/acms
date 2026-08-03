// ACMS Embedding Service — 通用嵌入服务（v0.89）
//
// 设计目标（2026-08-03 多多拍板）：
//   BGE 的价值不在工具检索（keyword + DOMAIN_TERMS 已够），在未来的知识库 RAG。
//   本服务把"嵌入能力"做成通用层：
//     1. 统一 embed / search 接口（工具检索和知识库检索共用）
//     2. 模型可配置（config.json 指定模型目录，未来换 bge-base / bge-m3 零代码改动）
//     3. 正确的就绪语义（模型 + 向量索引全部就绪才算 ready，修 _bgeReady 置位过早 bug）
//
// 用法：
//   const embed = require('./embedding-service');
//   await embed.init();                       // 启动时后台加载
//   const vec = await embed.embed('文本', true);  // isQuery 加 instruction 前缀
//   embed.indexDocs([{name, text}]);          // 建向量索引（知识库场景）
//   embed.search(query, topK);                // 向量检索
//
// 模型配置（config.json → embedding 段）：
//   {
//     "embedding": {
//       "enabled": true,
//       "modelDir": "models/bge-small-zh",   // 相对 ACMS 根目录
//       "modelFile": "model.onnx",
//       "tokenizerFile": "tokenizer.json",
//       "instruction": "为这个句子生成表示以用于检索相关文章："
//     }
//   }

const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');

// ── 配置（默认 bge-small-zh，可用 config.json 覆盖）──
function _loadConfig() {
  const cfg = { enabled: true, modelDir: 'models/bge-small-zh', modelFile: 'model.onnx', tokenizerFile: 'tokenizer.json' };
  try {
    const configPath = path.join(ROOT, 'config.json');
    if (fs.existsSync(configPath)) {
      const json = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (json.embedding) Object.assign(cfg, json.embedding);
    }
  } catch (e) { /* 配置损坏时用默认 */ }
  return cfg;
}

const cfg = _loadConfig();
const MODEL_DIR = path.join(ROOT, cfg.modelDir);
const MODEL_PATH = path.join(MODEL_DIR, cfg.modelFile);
const TOKENIZER_PATH = path.join(MODEL_DIR, cfg.tokenizerFile);
const QUERY_INSTRUCTION = cfg.instruction || '为这个句子生成表示以用于检索相关文章：';
const MAX_LEN = 512;

let session = null;
let vocab = null;
let ready = false;
let initError = null;
let _docIndex = [];      // [{ name, text, vec }] 知识库文档向量索引
let _initPromise = null;

/** 加载词汇表 */
function _loadVocab() {
  try {
    var data = JSON.parse(fs.readFileSync(TOKENIZER_PATH, 'utf8'));
    if (data.model && data.model.vocab) return data.model.vocab;
    return null;
  } catch (e) {
    console.error('[embedding] 词汇表加载失败:', e.message);
    return null;
  }
}

/** 中英文混合的简单分词 + BERT wordpiece */
function _tokenize(text) {
  var lower = text.toLowerCase();
  var pieces = [];
  var segs = lower.split(/([^a-z0-9\u4e00-\u9fff]+)/);
  segs.forEach(function(seg) {
    if (!seg) return;
    if (/^[a-z0-9]+$/.test(seg)) {
      _wordpiece(seg, pieces);
    } else if (/[\u4e00-\u9fff]/.test(seg)) {
      for (var i = 0; i < seg.length; i++) {
        var ch = seg[i];
        if (/[\u4e00-\u9fff]/.test(ch)) pieces.push(ch);
      }
    }
  });
  return pieces;
}

function _wordpiece(word, pieces) {
  if (vocab[word] !== undefined) { pieces.push(word); return; }
  var remaining = word;
  while (remaining.length > 0) {
    var found = false;
    for (var len = remaining.length; len > 0; len--) {
      var sub = remaining.substring(0, len);
      var lookup = pieces.length > 0 ? '##' + sub : sub;
      if (vocab[lookup] !== undefined) {
        pieces.push(lookup);
        remaining = remaining.substring(len);
        found = true;
        break;
      }
    }
    if (!found) { pieces.push('[UNK]'); break; }
  }
}

/** BERT 编码：返回 { ids, mask, tt, len } */
function _encode(text) {
  var tokens = ['[CLS]'].concat(_tokenize(text)).concat(['[SEP]']);
  var ids = new BigInt64Array(MAX_LEN);
  var mask = new BigInt64Array(MAX_LEN);
  var tt = new BigInt64Array(MAX_LEN);
  var unkId = BigInt(vocab['[UNK]'] || 100);
  var padId = BigInt(vocab['[PAD]'] || 0);
  for (var i = 0; i < Math.min(tokens.length, MAX_LEN); i++) {
    var id = vocab[tokens[i]];
    ids[i] = id !== undefined ? BigInt(id) : unkId;
    mask[i] = 1n;
  }
  return { ids: ids, mask: mask, tt: tt, len: Math.min(tokens.length, MAX_LEN) };
}

/**
 * 初始化模型（幂等，可重入）
 * 注意：ready 只在模型加载成功后才置位；调用方可等待 init() resolve
 */
async function init(force) {
  if (ready) return { ready: true, modelDir: cfg.modelDir };
  if (!cfg.enabled) return { ready: false, error: 'embedding disabled in config.json' };
  if (_initPromise && !force) return _initPromise;

  _initPromise = (async () => {
    if (!fs.existsSync(MODEL_PATH)) {
      return { ready: false, error: 'model not found: ' + MODEL_PATH };
    }
    if (!fs.existsSync(TOKENIZER_PATH)) {
      return { ready: false, error: 'tokenizer not found: ' + TOKENIZER_PATH };
    }
    vocab = _loadVocab();
    if (!vocab || Object.keys(vocab).length < 1000) {
      return { ready: false, error: 'vocab too small: ' + (vocab ? Object.keys(vocab).length : 0) };
    }
    try {
      var ort = require('onnxruntime-node');
      var modelSize = fs.statSync(MODEL_PATH).size;
      console.log('[embedding] 加载模型:', cfg.modelDir, (modelSize / 1024 / 1024).toFixed(0) + 'MB');
      session = await ort.InferenceSession.create(MODEL_PATH);
      ready = true;
      initError = null;
      console.log('[embedding] ✅ 就绪, 词汇表:', Object.keys(vocab).length);
      return { ready: true, modelDir: cfg.modelDir };
    } catch (e) {
      initError = e.message;
      return { ready: false, error: e.message };
    }
  })();
  return _initPromise;
}

/**
 * 嵌入文本
 * @param {string} text
 * @param {boolean} isQuery - 是否加 instruction 前缀（检索 query 用 true，文档用 false）
 * @returns {Promise<number[]>} 归一化向量
 */
async function embed(text, isQuery) {
  if (!ready) throw new Error('embedding not initialized');
  var inputText = isQuery ? QUERY_INSTRUCTION + text : text;
  var encoded = _encode(inputText);
  var ort = require('onnxruntime-node');
  var Tensor = ort.Tensor;
  var feeds = {
    'input_ids': new Tensor('int64', encoded.ids, [1, MAX_LEN]),
    'attention_mask': new Tensor('int64', encoded.mask, [1, MAX_LEN]),
    'token_type_ids': new Tensor('int64', encoded.tt, [1, MAX_LEN]),
  };
  var results = await session.run(feeds);
  var data = results['last_hidden_state'].data;
  // Mean pooling（对短文本比 CLS 更稳定）
  var seqLen = Math.min(encoded.len || MAX_LEN, MAX_LEN);
  var dim = data.length / MAX_LEN;
  var vec = new Array(dim).fill(0);
  for (var t = 0; t < seqLen; t++) {
    var offset = t * dim;
    for (var i = 0; i < dim; i++) vec[i] += data[offset + i];
  }
  var invLen = 1 / seqLen;
  for (var i = 0; i < dim; i++) vec[i] *= invLen;
  // L2 normalize
  var norm = 0;
  for (var i = 0; i < dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (var i = 0; i < dim; i++) vec[i] /= norm;
  return vec;
}

/** 批量嵌入（串行，避免并发撑爆 onnxruntime） */
async function embedBatch(texts, isQuery) {
  var results = [];
  for (var i = 0; i < texts.length; i++) {
    results.push(await embed(texts[i], isQuery));
  }
  return results;
}

function cosineSimilarity(a, b) {
  var dot = 0, na = 0, nb = 0;
  for (var i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  var de = Math.sqrt(na) * Math.sqrt(nb);
  return de === 0 ? 0 : dot / de;
}

// ── 文档向量索引（知识库场景）──

/** 建索引：docs = [{ name, text }] → 全部嵌入并缓存 */
async function indexDocs(docs, onProgress) {
  if (!ready) throw new Error('embedding not initialized');
  _docIndex = [];
  var total = docs.length;
  for (var i = 0; i < total; i++) {
    var vec = await embed(docs[i].text || '', false);
    _docIndex.push({ name: docs[i].name, text: docs[i].text, vec: vec });
    if (onProgress && (i % 10 === 0 || i === total - 1)) onProgress(i + 1, total);
  }
  return { indexed: _docIndex.length, dim: _docIndex.length > 0 ? _docIndex[0].vec.length : 0 };
}

/** 向量检索：query → topK 文档 */
async function search(query, topK) {
  if (!ready) throw new Error('embedding not initialized');
  if (_docIndex.length === 0) return [];
  var qVec = await embed(query, true);
  var scored = _docIndex.map(function(d, i) {
    return { name: d.name, text: d.text, index: i, score: cosineSimilarity(qVec, d.vec) };
  });
  return scored.sort(function(a, b) { return b.score - a.score; }).slice(0, topK || 5);
}

/** 工具向量检索：docs = [{name, text}] 实时检索（工具检索场景，不缓存） */
async function searchDocs(query, docs, topK) {
  if (!ready) throw new Error('embedding not initialized');
  if (!docs || docs.length === 0) return [];
  var qVec = await embed(query, true);
  var scored = [];
  for (var i = 0; i < docs.length; i++) {
    var dVec = await embed(docs[i].text || '', false);
    scored.push({ name: docs[i].name, score: cosineSimilarity(qVec, dVec) });
  }
  return scored.sort(function(a, b) { return b.score - a.score; }).slice(0, topK || 5);
}

function isReady() { return ready; }
function getModelInfo() {
  return { enabled: cfg.enabled, ready: ready, error: initError, modelDir: cfg.modelDir, docIndexCount: _docIndex.length };
}

module.exports = { init, embed, embedBatch, cosineSimilarity, indexDocs, search, searchDocs, isReady, getModelInfo };
