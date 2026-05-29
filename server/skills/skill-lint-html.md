---
skill_id: skill-lint-html
category: lint
created: 2026-05-29T16:52:32.366Z
updated: 2026-05-29T16:52:32.366Z
---

# HTML 结构检查

> 使用 HTMLHint 检查 HTML 标签规范、可访问性 (alt/text/label)、最佳实践

## 匹配规则

- 任务类型: review, coding
- 标签: lint, html, accessibility
- 所需技能: {}

## 执行步骤

1. 对 .html 文件运行 htmlhint --format json
2. 检查 img alt 缺失→warning, script 缺 defer→suggestion, form 缺 label→suggestion

## 交付物

- HTMLHint 报告 (JSON)

## 参考资料

- HTMLHint 规则

## 任务模板

- 标题: {module} HTML 检查
- 类型: review
- 预估工时: 0.2h
- 所需技能: {"lint":1}

---
*由 ACMS 自动生成 — 编辑此文件后下次同步将覆盖 JSON 存储*
