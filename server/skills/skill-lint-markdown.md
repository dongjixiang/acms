---
skill_id: skill-lint-markdown
category: lint
created: 2026-05-29T16:52:32.366Z
updated: 2026-05-29T16:52:32.366Z
---

# Markdown 文档检查

> 使用 markdownlint 检查文档格式、断链、标题层级、代码块规范

## 匹配规则

- 任务类型: review, documentation
- 标签: lint, markdown, md, docs
- 所需技能: {}

## 执行步骤

1. 对 .md 文件运行 markdownlint --json
2. 检查: 断链→critical, 标题跳跃→warning, 代码块无语言→suggestion

## 交付物

- markdownlint 报告 (JSON)

## 参考资料

- markdownlint 规则

## 任务模板

- 标题: {module} 文档检查
- 类型: review
- 预估工时: 0.2h
- 所需技能: {"lint":1}

---
*由 ACMS 自动生成 — 编辑此文件后下次同步将覆盖 JSON 存储*
