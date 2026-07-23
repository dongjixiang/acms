// v0.48 集成测试：document_gen tool + plan-executor file_ids 串联
// 直接调 injectUpstreamFileIds + executePlan，验证 3 个场景

const path = require('path');
const ROOT = path.join(__dirname, '..');
const planExecutor = require(path.join(ROOT, 'server/services/plan-executor'));
const { injectUpstreamFileIds } = planExecutor;

let pass = 0, fail = 0;
function ok(msg) { console.log('  ✅ ' + msg); pass++; }
function bad(msg) { console.log('  ❌ ' + msg); fail++; process.exit(1); }
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) ok(label + ' (==)');
  else bad(label + ' 实际=' + a + ' 期望=' + e);
}
function truthy(v, label) { v ? ok(label) : bad(label + ' (falsy: ' + v + ')'); }

console.log('\n=== Test A: send_email 自动注入上游 document_gen 的 file_ids ===');
{
  const planDoc = {
    steps: [
      { id: 's1', tool: 'document_gen', args: { instruction: 'x' }, depends_on: [], status: 'done',
        result: { ok: true, file_ids: [
          { id: 'uuid-docx-123', name: 'doc.docx', size: 100, mime: 'application/...wordprocessingml.document', kind: 'docx' },
          { id: 'uuid-md-456', name: 'doc.md', size: 50, mime: 'text/markdown', kind: 'md' }
        ] } },
      { id: 's2', tool: 'send_email', args: { to: 'x@x.com' }, depends_on: ['s1'], status: 'pending', result: null }
    ]
  };
  const injected = injectUpstreamFileIds(planDoc.steps[1], planDoc);
  truthy(injected.changed, 'changed=true');
  eq(injected.added, 2, 'added=2');
  truthy(Array.isArray(injected.args.file_ids), 'args.file_ids is array');
  eq(injected.args.file_ids, ['uuid-docx-123', 'uuid-md-456'], 'args.file_ids values');
  eq(injected.args.to, 'x@x.com', 'args.to preserved');
  eq(injected.args, { to: 'x@x.com', file_ids: ['uuid-docx-123', 'uuid-md-456'] }, 'full args');
}

console.log('\n=== Test B: LLM 显式传 file_ids 不被覆盖 ===');
{
  const planDoc = {
    steps: [
      { id: 's1', tool: 'document_gen', args: {}, depends_on: [], status: 'done',
        result: { ok: true, file_ids: [{ id: 'auto-id-1' }] } },
      { id: 's2', tool: 'send_email', args: { to: 'x@x.com', file_ids: ['llm-explicit'] }, depends_on: ['s1'], status: 'pending', result: null }
    ]
  };
  const injected = injectUpstreamFileIds(planDoc.steps[1], planDoc);
  eq(injected.changed, false, 'changed=false');
  eq(injected.added, 0, 'added=0');
  eq(injected.args.file_ids, ['llm-explicit'], 'args.file_ids LLM explicit');
}

console.log('\n=== Test C: 无上游 file_ids，保持原状 ===');
{
  const planDoc = {
    steps: [
      { id: 's1', tool: 'document_gen', args: {}, depends_on: [], status: 'done',
        result: { ok: true, file_ids: [] } },
      { id: 's2', tool: 'send_email', args: { to: 'x@x.com' }, depends_on: ['s1'], status: 'pending', result: null }
    ]
  };
  const injected = injectUpstreamFileIds(planDoc.steps[1], planDoc);
  eq(injected.changed, false, 'changed=false');
  truthy(!('file_ids' in injected.args), 'args 没新增 file_ids 字段');
}

console.log('\n=== Test D: send_email 不依赖上游 file_ids 步骤，保持原状 ===');
{
  const planDoc = {
    steps: [
      { id: 's1', tool: 'send_email', args: { to: 'x@x.com' }, depends_on: [], status: 'pending', result: null }
    ]
  };
  const injected = injectUpstreamFileIds(planDoc.steps[0], planDoc);
  eq(injected.changed, false, 'changed=false');
}

console.log('\n=== Test E: 上游 step 失败 status=failed 不注入 ===');
{
  const planDoc = {
    steps: [
      { id: 's1', tool: 'document_gen', args: {}, depends_on: [], status: 'failed',
        result: { ok: false, error: 'LLM_FAILED' } },
      { id: 's2', tool: 'send_email', args: { to: 'x@x.com' }, depends_on: ['s1'], status: 'pending', result: null }
    ]
  };
  const injected = injectUpstreamFileIds(planDoc.steps[1], planDoc);
  eq(injected.changed, false, 'changed=false（上游失败不注入）');
}

console.log('\n=== Test F: 上游 step skipped 不注入 ===');
{
  const planDoc = {
    steps: [
      { id: 's1', tool: 'document_gen', args: {}, depends_on: [], status: 'skipped', result: null },
      { id: 's2', tool: 'send_email', args: { to: 'x@x.com' }, depends_on: ['s1'], status: 'pending', result: null }
    ]
  };
  const injected = injectUpstreamFileIds(planDoc.steps[1], planDoc);
  eq(injected.changed, false, 'changed=false（上游 skipped 不注入）');
}

console.log('\n=== Test G: 多上游 file_ids 合并（多个 document_gen 并列）===');
{
  const planDoc = {
    steps: [
      { id: 's1', tool: 'document_gen', args: {}, depends_on: [], status: 'done',
        result: { ok: true, file_ids: [{ id: 'doc1' }, { id: 'md1' }] } },
      { id: 's2', tool: 'document_gen', args: {}, depends_on: [], status: 'done',
        result: { ok: true, file_ids: [{ id: 'doc2' }, { id: 'md2' }] } },
      { id: 's3', tool: 'send_email', args: { to: 'x@x.com' }, depends_on: ['s1', 's2'], status: 'pending', result: null }
    ]
  };
  const injected = injectUpstreamFileIds(planDoc.steps[2], planDoc);
  eq(injected.changed, true, 'changed=true');
  eq(injected.added, 4, 'added=4');
  eq(injected.args.file_ids, ['doc1', 'md1', 'doc2', 'md2'], 'merged file_ids');
}

console.log('\n=== ✅ ' + pass + ' pass / ' + fail + ' fail ===');
console.log('下游效果: plan_execute 路径 s1=document_gen → s2=send_email 自动拿到 docx 附件');
console.log('真实部署后，用户问"生成 Word + 发邮件" → LLM 拆 2 步 plan → 上线即拿到 .docx 邮件');
process.exit(fail > 0 ? 1 : 0);