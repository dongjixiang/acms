# ACMS v0.12 多文件上传 + 附件点击打开

> 2026-06-18 晚，多多新需求：
> 1. 上传对话框支持同时选多个文件
> 2. 上传后的文件名加链接允许点击打开（历史附件 chip 也要支持）

## 多多拍板
- **maxCount = 10**
- **不增加混传**（同类型多选，按 popover-item 区分 image/pdf/docx/text）
- **历史附件卡片也要支持点击**（user bubble 里的 attach-chip）

## 改动清单

### 1. 后端：multer single → array
**文件**：`server/routes/chat-upload.js`

**改法**：
- L26 `upload.single('file')` → `upload.array('file', 10)`（maxCount=10）
- L24-44 `/upload` 路由：把 `req.file`（单文件）改成 `req.files`（数组）循环处理每个文件
- 每个文件都返回独立结果 `{ id, name, size, mime, category, icon, url, extractedText, savedAt, parseNote? }`
- 总大小限制保持 20MB/文件（multer.limits 已设）

**边界 case**：
- 0 个文件 → 400 { error: 'NO_FILE' }
- >10 个文件 → multer 抛 `LIMIT_UNEXPECTED_FILE`（转 400 错误）
- 1 个文件但某字段超 20MB → multer 抛 `LIMIT_FILE_SIZE`

### 2. 前端：input 加 `multiple`
**文件**：`client/js/views/requirements.js:2894`

**改法**：`<input type="file" id="chat-file-${req.id}" multiple ...>` —— 加 `multiple` 属性

### 3. 前端：chatUploadFile 改 for 循环
**文件**：`client/js/views/requirements.js:3805-3811`

**改法**：
```js
async function chatUploadFile(reqId, input) {
  const files = Array.from(input.files || []);
  if (files.length === 0) return;
  const category = input.dataset.category || 'unknown';
  // v0.12 多文件上传：依次上传（串行避免服务器压力），UI 上一次显示多张 preview card
  for (const file of files) {
    await chatUploadRawFile(reqId, file, category);
  }
  input.value = '';  // 重置 input，允许重复选同一文件
}
```

### 4. 前端：chatRenderAttachPreview 文件名改链接
**文件**：`client/js/views/requirements.js:3888-3910`

**改法**：
- `attach-card` 已包含 `a.url`（`/api/chat/upload/${id}/raw`）
- 把 `<div class="attach-name">${escHtml(a.name)}</div>` 改成 `<a class="attach-name" href="${escHtml(a.url)}" target="_blank" rel="noopener" title="点击打开">${escHtml(a.name)}</a>`
- 加 CSS 让 `<a>` 看起来像可点的链接（蓝色 + 下划线）

### 5. 前端：user bubble attach-chip 也改链接
**文件**：`client/js/views/requirements.js:3934-3937`

**改法**：
- 历史附件（已发送的消息里的附件 chip）也要可点
- `a.url` 同样存在
- 把 `<span class="attach-chip">${icon} ${escHtml(a.name)}</span>` 改成 `<a class="attach-chip" href="${escHtml(a.url)}" target="_blank" rel="noopener">${icon} ${escHtml(a.name)}</a>`

## 行为示意

**改前**：
```
┌─────────────────────────────┐
│ 🖼 screenshot-20260618.png  │   纯文本文件名
│    142KB · 768字            │
└─────────────────────────────┘

用户气泡：
💬 你  → 🖼 screenshot-20260618.png  ← 纯文本 chip
```

**改后**：
```
┌─────────────────────────────┐
│ 🖼 screenshot-20260618.png  │   ← 蓝色下划线链接，点击新 tab
│    142KB · 768字            │
└─────────────────────────────┘

用户气泡：
💬 你  → 🖼 screenshot-20260618.png  ← 蓝色下划线链接
```

## 验证步骤

```bash
cd /c/Users/swede/acms
node server/index.js
# 浏览器 Ctrl+Shift+R 硬刷 http://localhost:3300/
```

### 多文件上传验证
1. 点 📎 → 选「图片」→ 在系统文件选择器按住 Ctrl 多选 3 张图
2. 期望：3 个 upload card 依次出现，每张显示「⏳ 上传中」→「🔍 AI 识别中...」→ toast 显示总张数
3. 期望：3 个独立 preview card 都正确显示文件名 + 大小

