"""
ACMS Embedding Server — bge-small-zh-v1.5 via ONNX Runtime (v2)

Protocol:
  Read JSON lines from stdin, write JSON to stdout.
  Ready signal: prints "EMBED_READY" on first load.

  Request: {"text": "要嵌入的文本", "is_query": true}
  Response: {"embedding": [0.123, 0.456, ...], "dim": 512}

  Batch request: {"texts": ["文本1", "文本2", ...], "is_query": false}
  Response: {"embeddings": [[0.1,...], [0.2,...], ...]}

  is_query=true adds BGE instruction prefix for queries (default: false for documents)
"""

import sys
import json
import os
import warnings
warnings.filterwarnings('ignore')

# ── 路径 ──────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(SCRIPT_DIR, '..', 'models', 'bge-small-zh')
MODEL_PATH = os.path.join(MODEL_DIR, 'model.onnx')
TOKENIZER_PATH = os.path.join(MODEL_DIR, 'tokenizer.json')

# BGE query instruction (for asymmetric retrieval)
QUERY_INSTRUCTION = '为这个句子生成表示以用于检索相关文章：'

session = None
tokenizer = None

def init():
    global session, tokenizer
    
    import onnxruntime
    import numpy as np
    from tokenizers import Tokenizer as TK
    
    # Check model files
    if not os.path.exists(MODEL_PATH):
        print(f'[embed] ❌ Model not found: {MODEL_PATH}', flush=True)
        return False
    if not os.path.exists(TOKENIZER_PATH):
        print(f'[embed] ❌ Tokenizer not found: {TOKENIZER_PATH}', flush=True)
        return False
    
    # Load ONNX
    print(f'[embed] Loading model: {MODEL_PATH} ({os.path.getsize(MODEL_PATH)//1024//1024}MB)', flush=True)
    session = onnxruntime.InferenceSession(
        MODEL_PATH,
        providers=['CPUExecutionProvider']
    )
    print(f'[embed] Model loaded. Inputs:', flush=True)
    for inp in session.get_inputs():
        print(f'  {inp.name}: {inp.shape}', flush=True)
    
    # Load tokenizer
    print(f'[embed] Loading tokenizer: {TOKENIZER_PATH}', flush=True)
    tokenizer = TK.from_file(TOKENIZER_PATH)
    tokenizer.enable_truncation(max_length=512)
    tokenizer.no_padding()
    print(f'[embed] Tokenizer loaded. Vocab: {tokenizer.get_vocab_size()}', flush=True)
    
    return True


def embed(text, is_query=False):
    """Compute BGE embedding for text."""
    import numpy as np
    
    # BGE instruction prefix for queries
    if is_query:
        input_text = QUERY_INSTRUCTION + text
    else:
        input_text = text
    
    # Tokenize
    encoding = tokenizer.encode(input_text)
    input_ids = np.array([encoding.ids], dtype=np.int64)
    attention_mask = np.array([[1] * len(encoding.ids)], dtype=np.int64)
    token_type_ids = np.array([[0] * len(encoding.ids)], dtype=np.int64)
    
    # Run ONNX
    outputs = session.run(None, {
        'input_ids': input_ids,
        'attention_mask': attention_mask,
        'token_type_ids': token_type_ids,
    })
    
    # BGE uses CLS token (first token) + L2 normalize
    # outputs[0] is last_hidden_state: [1, seq_len, 512]
    cls_embedding = outputs[0][0][0]  # first token, [CLS]
    
    # L2 normalize
    norm = np.sqrt(np.sum(cls_embedding ** 2))
    if norm > 0:
        cls_embedding = cls_embedding / norm
    
    return cls_embedding.tolist()


def main():
    global session, tokenizer
    
    print('[embed] Starting embed-server v2...', flush=True)
    
    if not init():
        print('[embed] ❌ Initialization failed', flush=True)
        print('EMBED_READY', flush=True)  # Signal ready anyway, Node will fallback
        # Keep alive for fallback mode
        for line in sys.stdin:
            try:
                req = json.loads(line.strip())
                print(json.dumps({"error": "model not loaded", "fallback": True}), flush=True)
            except:
                pass
        return
    
    print('EMBED_READY', flush=True)
    print(f'[embed] ✅ Ready. Accepting requests.', flush=True)
    
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        
        try:
            req = json.loads(line)
            
            # Batch mode: pre-compute many texts at once
            if 'texts' in req:
                texts = req.get('texts', [])
                is_query = req.get('is_query', False)
                embeddings = [embed(t, is_query) for t in texts]
                response = {"embeddings": embeddings, "dim": len(embeddings[0]) if embeddings else 0}
            
            # Single mode
            elif 'text' in req:
                text = req.get('text', '')
                is_query = req.get('is_query', False)
                if not text:
                    response = {"error": "empty text", "embedding": []}
                else:
                    embedding = embed(text, is_query)
                    response = {"embedding": embedding, "dim": len(embedding)}
            
            else:
                response = {"error": "missing text or texts field"}
            
            print(json.dumps(response), flush=True)
            
        except json.JSONDecodeError:
            print(json.dumps({"error": "invalid JSON"}), flush=True)
        except Exception as e:
            print(json.dumps({"error": str(e)}), flush=True)


if __name__ == '__main__':
    main()
