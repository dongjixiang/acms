# 决策树 examples 字段拆分正则不识别中文顿号（`、`）

## 背景

用户在 2026-06-17 反馈：「决策卡片上有时候会展示 2 个产品，但生成的链接却只会生成 1 个链接」。

实测 8 条最近的需求：7/8 条的 decision tree `examples` 字段用的是 **`、`（中文顿号 U+3001）** 分隔产品名，但 `client/js/views/assists/decision-tree.js:23` 的 split 正则是 `/[,，]/`，**不含 `、`**。结果 7 条都被当成 1 个长产品名，只生成 1 个 `<a>` 链接。

prompt（`server/services/assists/decision-tree.js:30`）写的是 `examples (≤30 字): 1-2 个真实产品名`，LLM 输出 1-2 个产品是设计意图。

用户拍板走 A 方案：**只修 split bug**（最小改动，1 行 JS）。

## 根因（数据流）

LLM 输出 examples
   ↓
DB 存 `examples: "Attio、Notion AI（混合助理雏形）"`
   ↓
前端 `decision-tree.js:23`:
   ↓
`(t.examples || '').split(/[,，]/)`  ← 不匹配 `、`
   ↓
得到 1 个长串 `["Attio、Notion AI（混合助理雏形）"]`
   ↓
渲染 1 个 `<a class="dt-analogy-link">` 链接
   ↓
点击 → `dtOpenReference(reqId, "Attio、Notion AI（混合助理雏形）", linkEl)`
   ↓
后端 reference.js 把整个串当 productName
   ↓
LLM 看到这种"产品名"会困惑，生成的借鉴卡片质量不可控

## 改动范围（极小，1 个文件 1 行）

唯一文件：`client/js/views/assists/decision-tree.js`

### 第 23 行

**当前**：
```js
// 拆产品名 (按 , 分，trim) — 每个变链接，点开走 loading 卡片模式
const products = (t.examples || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
```

**改为**：
```js
// 拆产品名 (按 ,，、 分，trim) — 每个变链接，点开走 loading 卡片模式
const products = (t.examples || '').split(/[,，、]/).map(s => s.trim()).filter(Boolean);
```

**正则增量**：仅在字符类末尾加 `、`（中文顿号 U+3001）。
**注释同步更新**：把 `, 分` 改成 `,，、 分`。

## 不做的事（明确划线）

- ❌ 不改 prompt（不让 LLM 限制举 1 个产品）—— 用户明确说"想分别看"
- ❌ 不改 server 端任何代码（reference.js 已能处理任意 productName）
- ❌ 不改 CSS
- ❌ 不重启服务
- ❌ 不 git 操作
- ❌ 不动其他同类 pattern（已 grep 确认没有）

## 同类 pattern 排查（系统 SOP）

`split(/[,，]/)` 在整个项目只出现 1 次：`decision-tree.js:23`。
无同类 bug，scope 干净。

## 文件改动清单

| 文件 | 改动类型 | 改动量 |
|------|---------|--------|
| `client/js/views/assists/decision-tree.js` | 1 行正则 + 1 行注释 | 1 处改动 |

## 验证步骤

1. **代码自检**：`node -c client/js/views/assists/decision-tree.js` 确认无语法错
2. **diff 报告**：把 1 行改动贴出来给用户扫
3. **不重启服务、不 git**

## 用户重启后的验证

1. 打开任一需求详情页（包含决策树）
2. Ctrl+Shift+R 硬刷（注意：按 acms-competitive-assist skill，移动端 chrome 缓存更顽固，可能需要 DevTools → Network → Disable cache）
3. 找到 examples 字段含 `、` 的分支（如 #100017 「生成式 CRM」分支 [2] "Attio、Notion AI（混合助理雏形）"）
4. 预期：原本 1 个长串链接 → 现在变成 **2 个独立链接**「Attio」和「Notion AI（混合助理雏形）」
5. 点「Attio」 → loading 卡片出现 → 借鉴卡片生成（只看 Attio，不污染 Notion）
6. 点「Notion AI（混合助理雏形）」 → loading 卡片出现 → 借鉴卡片生成（只看 Notion）
7. **回归**：examples 含 `,` 或 `，` 的分支仍能正常拆分（regex 兼容老分隔符）

## 风险与回退

- **风险**：极低。纯正则字符类加一个字符，行为兼容所有旧输入。
- **回退**：把正则改回 `/[,，]/` 即可恢复。

## JS 版本号同步（按 acms-competitive-assist skill 强约束）

`client/index.html` 加载 `decision-tree.js` 用 `<script src="...">` **没有**版本号 query string。
改 JS 后**必须**手动 bump `?v=X.X.X`，否则 mobile chrome 可能命中磁盘缓存。

具体改动：找到 `<script src="/client/js/views/assists/decision-tree.js">` 这一行，加 `?v=0.X.X`。