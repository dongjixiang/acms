# GEO v0.34 上线 checklist

> 状态：Phase A（算法 + 单测 21/21） ✅ + Phase B（前端金卡） ✅ 已完成
> 等待：多多手工执行上线步骤

---

## 一、上线前一次性步骤（按顺序执行）

### Step 1：dry-run 行业打标（看输出，不写入）
```bash
cd C:\Users\swede\acms
node scripts\v034-set-industry.js
```
**看输出**：脚本会列出每个 brand 的名字 + 即将打的 industry 类目。**确认无误后再 apply**。

注意：脚本的关键词启发规则（可按需调整）：
- `银行` / `bank` → banking
- `展览` / `展台` / `会展` → exhibition
- `品牌设计` / `品牌咨询` → brand-design
- 其他留空（不强行归类）

如果关键词规则有遗漏，脚本支持手动打标：
```bash
node scripts\v034-set-industry.js --ids brand_xxx,brand_yyy --industry banking
```

### Step 2：应用行业类目（确认 dry-run 后执行）
```bash
node scripts\v034-set-industry.js --apply
```
**预期**：13 个银行品牌被打 industry='banking'，其他保持空。

### Step 3：重启 ACMS 服务（Node require cache 陷阱）
- 打开你的 start.bat（你之前手工重启 3300 的脚本）
- **kill 旧的 node.exe**：`taskkill /F /IM node.exe`（如果权限不足报错，从任务管理器杀）
- **重新 start.bat** 启动

不重启 → scoring.js 的 3 个新函数（calculateTop1Rate / calculateCitationShare / calculateIndustryPercentile）不会被加载 → calculateCiteAbilityScore 不会产出新 components。

### Step 4：硬刷浏览器验证 UI
1. 打开 ACMS → 进 GEO 应用
2. **Ctrl+Shift+R 强刷**（或开 DevTools → Network → Disable cache 后再刷一次）
3. 选一个有追踪数据的品牌
4. 滚到"⭐ v0.34 三大新指标"区——三张金卡应该在
5. 每张卡 hover 看 tooltip 是否正常显示
6. 任意卡点开 DevTools 检查：`.v034-value` 文本应是数字或"样本不足"

---

## 二、端到端验证清单（每项必须看到 ✓ 才算完成）

### A. 算法层（curl / API）

```bash
# 选一个有追踪数据的 brand_id，从浏览器 URL 找 或 listBrands
curl http://localhost:3300/api/geo/brands/<brand_id>/score | python -m json.tool | grep -E "top1|citation|industry"
```

**预期看到**（取决于数据情况，可能部分字段为 null）：
- `top1_rate`：0-1 之间的小数，或 null（样本不足时）
- `top1_sample_size`：整数
- `top1_by_engine`：对象 `{deepseek: 0.3, kimi: 0.4, ...}`
- `citation_share`：0-1 之间，或 null
- `citation_brand_count` / `citation_total_count`：整数
- `citation_brand_domains`：整数
- `citation_coverage`：0-1 之间
- `industry_percentile`：0-1 之间，13 银行 apply 后应该会有数字
- `industry_rank` / `industry_sample_size`：整数
- `industry_median` / `industry_mean`：数字

### B. 前端层（浏览器）

- [ ] 三张金卡都在：★ 首位推荐率 / 🔗 AI 引用占比 / 🏆 行业分位
- [ ] 每张卡都有 tooltip（hover 验证）
- [ ] 数据有：数字 + 副指标 + 引擎 chips（首位率卡）/ 引用数（引用卡）/ 带状图（行业卡）
- [ ] 数据无：显示"样本不足"灰色态，不出现误导数字
- [ ] 行业卡的金色 marker 位置准确（带状图）
- [ ] 行业卡的中位竖线显示在中央

### C. 边界 & 异常处理

- [ ] 选一个**没有追踪数据**的品牌：综合分 KPI 显示"—"或错误，三张 v0.34 卡显示"样本不足"
- [ ] 选一个**有商业意图 query < 20**的品牌：首位推荐率卡"样本不足"，其他两张照常
- [ ] 选一个**没有 industry 字段**的品牌（打标前）：行业卡"样本不足"
- [ ] 跑 tracker 一轮后回来看：分数应该有变化（验证 scoring.js 新代码已加载）

### D. 持久化（geo_scores 表）

```bash
# 看 v0.34 新指标是否写入 scores 表
node -e "
const db = require('better-sqlite3')('./data/acms.db');
const rows = db.prepare('SELECT dimension, COUNT(*) as cnt FROM geo_scores GROUP BY dimension').all();
console.log(rows);
"
```
**预期**：dimension 列表里应有 `top1_rate` / `citation_share` / `industry_percentile`（13 银行 apply 后）。

---

## 三、已知风险 & 兜底

| 风险 | 兜底 |
| --- | --- |
| dry-run 输出意外 brand 被分类 | 在 --apply 前 grep 看脚本输出，异议 brand 手动排除 |
| 重启失败（taskkill 权限不足） | 任务管理器杀 node.exe 后再 start.bat |
| 浏览器还是看到旧版 | Ctrl+Shift+R 不够 → DevTools → Network → Disable cache 开关一下再刷 |
| 某个金卡 tooltip 写错/有错别字 | 直接改 client/views/geo-dashboard.html 的 data-tip 字段，重刷即可（无需重启） |
| 行业分位不显示 | 检查 db 中 banking 类目 brand 数 ≥ 8，dry-run 脚本确认没漏打 |
| 单测本地通过但 API 不出数据 | 看 console.log 看 require cache 是否真的清掉，restart 后再测 |

---

## 四、回滚方案（如果 v0.34 出问题）

最简回滚（不动 db）：
1. `client/index.html` line 729 改回 `?v=0.33`
2. `client/js/views/geo-dashboard.js` line 3466（CSS 注入处）改回 `?v=0.33`
3. `client/css/geo-dashboard.css` 末尾追加的 v0.34 样式删除
4. `client/views/geo-dashboard.html` 追加的"⭐ v0.34 三大新指标"区删除
5. `server/services/geo-scoring.js` 新增的三个函数 + components 注入删除
6. **回滚是纯前端 + 后端算法回退**，不动 geo_scores / geo_brands 数据

---

## 五、上线后给多多的反馈模板

跑完后告诉我：
- dry-run 输出里有几个 brand 被分到 banking？（预期 13 个）
- API 调用 `/api/geo/brands/<banking_brand_id>/score` 后 top1_rate / citation_share 哪个有数字？
- 行业分位百分位是数字还是 null？
- 浏览器里三张金卡 hover 时 tooltip 显示正常吗？
- 有什么字段要调整（文案/阈值/颜色）？

收到反馈后我可以做：
- 阈值微调（首位 50% 金 / 30% 蓝 / <30% 灰 这条线）
- 行业类目关键词扩展
- 趋势图（snapshot 历史序列拉出来做折线）
- 行业 tab 深度视图（v0.34.1 增量）