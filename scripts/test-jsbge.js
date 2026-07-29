const path = require('path');
const bge = require(path.join(__dirname, '..', 'server/services/js-bge-embedder'));

async function main() {
  console.log('Loading BGE...');
  const result = await bge.init();
  console.log('Init:', JSON.stringify(result));

  if (!result.ready) {
    console.log('Failed to load, check model files');
    return;
  }

  const tests = [
    '生成一张美女图片',
    '帮我做一份项目周报PPT',
    '帮我写一份会议纪要',
  ];

  const vecs = [];
  for (const t of tests) {
    try {
      const v = bge.embed(t, true);
      console.log(`  "${t}" → dim=${v.length}, first 3: [${v.slice(0,3).map(x=>x.toFixed(4)).join(', ')}]`);
      vecs.push(v);
    } catch (e) {
      console.log(`  "${t}" → ERROR: ${e.message}`);
    }
  }

  if (vecs.length >= 2) {
    const sim = bge.cosineSimilarity(vecs[0], vecs[1]);
    console.log(`\nSimilarity "生成图片" ↔ "做PPT": ${sim.toFixed(4)}`);
  }
}

main().catch(console.error);
