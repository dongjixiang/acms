// REQ-MRHNP0PR grounded poster regression tests (v0.57)
// Run one case: node scripts/test-plan-grounded-poster.js <case>
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CASE = process.argv[2];
const planExecutor = require('../server/services/plan-executor');
const imageGen = require('../server/services/assists/image-gen');

const researchAnswer = `# 2026世界杯最新赛况（截至北京时间 2026-07-19 07:23）

## 已完成的半决赛
| 日期（当地） | 对阵 | 比分 | 场地 | 晋级方 |
|---|---|---|---|---|
| 7月14日 | 法国 vs 西班牙 | 0-2 | 达拉斯体育场 | 西班牙 |
| 7月15日 | 英格兰 vs 阿根廷 | 1-2 | 亚特兰大体育场 | 阿根廷 |

## 三、四名决赛（季军战）
- 对阵：法国 vs 英格兰

## 决赛
- 对阵：西班牙 vs 阿根廷
- 场地：新泽西纽约大都会人寿体育场

## 参考来源
[1] FIFA - https://www.fifa.com/example`;

function researchPlan() {
  return {
    steps: [{
      id: 's1',
      tool: 'web_research',
      status: 'done',
      result: { answer: researchAnswer, sources: [], searchResults: [] },
    }],
  };
}

async function injectAnswer() {
  const step = { id: 's2', tool: 'generate_image', depends_on: ['s1'] };
  const out = planExecutor.autoInjectUpstreamContext(
    { prompt: 'generic official football poster' },
    step,
    researchPlan(),
  );
  assert.match(out.prompt, /法国 vs 西班牙/);
  assert.match(out.prompt, /__ACMS_AUTO_CONTEXT_END__/);
}

async function formattedAlias() {
  const out = planExecutor.resolveStepArgs(
    { body: '赛况：${s1.formatted}' },
    researchPlan(),
  );
  assert.match(out.body, /法国 vs 西班牙/);
  assert.doesNotMatch(out.body, /\$\{/);
}

async function explicitTemplateOnce() {
  const step = { id: 's2', tool: 'generate_image', depends_on: ['s1'] };
  const resolved = planExecutor.resolveStepArgs(
    { prompt: '基于赛况生成海报：${s1.formatted}' },
    researchPlan(),
  );
  const out = planExecutor.autoInjectUpstreamContext(resolved, step, researchPlan());
  const occurrences = out.prompt.split('法国 vs 西班牙').length - 1;
  assert.strictEqual(occurrences, 1, `上游正文不应重复，实际 ${occurrences} 次`);
  assert.match(out.prompt, /__ACMS_AUTO_CONTEXT_END__/);
}

async function unresolvedGuard() {
  assert.strictEqual(typeof planExecutor.validateResolvedArgs, 'function');
  const out = planExecutor.validateResolvedArgs({
    body: '赛况：${s1.missing}',
    nested: { subject: '世界杯' },
  });
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.error, 'UNRESOLVED_UPSTREAM_TEMPLATE');
  assert.deepStrictEqual(out.templates, ['${s1.missing}']);

  const good = planExecutor.validateResolvedArgs({ body: '赛况：法国 0-2 西班牙' });
  assert.deepStrictEqual(good, { ok: true, templates: [] });
}

async function posterFacts() {
  assert.strictEqual(typeof imageGen.extractGroundedPosterFacts, 'function');
  const rawPrompt = `【上游 s1 (web_research) 数据】\n${researchAnswer}\n\n__ACMS_AUTO_CONTEXT_END__\ngeneric poster`;
  const out = imageGen.extractGroundedPosterFacts(rawPrompt);
  assert.match(out.title, /2026世界杯最新赛况/);
  assert.ok(out.facts.some(x => /法国 vs 西班牙.*0-2/.test(x)), JSON.stringify(out));
  assert.ok(out.facts.some(x => /英格兰 vs 阿根廷.*1-2/.test(x)), JSON.stringify(out));
  assert.ok(out.facts.includes('季军战：法国 vs 英格兰'), JSON.stringify(out));
  assert.ok(out.facts.includes('决赛：西班牙 vs 阿根廷'), JSON.stringify(out));
  assert.ok(out.facts.every(x => !/参考来源|https?:\/\//.test(x)), JSON.stringify(out));
}

async function posterHtml() {
  assert.strictEqual(typeof imageGen.buildGroundedPosterHtml, 'function');
  const html = imageGen.buildGroundedPosterHtml(
    'data:image/png;base64,AAAA',
    {
      title: '2026世界杯最新赛况',
      facts: ['法国 vs 西班牙  0-2', '英格兰 vs 阿根廷  1-2', '决赛：西班牙 vs 阿根廷'],
    },
    { width: 1024, height: 1024 },
  );
  assert.match(html, /法国 vs 西班牙/);
  assert.match(html, /英格兰 vs 阿根廷/);
  assert.match(html, /决赛：西班牙 vs 阿根廷/);
  assert.match(html, /filter:blur\(/);
  assert.doesNotMatch(html, /QATAR 2022|SAMPLE TEXT/i);
}

async function posterRender() {
  assert.strictEqual(typeof imageGen.renderGroundedPosterOverlay, 'function');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'acms-grounded-poster-'));
  const src = path.join(tmp, 'source.png');
  const dest = path.join(tmp, 'grounded.png');
  // 1x1 transparent PNG
  fs.writeFileSync(src, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ));
  try {
    const result = await imageGen.renderGroundedPosterOverlay(
      src,
      dest,
      { title: '2026世界杯最新赛况', facts: ['法国 vs 西班牙  0-2', '英格兰 vs 阿根廷  1-2'] },
      { width: 640, height: 640 },
    );
    assert.strictEqual(result.ok, true, JSON.stringify(result));
    const output = fs.readFileSync(dest);
    assert.ok(output.length > 5000, `PNG too small: ${output.length}`);
    assert.strictEqual(output.subarray(1, 4).toString(), 'PNG');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { await require('../server/services/browser-fetch').cleanup(); } catch {}
  }
}

const cases = {
  inject_answer: injectAnswer,
  formatted_alias: formattedAlias,
  explicit_template_once: explicitTemplateOnce,
  unresolved_guard: unresolvedGuard,
  poster_facts: posterFacts,
  poster_html: posterHtml,
  poster_render: posterRender,
};

async function main() {
  if (!cases[CASE]) {
    throw new Error(`unknown case: ${CASE}; choose ${Object.keys(cases).join(', ')}`);
  }
  await cases[CASE]();
  console.log(`PASS ${CASE}`);
}

main().catch(err => {
  console.error(`FAIL ${CASE}: ${err.message}`);
  process.exit(1);
});
