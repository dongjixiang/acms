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
  const renderSrc = preparePptxRender();
  await build({
    entryPoints: [path.join(renderSrc, 'index.ts')],
    outfile: path.join(OUT, 'slides-engine.js'),
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    external: nodeExternals,
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
