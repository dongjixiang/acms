// 补 REQ-MRHPIF5J 的 SRS / Arch / Contracts / Flow Coverage 骨架
// 仅基于 workspace 中已存在的代码 + 数据事实（不是凭空"AI 应该做啥"）
const store = require('../server/stores/requirement-store');
const parse = (x) => { if (typeof x !== 'string') return x; try { return JSON.parse(x); } catch { return x; } };
const req = store.getById('REQ-MRHPIF5J');
if (!req) { console.error('REQ NOT FOUND'); process.exit(1); }

const srs = {
  scopeIn: [
    '双维度矩阵视图：横向时间轴 × 纵向国家列表，支持 7 个预制转折点切换',
    '国家筛选：点击国家切换该国在所有时间点的高亮，并触发关系连线重绘',
    '关系连线：同盟（绿）/敌对（红）/中立（灰）三种语义连线，仅在 Matrix 视图渲染',
    '历史转折点快照：7 个预制转折点（萨拉热窝/君士坦丁堡陷落/地理大发现/宗教改革/法国大革命/二战爆发/冷战形成）',
    '因果推导流程图（DAG）：每个转折点的 causal_chains 数组需达到 ≥3 层（已落地 6-7 层）',
    '深度溯源模式：IndirectFactorDrawer 抽屉展示间接因素（经济/意识形态等）',
    'Node 详情跳转：从 DAG 节点跳转到 EventDetail.tsx',
    '桌面端适配：CSS Grid 布局、悬停/拖拽/缩放',
  ],
  scopeOut: [
    '移动端适配（明确写在"体验/技术倾向"为桌面端）',
    '数据管理后台（admin 配置转折点），当前数据从静态 JSON 读取',
    '后端预计算因果网 API（架构 spec 中存在但本 REQ 内未实现运行时计算）',
    'i18n / 多语言切换',
    'SSR / Next.js（实际栈 React + Vite SPA）',
  ],
  acceptanceCriteria: [
    'F1 矩阵视图：进入首页能默认看到所有国家 × 所有时间点的网格，至少 1 个国家高亮',
    'F2 国家筛选：点击任意国家 → 矩阵内该国列高亮，连线颜色按 relations.json 的 type 字段生效',
    'F3 转折点切换：切换 turning-points 之一 → 矩阵 + 关系连线平滑过渡（≤800ms 内完成 CSS 过渡），非激活转折点的关系线淡化',
    'F4 因果 DAG：进入 Causal 页面 → 看到当前转折点的因果链节点 + 边，深度 ≥3 层，节点不重叠（dagre 自动布局）',
    'F5 深度溯源：打开 IndirectFactorDrawer → 显示间接因素节点，能从 DAG 节点跳转到 EventDetail',
    'F6 数据契约：countries/turning-points/relations/indirect-factors 必须通过 history.schema.json 校验',
    'F7 数据规模：MVP 必须包含 ≥15 国家 + ≥5 转折点 + 每条因果链 ≥3 层（已落地 28/7/6-7）',
  ],
  technicalConstraints: [
    '前端栈：React 18 + TypeScript（严格模式）+ Vite + React Router + Zustand',
    'DAG 渲染：dagre 布局 + 自定义 React Flow 节点/边',
    '数据规模：MVP 阶段 28 国家 / 7 转折点 / 54 关系 / 7 因果链均从静态 JSON 加载',
    '性能目标：单页交互 P95 ≤ 3s（k6 负载测试脚本已落地 tests/performance/load-test.js）',
    '浏览器兼容：Chrome / Edge / Safari × 1920/2560/3840（详见 tests/browser-matrix.md）',
    '后端：当前 REQ 阶段不依赖 ACMS 后端运行时；数据通过 Vite 静态资源加载',
  ],
  summary: '面向历史学习者的世界历史交互式网页：双维度矩阵（时间轴 × 国家）+ 因果 DAG + 深度溯源。当前已落地数据层（7 JSON）+ 前端脚手架（App/main/router/store）+ 3 个核心页面（Matrix/Causal/DeepTrace）+ 共同组件（ErrorBoundary/Layout/TabBar/legend/graph/strategy）。',
};

