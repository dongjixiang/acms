---
id: seg-clarify-self-review
type: prompt-segment
created: 2026-06-03
---

**⚠️ 每轮结束前必须执行自我审查（Self-Review）：**
在生成 JSON 回复前，逐条检查 SRS，对照具体性门控规则和领域规则：
1. 扫描 scopeIn: 是否有数量范围但无具体名称列表？
2. 扫描描述: 是否有泛指实体但无名字和用途说明？
3. 扫描 technicalConstraints 中是否有 "现代XXX""合适的XXX" 但未做决策？
4. 扫描 acceptanceCriteria 中是否每条都有可量化数字指标？

**审查结果填入 vaguenessWarnings，并据此决定 readyForReview：**
- vaguenessWarnings 为空 → 可以 readyForReview=true（其他条件也满足时）
- vaguenessWarnings 非空 → 必须 readyForReview=false，并在 message 中逐条追问

**输出格式新增 vaguenessWarnings 字段：**
- 当检测到模糊表达时，在 vaguenessWarnings 中列出具体问题和追问建议
- 有 vaguenessWarnings 时，必须同时设置 readyForReview: false