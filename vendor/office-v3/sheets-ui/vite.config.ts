import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// 浏览器构建：产出 office-sheets-ui.js（动态 import 到 ACMS office-v3-xlsx 窗口）
// 复用 word-ui/slides-ui 的 alias/stub 经验
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'scheduler'],
    alias: [
      // @genoffice 子路径精确项（必须先于裸路径——字符串 find 前缀匹配会吞子路径）
      { find: '@genoffice/pptx-render/preset-geometry', replacement: resolve(__dirname, '../engine/pptx-render/preset-geometry.ts') },
      { find: '@genoffice/docx-engine/math', replacement: resolve(__dirname, '../engine/docx-engine/math.ts') },
      { find: '@genoffice/ui/tokens.css', replacement: resolve(__dirname, '../word-ui/packages_ui/src/tokens.css') },
      { find: '@genoffice/ui/screentip.css', replacement: resolve(__dirname, '../word-ui/packages_ui/src/screentip.css') },
      // 裸路径兜底
      { find: '@genoffice/ui', replacement: resolve(__dirname, '../word-ui/packages_ui/src/index.ts') },
      { find: '@genoffice/i18n', replacement: resolve(__dirname, '../word-ui/packages_i18n/src/index.ts') },
      { find: '@genoffice/docx-engine', replacement: resolve(__dirname, '../engine/docx-engine/index.ts') },
      { find: '@genoffice/pptx-render', replacement: resolve(__dirname, '../engine/pptx-render/index.ts') },
      // AI/Electron 相关包 → stub（小吉接管 / 浏览器不可用）
      { find: '@genoffice/agent-core', replacement: resolve(__dirname, 'packages_stub/agent-core.ts') },
      { find: '@genoffice/ai-provider', replacement: resolve(__dirname, 'packages_stub/ai-provider.ts') },
      { find: '@genoffice/project-store', replacement: resolve(__dirname, 'packages_stub/project-store.ts') },
      { find: '@genoffice/ai-search', replacement: resolve(__dirname, 'browser/stub-ai-search.ts') },
      { find: '@genoffice/electron-utils', replacement: resolve(__dirname, 'browser/stub-electron-utils.ts') },
      { find: '@genoffice/file-parse', replacement: resolve(__dirname, 'browser/stub-file-parse.ts') },
      // node 内置模块 → 浏览器 stub（内存 FS）
      { find: 'node:fs/promises', replacement: resolve(__dirname, 'browser/stub-node.ts') },
      { find: 'node:crypto', replacement: resolve(__dirname, 'browser/stub-node.ts') },
      { find: 'node:zlib', replacement: resolve(__dirname, 'browser/stub-node.ts') },
      { find: 'node:child_process', replacement: resolve(__dirname, 'browser/stub-node.ts') },
      { find: 'node:fs', replacement: resolve(__dirname, 'browser/stub-node.ts') },
      { find: 'node:os', replacement: resolve(__dirname, 'browser/stub-node.ts') },
      { find: 'node:path', replacement: resolve(__dirname, 'browser/stub-node.ts') },
      { find: 'node:readline', replacement: resolve(__dirname, 'browser/stub-node.ts') },
      { find: 'node:http', replacement: resolve(__dirname, 'browser/stub-node.ts') },
      // Electron → 浏览器 stub
      { find: 'electron', replacement: resolve(__dirname, 'browser/stub-electron.ts') },
    ],
  },
  build: {
    outDir: 'dist',
    lib: {
      entry: resolve(__dirname, 'adapter.tsx'),
      name: 'OfficeSheetsUI',
      formats: ['es'],
      fileName: () => 'office-sheets-ui.js',
    },
    rollupOptions: {
      external: [],
    },
    target: 'es2020',
    sourcemap: false,
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@univerjs/core'],
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});
