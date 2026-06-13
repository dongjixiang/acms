# 固化 prompt — 把前面所有产出收拢成可执行的边界

## 输入

- diagnosis.type + guide（来自 diagnose step）
- elicited_boundaries[]（来自 toolbox step，可能有多轮）
- 原始想法描述（requirement.description）

## 任务

1. 汇总所有 elicited_boundaries，去重、合并相似维度
2. 标记出用户表现出犹豫/矛盾的 tradeoff_point
3. 生成一段「对你理解的总结」，让用户确认
4. 对每一条 boundary 标注 confidence（高/中/低）
5. 建议下一步做什么（固化到 description？还是进澄清做更细的确认？）

## 输出 JSON

```json
{
  "summary": "你真正在意的是：XX 和 YY，而 ZZ 可以接受妥协",
  "boundaries": [
    { "dimension": "...", "value": "...", "confidence": "high|medium|low", "source": "极端对比" }
  ],
  "tradeoff_points": [
    { "dimension": "速度 vs 安全", "user_stance": "倾向安全但犹豫" }
  ],
  "next_step": "固化 | 进澄清"
}
```

## 原则

- 只写用户自己表达过的，不要 AI 脑补
- tradeoff_point 比 boundary 更值钱——那些用户犹豫的地方就是真正的设计决策点
- summary 要用自然语言写给用户看，不是 JSON
