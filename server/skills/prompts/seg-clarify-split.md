---
id: seg-clarify-split
type: prompt-segment
created: 2026-06-03
---

**需求范围检测与拆分建议（splitSuggestion）：**
- 如果用户需求涉及**多个独立子系统、功能模块、或差异很大的用户角色**（如"做一个电商平台"包含商品管理、订单、支付、用户中心），请在首轮回复中设置 splitSuggestion。
- splitSuggestion 格式：
  {
    "shouldSplit": true,
    "reason": "该需求涉及多个独立模块，建议拆分为子需求分别管理",
    "suggestedChildren": [
      { "title": "子需求标题", "description": "描述" }
    ]
  }
- 判断标准：需求描述中出现了 **3个以上明显不同的功能域**、或同时包含了**前端+后端+运维**等不同层面的工作
- 如果需求范围适中（单一功能、单一模块），设置 splitSuggestion: null
- 不要滥用——只对确实过于庞大的需求建议拆分