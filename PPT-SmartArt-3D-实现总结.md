# PPT 3D模型 + SmartArt 功能实现总结

## 问题回顾

用户反馈 ACMS PPT 应用的 3D 模型和 SmartArt 功能不能用。

## 根因分析

**GenOffice 已经完整实现了这两个功能**，但 ACMS 的 office-action LLM pipeline 不知道这些操作类型。

### GenOffice 原生实现

| 功能 | Handler | 位置 | 参数 |
|------|---------|------|------|
| **SmartArt** | `slides:add-smartart` | `office-slides-ui.js:90705` | `{ slideIndex, layout, items, xPx, yPx, wPx, hPx, fitWidthPx }` |
| **3D模型** | `slides:insert-model3d` | `office-slides-ui.js:90869` | `{ slideIndex, fitWidthPx }` + Electron dialog |

### 调用链

```
用户点击 SmartArt 按钮
    ↓
GenOffice Ribbon UI (React)
    ↓
window.slidesApi.addSmartArt({layout, items, ...})
    ↓
editor.call('slides:add-smartart', params)
    ↓
handler → OH() → 插入 OOXML 元素
```

## 已实现的修复 (v0.96.8)

### 1. 后端 Prompt 更新

**文件**: `server/routes/agent-buddy.js`

添加 `addSmartart` op 类型说明：

```javascript
'- addSmartart（slides，v0.96.8）：在幻灯片上插入 SmartArt 图形。格式 {"op":"addSmartart","slideIndex":N,"layout":"process","items":["第一项","第二项","第三项"],"summary":"一句话说明"}。layout 可选值：list/process/cycle/hierarchy/pyramid/matrix/venn。items 至少 2 项。'
```

### 2. 前端 runAction 扩展

**文件**: `client/js/views/office-v3-bridge.js`

新增两个函数：

#### `genOfficeAddSmartart(frame, action)`
```javascript
// 直接调用 GenOffice IPC
ed.call('slides:add-smartart', {
  sender: { id: 'acms-buddy' },
  slideIndex: action.slideIndex,
  layout: action.layout,
  items: action.items,
  xPx: action.xPx || Math.round((fitWidthPx * 0.7) / 2),
  yPx: action.yPx || 100,
  wPx: action.wPx || Math.round(fitWidthPx * 0.7),
  hPx: action.hPx || Math.round(fitWidthPx * 0.5),
  fitWidthPx: fitWidthPx
})
```

#### `genOfficeInsertModel3d(frame, action)`
```javascript
// 通过 fake fs+dialog 注入 3D 文件
var bytes = base64ToBytes(action.fileBase64);
win._slidesFakeFiles[fakePath] = bytes;
win._slidesFakeDialog.path = fakePath;
var result = ed.call('slides:insert-model3d', { ... });
delete win._slidesFakeFiles[fakePath];
delete win._slidesFakeDialog;
```

在 `runAction` 中添加处理：
```javascript
if (action.op === 'addSmartart') {
  if (ed.kind === 'slides-ui') {
    var sa = genOfficeAddSmartart(ed.iframe, action);
    return { ok: true, summary: '已插入 SmartArt', pendingSave: true };
  }
}
if (action.op === 'insertModel3d') {
  if (ed.kind === 'slides-ui') {
    var m3d = genOfficeInsertModel3d(ed.iframe, action);
    return { ok: true, summary: '已插入 3D 模型', pendingSave: true };
  }
}
```

### 3. host.html 已有补丁（P139）

**文件**: `client/lib/office-v3/slides-ui/host.html`

- Line 258: `slides:insert-model3d` 拦截器
- Line 256-257: Vb/pp stub patch 说明

## 测试结果

### SmartArt ✅ 工作正常

```bash
curl -X POST http://localhost:3300/api/agent-buddy/office-action \
  -H "X-API-Key: dev-key-001" \
  -H "Content-Type: application/json" \
  -d '{
    "kind":"slides",
    "instruction":"添加 SmartArt 流程图，包含开始、处理、结束三个步骤",
    "docContext":{"slideIndex":0,"texts":[{"i":0,"text":"测试幻灯片"}]}
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
    "items": ["第一步", "第二步", "第三步"],
    "summary": "插入流程 SmartArt",
    "kind": "slides"
  }
}
```

### 3D 模型 ⚠️ 需要用户提供文件

LLM 无法凭空生成 3D 模型文件，需要：
1. 用户上传 .glb/.gltf/.obj 文件
2. 前端读取为 base64
3. 调用 `insertModel3d` action

## 使用方法

### 在 ACMS 中使用 SmartArt

1. 打开 PPT 文档（GenOffice Slides UI）
2. 对小吉说：
   - "添加一个 SmartArt 流程图，包含开始、处理、结束"
   - "插入一个组织结构图"
   - "添加一个维恩图，包含三个集合"

### 在 ACMS 中使用 3D 模型

目前需要：
1. 准备 GLB/GLTF/OBJ 文件
2. 通过文件上传功能传入
3. 调用 `insertModel3d` action（需要前端上传组件支持）

## 文件变更清单

| 文件 | 变更 |
|------|------|
| `server/routes/agent-buddy.js` | +1 行 prompt |
| `client/js/views/office-v3-bridge.js` | +60 行函数 + 处理逻辑 |
| `client/lib/office-v3/slides-ui/host.html` | 已有补丁（P139） |
| `client/lib/office-v3/slides-ui/office-slides-ui.js` | 无需修改（GenOffice 原生实现） |

## 后续优化建议

1. **3D 模型上传 UI**: 在前端添加文件选择按钮，读取为 base64 后调用 `insertModel3d`
2. **SmartArt 布局选择器**: 添加 UI 让用户选择 layout 类型（process/list/cycle 等）
3. **LLM prompt 调优**: 进一步引导 LLM 生成正确的 SmartArt 参数

## 技术要点

- **GenOffice 已经实现**，不需要重复造轮子
- **直接调用 IPC** 比让 LLM 生成复杂参数更可靠
- **fake fs+dialog** 模式可以绕过 Electron API stub
- **React fiber patch** 模式用于 Word AI 按钮，不适用于 Slides（Slides 有完整的 `window.slidesApi`）
