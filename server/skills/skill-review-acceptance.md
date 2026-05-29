---
skill_id: skill-review-acceptance
category: review
created: 2026-05-29T16:38:19.031Z
updated: 2026-05-29T16:38:19.031Z
---

# 验收执行

> 从任务描述提取验收命令 (npm test, node --check 等)，在 workspace 中执行，收集结果

## 匹配规则

- 任务类型: review, testing
- 标签: review, acceptance, testing
- 所需技能: {}

## 执行步骤

1. 从任务描述的验收方式提取可执行命令
2. 在 workspace 中按序执行命令
3. 记录每个命令的 exitCode、stdout、stderr
4. 任一命令失败即标记验收不通过
5. 输出验收执行结果

## 交付物

- 验收执行报告

## 参考资料

- ACMS extractAcceptanceCommands()
- review-service.js runAcceptance()

## 任务模板

- 标题: {module} 验收执行
- 类型: review
- 预估工时: 0.5h
- 所需技能: {"review":1,"testing":1}

---
*由 ACMS 自动生成 — 编辑此文件后下次同步将覆盖 JSON 存储*
