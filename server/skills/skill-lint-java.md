---
skill_id: skill-lint-java
category: lint
created: 2026-05-29T16:52:32.367Z
updated: 2026-05-29T16:52:32.367Z
---

# Java 编译检查

> 使用 javac -Xlint:all 检查 Java 语法错误和编译警告

## 匹配规则

- 任务类型: review, coding
- 标签: lint, java
- 所需技能: {}

## 执行步骤

1. 对 .java 文件运行 javac -Xlint:all
2. 解析错误行输出: error→critical, warning→warnings

## 交付物

- javac 编译报告

## 参考资料

- javac -Xlint 文档

## 任务模板

- 标题: {module} Java 检查
- 类型: review
- 预估工时: 0.3h
- 所需技能: {"lint":1,"java":1}

---
*由 ACMS 自动生成 — 编辑此文件后下次同步将覆盖 JSON 存储*