const archSpec = {
  modules: [
    { name: '数据层（静态 JSON）', path: 'workspaces/teste2e/data/', files: ['schema/history.schema.json','countries.json','turning-points.json','relations.json','indirect-factors.json','historic-data.json','historical-events.json'], owner: 'T-MRHSD8O3' },
    { name: '应用入口', path: 'workspaces/teste2e/src/', files: ['App.tsx','main.tsx','vite-env.d.ts'], owner: 'T-MRHSD8OE' },
    { name: '路由', path: 'workspaces/teste2e/src/router/', files: ['index.tsx'], owner: 'T-MRHSD8OE' },
    { name: '状态管理（Zustand）', path: 'workspaces/teste2e/src/store/', files: ['historyStore.ts','useCountryFilterStore.ts'], owner: 'T-MRHSD8OE/P5' },
    { name: '矩阵视图', path: 'workspaces/teste2e/src/pages/Matrix/', files: ['index.tsx','MatrixView.tsx','MatrixGrid.tsx','CountryRow.tsx','CountryFilter.tsx','TimelineAxis.tsx','TurningPointSelector.tsx','RelationOverlay.tsx','SnapshotTransition.tsx'], owner: 'T-MRHSD8OQ/PH' },
    { name: '因果图', path: 'workspaces/teste2e/src/pages/Causal/', files: ['index.tsx','CausalGraph.tsx','CausalNode.tsx','CausalEdge.tsx','CausalFactorNode.tsx'], owner: 'T-MRHSD8PV' },
    { name: '深度溯源', path: 'workspaces/teste2e/src/pages/DeepTrace/', files: ['index.tsx','DeepTraceGraph.tsx','IndirectFactorNode.tsx','IndirectFactorDrawer.tsx'], owner: 'T-MRHSD8QA' },
    { name: '事件详情', path: 'workspaces/teste2e/src/pages/EventDetail.tsx', files: ['EventDetail.tsx'], owner: 'T-MRHSD8QA' },
    { name: '公共组件', path: 'workspaces/teste2e/src/components/', files: ['ErrorBoundary.tsx','Layout.tsx','TabBar.tsx','drawer/','graph/','legend/','strategy/'], owner: 'T-MRHSD8OE/P5' },
    { name: '工具与 Hooks', path: 'workspaces/teste2e/src/utils/,hooks/', files: ['dagLayout.ts','relationResolver.ts','useHistoryData.ts','…'], owner: 'T-MRHSD8P5/PV' },
    { name: '测试与质量', path: 'workspaces/teste2e/src/__tests__/,tests/', files: ['relation.test.ts','causalGraph.test.ts','deepTrace.test.tsx','tests/performance/*','tests/browser-matrix.md','docs/performance-report.md','docs/browser-compatibility.md'], owner: 'T-MRHSD8P5/PV/QA/QO' },
  ],
  dataModel: {
    TURNING_POINT: {
      id: 'string (TP-…)',
      title: 'string',
      title_zh: 'string',
      era: 'string',
      year: 'number',
      summary: 'string',
      before_summary: 'string',
      after_summary: 'string',
      related_countries: 'string[] (国家 id 列表)',
      causal_chains: 'CausalChain[] (6-7 层)',
      source_reference: 'string',
    },
    CAUSAL_CHAIN: {
      id: 'string (CC-…)',
      level: "'trigger'|'cause'|'mediator'|'background'|…",
      depth: 'number (1-7)',
      description: 'string',
      event: 'string',
      related_factors: 'string[] (IF-…)',
      is_consensus: 'boolean',
      source_reference: 'string',
    },
    COUNTRY: {
      id: 'string (3 字母 ISO)',
      name: 'string (中文)',
      name_en: 'string',
      era: "'古代'|'中世纪'|'近现代'",
      region: 'string',
      first_active: 'string (起始年份)',
      last_active: 'string (结束年份)',
      capital: 'string',
      description: 'string',
    },
    RELATION: {
      id: 'string (REL-…)',
      from_country: 'string',
      to_country: 'string',
      turning_point_id: 'string',
      type: "'hostile'|'allied'|'neutral'",
      start_year: 'string',
      end_year: 'string',
      description: 'string',
    },
    INDIRECT_FACTOR: {
      id: 'string (IF-…)',
      category: "'economic'|'ideology'|'military'|'social'|'…'",
      description: 'string',
      related_turning_points: 'string[]',
    },
  },
  keyFlows: [
    'Matrix 视图：historyStore 初始化 → 读 4 个 JSON（countries/turning-points/relations/indirect-factors）→ CountryFilter 选择 → CountryRow 高亮 + RelationOverlay 重绘',
    'Causal 视图：选择 turningPoint → CausalGraph 读 causal_chains → dagre 自动布局 → 渲染 CausalNode + CausalEdge',
    'DeepTrace 视图：点击 DAG 节点 → IndirectFactorDrawer 弹出 → 显示 related_factors → 点击进入 EventDetail',
    'Snapshot 切换：TurningPointSelector 改变 activeTurningPoint → 矩阵 + 连线 + 因果图 + 间接因素全部响应 → SnapshotTransition 触发 ≤800ms CSS 过渡',
  ],
  openIssues: [
    '🐛 T-MRR0AEBA 7/18 23:55 升级中：矩阵视图运行时 Promise TypeError（filter is not a function），页面渲染空白。已加 ErrorBoundary 兜底 + 修复 sampleData 模块，progress=12%，需继续跑完',
    '⚠️ 8 个 task 的 review_report 字段全为 {}，自动 review 没产生有效 spec/contract/flow 验证输出，下次启动需补 verifyContract 4-phase stub 或真人工 review',
    '⚠️ 7/12 T-MRHSD8O3 跑完后 dispatcher 抛 _unlockTask is not defined（v0.51 Pattern T），导致后续 7 个 task 的 execution_log 全部为空，只能靠 re-submit 路径完成 review。建议把 _unlockTask 实现化',
  ],
};

