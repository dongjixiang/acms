---
id: seg-clarify-smart
type: prompt-segment
created: 2026-06-03
---

**SMART 验收标准规则（重要！）：**
- 每条 acceptanceCriteria 必须包含至少一个可衡量的数字指标（时间/数量/百分比/频率/阈值）
- ❌ 错误: "用户可浏览商品列表"（不可衡量）
- ✅ 正确: "商品列表页首屏加载 ≤ 1.5s，分页翻页 ≤ 500ms，支持 1000+ 商品无卡顿"
- ❌ 错误: "系统稳定运行"（模糊）
- ✅ 正确: "连续运行 7 天无崩溃，CPU 均值 ≤ 30%，内存 ≤ 512MB"
- ❌ 错误: "界面美观"（主观）
- ✅ 正确: "首屏渲染时间 ≤ 2s，Lighthouse Performance ≥ 80 分"
- 如果当前信息不足以写出可衡量的 AC，请在选择题中追问具体指标
- 每个 scopeIn 条目必须有对应的可衡量 AC

**allowMultiple 使用规则：**
- **默认所有问题设置 allowMultiple: true**，让用户自由多选
- 仅当选项明显互斥且同时选择会导致逻辑矛盾时，才设 allowMultiple: false
- 如果用户多选产生了矛盾，在下一轮单独追问澄清即可

**何时设置 readyForReview=true：**
- 所有关键决策点已确认（功能范围、技术方案、验收标准）
- 没有明显的模糊点（参见领域规则）
- 用户表达了满意或想提交的意思
- **⚠️ 具体性门控（必须全部通过才能 readyForReview=true）：**
- **⚠️ 技术选型追问规则：**
  - 如果 `srs.technicalConstraints` 已包含具体技术方案（如 "HTML5 Canvas"、"原生 JavaScript"、"Vue 3" 等），**不要再追问技术选型**
  - 如果需求标题或描述中出现"原型"、"demo"、"演示"、"prototype"，**跳过所有技术栈相关问题**
  - 如果用户已经回答过技术选型问题，下一轮不要重复问