### 链接打开验证
1. 上传 1 张 PNG 图片 → 链接显示蓝色下划线
2. 上传 1 个 PDF → 链接显示蓝色下划线
3. 点击图片链接 → 浏览器新 tab 直接显示图片
4. 点击 PDF 链接 → 浏览器内置 PDF viewer 显示
5. 上传 docx → 点击触发下载（浏览器自动行为）
6. **历史附件**：发消息后，user bubble 里的 attach-chip 也是蓝色下划线可点

### maxCount 验证
1. 选 11 张图 → multer 应返回 `LIMIT_UNEXPECTED_FILE` 错误 → toast 提示

## 改动量预估

| 位置 | 文件 | 改动行数 |
|---|---|---|
| 后端 multer + 路由 | chat-upload.js | +15 / -8 |
| 前端 input multiple | requirements.js | +1 |
| 前端 chatUploadFile | requirements.js | +5 / -1 |
| 前端 attach-name | requirements.js | +2 / -1 |
| 前端 attach-chip | requirements.js | +2 / -1 |
| CSS（可选） | style.css | +6（如果想美化链接） |
| **合计** | **2-3 个文件** | **+25 / -11** |

## 不做的事
- ❌ 不 git / 不 restart 服务器
- ❌ 不增加"任意文件" popover 项（多多说不混传）
- ❌ 不做内置 modal 预览（v0.x 大功能，本期不做）
- ❌ 不做 drag & drop 上传（v0.x 大功能，本期不做）

## 实现细节补充（实际落地时发现）

### 多文件上传：串行 → 并行
`chatUploadFile` 最初写成 `for (const file of files) await chatUploadRawFile(...)` 串行上传，
10 张图串行可能要 5 分钟（每张 vision 30s+）。改成 `Promise.all(files.map(...))` 并发后，
HTTP/1.1 浏览器调度 6 个一组（HTTP/2 多路复用无限制），总时间 ≈ max(单个耗时)。

`chatUploadRawFile` 内部 catch 了所有错误，不会 reject Promise.all，**安全**。

### 顺手修的 race condition
原代码 `const tmpId = '_uploading_' + Date.now()` 在多文件并发时同毫秒 tmpId 会重复，
后完成的 `filter(a => a.id !== tmpId)` 会**过滤掉先完成的真实 data**。

修法：`'_uploading_' + Date.now() + '_' + crypto.randomUUID().slice(0, 8)`，
fallback 到 `Math.random().toString(36).slice(2, 10)`（旧浏览器）。

## 主动指出局限

**局限 ① 总大小没设上限**：multer.array 第二个参数是 maxCount，**文件大小限制是单文件 20MB**（已设）。10 个 20MB 文件 = 200MB 总流量——可能压垮服务器。**风险中等**，建议加 `limits: { fileSize: 20*1024*1024, files: 10 }`
**局限 ② 串行上传慢**：10 张图依次上传 ~10-30s（每张 vision 30s）。可以改 Promise.all 并行，但**服务器瞬时压力大**。先串行稳
**局限 ③ 链接行为由浏览器决定**：docx 用户点开会触发下载——可能用户困惑。HTML `<a download>` 属性可以强制下载，但会让图片/PDF 也强制下载（反而不友好）。**维持浏览器默认行为**
**局限 ④ 后端 array 改造会影响 promote 路由**：chat-upload.js 还有 `/upload/:id/promote` 路由（L59）—— 它的逻辑是按 uploadId 找文件，不依赖 multer 中间件（用的是 `getFilePath(id)` 查 meta JSON）。**不影响**
**局限 ⑤ 前端 a.url 依赖后端 raw 端点**：raw 端点已经有 (`chat-upload.js:47`)，**复用零成本**。但 raw 端点**没鉴权**（`X-API-Key` 是 dev-key-001，但 raw 没检查）—— 文件 ID 是 UUID，**靠不可枚举性做安全**。生产环境应该加鉴权
**局限 ⑥ 历史 chip 是 <span> 改成 <a>**：CSS 样式可能要调整，`<a>` 默认有颜色 + 下划线，但 `attach-chip` 已经是 chip 样式。检查后用 `color: inherit; text-decoration: none;` 在 `:hover` 时改样式更稳