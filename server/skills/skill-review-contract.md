---
skill_id: skill-review-contract
category: review
created: 2026-05-29T16:38:19.030Z
updated: 2026-05-29T16:38:19.030Z
---

# 契约核查

> 比对 depends_contract 与实际代码产出：检查导出函数/类/字段是否兑现了承诺的接口契约

## 匹配规则

- 任务类型: review, coding
- 标签: review, contract, interface
- 所需技能: {}

## 执行步骤

1. 读取任务 depends_contract 字段获取承诺的接口清单
2. 从 workspace 读取实际产出文件
3. 比对: 承诺的导出函数/类名 vs 实际代码中的 export/module.exports
4. 标记: 文件缺失 | 导出缺失 | 契约兑现
5. 输出契约核查结果

## 交付物

- 契约核查报告

## 参考资料

- ACMS depends_contract 字段设计
- review-service.js verifyContracts()

## 任务模板

- 标题: {module} 契约核查
- 类型: review
- 预估工时: 0.5h
- 所需技能: {"review":1,"contract":1}

---
*由 ACMS 自动生成 — 编辑此文件后下次同步将覆盖 JSON 存储*
