#!/usr/bin/env node
// ACMS 块编辑器单测（v0.62 块编辑器核心）
// 位置：scripts/test-office-doc.js
// 运行：node scripts/test-office-doc.js

const path = require('path');
const fs = require('fs');

const REPO = path.resolve(__dirname, '..');
const OfficeDoc = require(path.join(REPO, 'client', 'js', 'core', 'office-doc.js'));
const Conv = require(path.join(REPO, 'client', 'js', 'core', 'office-doc-converter.js'));

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
    pass++;
  } catch (e) {
    console.log('  ✗ ' + name);
    console.log('     ' + (e.message || e));
    if (e.stack) console.log('     ' + e.stack.split('\n')[1]);
    fail++;
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg||'eq failed') + '\n     expected: ' + JSON.stringify(b) + '\n     got: ' + JSON.stringify(a)); }

console.log('═══ office-doc.js (Block schema) ═══');

test('makeBlock: 创建一个 paragraph', () => {
  var b = OfficeDoc.makeBlock('paragraph', {}, 'hello');
  assert(b.id && b.id.length > 10, 'id 应该存在');
  eq(b.type, 'paragraph');
  eq(b.content, 'hello');
  eq(b.attrs, {});
});

test('heading 工厂函数', () => {
  var h = OfficeDoc.heading('Title', 2);
  eq(h.type, 'heading');
  eq(h.content, 'Title');
  eq(h.attrs.level, 2);
});

test('todo 默认 unchecked', () => {
  var t = OfficeDoc.todo('写文档');
  eq(t.attrs.checked, false);
  var t2 = OfficeDoc.todo('已完成', true);
  eq(t2.attrs.checked, true);
});

test('image 默认 attrs', () => {
  var i = OfficeDoc.image('http://x.png', 'logo', 200);
  eq(i.attrs.src, 'http://x.png');
  eq(i.attrs.alt, 'logo');
  eq(i.attrs.width, 200);
});

test('table 默认 headers+rows', () => {
  var t = OfficeDoc.table(['A','B'], [['1','2']]);
  eq(t.attrs.headers, ['A','B']);
  eq(t.attrs.rows, [['1','2']]);
});

test('uuid 不重复', () => {
  var ids = new Set();
  for (var i = 0; i < 100; i++) ids.add(OfficeDoc.uuid());
  assert(ids.size === 100, '应该 100 个唯一 id');
});

console.log('\n═══ Document CRUD ═══');

test('makeDocument + validateDocument ok', () => {
  var d = OfficeDoc.makeDocument({ title: 't1' });
  var v = OfficeDoc.validateDocument(d);
  assert(v.ok, 'validate should pass: ' + v.error);
  eq(d.meta.title, 't1');
  assert(d.meta.createdAt && d.meta.updatedAt, '时间戳应有');
});

test('validateDocument 拒绝非对象', () => {
  var v = OfficeDoc.validateDocument(null);
  assert(!v.ok && v.error === 'NOT_OBJECT');
});

test('validateDocument 拒绝 unknown block type', () => {
  var d = { meta: { title: 'x' }, blocks: [{ id: 'a', type: 'unknownType', content: 'x', attrs: {} }] };
  var v = OfficeDoc.validateDocument(d);
  assert(!v.ok, '应拒绝');
  assert(v.error.indexOf('UNKNOWN_TYPE') >= 0, 'error 应含 UNKNOWN_TYPE: ' + v.error);
});

test('insertBlock 中间位置', () => {
  var d = OfficeDoc.makeDocument();
  d.blocks = [OfficeDoc.paragraph('a'), OfficeDoc.paragraph('b')];
  var nb = OfficeDoc.paragraph('inserted');
  OfficeDoc.insertBlock(d, nb, 1);
  eq(d.blocks.length, 3);
  eq(d.blocks[1].content, 'inserted');
  eq(d.blocks[2].content, 'b');
});

test('removeBlock', () => {
  var d = OfficeDoc.makeDocument();
  var b1 = OfficeDoc.paragraph('a');
  var b2 = OfficeDoc.paragraph('b');
  d.blocks = [b1, b2];
  var removed = OfficeDoc.removeBlock(d, b1.id);
  eq(removed.id, b1.id);
  eq(d.blocks.length, 1);
  eq(d.blocks[0].id, b2.id);
});

test('moveBlock 上移', () => {
  var d = OfficeDoc.makeDocument();
  var b1 = OfficeDoc.paragraph('a');
  var b2 = OfficeDoc.paragraph('b');
  var b3 = OfficeDoc.paragraph('c');
  d.blocks = [b1, b2, b3];
  OfficeDoc.moveBlock(d, b3.id, 0);
  eq(d.blocks[0].id, b3.id);
  eq(d.blocks[2].id, b2.id);
});

test('updateBlock 改 content + attrs', () => {
  var d = OfficeDoc.makeDocument();
  var t = OfficeDoc.todo('task');
  d.blocks = [t];
  OfficeDoc.updateBlock(d, t.id, { content: 'updated', attrs: { checked: true } });
  eq(d.blocks[0].content, 'updated');
  eq(d.blocks[0].attrs.checked, true);
});

test('parseInline 解析 bold/italic/code/link', () => {
  var inl = OfficeDoc.parseInline('hello **bold** *italic* `code` [link](http://x.com) world');
  // 9 段: 5 text (前后空格) + 4 inline
  assert(inl.length === 9, '应该 9 段 (4 inline + 5 text): ' + inl.length);
  eq(inl[1].type, 'bold');
  eq(inl[1].text, 'bold');
  eq(inl[3].type, 'italic');
  eq(inl[5].type, 'code');
  eq(inl[7].type, 'link');
  eq(inl[7].href, 'http://x.com');
});

