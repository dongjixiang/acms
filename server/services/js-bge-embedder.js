// ACMS BGE Embedder — 纯 JS 嵌入引擎（v0.74）
// 在 Node.js 中直接加载 bge-small-zh-v1.5 ONNX 模型
//
// 用法：
//   const bge = require('./js-bge-embedder');
//   await bge.init();
//   const vec = await bge.embed('要嵌入的文本', true);

const path = require('path');
const fs = require('fs');

const MODEL_DIR = path.join(__dirname, '..', '..', 'models', 'bge-small-zh');
const MODEL_PATH = path.join(MODEL_DIR, 'model.onnx');
const TOKENIZER_PATH = path.join(MODEL_DIR, 'tokenizer.json');

const QUERY_INSTRUCTION = '为这个句子生成表示以用于检索相关文章：';
const MAX_LEN = 512;

let session = null;
let vocab = null;
let ready = false;

/** 加载词汇表 */
function _loadVocab() {
  try {
    var data = JSON.parse(fs.readFileSync(TOKENIZER_PATH, 'utf8'));
    if (data.model && data.model.vocab) return data.model.vocab;
    return null;
  } catch (e) {
    console.error('[bge] 词汇表加载失败:', e.message);
    return null;
  }
}

/** 中英文混合的简单分词 + BERT wordpiece */
function _tokenize(text) {
  var lower = text.toLowerCase();
  var pieces = [];

  // 按非字母数字/中文分割
  var segs = lower.split(/([^a-z0-9\u4e00-\u9fff]+)/);
  segs.forEach(function(seg) {
    if (!seg) return;
    if (/^[a-z0-9]+$/.test(seg)) {
      // 英文 -> wordpiece
      _wordpiece(seg, pieces);
    } else if (/[\u4e00-\u9fff]/.test(seg)) {
      // 中文 -> 逐字
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

/** BERT 编码：返回 { ids, mask, tt } （BigInt64Array） */
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
 * 初始化 BGE 模型
 */
async function init() {
  if (ready) return { ready: true };

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
    console.log('[bge] 加载模型:', (modelSize / 1024 / 1024).toFixed(0) + 'MB');
    session = await ort.InferenceSession.create(MODEL_PATH);
    console.log('[bge] 就绪, 词汇表:', Object.keys(vocab).length);
    ready = true;
    return { ready: true };
  } catch (e) {
    return { ready: false, error: e.message };
  }
}

/**
 * 嵌入文本
 * @param {string} text - 文本
 * @param {boolean} isQuery - 是否加 instruction 前缀
 * @returns {Promise<number[]>} 512 维归一化向量
 */
async function embed(text, isQuery) {
  if (!ready) throw new Error('BGE not initialized');

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
  var seqLen = Math.min(encoded.len || 512, 512);
  var dim = 512;
  var vec = new Array(dim).fill(0);

  for (var t = 0; t < seqLen; t++) {
    var offset = t * dim;
    for (var i = 0; i < dim; i++) {
      vec[i] += data[offset + i];
    }
  }

  // 平均
  var invLen = 1 / seqLen;
  for (var i = 0; i < dim; i++) vec[i] *= invLen;

  // L2 normalize
  var norm = 0;
  for (var i = 0; i < dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (var i = 0; i < dim; i++) vec[i] /= norm;

  return vec;
}

/**
 * 批量嵌入
 */
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

function isReady() { return ready; }

module.exports = { init, embed, embedBatch, cosineSimilarity, isReady };
