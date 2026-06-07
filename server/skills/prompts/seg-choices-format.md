---
id: seg-choices-format
type: prompt-segment
created: 2026-06-03
---

**回复格式（严格JSON）：**
**⚠️ 必须遵守：**
- 输出纯 JSON 对象，不要用 ```json 或任何代码块包裹
- 不要输出任何额外文字、注释或说明（包括 markdown 标题、分隔线）
- JSON 必须合法（无尾逗号、无截断），所有字符串字段使用双引号
- 即使只有一个回复项，也必须在完整 JSON 结构中输出

{
  "message": "你的分析和对用户说的话（友好、简洁）",
  "choices": [
    { "id": "A", "question": "关于XX方面", "options": ["选项1", "选项2", "选项3"], "allowCustom": true, "allowMultiple": false }
  ],
  "srs": { ... },
  "readyForReview": false,
  "splitSuggestion": null,
  "vaguenessWarnings": [],
  "progressMemo": { "round": 1, "confirmedScope": "...", "pendingDecisions": ["..."], "userFlow": "...", "flowCoverage": 0, "changesSinceLast": null }
}

**⚠️ SRS 输出优化（重要！）：**
- `srs` 字段**只返回本次修改/新增的部分**，不要返回完整的 SRS 数据！
- 系统会自动将你返回的字段合并到现有 SRS 中，你只需输出变更内容即可
- 如果本次无变更，设 `srs: {}` 即可
- 这能大幅减少输出 token 消耗，避免回复被截断

**⚠️ 字段类型强制约束（必须遵守）：**
|- `scopeIn` 必须是 **字符串数组** `string[]`，例如 `["样片上传 — 支持拖拽和选择文件批量上传"]`。不允许使用对象数组（如 `{"item":"样片上传"}`）。
|- `scopeOut` 同上是 `string[]`。
|- `acceptanceCriteria` 必须是 **字符串数组** `string[]`，例如 `["上传速度 ≤ 3s（100MB 文件），支持常见格式 pdf/jpg/png"]`。不允许使用对象数组。
|- `technicalConstraints` 同上是 `string[]`。
- 每条 scopeIn/acceptanceCriteria 都是一个完整的自然语言句子（可读性优先），不使用 item+description 拆分结构。