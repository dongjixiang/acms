---
skill_id: skill-requirement-clarify
category: analysis
created: 2026-05-23T02:06:57.691Z
updated: 2026-05-23T02:06:57.691Z
---

# 需求澄清

> 通过 AI 多轮对话，将模糊需求澄清为结构化 SRS

## 匹配规则

- 任务类型: analysis
- 标签: clarify, requirement
- 所需技能: {}

## 执行步骤

1. 读取需求上下文
2. 加载 CLARIFY_SYSTEM_PROMPT
3. 构建 messages + 对话历史
4. 调用 LLM 解析 JSON
5. 更新 SRS → 判断 readyForReview
6. 如果 ready: 触发文档生成

## 交付物

- SRS
- 澄清记录

## 参考资料

- [[ACMS/需求澄清流程]]

## 任务模板

- 标题: 澄清需求: {title}
- 类型: analysis
- 预估工时: 0.5h
- 所需技能: {}

---
*由 ACMS 自动生成 — 编辑此文件后下次同步将覆盖 JSON 存储*