console.log('\n═══ Converter: blocks ↔ markdown ═══');

test('blocksToMarkdown: heading + paragraph', () => {
  var blocks = [OfficeDoc.heading('Title', 1), OfficeDoc.paragraph('Hello')];
  var md = Conv.blocksToMarkdown(blocks);
  assert(md.indexOf('# Title') === 0, '第一行是 # Title');
  assert(md.indexOf('Hello') > 0, '应包含 Hello');
});

test('blocksToMarkdown: 10 种 block 全覆盖', () => {
  var blocks = [
    OfficeDoc.heading('H', 2),
    OfficeDoc.paragraph('P'),
    OfficeDoc.bulletList('B'),
    OfficeDoc.orderedList('O'),
    OfficeDoc.todo('T', true),
    OfficeDoc.quote('Q'),
    OfficeDoc.code('console.log(1)', 'js'),
    OfficeDoc.divider(),
    OfficeDoc.image('http://x.png', 'alt'),
    OfficeDoc.table(['A'], [['1']]),
  ];
  var md = Conv.blocksToMarkdown(blocks);
  assert(md.indexOf('## H') >= 0);
  assert(md.indexOf('- B') >= 0);
  assert(md.indexOf('1. O') >= 0);
  assert(md.indexOf('- [x] T') >= 0);
  assert(md.indexOf('> Q') >= 0);
  assert(md.indexOf('```js') >= 0);
  assert(md.indexOf('---') >= 0);
  assert(md.indexOf('![alt](http://x.png)') >= 0);
  assert(md.indexOf('| A |') >= 0);
});

test('markdownToBlocks: round-trip 一致', () => {
  var orig = [
    OfficeDoc.heading('Title', 1),
    OfficeDoc.paragraph('first paragraph'),
    OfficeDoc.bulletList('item 1'),
    OfficeDoc.todo('task', false),
  ];
  var md = Conv.blocksToMarkdown(orig);
  var back = Conv.markdownToBlocks(md);
  eq(back.length, 4);
  eq(back[0].type, 'heading');
  eq(back[0].content, 'Title');
  eq(back[1].type, 'paragraph');
  eq(back[1].content, 'first paragraph');
  eq(back[2].type, 'bulletList');
  eq(back[3].type, 'todo');
  eq(back[3].attrs.checked, false);
});

test('markdownToBlocks: 多行 paragraph 合并', () => {
  var md = 'line 1\nline 2\nline 3';
  var blocks = Conv.markdownToBlocks(md);
  eq(blocks.length, 1);
  eq(blocks[0].type, 'paragraph');
  eq(blocks[0].content, 'line 1\nline 2\nline 3');
});

test('markdownToBlocks: code fence 保留换行', () => {
  var md = '```js\nconst a = 1;\nconst b = 2;\n```';
  var blocks = Conv.markdownToBlocks(md);
  eq(blocks.length, 1);
  eq(blocks[0].type, 'code');
  eq(blocks[0].attrs.language, 'js');
  eq(blocks[0].content, 'const a = 1;\nconst b = 2;');
});

test('documentToMarkdown 便利函数', () => {
  var d = OfficeDoc.makeDocument({
    blocks: [OfficeDoc.heading('D', 1), OfficeDoc.paragraph('body')]
  });
  var md = Conv.documentToMarkdown(d);
  assert(md.indexOf('# D') === 0);
  assert(md.indexOf('body') > 0);
});

test('markdownToDocument 便利函数', () => {
  var md = '# Hello\n\nworld';
  var d = Conv.markdownToDocument(md, { title: 'T' });
  eq(d.meta.title, 'T');
  eq(d.blocks.length, 2);
  eq(d.blocks[0].content, 'Hello');
  eq(d.blocks[1].content, 'world');
});

console.log('\n═══ Converter: blocks → docx (需要 docx 包) ═══');

test('blocksToDocxBuffer: 缺 docx 时返回 null', () => {
  var blocks = [OfficeDoc.paragraph('hi')];
  var p = Conv.blocksToDocxBuffer(blocks, null);
  eq(p, null);
});

test('blocksToDocxBuffer: 有 docx 时返回 Promise<Buffer>', async () => {
  try {
    var docxPath = path.join(REPO, 'node_modules', 'docx');
    if (!fs.existsSync(docxPath)) {
      console.log('  ⊘ SKIP (docx 未安装)');
      return;
    }
    const docx = require(docxPath);
    var blocks = [
      OfficeDoc.heading('Hi', 1),
      OfficeDoc.paragraph('body'),
      OfficeDoc.todo('t1', true),
    ];
    var p = Conv.blocksToDocxBuffer(blocks, docx);
    assert(p && typeof p.then === 'function', '应返回 Promise');
    var buf = await p;
    assert(Buffer.isBuffer(buf), '应解析为 Buffer');
    assert(buf.length > 100, 'docx 应有合理大小: ' + buf.length);
    var magic = buf.slice(0, 4).toString('hex');
    eq(magic, '504b0304', 'docx 应该是 ZIP (504b0304)');
  } catch (e) {
    throw new Error('docx test failed: ' + e.message);
  }
});

(async () => {
  console.log('\n═══ Result ═══');
  console.log('  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail > 0 ? 1 : 0);
})();
