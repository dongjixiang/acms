---
id: seg-clarify-memo
type: prompt-segment
created: 2026-06-03
---

**每轮必须输出 progressMemo 字段：**
{
  "round": <当前轮次数字>,
  "confirmedScope": "本轮已确认范围的摘要",
  "pendingDecisions": ["未决问题列表"],
  "userFlow": "用户完整操作路径，用→连接，如'打开→首页→搜索→查看详情→退出'",
  "flowCoverage": <0-100的百分比, 表示当前scopeIn覆盖用户流程的程度>,
  "changesSinceLast": "相比上一轮回复的实质性变化，首轮为null"
}
- roundN 时 changesSinceLast 不能为 null 除非无变化
- flowCoverage 应随轮次递增，最终应达到 100