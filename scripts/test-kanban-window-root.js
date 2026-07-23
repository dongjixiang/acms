'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function main() {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'client', 'js', 'views', 'kanban.js'),
    'utf8'
  );

  const elements = Object.create(null);
  elements['#kanban-req-filter'] = { value: '', innerHTML: '' };
  elements['#auto-review-global'] = { checked: false };
  for (const col of ['backlog', 'in_progress', 'review', 'done', 'archived', 'failed']) {
    elements['#count-' + col] = { textContent: null };
    elements['#col-' + col] = {
      innerHTML: '',
      setAttribute() {},
      addEventListener() {},
    };
  }

  // ACMSWin passes an HTMLElement as root. HTMLElement supports querySelector,
  // but deliberately does not have document.getElementById().
  const windowRoot = {
    querySelector(selector) { return elements[selector] || null; },
    querySelectorAll() { return []; },
  };

  const documentStub = {
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    createElement() { return {}; },
    body: { appendChild() {} },
  };

  const sandbox = {
    console,
    window: {},
    document: documentStub,
    localStorage: { getItem() { return null; }, setItem() {} },
    App: { currentProjectId: 'proj-test', typeLabels: {} },
    Requirements: { async list() { return []; } },
    Tasks: {
      async board() {
        return {
          backlog: [], in_progress: [], review: [],
          done: [], archived: [], failed: [],
        };
      },
    },
    fetch: async () => ({ json: async () => [] }),
    escHtml: value => String(value == null ? '' : value),
    toast(message) { throw new Error('Unexpected toast: ' + message); },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    EventSource: function EventSource() {},
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'kanban.js' });

  await vm.runInContext('refreshKanban(undefined, windowRoot)', vm.createContext({
    refreshKanban: sandbox.refreshKanban,
    windowRoot,
  }));

  assert.strictEqual(elements['#count-done'].textContent, 0);
  assert.match(elements['#col-done'].innerHTML, /class="empty"/);
  console.log('PASS: refreshKanban supports an HTMLElement window root');
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
