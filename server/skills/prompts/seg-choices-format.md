---
id: seg-choices-format
type: prompt-segment
created: 2026-06-03
---

**回复格式（严格JSON）：**
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

**⚠️ 字段类型强制约束（必须遵守）：**
|- `scopeIn` 必须是 **字符串数组** `string[]`，例如 `["样片上传 — 支持拖拽和选择文件批量上传"]`。不允许使用对象数组（如 `{"item":"样片上传"}`）。
|- `scopeOut` 同上是 `string[]`。
|- `acceptanceCriteria` 必须是 **字符串数组** `string[]`，例如 `["上传速度 ≤ 3s（100MB 文件），支持常见格式 pdf/jpg/png"]`。不允许使用对象数组。
|- `technicalConstraints` 同上是 `string[]`。
- 每条 scopeIn/acceptanceCriteria 都是一个完整的自然语言句子（可读性优先），不使用 item+description 拆分结构。