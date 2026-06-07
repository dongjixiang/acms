var cp = require('child_process');
var child = cp.spawn('node', ['server/index.js'], {
  cwd: 'C:\\Users\\swede\\acms',
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true
});
child.stdout.on('data', d => process.stdout.write(d));
child.stderr.on('data', d => process.stderr.write(d));
child.on('exit', c => process.exit(c));
process.on('SIGTERM', () => { child.kill(); process.exit(); });
