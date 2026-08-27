import json, urllib.request, sys

payload = json.dumps({
    "reqId": "sess-7248848952b2bdc4",
    "text": "看看 C:\\Users\\swede\\acms\\data\\chat-uploads\\bizhihui_com_202504061743926406654655.jpg 这张图里有什么"
})

req = urllib.request.Request(
    "http://localhost:3300/api/chat/detect-and-respond?api_key=dev-key-001",
    data=payload.encode(),
    headers={"Content-Type": "application/json"},
    method="POST"
)

try:
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = resp.read().decode('utf-8', errors='replace')
        print("BYTES:", len(data))
        # 统计事件类型和工具名
        import re
        types = re.findall(r'"type":"([^"]*)"', data)
        from collections import Counter
        print("EVENT_TYPES:", dict(Counter(types)))
        tools = re.findall(r'"tool_name":"([^"]*)"', data)
        print("TOOLS:", dict(Counter(tools)))
        # 打印最后 500 字符（看最终回复）
        print("TAIL:", data[-500:])
except Exception as e:
    print("ERROR:", e)
