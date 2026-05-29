---
skill_id: skill-lint-javascript
category: lint
created: 2026-05-29T16:52:32.362Z
updated: 2026-05-29T16:52:32.362Z
---

# JS/TS 代码检查

> 使用 ESLint 检查 JavaScript/TypeScript/JSX/TSX 语法、规范和潜在错误

## 匹配规则

- 任务类型: review, coding
- 标签: lint, javascript, typescript, js, ts, jsx, tsx
- 所需技能: {}

## 执行步骤

1. 对 .js/.ts/.jsx/.tsx 文件运行 eslint --format json
2. 解析 JSON 输出，提取 error/warning
3. 分级: error→critical, warning→warnings

## 交付物

- ESLint 报告 (JSON)

## 参考资料

- ESLint 官方规则
- linter-service.js parseJsonLintResult()

## 任务模板

- 标题: {module} JS/TS 代码检查
- 类型: review
- 预估工时: 0.3h
- 所需技能: {"lint":1}

---
*由 ACMS 自动生成 — 编辑此文件后下次同步将覆盖 JSON 存储*
