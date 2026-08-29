// ACMS GEO 拓词工作台（v0.20 — 借鉴 GEORank keyword_expansion.py，Apache-2.0）
// 用途：输入业务种子词 → 按业务画像的 8 维模板展开为关键词资产 → 转提问模板
// 路径：server/services/geo-keyword-expander.js
//
// 借鉴点（GEORank 开源 Apache-2.0）：
//   - 8 维拓词：语义拓展/场景覆盖/商业意图/推荐榜单/产品评测/品牌关联/问答长尾/技术方案
//   - 4 业务画像：企业服务/教育培训/本地服务/电商品牌（每画像 8 维 × 10 模板 = 80 条）
//   - {s} 占位符模板体系 + 画像推断 + 失败回退
// 差异：画像推断用规则（原版用 LLM），零成本；模板直存（原版 AI 失败才用）

const DIMENSIONS = [
  { key: 'semantic', name: '语义拓展', category: 'brand_intro' },
  { key: 'scenario', name: '场景覆盖', category: 'use_case' },
  { key: 'commercial', name: '商业意图', category: 'pricing' },
  { key: 'ranking', name: '推荐榜单', category: 'comparison' },
  { key: 'review', name: '产品评测', category: 'comparison' },
  { key: 'brand', name: '品牌关联', category: 'brand_intro' },
  { key: 'question', name: '问答长尾', category: 'product' },
  { key: 'technical', name: '技术方案', category: 'product' },
];

const PROFILES = {
  enterprise_service: {
    name: '企业服务',
    templates: {
      semantic: ["{s}", "{s}平台", "{s}工具", "{s}解决方案", "智能{s}", "企业级{s}", "{s}优化", "{s}系统", "{s}服务", "{s}引擎"],
      scenario: ["B2B {s}", "企业 {s}", "品牌 {s}", "SaaS {s}", "增长场景 {s}", "AI 搜索场景 {s}", "内容团队 {s}", "市场部 {s}", "官网 {s}", "咨询场景 {s}"],
      commercial: ["{s}价格", "{s}服务报价", "{s}多少钱", "{s}采购指南", "{s}试用", "{s}哪个好", "{s}对比价格", "{s}实施费用", "{s}方案报价", "{s}预算"],
      ranking: ["最佳{s}", "{s}推荐", "{s}排行榜", "{s}Top10", "{s}服务商推荐", "国产{s}推荐", "{s}榜单", "{s}哪家好", "{s}头部厂商", "{s}优选"],
      review: ["{s}评测", "{s}对比", "{s}优缺点", "{s}测评", "{s}案例分析", "{s}实测", "{s}口碑", "{s}选型", "{s}体验", "{s}使用感受"],
      brand: ["{s}品牌", "{s}服务商", "{s}厂商", "{s}公司", "{s}竞品", "{s}替代方案", "{s}官网", "{s}产品矩阵", "{s}合作伙伴", "{s}生态"],
      question: ["什么是{s}", "如何做{s}", "{s}怎么用", "为什么要做{s}", "{s}有效吗", "{s}适合谁", "{s}有哪些步骤", "{s}如何落地", "{s}有哪些误区", "{s}怎么评估"],
      technical: ["{s} API", "{s}部署方案", "{s}集成", "{s}技术架构", "{s}数据结构", "{s}工作流", "{s}自动化", "{s}系统设计", "{s}对接", "{s}实施方案"],
    },
  },
  consumer_education: {
    name: '教育培训',
    templates: {
      semantic: ["{s}", "在线{s}", "一对一{s}", "{s}课程", "{s}机构", "{s}老师", "{s}培训", "{s}提分", "{s}家教", "{s}班"],
      scenario: ["学生 {s}", "家长找{s}", "线上{s}", "小初高 {s}", "培优场景 {s}", "提分场景 {s}", "考前冲刺 {s}", "寒暑假 {s}", "升学场景 {s}", "校内同步 {s}"],
      commercial: ["{s}价格", "{s}收费", "{s}哪家好", "{s}机构推荐", "{s}老师推荐", "{s}试听", "{s}课程报价", "{s}报名", "{s}怎么选", "{s}排名"],
      ranking: ["最佳{s}", "{s}机构推荐", "{s}老师推荐", "{s}平台推荐", "口碑好的{s}", "{s}排行榜", "本地{s}推荐", "线上{s}推荐", "{s}优选", "{s}哪家强"],
      review: ["{s}机构评测", "{s}平台对比", "{s}课程测评", "{s}优缺点", "{s}体验", "{s}口碑", "{s}家长评价", "{s}实测", "{s}效果怎么样", "{s}值不值"],
      brand: ["{s}机构", "{s}老师", "{s}课程品牌", "{s}培训机构", "{s}学习平台", "{s}替代课程", "{s}品牌", "{s}官网", "{s}名师", "{s}教材"],
      question: ["什么是{s}", "{s}适合谁", "{s}怎么选", "{s}怎么上课", "{s}有效吗", "{s}多少钱", "{s}和家教区别", "{s}有哪些方式", "{s}如何提分", "{s}多久见效"],
      technical: ["{s}课程体系", "{s}教学方案", "{s}题库", "{s}学习计划", "{s}直播课", "{s}录播课", "{s}课后练习", "{s}测评系统", "{s}班型设计", "{s}教学工具"],
    },
  },
  local_service: {
    name: '本地服务',
    templates: {
      semantic: ["{s}", "同城{s}", "上门{s}", "{s}服务", "{s}预约", "{s}方案", "{s}门店", "{s}师傅", "{s}公司", "{s}平台"],
      scenario: ["附近{s}", "家庭 {s}", "同城 {s}", "周末 {s}", "急单 {s}", "预约 {s}", "到店 {s}", "上门场景 {s}", "本地生活 {s}", "门店 {s}"],
      commercial: ["{s}价格", "{s}收费", "{s}多少钱", "{s}预约", "{s}报价", "{s}哪家好", "{s}服务电话", "{s}优惠", "{s}套餐", "{s}附近推荐"],
      ranking: ["同城{s}推荐", "{s}排行榜", "附近{s}哪家好", "{s}优选", "{s}口碑榜", "{s}门店推荐", "{s}服务商推荐", "{s}品牌推荐", "{s}Top10", "本地{s}推荐"],
      review: ["{s}测评", "{s}对比", "{s}口碑", "{s}评价", "{s}体验", "{s}值不值", "{s}优缺点", "{s}实测", "{s}案例", "{s}避坑"],
      brand: ["{s}门店", "{s}公司", "{s}品牌", "{s}服务商", "{s}官网", "{s}预约平台", "{s}替代商家", "{s}附近门店", "{s}加盟", "{s}联系电话"],
      question: ["{s}怎么预约", "{s}多少钱", "{s}多久上门", "{s}适合谁", "{s}怎么选", "{s}有哪些流程", "{s}靠谱吗", "{s}注意什么", "{s}有哪些坑", "{s}哪里找"],
      technical: ["{s}流程", "{s}服务标准", "{s}预约系统", "{s}门店管理", "{s}工单", "{s}售后方案", "{s}服务清单", "{s}操作规范", "{s}服务时效", "{s}实施步骤"],
    },
  },
  ecommerce_brand: {
    name: '电商品牌',
    templates: {
      semantic: ["{s}", "{s}品牌", "{s}产品", "{s}套装", "{s}旗舰店", "{s}好物", "{s}平替", "{s}推荐", "{s}测评", "{s}使用感受"],
      scenario: ["电商 {s}", "直播间 {s}", "小红书 {s}", "抖音 {s}", "新品 {s}", "种草场景 {s}", "礼物场景 {s}", "节日场景 {s}", "复购场景 {s}", "达人推荐 {s}"],
      commercial: ["{s}价格", "{s}多少钱", "{s}优惠", "{s}折扣", "{s}购买渠道", "{s}旗舰店", "{s}哪家便宜", "{s}怎么选", "{s}礼盒", "{s}返场"],
      ranking: ["{s}推荐", "{s}排行榜", "最佳{s}", "{s}哪款好", "{s}榜单", "{s}平替推荐", "{s}热门款", "{s}Top10", "{s}口碑榜", "{s}优选"],
      review: ["{s}评测", "{s}测评", "{s}开箱", "{s}对比", "{s}使用体验", "{s}真实评价", "{s}值不值", "{s}优缺点", "{s}效果", "{s}购买建议"],
      brand: ["{s}品牌", "{s}旗舰店", "{s}官网", "{s}系列", "{s}竞品", "{s}替代款", "{s}联名", "{s}口碑", "{s}品牌故事", "{s}热卖款"],
      question: ["{s}值得买吗", "{s}适合谁", "{s}怎么选", "{s}和竞品区别", "{s}哪个系列好", "{s}在哪里买", "{s}怎么用", "{s}会回购吗", "{s}适合什么场景", "{s}有哪些坑"],
      technical: ["{s}成分", "{s}规格", "{s}材质", "{s}使用方法", "{s}搭配方案", "{s}开箱", "{s}渠道策略", "{s}内容打法", "{s}商品结构", "{s}评价体系"],
    },
  },
};

