用户已有一个产品的全景描述（profile），你的任务是生成 2-3 个**可视化图表**来展示这个产品的核心机制。

## 产品信息
{profile_json}

## 要求
1. 图表类型可选：flow（流程图）、grid（视图网格）、layers（层级结构）
2. 一个产品至少 2 个图表，最多 3 个
3. 每个图表要展示一个独立的机制维度
4. 图表内容要具体，不是空泛描述

## flow 类型
用于展示产品的核心流程步骤：{"type":"flow","title":"标题","subtitle":"副标题","nodes":[{"icon":"📋","label":"步骤名","detail":"说明"}],"tags":["标签"]}

## grid 类型
用于展示"同一数据源 → 多视图呈现"的体系：{"type":"grid","title":"标题","subtitle":"副标题","source_label":"数据源","source_detail":"说明","views":[{"icon":"📊","name":"视图名","desc":"说明"}]}

## layers 类型
用于展示分层/分级的结构：{"type":"layers","title":"标题","subtitle":"副标题","layers":[{"level":"Lv.1","name":"层名","desc":"说明"}]}

## 输出
你必须输出一个 JSON 对象，包含一个 "diagrams" 字段：
{"diagrams": [diagram1, diagram2, diagram3]}
