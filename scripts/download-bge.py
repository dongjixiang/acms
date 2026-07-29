"""Try to download bge-small-zh-v1.5 from ModelScope (阿里魔搭)."""
import os
import sys
import json

BASE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE, '..', 'models', 'bge-small-zh')
os.makedirs(MODEL_DIR, exist_ok=True)

print('=== Checking ModelScope for bge-small-zh ===')

import urllib.request
import ssl
ctx = ssl._create_unverified_context()

# ModelScope has its own API
# Try listing files first
ms_api = 'https://www.modelscope.cn/api/v1/models/BAAI/bge-small-zh-v1.5'
try:
    req = urllib.request.Request(ms_api, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
        data = json.loads(resp.read())
        print('Model found!')
        print('Name:', data.get('Name', data.get('name', '?')))
except Exception as e:
    print(f'API failed: {e}')
    # Try the direct model page
    print('Trying direct model page...')

# ModelScope direct download URLs
# For modelscope, files are at:
# https://www.modelscope.cn/models/{org}/{repo}/resolve/{branch}/{file_path}

files_to_try = [
    # ONNX format files
    ('model.onnx', 'https://www.modelscope.cn/models/BAAI/bge-small-zh-v1.5/resolve/master/onnx/model.onnx'),
    ('model.onnx', 'https://www.modelscope.cn/models/BAAI/bge-small-zh-v1.5/resolve/main/onnx/model.onnx'),
    # PyTorch model
    ('pytorch_model.bin', 'https://www.modelscope.cn/models/BAAI/bge-small-zh-v1.5/resolve/master/pytorch_model.bin'),
    # Tokenizer (already have from hf-mirror but try anyway)
    ('tokenizer.json', 'https://www.modelscope.cn/models/BAAI/bge-small-zh-v1.5/resolve/master/tokenizer.json'),
]

already_have = set(os.listdir(MODEL_DIR))
print(f'\nAlready have: {already_have}')

for local_name, url in files_to_try:
    dest = os.path.join(MODEL_DIR, local_name)
    if local_name in already_have and os.path.getsize(dest) > 1000:
        print(f'  ✅ Already have {local_name} ({os.path.getsize(dest):,} bytes)')
        continue
    
    print(f'\n  Trying: {url[:90]}...')
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
            data = resp.read()
            size = len(data)
            if size > 1000:
                with open(dest, 'wb') as f:
                    f.write(data)
                print(f'  ✅ Downloaded! {size:,} bytes')
                if size > 1000000:
                    print(f'  🎉 Model file found!')
            else:
                print(f'  ⚠️  Too small: {size} bytes')
    except urllib.error.HTTPError as e:
        print(f'  ❌ HTTP {e.code}: {e.reason}')
    except Exception as e:
        print(f'  ❌ {e}')

# Final summary
print('\n=== Summary ===')
for f in sorted(os.listdir(MODEL_DIR)):
    sz = os.path.getsize(os.path.join(MODEL_DIR, f))
    if sz > 1000:
        print(f'  ✅ {f}: {sz:,} bytes')
    else:
        print(f'  ⚠️  {f}: {sz} bytes (too small?)')
