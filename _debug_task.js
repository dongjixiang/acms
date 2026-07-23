const store = require('./server/stores/task-store');
const t = store.getById('T-MRR0AEBA');
console.log('=== Task T-MRR0AEBA ===');
console.log('Title:', t.title);
console.log('Status:', t.status);
console.log('Progress:', t.progress);
console.log('Execution mode:', t.execution_mode);
const subs = JSON.parse(t.submissions || '[]');
console.log('Submissions count:', subs.length);
subs.forEach((s, i) => {
  console.log('--- Submission ' + i + ' ---');
  console.log('  Time:', s.time);
  console.log('  Files:', s.files?.length || 0);
  if (s.files) s.files.forEach(f => console.log('    - ' + f));
  console.log('  Note preview:', (s.note || '').slice(0, 500));
});
const revs = JSON.parse(t.reviews || '[]');
console.log('Reviews count:', revs.length);
revs.forEach((r, i) => {
  console.log('--- Review ' + i + ' ---');
  console.log('  By:', r.reviewedBy);
  console.log('  Verdict:', r.verdict);
  console.log('  Note:', (r.note || '').slice(0, 300));
});
const log = JSON.parse(t.execution_log || '[]');
console.log('Execution log entries:', log.length);
if (log.length > 0) {
  console.log('First log:', log[0]?.time);
  console.log('Last log:', log[log.length-1]?.time);
  console.log('Last log note:', (log[log.length-1]?.note || '').slice(0, 300));
}
