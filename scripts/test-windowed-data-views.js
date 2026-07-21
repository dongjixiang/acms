'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function makeElement(initial) {
  return Object.assign({
    value: '',
    innerHTML: '',
    textContent: '',
    disabled: false,
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  }, initial || {});
}

function makeDom(ids) {
  const elements = Object.create(null);
  ids.forEach(id => { elements[id] = makeElement(); });
  return {
    elements,
    root: {
      querySelector(selector) {
        return selector[0] === '#' ? (elements[selector.slice(1)] || null) : null;
      },
      querySelectorAll() { return []; },
    },
  };
}

function makeDocument(hiddenElements) {
  return {
    getElementById(id) { return hiddenElements[id] || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return makeElement(); },
    body: { appendChild() {} },
  };
}

function loadScript(relativePath, sandbox) {
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  vm.runInContext(source, sandbox, { filename: relativePath });
}

async function testWindowedBugView() {
  const ids = [
    'bug-form-panel', 'bug-status-filter', 'bug-severity-filter', 'bug-list',
    'bug-desc-input', 'bug-model-select', 'bug-clarify-area',
  ];
  const windowDom = makeDom(ids);
  const hiddenDom = makeDom(ids);
  const sandbox = {
    console,
    document: makeDocument(hiddenDom.elements),
    App: { currentProjectId: 'proj-test' },
    fetch: async url => {
      assert.match(String(url), /^\/api\/bugs\?projectId=proj-test/);
      return {
        json: async () => [{
          id: 'BUG-1', title: '窗口内测试缺陷', status: 'backlog',
          bug_severity: 'major', bug_source: 'manual',
          created_at: '2026-07-21T00:00:00.000Z',
        }],
      };
    },
    escHtml: value => String(value == null ? '' : value),
    getSeverityBadge: value => '[' + value + ']',
    getStatusBadge: value => '[' + value + ']',
    getSourceLabel: value => value,
    formatDate: value => value,
    truncate: value => value,
    toast() {},
    setTimeout,
    clearTimeout,
  };
  loadScript('client/js/views/bugs.js', sandbox);

  await sandbox.loadBugView(windowDom.root);
  await new Promise(resolve => setImmediate(resolve));

  assert.match(windowDom.elements['bug-list'].innerHTML, /窗口内测试缺陷/,
    'bug list must render inside the ACMS window root');
  assert.doesNotMatch(hiddenDom.elements['bug-list'].innerHTML, /窗口内测试缺陷/,
    'hidden template must not receive window data');
}

async function testWindowedKnowledgeView() {
  const ids = [
    'knowledge-stats', 'knowledge-tree', 'knowledge-files',
    'knowledge-page-content', 'knowledge-index-summary',
  ];
  const windowDom = makeDom(ids);
  const hiddenDom = makeDom(ids);
  const sandbox = {
    console,
    document: makeDocument(hiddenDom.elements),
    App: { currentProjectId: 'proj-test' },
    api: async (method, url) => {
      assert.strictEqual(method, 'GET');
      if (url.endsWith('/stats')) return { exists: true, pageCount: 1, uploadCount: 1 };
      if (url.endsWith('/tree')) return [{ type: 'file', name: 'index.md', path: 'index.md' }];
      if (url.endsWith('/files')) return [{
        id: 'KF-1', original_name: 'spec.md', size: 1024,
        status: 'scanned', uploaded_at: '2026-07-21T00:00:00.000Z', notes: '',
      }];
      throw new Error('Unexpected API URL: ' + url);
    },
    escHtml: value => String(value == null ? '' : value),
    toast() {},
    showConfirm: async () => true,
    setTimeout,
    clearTimeout,
  };
  loadScript('client/js/views/knowledge.js', sandbox);

  await sandbox.loadKnowledgeView(windowDom.root);

  assert.strictEqual(windowDom.elements['knowledge-stats'].textContent, '📄 1 页 | 📁 1 个上传');
  assert.match(windowDom.elements['knowledge-tree'].innerHTML, /index/,
    'knowledge tree must render inside the ACMS window root');
  assert.match(windowDom.elements['knowledge-files'].innerHTML, /spec\.md/,
    'knowledge files must render inside the ACMS window root');
  assert.strictEqual(hiddenDom.elements['knowledge-files'].innerHTML, '',
    'hidden template must not receive window data');
}

async function testViewLoaderRegistrations() {
  const html = fs.readFileSync(path.join(ROOT, 'client', 'index.html'), 'utf8');
  assert.match(html, /registerViewLoader\('bugs',[\s\S]*?loadBugView\(w\.\$c\)/,
    'bugs must register a scoped ACMS window loader');
  assert.match(html, /registerViewLoader\('knowledge',[\s\S]*?loadKnowledgeView\(w\.\$c\)/,
    'knowledge must register a scoped ACMS window loader');
}

async function main() {
  const tests = [
    ['windowed bug view renders API data in its own root', testWindowedBugView],
    ['windowed knowledge view renders API data in its own root', testWindowedKnowledgeView],
    ['bug and knowledge views are wired into ACMSWin loaders', testViewLoaderRegistrations],
  ];
  let failures = 0;
  for (const [name, test] of tests) {
    try {
      await test();
      console.log('PASS:', name);
    } catch (err) {
      failures += 1;
      console.error('FAIL:', name);
      console.error(err && err.stack ? err.stack : err);
    }
  }
  if (failures) process.exit(1);
}

main();
