# v0.13 B7 续：视觉辅助跨项目图片 URL 404 修复

## 背景

多多 6/20 反馈：视觉辅助工具展示不出图片。

## 真因

`client/js/views/assists/visual.js:39` 构造图片 URL：

```js
src="/api/generate/assets/${App.currentProjectId}/${v.asset_path}"
```

**`App.currentProjectId` 是「当前激活项目」**（用户在 header 里点进去的项目），但 `asset_path` 是按「req 所属项目」存的。

### 数据库验证

| req | project_id | slug | assets/2026-06-XX 目录 | 图片文件 |
|---|---|---|---|---|
| 83 | proj_duogame | duogame | `workspaces/duogame/assets/2026-06-10/` | **空**（老数据丢失） |
| 100016 | proj_sanguo | sanguo | `workspaces/sanguo/assets/2026-06-17/` | **3 个 jpg 各 ~360KB** ✓ |
| 82 | proj_duogame | duogame | — | DALL-E key 缺失（status=failed）|

### HTTP 验证

```
GET /api/generate/assets/proj_duogame/assets/2026-06-17/...jpg
  → 404 (27B error)  ← App.currentProjectId 错的时候

GET /api/generate/assets/proj_sanguo/assets/2026-06-17/...jpg
  → 200 (460584B image)  ← 正确 projectId
```

### 触发场景

- 用户在 duogame 项目 → 打开 req 100016（实际属于 sanguo）
- 前端 img src = `/api/generate/assets/proj_duogame/assets/2026-06-17/...jpg`
- 服务端解析 `req.params.projectId = proj_duogame` → 查 projectStore → slug=duogame
- 文件实际路径：`workspaces/sanguo/assets/2026-06-17/...`
- 服务端查 `workspaces/duogame/assets/2026-06-17/...` → 不存在 → 404

**req 83 还叠加另一个问题**：图片文件本身在磁盘上已经被清理（duogame/assets/2026-06-10/ 是空目录），那是 DALL-E 老生成任务留下的空记录，不是当前 bug 范围。

**req 82 是配置问题**（DALL-E key 没配）：不在本次修复范围，admin 加 minimax-image provider 或 DALL-E key 即可。

## 修法

### Patch 1：server getAssist 返回 project_id

`server/services/assists/visual.js` `getAssist(reqId)` 返回 data 加上 `project_id`：

```js
return {
  status: previews.status,
  variants: previews.variants || [],
  // ... 现有字段 ...
  project_id: req.project_id,  // ← 新增（前端需要知道 req 属于哪个项目）
};
```

### Patch 2：client render 用 data.project_id

`client/js/views/assists/visual.js` L39：

```js
// 旧：src="/api/generate/assets/${App.currentProjectId}/${v.asset_path}"
// 新：用 data.project_id（req 所属项目），保证跨项目查看时也能拿到
src="/api/generate/assets/${data.project_id || App.currentProjectId}/${v.asset_path}"
```

`data.project_id` 缺失时 fallback 到 `App.currentProjectId`（向后兼容老格式 data）。

## 改的文件

- `server/services/assists/visual.js`（+1 行）
- `client/js/views/assists/visual.js`（1 行修改）

## 验证

1. `node -c` 语法检查两个文件
2. 重启 server（多多手动）
3. 浏览器硬刷
4. 跨项目复测：
   - 在 duogame 项目下打开 req 100016 → 视觉辅助图应该正常显示
   - DevTools Network tab 看 img 请求 URL，应该带 `proj_sanguo` 而不是 `proj_duogame`

## 不在本 plan 范围

- req 83 图片文件丢失（workspaces/duogame/assets/2026-06-10/ 空目录）→ 历史数据问题，需要让用户重新生成 visual 才能补回
- req 82 DALL-E key 配置 → admin 任务
- 其他 assist 是否也有跨项目问题 → 单独排查

## 风险

- 极低：纯 URL 字符串替换 + 后端多返一个字段
- 老 client（缓存）请求时不会带 `data.project_id` → fallback 到 `App.currentProjectId`，行为不变