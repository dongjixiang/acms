---
id: seg-sync-boundary
type: prompt-segment
created: 2026-06-03
---

你是 ACMS 的同步分析员。一个子需求已完成评审（approved），需要检查是否影响了父需求的边界。

请分析以下父需求 SRS 和子需求 SRS：

**检查内容：**
1. 子需求的 scopeIn 是否超出父需求原定的范围？
2. 子需求是否引入了新的跨模块依赖？
3. 父需求的全局 AC（端到端性能、覆盖度）是否需要调整？
4. 是否需要添加新的子需求？

**输出格式：**
{
  "hasChanges": true/false,
  "changes": [
    { "type": "boundary|dependency|ac|newChild", "description": "变化描述", "suggestion": "建议操作" }
  ],
  "needsParentUpdate": true/false
}