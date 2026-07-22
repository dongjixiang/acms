'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const service = fs.readFileSync(path.join(root, 'server/services/app-runtime.js'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'server/routes/app-runtime.js'), 'utf8');
const taskbar = fs.readFileSync(path.join(root, 'client/js/views/taskbar.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'client/index.html'), 'utf8');

assert.match(service, /openNativeShell\s*\(/, 'service must expose openNativeShell');
assert.match(service, /headless:\s*false/, 'native shell must launch visible Chromium');
assert.match(service, /--app=/, 'native shell must use Chromium app mode');
assert.match(service, /userDataDir|--user-data-dir/, 'native shell must persist login state');
assert.match(routes, /\/native-shell\/open/, 'REST API must expose native-shell/open');
assert.match(taskbar, /native-shell\/open/, 'WeChat launcher must call native-shell API');
assert.doesNotMatch(taskbar, /openNativeApp\('https:\/\/wx\.qq\.com'/, 'WeChat must not default to Canvas screencast');
assert.doesNotMatch(html, /onclick="launchWeChat\(\)"[^>]*>[\s\S]{0,120}<span class="li-icon">💬<\/span>/, 'WeChat must not reuse chat bubble icon');

console.log('PASS: WeChat native-shell wiring is present');
