---
skill_id: skill-requirement-doc
category: documentation
created: 2026-05-23T02:06:57.695Z
updated: 2026-05-23T02:06:57.695Z
---

# 需求文档生成

> 根据 SRS 生成结构化 Markdown 需求文档

## 匹配规则

- 任务类型: documentation
- 标签: doc, requirement
- 所需技能: {}

## 执行步骤

1. 读取 SRS + 澄清历史
2. 加载 DOC_SYSTEM_PROMPT
3. 构建 messages
4. 调用 LLM 生成 MD
5. 保存到 structured_description + workspace

## 交付物

- MD 需求文档

## 参考资料

- [[ACMS/需求文档模板]]

## 任务模板

- 标题: 生成需求文档: {title}
- 类型: documentation
- 预估工时: 0.5h
- 所需技能: {}

---
*由 ACMS 自动生成 — 编辑此文件后下次同步将覆盖 JSON 存储*
