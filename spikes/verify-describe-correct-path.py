# 验证：给 Qwen 正确文件名，看它是否调 acms_describe_image
import urllib.request, json, time

payload = json.dumps({
    'message': '你看看 C:\\Users\\swede\\Pictures\\桌面截屏.png 有什么？',
    'context': {}
}).encode('utf-8')

req = urllib.request.Request(
    'http://127.0.0.1:3300/api/agent-buddy/chat?api_key=dev-key-001',
    data=payload,
    headers={'Content-Type': 'application/json', 'X-API-Key': 'dev-key-001'}
)
try:
    resp = urllib.request.urlopen(req, timeout=300)
    body = resp.read().decode('utf-8')
    print('HTTP', resp.status)
    print(body[:2000])
except urllib.error.HTTPError as e:
    print('HTTPError', e.code)
    print(e.read().decode('utf-8')[:800])
except Exception as e:
    print('ERR', type(e).__name__, str(e)[:300])
