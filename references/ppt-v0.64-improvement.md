# ACMS PPT 编辑器 v0.64 字体格式改进

## 改动摘要

### client/js/views/office-editor.js (+289/-141)
- 将 PPT 编辑区从 `<input>` + `<textarea>` 纯文本改为 `<div contenteditable>` 富文本
- 新增 Home tab 字体格式化组（对标 OnlyOffice Home tab）：
  - **字体组**: B / I / U 按钮（execCommand bold/italic/underline）
  - **字号组**: 12/14/16/18/24/32/48px 七档（execCommand fontSize 1-7）
  - **字体组**: Sans/Serif/Mono/宋体 四档（execCommand fontName）
  - **颜色组**: 字体颜色 / 背景颜色（execCommand foreColor/hiliteColor）
  - **对齐组**: 左/中/右/两端对齐（execCommand justifyLeft/Center/Right/Full）
- 新增 `pptOps.execFormat()` / `setFontSize()` / `setFontFamily()` / `setFontColor()` / `setAlign()` 方法
- 新增 `syncCurrentSlide()` 实时同步内容到 schema
- 新增 `normalizeContent()` 兼容旧纯文本 schema（自动包裹 `<p>` 标签）
- 新增 `getSelectedFormat()` 获取当前选区格式状态
- 保存/加载改为 HTML innerHTML 而非纯文本 value

### client/css/office-theme.css (+39)
- 新增 `.ppt-editor-content` 样式：
  - focus 时高亮边框（PPT 棕红色 `#b75b44`）
  - placeholder 显示（`:empty:before`）
  - 嵌套元素样式（h1/h2/p/img/ul/ol/hr）

### client/index.html (+2/-2)
- `office-theme.css?v=0.62.5` → `v=0.64.0`
- `office-editor.js?v=0.62.6` → `v=0.64.0`

## 技术要点

1. **contenteditable + execCommand**：浏览器原生富文本 API，已废弃但所有现代浏览器仍支持
2. **HTML schema**：保存时 `innerHTML`，加载时 `innerHTML`，兼容旧纯文本（`normalizeContent()`）
3. **全量渲染模式**：PPT 每次操作后只更新当前 slide DOM，不重建整个编辑器
4. **对齐 OO Home tab**：B/I/U + 字号 + 字体 + 颜色 + 对齐，对标 OO Toolbar.js L380-592

## 对标 OnlyOffice

| OO Home tab 功能 | ACMS v0.64 实现 |
|-----------------|----------------|
| cmbFontName (字体名) | 4 档字体选择（Sans/Serif/Mono/宋体） |
| cmbFontSize (字号) | 7 档字号（12-48px） |
| btnBold / btnItalic / btnUnderline | B / I / U 按钮 ✓ |
| btnFontColor (字体颜色) | 颜色选择器 ✓ |
| justifyLeft/Center/Right | 对齐按钮 ✓ |
| 背景色 | hiliteColor 按钮 ✓ |

## 已知局限

1. 字体选择只有 4 档，OO 有 50+ 字体（后续可接系统字体列表）
2. 字号只有 7 档，OO 可自定义（后续可加自定义输入）
3. execCommand 已废弃，但这是纯前端方案的最优解（不用引入 Quill/Tiptap 等重量级库）
4. 内容以 HTML 存储，非 OOXML，保存为 .pptx 时需用 pandoc 转换

## 下一步

- [ ] PPT 形状/文本框自由拖放定位（当前只有固定布局）
- [ ] 更多字体选择（系统字体列表）
- [ ] 自定义字号输入
- [ ] 真实 OOXML 读写（当前是 HTML schema）
