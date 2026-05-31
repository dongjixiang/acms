# 契约匹配验证规则

当主需求的所有子需求准备提交审核（readyForReview）后，自动执行以下检查。验证结果决定全部子需求是否可以同时进入 review 状态。

## 检查规则

### 规则 1: consumes 必须匹配 provides（error，阻塞）
- 扫描所有子需求的 `interface_contracts`
- 每个 `direction: "consumes"` 的声明，必须在某个兄弟需求的 `provides` 中找到匹配
- 匹配策略：关键词包含匹配（consumes 的描述中的核心词出现在 provides 的描述中）
- 不通过后果：阻止所有子需求进入 review，列出不匹配项

### 规则 2: provides 无人消费（warning，不阻塞）
- 每个 `direction: "provides"` 的声明，如果没有被任何兄弟 `consumes`
- 可能过度设计，给出警告
- 不阻塞流程

### 规则 3: 子需求无交互声明（warning，不阻塞）
- 子需求既无 provides 也无 consumes
- 可能是独立模块不需要交互，也可能是遗漏了协作声明
- 需要用户确认

### 规则 4: 跨子需求术语引用一致性（info）
- 检查不同子需求的 contracts 描述中是否使用了架构宪法定义的术语
- 如果使用了未在 glossary 中定义的术语，给出提示

## 输出格式

```json
{
  "passed": false,
  "checks": [
    {"rule": "规则1: consumes匹配provides", "severity": "error", "items": [{"child": "子B", "consumes": "Product API", "status": "unmatched"}]},
    {"rule": "规则2: provides无人消费", "severity": "warning", "items": [{"child": "子A", "provides": "Product导出", "status": "unconsumed"}]},
    {"rule": "规则3: 无交互声明", "severity": "warning", "items": [{"child": "子C", "status": "isolated"}]}
  ],
  "summary": "1 error, 2 warnings — 子B的 Product API 消耗缺失对端提供"
}
```

## 匹配策略说明

关键词提取：从 consumes/provides 的 `description` 或 `commitment` 字段中提取核心名词和动词。

匹配算法：
```
consumes: "需要商品查询API"
provides: "提供商品CRUD API（含查询、创建、更新、删除）"
→ 核心词: ["商品", "查询", "API"] vs ["商品", "CRUD", "API", "查询"]
→ 匹配度: 60% (3/5) → 超过阈值 50% → 匹配成功
```
