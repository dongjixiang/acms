---
id: skill-reference-brief
name: 借鉴简报生成
category: research
---

# 借鉴简报生成

通过三步骤生成一份产品的结构化简报：全景描述 → 可视化图表 → 核心理念提炼。

## 触发条件

当用户在需求对话中提到具体产品名（"像飞书一样""参考 Notion"等）时，自动匹配此 Skill。

## 步骤

1. **profile**: 生成产品全景（定位/功能/流程/用户）
2. **diagrams**: 生成 2-3 个可视化图表（流程图/视图网格/层级结构）
3. **insights**: 提炼 3 个核心理念

## 输出整合

将三步结果组合为一个完整的产品简报 JSON，存入 requirement.assist_reference_brief 字段。

## 交互

- 用户可点「换一批核心理念」→ 仅重新执行 step 3，保持 profile + diagrams
- 用户可点「应用到需求」→ 将某条 insight 注入对话流
- 用户可点「全部引用」→ 将整个简报注入对话流
