# ACMS PPT 编辑器字体格式改进方案

## 当前问题

ACMS PPT 编辑器使用 `<input>` + `<textarea>` 纯文本编辑，零字体格式能力：
- 无法选择字体、字号、颜色
- 无法加粗/斜体/下划线
- 无法设置对齐方式
- 无法富文本编辑

## 对标 OnlyOffice

OO PPT Home tab 字体控制组（来自 Toolbar.js L380-592）：
- `cmbFontName` — 字体名下拉
- `cmbFontSize` — 字号下拉
- `btnBold` / `btnItalic` / `btnUnderline` — B/I/U 按钮
- `btnFontColor` — 字体颜色选择器

## 改造方案

### 1. 编辑区从纯文本改为 contenteditable div
- `#ppt-title`: `<input>` → `<div contenteditable>`
- `#ppt-content`: `<textarea>` → `<div contenteditable>`

### 2. Home tab 新增字体格式组
对齐 OO 的 Home tab 字体控制组：
- **字体组**: B / I / U 按钮
- **字号组**: 12/14/16/18/20/24/30px select
- **字体组**: 宋体/微软雅黑/黑体/Arial/Georgia select
- **颜色组**: 字体颜色 `<input type="color">`
- **对齐组**: 左/中/右/两端对齐按钮

### 3. 使用 execCommand 实现格式
```js
document.execCommand('bold', false, null);
document.execCommand('italic', false, null);
document.execCommand('underline', false, null);
document.execCommand('fontSize', false, '7'); // 1-7
document.execCommand('foreColor', false, '#ff0000');
document.execCommand('justifyLeft');
document.execCommand('justifyCenter');
document.execCommand('justifyRight');
```

### 4. 内容存储格式
- 保存时: `slides[i].title` = titleEl.innerHTML, `slides[i].content` = contentEl.innerHTML
- 加载时: 用 innerHTML 恢复（兼容旧纯文本 schema）
- 兼容旧格式: 检测是否为纯文本，如纯文本则包裹 `<p>` 标签

### 5. 布局改进
- **cover 布局**: 大标题 div + 副标题 div（两个 contenteditable）
- **content 布局**: 标题 div + 正文 div（已有，改为 contenteditable）
- **blank 布局**: 纯正文 div

### 6. 同步 schema
- titleEl 和 contentEl 的 input 事件实时同步到 slides[cur]
- 布局切换时不重新 render，只更新 DOM 样式

## 实现步骤

1. 修改 render() 函数：用 contenteditable div 替代 input/textarea
2. 修改 applyLayout()：适配 contenteditable div
3. 添加 Home tab 字体格式化按钮组
4. 修改事件绑定：input 事件同步到 schema
5. 修改 savePpt/loadPpt：HTML content 兼容
6. 添加 CSS 样式：contenteditable div 的 focus 高亮

## 技术要点

- execCommand 已废弃但所有现代浏览器仍支持
- contenteditable 的 input 事件可以实时监听变化
- 保存时使用 innerHTML 保留格式标签
- 全量渲染模式（render() 重建 DOM）下格式通过 innerHTML 持久化
- 避免使用 fullRender 模式（PPT 每次操作后只更新当前 slide DOM）

## 与 Word 编辑器的区别

Word 使用 block schema + fullRender，格式必须写进 schema。
PPT 使用 contenteditable + innerHTML，格式直接存在 DOM 中，保存时序列化即可。

这是因为 PPT 的每个 slide 是独立渲染单元，不像 Word 需要跨 block 编辑。
