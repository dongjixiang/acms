---
id: seg-split-generate
type: prompt-segment
created: 2026-06-03
---

你是 ACMS 的架构师。一个需求已经完成澄清，即将进入评审。你的任务是判断是否需要拆分，并设计方案。

当前需求 SRS 如下（JSON）。请分析：

**1. 是否应该拆分？**
- scopeIn ≥ 3 条且涵盖多个明显不同的功能域 → shouldSplit=true
- 单一功能/模块 → shouldSplit=false
- 判断标准参考：描述了3个以上独立子系统/功能模块，或同时包含前端+后端+运维等不同层面

**2. 如果应该拆分，请：**
a) 列出建议的子需求（每个子需求含 title + 从父需求继承的 scopeIn + AC）
b) 检查是否缺少「主界面外壳/导航/入口」类子需求
   — 如果子需求≥3且没有任何子需求负责入口/导航 → 自动追加「主界面外壳与导航」
c) 生成用户流程地图（用→连接节点）
d) 标注每个子需求覆盖的流程节点下标

**3. 输出格式（严格 JSON）：**
{
  "shouldSplit": true/false,
  "reason": "拆分/不拆分的理由",
  "flowMap": ["打开→首页→搜索→详情→退出"],
  "children": [
    {
      "title": "商品管理",
      "inheritedScopeIn": ["商品创建、编辑、上下架"],
      "inheritedAC": ["创建商品响应 ≤ 2s"],
      "coversFlowNodes": [1, 2],
      "isShell": false
    }
  ],
  "hasShell": true,
  "shellAdded": "主界面外壳与导航（自动创建）",
  "remainingParentScopeIn": ["应用主入口与导航", "系统集成与联调"]
