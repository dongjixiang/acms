// ACMS Office V3 引擎打包脚本（P0）
// 产物：client/lib/office-v3/word-engine.js + slides-engine.js + opentype.js + fonts/
// 用法：node scripts/build-office-v3.js
const fs = require('fs');
const path = require('path');
const { build } = require('esbuild');

const ROOT = path.join(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor', 'office-v3', 'engine');
const OUT = path.join(ROOT, 'client', 'lib', 'office-v3');
const TMP = path.join(ROOT, '.build', 'office-v3');

const nodeExternals = ['node:fs', 'node:crypto', 'node:zlib', 'node:stream', 'node:stream/promises', 'node:path', 'node:buffer'];
// node:* → 浏览器 stub 的绝对路径（正斜杠 Windows 格式，Node 可解析）
const STUBS = path.join(ROOT, 'vendor', 'office-v3', 'browser-stubs.ts').replace(/\\/g, '/');

// 全局 Buffer polyfill（pptx-engine 直接用全局 Buffer.from/alloc/concat，仅 utf8 场景）
// 关键陷阱（2026-08-13 实测）：
//   - isBuffer 必须返回 false！否则 JSZip 把 Uint8Array 当 Buffer（nodebuffer 语义），文件名被转成数字串
//   - Buffer.from(bytes).toString('utf8') 需要真实 utf8 解码（Uint8Array.toString 是逗号串）
const BUFFER_POLYFILL = `var Buffer=(function(){var te=new TextEncoder(),td=new TextDecoder('utf-8');
function Buf(a){return a instanceof Uint8Array?a:new Uint8Array(a)}
function mk(b){b.toString=function(){return td.decode(b)};return b}
Buf.from=function(d,e){if(typeof d==='string')return te.encode(d);
if(d instanceof ArrayBuffer)return mk(new Uint8Array(d));
if(ArrayBuffer.isView(d))return mk(new Uint8Array(d.buffer,d.byteOffset,d.byteLength));
if(Array.isArray(d))return mk(Uint8Array.from(d));return mk(new Uint8Array(0))};
Buf.alloc=function(n){return new Uint8Array(n)};
Buf.isBuffer=function(x){return false};
Buf.concat=function(l){var t=l.reduce(function(s,b){return s+b.length},0),o=new Uint8Array(t),i=0;
l.forEach(function(b){o.set(b,i);i+=b.length});return o};
return Buf})();`;

function log(msg) { console.log('[build-office-v3]', msg); }

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

// pptx-render 有 @genoffice/pptx-engine 子路径 import（esbuild alias 不可靠）→ 复制到临时目录改相对路径
function preparePptxRender() {
  ensureDir(TMP);
  // pptx-engine 复制到 TMP/pptx-engine/src（render 的相对路径 ../../pptx-engine/src 依赖它）
  const engDst = path.join(TMP, 'pptx-engine');
  fs.rmSync(engDst, { recursive: true, force: true });
  fs.cpSync(path.join(VENDOR, 'pptx-engine'), path.join(engDst, 'src'), { recursive: true });

  const src = path.join(VENDOR, 'pptx-render');
  const dst = path.join(TMP, 'pptx-render');
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true });
  // 改 import：@genoffice/pptx-engine/xxx → ../pptx-engine/src/xxx ；@genoffice/pptx-engine → ../pptx-engine/src
  // （build-slide.ts 在 TMP/pptx-render/ 下，../ 到 TMP/，pptx-engine 复制在 TMP/pptx-engine/src）
  const files = fs.readdirSync(dst).filter((f) => f.endsWith('.ts'));
  for (const f of files) {
    const p = path.join(dst, f);
    let s = fs.readFileSync(p, 'utf8');
    s = s.replaceAll('@genoffice/pptx-engine/table-grid', '../pptx-engine/src/table-grid.ts');
    s = s.replaceAll('@genoffice/pptx-engine/background-promote', '../pptx-engine/src/background-promote.ts');
    s = s.replaceAll('@genoffice/pptx-engine', '../pptx-engine/src');
    fs.writeFileSync(p, s);
  }
  return dst;
}

async function buildWordEngine() {
  log('building word-engine.js ...');
  await build({
    entryPoints: [path.join(VENDOR, 'docx-engine', 'index.ts')],
    outfile: path.join(OUT, 'word-engine.js'),
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    external: nodeExternals,
    logLevel: 'warning',
  });
  const sz = fs.statSync(path.join(OUT, 'word-engine.js')).size;
  log(`word-engine.js ${(sz / 1048576).toFixed(2)} MB raw`);
}

async function buildSlidesEngine() {
  log('building slides-engine.js ...');
  preparePptxRender();
  // 入口：合并 pptx-engine（openPptx/savePptx）+ pptx-render（buildRenderSlide）
  const entry = path.join(TMP, 'slides-entry.ts');
  fs.writeFileSync(
    entry,
    "export * from './pptx-engine/src/index'\n" +
      "export * from './pptx-render/index'\n",
  );
  await build({
    entryPoints: [entry],
    outfile: path.join(OUT, 'slides-engine.js'),
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    // node:* → 浏览器 stub（不能 external：会残留 import 语句导致浏览器加载失败）
    alias: {
      'node:fs': STUBS,
      'node:crypto': STUBS,
      'node:zlib': STUBS,
      'node:stream': STUBS,
      'node:stream/promises': STUBS,
    },
    // 全局 Buffer polyfill（引擎直接用全局 Buffer.from/alloc/concat，非 import）
    banner: {
      js: BUFFER_POLYFILL,
    },
    logLevel: 'warning',
  });
  const sz = fs.statSync(path.join(OUT, 'slides-engine.js')).size;
  log(`slides-engine.js ${(sz / 1048576).toFixed(2)} MB raw`);
}

function copyOpentype() {
  // opentype.js 浏览器版（UMD，直接用 dist 文件）
  const src = path.join(ROOT, 'node_modules', 'opentype.js', 'dist', 'opentype.js');
  const dst = path.join(OUT, 'opentype.js');
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    log(`opentype.js ${(fs.statSync(dst).size / 1048576).toFixed(2)} MB raw`);
  } else {
    log('WARN: opentype.js dist not found, skipping');
  }
}

function copyFonts() {
  ensureDir(path.join(OUT, 'fonts'));
  // 字体源在 vendor/office-v3/fonts/（脱离 /tmp 依赖，注意 Node 不认 MSYS /tmp 路径）
  const srcDir = path.join(ROOT, 'vendor', 'office-v3', 'fonts');
  const fonts = fs.readdirSync(srcDir).filter((f) => f.endsWith('.woff2'));
  for (const name of fonts) {
    fs.copyFileSync(path.join(srcDir, name), path.join(OUT, 'fonts', name));
    log(`fonts/${name} copied (${(fs.statSync(path.join(OUT, 'fonts', name)).size / 1048576).toFixed(1)}MB)`);
  }
  if (fonts.length === 0) log('WARN: no fonts found in vendor/office-v3/fonts/');
}

(async () => {
  ensureDir(OUT);
  await buildWordEngine();
  await buildSlidesEngine();
  copyOpentype();
  copyFonts();
  log('DONE');
})().catch((e) => { console.error('[build-office-v3] FAILED:', e); process.exit(1); });
