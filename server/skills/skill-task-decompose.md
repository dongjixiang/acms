---
skill_id: skill-task-decompose
category: planning
created: 2026-05-23T02:06:57.699Z
updated: 2026-05-23T02:06:57.699Z
---

# 任务分解

> 将已确认的需求分解为可执行的任务列表

## 匹配规则

- 任务类型: planning
- 标签: decompose, task
- 所需技能: {}

## 执行步骤

1. 读取 SRS
2. 加载 Skill 列表 + DECOMPOSE_SYSTEM_PROMPT
3. 调用 LLM 生成任务
4. 5 层容错解析 JSON
5. 批量创建 tasks
6. 依赖映射（标题→ID）
7. 需求 → in_execution

## 交付物

- 任务列表

## 参考资料

- [[ACMS/任务分解规范]]

## 任务模板

- 标题: 分解需求: {title}
- 类型: planning
- 预估工时: 0.5h
- 所需技能: {}

---
*由 ACMS 自动生成 — 编辑此文件后下次同步将覆盖 JSON 存储*
