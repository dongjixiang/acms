const fs = require('fs');
const path = require('path');
const assert = require('assert');

const kanbanPath = path.resolve(__dirname, '../client/js/views/kanban.js');
const source = fs.readFileSync(kanbanPath, 'utf8');

// Locate showTrace and showExecutionDashboard blocks
const traceStart = source.indexOf('async function showTrace(taskId)');
const dashStart = source.indexOf('async function showExecutionDashboard');
assert.ok(traceStart >= 0, 'showTrace function must exist');
assert.ok(dashStart >= 0, 'showExecutionDashboard function must exist');

const showTrace = source.slice(traceStart, dashStart);
const dashBlock = source.slice(dashStart);

// Issue A: --bg-secondary does not exist in ACMS theme variables
assert.doesNotMatch(
  showTrace,
  /var\(--bg-secondary\)/,
  'trace modal must not use undefined --bg-secondary'
);
assert.match(
  showTrace,
  /background:var\(--bg2\)/,
  'trace modal must use ACMS --bg2 panel background'
);
assert.doesNotMatch(
  dashBlock,
  /var\(--bg-secondary\)/,
  'exec dashboard must not use undefined --bg-secondary'
);
assert.match(
  dashBlock,
  /background:var\(--bg2\)/,
  'exec dashboard must use ACMS --bg2 panel background'
);

// Issue B: overlay lifecycle — check existing modal BEFORE creating new overlay
const existingCheck = showTrace.indexOf("document.querySelector");
const overlayAppend = showTrace.indexOf('document.body.appendChild(overlay)');
assert.ok(existingCheck >= 0, 'showTrace must query existing modal');
assert.ok(overlayAppend >= 0, 'showTrace must append overlay');
assert.ok(
  existingCheck < overlayAppend,
  'must check for existing modal before appending new overlay'
);
assert.match(
  showTrace,
  /oldOverlay/,
  'existing modal cleanup must reference its associated overlay'
);

// New: visual trace display — no longer raw JSON
assert.doesNotMatch(
  showTrace,
  /textContent = JSON\.stringify/,
  'trace modal must not use raw JSON dump'
);
assert.match(
  showTrace,
  /statusBadge/,
  'trace modal must render status badges'
);
assert.match(
  showTrace,
  /角色执行统计/,
  'trace modal must show role stats section'
);
assert.match(
  showTrace,
  /执行时间线/,
  'trace modal must show timeline section'
);

console.log('PASS: trace modal is visually rich and safe');
