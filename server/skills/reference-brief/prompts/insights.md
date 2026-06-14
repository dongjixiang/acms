用户已有产品的全景描述（profile）和可视化图表（diagrams），你的任务是提炼 **3 个核心理念**——这个产品最值得借鉴的设计智慧。

## 产品信息
Profile: {profile_json}
Diagrams: {diagrams_json}

## 要求
1. 每个理念不是描述"它做了什么"，而是分析"这个设计好在哪里"
2. 每个 80-150 字，有具体场景感
3. 覆盖不同的维度（不要三个都讲 UI，要分散在数据/交互/协作等维度）
4. 与 diagrams 呼应但不重复

## 输出
你必须输出一个 JSON 对象，包含一个 "insights" 字段：
{"insights": [
  {"number":1,"title":"核心理念标题（≤20字）","desc":"具体说明好在哪里（80-150字）"},
  {"number":2,"title":"...","desc":"..."},
  {"number":3,"title":"...","desc":"..."}
]}