const interfaceContracts = [
  {
    name: 'historyStore',
    type: 'client-state',
    module: 'src/store/historyStore.ts',
    contract: {
      state: ['turningPoints: TURNING_POINT[]', 'countries: COUNTRY[]', 'relations: RELATION[]', 'activeTurningPointId: string|null', 'selectedCountryIds: string[]'],
      actions: ['setActiveTurningPoint(id)', 'toggleCountrySelection(id)', 'getCausalChainById(id)', 'getIndirectFactorsForChain(id)'],
    },
  },
  {
    name: 'static-dataset',
    type: 'static-json',
    module: 'workspaces/teste2e/data/*',
    contract: {
      validation: 'data/schema/history.schema.json',
      files: ['countries.json','turning-points.json','relations.json','indirect-factors.json','historic-data.json','historical-events.json'],
    },
  },
  {
    name: 'dagLayout',
    type: 'utility',
    module: 'src/utils/dagLayout.ts',
    contract: {
      input: '{ chains: CAUSAL_CHAIN[], options: { rankdir?: "LR"|"TB", nodeWidth?: number, nodeHeight?: number } }',
      output: '{ nodes: { id, x, y, data }[], edges: { id, source, target }[] }',
      uses: 'dagre',
    },
  },
  {
    name: 'relationResolver',
    type: 'utility',
    module: 'src/utils/relationResolver.ts',
    contract: {
      input: '{ from: COUNTRY_ID, to: COUNTRY_ID, turningPointId: string, relations: RELATION[] }',
      output: '{ type, color, animated, description }|null',
    },
  },
];

const flowCoverage = {
  F1_matrix: { implemented: true, files: ['src/pages/Matrix/*'] },
  F2_country_filter: { implemented: true, files: ['src/pages/Matrix/CountryFilter.tsx','src/pages/Matrix/RelationOverlay.tsx','src/store/historyStore.ts','src/utils/relationResolver.ts'] },
  F3_snapshot_transition: { implemented: true, files: ['src/pages/Matrix/SnapshotTransition.tsx'] },
  F4_causal_dag: { implemented: true, files: ['src/pages/Causal/*','src/utils/dagLayout.ts'] },
  F5_deep_trace: { implemented: true, files: ['src/pages/DeepTrace/*'] },
  F6_schema_validation: { implemented: 'partial', note: 'history.schema.json 已定义；运行时校验未确认（tests/ 下未见 schema 校验测试）' },
  F7_data_scale: { implemented: true, facts: { countries: 28, turning_points: 7, relations: 54, avg_chains_per_tp: 6.3 } },
  tests: {
    'src/__tests__/relation.test.ts': 'covered',
    'src/__tests__/causalGraph.test.ts': 'covered',
    'src/__tests__/deepTrace.test.tsx': 'covered',
    'tests/performance/lighthouse.config.js': 'covered (script exists)',
    'tests/performance/load-test.js': 'covered (k6 script exists)',
    'docs/performance-report.md': 'artifact exists, status: needs-run',
    'docs/browser-compatibility.md': 'artifact exists, status: needs-run',
  },
  openGaps: [
    '🐛 T-MRR0AEBA：矩阵视图运行时崩溃未修复，progress=12%',
    '⚠️ performance-report.md / browser-compatibility.md 是占位文件，未实际跑过 Lighthouse + k6 + 真跨浏览器',
    '⚠️ history.schema.json 运行时校验未在 tests/ 中验证（需 vitest 跑 schema 加载）',
  ],
};

const now = new Date().toISOString();
const result = store.update('REQ-MRHPIF5J', {
  srs: JSON.stringify(srs),
  arch_spec: JSON.stringify(archSpec),
  interface_contracts: JSON.stringify(interfaceContracts),
  flow_coverage: JSON.stringify(flowCoverage),
  updated_at: now,
});
console.log(JSON.stringify({
  updated: !!result,
  srs_keys: Object.keys(srs),
  arch_modules_count: archSpec.modules.length,
  arch_dataModel_keys: Object.keys(archSpec.dataModel),
  arch_keyFlows_count: archSpec.keyFlows.length,
  arch_openIssues_count: archSpec.openIssues.length,
  contracts_count: interfaceContracts.length,
  flow_keys: Object.keys(flowCoverage),
  flow_openGaps_count: flowCoverage.openGaps.length,
}, null, 2));
