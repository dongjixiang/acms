// 诊断 REQ-MRHPIF5J 的执行链：srs/arch/contracts/plan/exec_log 全看一遍
const reqStore = require('../server/stores/requirement-store');
const taskStore = require('../server/stores/task-store');
const parse = (x) => { if (typeof x !== 'string') return x; try { return JSON.parse(x); } catch { return x; } };
const req = reqStore.getById('REQ-MRHPIF5J');
if (!req) { console.log('REQ NOT FOUND'); process.exit(1); }
const taskIds = parse(req.task_ids || '[]') || [];
console.log('=== REQ ===');
console.log(JSON.stringify({
  id: req.id,
  status: req.status,
  phase: req.phase,
  task_ids: taskIds,
  srs_present: !!parse(req.srs).scopeIn || false,
  arch_present: Object.keys(parse(req.arch_spec)).length > 0,
  contracts_count: (parse(req.interface_contracts) || []).length,
  flow_present: Object.keys(parse(req.flow_coverage)).length > 0,
  sd_size: Object.keys(parse(req.structured_description)).length,
}, null, 2));
console.log('=== TASKS ===');
const summaries = [];
for (const tid of taskIds) {
  const t = taskStore.getById(tid);
  if (!t) { summaries.push({ id: tid, missing: true }); continue; }
  const plan = parse(t.plan);
  const exec = parse(t.execution_log) || [];
  const subs = parse(t.submissions) || [];
  const revs = parse(t.reviews) || [];
  const rpt = parse(t.review_report) || {};
  summaries.push({
    id: t.id,
    status: t.status,
    progress: t.progress,
    assignee: t.assignee || null,
    title: t.title,
    files: t.files || (plan && plan.files) || [],
    has_plan: !!plan,
    plan_steps: plan?.steps?.length || 0,
    plan_files: plan?.files?.length || 0,
    exec_log_len: Array.isArray(exec) ? exec.length : 0,
    exec_tail: Array.isArray(exec) ? exec.slice(-3).map(e => ({ round: e.round, note: e.note?.slice(0, 80), time: e.time })) : [],
    submissions_count: Array.isArray(subs) ? subs.length : 0,
    reviews_count: Array.isArray(revs) ? revs.length : 0,
    review_summary: rpt.summary || null,
    auto_review: rpt.autoReview || null,
  });
}
console.log(JSON.stringify(summaries, null, 2));
console.log('=== REQ.ASSIST_* 字段 ===');
const assists = ['assist_image', 'assist_video', 'assist_video_scene_0', 'assist_music', 'assist_document_gen', 'assist_send_email', 'assist_clean', 'assist_screenplay'];
for (const k of assists) {
  const v = req[k];
  if (v) {
    let parsed; try { parsed = JSON.parse(v); } catch { parsed = v; }
    console.log(k, '→', JSON.stringify(parsed).slice(0, 200));
  }
}
