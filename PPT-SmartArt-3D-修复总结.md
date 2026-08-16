# PPT SmartArt + 3D 模型修复总结

## 问题
用户在 PPT 编辑器中点击"插入 → SmartArt"和"插入 → 3D 模型"按钮无法工作。

## 根因
**API 名称不匹配**：
- GenOffice UI 调用：`window.slidesApi.addSmartArt({...})`
- Proxy 转换：`window.__slidesEditor.call('addSmartArt', {...})`
- Handler 注册：`at.handle('slides:add-smartart', ...)`

**缺少映射**：`addSmartArt` → `slides:add-smartart`

## 修复内容

### 1. host.html API 名称映射（关键修复）

**文件**: `client/lib/office-v3/slides-ui/host.html`

在 `ed.call` wrapper 中添加 CamelCase → snake_case 映射：

```javascript
const ch = channel === 'addSmartArt' ? 'slides:add-smartart' :
           channel === 'insertModel3d' ? 'slides:insert-model3d' :
           channel === 'addChart' ? 'slides:add-chart' :
           channel === 'addElement' ? 'slides:add-element' :
           channel === 'addTable' ? 'slides:add-table' :
           channel
```

### 2. bridge.js 函数（备用路径）

**文件**: `client/js/views/office-v3-bridge.js`

添加 `genOfficeAddSmartart()` 和 `genOfficeInsertModel3d()` 函数，用于小吉对话触发场景。

### 3. 后端 prompt 更新

**文件**: `server/routes/agent-buddy.js`

添加 `addSmartart` op 类型说明，让 LLM 能生成正确的 action。

## 测试验证

### 后端 API 测试 ✅
```bash
curl -X POST http://localhost:3300/api/agent-buddy/office-action \
  -H "X-API-Key: dev-key-001" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "slides",
    "instruction": "add a SmartArt process diagram with items: Start, Process, End",
    "docContext": {"slideIndex": 0, "texts": [{"i": 0, "text": "test"}]}
  }'
```

返回：
```json
{
  "ok": true,
  "action": {
    "op": "addSmartart",
    "slideIndex": 0,
    "layout": "process",
    "items": ["Start", "Process", "End"],
    "summary": "add a SmartArt process diagram...",
    "kind": "slides"
  }
}
```

### 前端按钮测试
1. 打开 ACMS 主界面
2. 打开 PPT 文档
3. 点击 **插入 → SmartArt → 基本流程**
4. 应该能在幻灯片上看到 SmartArt 图形

## 文件变更清单

| 文件 | 变更 |
|------|------|
| `client/lib/office-v3/slides-ui/host.html` | +6 行 API 映射 |
| `client/js/views/office-v3-bridge.js` | +60 行函数 + 处理逻辑 |
| `server/routes/agent-buddy.js` | +1 行 prompt |

## 后续优化建议

1. **3D 模型上传 UI**: 添加文件选择按钮，读取为 base64 后调用 `insertModel3d`
2. **SmartArt 布局选择**: 添加 UI 让用户选择 layout 类型
3. **错误处理**: 添加更友好的错误提示
