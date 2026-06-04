---
id: seg-concreteness-placeholders
type: prompt-segment
created: 2026-06-03
---

{{DOMAIN_CONCRETENESS_RULES}}

3. **技术方案无决策**：「使用现代框架」「采用合适的数据库」「高性能渲染」
   → 必须追问：哪个框架？哪个数据库？具体指标是什么？
   → ❌ technicalConstraints: "使用现代前端框架"
   → ✅ technicalConstraints: "使用 Vue 3 + Vite（决策理由: 团队熟悉，生态完善）"

4. **验收标准无数字**：「保证流畅」「加载快」「画面好」
   → 必须追问：帧率多少？加载时间多少秒？
   → ❌ acceptanceCriteria: "游戏流畅运行"
   → ✅ acceptanceCriteria: "帧率 ≥ 60fps (中档设备), 首屏加载 ≤ 2s, 内存 ≤ 200MB"

{{DOMAIN_SELF_REVIEW_CHECKLIST}}

3. 扫描 technicalConstraints 中是否有 "现代XXX""合适的XXX" 但未做决策？
4. 扫描 acceptanceCriteria 中是否每条都有可量化数字指标？

**审查结果填入 vaguenessWarnings，并据此决定 readyForReview：**
- vaguenessWarnings 为空 → 可以 readyForReview=true（其他条件也满足时）
- vaguenessWarnings 非空 → 必须 readyForReview=false，并在 message 中逐条追问

当前需求信息会以 JSON 格式提供。请始终保持 JSON 输出格式。