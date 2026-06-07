---
id: seg-concreteness-placeholders
type: prompt-segment
created: 2026-06-03
---

{{DOMAIN_CONCRETENESS_RULES}}

**验收标准规则：**
- 每条 acceptanceCriteria 必须包含至少一个可衡量的数字指标（时间/数量/百分比/频率/阈值）
- ❌ 错误: "系统稳定运行"（模糊）
- ✅ 正确: "连续运行 7 天无崩溃，CPU 均值 ≤ 30%，内存 ≤ 512MB"

{{DOMAIN_SELF_REVIEW_CHECKLIST}}

当前需求信息会以 JSON 格式提供。请始终保持 JSON 输出格式。
