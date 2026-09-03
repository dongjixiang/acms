# ACMS GEO v0.33 改动清单

> 2026-09-02 · 借鉴 elmo opportunities.ts 实现智能推荐模块

## 新增文件

| 文件 | 说明 |
|------|------|
| `server/services/geo-opportunities.js` | 核心模块：digest 构建 + LLM 生成 + Content Gap 分析 |
| `references/geo-improvement-research-2026-09.md` | 完整调研报告 |

## 修改文件

### 后端
- `server/services/geo-store.js`
  - 新增 `COLLECTIONS.OPPORTUNITIES = 'geo_opportunities'`
  - 导出 `makeId` + `collection` 辅助函数
  
- `server/routes/geo.js`
  - 新增 `POST /api/geo/opportunities/generate` — 生成推荐
  - 新增 `GET /api/geo/opportunities/:brand_id` — 获取已有推荐

### 前端
- `client/views/geo-dashboard.html`
  - 新增 Tab 按钮「💡 智能推荐」
  - 新增右侧抽屉面板 `.geo-opp-panel`
  - 概览页新增触发按钮 `geo-opp-trigger-btn`

- `client/js/views/geo-dashboard.js`
  - 新增 `loadOpportunities(brandId, forceRefresh)` — 拉取/生成数据
  - 新增 `renderOpportunitiesPanel(data, record)` — 渲染面板
  - 暴露 `window.toggleOpportunitiesPanel(brandId)` 全局接口
  - 绑定触发按钮 + 刷新/关闭按钮事件

- `client/css/geo-dashboard.css`
  - 新增 `.geo-opp-*` 样式族（面板/卡片/徽章/loading）

## API 变更

```http
POST /api/geo/opportunities/generate
Body: { brand_id: string, lookbackDays?: number, force_refresh?: boolean }
Response: { ok, data: { id, brand_id, data: {...}, created_at } }

GET /api/geo/opportunities/:brand_id?limit=10
Response: { ok, opportunities: [...], count: number }
```

## 数据结构

```json
{
  "summary": ["3-5 条核心洞察"],
  "opportunities": [
    {
      "category": "creation|existing-content|outreach|social",
      "title": "行动标题",
      "why": "解释原因",
      "relatedPrompts": ["关联 prompt 文本"],
      "difficulty": "wide-open|contested|locked-in"
    }
  ],
  "risks": ["风险提示"],
  "contentGaps": [
    { "prompt": "...", "runs": 5, "category": "..." }
  ]
}
```

## 测试方法

1. 确保 ACMS 3300 已重启加载新代码
2. 选择一个有追踪数据的品牌
3. 点击概览页「💡 智能推荐」按钮
4. 右侧抽屉展开，显示 AI 生成的机会列表
5. 检查内容缺口（红色高亮）和难度标签

## 后续优化方向

- [ ] Citation volatility 改用完整时间序列计算（借鉴 elmo `visibility-stats.ts`）
- [ ] Email 告警：综合分下降 >10% 时自动通知
- [ ] MCP Server 集成（ expose GEO 数据给 Claude Code / Codex）
- [ ] 多语言支持（en/zh toggle）
- [ ] Looker Studio 集成（企业客户数据对接）
