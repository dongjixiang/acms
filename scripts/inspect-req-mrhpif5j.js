const store = require('../server/stores/requirement-store');
const req = store.getById('REQ-MRHPIF5J');
if (!req) { console.log('NOT_FOUND'); process.exit(0); }
const parse = (x) => { if (typeof x !== 'string') return x; try { return JSON.parse(x); } catch { return x; } };
const p = parse(req.plan);
const h = parse(req.supplement_history);
const sd = parse(req.structured_description || '{}') || {};
const srs = parse(req.srs || '{}') || {};
const arch = parse(req.arch_spec || '{}') || {};
const contracts = parse(req.interface_contracts || '[]') || [];
const flow = parse(req.flow_coverage || '{}') || {};
const ch = parse(req.change_history || '[]') || [];
const tids = parse(req.task_ids || '[]') || [];
console.log(JSON.stringify({
  id: req.id,
  title: req.title,
  status: req.status,
  phase: req.phase,
  description: req.description,
  description_len: (req.description || '').length,
  structured_description_keys: Object.keys(sd),
  srs_keys: Object.keys(srs),
  arch_spec_keys: Object.keys(arch),
  interface_contracts_count: Array.isArray(contracts) ? contracts.length : 'not_array',
  flow_coverage_keys: Object.keys(flow),
  change_history_count: ch.length,
  plan_status: req.plan_status,
  has_plan: !!p,
  plan_summary: p?.summary,
  plan_steps: p?.steps?.map(s => ({ id: s.id, tool: s.tool, status: s.status, title: s.title, depends_on: s.depends_on })) || [],
  plan_step_count: p?.steps?.length || 0,
  supplement_history_count: Array.isArray(h) ? h.length : 'not_array',
  supplement_history_tail: Array.isArray(h) ? h.slice(-8).map(e => ({ at: e.at, role: e.role, source: e.source, text: String(e.text || '').slice(0, 200) })) : h,
  thinking_brief: parse(req.thinking_brief || '{}'),
  clarity_model: req.clarity_model,
  input_clarity: req.input_clarity,
  clarity_reason: req.clarity_reason,
  task_ids: tids,
  created_at: req.created_at,
  updated_at: req.updated_at,
  project_id: req.project_id,
}, null, 2));
