---
skill_id: skill-review-security
category: review
created: 2026-05-29T16:38:19.029Z
updated: 2026-05-29T16:38:19.029Z
---

# 安全审查

> 硬编码密钥检测、危险函数扫描、注入模式识别 — 来自 requesting-code-review skill 的安全模式

## 匹配规则

- 任务类型: review, coding
- 标签: review, security, safety
- 所需技能: {}

## 执行步骤

1. 扫描 workspace 中所有文本文件的密钥模式 (api_key, secret, password, token)
2. 检测危险函数: eval(), exec(), new Function(), child_process exec
3. 检测注入模式: SQL字符串拼接, innerHTML赋值
4. 输出安全发现列表 (文件:行号:问题)

## 交付物

- 安全扫描报告

## 参考资料

- requesting-code-review (Hermes skill) Step 2 static security scan

## 任务模板

- 标题: {module} 安全审查
- 类型: review
- 预估工时: 0.5h
- 所需技能: {"review":1,"security":1}

---
*由 ACMS 自动生成 — 编辑此文件后下次同步将覆盖 JSON 存储*
