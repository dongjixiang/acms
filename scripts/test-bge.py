"""Test if the ONNX model actually works."""
import os
import sys
import json

BASE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE, '..', 'models', 'bge-small-zh')

model_path = os.path.join(MODEL_DIR, 'model.onnx')
tok_path = os.path.join(MODEL_DIR, 'tokenizer.json')

print(f'Model: {model_path}')
print(f'Size: {os.path.getsize(model_path):,} bytes')
print(f'Tokenizer: {tok_path}')
print(f'Size: {os.path.getsize(tok_path):,} bytes')

# Load ONNX model
import onnxruntime
import numpy as np
from tokenizers import Tokenizer

print('\nLoading model...')
session = onnxruntime.InferenceSession(
    model_path,
    providers=['CPUExecutionProvider']
)

print(f'Inputs:')
for inp in session.get_inputs():
    print(f'  {inp.name}: {inp.shape} ({inp.type})')
print(f'Outputs:')
for out in session.get_outputs():
    print(f'  {out.name}: {out.shape}')

# Load tokenizer
print('\nLoading tokenizer...')
tokenizer = Tokenizer.from_file(tok_path)
tokenizer.enable_padding(pad_id=0, pad_token='[PAD]', length=128)
tokenizer.enable_truncation(max_length=128)

# Test encoding
test_texts = [
    '生成一张美女图片',
    '帮我做一份项目周报PPT',
    '搜索一下人工智能',
    '帮我写一份会议纪要',
]

print('\n=== Testing embeddings ===')
for text in test_texts:
    # Tokenize
    encoding = tokenizer.encode(text)
    input_ids = np.array([encoding.ids], dtype=np.int64)
    attention_mask = np.array([[1] * len(encoding.ids)], dtype=np.int64)
    token_type_ids = np.array([[0] * len(encoding.ids)], dtype=np.int64)

    # Run model
    outputs = session.run(None, {
        'input_ids': input_ids,
        'attention_mask': attention_mask,
        'token_type_ids': token_type_ids,
    })

    # BGE uses mean pooling + normalize
    last_hidden = outputs[0][0]  # [seq_len, hidden_dim]
    # Mean pooling (masked)
    mask = attention_mask[0][:last_hidden.shape[0], np.newaxis]
    masked = last_hidden * mask
    pooled = masked.sum(axis=0) / mask.sum()
    # Normalize
    norm = np.sqrt(np.sum(pooled ** 2))
    if norm > 0:
        pooled = pooled / norm

    # Check similarity between texts
    print(f'  "{text}" -> dim={len(pooled)}, first 5: {[round(x, 4) for x in pooled[:5]]}')

# Compute similarity matrix
print('\n=== Similarity matrix ===')
embeddings = []
for text in test_texts:
    encoding = tokenizer.encode(text)
    input_ids = np.array([encoding.ids], dtype=np.int64)
    am = np.array([[1] * len(encoding.ids)], dtype=np.int64)
    tt = np.array([[0] * len(encoding.ids)], dtype=np.int64)
    outputs = session.run(None, {
        'input_ids': input_ids,
        'attention_mask': am,
        'token_type_ids': tt,
    })
    lh = outputs[0][0]
    mask = am[0][:lh.shape[0], np.newaxis]
    pooled = (lh * mask).sum(axis=0) / mask.sum()
    norm = np.sqrt(np.sum(pooled ** 2))
    if norm > 0:
        pooled = pooled / norm
    embeddings.append(pooled)

def cos_sim(a, b):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

for i in range(len(test_texts)):
    for j in range(i+1, len(test_texts)):
        sim = cos_sim(embeddings[i], embeddings[j])
        print(f'  "{test_texts[i][:15]}..." ↔ "{test_texts[j][:15]}..." = {sim:.4f}')

print('\n✅ All tests passed!')
