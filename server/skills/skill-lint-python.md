---
skill_id: skill-lint-python
category: lint
created: 2026-05-29T16:52:32.364Z
updated: 2026-05-29T16:52:32.364Z
---

# Python 代码检查

> 使用 pylint 检查 Python 代码语法、规范和复杂度；使用 bandit 扫描安全漏洞

## 匹配规则

- 任务类型: review, coding
- 标签: lint, python, py
- 所需技能: {}

## 执行步骤

1. 对 .py 文件运行 pylint --output-format=json
2. 对 .py 文件运行 bandit -f json
3. 解析 pylint 输出: E/F→critical, W→warnings, C/R→suggestions
4. 解析 bandit 输出: HIGH→critical, MEDIUM→warnings, LOW→suggestions

## 交付物

- pylint 报告
- bandit 安全报告

## 参考资料

- pylint 文档
- bandit 文档

## 任务模板

- 标题: {module} Python 代码检查
- 类型: review
- 预估工时: 0.3h
- 所需技能: {"lint":1,"python":1}

---
*由 ACMS 自动生成 — 编辑此文件后下次同步将覆盖 JSON 存储*
