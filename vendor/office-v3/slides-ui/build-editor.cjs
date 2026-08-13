// B1 试跑：esbuild 打包 slides 编辑层（plugin 拦截相对路径 stub）
const esbuild = require('C:/Users/swede/acms/vendor/office-v3/word-ui/node_modules/esbuild');
const path = require('path');

async function main() {
  const base = 'C:/Users/swede/acms/vendor/office-v3/slides-ui';
  const engine = 'C:/Users/swede/acms/vendor/office-v3/engine';
  const resolveFile = (p) => path.resolve(base, p);

  const relativeStubs = {
    './ai-ipc': 'browser/stub-register.ts',
    './presenter-show': 'browser/stub-register.ts',
    './attachments-ipc': 'browser/stub-register.ts',
    './i18n-main': 'browser/stub-i18n-main.ts',
  };

  const stubPlugin = {
    name: 'relative-stubs',
    setup(build) {
      // 相对路径 stub（仅在 slides-main-browser.ts 及其兄弟目录内命中）
      for (const [from, to] of Object.entries(relativeStubs)) {
        build.onResolve({ filter: new RegExp('^' + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }, (args) => {
          return { path: resolveFile(to) };
        });
      }
      // node 内置模块 → stub-node（通配所有 node:*）
      build.onResolve({ filter: /^node:/ }, () => ({
        path: resolveFile('browser/stub-node.ts'),
      }));
      // electron → stub-electron
      build.onResolve({ filter: /^electron$/ }, () => ({ path: resolveFile('browser/stub-electron.ts') }));
      // @genoffice/ai-search → stub
      build.onResolve({ filter: /^@genoffice\/ai-search$/ }, () => ({ path: resolveFile('browser/stub-ai-search.ts') }));
      // @genoffice/pptx-engine 子路径 → 引擎实际文件（alias 前缀吞子路径的修正）
      build.onResolve({ filter: /^@genoffice\/pptx-engine\/[a-zA-Z-]+$/ }, (args) => ({
        path: path.resolve(engine, 'pptx-engine/' + args.path.split('/').pop() + '.ts'),
      }));
      // shaped-metrics / tiff-decode → stub（harfbuzzjs 复杂脚本度量降级）
      build.onResolve({ filter: /^\.\/shaped-metrics$/ }, () => ({ path: resolveFile('browser/stub-shaped-metrics.ts') }));
      build.onResolve({ filter: /^\.\/tiff-decode$/ }, () => ({ path: resolveFile('browser/stub-tiff.ts') }));
      build.onResolve({ filter: /^\.\/fonts$/ }, () => ({ path: resolveFile('browser/stub-fonts.ts') }));
      // @genoffice/electron-utils → stub
      build.onResolve({ filter: /^@genoffice\/electron-utils$/ }, () => ({ path: resolveFile('browser/stub-electron-utils.ts') }));
    },
  };

  try {
    const out = await esbuild.build({
      entryPoints: [base + '/browser/slides-api-bridge.ts'],
      bundle: true,
      format: 'iife',
      platform: 'browser',
      write: false,
      logLevel: 'silent',
      plugins: [stubPlugin],
      alias: {
        '@genoffice/project-store': path.resolve(base, 'browser/stub-project-store.ts'),
        '@genoffice/pptx-engine': path.resolve(engine, 'pptx-engine/index.ts'),
        '@genoffice/pptx-render': path.resolve(engine, 'pptx-render/index.ts'),
        '@genoffice/font-metrics': path.resolve(engine, 'font-metrics/index.ts'),
        '@genoffice/i18n': path.resolve(base, '../word-ui/packages_i18n/src/index.ts'),
      },
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    console.log('构建成功, 体积:', out.outputFiles[0].contents.length, 'bytes');
    require('fs').writeFileSync(base + '/browser/slides-editor-layer.js', out.outputFiles[0].contents);
    console.log('已写出 browser/slides-editor-layer.js');
  } catch (e) {
    console.error('构建失败:', e.errors ? e.errors.slice(0, 15).map((x) => x.text) : e.message);
  }
}
main();