// 画像推断（规则版，替代原版 LLM 推断）：种子词信号 → 业务画像
function inferProfile(seed) {
  const s = String(seed || '').toLowerCase();
  if (/附近|同城|上门|门店|预约|师傅|到店|装修|家政|维修|搬家|开锁|保洁/.test(s)) return 'local_service';
  if (/课程|培训|教育|学习|提分|老师|学生|家教|机构|网课|辅导/.test(s)) return 'consumer_education';
  if (/买|款|旗舰|种草|平替|穿搭|护肤|零食|好物|直播间|小红书|抖音|礼盒/.test(s)) return 'ecommerce_brand';
  return 'enterprise_service';
}

// 8 维展开：种子词 → {dimension: [keywords]}
function expandKeywords(seeds, profileOverride) {
  const out = { ok: true, seeds: [], dimensions: [] };
  const seedList = (Array.isArray(seeds) ? seeds : [seeds]).map(s => String(s || '').trim()).filter(Boolean);
  if (!seedList.length) return { ok: false, error: 'NO_SEEDS', message: '至少输入一个种子词' };

  DIMENSIONS.forEach(dim => {
    out.dimensions.push({ key: dim.key, name: dim.name, category: dim.category, keywords: [] });
  });

  seedList.forEach(seed => {
    const profileKey = profileOverride || inferProfile(seed);
    const profile = PROFILES[profileKey] || PROFILES.enterprise_service;
    const dimMap = {};
    DIMENSIONS.forEach(d => { dimMap[d.key] = out.dimensions.find(x => x.key === d.key); });

    DIMENSIONS.forEach(dim => {
      const tmpls = profile.templates[dim.key] || [];
      const keywords = tmpls.map(t => t.replaceAll('{s}', seed)).filter(k => k !== seed);
      // 去重 + 去空白
      [...new Set(keywords)].filter(Boolean).forEach(k => dimMap[dim.key].keywords.push(k));
    });
  });

  out.profile = profileOverride || inferProfile(seedList[0]);
  out.profile_name = PROFILES[out.profile]?.name || out.profile;
  out.total = out.dimensions.reduce((s, d) => s + d.keywords.length, 0);
  return out;
}

module.exports = { DIMENSIONS, PROFILES, inferProfile, expandKeywords };
