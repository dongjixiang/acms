'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'client/js/views/native-app-window.js'), 'utf8');
const service = fs.readFileSync(path.join(root, 'server/services/app-runtime.js'), 'utf8');

assert.match(client, /<textarea[^>]+class=["']na-ime-input["']/,
  'native app window must provide a real textarea for IME composition');
assert.match(client, /compositionstart/,
  'native app window must listen for IME compositionstart');
assert.match(client, /compositionend/,
  'native app window must listen for IME compositionend');
assert.match(client, /type:\s*['"]type['"][\s\S]{0,100}text:/,
  'native app window must forward committed text as a type event');
assert.match(service, /Input\.insertText/,
  'app runtime must insert Unicode text through CDP Input.insertText');

console.log('PASS: native app IME bridge is present');
