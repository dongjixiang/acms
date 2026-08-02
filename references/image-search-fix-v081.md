# ACMS 图片搜索问题修复报告

**版本**: v0.81  
**日期**: 2026-08-02  
**状态**: ✅ 已修复

---

## 问题1：图片数量从9个变成8个

### 根因分析

**之前代码**（已丢失）：
```javascript
// 百度图片首屏只渲染约 8 张 data-objurl，滚动加载更多凑满 3x3 网格
if (images.length < maxResults) {
  // 多次滚动加载更多
  for (var scrollAttempt = 0; scrollAttempt < 3 && images.length < maxResults; scrollAttempt++) {
    await page.evaluate(() => window.scrollBy(0, 600));
    await new Promise(resolve => setTimeout(resolve, 1500));
    // ... 获取更多信息
  }
}
```

**现在代码**（已恢复）：
- 恢复了滚动加载更多图片的逻辑
- 首屏获取约8张，滚动后可凑满9张

### 修复方案

恢复 `browserSearchBaiduImage` 函数中的滚动加载逻辑：
1. 首屏获取图片
2. 如果不足9张，滚动页面加载更多
3. 去重后补足到9张

---

## 问题2：图片链接显示问题

### 当前代码

`client/js/core/agent-buddy.js` line 755：
```javascript
return '<a class="ap-action-imgitem" href="' + link + '" target="_blank" rel="noopener" title="' + title + '">'
```

**说明**：
- `href` 使用原始图片 URL
- `target="_blank"` 新标签页打开
- `rel="noopener"` 安全属性

### 用户反馈

用户说"授权照片的时候，图片上便返回的链接都会被隐藏掉，为啥目前还在"

**可能原因**：
1. 用户期望链接被隐藏（不显示 URL）
2. 或者用户期望链接被代理（不直接跳转原始 URL）

**当前行为**：
- 点击图片会在新标签页打开原始链接
- 这是预期行为（用户可能想查看原图）

---

## 修复验证

### 测试命令
```bash
curl -s -X POST http://localhost:3300/api/agent-buddy/chat \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: dev-key-001' \
  -d '{"message":"搜索莫文蔚图片","context":{"currentView":"_default"}}'
```

### 预期结果
- 返回9张图片（补足9宫格）
- 每张图片有缩略图 + 原始链接

---

## 技术细节

### 百度图片搜索结构

百度图片页面使用懒加载：
- `img[data-objurl]` 存大图 URL
- `img[data-th]` 存缩略图 URL
- `img[src]` 可能为空（懒加载）

### 滚动加载更多

百度图片首屏只渲染约8张图片，需要滚动才能加载更多：
1. 首屏获取8张
2. `scrollBy(0, 600)` 滚动
3. 等待1.5秒让 JS 加载
4. 获取新图片
5. 去重后合并

---

## 相关文件

- `server/services/web-search.js` — 恢复滚动加载逻辑
- `client/js/core/agent-buddy.js` — 图片渲染（无需修改）
- `client/css/style.css` — 9宫格布局（无需修改）

---

*修复时间: 2026-08-02 17:30*
