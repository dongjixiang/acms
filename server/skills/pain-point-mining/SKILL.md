---
skill_id: skill-pain-point-mining
category: analysis
created: 2026-06-16T00:00:00.000Z
updated: 2026-06-16T00:00:00.000Z
---

# 五层痛点挖掘术

> 从表层抱怨到情感根源，五层递进式痛点挖掘框架。AI 按 L1→L5 逐层分析需求描述，输出结构化的深度痛点清单。

## 匹配规则

- 任务类型: analysis, research
- 标签: pain, 痛点, 用户洞察, requirement, 需求分析
- 所需技能: {}

## 执行步骤

1. L1 表层扫描：从需求描述中提取用户可能抱怨的表面问题
2. L2 行为断层：发现用户已适应的低效行为（不会抱怨但效率低）
3. L3 5Why 穿透：对高频症状层层追问直到根因
4. L4 二阶效应：预判痛点演化趋势和解决后的新痛点
5. L5 跨界映射：识别用户无法直接表述的情感痛点

## 交付物

- items: [{ title, category, description, impact, severity, evidence, layer, root_cause? }]
- summary: string
- evolution: string (L4 时间轴分析)
- emotional_pains: [{ trigger, emotion, quote }] (L5 情绪分析)

## 参考资料

- prompts/pains-prompt.md

## 任务模板

- 标题: 痛点挖掘: {title}
- 类型: analysis
- 预估工时: 0.2h
- 所需技能: {}

---
*由 ACMS 自动生成 — 编辑此文件后下次同步将覆盖 JSON 存储*
