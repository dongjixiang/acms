---
skill_id: skill-lint-vue
category: lint
created: 2026-05-29T16:52:32.364Z
updated: 2026-05-29T16:52:32.364Z
---

# Vue 组件检查

> 使用 ESLint + eslint-plugin-vue 检查 Vue SFC 模板、脚本、样式的规范性

## 匹配规则

- 任务类型: review, coding
- 标签: lint, vue, sfc
- 所需技能: {}

## 执行步骤

1. 对 .vue 文件运行 eslint --format json (自动加载 eslint-plugin-vue)
2. 检查 template/script/style 三段
3. 解析 ESLint 输出分级

## 交付物

- Vue Lint 报告 (JSON)

## 参考资料

- eslint-plugin-vue 规则
- linter-service.js

## 任务模板

- 标题: {module} Vue 组件检查
- 类型: review
- 预估工时: 0.3h
- 所需技能: {"lint":1,"vue":1}

---
*由 ACMS 自动生成 — 编辑此文件后下次同步将覆盖 JSON 存储*
