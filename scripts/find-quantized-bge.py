"""Search for quantized/smaller BGE models on Chinese mirrors."""
import os, sys, json, urllib.request, ssl
ctx = ssl._create_unverified_context()
hdr = {'User-Agent': 'Mozilla/5.0'}
BASE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE, '..', 'models', 'bge-small-zh')
os.makedirs(MODEL_DIR, exist_ok=True)

print('=== Current files ===')
for f in sorted(os.listdir(MODEL_DIR)):
    sz = os.path.getsize(os.path.join(MODEL_DIR, f))
    if sz > 1000:
        print(f'  {f}: {sz:,} bytes')

# Check ModelScope API for ONNX files
print('\n=== ModelScope file listing ===')
for path in ['', 'onnx/']:
    url = f'https://www.modelscope.cn/api/v1/models/BAAI/bge-small-zh-v1.5/repo?Revision=master&FilePath={path}'
    try:
        req = urllib.request.Request(url, headers=hdr)
        with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
            data = json.loads(resp.read())
            if isinstance(data, list):
                for f in data:
                    n = f.get('Name', f.get('name', ''))
                    s = f.get('Size', f.get('size', 0))
                    if any(x in n.lower() for x in ['onnx', 'quant']):
                        print(f'  {n}: {s:,} bytes')
    except Exception as e:
        print(f'  {e}')

# Try Xenova ONNX models (community optimized versions)
print('\n=== Trying Xenova ONNX versions ===')
xenova_models = [
    ('Xenova/bge-small-zh-v1.5', 'onnx/model.onnx', 'xenova_bge.onnx'),
    ('Xenova/bge-small-zh-v1.5', 'onnx/model_quantized.onnx', 'xenova_bge_quant.onnx'),
]
for repo, file, local in xenova_models:
    dest = os.path.join(MODEL_DIR, local)
    if os.path.exists(dest) and os.path.getsize(dest) > 100000:
        print(f'  ✅ Have {local} ({os.path.getsize(dest):,} bytes)')
        continue
    url = f'https://hf-mirror.com/{repo}/resolve/main/{file}'
    try:
        print(f'  Trying {url[:80]}...', end=' ')
        req = urllib.request.Request(url, headers=hdr)
        with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
            data = resp.read()
            print(f'{len(data):,} bytes')
            if len(data) > 100000:
                with open(dest, 'wb') as f: f.write(data)
    except Exception as e:
        print(f'failed: {str(e)[:50]}')

# Also check ModelScope for same Xenova model
ms_url = 'https://www.modelscope.cn/models/Xenova/bge-small-zh-v1.5/resolve/master/onnx/model_quantized.onnx'
try:
    print(f'\nChecking ModelScope Xenova quantized...', end=' ')
    req = urllib.request.Request(ms_url, headers=hdr)
    with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
        data = resp.read()
        print(f'{len(data):,} bytes')
        if len(data) > 100000:
            with open(os.path.join(MODEL_DIR, 'ms_quant.onnx'), 'wb') as f: f.write(data)
except Exception as e:
    print(f'failed: {str(e)[:50]}')

print('\n=== Final files ===')
total = 0
for f in sorted(os.listdir(MODEL_DIR)):
    sz = os.path.getsize(os.path.join(MODEL_DIR, f))
    if sz > 1000:
        print(f'  {f}: {sz:,} bytes')
        total += sz
print(f'  Total: {total:,} bytes ({total/1024/1024:.1f} MB)')
