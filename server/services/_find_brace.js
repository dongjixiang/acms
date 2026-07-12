const fs = require('fs');
const src = fs.readFileSync('server/services/llm-adapter.js', 'utf-8');
const lines = src.split('\n');
let depth = 0;
let lastOpens = [];

for (let i = 0; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === '{') { depth++; lastOpens.push({ line: i + 1, depth }); }
    if (ch === '}') { depth--; }
  }
}

console.log('Final depth:', depth);
if (depth > 0) {
  const candidates = lastOpens.filter(x => x.depth >= depth).slice(-5);
  console.log('Most recent unmatched opens:');
  candidates.forEach(x => console.log('  line', x.line, '|', lines[x.line - 1].trim().slice(0, 80)));
}
