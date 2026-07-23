'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'client/js/views/web-browser.js'), 'utf8');

assert.match(src, /id=["']wb-remote-canvas["']/, 'web-browser must own an inline remote-preview canvas');
assert.match(src, /function\s+startRemotePreview\s*\(/, 'web-browser must start remote preview inside itself');
assert.match(src, /function\s+stopRemotePreview\s*\(/, 'web-browser must cleanly stop the inline session');
assert.match(src, /\/api\/app-runtime\/open/, 'inline renderer must create an appRuntime session');
assert.match(src, /\/ws\/app-runtime\//, 'inline renderer must consume appRuntime frames');
assert.match(src, /远程预览（实验）/, 'UI must state that remote preview is experimental');
assert.match(src, /首帧|no-frame|无画面/, 'UI must handle missing first frame');
assert.doesNotMatch(src, /openNativeApp\(url/, 'browser switch must not open a second native-app window');

console.log('PASS: web-browser inline remote preview is wired');
