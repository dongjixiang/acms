const fs = require('fs');
const src = fs.readFileSync('server/services/llm-adapter.js', 'utf-8');
const lines = src.split('\n');
let depth = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (const ch of line) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
  }
  if (depth < 0) {
    console.log('ERROR: Extra closing brace at line', i + 1);
    process.exit(1);
  }
}
console.log('Final depth:', depth, '(should be 0)');
// If depth > 0, find candidates for the missing brace
if (depth > 0) {
  depth = 0;
  let lastOpens = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === '{') {
        depth++;
        lastOpens.push({ line: i + 1, depth });
      }
      if (ch === '}') depth--;
    }
  }
  console.log('Lines with opening braces at max depth:');
  console.log(lastOpens.slice(-3).map(x => `  line ${x.line} depth=${x.depth}`).join('\n'));
}
