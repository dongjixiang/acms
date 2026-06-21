# 2026-06-19 use_case 第二轮修复（3 按钮重复 + apply NOT_FOUND）

## 现象
第一轮 loading 修复后，多多反馈 2 个新 bug：
1. **3 按钮重复**：use_case 卡片底部 6 按钮（自带的 3 + chat 流 wrap 的 3）
2. **apply NOT_FOUND**：点"提交采纳"后 toast `整理失败: NOT_FOUND`

## BUG B：apply NOT_FOUND 真因

### 诊断链
1. 多多后端日志显示 `POST /assist/use_case/apply` 返回 `{"error":"NOT_FOUND"}` 状态 404
2. search_files 显示 `requirements.js:816` 有 `router.post('/:id/assist/use_case/apply', ...)` 定义
3. 但 `router.stack` 列表**没有这条路由**（grep stack.length === 48，但 apply 不在里面）
4. 顺藤摸瓜发现 `requirements.js:808-868` 结构损坏：

```js
// L808 use 端点开始
router.post('/:id/assist/:method/use', async (req, res, next) => {
  try {
    const { method } = req.params;
    const body = req.body || {};
    const reqRec = reqStore.getById(req.params.id);
    if (!reqRec) return res.status(404).json({ error: 'REQ_NOT_FOUND' });
// L814-815 注释
// L816 apply 端点开始 → 被错误嵌套进 use 端点 try 块!
router.post('/:id/assist/use_case/apply', async (req, res, next) => {
  try { ... } catch (e) { next(e); }
});
// L835-866 use 端点原本的 else 分支（service 调用）现在被甩到 router 顶层孤立
    const svc = assists.getAssist(method);
    ...
    res.json({ method, result });
// L867-868 use 端点原本的 try/catch 闭合
  } catch (e) { next(e); }
});
```

**最阴险的 bug class**：
- `node -c` 语法 OK（JS ASI 兜底 + 嵌套 router.post 调用是合法 JS）
- server 启动**不报错**
- 路由**没注册**到 stack（被吞进 use 端点 try 块里的 `router.post` 只是普通函数调用）
- 调用端点走 app.js:145 顶层 404 fallback → `{"error":"NOT_FOUND"}` 状态 404

### 修复
重写 L807-869 整段：
- use 端点补完整（req 检查 + else 分支 + res.json + catch + 闭合）
- apply 端点独立到 router 顶层

**附赠修复**：use 端点原本缺失的 else 分支（service 调用 + 各 method 的 markUsed/markPicked 等）现在也恢复了——之前 use 端点**永远只走 req-not-found 路径**，因为 try 块在 if-return 之后就到了块结束（被 apply 端点截断导致 else 代码被甩出去孤立）。

## BUG A：3 按钮重复

### 诊断
`renderAssistLayer` L3660 给**所有 method**都附加 chat-assist-actions 3 按钮（发送选择/换一批/跳过）：
```js
el.innerHTML = `${innerHtml}<div class="chat-assist-actions">...3 按钮...</div>`;
```

use_case 自带 3 按钮（提交采纳/重整/全部丢弃），这两个功能集不重叠：
- chat 流 3 按钮 = "勾选项发回对话流当补充"
- use_case 3 按钮 = "调 apply 端点改 description 持久化"

use_case 卡片**6 个按钮并存**（use_case 自己的 3 个 + chat 流 wrap 的 3 个），但 chat 流那 3 个对 use_case 无意义。

### 修复
renderAssistLayer 对 `method === 'use_case'` **不附加** chat-assist-actions：
```js
if (method !== 'use_case') {
  el.innerHTML = `${innerHtml}<div class="chat-assist-actions">...3 按钮...</div>`;
} else {
  el.innerHTML = innerHtml;  // 保留 use_case 自带 3 按钮
}
```

## 改动文件
```
server/routes/requirements.js  |  L807-869 重写: use 端点补完整 + apply 端点独立 (BUG B)
client/js/views/requirements.js |  L3657-3672 renderAssistLayer 对 use_case 不附加 chat-assist-actions (BUG A)
```

## 验证
1. ✅ `node -c` 2 文件语法 OK
2. ✅ `router.stack` 列表现含 `POST /:id/assist/use_case/apply`（之前缺）
3. ⏳ 多多本地**必须 Ctrl+C 重启 server** 让新 router 生效（router 是在 require 时被加载的缓存）
4. ⏳ 多多浏览器 Ctrl+Shift+R 硬刷
5. ⏳ 进任意 idea req → 点"✨ 整理" → 等生成完 → 看 use_case 卡片底部**只剩 3 按钮**（无重复）
6. ⏳ 勾选条目 → 点"✅ 提交采纳" → toast 应是 `✅ 已整理 · 采纳 N 条 · 丢弃 N 条`，description 已更新

## 主动指出的遗留风险
1. **多轮累积的 use_case 数据**：第一轮修的 `generated_at_round` 写入**对老 use_case 数据**不生效（apply 时 `structuredData` 含 round 字段，新生成的才有）— 老的用 `req.structured_requirements` 兜底，OK
2. **dispatcher.js 死代码**：`ACMSAssistDispatcher.loadAll/render` 0 调用方（之前已查过）— 不影响
3. **apply 端点的 `status: 'applied'`** 写回不带 round 字段（用 `...structuredData` 展开）— 但 status==='applied' 前端 continue 不渲染，defer
4. **6/16 SOP 类比**：本轮发现的"嵌套 router.post silent failure"是更广义的"代码块断链"问题，**多模态 bug 报告**（发现时往往是用户行为测试才暴露）。建议给 todo 加一条「新增端点后必须跑 unit test 验证 router.stack 注册」，但 defer 到后面
5. **fingerprint 17 字段硬编码**：defer（前轮已记）
6. **use-case.js:93 写死 `data.tool !== 'use_case'`**：defer（前轮已记）

## 数据流（修后）
```
[点击"提交采纳"] ucApply(reqId)
  ├─ POST /api/requirements/:id/assist/use_case/apply
  │     ↓ router.stack 现在含这条路由（之前缺！）
  │     ↓ reqStore.getById 找到 req
  │     ↓ useCaseSvc.applyUseCaseResult
  │     ↓ buildDescriptionFromAccepted → newDescription
  │     ↓ reqStore.update: description / structured_requirements(status:applied) / history
  └─ toast: "✅ 已整理 · 采纳 N 条 · 丢弃 N 条"

[use_case 卡片渲染] renderAssistLayer(method='use_case')
  ├─ use_case 自己的 3 按钮 (apply/regen/discard) 保留
  └─ chat-assist-actions 3 按钮 (发送选择/换一批/跳过) 不再附加
       → 卡片底部 6 按钮 → 3 按钮
```
