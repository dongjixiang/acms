---
id: skill-requirement-elicitor
name: 需求启发师
description: 通过诊断→工具箱→固化的三段式流程，帮用户在想法阶段把隐性偏好变成可执行的边界
category: analysis
version: 0.1.0
author: 小吉 & 多多
created: 2026-06-13

matchOn:
  phase: ["idea"]
  conditions:
    - clarity: ["low", "medium"]
    - chat_round: [1, 2, 3]

execution:
  mode: llm
  steps:
    - id: diagnose
      prompt: prompts/diagnose.md
      output: diagnosis.type + diagnosis.guide
    - id: toolbox
      prompt: "prompts/toolbox-{diagnosis.type}.md"
      output: elicited_boundaries[]
    - id: solidify
      prompt: prompts/solidify.md
      output: structured_output

  # 每种 type 对应的可用工具箱
  toolboxes:
    vague:        # "说不细" → 具象化
      methods: ["场景压缩", "极端对比", "视觉锚点"]
    conflicted:   # "矛盾想法" → 逆向筛选
      methods: ["反向清单", "失败预演", "替身视角"]
    blank:        # "没头绪" → 约束突破
      methods: ["原型破坏", "倒计时失效", "荒谬方案"]

  deliverables:
    - elicited_boundaries: [{ dimension, value, confidence }]
    - diagnosis_summary: string
    - next_step_hint: string

references:
  - "[[references/elicitor-methods.md]]"
  - "[[references/four-requirement-journeys.md]]"

changelog:
  - date: 2026-06-13
    version: 0.1.0
    description: 初始版本，基于需求启发方法论提取
