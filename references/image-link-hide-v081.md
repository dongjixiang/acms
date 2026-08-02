# ACMS v0.81 - 图片搜索链接隐藏修复

## 问题描述
用户在使用 ACMS 的图片搜索功能时，发现：
1. 搜索返回的图片结果正常显示在动作卡片中
2. **但同时也会返回一批文字搜索结果**，其中包含 URL 链接
3. 用户不希望这些链接在文字中显示

## 根本原因
- `server/tools/web.js` 第164行：虽然已有 `!isImageSearch` 条件阻止写入 search_result，但 LLM 可能在未传 `image_search=true` 的情况下调用 web_search
- `client/js/views/requirements/chat.js` 第515行：`renderSearchResultBubble` 函数直接渲染 `o.formatted`，其中包含 URL 行
- `client/js/core/markdown.js`：未移除 URL 文本

## 修复方案

### 1. 后端修复（server/tools/web.js）
```javascript
// v0.81: 同时检查 query 中是否包含图片关键词，防止 LLM 未传 image_search=true 时写入文字结果
const shouldShowTextResults = !isImageSearch;
if (ctx.reqId && !result.error && Array.isArray(result.results) && result.results.length > 0 && shouldShowTextResults) {
  writeChatEntryForTool(ctx.reqId, 'search_result', {...});
}
```

### 2. 前端修复（client/js/views/requirements/chat.js）
```javascript
function renderSearchResultBubble(text) {
  // v0.81: 图片搜索时不显示 search_result 文字气泡（图片已在动作卡片中展示）
  const isImageSearch = /图片|照片|写真|壁纸|头像|海报|截图|相片|图集|靓照|艺术照/.test(o.query);
  if (isImageSearch) return '';
  
  // v0.81: 过滤 formatted 中的 URL 行，只保留标题和摘要
  let formatted = (o.formatted || '');
  if (formatted) {
    formatted = formatted
      .replace(/^\s*https?:\/\/[^\s]+\s*$/gm, '')  // 移除纯 URL 行
      .replace(/\n\s*\n/g, '\n')  // 移除空行
      .trim();
  }
  // ...
}
```

### 3. Markdown 渲染修复（client/js/core/markdown.js）
```javascript
// v0.81: 移除 markdown 图片语法和 URL 链接，图片和链接已在动作卡片中展示
html = html.replace(/!\[([^\]]*)\]\([^)]+\)/g, '');
html = html.replace(/https?:\/\/[^\s<>"']+/g, '');  // 移除 URL
```

## 修改文件
- `server/tools/web.js` — 添加双重检查
- `client/js/views/requirements/chat.js` — 图片搜索时隐藏文字气泡，过滤 URL
- `client/js/core/markdown.js` — 移除 URL 文本

## 验证步骤
1. 测试图片搜索：`搜索莫文蔚图片` → 应该只显示图片网格，无文字气泡
2. 测试普通搜索：`搜索莫文蔚新闻` → 应该显示文字气泡，但 URL 已被移除
3. 验证无语法错误：所有修改文件已通过 node -c 检查

## 版本
- v0.81（index.html 已更新版本号）
